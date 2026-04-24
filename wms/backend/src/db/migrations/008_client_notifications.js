exports.up = async function(knex) {
  await knex.schema.createTable('client_notifications', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.enu('type', ['order_stage', 'invoice', 'defect', 'info']).notNullable().defaultTo('info');
    t.string('title', 255).notNullable();
    t.text('body');
    t.uuid('order_id').references('id').inTable('orders').onDelete('SET NULL');
    t.uuid('invoice_id').references('id').inTable('invoices').onDelete('SET NULL');
    t.boolean('is_read').notNullable().defaultTo(false);
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('client_notifications');
};
