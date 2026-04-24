exports.up = async function(knex) {
  // Тарифы услуг фулфилмента
  await knex.schema.createTable('tariffs', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('code', 100).notNullable().unique();  // e.g. 'storage_per_unit', 'processing_per_unit'
    t.string('name', 255).notNullable();
    t.text('description');
    t.enu('unit', ['per_unit', 'per_kg', 'per_m3', 'per_order', 'per_day']).notNullable();
    t.decimal('price', 12, 2).notNullable().defaultTo(0);
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });

  // Индивидуальные тарифы для компании (override глобальных)
  await knex.schema.createTable('company_tariffs', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.string('tariff_code', 100).notNullable();
    t.decimal('price', 12, 2).notNullable();
    t.timestamps(true, true);
    t.unique(['company_id', 'tariff_code']);
  });

  // Начисления
  await knex.schema.createTable('charges', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.uuid('order_id').references('id').inTable('orders').onDelete('SET NULL');
    t.string('tariff_code', 100).notNullable();
    t.string('description', 500);
    t.integer('quantity').notNullable().defaultTo(1);
    t.decimal('unit_price', 12, 2).notNullable();
    t.decimal('total', 12, 2).notNullable();
    t.enu('status', ['pending', 'confirmed', 'paid']).notNullable().defaultTo('pending');
    t.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('charges');
  await knex.schema.dropTableIfExists('company_tariffs');
  await knex.schema.dropTableIfExists('tariffs');
};
