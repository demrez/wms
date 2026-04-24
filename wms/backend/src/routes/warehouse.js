const express = require('express');
const { z } = require('zod');
const db = require('../db/knex');
const { auth, role } = require('../middleware/auth');

const router = express.Router();
router.use(auth);

// GET /api/warehouse/summary — сводка по компаниям (главная таблица склада)
router.get('/summary', async (req, res) => {
  let q = db('companies')
    .join('products', 'products.company_id', 'companies.id')
    .join('stock', 'stock.product_id', 'products.id')
    .where('companies.is_active', true)
    .groupBy('companies.id', 'companies.name')
    .select(
      'companies.id',
      'companies.name',
      db.raw('sum(stock.quantity) as quantity'),
      db.raw('sum(stock.defect_qty) as defect_qty'),
      db.raw('count(distinct products.id) as products_count')
    );

  if (req.user.role === 'client') {
    q = q.where('companies.user_id', req.user.id);
  }

  const rows = await q.orderBy('quantity', 'desc');

  res.json(rows);
});

// GET /api/warehouse/ops — история операций
router.get('/ops', async (req, res) => {
  const { op_type, product_id, company_id, from, to } = req.query;

  let q = db('warehouse_ops')
    .join('products', 'products.id', 'warehouse_ops.product_id')
    .join('companies', 'companies.id', 'products.company_id')
    .leftJoin('users', 'users.id', 'warehouse_ops.created_by')
    .leftJoin('orders', 'orders.id', 'warehouse_ops.order_id')
    .select(
      'warehouse_ops.*',
      'products.name as product_name',
      'products.article',
      'companies.name as company_name',
      'users.full_name as created_by_name',
      'orders.number as order_number'
    )
    .orderBy('warehouse_ops.created_at', 'desc');

  if (req.user.role === 'client') {
    q = q.where('companies.user_id', req.user.id);
  }
  if (op_type) q = q.where('warehouse_ops.op_type', op_type);
  if (product_id) q = q.where('warehouse_ops.product_id', product_id);
  if (company_id) q = q.where('companies.id', company_id);
  if (from) q = q.where('warehouse_ops.created_at', '>=', from);
  if (to) q = q.where('warehouse_ops.created_at', '<=', to);

  const ops = await q.limit(500);
  res.json(ops);
});

// GET /api/warehouse/defects — товары с браком
router.get('/defects', async (req, res) => {
  let q = db('stock')
    .join('products', 'products.id', 'stock.product_id')
    .join('companies', 'companies.id', 'products.company_id')
    .where('stock.defect_qty', '>', 0)
    .select(
      'stock.*',
      'products.name as product_name',
      'products.article',
      'products.photo_url',
      'companies.name as company_name'
    );

  if (req.user.role === 'client') {
    q = q.where('companies.user_id', req.user.id);
  }

  const defects = await q.orderBy('stock.defect_qty', 'desc');

  res.json(defects);
});

// POST /api/warehouse/ops — ручная операция (приход/списание/брак)
router.post('/ops', role(['admin', 'manager']), async (req, res) => {
  const schema = z.object({
    product_id: z.string().uuid(),
    op_type: z.enum(['in', 'out', 'defect', 'defect_return', 'write_off']),
    quantity: z.number().int().positive(),
    note: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const { product_id, op_type, quantity, note } = parsed.data;

  const stock = await db('stock').where({ product_id }).first();
  if (!stock) return res.status(404).json({ error: 'Товар не найден' });

  // Проверяем достаточность остатка для расходных операций
  if (['out', 'write_off'].includes(op_type) && stock.quantity < quantity) {
    return res.status(400).json({ error: 'Недостаточно остатка' });
  }
  if (op_type === 'defect_return' && stock.defect_qty < quantity) {
    return res.status(400).json({ error: 'Недостаточно брака' });
  }

  await db.transaction(async trx => {
    await trx('warehouse_ops').insert({
      product_id,
      op_type,
      quantity,
      note,
      created_by: req.user.id,
    });

    const updates = {};
    if (op_type === 'in') updates.quantity = stock.quantity + quantity;
    if (op_type === 'out' || op_type === 'write_off') updates.quantity = stock.quantity - quantity;
    if (op_type === 'defect') {
      updates.defect_qty = stock.defect_qty + quantity;
      updates.quantity = stock.quantity - quantity;
    }
    if (op_type === 'defect_return') {
      updates.defect_qty = stock.defect_qty - quantity;
      updates.quantity = stock.quantity + quantity;
    }
    updates.updated_at = new Date();

    await trx('stock').where({ product_id }).update(updates);
  });

  const updatedStock = await db('stock').where({ product_id }).first();
  res.json(updatedStock);
});

// PATCH /api/warehouse/paid-storage/:productId — переключить платное хранение
router.patch('/paid-storage/:productId', role(['admin', 'manager']), async (req, res) => {
  const { paid_storage } = req.body;
  await db('stock').where({ product_id: req.params.productId })
    .update({ paid_storage: Boolean(paid_storage), updated_at: new Date() });
  res.json({ ok: true });
});

module.exports = router;
