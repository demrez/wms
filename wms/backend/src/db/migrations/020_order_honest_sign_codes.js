exports.up = async function up(knex) {
  await knex.schema.createTable('order_item_honest_codes', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('order_id').notNullable();
    t.uuid('order_item_id').notNullable();
    t.text('raw_code').notNullable();
    t.text('normalized_code').notNullable();
    t.integer('scan_attempts').notNullable().defaultTo(0);
    t.timestamp('first_scanned_at');
    t.timestamp('last_scanned_at');
    t.uuid('first_scanned_by');
    t.uuid('last_scanned_by');
    t.uuid('created_by');
    t.timestamps(true, true);

    t.unique(['order_id', 'normalized_code']);
    t.index(['order_item_id']);
    t.index(['order_id']);
  });

  await knex.schema.createTable('order_honest_code_scans', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('order_id').notNullable();
    t.uuid('order_item_id');
    t.uuid('honest_code_id');
    t.text('raw_code').notNullable();
    t.text('normalized_code').notNullable();
    t.string('result', 32).notNullable();
    t.uuid('scanned_by');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    t.index(['order_id']);
    t.index(['result']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('order_honest_code_scans');
  await knex.schema.dropTableIfExists('order_item_honest_codes');
};
