const express = require('express');
const { z } = require('zod');
const db = require('../db/knex');
const { auth, role } = require('../middleware/auth');
const billing = require('../services/billing');
const { syncBillingDocuments } = require('../services/document-sync');

const router = express.Router();
router.use(auth);

// GET /api/billing/tariffs
router.get('/tariffs', async (req, res) => {
  const tariffs = await db('tariffs').where({ is_active: true }).orderBy('code');
  res.json(tariffs);
});

// POST /api/billing/tariffs — создать услугу
router.post('/tariffs', role(['admin', 'manager']), async (req, res) => {
  const schema = z.object({
    code: z.string().min(2),
    name: z.string().min(1),
    description: z.string().optional(),
    unit: z.string().min(1),
    price: z.number().nonnegative(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const [tariff] = await db('tariffs').insert({
    ...parsed.data,
    is_active: true,
  }).returning('*');
  res.status(201).json(tariff);
});

// PATCH /api/billing/tariffs/:code — обновить глобальный тариф
router.patch('/tariffs/:code', role(['admin', 'manager']), async (req, res) => {
  const schema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    unit: z.string().min(1).optional(),
    price: z.number().nonnegative().optional(),
    is_active: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const [tariff] = await db('tariffs').where({ code: req.params.code })
    .update({ ...parsed.data, updated_at: new Date() }).returning('*');
  res.json(tariff);
});

// DELETE /api/billing/tariffs/:code — мягко скрыть услугу
router.delete('/tariffs/:code', role(['admin', 'manager']), async (req, res) => {
  const [tariff] = await db('tariffs').where({ code: req.params.code })
    .update({ is_active: false, updated_at: new Date() }).returning('*');
  if (!tariff) return res.status(404).json({ error: 'Не найдено' });
  res.json({ ok: true });
});

// GET /api/billing/company-tariffs/:companyId
router.get('/company-tariffs/:companyId', role(['admin', 'manager']), async (req, res) => {
  const rows = await db('company_tariffs').where({ company_id: req.params.companyId });
  res.json(rows);
});

// PUT /api/billing/company-tariffs/:companyId — установить/удалить инд. тариф
router.put('/company-tariffs/:companyId', role('admin'), async (req, res) => {
  const { tariff_code, price } = req.body;
  if (price === null || price === undefined) {
    // Удаляем кастомный тариф — вернётся к глобальному
    await db('company_tariffs')
      .where({ company_id: req.params.companyId, tariff_code }).delete();
    return res.json({ ok: true, reset: true });
  }

  const [row] = await db('company_tariffs')
    .insert({ company_id: req.params.companyId, tariff_code, price })
    .onConflict(['company_id', 'tariff_code']).merge()
    .returning('*');
  res.json(row);
});

// GET /api/billing/charges?company_id=&status=&from=&to=
router.get('/charges', async (req, res) => {
  const { company_id, status, from, to } = req.query;

  let q = db('charges')
    .join('companies', 'companies.id', 'charges.company_id')
    .leftJoin('orders', 'orders.id', 'charges.order_id')
    .select(
      'charges.*',
      'companies.name as company_name',
      'orders.number as order_number',
      'orders.type as order_type'
    )
    .orderBy('charges.created_at', 'desc');

  // Клиент видит только свои начисления
  if (req.user.role === 'client') {
    q = q.join('users', 'users.id', 'companies.user_id').where('users.id', req.user.id);
  } else if (company_id) {
    q = q.where('charges.company_id', company_id);
  }

  if (status) q = q.where('charges.status', status);
  if (from)   q = q.where('charges.created_at', '>=', from);
  if (to)     q = q.where('charges.created_at', '<=', to);

  const charges = await q.limit(1000);
  res.json(charges);
});

// GET /api/billing/documents?company_id=&type=&status=&payment_status=&from=&to=&search=
router.get('/documents', async (req, res) => {
  const { company_id, type, status, payment_status, from, to, search } = req.query;

  let q = db('orders')
    .join('companies', 'companies.id', 'orders.company_id')
    .leftJoin('charges', 'charges.order_id', 'orders.id')
    .groupBy(
      'orders.id',
      'orders.number',
      'orders.type',
      'orders.stage',
      'orders.status',
      'orders.created_at',
      'companies.id',
      'companies.name',
      'companies.user_id'
    )
    .select(
      'orders.id as order_id',
      'orders.number as order_number',
      'orders.type as order_type',
      'orders.stage as order_stage',
      'orders.status as order_status',
      'orders.created_at',
      'companies.id as company_id',
      'companies.name as company_name',
      db.raw('count(charges.id) as charges_count'),
      db.raw('coalesce(sum(charges.total), 0) as total_amount'),
      db.raw("coalesce(sum(case when charges.status = 'paid' then charges.total else 0 end), 0) as paid_amount"),
      db.raw("coalesce(sum(case when charges.status = 'pending' then charges.total else 0 end), 0) as pending_amount"),
      db.raw("coalesce(sum(case when charges.status = 'confirmed' then charges.total else 0 end), 0) as confirmed_amount"),
      db.raw('max(charges.created_at) as last_charge_at')
    )
    .orderBy('orders.created_at', 'desc');

  if (req.user.role === 'client') {
    q = q.where('companies.user_id', req.user.id);
  } else if (company_id) {
    q = q.where('orders.company_id', company_id);
  }

  if (type) q = q.where('orders.type', type);
  if (status) q = q.where('orders.status', status);
  if (from) q = q.where('orders.created_at', '>=', from);
  if (to) q = q.where('orders.created_at', '<=', to);
  if (search) {
    q = q.where(function () {
      this.whereILike('companies.name', `%${search}%`)
        .orWhereILike('orders.number', `%${search}%`);
    });
  }

  let rows = await q.limit(1000);
  rows = rows.map((row) => {
    const total = Number(row.total_amount || 0);
    const paid = Number(row.paid_amount || 0);
    const pending = Number(row.pending_amount || 0);
    const confirmed = Number(row.confirmed_amount || 0);

    let doc_status = 'draft';
    if (total > 0 && paid >= total) doc_status = 'paid';
    else if (pending > 0) doc_status = 'pending';
    else if (confirmed > 0) doc_status = 'confirmed';
    else if (total > 0) doc_status = 'issued';

    return {
      ...row,
      charges_count: Number(row.charges_count || 0),
      total_amount: total,
      paid_amount: paid,
      pending_amount: pending,
      confirmed_amount: confirmed,
      doc_status,
    };
  });

  if (payment_status) {
    rows = rows.filter((row) => row.doc_status === payment_status);
  }

  res.json(rows);
});

// GET /api/billing/orders/:orderId/charges — начисления по конкретной заявке
router.get('/orders/:orderId/charges', async (req, res) => {
  let q = db('charges')
    .join('companies', 'companies.id', 'charges.company_id')
    .leftJoin('orders', 'orders.id', 'charges.order_id')
    .where('charges.order_id', req.params.orderId)
    .select(
      'charges.*',
      'companies.name as company_name',
      'orders.number as order_number',
      'orders.type as order_type'
    )
    .orderBy('charges.created_at', 'asc');

  if (req.user.role === 'client') {
    q = q.where('companies.user_id', req.user.id);
  }

  const charges = await q;
  const summary = charges.reduce((acc, charge) => {
    const total = Number(charge.total || 0);
    acc.total += total;
    if (charge.status === 'paid') acc.paid += total;
    else acc.pending += total;
    return acc;
  }, { total: 0, paid: 0, pending: 0 });

  res.json({ items: charges, summary });
});

// GET /api/billing/summary — сводка по всем компаниям
router.get('/summary', role(['admin', 'manager']), async (req, res) => {
  const rows = await db('charges')
    .join('companies', 'companies.id', 'charges.company_id')
    .groupBy('charges.company_id', 'companies.name')
    .select(
      'charges.company_id',
      'companies.name as company_name',
      db.raw('sum(charges.total) as total_charged'),
      db.raw("sum(case when charges.status = 'paid' then charges.total else 0 end) as total_paid"),
      db.raw("sum(case when charges.status != 'paid' then charges.total else 0 end) as total_pending"),
      db.raw('count(*) as charges_count')
    )
    .orderBy('total_pending', 'desc');

  res.json(rows);
});

// POST /api/billing/charges — ручное начисление
router.post('/charges', role(['admin', 'manager']), async (req, res) => {
  const schema = z.object({
    company_id: z.string().uuid(),
    tariff_code: z.string(),
    description: z.string().optional(),
    quantity: z.number().int().positive(),
    order_id: z.string().uuid().optional(),
    unit_price: z.number().nonnegative().optional(),
    discount: z.number().min(0).max(100).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const charge = await billing.createCharge({
    companyId: parsed.data.company_id,
    orderId: parsed.data.order_id,
    tariffCode: parsed.data.tariff_code,
    description: parsed.data.description,
    quantity: parsed.data.quantity,
    unitPrice: parsed.data.unit_price,
    discount: parsed.data.discount,
    createdBy: req.user.id,
  });
  res.status(201).json(charge);
});

// PATCH /api/billing/charges/:id — редактирование начисления
router.patch('/charges/:id', role(['admin', 'manager']), async (req, res) => {
  const schema = z.object({
    description: z.string().min(1).optional(),
    quantity: z.number().int().positive().optional(),
    unit_price: z.number().nonnegative().optional(),
    discount: z.number().min(0).max(100).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const current = await db('charges').where({ id: req.params.id }).first();
  if (!current) return res.status(404).json({ error: 'Начисление не найдено' });

  const quantity = parsed.data.quantity ?? Number(current.quantity || 0);
  const unitPrice = parsed.data.unit_price ?? Number(current.unit_price || 0);
  const discount = parsed.data.discount ?? Number(current.discount || 0);
  const total = Number((quantity * unitPrice).toFixed(2));

  const [charge] = await db('charges')
    .where({ id: req.params.id })
    .update({
      ...(parsed.data.description ? { description: parsed.data.description } : {}),
      quantity,
      unit_price: unitPrice,
      discount,
      total,
    })
    .returning('*');

  res.json(charge);
});

// PATCH /api/billing/charges/:id/status — изменить статус оплаты
router.patch('/charges/:id/status', role(['admin', 'manager']), async (req, res) => {
  const { status } = req.body;
  if (!['pending', 'confirmed', 'paid'].includes(status)) {
    return res.status(400).json({ error: 'Неверный статус' });
  }
  const [charge] = await db('charges').where({ id: req.params.id })
    .update({ status }).returning('*');
  res.json(charge);
});

// DELETE /api/billing/charges/:id — удалить начисление из заявки
router.delete('/charges/:id', role(['admin', 'manager']), async (req, res) => {
  const current = await db('charges').where({ id: req.params.id }).first();
  if (!current) return res.status(404).json({ error: 'Начисление не найдено' });

  await db('charges').where({ id: req.params.id }).delete();

  if (current.order_id) {
    syncBillingDocuments(current.order_id, {
      uploadedBy: req.user.id,
      force: false,
      notify: false,
    }).catch((err) => {
      console.error('Billing document sync error:', err);
    });
  }

  res.json({ ok: true, order_id: current.order_id || null });
});

// PATCH /api/billing/charges/bulk-confirm — подтвердить все pending начисления компании
router.patch('/charges/bulk-confirm', role(['admin', 'manager']), async (req, res) => {
  const { company_id } = req.body;
  const count = await db('charges')
    .where({ company_id, status: 'pending' })
    .update({ status: 'confirmed' });
  res.json({ ok: true, updated: count });
});

module.exports = router;
