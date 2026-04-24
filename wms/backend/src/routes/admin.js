const express = require('express');
const { z } = require('zod');
const db = require('../db/knex');
const { auth, role } = require('../middleware/auth');

const router = express.Router();
router.use(auth);
router.use(role(['admin', 'manager']));

const consumableSchema = z.object({
  code: z.string().min(2),
  name: z.string().min(1),
  category: z.string().optional(),
  unit: z.string().min(1),
  price: z.number().nonnegative(),
  stock_qty: z.number().int().nonnegative().default(0),
  min_qty: z.number().int().nonnegative().default(0),
  comment: z.string().optional(),
});

router.get('/consumables', async (req, res) => {
  const rows = await db('consumables')
    .where({ is_active: true })
    .orderBy([{ column: 'category', order: 'asc' }, { column: 'name', order: 'asc' }]);
  res.json(rows);
});

router.post('/consumables', async (req, res) => {
  const parsed = consumableSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const [row] = await db('consumables').insert(parsed.data).returning('*');
  res.status(201).json(row);
});

router.patch('/consumables/:id', async (req, res) => {
  const parsed = consumableSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const [row] = await db('consumables')
    .where({ id: req.params.id })
    .update({ ...parsed.data, updated_at: new Date() })
    .returning('*');
  if (!row) return res.status(404).json({ error: 'Не найдено' });
  res.json(row);
});

router.delete('/consumables/:id', async (req, res) => {
  const [row] = await db('consumables')
    .where({ id: req.params.id })
    .update({ is_active: false, updated_at: new Date() })
    .returning('*');
  if (!row) return res.status(404).json({ error: 'Не найдено' });
  res.json({ ok: true });
});

module.exports = router;
