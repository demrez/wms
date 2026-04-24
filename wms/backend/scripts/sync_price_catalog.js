require('dotenv').config();

const { v4: uuidv4 } = require('uuid');
const db = require('../src/db/knex');
const seedTariffs = require('../src/db/seeds/002_tariffs').seed;
const seedSuppliesServices = require('../src/db/seeds/004_supplies_services').seed;

function createCollector() {
  const payloads = {
    tariffs: [],
    supply_items: [],
    service_templates: [],
    service_consumables: [],
  };
  const rowsByFakeId = new Map();

  const fakeKnex = (table) => ({
    del: () => Promise.resolve(),
    insert: (rows) => {
      const list = Array.isArray(rows) ? rows : [rows];
      const generated = list.map((row) => {
        const fakeId = row.id || uuidv4();
        const generatedRow = { id: fakeId, ...row };
        rowsByFakeId.set(fakeId, generatedRow);
        return generatedRow;
      });
      payloads[table] = payloads[table] || [];
      payloads[table].push(...list.map((row, index) => ({
        ...row,
        id: generated[index].id,
      })));

      const result = Promise.resolve(generated);
      const chain = {
        returning: async () => generated,
        then: result.then.bind(result),
        catch: result.catch.bind(result),
      };
      return chain;
    },
  });

  return {
    fakeKnex,
    payloads,
    rowsByFakeId,
  };
}

function keyBy(collection, fn) {
  const map = new Map();
  for (const item of collection) map.set(fn(item), item);
  return map;
}

async function collectCatalog() {
  const { fakeKnex, payloads, rowsByFakeId } = createCollector();
  await seedTariffs(fakeKnex);
  await seedSuppliesServices(fakeKnex);
  return { payloads, rowsByFakeId };
}

async function upsertCatalog() {
  const { payloads, rowsByFakeId } = await collectCatalog();

  const tariffs = payloads.tariffs || [];
  const supplyItems = payloads.supply_items || [];
  const serviceTemplates = payloads.service_templates || [];
  const serviceConsumables = payloads.service_consumables || [];

  const normalizedConsumables = serviceConsumables.map((row) => {
    const fakeService = rowsByFakeId.get(row.service_id);
    const fakeItem = rowsByFakeId.get(row.item_id);
    return {
      service_name: fakeService?.name,
      item_sku: fakeItem?.sku || fakeItem?.name,
      item_name: fakeItem?.name,
      qty_per_use: Number(row.qty_per_use),
    };
  }).filter((row) => row.service_name && row.item_sku);

  const summary = {
    tariffs: { created: 0, updated: 0 },
    supply_items: { created: 0, updated: 0 },
    service_templates: { created: 0, updated: 0 },
    service_consumables: { created: 0, updated: 0 },
  };

  await db.transaction(async (trx) => {
    const tariffByCode = keyBy(await trx('tariffs').select('*'), (row) => row.code);
    for (const row of tariffs) {
      const existing = tariffByCode.get(row.code);
      const data = {
        code: row.code,
        name: row.name,
        description: row.description || null,
        unit: row.unit,
        price: row.price,
        is_active: true,
      };

      if (existing) {
        await trx('tariffs').where({ code: row.code }).update({ ...data, updated_at: new Date() });
        summary.tariffs.updated += 1;
      } else {
        await trx('tariffs').insert(data);
        summary.tariffs.created += 1;
      }
    }

    const existingItems = await trx('supply_items').select('*');
    const itemBySku = keyBy(existingItems, (row) => row.sku || row.name);
    const liveItemBySku = new Map();

    for (const row of supplyItems) {
      const key = row.sku || row.name;
      const existing = itemBySku.get(key);
      const data = {
        name: row.name,
        sku: row.sku || null,
        unit: row.unit,
        stock_qty: row.stock_qty,
        cost_price: row.cost_price,
        sale_price: row.sale_price,
        min_stock: row.min_stock,
        is_active: true,
      };

      if (existing) {
        const updateData = {
          name: data.name,
          sku: data.sku,
          unit: data.unit,
          cost_price: data.cost_price,
          sale_price: data.sale_price,
          min_stock: data.min_stock,
          is_active: true,
          updated_at: new Date(),
        };
        await trx('supply_items').where({ id: existing.id }).update(updateData);
        liveItemBySku.set(key, existing.id);
        summary.supply_items.updated += 1;
      } else {
        const [created] = await trx('supply_items').insert(data).returning('*');
        liveItemBySku.set(key, created.id);
        summary.supply_items.created += 1;
      }
    }

    const existingServices = await trx('service_templates').select('*');
    const serviceByName = keyBy(existingServices, (row) => row.name);
    const liveServiceByName = new Map();

    for (const row of serviceTemplates) {
      const existing = serviceByName.get(row.name);
      const data = {
        name: row.name,
        description: row.description || null,
        category: row.category,
        unit: row.unit,
        base_price: row.base_price,
        sort_order: row.sort_order,
        is_active: true,
      };

      if (existing) {
        await trx('service_templates').where({ id: existing.id }).update({ ...data, updated_at: new Date() });
        liveServiceByName.set(row.name, existing.id);
        summary.service_templates.updated += 1;
      } else {
        const [created] = await trx('service_templates').insert(data).returning('*');
        liveServiceByName.set(row.name, created.id);
        summary.service_templates.created += 1;
      }
    }

    const serviceIds = [...liveServiceByName.values()];
    if (serviceIds.length) {
      await trx('service_consumables').whereIn('service_id', serviceIds).delete();
    }

    const consumablesToInsert = normalizedConsumables
      .map((row) => ({
        service_id: liveServiceByName.get(row.service_name),
        item_id: liveItemBySku.get(row.item_sku),
        qty_per_use: row.qty_per_use,
      }))
      .filter((row) => row.service_id && row.item_id);

    if (consumablesToInsert.length) {
      await trx('service_consumables').insert(consumablesToInsert);
      summary.service_consumables.created = consumablesToInsert.length;
    }
  });

  return summary;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const { payloads, rowsByFakeId } = await collectCatalog();

  if (dryRun) {
    console.log(JSON.stringify({
      tariffs: payloads.tariffs.length,
      supply_items: payloads.supply_items.length,
      service_templates: payloads.service_templates.length,
      service_consumables: payloads.service_consumables.length,
      rows_captured: rowsByFakeId.size,
    }, null, 2));
    return;
  }

  const summary = await upsertCatalog();
  console.log('Catalog sync completed:', JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error('Catalog sync failed:', error);
  process.exitCode = 1;
});
