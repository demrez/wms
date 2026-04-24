exports.up = async function up(knex) {
  const statusType = await knex('information_schema.columns')
    .where({ table_name: 'invoices', column_name: 'status' })
    .select('udt_name', 'data_type')
    .first();

  if (statusType?.data_type === 'USER-DEFINED' && statusType.udt_name) {
    await knex.raw(`ALTER TYPE "${statusType.udt_name}" ADD VALUE IF NOT EXISTS 'deferred'`);
  }

  const hasOrderId = await knex.schema.hasColumn('invoices', 'order_id');
  if (!hasOrderId) {
    await knex.schema.alterTable('invoices', (t) => {
      t.uuid('order_id').references('id').inTable('orders').onDelete('SET NULL');
    });
  }
};

exports.down = async function down() {
  // Для enum в PostgreSQL откат значения статуса не выполняем безопасно.
  return;
};
