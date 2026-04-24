const express = require('express');
const { z } = require('zod');
const db = require('../db/knex');
const { auth, role } = require('../middleware/auth');
const { generateInvoicePdf, generateProposalPdf } = require('../services/pdf');
const {
  deleteInvoiceDocument,
  createOrderBillingDocument,
} = require('../services/document-sync');
const { decorateShipmentsWithBilling, marketplaceLabel } = require('../services/order-billing-items');

const router = express.Router();
router.use(auth);

// ── СЧЕТА ───────────────────────────────────────────────────────

// GET /api/invoices
router.get('/', async (req, res) => {
  const { company_id, status, order_id } = req.query;
  let q = db('invoices')
    .join('companies', 'companies.id', 'invoices.company_id')
    .leftJoin('orders', 'orders.id', 'invoices.order_id')
    .select('invoices.*', 'companies.name as company_name', 'orders.number as order_number')
    .orderBy('invoices.number', 'desc');
  if (req.user.role === 'client') {
    q = q.where('companies.user_id', req.user.id);
    q = q.whereIn('invoices.status', ['sent', 'paid', 'deferred']);
  } else if (company_id) {
    q = q.where('invoices.company_id', company_id);
  }
  if (status) q = q.where('invoices.status', status);
  if (order_id) q = q.where('invoices.order_id', order_id);
  res.json(await q);
});

// GET /api/invoices/:id — с позициями
router.get('/:id', async (req, res) => {
  const invoice = await db('invoices')
    .join('companies', 'companies.id', 'invoices.company_id')
    .leftJoin('orders', 'orders.id', 'invoices.order_id')
    .where('invoices.id', req.params.id)
    .select(
      'invoices.*',
      'companies.name as company_name',
      'companies.inn as company_inn',
      'orders.number as order_number'
    )
    .first();
  if (!invoice) return res.status(404).json({ error: 'Не найдено' });
  if (req.user.role === 'client') {
    const allowed = await db('companies').where({ id: invoice.company_id, user_id: req.user.id }).first();
    if (!allowed) return res.status(403).json({ error: 'Доступ запрещён' });
  }
  const items = await db('invoice_items').where({ invoice_id: req.params.id }).orderBy('sort_order');
  res.json({ ...invoice, items });
});

// POST /api/invoices/generate — авто-формирование из услуг + начислений
router.post('/generate', role(['admin', 'manager']), async (req, res) => {
  const schema = z.object({
    company_id: z.string().uuid(),
    period_from: z.string(),
    period_to: z.string(),
    type: z.enum(['invoice', 'act']).default('invoice'),
    tax_rate: z.number().min(0).max(100).default(0),
    notes: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const { company_id, period_from, period_to, type, tax_rate, notes } = parsed.data;

  // Собираем услуги за период
  const orderServices = await db('order_services')
    .join('orders', 'orders.id', 'order_services.order_id')
    .join('service_templates', 'service_templates.id', 'order_services.service_id')
    .where('orders.company_id', company_id)
    .whereBetween('order_services.created_at', [period_from, period_to + ' 23:59:59'])
    .select(
      'order_services.*',
      'service_templates.name as service_name',
      'service_templates.unit as service_unit',
      'orders.number as order_number'
    );

  // Собираем начисления за период
  const charges = await db('charges')
    .where('company_id', company_id)
    .where('status', '!=', 'paid')
    .whereBetween('created_at', [period_from, period_to + ' 23:59:59']);

  const orderConsumables = await db('order_consumables')
    .join('orders', 'orders.id', 'order_consumables.order_id')
    .join('consumables', 'consumables.id', 'order_consumables.consumable_id')
    .where('orders.company_id', company_id)
    .whereBetween('order_consumables.created_at', [period_from, period_to + ' 23:59:59'])
    .select(
      'order_consumables.*',
      'consumables.name as consumable_name',
      'consumables.unit as consumable_unit'
    );

  const rawShipments = await db('order_marketplace_shipments')
    .join('orders', 'orders.id', 'order_marketplace_shipments.order_id')
    .where('orders.company_id', company_id)
    .whereBetween('order_marketplace_shipments.created_at', [period_from, period_to + ' 23:59:59'])
    .select('order_marketplace_shipments.*');
  const orderShipments = await decorateShipmentsWithBilling(rawShipments, company_id);

  if (
    orderServices.length === 0 &&
    charges.length === 0 &&
    orderConsumables.length === 0 &&
    orderShipments.length === 0
  ) {
    return res.status(400).json({ error: 'Нет данных за выбранный период' });
  }

  const invoiceItems = [];
  let sort = 0;

  // Группируем услуги по названию
  const svcGroups = {};
  for (const s of orderServices) {
    const key = s.service_name;
    if (!svcGroups[key]) svcGroups[key] = { desc: key, unit: s.service_unit, qty: 0, price: s.unit_price, total: 0 };
    svcGroups[key].qty += Number(s.quantity);
    svcGroups[key].total += Number(s.total);
  }
  for (const g of Object.values(svcGroups)) {
    invoiceItems.push({
      description: g.desc,
      quantity: g.qty,
      unit: g.unit === 'per_unit' ? 'ед.' : g.unit === 'per_order' ? 'заявка' : g.unit,
      unit_price: g.price,
      total: g.total,
      source_type: 'service',
      sort_order: sort++,
    });
  }

  // Начисления
  for (const c of charges) {
    invoiceItems.push({
      description: c.description || c.tariff_code,
      quantity: c.quantity,
      unit: 'ед.',
      unit_price: c.unit_price,
      total: c.total,
      source_type: 'charge',
      source_id: c.id,
      sort_order: sort++,
    });
  }

  for (const c of orderConsumables) {
    const quantity = Number(c.quantity || 0);
    const unitPrice = Number(c.unit_price || 0);
    invoiceItems.push({
      description: `Расходник: ${c.consumable_name}${c.comment ? ` — ${c.comment}` : ''}`,
      quantity,
      unit: c.consumable_unit || 'шт.',
      unit_price: unitPrice,
      total: Number(c.total || quantity * unitPrice),
      source_type: 'manual',
      source_id: null,
      sort_order: sort++,
    });
  }

  for (const shipment of orderShipments) {
    const placesCount = Number(shipment.places_count || 0);
    const unitPrice = Number(shipment.billing_unit_price || 0);
    invoiceItems.push({
      description: [
        `Логистика ${marketplaceLabel(shipment.marketplace)}`,
        shipment.warehouse_name,
        shipment.places_count ? `${shipment.places_count} мест` : '',
        shipment.quantity ? `${shipment.quantity} ед.` : '',
        shipment.ship_date ? new Date(shipment.ship_date).toLocaleDateString('ru-RU') : '',
        shipment.note || '',
      ].filter(Boolean).join(' — '),
      quantity: placesCount,
      unit: shipment.billing_rate === 'per_pallet' ? 'палет' : 'короб',
      unit_price: unitPrice,
      total: Number(shipment.billing_total || (placesCount * unitPrice) || 0),
      source_type: 'manual',
      source_id: null,
      sort_order: sort++,
    });
  }

  const subtotal = invoiceItems.reduce((s, i) => s + Number(i.total), 0);
  const total = subtotal * (1 + tax_rate / 100);

  const invoice = await db.transaction(async trx => {
    const [inv] = await trx('invoices').insert({
      company_id, type, status: 'draft', period_from, period_to,
      subtotal, tax_rate, total, notes, created_by: req.user.id,
    }).returning('*');

    await trx('invoice_items').insert(invoiceItems.map(i => ({ ...i, invoice_id: inv.id })));

    // Помечаем начисления как confirmed
    if (charges.length) {
      await trx('charges').whereIn('id', charges.map(c => c.id)).update({ status: 'confirmed' });
    }

    return inv;
  });

  notifyNewInvoice({ invoice, companyId: company_id }).catch(() => {});

  res.status(201).json(invoice);
});

// PATCH /api/invoices/:id
router.patch('/:id', role(['admin', 'manager']), async (req, res) => {
  const parsed = z.object({
    status: z.enum(['draft', 'sent', 'paid', 'cancelled', 'deferred']).optional(),
    notes: z.string().nullable().optional(),
    tax_rate: z.coerce.number().min(0).max(100).optional(),
    period_from: z.string().nullable().optional(),
    period_to: z.string().nullable().optional(),
  }).safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const current = await db('invoices').where({ id: req.params.id }).first();
  if (!current) return res.status(404).json({ error: 'Не найдено' });

  const [inv] = await db('invoices').where({ id: req.params.id })
    .update({ ...parsed.data, updated_at: new Date() }).returning('*');

  if (current.status !== 'sent' && inv?.status === 'sent') {
    notifyNewInvoice({ invoice: inv, companyId: inv.company_id }).catch(() => {});
  }

  res.json(inv);
});

// DELETE /api/invoices/:id — удалить счет/акт
router.delete('/:id', role(['admin', 'manager']), async (req, res) => {
  const invoice = await deleteInvoiceDocument(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Не найдено' });
  res.json({ ok: true });
});

// POST /api/invoices/from-order — выставить счет клиенту по конкретной заявке
router.post('/from-order', role(['admin', 'manager']), async (req, res) => {
  const schema = z.object({
    order_id: z.string().uuid(),
    type: z.enum(['invoice', 'act']).default('invoice'),
    tax_rate: z.number().min(0).max(100).default(0),
    notes: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const { order_id, type, tax_rate, notes } = parsed.data;
  const order = await db('orders').where({ id: order_id }).first();
  if (!order) return res.status(404).json({ error: 'Заявка не найдена' });

  const invoice = await createOrderBillingDocument(order.id, {
    uploadedBy: req.user.id,
    type,
    notesOverride: notes || `Счет по заявке #${order.number}`,
    taxRate: Number(tax_rate || 0),
    notify: true,
  });

  if (!invoice) {
    return res.status(400).json({ error: 'По заявке нет позиций для выставления счета' });
  }
  res.status(201).json(invoice);
});

// PUT /api/invoices/:id/items — перезаписать позиции
router.put('/:id/items', role(['admin', 'manager']), async (req, res) => {
  const parsed = z.array(z.object({
    description: z.string().min(1),
    quantity: z.coerce.number().min(0),
    unit: z.string().min(1),
    unit_price: z.coerce.number().min(0),
    source_type: z.enum(['service', 'charge', 'manual']).optional(),
    source_id: z.string().uuid().nullable().optional(),
  })).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const items = parsed.data;

  await db.transaction(async trx => {
    await trx('invoice_items').where({ invoice_id: req.params.id }).delete();
    if (items.length) {
      await trx('invoice_items').insert(items.map((item, i) => ({
        ...item,
        total: Number(item.quantity) * Number(item.unit_price),
        source_type: item.source_type || 'manual',
        source_id: item.source_id || null,
        invoice_id: req.params.id,
        sort_order: i,
      })));
    }
    const subtotal = items.reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0);
    const inv = await trx('invoices').where({ id: req.params.id }).first();
    const total = subtotal * (1 + Number(inv.tax_rate) / 100);
    await trx('invoices').where({ id: req.params.id }).update({ subtotal, total, updated_at: new Date() });
  });
  res.json({ ok: true });
});

// GET /api/invoices/:id/pdf — генерация PDF
router.get('/:id/pdf', async (req, res) => {
  const invoice = await db('invoices')
    .join('companies', 'companies.id', 'invoices.company_id')
    .where('invoices.id', req.params.id)
    .select('invoices.*', 'companies.name as company_name', 'companies.inn as company_inn')
    .first();
  if (!invoice) return res.status(404).json({ error: 'Не найдено' });
  if (req.user.role === 'client') {
    const allowed = await db('companies').where({ id: invoice.company_id, user_id: req.user.id }).first();
    if (!allowed) return res.status(403).json({ error: 'Доступ запрещён' });
  }

  const items = await db('invoice_items').where({ invoice_id: req.params.id }).orderBy('sort_order');

  try {
    const { url, filePath } = await generateInvoicePdf(
      invoice,
      items,
      { name: invoice.company_name, inn: invoice.company_inn }
    );
    await db('invoices').where({ id: req.params.id }).update({ pdf_url: url });
    res.json({ url });
  } catch (err) {
    console.error('PDF error:', err);
    res.status(500).json({ error: 'Ошибка генерации PDF: ' + err.message });
  }
});

// ── КП ──────────────────────────────────────────────────────────

// GET /api/invoices/proposals
router.get('/proposals/list', role(['admin', 'manager']), async (req, res) => {
  const proposals = await db('proposals')
    .leftJoin('users', 'users.id', 'proposals.created_by')
    .select('proposals.*', 'users.full_name as manager_name')
    .orderBy('proposals.number', 'desc');
  res.json(proposals);
});

// GET /api/invoices/proposals/:id
router.get('/proposals/:id', async (req, res) => {
  const proposal = await db('proposals').where({ id: req.params.id }).first();
  if (!proposal) return res.status(404).json({ error: 'Не найдено' });
  const items = await db('proposal_items')
    .leftJoin('service_templates', 'service_templates.id', 'proposal_items.service_id')
    .where('proposal_items.proposal_id', req.params.id)
    .select('proposal_items.*', 'service_templates.description')
    .orderBy('proposal_items.sort_order');
  res.json({ ...proposal, items });
});

// POST /api/invoices/proposals — создать КП
router.post('/proposals', role(['admin', 'manager']), async (req, res) => {
  const schema = z.object({
    client_name: z.string().min(1),
    client_contact: z.string().optional(),
    client_phone: z.string().optional(),
    valid_until: z.string().optional(),
    notes: z.string().optional(),
    items: z.array(z.object({
      service_id: z.string().uuid().optional(),
      label: z.string().min(1),
      unit: z.string().default('ед.'),
      quantity: z.number().min(0),
      unit_price: z.number().min(0),
    })).min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const { items, ...data } = parsed.data;
  const total_monthly = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);

  const proposal = await db.transaction(async trx => {
    const [p] = await trx('proposals').insert({
      ...data,
      total_monthly,
      created_by: req.user.id,
    }).returning('*');

    await trx('proposal_items').insert(
      items.map((item, i) => ({
        ...item,
        total: item.quantity * item.unit_price,
        proposal_id: p.id,
        sort_order: i,
      }))
    );

    return p;
  });

  res.status(201).json(proposal);
});

// PATCH /api/invoices/proposals/:id
router.patch('/proposals/:id', role(['admin', 'manager']), async (req, res) => {
  const { items, ...data } = req.body;

  await db.transaction(async trx => {
    if (data) {
      await trx('proposals').where({ id: req.params.id }).update({ ...data, updated_at: new Date() });
    }
    if (items) {
      await trx('proposal_items').where({ proposal_id: req.params.id }).delete();
      const total_monthly = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
      await trx('proposal_items').insert(
        items.map((item, i) => ({
          ...item, total: item.quantity * item.unit_price,
          proposal_id: req.params.id, sort_order: i,
        }))
      );
      await trx('proposals').where({ id: req.params.id }).update({ total_monthly, updated_at: new Date() });
    }
  });

  res.json({ ok: true });
});

// GET /api/invoices/proposals/:id/pdf
router.get('/proposals/:id/pdf', async (req, res) => {
  const proposal = await db('proposals').where({ id: req.params.id }).first();
  if (!proposal) return res.status(404).json({ error: 'Не найдено' });

  const items = await db('proposal_items')
    .leftJoin('service_templates', 'service_templates.id', 'proposal_items.service_id')
    .where('proposal_items.proposal_id', req.params.id)
    .select('proposal_items.*', 'service_templates.description')
    .orderBy('proposal_items.sort_order');

  try {
    const { url } = await generateProposalPdf(proposal, items);
    await db('proposals').where({ id: req.params.id }).update({ pdf_url: url });
    res.json({ url });
  } catch (err) {
    console.error('PDF error:', err);
    res.status(500).json({ error: 'Ошибка генерации PDF: ' + err.message });
  }
});

module.exports = router;
