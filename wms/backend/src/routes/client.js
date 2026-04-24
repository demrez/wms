const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db/knex');
const { auth } = require('../middleware/auth');

const router = express.Router();
router.use(auth);

// Middleware — только клиенты (и менеджеры для тестов)
const clientOnly = (req, res, next) => {
  if (!['client', 'admin', 'manager'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Только для клиентов' });
  }
  next();
};

// Получить company_id клиента
async function getClientCompanyId(userId) {
  const company = await db('companies').where({ user_id: userId, is_active: true }).first();
  return company?.id || null;
}

function getStoredPathFromUrl(fileUrl) {
  if (!fileUrl || typeof fileUrl !== 'string') return null;

  const marker = '/uploads/';
  const idx = fileUrl.indexOf(marker);
  if (idx === -1) return null;

  const relativePath = fileUrl.slice(idx + marker.length);
  if (!relativePath) return null;
  return path.join(process.env.UPLOAD_DIR || './uploads', relativePath);
}

async function deleteStoredFileByUrl(fileUrl) {
  const filePath = getStoredPathFromUrl(fileUrl);
  if (!filePath) return false;
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

async function enrichOrdersForClientSummary(orders = []) {
  const ids = orders.map((order) => order.id);
  if (ids.length === 0) return orders;

  const [supplyRows, logisticsRows, shipmentRows] = await Promise.all([
    db('supply_details')
      .whereIn('order_id', ids)
      .select('order_id', 'delivery_date', 'pickup_address', 'places_count'),
    db('logistics')
      .whereIn('order_id', ids)
      .select('order_id', 'dest_warehouse', 'ship_date'),
    db('order_marketplace_shipments')
      .whereIn('order_id', ids)
      .orderBy('created_at', 'asc')
      .select('order_id', 'warehouse_name', 'ship_date', 'places_count'),
  ]);

  const supplyMap = new Map(supplyRows.map((row) => [row.order_id, row]));
  const logisticsMap = new Map(logisticsRows.map((row) => [row.order_id, row]));
  const shipmentMap = new Map();
  shipmentRows.forEach((row) => {
    if (!shipmentMap.has(row.order_id)) shipmentMap.set(row.order_id, row);
  });

  const qtyRows = await db('order_items')
    .whereIn('order_id', ids)
    .groupBy('order_id')
    .select('order_id', db.raw('sum(quantity) as total_qty'));
  const qtyMap = new Map(qtyRows.map((row) => [row.order_id, Number(row.total_qty || 0)]));

  orders.forEach((order) => {
    const supply = supplyMap.get(order.id);
    const logistics = logisticsMap.get(order.id);
    const shipment = shipmentMap.get(order.id);

    order.total_qty = qtyMap.get(order.id) || 0;
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
    order.boxes_count = Number(shipment?.places_count ?? supply?.places_count ?? 0);
  });

  return orders;
}

// GET /api/client/company
router.get('/company', clientOnly, async (req, res) => {
  if (req.user.role !== 'client') {
    return res.json({ company: null });
  }

  const company = await db('companies')
    .where({ user_id: req.user.id, is_active: true })
    .select('id', 'name', 'legal_name', 'inn', 'phone', 'address', 'contact_name')
    .first();

  res.json({ company: company || null });
});

// ── Сводка (дашборд клиента) ─────────────────────────────────────
// GET /api/client/summary
router.get('/summary', clientOnly, async (req, res) => {
  const companyId = req.user.role === 'client'
    ? await getClientCompanyId(req.user.id)
    : req.query.company_id;

  if (!companyId) return res.json({ empty: true });

  // Остатки
  const [stockAgg] = await db('stock')
    .join('products', 'products.id', 'stock.product_id')
    .where('products.company_id', companyId)
    .select(
      db.raw('sum(stock.quantity) as total_qty'),
      db.raw('sum(stock.defect_qty) as defect_qty'),
      db.raw('sum(stock.quantity - stock.defect_qty - stock.reserved_qty) as available_qty'),
      db.raw('count(distinct products.id) as products_count')
    );

  // Активные заявки
  const activeOrders = await db('orders')
    .where({ company_id: companyId, status: 'active' })
    .orderBy('created_at', 'desc')
    .limit(5)
    .select('id', 'number', 'type', 'stage', 'created_at', 'company_id');
  await enrichOrdersForClientSummary(activeOrders);

  const [ordersCount] = await db('orders').where({ company_id: companyId })
    .count('* as total')
    .where('status', 'active');

  // Финансы по выставленным документам/счетам
  const [invoiceBilling] = await db('invoices')
    .where({ company_id: companyId })
    .whereIn('status', ['sent', 'paid', 'deferred'])
    .select(
      db.raw("sum(case when status in ('sent', 'deferred') then total else 0 end) as pending"),
      db.raw("sum(case when status = 'paid' then total else 0 end) as paid"),
      db.raw("count(*) as total_invoices")
    );

  const [chargeBilling] = await db('charges')
    .where({ company_id: companyId })
    .select(
      db.raw("sum(case when status != 'paid' then total else 0 end) as pending"),
      db.raw("sum(case when status = 'paid' then total else 0 end) as paid")
    );

  // Последние операции склада
  const recentOps = await db('warehouse_ops')
    .join('products', 'products.id', 'warehouse_ops.product_id')
    .where('products.company_id', companyId)
    .orderBy('warehouse_ops.created_at', 'desc')
    .limit(5)
    .select(
      'warehouse_ops.op_type',
      'warehouse_ops.quantity',
      'warehouse_ops.created_at',
      'products.name as product_name'
    );

  // Непрочитанные уведомления
  const [unread] = await db('client_notifications')
    .where({ user_id: req.user.id, is_read: false })
    .count('* as count');

  const invoicePending = Number(invoiceBilling?.pending || 0);
  const chargesPending = Number(chargeBilling?.pending || 0);
  const pending = invoicePending;

  res.json({
    stock: stockAgg,
    active_orders_count: Number(ordersCount?.total || 0),
    recent_orders: activeOrders,
    billing: {
      pending,
      paid: Number(invoiceBilling?.paid || 0),
      total_invoices: Number(invoiceBilling?.total_invoices || 0),
      source: 'invoices',
      charges_pending: chargesPending,
      charges_paid: Number(chargeBilling?.paid || 0),
    },
    recent_ops: recentOps,
    unread_notifications: Number(unread?.count || 0),
  });
});

// GET /api/client/orders/:id/documents
router.get('/orders/:id/documents', clientOnly, async (req, res) => {
  const order = await db('orders')
    .join('companies', 'companies.id', 'orders.company_id')
    .where('orders.id', req.params.id)
    .select('orders.id', 'orders.company_id', 'orders.number', 'companies.user_id')
    .first();

  if (!order) return res.status(404).json({ error: 'Заявка не найдена' });
  if (req.user.role === 'client' && order.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }

  const documents = await db('order_documents')
    .leftJoin('users', 'users.id', 'order_documents.uploaded_by')
    .where('order_documents.order_id', req.params.id)
    .select('order_documents.*', 'users.full_name as uploaded_by_name')
    .orderBy('order_documents.created_at', 'desc');

  // Для карточки заявки показываем только документы, созданные именно по этой заявке.
  // Раньше сюда могли попадать счета/акты компании из других заявок, из-за чего
  // в новой заявке отображались старые документы.
  const invoices = await db('invoices')
    .where('invoices.order_id', order.id)
    .whereIn('invoices.type', ['invoice', 'act'])
    .whereIn('invoices.status', ['sent', 'paid', 'deferred'])
    .orderBy('created_at', 'desc')
    .select('id', 'order_id', 'number', 'type', 'status', 'total', 'pdf_url', 'created_at')
    .limit(20);

  res.json({
    documents: documents.map((doc) => ({
      ...doc,
      kind: doc.doc_type,
      doc_label: ({
        acceptance_sheet: 'Лист приёмки',
        technical_task: 'ТЗ',
        order_sheet: 'Лист',
        identification_sheet: 'Лист идентификации',
      }[doc.doc_type] || doc.doc_type || 'Документ'),
      download_url: doc.file_url || null,
    })),
    invoices: invoices.map((doc) => ({
      ...doc,
      kind: doc.type,
      doc_label: doc.type === 'invoice' ? 'Счёт' : 'Акт',
      download_url: doc.pdf_url || null,
    })),
  });
});

// GET /api/client/documents
// Сводный список документов клиента по всем его заявкам.
router.get('/documents', clientOnly, async (req, res) => {
  const orders = await db('orders')
    .join('companies', 'companies.id', 'orders.company_id')
    .where('companies.user_id', req.user.id)
    .select(
      'orders.id',
      'orders.number',
      'orders.created_at',
      'companies.name as company_name'
    )
    .orderBy('orders.created_at', 'desc');

  if (!orders.length) return res.json([]);

  const orderIds = orders.map((order) => order.id);
  const ordersById = new Map(orders.map((order) => [order.id, order]));

  const uploadedDocs = await db('order_documents')
    .leftJoin('users', 'users.id', 'order_documents.uploaded_by')
    .whereIn('order_documents.order_id', orderIds)
    .select('order_documents.*', 'users.full_name as uploaded_by_name')
    .orderBy('order_documents.created_at', 'desc');

  const invoices = await db('invoices')
    .whereIn('invoices.order_id', orderIds)
    .whereIn('invoices.type', ['invoice', 'act'])
    .whereIn('invoices.status', ['sent', 'paid', 'deferred'])
    .orderBy('created_at', 'desc')
    .select('id', 'order_id', 'number', 'type', 'status', 'total', 'pdf_url', 'created_at');

  const uploadedItems = uploadedDocs.map((doc) => {
    const order = ordersById.get(doc.order_id);
    return {
      ...doc,
      kind: doc.doc_type,
      doc_label: ({
        acceptance_sheet: 'Лист приёмки',
        technical_task: 'ТЗ',
        order_sheet: 'Лист',
        identification_sheet: 'Лист идентификации',
      }[doc.doc_type] || doc.doc_type || 'Документ'),
      order_number: order?.number,
      company_name: order?.company_name,
      download_url: doc.file_url,
    };
  });

  const invoiceItems = invoices.map((doc) => {
    const order = ordersById.get(doc.order_id);
    return {
      ...doc,
      kind: doc.type,
      doc_label: doc.type === 'invoice' ? 'Счёт' : 'Акт',
      order_number: order?.number,
      company_name: order?.company_name,
      download_url: doc.pdf_url || null,
    };
  });

  res.json([...uploadedItems, ...invoiceItems]);
});

// PATCH /api/client/orders/:id/items/:itemId — изменить количество товара в заявке
router.patch('/orders/:id/items/:itemId', clientOnly, async (req, res) => {
  const order = await db('orders')
    .join('companies', 'companies.id', 'orders.company_id')
    .where('orders.id', req.params.id)
    .select('orders.id', 'orders.company_id', 'orders.status', 'orders.stage', 'companies.user_id')
    .first();

  if (!order) return res.status(404).json({ error: 'Заявка не найдена' });
  if (req.user.role === 'client' && order.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }
  if (order.status !== 'active' || !['new', 'approval'].includes(order.stage)) {
    return res.status(400).json({ error: 'Редактировать количество можно только у новой заявки на этапе согласования' });
  }

  const current = await db('order_items')
    .where({ id: req.params.itemId, order_id: req.params.id })
    .first();
  if (!current) return res.status(404).json({ error: 'Позиция не найдена' });

  const nextQuantity = Number(req.body.quantity || 0);
  if (!Number.isInteger(nextQuantity) || nextQuantity < 1) {
    return res.status(400).json({ error: 'Количество должно быть целым и больше нуля' });
  }

  const [item] = await db('order_items')
    .where({ id: req.params.itemId, order_id: req.params.id })
    .update({ quantity: nextQuantity, updated_at: new Date() })
    .returning('*');

  res.json(item);
});

// DELETE /api/client/products/:id
router.delete('/products/:id', clientOnly, async (req, res) => {
  const product = await db('products')
    .join('companies', 'companies.id', 'products.company_id')
    .leftJoin('stock', 'stock.product_id', 'products.id')
    .where('products.id', req.params.id)
    .select(
      'products.*',
      'companies.user_id',
      db.raw('coalesce(stock.quantity, 0) as quantity'),
      db.raw('coalesce(stock.defect_qty, 0) as defect_qty'),
      db.raw('coalesce(stock.reserved_qty, 0) as reserved_qty')
    )
    .first();

  if (!product) return res.status(404).json({ error: 'Товар не найден' });
  if (req.user.role === 'client' && product.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }

  const [itemRow] = await db('order_items').where({ product_id: req.params.id }).count('* as total');
  const [opsRow] = await db('warehouse_ops').where({ product_id: req.params.id }).count('* as total');

  if (Number(product.quantity || 0) > 0) {
    return res.status(400).json({ error: 'Нельзя удалить товар с остатком на складе' });
  }
  if (Number(itemRow?.total || 0) > 0 || Number(opsRow?.total || 0) > 0) {
    return res.status(400).json({ error: 'Нельзя удалить товар, который уже участвовал в заявках или операциях' });
  }

  await deleteStoredFileByUrl(product.photo_url);

  await db.transaction(async (trx) => {
    await trx('product_barcodes').where({ product_id: req.params.id }).delete();
    await trx('stock').where({ product_id: req.params.id }).delete();
    await trx('products').where({ id: req.params.id }).delete();
  });

  res.json({ ok: true });
});

// DELETE /api/client/orders/:id
router.delete('/orders/:id', clientOnly, async (req, res) => {
  const order = await db('orders')
    .join('companies', 'companies.id', 'orders.company_id')
    .where('orders.id', req.params.id)
    .select('orders.*', 'companies.user_id')
    .first();

  if (!order) return res.status(404).json({ error: 'Заявка не найдена' });
  if (req.user.role === 'client' && order.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }

  if (order.status !== 'active' || !['new', 'approval'].includes(order.stage)) {
    return res.status(400).json({ error: 'Удалить можно только новую заявку на этапе согласования' });
  }

  const documents = await db('order_documents')
    .where({ order_id: req.params.id })
    .select('id', 'file_url');
  const invoices = await db('invoices')
    .where({ order_id: req.params.id })
    .select('id', 'pdf_url');

  await Promise.all([
    ...documents.map((doc) => deleteStoredFileByUrl(doc.file_url)),
    ...invoices.map((invoice) => deleteStoredFileByUrl(invoice.pdf_url)),
  ]);

  await db.transaction(async (trx) => {
    await trx('client_notifications').where({ order_id: req.params.id }).delete();
    await trx('notifications').where({ order_id: req.params.id }).delete().catch(() => {});
    await trx('order_documents').where({ order_id: req.params.id }).delete();
    await trx('invoice_items').whereIn('invoice_id', invoices.map((invoice) => invoice.id)).delete();
    await trx('invoices').where({ order_id: req.params.id }).delete();
    await trx('charges').where({ order_id: req.params.id }).delete();
    await trx('order_marketplace_shipments').where({ order_id: req.params.id }).delete();
    await trx('order_services').where({ order_id: req.params.id }).delete();
    await trx('order_consumables').where({ order_id: req.params.id }).delete();
    await trx('order_items').where({ order_id: req.params.id }).delete();
    await trx('order_stages').where({ order_id: req.params.id }).delete();
    await trx('supply_details').where({ order_id: req.params.id }).delete();
    await trx('logistics').where({ order_id: req.params.id }).delete();
    await trx('supply_item_ops').where({ order_id: req.params.id }).delete().catch(() => {});
    await trx('orders').where({ id: req.params.id }).delete();
  });

  res.json({ ok: true });
});

// ── Уведомления ──────────────────────────────────────────────────

// GET /api/client/notifications
router.get('/notifications', clientOnly, async (req, res) => {
  const notifications = await db('client_notifications')
    .where({ user_id: req.user.id })
    .orderBy('created_at', 'desc')
    .limit(50);
  res.json(notifications);
});

// GET /api/client/notifications/unread-count
router.get('/notifications/unread-count', clientOnly, async (req, res) => {
  const [row] = await db('client_notifications')
    .where({ user_id: req.user.id, is_read: false })
    .count('* as count');
  res.json({ count: Number(row?.count || 0) });
});

// PATCH /api/client/notifications/read-all
router.patch('/notifications/read-all', clientOnly, async (req, res) => {
  await db('client_notifications')
    .where({ user_id: req.user.id, is_read: false })
    .update({ is_read: true });
  res.json({ ok: true });
});

// PATCH /api/client/notifications/:id/read
router.patch('/notifications/:id/read', clientOnly, async (req, res) => {
  await db('client_notifications')
    .where({ id: req.params.id, user_id: req.user.id })
    .update({ is_read: true });
  res.json({ ok: true });
});

module.exports = router;
