exports.up = async function up(knex) {
  await knex.schema.createTable('order_marketplace_shipments', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    t.enu('marketplace', ['wb', 'ozon', 'yandex']).notNullable();
    t.string('warehouse_name', 255).notNullable();
    t.timestamp('ship_date');
    t.integer('places_count').notNullable().defaultTo(0);
    t.integer('quantity').notNullable().defaultTo(0);
    t.text('note');
    t.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
    t.timestamps(true, true);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('order_marketplace_shipments');
};

