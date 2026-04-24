exports.up = async function up(knex) {
  const hasNotifications = await knex.schema.hasColumn('companies', 'telegram_notifications');
  if (!hasNotifications) {
    await knex.schema.alterTable('companies', (table) => {
      table.boolean('telegram_notifications').notNullable().defaultTo(false);
    });
  }

  const hasChatId = await knex.schema.hasColumn('companies', 'telegram_chat_id');
  if (!hasChatId) {
    await knex.schema.alterTable('companies', (table) => {
      table.text('telegram_chat_id');
    });
  }
};

exports.down = async function down(knex) {
  const hasChatId = await knex.schema.hasColumn('companies', 'telegram_chat_id');
  if (hasChatId) {
    await knex.schema.alterTable('companies', (table) => {
      table.dropColumn('telegram_chat_id');
    });
  }

  const hasNotifications = await knex.schema.hasColumn('companies', 'telegram_notifications');
  if (hasNotifications) {
    await knex.schema.alterTable('companies', (table) => {
      table.dropColumn('telegram_notifications');
    });
  }
};
