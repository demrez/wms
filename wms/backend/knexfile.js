require('dotenv').config();

const connection = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'wms_db',
  user: process.env.DB_USER || 'wms_user',
  password: process.env.DB_PASSWORD || 'wms_password',
};

module.exports = {
  client: 'pg',
  connection,
  migrations: { directory: './src/db/migrations' },
  seeds: { directory: './src/db/seeds' },
};
