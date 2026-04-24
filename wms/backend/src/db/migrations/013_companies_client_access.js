exports.up = async function up(knex) {
  const hasPassword = await knex.schema.hasColumn('companies', 'client_password');
  if (!hasPassword) {
    await knex.schema.alterTable('companies', (table) => {
      table.text('client_password');
    });
  }
};

exports.down = async function down(knex) {
  const hasPassword = await knex.schema.hasColumn('companies', 'client_password');
  if (hasPassword) {
    await knex.schema.alterTable('companies', (table) => {
      table.dropColumn('client_password');
    });
  }
};
