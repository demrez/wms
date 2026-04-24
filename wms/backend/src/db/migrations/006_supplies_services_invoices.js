exports.up = async function(knex) {

  await knex.schema.createTable('supply_items', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('name', 255).notNullable();
    t.string('sku', 100);
    t.enu('unit', ['pcs', 'm', 'kg', 'roll', 'pack']).notNullable().defaultTo('pcs');
    t.decimal('stock_qty', 12, 3).notNullable().defaultTo(0);
    t.decimal('cost_price', 12, 2).notNullable().defaultTo(0);
    t.decimal('sale_price', 12, 2).notNullable().defaultTo(0);
    t.decimal('min_stock', 12, 3).notNullable().defaultTo(0);
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('supply_item_ops', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('item_id').notNullable().references('id').inTable('supply_items').onDelete('RESTRICT');
    t.enu('op_type', ['in', 'out', 'adjust']).notNullable();
    t.decimal('quantity', 12, 3).notNullable();
    t.uuid('order_id').references('id').inTable('orders').onDelete('SET NULL');
    t.text('note');
    t.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('service_templates', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('name', 255).notNullable();
    t.text('description');
    t.enu('category', ['receiving','packing','labeling','photo','logistics','storage','other'])
      .notNullable().defaultTo('other');
    t.enu('unit', ['per_unit','per_order','per_kg','per_m3','per_day']).notNullable().defaultTo('per_unit');
    t.decimal('base_price', 12, 2).notNullable().defaultTo(0);
    t.boolean('is_active').notNullable().defaultTo(true);
    t.integer('sort_order').notNullable().defaultTo(0);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('service_consumables', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('service_id').notNullable().references('id').inTable('service_templates').onDelete('CASCADE');
    t.uuid('item_id').notNullable().references('id').inTable('supply_items').onDelete('RESTRICT');
    t.decimal('qty_per_use', 12, 4).notNullable().defaultTo(1);
    t.unique(['service_id', 'item_id']);
  });

  await knex.schema.createTable('order_services', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    t.uuid('service_id').notNullable().references('id').inTable('service_templates').onDelete('RESTRICT');
    t.decimal('quantity', 12, 3).notNullable().defaultTo(0);
    t.decimal('unit_price', 12, 2).notNullable().defaultTo(0);
    t.decimal('total', 12, 2).notNullable().defaultTo(0);
    t.text('note');
    t.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('invoices', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.increments('number');
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('RESTRICT');
    t.enu('type', ['invoice', 'act']).notNullable().defaultTo('invoice');
    t.enu('status', ['draft','sent','paid','cancelled']).notNullable().defaultTo('draft');
    t.date('period_from');
    t.date('period_to');
    t.decimal('subtotal', 14, 2).notNullable().defaultTo(0);
    t.decimal('tax_rate', 5, 2).notNullable().defaultTo(0);
    t.decimal('total', 14, 2).notNullable().defaultTo(0);
    t.text('notes');
    t.string('pdf_url', 500);
    t.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('invoice_items', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('invoice_id').notNullable().references('id').inTable('invoices').onDelete('CASCADE');
    t.string('description', 500).notNullable();
    t.decimal('quantity', 12, 3).notNullable().defaultTo(1);
    t.string('unit', 50).notNullable().defaultTo('шт');
    t.decimal('unit_price', 12, 2).notNullable().defaultTo(0);
    t.decimal('total', 12, 2).notNullable().defaultTo(0);
    t.enu('source_type', ['service','charge','manual']).notNullable().defaultTo('manual');
    t.uuid('source_id');
    t.integer('sort_order').notNullable().defaultTo(0);
  });

  await knex.schema.createTable('proposals', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.increments('number');
    t.string('client_name', 255).notNullable();
    t.string('client_contact', 255);
    t.string('client_phone', 50);
    t.enu('status', ['draft','sent','accepted','declined']).notNullable().defaultTo('draft');
    t.date('valid_until');
    t.decimal('total_monthly', 14, 2).notNullable().defaultTo(0);
    t.text('notes');
    t.string('pdf_url', 500);
    t.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('proposal_items', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('proposal_id').notNullable().references('id').inTable('proposals').onDelete('CASCADE');
    t.uuid('service_id').references('id').inTable('service_templates').onDelete('SET NULL');
    t.string('label', 255).notNullable();
    t.string('unit', 50).notNullable().defaultTo('ед.');
    t.decimal('quantity', 12, 2).notNullable().defaultTo(0);
    t.decimal('unit_price', 12, 2).notNullable().defaultTo(0);
    t.decimal('total', 12, 2).notNullable().defaultTo(0);
    t.integer('sort_order').notNullable().defaultTo(0);
  });
};

exports.down = async function(knex) {
  for (const t of [
    'proposal_items','proposals','invoice_items','invoices',
    'order_services','service_consumables','service_templates',
    'supply_item_ops','supply_items',
  ]) await knex.schema.dropTableIfExists(t);
};
