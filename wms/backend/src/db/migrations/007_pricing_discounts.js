exports.up = async function up(knex) {
  await knex.schema.alterTable('charges', (table) => {
    table.decimal('discount', 5, 2).notNullable().defaultTo(0);
  });

  await knex.schema.alterTable('order_services', (table) => {
    table.decimal('discount', 5, 2).notNullable().defaultTo(0);
  });

  await knex.schema.alterTable('order_consumables', (table) => {
    table.decimal('discount', 5, 2).notNullable().defaultTo(0);
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('order_consumables', (table) => {
    table.dropColumn('discount');
  });

  await knex.schema.alterTable('order_services', (table) => {
    table.dropColumn('discount');
  });

  await knex.schema.alterTable('charges', (table) => {
    table.dropColumn('discount');
  });
};
