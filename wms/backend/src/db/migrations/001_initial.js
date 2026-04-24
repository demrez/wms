exports.up = async function(knex) {
  // users
  await knex.schema.createTable('users', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('email', 255).notNullable().unique();
    t.string('password_hash', 255).notNullable();
    t.enu('role', ['admin', 'manager', 'client']).notNullable().defaultTo('client');
    t.string('full_name', 255);
    t.string('phone', 50);
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });

  // companies
  await knex.schema.createTable('companies', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').references('id').inTable('users').onDelete('SET NULL');
    t.string('name', 255).notNullable();
    t.string('legal_name', 255);
    t.string('inn', 20);
    t.string('phone', 50);
    t.text('address');
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });

  // products
  await knex.schema.createTable('products', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.string('name', 500).notNullable();
    t.string('article', 100);
    t.string('brand', 255);
    t.string('color', 100);
    t.string('size', 50);
    t.integer('weight_g');
    t.string('country', 100);
    t.text('composition');
    t.decimal('dim_l', 8, 2);
    t.decimal('dim_w', 8, 2);
    t.decimal('dim_h', 8, 2);
    t.text('photo_url');
    t.timestamps(true, true);
  });

  // product_barcodes — связи с маркетплейсами
  await knex.schema.createTable('product_barcodes', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('product_id').notNullable().references('id').inTable('products').onDelete('CASCADE');
    t.enu('marketplace', ['wb', 'ozon', 'yandex', 'ff']).notNullable();
    t.string('barcode', 100);
    t.string('article_mp', 100);
    t.unique(['product_id', 'marketplace']);
    t.timestamps(true, true);
  });

  // stock — остатки
  await knex.schema.createTable('stock', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('product_id').notNullable().unique().references('id').inTable('products').onDelete('CASCADE');
    t.integer('quantity').notNullable().defaultTo(0);
    t.integer('defect_qty').notNullable().defaultTo(0);
    t.integer('reserved_qty').notNullable().defaultTo(0);
    t.boolean('paid_storage').notNullable().defaultTo(false);
    t.decimal('volume_l', 10, 3).defaultTo(0);
    t.timestamps(true, true);
  });

  // orders — заявки
  await knex.schema.createTable('orders', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.increments('number').notNullable(); // авто-инкремент: 1, 2, 3...
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('RESTRICT');
    t.enu('type', ['supply', 'processing', 'logistics']).notNullable();
    t.string('stage', 100).notNullable().defaultTo('new');
    t.enu('status', ['active', 'done', 'cancelled']).notNullable().defaultTo('active');
    t.text('comment');
    t.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
    t.timestamps(true, true);
  });

  // order_items — состав заявки
  await knex.schema.createTable('order_items', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    t.uuid('product_id').notNullable().references('id').inTable('products').onDelete('RESTRICT');
    t.integer('quantity').notNullable().defaultTo(0);
    t.integer('ready_qty').notNullable().defaultTo(0);
    t.integer('defect_qty').notNullable().defaultTo(0);
    t.text('pack_note');
    t.timestamps(true, true);
  });

  // order_stages — история смены этапов
  await knex.schema.createTable('order_stages', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    t.string('stage', 100).notNullable();
    t.text('note');
    t.uuid('changed_by').references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // supply_details — детали поставки
  await knex.schema.createTable('supply_details', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('order_id').notNullable().unique().references('id').inTable('orders').onDelete('CASCADE');
    t.string('delivery_type', 100);
    t.timestamp('delivery_date');
    t.text('pickup_address');
    t.integer('places_count').defaultTo(0);
    t.decimal('weight_kg', 10, 2).defaultTo(0);
    t.decimal('volume_m3', 10, 3).defaultTo(0);
    t.string('cargo_number', 100);
    t.string('contact_name', 255);
    t.string('contact_phone', 50);
    t.text('waybill_url');
    t.timestamps(true, true);
  });

  // logistics — детали логистики
  await knex.schema.createTable('logistics', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    t.enu('dest_type', ['transit', 'direct']).notNullable().defaultTo('direct');
    t.string('dest_warehouse', 255);
    t.string('pass_number', 100);
    t.timestamp('ship_date');
    t.timestamps(true, true);
  });

  // warehouse_ops — все складские операции (приход/расход/брак/перемещение)
  await knex.schema.createTable('warehouse_ops', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('product_id').notNullable().references('id').inTable('products').onDelete('RESTRICT');
    t.uuid('order_id').references('id').inTable('orders').onDelete('SET NULL');
    t.enu('op_type', ['in', 'out', 'defect', 'defect_return', 'move', 'write_off']).notNullable();
    t.integer('quantity').notNullable();
    t.text('note');
    t.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = async function(knex) {
  const tables = [
    'warehouse_ops', 'logistics', 'supply_details',
    'order_stages', 'order_items', 'orders',
    'stock', 'product_barcodes', 'products',
    'companies', 'users'
  ];
  for (const t of tables) {
    await knex.schema.dropTableIfExists(t);
  }
};
