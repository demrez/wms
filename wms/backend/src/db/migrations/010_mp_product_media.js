exports.up = async function(knex) {
  const hasColumn = await knex.schema.hasColumn('mp_products', 'mp_photo_url');
  if (!hasColumn) {
    await knex.schema.alterTable('mp_products', (t) => {
      t.text('mp_photo_url');
    });
  }
};

exports.down = async function(knex) {
  const hasColumn = await knex.schema.hasColumn('mp_products', 'mp_photo_url');
  if (hasColumn) {
    await knex.schema.alterTable('mp_products', (t) => {
      t.dropColumn('mp_photo_url');
    });
  }
};
