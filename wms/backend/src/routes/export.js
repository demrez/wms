const express = require('express');
const db = require('../db/knex');
const { auth, role } = require('../middleware/auth');

const router = express.Router();
router.use(auth, role(['admin', 'manager']));

// Генерируем CSV вместо xlsx (не нужны внешние зависимости)
// Для реального Excel клиент может открыть CSV напрямую в Excel

function toCSV(rows, columns) {
  const header = columns.map(c => `"${c.label}"`).join(';');
  const lines = rows.map(row =>
    columns.map(c => {
      const val = row[c.key] ?? '';
      return `"${String(val).replace(/"/g, '""')}"`;
    }).join(';')
  );
  return '\uFEFF' + [header, ...lines].join('\r\n'); // BOM для Excel
}

function sendCSV(res, data, filename) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(data);
}

// GET /api/export/stock — остатки склада
router.get('/stock', async (req, res) => {
  const rows = await db('products')
    .join('companies', 'companies.id', 'products.company_id')
    .join('stock', 'stock.product_id', 'products.id')
    .select(
      'companies.name as company_name',
      'products.name as product_name',
      'products.article',
      'products.brand',
      'products.color',
      'stock.quantity',
      'stock.defect_qty',
      'stock.reserved_qty',
      db.raw('stock.quantity - stock.defect_qty - stock.reserved_qty as available_qty'),
      db.raw("case when stock.paid_storage then 'Да' else 'Нет' end as paid_storage")
    )
    .orderBy(['companies.name', 'products.name']);

  const cols = [
    { key: 'company_name',  label: 'Компания' },
    { key: 'product_name',  label: 'Товар' },
    { key: 'article',       label: 'Артикул' },
    { key: 'brand',         label: 'Бренд' },
    { key: 'color',         label: 'Цвет' },
    { key: 'quantity',      label: 'Остаток' },
    { key: 'defect_qty',    label: 'Брак' },
    { key: 'reserved_qty',  label: 'Резерв' },
    { key: 'available_qty', label: 'Доступно' },
    { key: 'paid_storage',  label: 'Платное хранение' },
  ];

  const date = new Date().toISOString().slice(0, 10);
  sendCSV(res, toCSV(rows, cols), `stock_${date}.csv`);
});

// GET /api/export/orders — список заявок
router.get('/orders', async (req, res) => {
  const { from, to, type, status } = req.query;

  let q = db('orders')
    .join('companies', 'companies.id', 'orders.company_id')
    .leftJoin('supply_details', 'supply_details.order_id', 'orders.id')
    .select(
      'orders.number',
      'companies.name as company_name',
      'orders.type',
      'orders.stage',
      'orders.status',
      'supply_details.places_count',
      'supply_details.weight_kg',
      'supply_details.delivery_type',
      'orders.comment',
      'orders.created_at'
    )
    .orderBy('orders.number', 'desc');

  if (type)   q = q.where('orders.type', type);
  if (status) q = q.where('orders.status', status);
  if (from)   q = q.where('orders.created_at', '>=', from);
  if (to)     q = q.where('orders.created_at', '<=', to);

  const rows = await q;

  const TYPE_MAP = { supply: 'Поставка', processing: 'Обработка', logistics: 'Логистика' };
  const STATUS_MAP = { active: 'В работе', done: 'Завершено', cancelled: 'Отменено' };

  const mapped = rows.map(r => ({
    ...r,
    type: TYPE_MAP[r.type] || r.type,
    status: STATUS_MAP[r.status] || r.status,
    created_at: new Date(r.created_at).toLocaleDateString('ru-RU'),
  }));

  const cols = [
    { key: 'number',        label: '№' },
    { key: 'company_name',  label: 'Клиент' },
    { key: 'type',          label: 'Тип' },
    { key: 'stage',         label: 'Этап' },
    { key: 'status',        label: 'Статус' },
    { key: 'places_count',  label: 'Мест' },
    { key: 'weight_kg',     label: 'Вес (кг)' },
    { key: 'delivery_type', label: 'Тип доставки' },
    { key: 'comment',       label: 'Комментарий' },
    { key: 'created_at',    label: 'Дата' },
  ];

  const date = new Date().toISOString().slice(0, 10);
  sendCSV(res, toCSV(mapped, cols), `orders_${date}.csv`);
});

// GET /api/export/charges?company_id=
router.get('/charges', async (req, res) => {
  const { company_id, from, to } = req.query;

  let q = db('charges')
    .join('companies', 'companies.id', 'charges.company_id')
    .leftJoin('orders', 'orders.id', 'charges.order_id')
    .select(
      'companies.name as company_name',
      'charges.tariff_code',
      'charges.description',
      'charges.quantity',
      'charges.unit_price',
      'charges.total',
      'charges.status',
      'orders.number as order_number',
      'charges.created_at'
    )
    .orderBy('charges.created_at', 'desc');

  if (company_id) q = q.where('charges.company_id', company_id);
  if (from) q = q.where('charges.created_at', '>=', from);
  if (to)   q = q.where('charges.created_at', '<=', to);

  const rows = await q.limit(5000);
  const STATUS_MAP = { pending: 'Ожидает', confirmed: 'Подтверждено', paid: 'Оплачено' };

  const mapped = rows.map(r => ({
    ...r,
    status: STATUS_MAP[r.status] || r.status,
    created_at: new Date(r.created_at).toLocaleDateString('ru-RU'),
  }));

  const cols = [
    { key: 'company_name',  label: 'Компания' },
    { key: 'tariff_code',   label: 'Код тарифа' },
    { key: 'description',   label: 'Описание' },
    { key: 'quantity',      label: 'Кол-во' },
    { key: 'unit_price',    label: 'Цена за ед.' },
    { key: 'total',         label: 'Сумма' },
    { key: 'status',        label: 'Статус' },
    { key: 'order_number',  label: 'Заявка' },
    { key: 'created_at',    label: 'Дата' },
  ];

  const date = new Date().toISOString().slice(0, 10);
  sendCSV(res, toCSV(mapped, cols), `charges_${date}.csv`);
});

// GET /api/export/warehouse-ops — история операций
router.get('/warehouse-ops', async (req, res) => {
  const { from, to, op_type } = req.query;

  let q = db('warehouse_ops')
    .join('products', 'products.id', 'warehouse_ops.product_id')
    .join('companies', 'companies.id', 'products.company_id')
    .leftJoin('users', 'users.id', 'warehouse_ops.created_by')
    .select(
      'warehouse_ops.created_at',
      'companies.name as company_name',
      'products.name as product_name',
      'products.article',
      'warehouse_ops.op_type',
      'warehouse_ops.quantity',
      'warehouse_ops.note',
      'users.full_name as manager'
    )
    .orderBy('warehouse_ops.created_at', 'desc');

  if (op_type) q = q.where('warehouse_ops.op_type', op_type);
  if (from) q = q.where('warehouse_ops.created_at', '>=', from);
  if (to)   q = q.where('warehouse_ops.created_at', '<=', to);

  const rows = await q.limit(10000);
  const OP_MAP = { in: 'Приход', out: 'Расход', defect: 'Брак', defect_return: 'Возврат из брака', write_off: 'Списание', move: 'Перемещение' };

  const mapped = rows.map(r => ({
    ...r,
    op_type: OP_MAP[r.op_type] || r.op_type,
    created_at: new Date(r.created_at).toLocaleDateString('ru-RU'),
  }));

  const cols = [
    { key: 'created_at',    label: 'Дата' },
    { key: 'company_name',  label: 'Компания' },
    { key: 'product_name',  label: 'Товар' },
    { key: 'article',       label: 'Артикул' },
    { key: 'op_type',       label: 'Операция' },
    { key: 'quantity',      label: 'Кол-во' },
    { key: 'note',          label: 'Комментарий' },
    { key: 'manager',       label: 'Менеджер' },
  ];

  const date = new Date().toISOString().slice(0, 10);
  sendCSV(res, toCSV(mapped, cols), `warehouse_ops_${date}.csv`);
});

module.exports = router;
