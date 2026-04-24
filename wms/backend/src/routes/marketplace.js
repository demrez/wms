const express = require('express');
const { z } = require('zod');
const db = require('../db/knex');
const { auth, role } = require('../middleware/auth');
const mpSync = require('../services/mp-sync');
const wb    = require('../services/wb');
const ozon  = require('../services/ozon');
const yandex = require('../services/yandex');

const router = express.Router();
router.use(auth);

async function getClientCompanyIds(userId) {
  const rows = await db('companies')
    .where({ user_id: userId, is_active: true })
    .select('id');
  return rows.map((row) => row.id);
}

async function canAccessCompany(req, companyId) {
  if (!companyId) return false;
  if (req.user.role !== 'client') return true;
  const owned = await db('companies')
    .where({ id: companyId, user_id: req.user.id, is_active: true })
    .first();
  return Boolean(owned);
}

async function getConnectionForUser(req, id) {
  let q = db('mp_connections').where('mp_connections.id', id);
  if (req.user.role === 'client') {
    q = q
      .join('companies', 'companies.id', 'mp_connections.company_id')
      .where('companies.user_id', req.user.id)
      .select('mp_connections.*');
  }
  return q.first();
}

// ── Подключения ──────────────────────────────────────────────────

// GET /api/mp/connections?company_id=
router.get('/connections', async (req, res) => {
  const { company_id } = req.query;
  let q = db('mp_connections')
    .join('companies', 'companies.id', 'mp_connections.company_id')
    .select('mp_connections.*', 'companies.name as company_name')
    .orderBy('mp_connections.created_at', 'desc');

  if (req.user.role === 'client') {
    q = q.join('users', 'users.id', 'companies.user_id').where('users.id', req.user.id);
  } else if (company_id) {
    q = q.where('mp_connections.company_id', company_id);
  }

  if (company_id && req.user.role === 'client') {
    q = q.where('mp_connections.company_id', company_id);
  }

  const conns = await q;
  // Маскируем API-ключи — показываем только последние 6 символов
  res.json(conns.map(c => ({
    ...c,
    api_key: c.api_key ? '•••••••••' + c.api_key.slice(-6) : null,
  })));
});

// POST /api/mp/connections
router.post('/connections', role(['admin', 'manager', 'client']), async (req, res) => {
  const schema = z.object({
    company_id: z.string().uuid().optional(),
    marketplace: z.enum(['wb', 'ozon', 'yandex']),
    api_key: z.string().min(10),
    client_id: z.string().optional(),
    campaign_id: z.string().optional(),
    warehouse_id: z.string().optional(),
    warehouse_name: z.string().optional(),
    auto_sync_stocks: z.boolean().default(false),
    auto_import_products: z.boolean().default(false),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  let data = parsed.data;

  if (req.user.role === 'client') {
    let companyId = data.company_id;
    if (!companyId) {
      const ids = await getClientCompanyIds(req.user.id);
      companyId = ids[0];
    }
    if (!companyId || !(await canAccessCompany(req, companyId))) {
      return res.status(403).json({ error: 'Можно подключать только свою компанию' });
    }
    data = { ...data, company_id: companyId };
  }

  if (!data.company_id) {
    return res.status(400).json({ error: 'Не указан company_id' });
  }

  const [conn] = await db('mp_connections')
    .insert(data)
    .onConflict(['company_id', 'marketplace'])
    .merge(data)
    .returning('*');

  res.status(201).json({ ...conn, api_key: '•••' + conn.api_key.slice(-6) });
});

// PATCH /api/mp/connections/:id
router.patch('/connections/:id', role(['admin', 'manager', 'client']), async (req, res) => {
  const existing = await getConnectionForUser(req, req.params.id);
  if (!existing) return res.status(404).json({ error: 'Не найдено' });

  const data = { ...req.body, updated_at: new Date() };
  // Если api_key не менялся (маска) — не обновляем
  if (data.api_key?.startsWith('•')) delete data.api_key;
  if (req.user.role === 'client') delete data.company_id;

  const [conn] = await db('mp_connections').where({ id: req.params.id })
    .update(data).returning('*');
  if (!conn) return res.status(404).json({ error: 'Не найдено' });
  res.json({ ...conn, api_key: '•••' + conn.api_key.slice(-6) });
});

// DELETE /api/mp/connections/:id
router.delete('/connections/:id', role(['admin', 'client']), async (req, res) => {
  if (req.user.role === 'client') {
    const conn = await getConnectionForUser(req, req.params.id);
    if (!conn) return res.status(404).json({ error: 'Не найдено' });
  }
  await db('mp_connections').where({ id: req.params.id }).delete();
  res.json({ ok: true });
});

// POST /api/mp/connections/:id/test — проверить токен
router.post('/connections/:id/test', role(['admin', 'manager', 'client']), async (req, res) => {
  const conn = await getConnectionForUser(req, req.params.id);
  if (!conn) return res.status(404).json({ error: 'Не найдено' });

  let result;
  if (conn.marketplace === 'wb') {
    result = await wb.testConnection(conn.api_key);
    if (result.ok && !conn.warehouse_id && result.warehouses?.length) {
      // Автоматически подставляем первый склад
      await db('mp_connections').where({ id: conn.id }).update({
        warehouse_id: String(result.warehouses[0].id),
        warehouse_name: result.warehouses[0].name,
      });
    }
  } else if (conn.marketplace === 'ozon') {
    result = await ozon.testConnection(conn.client_id, conn.api_key);
  } else if (conn.marketplace === 'yandex') {
    result = await yandex.testConnection(conn.api_key, conn.campaign_id);
  }

  res.json(result);
});

// ── Склады МП (для настройки) ────────────────────────────────────

// GET /api/mp/connections/:id/warehouses
router.get('/connections/:id/warehouses', role(['admin', 'manager', 'client']), async (req, res) => {
  const conn = await getConnectionForUser(req, req.params.id);
  if (!conn) return res.status(404).json({ error: 'Не найдено' });

  try {
    let warehouses = [];
    if (conn.marketplace === 'wb') warehouses = await wb.getWarehouses(conn.api_key);
    else if (conn.marketplace === 'ozon') warehouses = await ozon.getWarehouses(conn.client_id, conn.api_key);
    else if (conn.marketplace === 'yandex') warehouses = await yandex.getWarehouses(conn.api_key, conn.campaign_id);
    res.json(warehouses);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Синхронизация товаров ────────────────────────────────────────

// POST /api/mp/connections/:id/import-products
router.post('/connections/:id/import-products', role(['admin', 'manager', 'client']), async (req, res) => {
  const conn = await getConnectionForUser(req, req.params.id);
  if (!conn) return res.status(404).json({ error: 'Не найдено' });

  try {
    const result = await mpSync.importProducts(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/mp/connections/:id/push-stocks
router.post('/connections/:id/push-stocks', role(['admin', 'manager', 'client']), async (req, res) => {
  const conn = await getConnectionForUser(req, req.params.id);
  if (!conn) return res.status(404).json({ error: 'Не найдено' });

  try {
    const result = await mpSync.pushStocks(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Привязанные товары ───────────────────────────────────────────

// GET /api/mp/products?connection_id=&company_id=
router.get('/products', async (req, res) => {
  const { connection_id, company_id } = req.query;
  let q = db('mp_products')
    .join('products', 'products.id', 'mp_products.product_id')
    .join('mp_connections', 'mp_connections.id', 'mp_products.connection_id')
    .join('stock', 'stock.product_id', 'products.id')
    .select(
      'mp_products.*',
      'products.name as product_name',
      'products.article',
      db.raw('coalesce(mp_products.mp_photo_url, products.photo_url) as photo_url'),
      'mp_connections.marketplace',
      db.raw('GREATEST(0, stock.quantity - stock.defect_qty - stock.reserved_qty) as available_qty')
    )
    .orderBy('products.name');

  if (req.user.role === 'client') {
    q = q
      .join('companies', 'companies.id', 'mp_connections.company_id')
      .where('companies.user_id', req.user.id);
  }

  if (connection_id) q = q.where('mp_products.connection_id', connection_id);
  if (company_id) q = q.where('mp_connections.company_id', company_id);

  res.json(await q);
});

// ── Лог синхронизаций ────────────────────────────────────────────

// GET /api/mp/sync-log?connection_id=&limit=50
router.get('/sync-log', role(['admin', 'manager', 'client']), async (req, res) => {
  const { connection_id, limit = 50 } = req.query;
  let q = db('mp_sync_log')
    .join('mp_connections', 'mp_connections.id', 'mp_sync_log.connection_id')
    .join('companies', 'companies.id', 'mp_connections.company_id')
    .select(
      'mp_sync_log.*',
      'mp_connections.marketplace',
      'companies.name as company_name'
    )
    .orderBy('mp_sync_log.created_at', 'desc')
    .limit(Number(limit));

  if (req.user.role === 'client') {
    q = q.where('companies.user_id', req.user.id);
  }
  if (connection_id) q = q.where('mp_sync_log.connection_id', connection_id);
  res.json(await q);
});

// ── Создание поставок FBO ────────────────────────────────────────

// POST /api/mp/create-supply
router.post('/create-supply', role(['admin', 'manager']), async (req, res) => {
  const schema = z.object({
    order_id: z.string().uuid(),
    connection_id: z.string().uuid(),
    supply_type: z.enum(['fbo', 'fbs']).default('fbo'),
    supply_name: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const { order_id, connection_id, supply_type, supply_name } = parsed.data;
  const conn = await db('mp_connections').where({ id: connection_id }).first();
  if (!conn) return res.status(404).json({ error: 'Подключение не найдено' });

  const order = await db('orders')
    .join('companies', 'companies.id', 'orders.company_id')
    .where('orders.id', order_id)
    .select('orders.*', 'companies.name as company_name')
    .first();
  if (!order) return res.status(404).json({ error: 'Заявка не найдена' });

  // Создаём задачу
  const [task] = await db('mp_supply_tasks').insert({
    order_id,
    connection_id,
    supply_type,
    status: 'pending',
    created_by: req.user.id,
  }).returning('*');

  try {
    let mpResponse;
    const name = supply_name || `WMS #${order.number} — ${order.company_name}`;

    if (conn.marketplace === 'wb') {
      mpResponse = await wb.createSupply(conn.api_key, name);
    } else if (conn.marketplace === 'ozon') {
      // Получаем товары из заявки
      const items = await db('order_items')
        .join('mp_products', function() {
          this.on('mp_products.product_id', 'order_items.product_id')
            .andOn('mp_products.connection_id', db.raw('?', [connection_id]));
        })
        .where('order_items.order_id', order_id)
        .select('mp_products.mp_sku', 'order_items.quantity');

      mpResponse = await ozon.createSupply(conn.client_id, conn.api_key, {
        warehouseId: conn.warehouse_id,
        items: items.map(i => ({ product_id: Number(i.mp_sku), quantity: i.quantity })),
        arrivalDate: new Date().toISOString(),
      });
    }

    await db('mp_supply_tasks').where({ id: task.id }).update({
      mp_supply_id: mpResponse?.id || mpResponse?.result?.supplyOrderId || '',
      status: 'created',
      mp_response: JSON.stringify(mpResponse),
    });

    // Сохраняем номер поставки в логистику заявки
    if (mpResponse?.id) {
      await db('logistics').where({ order_id })
        .update({ pass_number: mpResponse.id })
        .catch(() => {}); // logistics может не существовать
    }

    await db('mp_sync_log').insert({
      connection_id,
      action: 'create_supply',
      status: 'ok',
      items_count: 1,
    });

    res.json({ ok: true, supply_id: mpResponse?.id, task_id: task.id });

  } catch (err) {
    await db('mp_supply_tasks').where({ id: task.id }).update({
      status: 'error',
      error_msg: err.message,
    });
    await db('mp_sync_log').insert({
      connection_id,
      action: 'create_supply',
      status: 'error',
      error_msg: err.message,
    });
    res.status(400).json({ error: err.message });
  }
});

// GET /api/mp/supply-tasks?order_id=
router.get('/supply-tasks', async (req, res) => {
  const { order_id } = req.query;
  let q = db('mp_supply_tasks')
    .join('mp_connections', 'mp_connections.id', 'mp_supply_tasks.connection_id')
    .select('mp_supply_tasks.*', 'mp_connections.marketplace', 'mp_connections.warehouse_name')
    .orderBy('mp_supply_tasks.created_at', 'desc');
  if (order_id) q = q.where('mp_supply_tasks.order_id', order_id);
  res.json(await q);
});

module.exports = router;
