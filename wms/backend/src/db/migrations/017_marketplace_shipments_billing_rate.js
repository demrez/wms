exports.up = async function up(knex) {
  await knex.schema.alterTable('order_marketplace_shipments', (t) => {
    t.enu('billing_rate', ['per_unit', 'per_pallet']).notNullable().defaultTo('per_unit');
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('order_marketplace_shipments', (t) => {
    t.dropColumn('billing_rate');
  });
};
