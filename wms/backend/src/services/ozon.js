// Ozon Seller API v2/v3
// Документация: https://docs.ozon.ru/api/seller/

const OZON_URL = 'https://api-seller.ozon.ru';

async function ozonRequest(clientId, apiKey, path, method = 'POST', body = null) {
  const opts = {
    method,
    headers: {
      'Client-Id': clientId,
      'Api-Key': apiKey,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${OZON_URL}${path}`, opts);

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Ozon API ${method} ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

// ── Проверка подключения ─────────────────────────────────────────
async function testConnection(clientId, apiKey) {
  try {
    const data = await ozonRequest(clientId, apiKey, '/v1/warehouse/list');
    return { ok: true, warehouses: data?.result || [] };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── Получить склады ──────────────────────────────────────────────
async function getWarehouses(clientId, apiKey) {
  const data = await ozonRequest(clientId, apiKey, '/v1/warehouse/list');
  return data?.result || [];
}

// ── Импорт товаров из Ozon ───────────────────────────────────────
async function importProducts(clientId, apiKey, { limit = 100, offset = 0 } = {}) {
  const body = {
    filter: { visibility: 'ALL' },
    last_id: '',
    limit,
    sort_by: 'product_id',
    sort_dir: 'ASC',
  };

  const data = await ozonRequest(clientId, apiKey, '/v2/product/list', 'POST', body);
  if (!data?.result?.items?.length) return [];

  // Получаем детали товаров (штрихкоды, артикулы)
  const productIds = data.result.items.map(i => i.product_id);
  const details = await ozonRequest(clientId, apiKey, '/v2/product/info/list', 'POST', {
    product_id: productIds,
  });

  return details?.result?.items || [];
}

async function importAllProducts(clientId, apiKey) {
  const all = [];
  let lastId = '';
  const limit = 100;

  while (true) {
    const body = {
      filter: { visibility: 'ALL' },
      last_id: lastId,
      limit,
    };
    const data = await ozonRequest(clientId, apiKey, '/v2/product/list', 'POST', body);
    const items = data?.result?.items || [];
    if (!items.length) break;

    const productIds = items.map(i => i.product_id);
    const details = await ozonRequest(clientId, apiKey, '/v2/product/info/list', 'POST', { product_id: productIds });
    all.push(...(details?.result?.items || []));

    lastId = data.result.last_id;
    if (!lastId || items.length < limit) break;
  }
  return all;
}

// ── Обновить остатки FBS ─────────────────────────────────────────
// stocks: [{ product_id: 123, warehouse_id: '...', stock: 50 }]
async function pushStocks(clientId, apiKey, stocks) {
  if (!stocks.length) return { result: [] };

  const chunks = [];
  for (let i = 0; i < stocks.length; i += 100) {
    chunks.push(stocks.slice(i, i + 100));
  }

  const results = [];
  for (const chunk of chunks) {
    const data = await ozonRequest(clientId, apiKey, '/v2/products/stocks', 'POST', { stocks: chunk });
    results.push(...(data?.result || []));
  }
  return { result: results };
}

// ── Создать поставку FBO ─────────────────────────────────────────
async function createSupply(clientId, apiKey, { warehouseId, items, arrivalDate }) {
  // items: [{ product_id, quantity }]
  const body = {
    warehouse_id: warehouseId,
    items,
    arrival_date: arrivalDate, // ISO string
  };
  return ozonRequest(clientId, apiKey, '/v2/supply-order/create', 'POST', body);
}

module.exports = {
  testConnection,
  getWarehouses,
  importAllProducts,
  importProducts,
  pushStocks,
  createSupply,
};
