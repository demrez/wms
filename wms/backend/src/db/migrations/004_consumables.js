exports.up = async function(knex) {
  await knex.schema.createTable('consumables', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('code', 100).notNullable().unique();
    t.string('name', 255).notNullable();
    t.string('category', 100);
    t.string('unit', 50).notNullable().defaultTo('шт');
    t.decimal('price', 12, 2).notNullable().defaultTo(0);
    t.integer('stock_qty').notNullable().defaultTo(0);
    t.integer('min_qty').notNullable().defaultTo(0);
    t.text('comment');
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('consumables');
};
