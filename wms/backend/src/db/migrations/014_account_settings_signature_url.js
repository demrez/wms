exports.up = async function(knex) {
  const exists = await knex.schema.hasColumn('account_settings', 'signature_url');
  if (!exists) {
    await knex.schema.alterTable('account_settings', (t) => {
      t.string('signature_url', 500);
    });
  }
};

exports.down = async function(knex) {
  const exists = await knex.schema.hasColumn('account_settings', 'signature_url');
  if (exists) {
    await knex.schema.alterTable('account_settings', (t) => {
      t.dropColumn('signature_url');
    });
  }
};
