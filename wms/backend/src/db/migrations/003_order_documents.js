exports.up = async function(knex) {
  await knex.schema.createTable('order_documents', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    t.string('doc_type', 100).notNullable();
    t.string('title', 255).notNullable();
    t.string('file_name', 255).notNullable();
    t.text('file_url').notNullable();
    t.uuid('uploaded_by').references('id').inTable('users').onDelete('SET NULL');
    t.timestamps(true, true);
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('order_documents');
};
