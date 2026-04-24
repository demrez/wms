exports.up = async function up(knex) {
  await knex.schema.table('order_marketplace_shipments', (t) => {
    t.decimal('unit_price', 12, 2).nullable();
  });
};

exports.down = async function down(knex) {
  await knex.schema.table('order_marketplace_shipments', (t) => {
    t.dropColumn('unit_price');
  });
};
