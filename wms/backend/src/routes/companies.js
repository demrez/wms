const express = require('express');
const { z } = require('zod');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const db = require('../db/knex');
const { auth, role } = require('../middleware/auth');
const { docUpload } = require('../middleware/upload');

const router = express.Router();
router.use(auth);

const companySchema = z.object({
  name: z.string().min(1),
  legal_name: z.string().optional(),
  inn: z.string().optional(),
  contact_name: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  telegram_notifications: z.boolean().optional(),
  telegram_chat_id: z.string().optional(),
  user_id: z.string().uuid().optional(),
  client_email: z.string().email().optional(),
  client_password: z.string().min(6).optional(),
});

async function resolveClientUser(trx, { company, name, contact_name, phone, client_email, client_password }) {
  const email = String(client_email || '').trim().toLowerCase();
  const password = String(client_password || '');

  if (!email && !password) return company?.user_id || null;

  if (!email && password) {
    if (!company?.user_id) throw new Error('Для смены пароля укажите e-mail клиента');
    const hash = await bcrypt.hash(password, 10);
    await trx('users')
      .where({ id: company.user_id })
      .update({ password_hash: hash, updated_at: new Date() });
    await trx('companies')
      .where({ id: company.id })
      .update({ client_password: password, updated_at: new Date() });
    return company.user_id;
  }

  const existingByEmail = await trx('users').where({ email }).first();
  if (existingByEmail && existingByEmail.role !== 'client' && existingByEmail.id !== company?.user_id) {
    throw new Error('Этот e-mail уже используется сотрудником. Укажите другой e-mail для клиента');
  }

  if (existingByEmail) {
    const patch = {
      role: 'client',
      full_name: contact_name || existingByEmail.full_name || name || null,
      phone: phone || existingByEmail.phone || null,
      updated_at: new Date(),
    };
    if (password) patch.password_hash = await bcrypt.hash(password, 10);
    await trx('users').where({ id: existingByEmail.id }).update(patch);
    if (company?.id) {
      await trx('companies')
        .where({ id: company.id })
        .update({ client_password: password || company.client_password || null, updated_at: new Date() });
    }
    return existingByEmail.id;
  }

  if (!password) throw new Error('Для нового клиента нужно указать пароль');

  const hash = await bcrypt.hash(password, 10);
  const [createdUser] = await trx('users')
    .insert({
      email,
      password_hash: hash,
      role: 'client',
      full_name: contact_name || name || null,
      phone: phone || null,
      is_active: true,
    })
    .returning('*');
  if (company?.id) {
    await trx('companies')
      .where({ id: company.id })
      .update({ client_password: password, updated_at: new Date() });
  }
  return createdUser.id;
}

function parseImportedProducts(filePath) {
  const parserPath = path.join(__dirname, '..', '..', 'scripts', 'parse_company_products_xlsx.py');
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

// Клиент видит только свои компании, менеджер/админ — все
const getQuery = (req) => {
  const q = db('companies').where('companies.is_active', true);
  if (req.user.role === 'client') {
    q.where('companies.user_id', req.user.id);
  }
  return q;
};

// GET /api/companies
router.get('/', async (req, res) => {
  const companies = await getQuery(req)
    .leftJoin('users', 'users.id', 'companies.user_id')
    .select('companies.*', 'users.email as client_email')
    .orderBy('name');
  res.json(companies);
});

// GET /api/companies/:id — с агрегатами
router.get('/:id', async (req, res) => {
  const company = await getQuery(req)
    .leftJoin('users', 'users.id', 'companies.user_id')
    .select('companies.*', 'users.email as client_email')
    .where('companies.id', req.params.id)
    .first();
  if (!company) return res.status(404).json({ error: 'Не найдено' });

  const [stockAgg] = await db('stock')
    .join('products', 'products.id', 'stock.product_id')
    .where('products.company_id', req.params.id)
    .sum('stock.quantity as total_qty')
    .sum('stock.defect_qty as defect_qty')
    .count('products.id as products_count');

  const [ordersAgg] = await db('orders')
    .where('company_id', req.params.id)
    .select(
      db.raw('count(*) as total_orders'),
      db.raw("sum(case when status = 'active' then 1 else 0 end) as active_orders")
    );

  const products = await db('products')
    .leftJoin('stock', 'stock.product_id', 'products.id')
    .where('products.company_id', req.params.id)
    .select(
      'products.id',
      'products.name',
      'products.article',
      'products.brand',
      'products.color',
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
    )
    .orderBy('products.name');

  const recentOrders = await db('orders')
    .where('orders.company_id', req.params.id)
    .select('orders.*')
    .orderBy('orders.created_at', 'desc')
    .limit(10);

  res.json({
    ...company,
    stock: stockAgg,
    orders: ordersAgg,
    products,
    recent_orders: recentOrders,
  });
});

// POST /api/companies/:id/products/import
router.post('/:id/products/import', role(['admin', 'manager']), (req, res, next) => {
  req.uploadSubdir = 'imports';
  next();
}, docUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

  try {
    const company = await db('companies')
      .where({ id: req.params.id, is_active: true })
      .first();
    if (!company) {
      return res.status(404).json({ error: 'Компания не найдена' });
    }

    const rows = parseImportedProducts(req.file.path);
    if (!rows.length) {
      return res.status(400).json({ error: 'В файле нет строк для импорта' });
    }

    const stats = { created: 0, updated: 0, skipped: 0, barcodes: 0 };

    await db.transaction(async (trx) => {
      for (const row of rows) {
        const article = String(row.article || '').trim();
        const name = String(row.name || '').trim();
        const barcode = String(row.barcode || '').trim();

        if (!isValidImportedProductName(name)) {
          stats.skipped += 1;
          continue;
        }

        let product = null;
        if (article) {
          product = await trx('products').where({ company_id: company.id, article }).first();
        }
        if (!product) {
          product = await trx('products')
            .whereRaw('company_id = ? and lower(trim(name)) = lower(trim(?))', [company.id, name])
            .first();
        }

        if (product) {
          const [updated] = await trx('products')
            .where({ id: product.id })
            .update({
              name,
              article: article || product.article,
              updated_at: new Date(),
            })
            .returning('*');
          product = updated;
          stats.updated += 1;
        } else {
          const [created] = await trx('products')
            .insert({
              company_id: company.id,
              name,
              article: article || null,
            })
            .returning('*');
          product = created;
          stats.created += 1;

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
      }
    });

    res.json({ ok: true, ...stats });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Не удалось импортировать товары' });
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

// POST /api/companies
router.post('/', role(['admin', 'manager']), async (req, res) => {
  const parsed = companySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  try {
    const company = await db.transaction(async (trx) => {
      const payload = parsed.data;
      const { client_email, client_password, ...companyPayload } = payload;
      const userId = await resolveClientUser(trx, {
        company: null,
        ...companyPayload,
        client_email,
        client_password,
      });
      const [createdCompany] = await trx('companies')
        .insert({ ...companyPayload, user_id: userId || companyPayload.user_id || null })
        .returning('*');

      const full = await trx('companies')
        .leftJoin('users', 'users.id', 'companies.user_id')
        .where('companies.id', createdCompany.id)
        .select('companies.*', 'users.email as client_email')
        .first();
      return full;
    });
    res.status(201).json(company);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Не удалось создать компанию' });
  }
});

// PATCH /api/companies/:id
router.patch('/:id', role(['admin', 'manager']), async (req, res) => {
  const parsed = companySchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  try {
    const company = await db.transaction(async (trx) => {
      const current = await trx('companies').where({ id: req.params.id }).first();
      if (!current) return null;

      const { client_email, client_password, ...companyPatch } = parsed.data;
      const hasAccessFields = client_email !== undefined || client_password !== undefined;
      let resolvedUserId = current.user_id;
      if (hasAccessFields) {
        resolvedUserId = await resolveClientUser(trx, {
          company: current,
          name: companyPatch.name || current.name,
          contact_name: companyPatch.contact_name || current.contact_name,
          phone: companyPatch.phone || current.phone,
          client_email,
          client_password,
        });
      }

      const [updated] = await trx('companies')
        .where({ id: req.params.id })
        .update({
          ...companyPatch,
          user_id: hasAccessFields ? resolvedUserId : current.user_id,
          updated_at: new Date(),
        })
        .returning('*');

      const full = await trx('companies')
        .leftJoin('users', 'users.id', 'companies.user_id')
        .where('companies.id', updated.id)
        .select('companies.*', 'users.email as client_email')
        .first();
      return full;
    });

    if (!company) return res.status(404).json({ error: 'Не найдено' });
    res.json(company);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Не удалось обновить компанию' });
  }
});

// DELETE /api/companies/:id (мягкое удаление)
router.delete('/:id', role('admin'), async (req, res) => {
  try {
    const result = await db.transaction(async (trx) => {
      const company = await trx('companies').where({ id: req.params.id }).first();
      if (!company) {
        return { status: 404, body: { error: 'Компания не найдена' } };
      }

      const [ordersAgg] = await trx('orders')
        .where({ company_id: req.params.id })
        .count('* as total_orders');
      const ordersCount = Number(ordersAgg?.total_orders || 0);
      if (ordersCount > 0) {
        return {
          status: 400,
          body: { error: 'Нельзя удалить компанию, пока у неё есть заявки. Сначала закройте или перенесите все заявки.' },
        };
      }

      const userId = company.user_id;
      const [otherCompanies] = await trx('companies')
        .where({ user_id: userId })
        .whereNot({ id: req.params.id })
        .count('* as total');

      await trx('companies').where({ id: req.params.id }).delete();

      if (userId && Number(otherCompanies?.total || 0) === 0) {
        await trx('users').where({ id: userId, role: 'client' }).update({ is_active: false, updated_at: new Date() });
      }

      return { status: 200, body: { ok: true } };
    });

    return res.status(result.status).json(result.body);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Не удалось удалить компанию' });
  }
});

module.exports = router;
