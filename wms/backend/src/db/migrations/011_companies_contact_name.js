exports.up = async function up(knex) {
  const exists = await knex.schema.hasColumn('companies', 'contact_name');
  if (!exists) {
    await knex.schema.alterTable('companies', (t) => {
      t.string('contact_name', 255);
    });
  }
};

exports.down = async function down(knex) {
  const exists = await knex.schema.hasColumn('companies', 'contact_name');
  if (exists) {
    await knex.schema.alterTable('companies', (t) => {
      t.dropColumn('contact_name');
    });
  }
};
