require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

const envOrigins = (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = Array.from(new Set([
  'https://smart-wms.ru',
  'https://www.smart-wms.ru',
  ...envOrigins,
]));

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Статика для загруженных файлов
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Роуты
app.use('/api/auth', require('./routes/auth'));
app.use('/api/companies', require('./routes/companies'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/warehouse', require('./routes/warehouse'));
app.use('/api/logistics', require('./routes/logistics'));
app.use('/api/uploads', require('./routes/uploads'));
app.use('/api/billing', require('./routes/billing'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/supplies', require('./routes/supplies'));
app.use('/api/services', require('./routes/services'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/mp', require('./routes/marketplace'));
app.use('/api/export', require('./routes/export'));
app.use('/api/client', require('./routes/client'));
app.use('/api/inn', require('./routes/inn'));
app.use('/api/settings', require('./routes/settings'));

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date() }));

// 404
app.use((req, res) => res.status(404).json({ error: 'Маршрут не найден' }));

// Глобальная обработка ошибок
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

module.exports = app;
