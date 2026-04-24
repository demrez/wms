const app = require('./app');
const db = require('./db/knex');

const PORT = process.env.PORT || 3001;

async function start() {
  try {
    await db.raw('SELECT 1');
    console.log('✅ PostgreSQL подключён');

    app.listen(PORT, () => {
      console.log(`🚀 WMS API запущен на порту ${PORT}`);
    });
  } catch (err) {
    console.error('❌ Ошибка запуска:', err.message);
    process.exit(1);
  }
}

start();
