const express = require('express');
const { z } = require('zod');
const db = require('../db/knex');
const { auth, role } = require('../middleware/auth');

const router = express.Router();
router.use(auth);

const numericField = z.preprocess((value) => {
  if (value === '' || value == null) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') {
    const normalized = value.replace(',', '.').trim();
    if (!normalized) return undefined;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return value;
}, z.number().optional());

const productSchema = z.object({
  company_id: z.string().uuid().optional(),
  name: z.string().min(1),
  article: z.string().optional(),
  brand: z.string().optional(),
  color: z.string().optional(),
  size: z.string().optional(),
  weight_g: numericField,
  country: z.string().optional(),
  composition: z.string().optional(),
  dim_l: numericField,
  dim_w: numericField,
  dim_h: numericField,
});

const barcodeSchema = z.object({
  marketplace: z.enum(['wb', 'ozon', 'yandex', 'ff']),
  barcode: z.string().optional(),
  article_mp: z.string().optional(),
});

// GET /api/products?company_id=&marketplace=&search=
router.get('/', async (req, res) => {
  const { company_id, marketplace, search } = req.query;
  const page = Math.max(1, Number.parseInt(req.query.page || '1', 10) || 1);
  const limitRaw = Number.parseInt(req.query.limit || '', 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : null;

  const buildQuery = () => db('products')
    .leftJoin('stock', 'stock.product_id', 'products.id')
    .select(
      'products.*',
      db.raw(`(
        select pb.barcode
        from product_barcodes pb
        where pb.product_id = products.id
          and coalesce(nullif(trim(pb.barcode), ''), '') <> ''
        order by
          case
            when pb.marketplace = 'wb' then 0
            when pb.marketplace = 'ozon' then 1
            when pb.marketplace = 'yandex' then 2
            when pb.marketplace = 'ff' then 3
            else 4
          end,
          pb.created_at asc
        limit 1
      ) as barcode`),
      db.raw(`(
        select count(*)
        from product_barcodes pb_count
        where pb_count.product_id = products.id
      ) as barcodes_count`),
      db.raw('coalesce(stock.quantity, 0) as quantity'),
      db.raw('coalesce(stock.defect_qty, 0) as defect_qty'),
      db.raw('coalesce(stock.reserved_qty, 0) as reserved_qty'),
      db.raw('coalesce(stock.quantity, 0) - coalesce(stock.defect_qty, 0) - coalesce(stock.reserved_qty, 0) as available_qty')
    );

  let q = buildQuery().orderBy('products.name');

  // Клиент видит только свои товары
  if (req.user.role === 'client') {
    q = q.join('companies', 'companies.id', 'products.company_id')
      .where('companies.user_id', req.user.id);
  } else if (company_id) {
    q = q.where('products.company_id', company_id);
  }

  if (marketplace) {
    q = q.join('product_barcodes as pb', function() {
      this.on('pb.product_id', 'products.id').andOn('pb.marketplace', db.raw('?', [marketplace]));
    });
  }

  if (search) {
    const searchTokens = String(search)
      .trim()
      .split(/[\s·,;|/\\-]+/)
      .map((token) => token.trim())
      .filter(Boolean)
      .slice(0, 8);

    q = q.where(function() {
      if (!searchTokens.length) return;
      searchTokens.forEach((token, index) => {
        const clause = function() {
          this.whereILike('products.name', `%${token}%`)
            .orWhereILike('products.article', `%${token}%`)
            .orWhereExists(function() {
              this.select(db.raw('1'))
                .from('product_barcodes as pb_search')
                .whereRaw('pb_search.product_id = products.id')
                .where(function() {
                  this.whereILike('pb_search.barcode', `%${token}%`)
                    .orWhereILike('pb_search.article_mp', `%${token}%`);
                });
            });
        };

        if (index === 0) {
          this.where(clause);
        } else {
          this.andWhere(clause);
        }
      });
    });
  }

  if (!limit) {
    const products = await q;
    return res.json(products);
  }

  const totalRow = await q
    .clone()
    .clearSelect()
    .clearOrder()
    .countDistinct({ total: 'products.id' })
    .first();

  const total = Number(totalRow?.total || 0);
  const items = await q
    .clone()
    .offset((page - 1) * limit)
    .limit(limit);

  res.json({
    items,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

// GET /api/products/:id — с баркодами
router.get('/:id', async (req, res) => {
  const product = await db('products')
    .join('companies', 'companies.id', 'products.company_id')
    .leftJoin('stock', 'stock.product_id', 'products.id')
    .where('products.id', req.params.id)
    .select(
      'products.*',
      'companies.name as company_name',
      'companies.id as company_id',
      db.raw('coalesce(stock.quantity, 0) as quantity'),
      db.raw('coalesce(stock.defect_qty, 0) as defect_qty'),
      db.raw('coalesce(stock.reserved_qty, 0) as reserved_qty'),
      db.raw('coalesce(stock.quantity, 0) - coalesce(stock.defect_qty, 0) - coalesce(stock.reserved_qty, 0) as available_qty'),
      'stock.paid_storage'
    )
    .first();

  if (!product) return res.status(404).json({ error: 'Не найдено' });
  if (req.user.role === 'client') {
    const allowed = await db('companies').where({ id: product.company_id, user_id: req.user.id }).first();
    if (!allowed) return res.status(403).json({ error: 'Доступ запрещён' });
  }

  const barcodes = await db('product_barcodes').where({ product_id: req.params.id });
  const ops = await db('warehouse_ops')
    .leftJoin('orders', 'orders.id', 'warehouse_ops.order_id')
    .leftJoin('users', 'users.id', 'warehouse_ops.created_by')
    .where('warehouse_ops.product_id', req.params.id)
    .select(
      'warehouse_ops.*',
      'orders.number as order_number',
      'users.full_name as created_by_name'
    )
    .orderBy('warehouse_ops.created_at', 'desc')
    .limit(20);

  res.json({ ...product, barcodes, ops });
});

// POST /api/products
router.post('/', async (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const data = { ...parsed.data };
  if (typeof data.weight_g === 'number') data.weight_g = Math.round(data.weight_g);

  if (req.user.role === 'client') {
    const ownCompany = await db('companies')
      .where({ user_id: req.user.id })
      .orderByRaw('case when is_active then 0 else 1 end')
      .first();
    if (!ownCompany) return res.status(400).json({ error: 'Для клиента не найдена активная компания' });
    data.company_id = ownCompany.id;
  }

  if (!data.company_id) return res.status(400).json({ error: 'Не указан company_id' });

  const [product] = await db('products').insert(data).returning('*');

  // Создаём нулевой остаток
  await db('stock').insert({ product_id: product.id, quantity: 0, defect_qty: 0, reserved_qty: 0 });

  res.status(201).json(product);
});

// PATCH /api/products/:id
router.patch('/:id', async (req, res) => {
  const parsed = productSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const existing = await db('products').where({ id: req.params.id }).first();
  if (!existing) return res.status(404).json({ error: 'Не найдено' });
  if (req.user.role === 'client') {
    const allowed = await db('companies').where({ id: existing.company_id, user_id: req.user.id }).first();
    if (!allowed) return res.status(403).json({ error: 'Доступ запрещён' });
  }

  const updateData = { ...parsed.data };
  if (typeof updateData.weight_g === 'number') updateData.weight_g = Math.round(updateData.weight_g);
  if (req.user.role === 'client') delete updateData.company_id;

  const [product] = await db('products')
    .where({ id: req.params.id })
    .update({ ...updateData, updated_at: new Date() })
    .returning('*');
  res.json(product);
});

// DELETE /api/products/:id
router.delete('/:id', role(['admin', 'manager']), async (req, res) => {
  const stock = await db('stock').where({ product_id: req.params.id }).first();
  if (stock && stock.quantity > 0) {
    return res.status(400).json({ error: 'Нельзя удалить товар с остатком на складе' });
  }
  await db('products').where({ id: req.params.id }).delete();
  res.json({ ok: true });
});

// PUT /api/products/:id/barcodes — обновить все связи
router.put('/:id/barcodes', async (req, res) => {
  const barcodes = z.array(barcodeSchema).safeParse(req.body);
  if (!barcodes.success) return res.status(400).json({ error: barcodes.error.issues });

  if (req.user.role === 'client') {
    const existing = await db('products').where({ id: req.params.id }).first();
    if (!existing) return res.status(404).json({ error: 'Не найдено' });
    const allowed = await db('companies').where({ id: existing.company_id, user_id: req.user.id }).first();
    if (!allowed) return res.status(403).json({ error: 'Доступ запрещён' });
  }

  await db.transaction(async trx => {
    await trx('product_barcodes').where({ product_id: req.params.id }).delete();
    if (barcodes.data.length > 0) {
      await trx('product_barcodes').insert(
        barcodes.data.map(b => ({ ...b, product_id: req.params.id }))
      );
    }
  });

  const result = await db('product_barcodes').where({ product_id: req.params.id });
  res.json(result);
});

module.exports = router;
