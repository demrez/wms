const express = require('express');
const { z } = require('zod');
const db = require('../db/knex');
const { auth, role } = require('../middleware/auth');
const { syncBillingDocuments } = require('../services/document-sync');

const router = express.Router();
router.use(auth);

const CATEGORY_ALIASES = {
  receiving: 'receiving',
  reception: 'receiving',
  '\u043f\u0440\u0438\u0435\u043c\u043a\u0430': 'receiving',
  '\u043f\u0440\u0438\u0451\u043c\u043a\u0430': 'receiving',
  packing: 'packing',
  pack: 'packing',
  '\u0443\u043f\u0430\u043a\u043e\u0432\u043a\u0430': 'packing',
  labeling: 'labeling',
  label: 'labeling',
  '\u043c\u0430\u0440\u043a\u0438\u0440\u043e\u0432\u043a\u0430': 'labeling',
  '\u0441\u0442\u0438\u043a\u0435\u0440\u043e\u0432\u043a\u0430': 'labeling',
  photo: 'photo',
  '\u0444\u043e\u0442\u043e': 'photo',
  '\u0444\u043e\u0442\u043e\u0444\u0438\u043a\u0441\u0430\u0446\u0438\u044f': 'photo',
  logistics: 'logistics',
  '\u043b\u043e\u0433\u0438\u0441\u0442\u0438\u043a\u0430': 'logistics',
  storage: 'storage',
  '\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u0435': 'storage',
  other: 'other',
  '\u043f\u0440\u043e\u0447\u0435\u0435': 'other',
};

const UNIT_ALIASES = {
  per_unit: 'per_unit',
  unit: 'per_unit',
  '\u0435\u0434': 'per_unit',
  '\u0435\u0434.': 'per_unit',
  '\u0448\u0442': 'per_unit',
  '\u0448\u0442.': 'per_unit',
  per_order: 'per_order',
  order: 'per_order',
  '\u0437\u0430\u044f\u0432\u043a\u0430': 'per_order',
  '\u0437\u0430 \u0437\u0430\u044f\u0432\u043a\u0443': 'per_order',
  per_kg: 'per_kg',
  kg: 'per_kg',
  '\u043a\u0433': 'per_kg',
  '\u043a\u0433.': 'per_kg',
  per_m3: 'per_m3',
  m3: 'per_m3',
  '\u043c3': 'per_m3',
  '\u043c^3': 'per_m3',
  '\u043c\u00b3': 'per_m3',
  per_day: 'per_day',
  day: 'per_day',
  '\u0434\u0435\u043d\u044c': 'per_day',
  '\u0432 \u0434\u0435\u043d\u044c': 'per_day',
};

function trimToNull(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function formatServiceDisplayName(service) {
  const name = String(service?.name || '').trim();
  const comment = String(service?.comment || service?.description || '').trim();
  if (!comment) return name;
  if (name.includes(`(${comment})`)) return name;
  return `${name} (${comment})`;
}

function normalizeCategory(value) {
  const key = String(value || '').trim().toLowerCase();
  return CATEGORY_ALIASES[key] || 'other';
}

function normalizeUnit(value) {
  const key = String(value || '').trim().toLowerCase();
  return UNIT_ALIASES[key] || 'per_unit';
}

function parsePrice(value) {
  if (value == null || value === '') return 0;
  const normalized = String(value)
    .replace(/\s+/g, '')
    .replace(/,/g, '.')
    .replace(/[^\d.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function parseInteger(value) {
  if (value == null || value === '') return 0;
  const parsed = Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function splitDelimitedLine(line, delimiter) {
  const result = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === delimiter && !quoted) {
      result.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  result.push(current.trim());
  return result;
}

function parseSheetTable(rawText) {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  const delimiter = lines.some((line) => line.includes('\t'))
    ? '\t'
    : lines.some((line) => line.includes(';'))
      ? ';'
      : ',';

  const rows = lines.map((line) => splitDelimitedLine(line, delimiter));
  if (!rows.length) return [];

  const header = rows[0].map((cell) => String(cell || '').trim().toLowerCase());
  const nameIndex = header.findIndex((cell) => ['name', '\u0443\u0441\u043b\u0443\u0433\u0430', '\u043d\u0430\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u043d\u0438\u0435'].includes(cell));
  const categoryIndex = header.findIndex((cell) => ['category', '\u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u044f'].includes(cell));
  const unitIndex = header.findIndex((cell) => ['unit', '\u0435\u0434\u0438\u043d\u0438\u0446\u0430', '\u0442\u0430\u0440\u0438\u0444'].includes(cell));
  const priceIndex = header.findIndex((cell) => ['base_price', 'price', '\u0446\u0435\u043d\u0430', '\u0442\u0430\u0440\u0438\u0444, \u0440'].includes(cell));
  const sortIndex = header.findIndex((cell) => ['sort_order', 'sort', '\u043f\u043e\u0440\u044f\u0434\u043e\u043a'].includes(cell));
  const commentIndex = header.findIndex((cell) => ['comment', '\u043a\u043e\u043c\u043c\u0435\u043d\u0442\u0430\u0440\u0438\u0439', '\u043f\u0440\u0438\u043c\u0435\u0447\u0430\u043d\u0438\u0435', 'description', '\u043e\u043f\u0438\u0441\u0430\u043d\u0438\u0435'].includes(cell));

  const hasHeader = nameIndex !== -1 || categoryIndex !== -1 || unitIndex !== -1 || priceIndex !== -1 || commentIndex !== -1;
  const dataRows = hasHeader ? rows.slice(1) : rows;

  return dataRows
    .map((row, index) => {
      const fallbackName = trimToNull(row[0]);
      const name = trimToNull(nameIndex >= 0 ? row[nameIndex] : fallbackName);
      if (!name) return null;
      return {
        name,
        category: normalizeCategory(categoryIndex >= 0 ? row[categoryIndex] : ''),
        unit: normalizeUnit(unitIndex >= 0 ? row[unitIndex] : ''),
        base_price: parsePrice(priceIndex >= 0 ? row[priceIndex] : ''),
        sort_order: parseInteger(sortIndex >= 0 ? row[sortIndex] : index),
        description: trimToNull(commentIndex >= 0 ? row[commentIndex] : ''),
      };
    })
    .filter(Boolean);
}

function normalizeGoogleSheetUrl(sheetUrl) {
  const raw = String(sheetUrl || '').trim();
  if (!raw) return null;
  if (!raw.includes('docs.google.com/spreadsheets')) return raw;
  const url = new URL(raw);
  const gid = url.searchParams.get('gid');
  const match = url.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
  if (!match) return raw;
  return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv${gid ? `&gid=${gid}` : ''}`;
}

async function loadImportSource({ sheetUrl, rawText }) {
  const inline = trimToNull(rawText);
  if (inline) return inline;

  const targetUrl = normalizeGoogleSheetUrl(sheetUrl);
  if (!targetUrl) return '';

  const response = await fetch(targetUrl, {
    headers: { Accept: 'text/csv,text/plain;q=0.9,*/*;q=0.8' },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Не удалось загрузить таблицу (${response.status})`);
  }
  return text;
}

// ── Каталог услуг ───────────────────────────────────────────────

// GET /api/services — список всех шаблонов с расходниками
router.get('/', async (req, res) => {
  const services = await db('service_templates')
    .where({ is_active: true })
    .orderBy('sort_order')
    .select('*');

  const ids = services.map(s => s.id);
  const consumables = ids.length
    ? await db('service_consumables')
        .join('supply_items', 'supply_items.id', 'service_consumables.item_id')
        .whereIn('service_consumables.service_id', ids)
        .select('service_consumables.*', 'supply_items.name as item_name', 'supply_items.unit')
    : [];

  const cByService = {};
  consumables.forEach(c => {
    if (!cByService[c.service_id]) cByService[c.service_id] = [];
    cByService[c.service_id].push(c);
  });

  res.json(services.map(s => ({
    ...s,
    comment: s.description || null,
    display_name: formatServiceDisplayName(s),
    consumables: cByService[s.id] || [],
  })));
});

// POST /api/services
router.post('/', role(['admin', 'manager']), async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    category: z.enum(['receiving','packing','labeling','photo','logistics','storage','other']).default('other'),
    unit: z.enum(['per_unit','per_order','per_kg','per_m3','per_day']).default('per_unit'),
    base_price: z.number().min(0).default(0),
    sort_order: z.number().int().default(0),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const [svc] = await db('service_templates').insert(parsed.data).returning('*');
  res.status(201).json(svc);
});

router.post('/import', role(['admin', 'manager']), async (req, res) => {
  const parsed = z.object({
    sheet_url: z.string().url().optional(),
    raw_text: z.string().optional(),
    activate_missing: z.boolean().optional(),
  }).safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const sourceText = await loadImportSource(parsed.data);
  const rows = parseSheetTable(sourceText);
  if (!rows.length) {
    return res.status(400).json({ error: 'Не удалось распознать строки услуг в таблице' });
  }

  const existing = await db('service_templates').select('id', 'name', 'is_active');
  const existingByName = new Map(
    existing.map((item) => [String(item.name || '').trim().toLowerCase(), item])
  );

  let created = 0;
  let updated = 0;
  const touchedIds = [];

  await db.transaction(async (trx) => {
    for (const row of rows) {
      const key = row.name.trim().toLowerCase();
      const found = existingByName.get(key);
      const payload = {
        name: row.name,
        category: row.category,
        unit: row.unit,
        base_price: row.base_price,
        sort_order: row.sort_order,
        description: row.description,
        is_active: true,
      };

      if (found) {
        const [svc] = await trx('service_templates')
          .where({ id: found.id })
          .update({ ...payload, updated_at: new Date() })
          .returning(['id']);
        touchedIds.push(svc.id);
        updated += 1;
      } else {
        const [svc] = await trx('service_templates')
          .insert(payload)
          .returning(['id']);
        touchedIds.push(svc.id);
        created += 1;
      }
    }

    if (parsed.data.activate_missing === false && touchedIds.length) {
      await trx('service_templates')
        .whereNotIn('id', touchedIds)
        .where({ is_active: true })
        .update({ is_active: false, updated_at: new Date() });
    }
  });

  res.json({
    ok: true,
    created,
    updated,
    total: rows.length,
  });
});

// PATCH /api/services/:id
router.patch('/:id', role(['admin', 'manager']), async (req, res) => {
  const [svc] = await db('service_templates').where({ id: req.params.id })
    .update({ ...req.body, updated_at: new Date() }).returning('*');
  if (!svc) return res.status(404).json({ error: 'Не найдено' });
  res.json(svc);
});

// PUT /api/services/:id/consumables — обновить расходники услуги
router.put('/:id/consumables', role(['admin', 'manager']), async (req, res) => {
  const schema = z.array(z.object({
    item_id: z.string().uuid(),
    qty_per_use: z.number().positive(),
  }));
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  await db.transaction(async trx => {
    await trx('service_consumables').where({ service_id: req.params.id }).delete();
    if (parsed.data.length) {
      await trx('service_consumables').insert(
        parsed.data.map(c => ({ service_id: req.params.id, ...c }))
      );
    }
  });
  res.json({ ok: true });
});

// ── Услуги по заявке ────────────────────────────────────────────

// GET /api/services/order/:orderId
router.get('/order/:orderId', async (req, res) => {
  const services = await db('order_services')
    .join('service_templates', 'service_templates.id', 'order_services.service_id')
    .leftJoin('users', 'users.id', 'order_services.created_by')
    .where('order_services.order_id', req.params.orderId)
    .select(
      'order_services.*',
      'service_templates.name as service_name',
      'service_templates.description as service_comment',
      'service_templates.unit as service_unit',
      'service_templates.category',
      'users.full_name as created_by_name'
    )
    .orderBy('order_services.created_at');
  res.json(services.map((service) => ({
    ...service,
    display_name: formatServiceDisplayName({
      name: service.service_name,
      description: service.service_comment,
    }),
  })));
});

// POST /api/services/order/:orderId — добавить услугу + авто-списание расходников
router.post('/order/:orderId', role(['admin', 'manager']), async (req, res) => {
  const schema = z.object({
    service_id: z.string().uuid(),
    quantity: z.number().positive(),
    unit_price: z.number().min(0).optional(),
    discount: z.number().min(0).max(100).optional(),
    note: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const order = await db('orders').where({ id: req.params.orderId }).first();
  if (!order) return res.status(404).json({ error: 'Заявка не найдена' });

  const service = await db('service_templates').where({ id: parsed.data.service_id }).first();
  if (!service) return res.status(404).json({ error: 'Услуга не найдена' });

  const unitPrice = parsed.data.unit_price ?? Number(service.base_price);
  const discount = Math.max(0, Math.min(100, Number(parsed.data.discount || 0)));
  const total = Number((unitPrice * parsed.data.quantity).toFixed(2));

  // Получаем расходники услуги
  const consumables = await db('service_consumables')
    .join('supply_items', 'supply_items.id', 'service_consumables.item_id')
    .where('service_consumables.service_id', parsed.data.service_id)
    .select('service_consumables.*', 'supply_items.name as item_name', 'supply_items.stock_qty');

  // Проверяем достаточность расходников
  for (const c of consumables) {
    const needed = c.qty_per_use * parsed.data.quantity;
    if (Number(c.stock_qty) < needed) {
      return res.status(400).json({
        error: `Недостаточно расходника "${c.item_name}". Нужно: ${needed}, есть: ${c.stock_qty}`,
      });
    }
  }

  const orderService = await db.transaction(async trx => {
    // Записываем оказанную услугу
    const [os] = await trx('order_services').insert({
      order_id: req.params.orderId,
      service_id: parsed.data.service_id,
      quantity: parsed.data.quantity,
      unit_price: unitPrice,
      total,
      discount,
      note: parsed.data.note,
      created_by: req.user.id,
    }).returning('*');

    // Авто-списание расходников
    for (const c of consumables) {
      const toWrite = c.qty_per_use * parsed.data.quantity;
      await trx('supply_item_ops').insert({
        item_id: c.item_id,
        op_type: 'out',
        quantity: toWrite,
        order_id: req.params.orderId,
        note: `Авто-списание: ${service.name} ×${parsed.data.quantity}`,
        created_by: req.user.id,
      });
      await trx('supply_items').where({ id: c.item_id })
        .decrement('stock_qty', toWrite);
    }

    return os;
  });

  syncBillingDocuments(req.params.orderId, {
    uploadedBy: req.user.id,
    force: false,
    notify: false,
  }).catch((err) => {
    console.error('Billing document sync error:', err);
  });

  res.status(201).json({ ...orderService, service_name: service.name });
});

// PATCH /api/services/order/:orderId/:serviceId — обновить количество
router.patch('/order/:orderId/:serviceId', role(['admin', 'manager']), async (req, res) => {
  const { quantity, unit_price, discount, note } = req.body;
  if (!quantity) return res.status(400).json({ error: 'Нужно quantity' });

  const existing = await db('order_services')
    .where({ id: req.params.serviceId, order_id: req.params.orderId }).first();
  if (!existing) return res.status(404).json({ error: 'Не найдено' });

  const diff = Number(quantity) - Number(existing.quantity);
  const nextPrice = unit_price !== undefined ? Number(unit_price) : Number(existing.unit_price);
  const nextDiscount = discount !== undefined ? Math.max(0, Math.min(100, Number(discount))) : Number(existing.discount || 0);
  const newTotal = Number((nextPrice * Number(quantity)).toFixed(2));

  await db.transaction(async trx => {
    await trx('order_services').where({ id: req.params.serviceId })
      .update({ quantity, unit_price: nextPrice, discount: nextDiscount, total: newTotal, note, updated_at: new Date() });

    // Корректируем расходники если изменилось количество
    if (diff !== 0) {
      const consumables = await trx('service_consumables')
        .where({ service_id: existing.service_id });
      for (const c of consumables) {
        const delta = Math.abs(c.qty_per_use * diff);
        if (diff > 0) {
          await trx('supply_item_ops').insert({
            item_id: c.item_id, op_type: 'out', quantity: delta,
            order_id: req.params.orderId, note: 'Корректировка услуги', created_by: req.user.id,
          });
          await trx('supply_items').where({ id: c.item_id }).decrement('stock_qty', delta);
        } else {
          await trx('supply_item_ops').insert({
            item_id: c.item_id, op_type: 'in', quantity: delta,
            order_id: req.params.orderId, note: 'Возврат при корректировке', created_by: req.user.id,
          });
          await trx('supply_items').where({ id: c.item_id }).increment('stock_qty', delta);
        }
      }
    }
  });

  syncBillingDocuments(req.params.orderId, {
    uploadedBy: req.user.id,
    force: false,
    notify: false,
  }).catch((err) => {
    console.error('Billing document sync error:', err);
  });

  res.json({ ok: true });
});

// DELETE /api/services/order/:orderId/:serviceId — удалить + вернуть расходники
router.delete('/order/:orderId/:serviceId', role(['admin', 'manager']), async (req, res) => {
  const existing = await db('order_services')
    .where({ id: req.params.serviceId, order_id: req.params.orderId }).first();
  if (!existing) return res.status(404).json({ error: 'Не найдено' });

  await db.transaction(async trx => {
    await trx('order_services').where({ id: req.params.serviceId }).delete();
    const consumables = await trx('service_consumables').where({ service_id: existing.service_id });
    for (const c of consumables) {
      const toReturn = c.qty_per_use * existing.quantity;
      await trx('supply_item_ops').insert({
        item_id: c.item_id, op_type: 'in', quantity: toReturn,
        order_id: req.params.orderId, note: 'Возврат при удалении услуги', created_by: req.user.id,
      });
      await trx('supply_items').where({ id: c.item_id }).increment('stock_qty', toReturn);
    }
  });

  syncBillingDocuments(req.params.orderId, {
    uploadedBy: req.user.id,
    force: false,
    notify: false,
  }).catch((err) => {
    console.error('Billing document sync error:', err);
  });

  res.json({ ok: true });
});

module.exports = router;
