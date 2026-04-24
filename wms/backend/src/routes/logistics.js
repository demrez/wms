const express = require('express');
const db = require('../db/knex');
const { z } = require('zod');
const { auth } = require('../middleware/auth');
const {
  buildWarehouseReference,
  DEFAULT_WAREHOUSE_GROUPS,
  normalize,
  formatWarehouseLabel,
} = require('../services/logistics-reference');

const router = express.Router();
router.use(auth);

async function loadActiveWarehouseRecords() {
  return db('logistics_warehouses')
    .where({ is_active: true })
    .orderBy([{ column: 'marketplace', order: 'asc' }, { column: 'sort_order', order: 'asc' }, { column: 'name', order: 'asc' }])
    .select('*');
}

router.get('/reference', async (req, res) => {
  const companyQuery = db('companies').where({ is_active: true });
  if (req.user.role === 'client') {
    companyQuery.where({ user_id: req.user.id });
  }

  const companies = await companyQuery.select('id', 'name', 'address').orderBy('name');
  const companyIds = companies.map((company) => company.id);

  let pickupAddresses = companies.map((company) => company.address).filter(Boolean);
  if (companyIds.length > 0) {
    const supplyRows = await db('orders')
      .join('supply_details', 'supply_details.order_id', 'orders.id')
      .whereIn('orders.company_id', companyIds)
      .whereNotNull('supply_details.pickup_address')
      .distinct('supply_details.pickup_address');
    pickupAddresses = pickupAddresses.concat(supplyRows.map((row) => row.pickup_address));
  }

  const logisticsRows = await db('logistics')
    .whereNotNull('dest_warehouse')
    .distinct('dest_warehouse');
  const mpWarehouseRows = await db('mp_connections')
    .whereNotNull('warehouse_name')
    .where('is_active', true)
    .distinct('warehouse_name');
  const warehouseRecords = await loadActiveWarehouseRecords();

  res.json({
    pickup_addresses: normalize(pickupAddresses),
    ...buildWarehouseReference({
      warehouseNames: [
        ...logisticsRows.map((row) => row.dest_warehouse),
        ...mpWarehouseRows.map((row) => row.warehouse_name),
      ],
      warehouseRecords,
      fallbackGroups: DEFAULT_WAREHOUSE_GROUPS,
    }),
  });
});

router.get('/warehouses', async (req, res) => {
  const rows = await db('logistics_warehouses')
    .orderBy([{ column: 'marketplace', order: 'asc' }, { column: 'sort_order', order: 'asc' }, { column: 'name', order: 'asc' }])
    .select('*');
  res.json(rows);
});

router.post('/warehouses', async (req, res) => {
  if (!['admin', 'manager'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Недостаточно прав' });
  }
  const schema = z.object({
    marketplace: z.enum(['wb', 'wb_region', 'ozon', 'yandex', 'other']),
    name: z.string().min(1).max(255),
    price_per_unit: z.number().nonnegative().default(0),
    price_per_pallet: z.number().nonnegative().default(0),
    sort_order: z.number().int().default(0),
    is_active: z.boolean().default(true),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const payload = {
    ...parsed.data,
    name: parsed.data.name.trim(),
  };

  const [row] = await db('logistics_warehouses')
    .insert(payload)
    .onConflict(['marketplace', 'name']).merge(payload)
    .returning('*');

  res.status(201).json(row);
});

router.patch('/warehouses/:id', async (req, res) => {
  if (!['admin', 'manager'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Недостаточно прав' });
  }
  const schema = z.object({
    marketplace: z.enum(['wb', 'wb_region', 'ozon', 'yandex', 'other']).optional(),
    name: z.string().min(1).max(255).optional(),
    price_per_unit: z.number().nonnegative().optional(),
    price_per_pallet: z.number().nonnegative().optional(),
    sort_order: z.number().int().optional(),
    is_active: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const payload = { ...parsed.data };
  if (payload.name) payload.name = payload.name.trim();

  const [row] = await db('logistics_warehouses')
    .where({ id: req.params.id })
    .update({ ...payload, updated_at: new Date() })
    .returning('*');
  if (!row) return res.status(404).json({ error: 'Не найдено' });
  res.json(row);
});

router.delete('/warehouses/:id', async (req, res) => {
  if (!['admin', 'manager'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Недостаточно прав' });
  }
  const [row] = await db('logistics_warehouses')
    .where({ id: req.params.id })
    .update({ is_active: false, updated_at: new Date() })
    .returning('*');
  if (!row) return res.status(404).json({ error: 'Не найдено' });
  res.json({ ok: true });
});

module.exports = router;
