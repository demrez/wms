require('dotenv').config();
const knex = require('knex');

const db = knex({
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'wms_db',
    user: process.env.DB_USER || 'wms_user',
    password: process.env.DB_PASSWORD || 'wms_password',
  },
  pool: { min: 2, max: 10 },
  migrations: { directory: './src/db/migrations' },
  seeds: { directory: './src/db/seeds' },
});

module.exports = db;
