const PRICE_ROWS = [
  { marketplace: 'wb', name: 'Коледино', price_per_unit: 300, price_per_pallet: 3000, sort_order: 1 },
  { marketplace: 'wb', name: 'Пушкино', price_per_unit: 300, price_per_pallet: 3000, sort_order: 2 },
  { marketplace: 'wb', name: 'Электросталь', price_per_unit: 360, price_per_pallet: 3600, sort_order: 3 },
  { marketplace: 'wb', name: 'Подольск', price_per_unit: 300, price_per_pallet: 3000, sort_order: 4 },
  { marketplace: 'wb', name: 'Чехов', price_per_unit: 300, price_per_pallet: 3000, sort_order: 5 },
  { marketplace: 'wb', name: 'Тула', price_per_unit: 500, price_per_pallet: 5000, sort_order: 6 },
  { marketplace: 'wb', name: 'Обухово', price_per_unit: 360, price_per_pallet: 3600, sort_order: 7 },
  { marketplace: 'wb_region', name: 'Санкт-Петербург', price_per_unit: 700, price_per_pallet: 7000, sort_order: 11 },
  { marketplace: 'wb_region', name: 'Екатеринбург', price_per_unit: 1400, price_per_pallet: 14000, sort_order: 12 },
  { marketplace: 'wb_region', name: 'Казань', price_per_unit: 700, price_per_pallet: 7000, sort_order: 13 },
  { marketplace: 'wb_region', name: 'Краснодар', price_per_unit: 850, price_per_pallet: 8500, sort_order: 14 },
  { marketplace: 'wb_region', name: 'Невинномысск', price_per_unit: 950, price_per_pallet: 9500, sort_order: 15 },
  { marketplace: 'wb_region', name: 'Новосемейкино', price_per_unit: 950, price_per_pallet: 9500, sort_order: 16 },
  { marketplace: 'yandex', name: 'Софьино', price_per_unit: 3500, price_per_pallet: 4500, sort_order: 31 },
  { marketplace: 'ozon', name: 'Хоругвино', price_per_unit: 2500, price_per_pallet: 4200, sort_order: 21 },
  { marketplace: 'ozon', name: 'МО Львовский', price_per_unit: 2500, price_per_pallet: 4200, sort_order: 22 },
  { marketplace: 'ozon', name: 'МО Щербинка', price_per_unit: 2500, price_per_pallet: 4200, sort_order: 23 },
  { marketplace: 'ozon', name: 'ТСЦ Пушкино', price_per_unit: 2500, price_per_pallet: 4200, sort_order: 24 },
  { marketplace: 'ozon', name: 'Гривно РФЦ', price_per_unit: 2500, price_per_pallet: 4200, sort_order: 25 },
  { marketplace: 'ozon', name: 'Жуковский РФЦ', price_per_unit: 2500, price_per_pallet: 4200, sort_order: 26 },
  { marketplace: 'ozon', name: 'Софьино РФЦ', price_per_unit: 2500, price_per_pallet: 4200, sort_order: 27 },
  { marketplace: 'ozon', name: 'Кавказский хаб', price_per_unit: 2500, price_per_pallet: 4200, sort_order: 28 },
  { marketplace: 'ozon', name: 'Волгоградский хаб', price_per_unit: 2500, price_per_pallet: 4200, sort_order: 29 },
];

exports.up = async function up(knex) {
  const columnInfo = await knex('information_schema.columns')
    .select('data_type', 'udt_name')
    .where({ table_name: 'logistics_warehouses', column_name: 'marketplace' })
    .first();

  if (columnInfo?.data_type === 'USER-DEFINED' && columnInfo?.udt_name) {
    await knex.raw(`ALTER TYPE "${columnInfo.udt_name}" ADD VALUE IF NOT EXISTS 'yandex'`);
  }

  await knex.raw('ALTER TABLE logistics_warehouses DROP CONSTRAINT IF EXISTS logistics_warehouses_marketplace_check');
  await knex.raw(`
    ALTER TABLE logistics_warehouses
    ADD CONSTRAINT logistics_warehouses_marketplace_check
    CHECK (marketplace IN ('wb', 'wb_region', 'ozon', 'yandex', 'other'))
  `);

  await knex('logistics_warehouses')
    .insert(PRICE_ROWS)
    .onConflict(['marketplace', 'name'])
    .merge({
      price_per_unit: knex.raw('excluded.price_per_unit'),
      price_per_pallet: knex.raw('excluded.price_per_pallet'),
      sort_order: knex.raw('excluded.sort_order'),
      is_active: true,
      updated_at: knex.fn.now(),
    });
};

exports.down = async function down(knex) {
  await knex('logistics_warehouses')
    .whereIn('marketplace', ['wb', 'wb_region', 'ozon', 'yandex'])
    .update({
      price_per_unit: 0,
      price_per_pallet: 0,
      updated_at: knex.fn.now(),
    });

  await knex('logistics_warehouses')
    .where({ marketplace: 'yandex', name: 'Софьино' })
    .del();

  await knex.raw('ALTER TABLE logistics_warehouses DROP CONSTRAINT IF EXISTS logistics_warehouses_marketplace_check');
  await knex.raw(`
    ALTER TABLE logistics_warehouses
    ADD CONSTRAINT logistics_warehouses_marketplace_check
    CHECK (marketplace IN ('wb', 'wb_region', 'ozon', 'other'))
  `);
};
