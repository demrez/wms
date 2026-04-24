exports.up = async function up(knex) {
  await knex.schema.createTable('order_marketplace_boxes', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('order_id').notNullable();
    t.uuid('shipment_id').nullable();
    t.enu('marketplace', ['wb', 'ozon', 'yandex']).notNullable().defaultTo('wb');
    t.string('warehouse_name', 255).nullable();
    t.timestamp('ship_date').nullable();
    t.string('box_code', 30).notNullable();
    t.integer('sequence_no').notNullable().defaultTo(1);
    t.uuid('created_by').nullable();
    t.timestamps(true, true);

    t.index(['order_id']);
    t.index(['shipment_id']);
    t.unique(['order_id', 'box_code']);
    t.unique(['order_id', 'sequence_no']);
  });

  await knex.schema.createTable('order_marketplace_box_items', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('box_id').notNullable();
    t.uuid('order_item_id').notNullable();
    t.uuid('product_id').nullable();
    t.string('barcode', 128).nullable();
    t.integer('quantity').notNullable().defaultTo(0);
    t.string('expiry_date', 64).nullable();
    t.timestamps(true, true);

    t.index(['box_id']);
    t.index(['order_item_id']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('order_marketplace_box_items');
  await knex.schema.dropTableIfExists('order_marketplace_boxes');
};
