exports.up = async function(knex) {

  // Подключения к маркетплейсам (API-ключи по компании)
  await knex.schema.createTable('mp_connections', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    t.enu('marketplace', ['wb', 'ozon', 'yandex']).notNullable();
    t.text('api_key').notNullable();           // токен WB или Ozon seller token
    t.string('client_id', 100);               // Ozon client_id
    t.string('campaign_id', 100);             // Яндекс campaign_id
    t.string('warehouse_id', 100);            // ID склада на МП (для FBS)
    t.string('warehouse_name', 255);          // название склада МП
    t.boolean('is_active').notNullable().defaultTo(true);
    t.boolean('auto_sync_stocks').notNullable().defaultTo(false);
    t.boolean('auto_import_products').notNullable().defaultTo(false);
    t.timestamp('last_sync_at');
    t.string('last_sync_status', 50);         // ok / error
    t.timestamps(true, true);
    t.unique(['company_id', 'marketplace']);
  });

  // Привязка наших товаров к SKU маркетплейса
  await knex.schema.createTable('mp_products', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('product_id').notNullable().references('id').inTable('products').onDelete('CASCADE');
    t.uuid('connection_id').notNullable().references('id').inTable('mp_connections').onDelete('CASCADE');
    t.string('mp_sku', 100);         // nmId (WB) или product_id (Ozon)
    t.string('mp_barcode', 100);
    t.string('mp_article', 100);
    t.string('mp_name', 500);
    t.integer('last_stock_sent').defaultTo(0);
    t.timestamp('synced_at');
    t.unique(['product_id', 'connection_id']);
  });

  // Задачи создания поставок на МП
  await knex.schema.createTable('mp_supply_tasks', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    t.uuid('connection_id').notNullable().references('id').inTable('mp_connections').onDelete('RESTRICT');
    t.string('mp_supply_id', 200);   // ID поставки, полученный от МП
    t.enu('supply_type', ['fbo', 'fbs']).notNullable().defaultTo('fbo');
    t.enu('status', ['pending', 'created', 'error']).notNullable().defaultTo('pending');
    t.jsonb('mp_response');          // сырой ответ API
    t.text('error_msg');
    t.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
    t.timestamps(true, true);
  });

  // Лог всех синхронизаций
  await knex.schema.createTable('mp_sync_log', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('connection_id').notNullable().references('id').inTable('mp_connections').onDelete('CASCADE');
    t.string('action', 100).notNullable(); // import_products / push_stocks / create_supply
    t.enu('status', ['ok', 'error']).notNullable().defaultTo('ok');
    t.integer('items_count').defaultTo(0);
    t.text('error_msg');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = async function(knex) {
  for (const t of ['mp_sync_log', 'mp_supply_tasks', 'mp_products', 'mp_connections']) {
    await knex.schema.dropTableIfExists(t);
  }
};
