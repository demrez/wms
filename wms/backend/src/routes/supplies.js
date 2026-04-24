const express = require('express');
const { z } = require('zod');
const db = require('../db/knex');
const { auth, role } = require('../middleware/auth');

const router = express.Router();
router.use(auth, role(['admin', 'manager']));

const UNIT_LABELS = { pcs: 'шт', m: 'м', kg: 'кг', roll: 'рул', pack: 'упак' };

router.get('/', async (req, res) => {
  const items = await db('supply_items').where({ is_active: true }).orderBy('name')
    .select('*', db.raw('stock_qty < min_stock as low_stock'));
  res.json(items);
});

router.get('/low-stock', async (req, res) => {
  const items = await db('supply_items').where({ is_active: true }).whereRaw('stock_qty < min_stock');
  res.json(items);
});

router.post('/', async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    sku: z.string().optional(),
    unit: z.enum(['pcs','m','kg','roll','pack']).default('pcs'),
    cost_price: z.number().min(0).default(0),
    sale_price: z.number().min(0).default(0),
    min_stock: z.number().min(0).default(0),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const [item] = await db('supply_items').insert(parsed.data).returning('*');
  res.status(201).json(item);
});

router.patch('/:id', async (req, res) => {
  const [item] = await db('supply_items').where({ id: req.params.id })
    .update({ ...req.body, updated_at: new Date() }).returning('*');
  if (!item) return res.status(404).json({ error: 'Не найдено' });
  res.json(item);
});

router.post('/:id/ops', async (req, res) => {
  const schema = z.object({
    op_type: z.enum(['in','out','adjust']),
    quantity: z.number().positive(),
    note: z.string().optional(),
    order_id: z.string().uuid().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const item = await db('supply_items').where({ id: req.params.id }).first();
  if (!item) return res.status(404).json({ error: 'Не найдено' });

  const { op_type, quantity, note, order_id } = parsed.data;
  if (op_type === 'out' && item.stock_qty < quantity) {
    return res.status(400).json({ error: `Недостаточно. Есть: ${item.stock_qty} ${UNIT_LABELS[item.unit]}` });
  }

  await db.transaction(async trx => {
    await trx('supply_item_ops').insert({
      item_id: req.params.id, op_type, quantity, note,
      order_id: order_id || null, created_by: req.user.id,
    });
    let newQty = Number(item.stock_qty);
    if (op_type === 'in')     newQty += quantity;
    if (op_type === 'out')    newQty -= quantity;
    if (op_type === 'adjust') newQty  = quantity;
    await trx('supply_items').where({ id: req.params.id })
      .update({ stock_qty: newQty, updated_at: new Date() });
  });

  const updated = await db('supply_items').where({ id: req.params.id }).first();
  res.json(updated);
});

router.get('/:id/ops', async (req, res) => {
  const ops = await db('supply_item_ops')
    .leftJoin('users', 'users.id', 'supply_item_ops.created_by')
    .leftJoin('orders', 'orders.id', 'supply_item_ops.order_id')
    .where('supply_item_ops.item_id', req.params.id)
    .select('supply_item_ops.*', 'users.full_name as created_by_name', 'orders.number as order_number')
    .orderBy('supply_item_ops.created_at', 'desc').limit(200);
  res.json(ops);
});

module.exports = router;
