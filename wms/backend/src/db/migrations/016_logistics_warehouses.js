exports.up = async function up(knex) {
  await knex.schema.createTable('logistics_warehouses', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.enu('marketplace', ['wb', 'wb_region', 'ozon', 'other']).notNullable();
    t.string('name', 255).notNullable();
    t.decimal('price_per_unit', 12, 2).notNullable().defaultTo(0);
    t.decimal('price_per_pallet', 12, 2).notNullable().defaultTo(0);
    t.integer('sort_order').notNullable().defaultTo(0);
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.unique(['marketplace', 'name']);
  });

  await knex('logistics_warehouses').insert([
    { marketplace: 'wb', name: 'Коледино', price_per_unit: 0, price_per_pallet: 0, sort_order: 1 },
    { marketplace: 'wb', name: 'Пушкино', price_per_unit: 0, price_per_pallet: 0, sort_order: 2 },
    { marketplace: 'wb', name: 'Электросталь', price_per_unit: 0, price_per_pallet: 0, sort_order: 3 },
    { marketplace: 'wb', name: 'Подольск', price_per_unit: 0, price_per_pallet: 0, sort_order: 4 },
    { marketplace: 'wb', name: 'Чехов', price_per_unit: 0, price_per_pallet: 0, sort_order: 5 },
    { marketplace: 'wb', name: 'Тула', price_per_unit: 0, price_per_pallet: 0, sort_order: 6 },
    { marketplace: 'wb', name: 'Обухово', price_per_unit: 0, price_per_pallet: 0, sort_order: 7 },
    { marketplace: 'wb_region', name: 'Санкт-Петербург', price_per_unit: 0, price_per_pallet: 0, sort_order: 11 },
    { marketplace: 'wb_region', name: 'Екатеринбург', price_per_unit: 0, price_per_pallet: 0, sort_order: 12 },
    { marketplace: 'wb_region', name: 'Казань', price_per_unit: 0, price_per_pallet: 0, sort_order: 13 },
    { marketplace: 'wb_region', name: 'Краснодар', price_per_unit: 0, price_per_pallet: 0, sort_order: 14 },
    { marketplace: 'wb_region', name: 'Невинномысск', price_per_unit: 0, price_per_pallet: 0, sort_order: 15 },
    { marketplace: 'wb_region', name: 'Новосемейкино', price_per_unit: 0, price_per_pallet: 0, sort_order: 16 },
    { marketplace: 'ozon', name: 'Хоругвино', price_per_unit: 0, price_per_pallet: 0, sort_order: 21 },
    { marketplace: 'ozon', name: 'МО Львовский', price_per_unit: 0, price_per_pallet: 0, sort_order: 22 },
    { marketplace: 'ozon', name: 'МО Щербинка', price_per_unit: 0, price_per_pallet: 0, sort_order: 23 },
    { marketplace: 'ozon', name: 'ТСЦ Пушкино', price_per_unit: 0, price_per_pallet: 0, sort_order: 24 },
    { marketplace: 'ozon', name: 'Гривно РФЦ', price_per_unit: 0, price_per_pallet: 0, sort_order: 25 },
    { marketplace: 'ozon', name: 'Жуковский РФЦ', price_per_unit: 0, price_per_pallet: 0, sort_order: 26 },
    { marketplace: 'ozon', name: 'Софьино РФЦ', price_per_unit: 0, price_per_pallet: 0, sort_order: 27 },
    { marketplace: 'ozon', name: 'Кавказский хаб', price_per_unit: 0, price_per_pallet: 0, sort_order: 28 },
    { marketplace: 'ozon', name: 'Волгоградский хаб', price_per_unit: 0, price_per_pallet: 0, sort_order: 29 },
  ]);
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('logistics_warehouses');
};
