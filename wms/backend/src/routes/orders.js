const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { z } = require('zod');
const db = require('../db/knex');
const { auth, role } = require('../middleware/auth');
const { docUpload } = require('../middleware/upload');
const {
  notifyStageChange,
  notifyCompanyStageChange,
  notifyNewOrder,
  notifyDefect,
} = require('../services/telegram');
const { chargeReceiving, chargeProcessing, chargeLogistics, chargeDefects } = require('../services/billing');
const { notifyOrderStage, notifyDefectFound } = require('../services/notifications');
const {
  syncAcceptanceDocument,
  syncTechnicalTaskDocument,
  syncBillingDocuments,
  createOrderBillingDocument,
  resolveOrderDocumentDownload,
} = require('../services/document-sync');
const { decorateShipmentsWithBilling } = require('../services/order-billing-items');

const router = express.Router();
router.use(auth);

async function enrichOrdersForList(orders = []) {
  const ids = orders.map((order) => order.id);
  if (ids.length === 0) return orders;

  const [supplyRows, logisticsRows, shipmentRows, itemTotals] = await Promise.all([
    db('supply_details')
      .whereIn('order_id', ids)
      .select('order_id', 'delivery_date', 'pickup_address', 'places_count'),
    db('logistics')
      .whereIn('order_id', ids)
      .select('order_id', 'dest_warehouse', 'ship_date'),
    db('order_marketplace_shipments')
      .whereIn('order_id', ids)
      .orderBy('created_at', 'asc')
      .select('order_id', 'warehouse_name', 'ship_date', 'places_count', 'quantity'),
    db('order_items')
      .whereIn('order_id', ids)
      .groupBy('order_id')
      .select(
        'order_id',
        db.raw('count(*) as items_count'),
        db.raw('sum(coalesce(quantity, 0)) as total_qty'),
        db.raw('sum(coalesce(ready_qty, 0)) as ready_qty_total'),
        db.raw('sum(coalesce(defect_qty, 0)) as defect_qty_total')
      ),
  ]);

  const supplyMap = new Map(supplyRows.map((row) => [row.order_id, row]));
  const logisticsMap = new Map(logisticsRows.map((row) => [row.order_id, row]));
  const shipmentMap = new Map();
  const shipmentTotalsMap = new Map();
  shipmentRows.forEach((row) => {
    if (!shipmentMap.has(row.order_id)) shipmentMap.set(row.order_id, row);
    const current = shipmentTotalsMap.get(row.order_id) || { shipment_qty: 0, places_count: 0 };
    current.shipment_qty += Number(row.quantity || 0);
    current.places_count += Number(row.places_count || 0);
    shipmentTotalsMap.set(row.order_id, current);
  });
  const itemTotalsMap = new Map(itemTotals.map((row) => [row.order_id, row]));

  orders.forEach((order) => {
    const supply = supplyMap.get(order.id);
    const logistics = logisticsMap.get(order.id);
    const shipment = shipmentMap.get(order.id);
    const shipmentTotals = shipmentTotalsMap.get(order.id) || { shipment_qty: 0, places_count: 0 };
    const totals = itemTotalsMap.get(order.id) || {};
    const totalQty = Number(totals.total_qty || 0);
    const readyQty = Number(totals.ready_qty_total || 0);
    const defectQty = Number(totals.defect_qty_total || 0);
    const handledQty = readyQty + defectQty;
    const shipmentQty = Number(shipmentTotals.shipment_qty || 0);
    const progressBase = order.type === 'logistics'
      ? Math.max(totalQty, shipmentQty)
      : totalQty;
    const progressValue = order.type === 'logistics'
      ? (shipmentQty || readyQty)
      : handledQty;

    order.shipping_warehouse =
      shipment?.warehouse_name ||
      logistics?.dest_warehouse ||
      supply?.pickup_address ||
      null;

    order.shipping_date =
      shipment?.ship_date ||
      logistics?.ship_date ||
      supply?.delivery_date ||
      null;

    order.boxes_count = Number(
      shipmentTotals.places_count ||
      supply?.places_count ||
      0
    );
    order.items_count = Number(totals.items_count || 0);
    order.total_qty = totalQty;
    order.ready_qty_total = readyQty;
    order.defect_qty_total = defectQty;
    order.handled_qty_total = handledQty;
    order.shipment_qty = shipmentQty;
    order.progress_percent = progressBase > 0
      ? Math.max(0, Math.min(100, Math.round((progressValue / progressBase) * 100)))
      : 0;
  });

  return orders;
}

const STAGES = {
  supply: ['new', 'approval', 'pickup', 'in_transit', 'receiving', 'accepted', 'mp_shipping', 'done'],
  processing: ['new', 'waiting', 'in_progress', 'done'],
  logistics: ['new', 'approval', 'pickup', 'in_transit', 'delivered', 'mp_shipping', 'done'],
};

const orderSchema = z.object({
  company_id: z.string().uuid().optional(),
  type: z.enum(['supply', 'processing', 'logistics']),
  comment: z.string().optional(),
  items: z.array(z.object({
    product_id: z.string().uuid(),
    quantity: z.number().int().positive(),
    pack_note: z.string().optional(),
  })).optional(),
  supply: z.object({
    delivery_type: z.string().optional(),
    delivery_date: z.string().optional(),
    pickup_address: z.string().optional(),
    places_count: z.number().int().optional(),
    weight_kg: z.number().optional(),
    volume_m3: z.number().optional(),
    cargo_number: z.string().optional(),
    contact_name: z.string().optional(),
    contact_phone: z.string().optional(),
  }).optional(),
  logistics: z.object({
    dest_type: z.enum(['transit', 'direct']).optional(),
    dest_warehouse: z.string().optional(),
    ship_date: z.string().optional(),
  }).optional(),
  consumables: z.array(z.object({
    consumable_id: z.string().uuid(),
    quantity: z.number().int().positive(),
    unit_price: z.number().nonnegative().optional(),
    discount: z.number().min(0).max(100).optional(),
    comment: z.string().optional(),
  })).optional(),
});

const orderConsumableSchema = z.object({
  consumable_id: z.string().uuid(),
  quantity: z.number().int().positive(),
  unit_price: z.number().nonnegative().optional(),
  discount: z.number().min(0).max(100).optional(),
  comment: z.string().optional(),
});

const orderItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().positive(),
  pack_note: z.string().optional(),
});

const updateOrderConsumableSchema = z.object({
  quantity: z.number().int().positive().optional(),
  unit_price: z.number().nonnegative().optional(),
  discount: z.number().min(0).max(100).optional(),
  comment: z.string().nullable().optional(),
});

const updateOrderDetailsSchema = z.object({
  supply: z.object({
    delivery_type: z.string().nullable().optional(),
    delivery_date: z.string().nullable().optional(),
    pickup_address: z.string().nullable().optional(),
    places_count: z.number().int().nullable().optional(),
    weight_kg: z.number().nullable().optional(),
    volume_m3: z.number().nullable().optional(),
    cargo_number: z.string().nullable().optional(),
    contact_name: z.string().nullable().optional(),
    contact_phone: z.string().nullable().optional(),
  }).optional(),
  logistics: z.object({
    dest_type: z.enum(['transit', 'direct']).nullable().optional(),
    dest_warehouse: z.string().nullable().optional(),
    ship_date: z.string().nullable().optional(),
    pass_number: z.string().nullable().optional(),
  }).optional(),
});

const shipmentsSchema = z.array(z.object({
  marketplace: z.enum(['wb', 'ozon', 'yandex']),
  warehouse_name: z.string().min(2),
  ship_date: z.string().nullable().optional(),
  places_count: z.number().int().min(0).default(0),
  quantity: z.number().int().positive(),
  unit_price: z.number().min(0).nullable().optional(),
  billing_rate: z.enum(['per_unit', 'per_pallet']).default('per_unit'),
  note: z.string().nullable().optional(),
}));

const boxItemSchema = z.object({
  order_item_id: z.string().uuid(),
  quantity: z.number().int().positive(),
  expiry_date: z.string().nullable().optional(),
});

const boxSchema = z.object({
  id: z.string().uuid().optional(),
  shipment_id: z.string().uuid().nullable().optional(),
  marketplace: z.enum(['wb', 'ozon', 'yandex']).default('wb'),
  warehouse_name: z.string().nullable().optional(),
  ship_date: z.string().nullable().optional(),
  box_code: z.string().min(6).max(30),
  sequence_no: z.number().int().positive().optional(),
  items: z.array(boxItemSchema).default([]),
});

const boxesSaveSchema = z.object({
  boxes: z.array(boxSchema),
});

const importHonestCodesSchema = z.object({
  raw_text: z.string().min(1),
  replace: z.boolean().optional().default(true),
});

const importHonestCodesFileSchema = z.object({
  replace: z.preprocess((value) => {
    if (typeof value === 'boolean') return value;
    const normalized = String(value ?? '').trim().toLowerCase();
    if (!normalized) return false;
    return ['1', 'true', 'yes', 'on'].includes(normalized);
  }, z.boolean().default(false)),
});

function parseImportedOrderItems(filePath) {
  const parserPath = path.join(__dirname, '..', '..', 'scripts', 'parse_order_items_xlsx.py');
  const result = spawnSync('python3', [parserPath, filePath], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error) {
    throw result.error;
  }

  const stdout = (result.stdout || '').trim();
  const stderr = (result.stderr || '').trim();

  if (result.status !== 0) {
    throw new Error(stderr || stdout || 'Не удалось распарсить XLSX');
  }

  let rows;
  try {
    rows = JSON.parse(stdout || '[]');
  } catch (error) {
    throw new Error(`Не удалось прочитать XLSX: ${error.message}`);
  }

  if (!Array.isArray(rows)) {
    throw new Error('Некорректный формат XLSX');
  }

  return rows;
}

function isValidImportedProductName(name) {
  const normalized = String(name || '').trim();
  if (normalized.length < 2) return false;
  if (/^[\d\s.,-]+$/.test(normalized)) return false;
  return /[A-Za-zА-Яа-яЁё]/.test(normalized);
}

function buildImportedDraftKey(product, row = {}) {
  const productId = String(product?.id || '').trim();
  const barcode = normalizeBarcodeValue(row.barcode || product?.barcode || '');
  const size = String(row.size || product?.size || '').trim().toLowerCase();
  const color = String(row.color || product?.color || '').trim().toLowerCase();
  const article = String(row.article || product?.article || '').trim().toLowerCase();
  return [productId, barcode, article, size, color].join('::');
}

const scanHonestCodeSchema = z.object({
  code: z.string().min(1),
});

function normalizeHonestCode(value) {
  return String(value || '')
    .replace(/\u001d/g, '')
    .replace(/\s+/g, '')
    .trim()
    .toUpperCase();
}

function normalizeBarcodeValue(value) {
  return String(value || '')
    .replace(/\s+/g, '')
    .trim()
    .toUpperCase();
}

function normalizeBoxCode(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();
}

function isValidWbBoxCode(value) {
  const normalized = normalizeBoxCode(value);
  if (!normalized) return false;
  if (normalized.length < 6 || normalized.length > 30) return false;
  if (normalized.startsWith('WB_')) return false;
  return /^[A-Z0-9_-]+$/.test(normalized);
}

function formatBoxSequence(sequenceNo) {
  return `SW-${String(sequenceNo || 1).padStart(6, '0')}`;
}

async function getMaxBoxSequence(conn = db, excludeOrderId = null) {
  const query = conn('order_marketplace_boxes');
  if (excludeOrderId) {
    query.whereNot({ order_id: excludeOrderId });
  }
  const row = await query.max({ max_sequence: 'sequence_no' }).first();
  return Number(row?.max_sequence || 0);
}

function parseHonestCodeList(rawText) {
  return String(rawText || '')
    .split(/[\r\n,;\t]+/g)
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

function fmtForReport(value) {
  if (value == null) return '';
  return String(value);
}

function formatDateTimeForReport(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ru-RU');
}

async function loadOrderForAccess(orderId, reqUser) {
  const order = await db('orders')
    .join('companies', 'companies.id', 'orders.company_id')
    .where('orders.id', orderId)
    .select('orders.*', 'companies.name as company_name', 'companies.user_id as company_user_id')
    .first();

  if (!order) return null;
  if (reqUser.role === 'client' && order.company_user_id !== reqUser.id) return false;
  return order;
}

function parseImportedProducts(filePath) {
  const parserPath = path.join(__dirname, '..', '..', 'scripts', 'parse_order_honest_codes_xlsx.py');
  const result = spawnSync('python3', [parserPath, filePath], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });

  if (result.error) throw result.error;

  const stdout = (result.stdout || '').trim();
  const stderr = (result.stderr || '').trim();
  if (result.status !== 0) {
    throw new Error(stderr || stdout || 'Не удалось распарсить XLSX');
  }

  let rows;
  try {
    rows = JSON.parse(stdout || '[]');
  } catch (error) {
    throw new Error(`Не удалось прочитать XLSX: ${error.message}`);
  }

  if (!Array.isArray(rows)) {
    throw new Error('Некорректный формат XLSX');
  }

  return rows;
}

function buildWorkbookXlsx(workbook) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wms-honest-sign-'));
  const inputPath = path.join(tmpDir, 'workbook.json');
  const outputPath = path.join(tmpDir, 'workbook.xlsx');
  const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'build_honest_sign_xlsx.py');

  try {
    fs.writeFileSync(inputPath, JSON.stringify(workbook), 'utf8');
    const result = spawnSync('python3', [scriptPath, inputPath, outputPath], {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    });

    if (result.error) throw result.error;
    const stdout = (result.stdout || '').trim();
    const stderr = (result.stderr || '').trim();
    if (result.status !== 0) {
      throw new Error(stderr || stdout || 'Не удалось собрать XLSX');
    }

    return fs.readFileSync(outputPath);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
}

function sendXlsx(res, buffer, filename) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

async function loadOrderHonestSignItems(orderId) {
  const items = await db('order_items')
    .join('products', 'products.id', 'order_items.product_id')
    .where('order_items.order_id', orderId)
    .select(
      'order_items.id',
      'order_items.order_id',
      'order_items.product_id',
      'order_items.quantity',
      'products.name as product_name',
      'products.article',
      db.raw(`(
        select pb.barcode
        from product_barcodes pb
        where pb.product_id = products.id
        order by
          case
            when pb.marketplace = 'ff' then 0
            when pb.marketplace = 'wb' then 1
            when pb.marketplace = 'ozon' then 2
            else 3
          end,
          pb.created_at asc
        limit 1
      ) as barcode`)
    );

  if (!items.length) return items.map((item) => ({ ...item, match_barcodes: [] }));

  const productIds = items.map((item) => item.product_id);
  const barcodeRows = await db('product_barcodes')
    .whereIn('product_id', productIds)
    .select('product_id', 'barcode');

  const barcodesByProduct = new Map();
  barcodeRows.forEach((row) => {
    const normalized = normalizeBarcodeValue(row.barcode);
    if (!normalized) return;
    if (!barcodesByProduct.has(row.product_id)) {
      barcodesByProduct.set(row.product_id, new Set());
    }
    barcodesByProduct.get(row.product_id).add(normalized);
  });

  return items.map((item) => {
    const barcodes = new Set(barcodesByProduct.get(item.product_id) || []);
    const primary = normalizeBarcodeValue(item.barcode);
    if (primary) barcodes.add(primary);
    return {
      ...item,
      match_barcodes: Array.from(barcodes),
    };
  });
}

async function loadOrderBoxContext(orderId) {
  const [items, shipments, boxes, boxItems] = await Promise.all([
    db('order_items as oi')
      .join('products as p', 'p.id', 'oi.product_id')
      .where('oi.order_id', orderId)
      .select(
        'oi.id',
        'oi.order_id',
        'oi.product_id',
        'oi.quantity',
        'oi.ready_qty',
        'p.name as product_name',
        'p.article',
        'p.size',
        'p.color',
        db.raw(`(
          select pb.barcode
          from product_barcodes pb
          where pb.product_id = p.id
          order by
            case
              when pb.marketplace = 'ff' then 0
              when pb.marketplace = 'wb' then 1
              when pb.marketplace = 'ozon' then 2
              else 3
            end,
            pb.created_at asc
          limit 1
        ) as barcode`)
      )
      .orderBy('p.name'),
    db('order_marketplace_shipments')
      .where({ order_id: orderId })
      .orderBy('created_at')
      .select('*'),
    db('order_marketplace_boxes')
      .where({ order_id: orderId })
      .orderBy([{ column: 'sequence_no', order: 'asc' }, { column: 'created_at', order: 'asc' }])
      .select('*'),
    db('order_marketplace_box_items as bi')
      .leftJoin('order_items as oi', 'oi.id', 'bi.order_item_id')
      .leftJoin('products as p', 'p.id', 'oi.product_id')
      .leftJoin('order_marketplace_boxes as b', 'b.id', 'bi.box_id')
      .where('b.order_id', orderId)
      .select(
        'bi.*',
        'p.name as product_name',
        'p.article'
      ),
  ]);

  const boxItemsByBox = new Map();
  boxItems.forEach((row) => {
    if (!boxItemsByBox.has(row.box_id)) boxItemsByBox.set(row.box_id, []);
    boxItemsByBox.get(row.box_id).push({
      id: row.id,
      order_item_id: row.order_item_id,
      product_id: row.product_id,
      product_name: row.product_name,
      article: row.article,
      barcode: row.barcode,
      quantity: Number(row.quantity || 0),
      expiry_date: row.expiry_date || null,
    });
  });

  const packedByItem = {};
  boxItems.forEach((row) => {
    packedByItem[row.order_item_id] = Number(packedByItem[row.order_item_id] || 0) + Number(row.quantity || 0);
  });

  const itemsWithPacking = items.map((item) => {
    const available = Number(item.ready_qty || 0);
    const packed = Number(packedByItem[item.id] || 0);
    return {
      ...item,
      ready_qty: available,
      packed_qty: packed,
      remaining_box_qty: Math.max(0, available - packed),
    };
  });

  const normalizedBoxes = boxes.map((box) => ({
    ...box,
    sequence_no: Number(box.sequence_no || 0),
    items: boxItemsByBox.get(box.id) || [],
    items_total: (boxItemsByBox.get(box.id) || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0),
  }));

  const wbShipments = shipments.filter((row) => row.marketplace === 'wb');
  const wbBoxes = normalizedBoxes.filter((row) => row.marketplace === 'wb');
  const wbTargetBoxes = wbShipments.reduce((sum, row) => sum + Number(row.places_count || 0), 0);

  return {
    items: itemsWithPacking,
    shipments,
    wb_shipments: wbShipments,
    boxes: normalizedBoxes,
    wb_boxes: wbBoxes,
    summary: {
      total_boxes: normalizedBoxes.length,
      wb_boxes: wbBoxes.length,
      wb_target_boxes: wbTargetBoxes,
      total_items_ready: itemsWithPacking.reduce((sum, item) => sum + Number(item.ready_qty || 0), 0),
      total_items_packed: itemsWithPacking.reduce((sum, item) => sum + Number(item.packed_qty || 0), 0),
      total_items_remaining: itemsWithPacking.reduce((sum, item) => sum + Number(item.remaining_box_qty || 0), 0),
    },
  };
}

async function loadOrderHonestSignSummary(orderId) {
  const [codes, scanTotals, recentScans] = await Promise.all([
    db('order_item_honest_codes')
      .where({ order_id: orderId })
      .select('id', 'order_item_id', 'scan_attempts', 'first_scanned_at'),
    db('order_honest_code_scans')
      .where({ order_id: orderId })
      .select(
        db.raw(`sum(case when result = 'duplicate' then 1 else 0 end) as duplicate_total`),
        db.raw(`sum(case when result = 'unexpected' then 1 else 0 end) as unexpected_total`)
      )
      .first(),
    db('order_honest_code_scans as scans')
      .leftJoin('order_items as oi', 'oi.id', 'scans.order_item_id')
      .leftJoin('products as p', 'p.id', 'oi.product_id')
      .where('scans.order_id', orderId)
      .orderBy('scans.created_at', 'desc')
      .limit(12)
      .select(
        'scans.id',
        'scans.raw_code',
        'scans.result',
        'scans.created_at',
        'scans.order_item_id',
        'p.name as product_name',
        'p.article'
      ),
  ]);

  const statsByItem = {};
  codes.forEach((row) => {
    if (!statsByItem[row.order_item_id]) {
      statsByItem[row.order_item_id] = { expected: 0, scanned: 0 };
    }
    statsByItem[row.order_item_id].expected += 1;
    if (row.first_scanned_at) statsByItem[row.order_item_id].scanned += 1;
  });

  return {
    statsByItem,
    summary: {
      expected_total: codes.length,
      scanned_total: codes.filter((row) => Boolean(row.first_scanned_at)).length,
      remaining_total: Math.max(0, codes.length - codes.filter((row) => Boolean(row.first_scanned_at)).length),
      duplicate_total: Number(scanTotals?.duplicate_total || 0),
      unexpected_total: Number(scanTotals?.unexpected_total || 0),
      recent_scans: recentScans,
    },
  };
}

// GET /api/orders?type=&status=&stage=&company_id=&search=
router.get('/', async (req, res) => {
  const { type, status, stage, company_id, search } = req.query;

  let q = db('orders')
    .join('companies', 'companies.id', 'orders.company_id')
    .select('orders.*', 'companies.name as company_name')
    .orderBy('orders.number', 'desc');

  if (req.user.role === 'client') {
    q = q.where('companies.user_id', req.user.id);
  } else if (company_id) {
    q = q.where('orders.company_id', company_id);
  }

  if (type) q = q.where('orders.type', type);
  if (status) q = q.where('orders.status', status);
  if (stage) q = q.where('orders.stage', stage);
  if (search) {
    q = q.where(function() {
      this.whereILike('companies.name', `%${search}%`)
        .orWhereILike('orders.comment', `%${search}%`);
    });
  }

  const orders = await q;
  await enrichOrdersForList(orders);

  res.json(orders);
});

// GET /api/orders/kanban — данные для канбан-доски
router.get('/kanban', async (req, res) => {
  let q = db('orders')
    .join('companies', 'companies.id', 'orders.company_id')
    .where('orders.status', 'active')
    .select('orders.*', 'companies.name as company_name');

  if (req.user.role === 'client') {
    q = q.where('companies.user_id', req.user.id);
  }

  const orders = await q.orderBy('orders.created_at');
  await enrichOrdersForList(orders);
  const byStage = {};
  orders.forEach(o => {
    if (!byStage[o.stage]) byStage[o.stage] = [];
    byStage[o.stage].push(o);
  });

  res.json(byStage);
});

// GET /api/orders/:id — детали с items
router.get('/:id', async (req, res) => {
  const order = await db('orders')
    .join('companies', 'companies.id', 'orders.company_id')
    .where('orders.id', req.params.id)
    .select('orders.*', 'companies.name as company_name')
    .first();
  if (!order) return res.status(404).json({ error: 'Не найдено' });
  if (req.user.role === 'client') {
    const allowed = await db('companies').where({ id: order.company_id, user_id: req.user.id }).first();
    if (!allowed) return res.status(403).json({ error: 'Доступ запрещён' });
  }

  const items = await db('order_items')
    .join('products', 'products.id', 'order_items.product_id')
    .where('order_items.order_id', req.params.id)
    .select(
      'order_items.*',
      'products.name as product_name',
      'products.article',
      'products.photo_url',
      'products.color',
      'products.size',
      'products.composition',
      'products.weight_g',
      'products.dim_l',
      'products.dim_w',
      'products.dim_h',
      db.raw(`(
        select pb.barcode
        from product_barcodes pb
        where pb.product_id = products.id
        order by
          case
            when pb.marketplace = 'ff' then 0
            when pb.marketplace = 'wb' then 1
            when pb.marketplace = 'ozon' then 2
            else 3
          end,
          pb.created_at asc
        limit 1
      ) as barcode`)
    );

  const honestSign = await loadOrderHonestSignSummary(req.params.id);
  items.forEach((item) => {
    const stats = honestSign.statsByItem[item.id] || { expected: 0, scanned: 0 };
    item.honest_sign_expected = Number(stats.expected || 0);
    item.honest_sign_scanned = Number(stats.scanned || 0);
    item.honest_sign_remaining = Math.max(0, item.honest_sign_expected - item.honest_sign_scanned);
  });

  const stages = await db('order_stages')
    .leftJoin('users', 'users.id', 'order_stages.changed_by')
    .where('order_stages.order_id', req.params.id)
    .select('order_stages.*', 'users.full_name as changed_by_name')
    .orderBy('created_at');

  let details = null;
  if (order.type === 'supply') {
    details = await db('supply_details').where({ order_id: req.params.id }).first();
  } else if (order.type === 'logistics') {
    details = await db('logistics').where({ order_id: req.params.id }).first();
  }

  const documents = await db('order_documents')
    .leftJoin('users', 'users.id', 'order_documents.uploaded_by')
    .where('order_documents.order_id', req.params.id)
    .select('order_documents.*', 'users.full_name as uploaded_by_name')
    .orderBy('order_documents.created_at', 'desc');

  const consumables = await db('order_consumables')
    .join('consumables', 'consumables.id', 'order_consumables.consumable_id')
    .where('order_consumables.order_id', req.params.id)
    .select(
      'order_consumables.*',
      'consumables.code',
      'consumables.name',
      'consumables.category',
      'consumables.unit'
    )
    .orderBy('consumables.name');

  const marketplace_shipments = await decorateShipmentsWithBilling(
    await db('order_marketplace_shipments')
    .where({ order_id: req.params.id })
    .orderBy('created_at'),
    order.company_id
  );

  res.json({
    ...order,
    items,
    stages,
    details,
    documents,
    consumables,
    marketplace_shipments,
    honest_sign_summary: honestSign.summary,
  });
});

// GET /api/orders/:id/boxes — короба маркетплейсов по заявке
router.get('/:id/boxes', async (req, res) => {
  const order = await loadOrderForAccess(req.params.id, req.user);
  if (!order) return res.status(404).json({ error: 'Заявка не найдена' });
  if (order === false) return res.status(403).json({ error: 'Доступ запрещён' });

  const payload = await loadOrderBoxContext(req.params.id);
  const currentOrderMaxSequence = Math.max(0, ...payload.boxes.map((box) => Number(box.sequence_no || 0)));
  const globalMaxSequence = await getMaxBoxSequence(db, req.params.id);
  res.json({
    order_id: req.params.id,
    boxes: payload.boxes,
    wb_boxes: payload.wb_boxes,
    wb_shipments: payload.wb_shipments,
    items: payload.items,
    summary: {
      ...payload.summary,
      next_box_sequence: Math.max(currentOrderMaxSequence, globalMaxSequence) + 1,
    },
  });
});

// POST /api/orders/:id/boxes/generate — автосоздание пустых WB коробов по местам
router.post('/:id/boxes/generate', role(['admin', 'manager']), async (req, res) => {
  const order = await db('orders').where({ id: req.params.id }).first();
  if (!order) return res.status(404).json({ error: 'Заявка не найдена' });

  const context = await loadOrderBoxContext(req.params.id);
  if (!context.wb_shipments.length) {
    return res.status(400).json({ error: 'Для этой заявки нет отгрузок WB' });
  }

  const existingByShipment = new Map();
  context.wb_boxes.forEach((box) => {
    const key = box.shipment_id || 'no-shipment';
    if (!existingByShipment.has(key)) existingByShipment.set(key, []);
    existingByShipment.get(key).push(box);
  });

  const currentOrderMaxSequence = Math.max(0, ...context.boxes.map((box) => Number(box.sequence_no || 0)));
  const globalMaxSequence = await getMaxBoxSequence(db, req.params.id);
  let nextSequence = Math.max(currentOrderMaxSequence, globalMaxSequence) + 1;
  const rowsToInsert = [];

  context.wb_shipments.forEach((shipment) => {
    const targetCount = Number(shipment.places_count || 0);
    if (targetCount <= 0) return;
    const existingCount = Number((existingByShipment.get(shipment.id) || []).length);
    const missing = Math.max(0, targetCount - existingCount);
    for (let idx = 0; idx < missing; idx += 1) {
      rowsToInsert.push({
        order_id: req.params.id,
        shipment_id: shipment.id,
        marketplace: 'wb',
        warehouse_name: shipment.warehouse_name || null,
        ship_date: shipment.ship_date || null,
        box_code: formatBoxSequence(nextSequence),
        sequence_no: nextSequence,
        created_by: req.user.id,
      });
      nextSequence += 1;
    }
  });

  if (rowsToInsert.length) {
    await db('order_marketplace_boxes').insert(rowsToInsert);
  }

  const payload = await loadOrderBoxContext(req.params.id);
  res.json({
    ok: true,
    generated_total: rowsToInsert.length,
    boxes: payload.boxes,
    wb_boxes: payload.wb_boxes,
    summary: payload.summary,
  });
});

// PUT /api/orders/:id/boxes — сохранить состав коробов
router.put('/:id/boxes', role(['admin', 'manager']), async (req, res) => {
  const parsed = boxesSaveSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  try {
    const order = await db('orders').where({ id: req.params.id }).first();
    if (!order) return res.status(404).json({ error: 'Заявка не найдена' });

    const context = await loadOrderBoxContext(req.params.id);
    const itemMap = new Map(context.items.map((item) => [item.id, item]));
    const shipmentMap = new Map(context.shipments.map((shipment) => [shipment.id, shipment]));
    const usedCodes = new Set();
    const packedByItem = {};

    const currentBoxIds = new Set(context.boxes.map((box) => String(box.id)));
    const currentOrderMaxSequence = Math.max(0, ...context.boxes.map((box) => Number(box.sequence_no || 0)));
    const globalMaxSequence = await getMaxBoxSequence(db, req.params.id);
    let nextSequence = Math.max(currentOrderMaxSequence, globalMaxSequence) + 1;

    const sanitizedBoxes = parsed.data.boxes.map((box, index) => {
      const normalizedCode = normalizeBoxCode(box.box_code);
      if (!isValidWbBoxCode(normalizedCode)) {
        throw new Error(`Некорректный ШК короба: ${box.box_code}`);
      }
      if (usedCodes.has(normalizedCode)) {
        throw new Error(`Повтор ШК короба в заявке: ${normalizedCode}`);
      }
      usedCodes.add(normalizedCode);

      if (box.shipment_id && !shipmentMap.has(box.shipment_id)) {
        throw new Error('Короб привязан к несуществующей строке отгрузки');
      }

      const collapsedMap = new Map();
      (box.items || []).forEach((item) => {
        if (!itemMap.has(item.order_item_id)) {
          throw new Error('В короб добавлен товар, которого нет в заявке');
        }
        const qty = Number(item.quantity || 0);
        if (!Number.isFinite(qty) || qty <= 0) {
          throw new Error('Количество в коробе должно быть больше нуля');
        }
        const expiry = String(item.expiry_date || '').trim();
        const key = `${item.order_item_id}::${expiry}`;
        const existing = collapsedMap.get(key) || { ...item, quantity: 0, expiry_date: expiry || null };
        existing.quantity += qty;
        existing.expiry_date = expiry || null;
        collapsedMap.set(key, existing);
        packedByItem[item.order_item_id] = Number(packedByItem[item.order_item_id] || 0) + qty;
      });

      const isExistingBox = box.id && currentBoxIds.has(String(box.id));
      const assignedSequence = isExistingBox
        ? Number(box.sequence_no || index + 1)
        : nextSequence++;
      const assignedCode = isExistingBox
        ? normalizedCode
        : formatBoxSequence(assignedSequence);

      return {
        id: box.id || null,
        shipment_id: box.shipment_id || null,
        marketplace: box.marketplace || 'wb',
        warehouse_name: box.shipment_id ? shipmentMap.get(box.shipment_id)?.warehouse_name || box.warehouse_name || null : box.warehouse_name || null,
        ship_date: box.shipment_id ? shipmentMap.get(box.shipment_id)?.ship_date || box.ship_date || null : box.ship_date || null,
        box_code: assignedCode,
        sequence_no: assignedSequence,
        items: Array.from(collapsedMap.values()).map((row) => ({
          order_item_id: row.order_item_id,
          quantity: Number(row.quantity || 0),
          expiry_date: row.expiry_date || null,
        })),
      };
    });

    context.items.forEach((item) => {
      const packed = Number(packedByItem[item.id] || 0);
      const available = Number(item.ready_qty || 0);
      if (packed > available) {
        throw new Error(`По товару "${item.product_name}" в коробах указано больше, чем принято к отгрузке`);
      }
    });

    await db.transaction(async (trx) => {
      await trx('order_marketplace_box_items')
        .whereIn('box_id', trx('order_marketplace_boxes').where({ order_id: req.params.id }).select('id'))
        .delete();
      await trx('order_marketplace_boxes').where({ order_id: req.params.id }).delete();

      for (let index = 0; index < sanitizedBoxes.length; index += 1) {
        const box = sanitizedBoxes[index];
        const [createdBox] = await trx('order_marketplace_boxes')
          .insert({
            order_id: req.params.id,
            shipment_id: box.shipment_id,
            marketplace: box.marketplace,
            warehouse_name: box.warehouse_name,
            ship_date: box.ship_date,
            box_code: box.box_code,
            sequence_no: Number(box.sequence_no || index + 1),
            created_by: req.user.id,
          })
          .returning('*');

        if (box.items.length) {
          await trx('order_marketplace_box_items').insert(
            box.items.map((item) => {
              const itemMeta = itemMap.get(item.order_item_id);
              return {
                box_id: createdBox.id,
                order_item_id: item.order_item_id,
                product_id: itemMeta?.product_id || null,
                barcode: itemMeta?.barcode || null,
                quantity: Number(item.quantity || 0),
                expiry_date: item.expiry_date || null,
              };
            })
          );
        }
      }
    });

    const payload = await loadOrderBoxContext(req.params.id);
    res.json({
      ok: true,
      boxes: payload.boxes,
      wb_boxes: payload.wb_boxes,
      summary: payload.summary,
    });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Не удалось сохранить состав коробов' });
  }
});

// GET /api/orders/:id/boxes/wb-template-export — выгрузка WB Excel по коробам
router.get('/:id/boxes/wb-template-export', async (req, res) => {
  const order = await loadOrderForAccess(req.params.id, req.user);
  if (!order) return res.status(404).json({ error: 'Заявка не найдена' });
  if (order === false) return res.status(403).json({ error: 'Доступ запрещён' });

  const payload = await loadOrderBoxContext(req.params.id);
  const exportRows = [];

  payload.wb_boxes.forEach((box) => {
    box.items.forEach((item) => {
      exportRows.push([
        item.barcode || '',
        String(item.quantity || ''),
        box.box_code || '',
        item.expiry_date || '',
      ]);
    });
  });

  const workbook = {
    sheets: [
      {
        name: 'Sheet1',
        rows: [
          ['Баркод товара', 'Кол-во товаров', 'ШК короба', 'Срок годности'],
          ...exportRows,
        ],
      },
    ],
  };

  const safeNumber = order.number || req.params.id;
  const buffer = buildWorkbookXlsx(workbook);
  sendXlsx(res, buffer, `wb_boxes_order_${safeNumber}.xlsx`);
});

// POST /api/orders/:id/items/:itemId/honest-codes/import — загрузить список КИЗов/ЧЗ по позиции
router.post('/:id/items/:itemId/honest-codes/import', role(['admin', 'manager']), async (req, res) => {
  const parsed = importHonestCodesSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const order = await db('orders').where({ id: req.params.id }).first();
  if (!order) return res.status(404).json({ error: 'Заявка не найдена' });

  const item = await db('order_items')
    .join('products', 'products.id', 'order_items.product_id')
    .where({
      'order_items.id': req.params.itemId,
      'order_items.order_id': req.params.id,
    })
    .select('order_items.id', 'products.name as product_name')
    .first();
  if (!item) return res.status(404).json({ error: 'Позиция заявки не найдена' });

  const rawCodes = parseHonestCodeList(parsed.data.raw_text);
  if (!rawCodes.length) {
    return res.status(400).json({ error: 'Не удалось распознать ни одного КИЗа' });
  }

  const uniqueCodes = new Map();
  const duplicatesInUpload = [];
  rawCodes.forEach((rawCode) => {
    const normalized = normalizeHonestCode(rawCode);
    if (!normalized) return;
    if (uniqueCodes.has(normalized)) {
      duplicatesInUpload.push(rawCode);
      return;
    }
    uniqueCodes.set(normalized, rawCode);
  });

  if (!uniqueCodes.size) {
    return res.status(400).json({ error: 'После обработки список КИЗов пуст' });
  }

  try {
    await db.transaction(async (trx) => {
      if (parsed.data.replace) {
        await trx('order_honest_code_scans')
          .where({ order_id: req.params.id, order_item_id: req.params.itemId })
          .delete();
        await trx('order_item_honest_codes')
          .where({ order_id: req.params.id, order_item_id: req.params.itemId })
          .delete();
      }

      const normalizedCodes = Array.from(uniqueCodes.keys());
      const conflicts = await trx('order_item_honest_codes')
        .where({ order_id: req.params.id })
        .whereIn('normalized_code', normalizedCodes)
        .whereNot('order_item_id', req.params.itemId)
        .select('normalized_code');

      if (conflicts.length) {
        const preview = conflicts.slice(0, 10).map((row) => row.normalized_code).join(', ');
        throw new Error(`Часть кодов уже загружена в другие позиции этой заявки: ${preview}`);
      }

      const existingForItem = await trx('order_item_honest_codes')
        .where({ order_id: req.params.id, order_item_id: req.params.itemId })
        .whereIn('normalized_code', normalizedCodes)
        .select('normalized_code');
      const existingSet = new Set(existingForItem.map((row) => row.normalized_code));

      const rowsToInsert = normalizedCodes
        .filter((normalized) => !existingSet.has(normalized))
        .map((normalized) => ({
          order_id: req.params.id,
          order_item_id: req.params.itemId,
          raw_code: uniqueCodes.get(normalized),
          normalized_code: normalized,
          created_by: req.user.id,
        }));

      if (rowsToInsert.length) {
        await trx('order_item_honest_codes').insert(rowsToInsert);
      }
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Не удалось загрузить КИЗы' });
  }

  const honestSign = await loadOrderHonestSignSummary(req.params.id);
  const stats = honestSign.statsByItem[req.params.itemId] || { expected: 0, scanned: 0 };

  res.json({
    ok: true,
    item_id: req.params.itemId,
    product_name: item.product_name,
    imported_total: uniqueCodes.size,
    duplicates_in_upload: duplicatesInUpload.length,
    expected_total: Number(stats.expected || 0),
    scanned_total: Number(stats.scanned || 0),
    summary: honestSign.summary,
  });
});

// GET /api/orders/:id/honest-codes/template — шаблон Excel для массовой загрузки КИЗов
router.get('/:id/honest-codes/template', role(['admin', 'manager']), async (req, res) => {
  const order = await db('orders').where({ id: req.params.id }).first();
  if (!order) return res.status(404).json({ error: 'Заявка не найдена' });

  const workbook = {
    sheets: [
      {
        name: 'КИЗы',
        rows: [
          ['Штрихкод', 'КИЗ', 'Артикул', 'Товар', 'Qty'],
          ['2049709639737', '0104601234567890215ABCDEFG12345', 'Вент_увл', 'Вентилятор настольный с увлажнителем', '1'],
          ['2049709639737', '0104601234567890215ABCDEFG12346', 'Вент_увл', 'Вентилятор настольный с увлажнителем', '1'],
        ],
      },
    ],
  };

  const buffer = buildWorkbookXlsx(workbook);
  sendXlsx(res, buffer, `honest_sign_template_order_${order.number || req.params.id}.xlsx`);
});

// POST /api/orders/:id/honest-codes/import-file — массовая загрузка КИЗов/ЧЗ по Excel для нескольких позиций
router.post('/:id/honest-codes/import-file', role(['admin', 'manager']), (req, res, next) => {
  req.uploadSubdir = 'imports';
  next();
}, docUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
  if (path.extname(req.file.originalname || '').toLowerCase() !== '.xlsx') {
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    return res.status(400).json({ error: 'Поддерживается только формат .xlsx' });
  }

  const parsed = importHonestCodesFileSchema.safeParse(req.body || {});
  if (!parsed.success) {
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    return res.status(400).json({ error: parsed.error.issues });
  }

  try {
    const order = await db('orders').where({ id: req.params.id }).first();
    if (!order) return res.status(404).json({ error: 'Заявка не найдена' });

    const rows = parseImportedProducts(req.file.path);
    if (!rows.length) {
      return res.status(400).json({ error: 'В файле нет строк для импорта' });
    }

    const items = await loadOrderHonestSignItems(req.params.id);
    if (!items.length) {
      return res.status(400).json({ error: 'В заявке нет товарных позиций для привязки КИЗов' });
    }

    const barcodeToItems = new Map();
    items.forEach((item) => {
      item.match_barcodes.forEach((barcode) => {
        if (!barcodeToItems.has(barcode)) barcodeToItems.set(barcode, []);
        barcodeToItems.get(barcode).push(item);
      });
    });

    const issues = [];
    const assignments = [];
    const seenInFile = new Set();
    const touchedItemIds = new Set();

    rows.forEach((row, index) => {
      const rowNumber = Number(row.row_number || index + 2);
      const rawBarcode = String(row.barcode || '').trim();
      const rawCode = String(row.code || '').trim();
      const normalizedBarcode = normalizeBarcodeValue(rawBarcode);
      const normalizedCode = normalizeHonestCode(rawCode);

      if (!normalizedBarcode || !normalizedCode) {
        issues.push({
          row_number: rowNumber,
          barcode: rawBarcode,
          code: rawCode,
          reason: 'Строка без штрихкода или КИЗа',
        });
        return;
      }

      if (seenInFile.has(normalizedCode)) {
        issues.push({
          row_number: rowNumber,
          barcode: rawBarcode,
          code: rawCode,
          reason: 'Дубликат КИЗа внутри файла',
        });
        return;
      }

      const matchedItems = barcodeToItems.get(normalizedBarcode) || [];
      if (!matchedItems.length) {
        issues.push({
          row_number: rowNumber,
          barcode: rawBarcode,
          code: rawCode,
          reason: 'Штрихкод не найден среди позиций заявки',
        });
        return;
      }

      if (matchedItems.length > 1) {
        issues.push({
          row_number: rowNumber,
          barcode: rawBarcode,
          code: rawCode,
          reason: 'Штрихкод соответствует нескольким позициям заявки',
        });
        return;
      }

      const item = matchedItems[0];
      seenInFile.add(normalizedCode);
      touchedItemIds.add(item.id);
      assignments.push({
        row_number: rowNumber,
        order_item_id: item.id,
        product_name: item.product_name,
        article: item.article || '',
        barcode: rawBarcode,
        raw_code: rawCode,
        normalized_code: normalizedCode,
      });
    });

    if (!assignments.length) {
      return res.status(400).json({
        error: 'Не удалось автоматически распределить ни одного КИЗа',
        processed_total: rows.length,
        imported_total: 0,
        issues,
      });
    }

    const duplicateIssues = [];
    let importedTotal = 0;

    await db.transaction(async (trx) => {
      if (parsed.data.replace && touchedItemIds.size) {
        const itemIds = Array.from(touchedItemIds);
        await trx('order_honest_code_scans')
          .where({ order_id: req.params.id })
          .whereIn('order_item_id', itemIds)
          .delete();
        await trx('order_item_honest_codes')
          .where({ order_id: req.params.id })
          .whereIn('order_item_id', itemIds)
          .delete();
      }

      const normalizedCodes = assignments.map((row) => row.normalized_code);
      const existingRows = await trx('order_item_honest_codes')
        .where({ order_id: req.params.id })
        .whereIn('normalized_code', normalizedCodes)
        .select('normalized_code', 'order_item_id');
      const existingMap = new Map(existingRows.map((row) => [row.normalized_code, row]));

      const rowsToInsert = [];
      assignments.forEach((row) => {
        const existing = existingMap.get(row.normalized_code);
        if (existing) {
          duplicateIssues.push({
            row_number: row.row_number,
            barcode: row.barcode,
            code: row.raw_code,
            reason: existing.order_item_id === row.order_item_id
              ? 'КИЗ уже загружен в эту позицию'
              : 'КИЗ уже загружен в другую позицию заявки',
          });
          return;
        }
        rowsToInsert.push({
          order_id: req.params.id,
          order_item_id: row.order_item_id,
          raw_code: row.raw_code,
          normalized_code: row.normalized_code,
          created_by: req.user.id,
        });
      });

      if (rowsToInsert.length) {
        await trx('order_item_honest_codes').insert(rowsToInsert);
      }
      importedTotal = rowsToInsert.length;
    });

    const allIssues = [...issues, ...duplicateIssues];
    const honestSign = await loadOrderHonestSignSummary(req.params.id);

    res.json({
      ok: true,
      processed_total: rows.length,
      imported_total: importedTotal,
      structure_errors_total: issues.filter((row) => row.reason === 'Строка без штрихкода или КИЗа').length,
      unmatched_total: issues.filter((row) => row.reason === 'Штрихкод не найден среди позиций заявки').length,
      ambiguous_total: issues.filter((row) => row.reason === 'Штрихкод соответствует нескольким позициям заявки').length,
      duplicate_total: issues.filter((row) => row.reason === 'Дубликат КИЗа внутри файла').length + duplicateIssues.length,
      issues: allIssues,
      summary: honestSign.summary,
    });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Не удалось обработать файл КИЗов' });
  } finally {
    try { fs.unlinkSync(req.file.path); } catch (_) {}
  }
});

// POST /api/orders/:id/honest-codes/scan — скан КИЗа/ЧЗ по заявке
router.post('/:id/honest-codes/scan', role(['admin', 'manager']), async (req, res) => {
  const parsed = scanHonestCodeSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const order = await db('orders').where({ id: req.params.id }).first();
  if (!order) return res.status(404).json({ error: 'Заявка не найдена' });

  const normalizedCode = normalizeHonestCode(parsed.data.code);
  if (!normalizedCode) {
    return res.status(400).json({ error: 'Пустой или некорректный код' });
  }

  const now = new Date();
  const resultPayload = await db.transaction(async (trx) => {
    const codeRow = await trx('order_item_honest_codes as codes')
      .join('order_items as oi', 'oi.id', 'codes.order_item_id')
      .join('products as p', 'p.id', 'oi.product_id')
      .where('codes.order_id', req.params.id)
      .andWhere('codes.normalized_code', normalizedCode)
      .select(
        'codes.*',
        'p.name as product_name',
        'p.article'
      )
      .first();

    if (!codeRow) {
      await trx('order_honest_code_scans').insert({
        order_id: req.params.id,
        raw_code: parsed.data.code,
        normalized_code: normalizedCode,
        result: 'unexpected',
        scanned_by: req.user.id,
        created_at: now,
      });
      return {
        result: 'unexpected',
        message: 'Код не загружен в эту заявку',
      };
    }

    const wasScanned = Boolean(codeRow.first_scanned_at);
    await trx('order_item_honest_codes')
      .where({ id: codeRow.id })
      .update({
        scan_attempts: Number(codeRow.scan_attempts || 0) + 1,
        first_scanned_at: codeRow.first_scanned_at || now,
        first_scanned_by: codeRow.first_scanned_by || req.user.id,
        last_scanned_at: now,
        last_scanned_by: req.user.id,
        updated_at: now,
      });

    const result = wasScanned ? 'duplicate' : 'matched';
    await trx('order_honest_code_scans').insert({
      order_id: req.params.id,
      order_item_id: codeRow.order_item_id,
      honest_code_id: codeRow.id,
      raw_code: parsed.data.code,
      normalized_code: normalizedCode,
      result,
      scanned_by: req.user.id,
      created_at: now,
    });

    return {
      result,
      item_id: codeRow.order_item_id,
      product_name: codeRow.product_name,
      article: codeRow.article,
      message: wasScanned
        ? 'Повторный скан: этот КИЗ уже был подтвержден'
        : 'КИЗ найден в заявке и подтвержден',
    };
  });

  const honestSign = await loadOrderHonestSignSummary(req.params.id);

  res.json({
    ok: true,
    ...resultPayload,
    summary: honestSign.summary,
  });
});

// GET /api/orders/:id/honest-codes/mismatch-report — Excel-отчёт по несовпадениям КИЗов
router.get('/:id/honest-codes/mismatch-report', role(['admin', 'manager']), async (req, res) => {
  const order = await db('orders')
    .join('companies', 'companies.id', 'orders.company_id')
    .where('orders.id', req.params.id)
    .select('orders.*', 'companies.name as company_name')
    .first();
  if (!order) return res.status(404).json({ error: 'Заявка не найдена' });

  const items = await loadOrderHonestSignItems(req.params.id);
  const summary = await loadOrderHonestSignSummary(req.params.id);

  const [expectedRows, duplicateRows, unexpectedRows] = await Promise.all([
    db('order_item_honest_codes as codes')
      .join('order_items as oi', 'oi.id', 'codes.order_item_id')
      .join('products as p', 'p.id', 'oi.product_id')
      .where('codes.order_id', req.params.id)
      .whereNull('codes.first_scanned_at')
      .select(
        'codes.raw_code',
        'codes.created_at',
        'codes.order_item_id',
        'p.name as product_name',
        'p.article',
        db.raw(`(
          select pb.barcode
          from product_barcodes pb
          where pb.product_id = p.id
          order by
            case
              when pb.marketplace = 'ff' then 0
              when pb.marketplace = 'wb' then 1
              when pb.marketplace = 'ozon' then 2
              else 3
            end,
            pb.created_at asc
          limit 1
        ) as barcode`)
      )
      .orderBy('p.name'),
    db('order_honest_code_scans as scans')
      .join('order_items as oi', 'oi.id', 'scans.order_item_id')
      .join('products as p', 'p.id', 'oi.product_id')
      .leftJoin('order_item_honest_codes as codes', 'codes.id', 'scans.honest_code_id')
      .where('scans.order_id', req.params.id)
      .andWhere('scans.result', 'duplicate')
      .groupBy('scans.normalized_code', 'scans.order_item_id', 'p.name', 'p.article', 'codes.first_scanned_at')
      .select(
        'scans.normalized_code',
        'scans.order_item_id',
        'p.name as product_name',
        'p.article',
        'codes.first_scanned_at',
        db.raw('count(*) as duplicate_attempts'),
        db.raw('max(scans.created_at) as last_duplicate_at')
      )
      .orderBy('p.name'),
    db('order_honest_code_scans as scans')
      .leftJoin('users', 'users.id', 'scans.scanned_by')
      .where('scans.order_id', req.params.id)
      .andWhere('scans.result', 'unexpected')
      .select(
        'scans.raw_code',
        'scans.normalized_code',
        'scans.created_at',
        'users.full_name as scanned_by_name'
      )
      .orderBy('scans.created_at', 'desc'),
  ]);

  const duplicateCountByItem = duplicateRows.reduce((acc, row) => {
    acc[row.order_item_id] = Number(acc[row.order_item_id] || 0) + Number(row.duplicate_attempts || 0);
    return acc;
  }, {});

  const summaryRows = items.map((item) => {
    const stats = summary.statsByItem[item.id] || { expected: 0, scanned: 0 };
    return [
      item.product_name || '',
      item.barcode || '',
      item.article || '',
      fmtForReport(stats.expected),
      fmtForReport(stats.scanned),
      fmtForReport(Math.max(0, Number(stats.expected || 0) - Number(stats.scanned || 0))),
      fmtForReport(duplicateCountByItem[item.id] || 0),
      '0',
    ];
  });

  summaryRows.push([
    'ИТОГО ПО ЗАЯВКЕ',
    '',
    '',
    fmtForReport(summary.summary.expected_total || 0),
    fmtForReport(summary.summary.scanned_total || 0),
    fmtForReport(summary.summary.remaining_total || 0),
    fmtForReport(summary.summary.duplicate_total || 0),
    fmtForReport(summary.summary.unexpected_total || 0),
  ]);

  const workbook = {
    sheets: [
      {
        name: 'Сводка',
        rows: [
          ['Товар', 'Штрихкод', 'Артикул', 'Ожидается', 'Отсканировано', 'Осталось', 'Дубли', 'Лишние'],
          ...summaryRows,
        ],
      },
      {
        name: 'Не отсканированы',
        rows: [
          ['Товар', 'Штрихкод', 'Артикул', 'КИЗ', 'Дата загрузки'],
          ...expectedRows.map((row) => [
            row.product_name || '',
            row.barcode || '',
            row.article || '',
            row.raw_code || '',
            formatDateTimeForReport(row.created_at),
          ]),
        ],
      },
      {
        name: 'Лишние коды',
        rows: [
          ['Raw code', 'Normalized code', 'Дата скана', 'Сканировал'],
          ...unexpectedRows.map((row) => [
            row.raw_code || '',
            row.normalized_code || '',
            formatDateTimeForReport(row.created_at),
            row.scanned_by_name || '',
          ]),
        ],
      },
      {
        name: 'Дубли',
        rows: [
          ['Код', 'Товар', 'Артикул', 'Дата первого успешного скана', 'Повторных сканов', 'Последний повтор'],
          ...duplicateRows.map((row) => [
            row.normalized_code || '',
            row.product_name || '',
            row.article || '',
            formatDateTimeForReport(row.first_scanned_at),
            fmtForReport(row.duplicate_attempts || 0),
            formatDateTimeForReport(row.last_duplicate_at),
          ]),
        ],
      },
    ],
  };

  const buffer = buildWorkbookXlsx(workbook);
  const safeCompany = String(order.company_name || 'company').replace(/[^\p{L}\p{N}_-]+/gu, '_');
  sendXlsx(res, buffer, `honest_sign_mismatch_order_${order.number}_${safeCompany}.xlsx`);
});

router.get('/:id/documents/:kind/download', async (req, res) => {
  const order = await db('orders')
    .join('companies', 'companies.id', 'orders.company_id')
    .where('orders.id', req.params.id)
    .select('orders.id', 'orders.company_id')
    .first();

  if (!order) return res.status(404).json({ error: 'Заявка не найдена' });

  if (req.user.role === 'client') {
    const allowed = await db('companies').where({ id: order.company_id, user_id: req.user.id }).first();
    if (!allowed) return res.status(403).json({ error: 'Доступ запрещён' });
  }

  const allowedKinds = ['acceptance_sheet', 'technical_task', 'invoice', 'act'];
  if (!allowedKinds.includes(req.params.kind)) {
    return res.status(400).json({ error: 'Неподдерживаемый тип документа' });
  }

  try {
    const url = await resolveOrderDocumentDownload(req.params.id, req.params.kind, { uploadedBy: req.user.id });
    if (!url) {
      return res.status(404).json({ error: 'Документ пока недоступен для этой заявки' });
    }
    res.json({ url, download_url: url, kind: req.params.kind, order_id: req.params.id });
  } catch (error) {
    console.error('Order document download error:', error);
    res.status(500).json({ error: 'Не удалось подготовить документ' });
  }
});

// POST /api/orders/import-items-xlsx — создать/обновить товары и собрать состав заявки из Excel
router.post('/import-items-xlsx', (req, res, next) => {
  req.uploadSubdir = 'imports';
  next();
}, docUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

  try {
    let companyId = String(req.body?.company_id || '').trim();

    if (req.user.role === 'client') {
      const ownCompany = await db('companies')
        .where({ user_id: req.user.id, is_active: true })
        .select('id')
        .first();
      if (!ownCompany) {
        return res.status(400).json({ error: 'Не найдена компания клиента' });
      }
      companyId = ownCompany.id;
    } else if (!companyId) {
      return res.status(400).json({ error: 'Сначала выберите компанию' });
    }

    const company = await db('companies')
      .where({ id: companyId, is_active: true })
      .first();
    if (!company) {
      return res.status(404).json({ error: 'Компания не найдена' });
    }

    const rows = parseImportedOrderItems(req.file.path);
    if (!rows.length) {
      return res.status(400).json({ error: 'В файле нет строк для импорта' });
    }

    const stats = {
      created: 0,
      updated: 0,
      matched: 0,
      skipped: 0,
      barcodes: 0,
      imported_rows: rows.length,
    };

    const items = await db.transaction(async (trx) => {
      const draftItemsMap = new Map();

      for (const row of rows) {
        const article = String(row.article || '').trim();
        const name = String(row.name || '').trim();
        const barcode = normalizeBarcodeValue(row.barcode || '');
        const brand = String(row.brand || '').trim();
        const color = String(row.color || '').trim();
        const size = String(row.size || '').trim();
        const quantity = Number(row.quantity || 0);
        let matchMode = 'matched';

        if (!isValidImportedProductName(name) || quantity <= 0) {
          stats.skipped += 1;
          continue;
        }

        let product = null;

        if (article) {
          product = await trx('products')
            .where({ company_id: company.id, article })
            .modify((queryBuilder) => {
              if (color) queryBuilder.whereRaw('coalesce(lower(trim(color)), \'\') = lower(trim(?))', [color]);
              if (size) queryBuilder.whereRaw('coalesce(lower(trim(size)), \'\') = lower(trim(?))', [size]);
            })
            .first();
        }

        if (!product && barcode) {
          product = await trx('products as p')
            .join('product_barcodes as pb', 'pb.product_id', 'p.id')
            .where('p.company_id', company.id)
            .whereRaw('upper(replace(trim(coalesce(pb.barcode, \'\')), \' \', \'\')) = ?', [barcode])
            .select('p.*')
            .first();
        }

        if (!product) {
          product = await trx('products')
            .whereRaw('company_id = ? and lower(trim(name)) = lower(trim(?))', [company.id, name])
            .modify((queryBuilder) => {
              if (brand) queryBuilder.whereRaw('coalesce(lower(trim(brand)), \'\') = lower(trim(?))', [brand]);
              if (color) queryBuilder.whereRaw('coalesce(lower(trim(color)), \'\') = lower(trim(?))', [color]);
              if (size) queryBuilder.whereRaw('coalesce(lower(trim(size)), \'\') = lower(trim(?))', [size]);
            })
            .first();
        }

        if (product) {
          const nextPatch = {
            name,
            article: article || product.article || null,
            brand: brand || product.brand || null,
            color: color || product.color || null,
            size: size || product.size || null,
            updated_at: new Date(),
          };
          const [updated] = await trx('products')
            .where({ id: product.id })
            .update(nextPatch)
            .returning('*');
          product = updated;
          stats.updated += 1;
          matchMode = 'updated';
        } else {
          const [created] = await trx('products')
            .insert({
              company_id: company.id,
              name,
              article: article || null,
              brand: brand || null,
              color: color || null,
              size: size || null,
            })
            .returning('*');
          product = created;
          stats.created += 1;
          matchMode = 'created';

          await trx('stock').insert({
            product_id: product.id,
            quantity: 0,
            defect_qty: 0,
            reserved_qty: 0,
          });
        }

        if (barcode) {
          const existingBarcode = await trx('product_barcodes')
            .where({ product_id: product.id, marketplace: 'ff' })
            .first();
          if (existingBarcode) {
            await trx('product_barcodes')
              .where({ id: existingBarcode.id })
              .update({
                barcode,
                article_mp: article || existingBarcode.article_mp || null,
                updated_at: new Date(),
              });
          } else {
            await trx('product_barcodes').insert({
              product_id: product.id,
              marketplace: 'ff',
              barcode,
              article_mp: article || null,
            });
          }
          stats.barcodes += 1;
        }

        if (matchMode === 'matched') {
          stats.matched += 1;
        }

        const draftKey = buildImportedDraftKey(product, {
          article,
          barcode,
          color,
          size,
        });
        const existingDraft = draftItemsMap.get(draftKey) || {
          product_id: product.id,
          product_name: product.name,
          article: product.article || article || null,
          barcode: barcode || null,
          quantity: 0,
          brand: product.brand || brand || null,
          color: product.color || color || null,
          size: product.size || size || null,
        };
        existingDraft.quantity += quantity;
        existingDraft.product_name = product.name || existingDraft.product_name;
        existingDraft.article = product.article || existingDraft.article;
        existingDraft.barcode = barcode || existingDraft.barcode;
        existingDraft.brand = product.brand || existingDraft.brand;
        existingDraft.color = product.color || existingDraft.color;
        existingDraft.size = product.size || existingDraft.size;
        draftItemsMap.set(draftKey, existingDraft);
      }

      return Array.from(draftItemsMap.values());
    });

    res.json({
      ok: true,
      company_id: company.id,
      items,
      stats: {
        ...stats,
        total_items: items.length,
        total_quantity: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      },
    });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Не удалось импортировать товары из Excel' });
  } finally {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (_) {
        // ignore
      }
    }
  }
});

// POST /api/orders — создание заявки
router.post('/', async (req, res) => {
  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  try {
    let { company_id } = parsed.data;
    const { type, comment, items, supply, logistics: logisticsData, consumables } = parsed.data;

    if (req.user.role === 'client') {
      const ownCompany = await db('companies')
        .where({ user_id: req.user.id, is_active: true })
        .select('id')
        .first();
      if (!ownCompany) {
        return res.status(400).json({ error: 'Не найдена компания. Обратитесь к менеджеру.' });
      }
      company_id = ownCompany.id;
    } else {
      if (!company_id) {
        return res.status(400).json({ error: 'Выберите компанию' });
      }
      const allowedCompany = await db('companies')
        .where({ id: company_id, is_active: true })
        .select('id')
        .first();
      if (!allowedCompany) {
        return res.status(400).json({ error: 'Компания не найдена или отключена' });
      }
    }

    const order = await db.transaction(async trx => {
      const [o] = await trx('orders').insert({
        company_id,
        type,
        stage: 'new',
        status: 'active',
        comment,
        created_by: req.user.id,
      }).returning('*');

      await trx('order_stages').insert({ order_id: o.id, stage: 'new', changed_by: req.user.id });

      if (items?.length) {
        await trx('order_items').insert(items.map(i => ({ order_id: o.id, ...i })));
      }

      if (type === 'supply' && supply) {
        await trx('supply_details').insert({ order_id: o.id, ...supply });
      }

      if (type === 'logistics' && logisticsData) {
        await trx('logistics').insert({ order_id: o.id, ...logisticsData });
      }

      if (consumables?.length) {
        for (const consumable of consumables) {
          const current = await trx('consumables')
            .where({ id: consumable.consumable_id, is_active: true })
            .first();

          if (!current) {
            throw new Error('Расходник не найден');
          }

          const unitPrice = Number(consumable.unit_price ?? current.price ?? 0);
          const quantity = Number(consumable.quantity || 0);
          const discount = Math.max(0, Math.min(100, Number(consumable.discount || 0)));

          await trx('order_consumables').insert({
            order_id: o.id,
            consumable_id: consumable.consumable_id,
            quantity,
            unit_price: unitPrice,
            total: Number((unitPrice * quantity).toFixed(2)),
            discount,
            comment: consumable.comment,
          });

          await trx('consumables')
            .where({ id: consumable.consumable_id })
            .decrement('stock_qty', quantity)
            .update({ updated_at: new Date() });
        }
      }

      return o;
    });

    await syncTechnicalTaskDocument(order.id, { uploadedBy: req.user.id }).catch((err) => {
      console.error('Technical task sync error:', err);
    });

    res.status(201).json(order);
  } catch (err) {
    if (err?.message === 'Расходник не найден') {
      return res.status(400).json({ error: err.message });
    }
    throw err;
  }
});

// PATCH /api/orders/:id/stage — сменить этап (канбан)
router.patch('/:id/stage', role(['admin', 'manager']), async (req, res) => {
  const { stage, note } = req.body;
  if (!stage) return res.status(400).json({ error: 'Нужен stage' });

  const order = await db('orders').where({ id: req.params.id }).first();
  if (!order) return res.status(404).json({ error: 'Не найдено' });
  if (!STAGES[order.type]?.includes(stage)) {
    return res.status(400).json({ error: 'Этап не подходит для типа заявки' });
  }

  const company = await db('companies').where({ id: order.company_id }).first();
  const manager = await db('users').where({ id: req.user.id }).first();

  await db.transaction(async trx => {
    await trx('orders').where({ id: req.params.id }).update({ stage, updated_at: new Date() });
    await trx('order_stages').insert({ order_id: req.params.id, stage, note, changed_by: req.user.id });
  });

  notifyStageChange({
    order: { ...order, company_name: company?.name },
    newStage: stage,
    note,
    changedBy: manager?.full_name,
  }).catch(() => {});
  notifyCompanyStageChange({
    company,
    order: { ...order, company_name: company?.name },
    newStage: stage,
    note,
    changedBy: manager?.full_name,
  }).catch(() => {});
  notifyOrderStage({ order, newStage: stage, note }).catch(() => {});

  if (stage === 'accepted') {
    syncAcceptanceDocument(order.id, { uploadedBy: req.user.id }).catch((err) => {
      console.error('Acceptance document sync error:', err);
    });
  }

  if (stage === 'done') {
    await createOrderBillingDocument(order.id, {
      uploadedBy: req.user.id,
      type: 'invoice',
      notesOverride: `Счет по заявке #${order.number}`,
      notify: true,
    }).catch((err) => {
      console.error('Auto invoice creation error:', err);
    });
  }

  if (stage === 'done') {
    await syncBillingDocuments(order.id, {
      uploadedBy: req.user.id,
      force: true,
      notify: true,
    }).catch((err) => {
      console.error('Billing document sync error:', err);
    });
  }

  res.json({ ok: true, stage });
});

// PUT /api/orders/:id/shipments — распределение по складам маркетплейсов
router.put('/:id/shipments', role(['admin', 'manager']), async (req, res) => {
  const parsed = shipmentsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const order = await db('orders').where({ id: req.params.id }).first();
  if (!order) return res.status(404).json({ error: 'Заявка не найдена' });
  if (!['supply', 'logistics'].includes(order.type)) {
    return res.status(400).json({ error: 'Распределение по складам доступно только для Поставки и Логистики' });
  }

  const items = await db('order_items').where({ order_id: req.params.id });
  const readyTotal = items.reduce((sum, item) => sum + Number(item.ready_qty || 0), 0);
  const requestedTotal = parsed.data.reduce((sum, row) => sum + Number(row.quantity || 0), 0);

  if (readyTotal <= 0) {
    return res.status(400).json({ error: 'Сначала заполните приемку: нет подтвержденного количества к отгрузке' });
  }
  if (requestedTotal > readyTotal) {
    return res.status(400).json({
      error: `Нельзя отгрузить больше принятого: доступно ${readyTotal}, указано ${requestedTotal}`,
    });
  }

  await db.transaction(async (trx) => {
    await trx('order_marketplace_box_items')
      .whereIn('box_id', trx('order_marketplace_boxes').where({ order_id: req.params.id }).select('id'))
      .delete();
    await trx('order_marketplace_boxes').where({ order_id: req.params.id }).delete();
    await trx('order_marketplace_shipments').where({ order_id: req.params.id }).del();

    if (parsed.data.length > 0) {
      await trx('order_marketplace_shipments').insert(
        parsed.data.map((row) => ({
          order_id: req.params.id,
          marketplace: row.marketplace,
          warehouse_name: row.warehouse_name,
          ship_date: row.ship_date || null,
          places_count: Number(row.places_count || 0),
          quantity: Number(row.quantity || 0),
          unit_price: row.unit_price !== null && row.unit_price !== undefined && row.unit_price !== ''
            ? Number(row.unit_price)
            : null,
          billing_rate: row.billing_rate || 'per_unit',
          note: row.note || null,
          created_by: req.user.id,
        }))
      );
    }
  });

  syncBillingDocuments(req.params.id, {
    uploadedBy: req.user.id,
    force: false,
    notify: false,
  }).catch((err) => {
    console.error('Billing document sync error:', err);
  });

  const shipments = await db('order_marketplace_shipments')
    .where({ order_id: req.params.id })
    .orderBy('created_at');

  res.json({
    ok: true,
    accepted_qty: readyTotal,
    shipped_qty: requestedTotal,
    shipments,
  });
});

// PATCH /api/orders/:id/items/:itemId — обновить готово/брак
router.patch('/:id/items/:itemId', role(['admin', 'manager']), async (req, res) => {
  const current = await db('order_items')
    .where({ id: req.params.itemId, order_id: req.params.id })
    .first();
  if (!current) return res.status(404).json({ error: 'Не найдено' });

  const nextQuantity = req.body.quantity === undefined || req.body.quantity === null || req.body.quantity === ''
    ? Number(current.quantity || 0)
    : Number(req.body.quantity);
  const readyQty = req.body.ready_qty === undefined || req.body.ready_qty === null || req.body.ready_qty === ''
    ? Number(current.ready_qty || 0)
    : Number(req.body.ready_qty);
  const defectQty = req.body.defect_qty === undefined || req.body.defect_qty === null || req.body.defect_qty === ''
    ? Number(current.defect_qty || 0)
    : Number(req.body.defect_qty);

  if (!Number.isInteger(nextQuantity) || nextQuantity < 1 || readyQty < 0 || defectQty < 0) {
    return res.status(400).json({ error: 'Количество не может быть отрицательным' });
  }

  if (readyQty + defectQty > nextQuantity) {
    return res.status(400).json({ error: 'Готово и брак не могут превышать заявленное количество' });
  }

  const [item] = await db('order_items')
    .where({ id: req.params.itemId, order_id: req.params.id })
    .update({
      quantity: nextQuantity,
      ready_qty: readyQty,
      defect_qty: defectQty,
      updated_at: new Date(),
    })
    .returning('*');

  const order = await db('orders').where({ id: req.params.id }).first();

  await syncTechnicalTaskDocument(req.params.id, { uploadedBy: req.user.id }).catch((err) => {
    console.error('Technical task sync error:', err);
  });

  if (order && ['receiving', 'accepted'].includes(order.stage)) {
    await syncAcceptanceDocument(req.params.id, { uploadedBy: req.user.id }).catch((err) => {
      console.error('Acceptance document sync error:', err);
    });
  }

  res.json(item);
});

// POST /api/orders/:id/items — добавить позицию в заявку
router.post('/:id/items', role(['admin', 'manager']), async (req, res) => {
  const parsed = orderItemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const order = await db('orders').where({ id: req.params.id }).first();
  if (!order) return res.status(404).json({ error: 'Заявка не найдена' });
  if (order.status !== 'active') return res.status(400).json({ error: 'Редактирование доступно только для активной заявки' });

  const product = await db('products').where({ id: parsed.data.product_id }).first();
  if (!product) return res.status(404).json({ error: 'Товар не найден' });
  if (product.company_id !== order.company_id) {
    return res.status(400).json({ error: 'Товар не относится к компании этой заявки' });
  }

  let itemId = null;
  const existing = await db('order_items')
    .where({ order_id: req.params.id, product_id: parsed.data.product_id })
    .first();

  if (existing) {
    const nextQty = Number(existing.quantity || 0) + Number(parsed.data.quantity || 0);
    const [updated] = await db('order_items')
      .where({ id: existing.id, order_id: req.params.id })
      .update({
        quantity: nextQty,
        pack_note: parsed.data.pack_note === undefined ? existing.pack_note : (parsed.data.pack_note || null),
        updated_at: new Date(),
      })
      .returning('*');
    itemId = updated?.id;
  } else {
    const [created] = await db('order_items')
      .insert({
        order_id: req.params.id,
        product_id: parsed.data.product_id,
        quantity: Number(parsed.data.quantity || 1),
        ready_qty: 0,
        defect_qty: 0,
        pack_note: parsed.data.pack_note || null,
      })
      .returning('*');
    itemId = created?.id;
  }

  const item = await db('order_items')
    .join('products', 'products.id', 'order_items.product_id')
    .where('order_items.id', itemId)
    .select(
      'order_items.*',
      'products.name as product_name',
      'products.article',
      'products.photo_url',
      'products.color',
      'products.size',
      'products.composition',
      'products.weight_g',
      'products.dim_l',
      'products.dim_w',
      'products.dim_h',
      db.raw(`(
        select pb.barcode
        from product_barcodes pb
        where pb.product_id = products.id
        order by
          case
            when pb.marketplace = 'ff' then 0
            when pb.marketplace = 'wb' then 1
            when pb.marketplace = 'ozon' then 2
            else 3
          end,
          pb.created_at asc
        limit 1
      ) as barcode`)
    )
    .first();

  await syncTechnicalTaskDocument(order.id, { uploadedBy: req.user.id }).catch((err) => {
    console.error('Technical task sync error:', err);
  });

  res.status(existing ? 200 : 201).json(item);
});

// PATCH /api/orders/:id/details — обновить этапные детали заявки
router.patch('/:id/details', role(['admin', 'manager']), async (req, res) => {
  const parsed = updateOrderDetailsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const order = await db('orders').where({ id: req.params.id }).first();
  if (!order) return res.status(404).json({ error: 'Заявка не найдена' });
  if (order.status !== 'active') return res.status(400).json({ error: 'Редактирование доступно только для активной заявки' });

  const payload = parsed.data;

  if (payload.supply && order.type === 'supply') {
    const updateData = { ...payload.supply, updated_at: new Date() };
    if (updateData.delivery_date === '') updateData.delivery_date = null;
    await db('supply_details').where({ order_id: req.params.id }).update(updateData);
  }

  if (payload.logistics && order.type === 'logistics') {
    const updateData = { ...payload.logistics, updated_at: new Date() };
    if (updateData.ship_date === '') updateData.ship_date = null;
    await db('logistics').where({ order_id: req.params.id }).update(updateData);
  }

  const details = order.type === 'supply'
    ? await db('supply_details').where({ order_id: req.params.id }).first()
    : order.type === 'logistics'
      ? await db('logistics').where({ order_id: req.params.id }).first()
      : null;

  await syncTechnicalTaskDocument(order.id, { uploadedBy: req.user.id }).catch((err) => {
    console.error('Technical task sync error:', err);
  });

  res.json({ ok: true, details });
});

// POST /api/orders/:id/consumables — добавить расходник в заявку
router.post('/:id/consumables', role(['admin', 'manager']), async (req, res) => {
  const parsed = orderConsumableSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const order = await db('orders').where({ id: req.params.id }).first();
  if (!order) return res.status(404).json({ error: 'Заявка не найдена' });
  if (order.status !== 'active') return res.status(400).json({ error: 'Редактирование доступно только для активной заявки' });

  const { consumable_id, quantity, unit_price, discount, comment } = parsed.data;

  try {
    const created = await db.transaction(async (trx) => {
      const consumable = await trx('consumables').where({ id: consumable_id, is_active: true }).first();
      if (!consumable) throw new Error('Расходник не найден');

      const price = Number(unit_price ?? consumable.price ?? 0);
      const safeDiscount = Math.max(0, Math.min(100, Number(discount || 0)));
      const total = Number((price * quantity).toFixed(2));

      const [entry] = await trx('order_consumables').insert({
        order_id: req.params.id,
        consumable_id,
        quantity,
        unit_price: price,
        total,
        discount: safeDiscount,
        comment: comment || null,
      }).returning('*');

      await trx('consumables')
        .where({ id: consumable_id })
        .decrement('stock_qty', quantity)
        .update({ updated_at: new Date() });

      return entry;
    });

    const full = await db('order_consumables')
      .join('consumables', 'consumables.id', 'order_consumables.consumable_id')
      .where('order_consumables.id', created.id)
      .select(
        'order_consumables.*',
        'consumables.code',
        'consumables.name',
        'consumables.category',
        'consumables.unit'
      )
      .first();

    syncBillingDocuments(req.params.id, {
      uploadedBy: req.user.id,
      force: false,
      notify: false,
    }).catch((err) => {
      console.error('Billing document sync error:', err);
    });

    res.status(201).json(full);
  } catch (err) {
    if (err?.message === 'Расходник не найден') {
      return res.status(400).json({ error: err.message });
    }
    throw err;
  }
});

// PATCH /api/orders/:id/consumables/:entryId — обновить расходник в заявке
router.patch('/:id/consumables/:entryId', role(['admin', 'manager']), async (req, res) => {
  const parsed = updateOrderConsumableSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const order = await db('orders').where({ id: req.params.id }).first();
  if (!order) return res.status(404).json({ error: 'Заявка не найдена' });
  if (order.status !== 'active') return res.status(400).json({ error: 'Редактирование доступно только для активной заявки' });

  const current = await db('order_consumables')
    .where({ id: req.params.entryId, order_id: req.params.id })
    .first();
  if (!current) return res.status(404).json({ error: 'Расходник в заявке не найден' });

  const nextQty = parsed.data.quantity ?? Number(current.quantity || 0);
  const nextPrice = parsed.data.unit_price ?? Number(current.unit_price || 0);
  const nextDiscount = parsed.data.discount ?? Number(current.discount || 0);
  const stockDiff = Number(nextQty) - Number(current.quantity || 0);

  try {
    const updated = await db.transaction(async (trx) => {
      if (stockDiff !== 0) {
        const consumable = await trx('consumables')
          .where({ id: current.consumable_id, is_active: true })
          .first();
        if (!consumable) throw new Error('Расходник не найден');

        if (stockDiff > 0) {
          await trx('consumables')
            .where({ id: current.consumable_id })
            .decrement('stock_qty', stockDiff)
            .update({ updated_at: new Date() });
        } else {
          await trx('consumables')
            .where({ id: current.consumable_id })
            .increment('stock_qty', Math.abs(stockDiff))
            .update({ updated_at: new Date() });
        }
      }

      const [entry] = await trx('order_consumables')
        .where({ id: req.params.entryId, order_id: req.params.id })
        .update({
          quantity: nextQty,
          unit_price: nextPrice,
          total: Number((Number(nextQty) * Number(nextPrice)).toFixed(2)),
          discount: nextDiscount,
          comment: parsed.data.comment === undefined ? current.comment : parsed.data.comment,
          updated_at: new Date(),
        })
        .returning('*');

      return entry;
    });

    const full = await db('order_consumables')
      .join('consumables', 'consumables.id', 'order_consumables.consumable_id')
      .where('order_consumables.id', updated.id)
      .select(
        'order_consumables.*',
        'consumables.code',
        'consumables.name',
        'consumables.category',
        'consumables.unit'
      )
      .first();

    syncBillingDocuments(req.params.id, {
      uploadedBy: req.user.id,
      force: false,
      notify: false,
    }).catch((err) => {
      console.error('Billing document sync error:', err);
    });

    res.json(full);
  } catch (err) {
    if (err?.message === 'Расходник не найден') {
      return res.status(400).json({ error: err.message });
    }
    throw err;
  }
});

// DELETE /api/orders/:id/consumables/:entryId — удалить расходник из заявки
router.delete('/:id/consumables/:entryId', role(['admin', 'manager']), async (req, res) => {
  const order = await db('orders').where({ id: req.params.id }).first();
  if (!order) return res.status(404).json({ error: 'Заявка не найдена' });

  const current = await db('order_consumables')
    .where({ id: req.params.entryId, order_id: req.params.id })
    .first();
  if (!current) return res.status(404).json({ error: 'Расходник в заявке не найден' });

  await db.transaction(async (trx) => {
    await trx('order_consumables')
      .where({ id: req.params.entryId, order_id: req.params.id })
      .del();

    await trx('consumables')
      .where({ id: current.consumable_id })
      .increment('stock_qty', Number(current.quantity || 0))
      .update({ updated_at: new Date() });
  });

  syncBillingDocuments(req.params.id, {
    uploadedBy: req.user.id,
    force: false,
    notify: false,
  }).catch((err) => {
    console.error('Billing document sync error:', err);
  });

  res.json({ ok: true });
});

// POST /api/orders/:id/complete — завершить заявку + обновить остатки
router.post('/:id/complete', role(['admin', 'manager']), async (req, res) => {
  const order = await db('orders').where({ id: req.params.id }).first();
  if (!order) return res.status(404).json({ error: 'Не найдено' });

  const items = await db('order_items').where({ order_id: req.params.id });

  await db.transaction(async trx => {
    for (const item of items) {
      if (order.type === 'supply' && item.ready_qty > 0) {
        // Приход на склад
        await trx('warehouse_ops').insert({
          product_id: item.product_id,
          order_id: order.id,
          op_type: 'in',
          quantity: item.ready_qty,
          created_by: req.user.id,
        });
        await trx('stock').where({ product_id: item.product_id })
          .increment('quantity', item.ready_qty);
      }
      if (item.defect_qty > 0) {
        await trx('warehouse_ops').insert({
          product_id: item.product_id,
          order_id: order.id,
          op_type: 'defect',
          quantity: item.defect_qty,
          created_by: req.user.id,
        });
        await trx('stock').where({ product_id: item.product_id })
          .increment('defect_qty', item.defect_qty);
      }
    }

    await trx('orders').where({ id: req.params.id })
      .update({ status: 'done', stage: 'done', updated_at: new Date() });
    await trx('order_stages').insert({ order_id: req.params.id, stage: 'done', changed_by: req.user.id });
  });

  // Начисления (фоново)
  const defectItems = items.filter(i => i.defect_qty > 0);
  await Promise.all([
    order.type === 'supply'     && chargeReceiving({ order, items, userId: req.user.id }),
    order.type === 'processing' && chargeProcessing({ order, items, userId: req.user.id }),
    order.type === 'logistics'  && chargeLogistics({ order, items, userId: req.user.id }),
    defectItems.length > 0      && chargeDefects({ order, defectItems, userId: req.user.id }),
  ]).catch(err => console.error('Billing error:', err));

  await syncBillingDocuments(order.id, { uploadedBy: req.user.id, notify: false }).catch((err) => {
    console.error('Billing document sync error:', err);
  });

  await createOrderBillingDocument(order.id, {
    uploadedBy: req.user.id,
    type: 'invoice',
    notesOverride: `Счет по заявке #${order.number}`,
    notify: true,
  }).catch((err) => {
    console.error('Auto invoice creation error:', err);
  });

  if (defectItems.length > 0) {
    const productMap = Object.fromEntries(
      (await db('products').whereIn('id', defectItems.map((item) => item.product_id)).select('id', 'name'))
        .map((product) => [product.id, product.name])
    );
    Promise.all(
      defectItems.map((item) =>
        notifyDefectFound({
          order,
          productName: productMap[item.product_id] || 'Товар',
          defectQty: item.defect_qty,
        })
      )
    ).catch(() => {});
  }

  notifyOrderStage({ order, newStage: 'done' }).catch(() => {});

  res.json({ ok: true });
});

module.exports = router;
