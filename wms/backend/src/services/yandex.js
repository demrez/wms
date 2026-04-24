// Яндекс.Маркет Partner API
// Документация: https://yandex.ru/dev/market/partner-api/

const YA_URL = 'https://api.partner.market.yandex.ru';

async function yaRequest(apiKey, campaignId, path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const url = path.startsWith('/campaigns/')
    ? `${YA_URL}${path}`
    : `${YA_URL}/campaigns/${campaignId}${path}`;

  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Яндекс.Маркет API ${method} ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

// ── Проверка подключения ─────────────────────────────────────────
async function testConnection(apiKey, campaignId) {
  try {
    const data = await yaRequest(apiKey, campaignId, '/warehouses');
    return { ok: true, warehouses: data?.result?.warehouses || [] };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── Получить склады ──────────────────────────────────────────────
async function getWarehouses(apiKey, campaignId) {
  const data = await yaRequest(apiKey, campaignId, '/warehouses');
  return data?.result?.warehouses || [];
}

// ── Импорт товаров ───────────────────────────────────────────────
async function importProducts(apiKey, campaignId, { page = 1, pageSize = 200 } = {}) {
  const data = await yaRequest(apiKey, campaignId, `/offer-mappings?page=${page}&pageSize=${pageSize}`);
  return data?.result?.offerMappings || [];
}

async function importAllProducts(apiKey, campaignId) {
  const all = [];
  let page = 1;
  while (true) {
    const items = await importProducts(apiKey, campaignId, { page, pageSize: 200 });
    all.push(...items);
    if (items.length < 200) break;
    page++;
  }
  return all;
}

// ── Обновить остатки ─────────────────────────────────────────────
// stocks: [{ sku: '...', warehouseId: 123, count: 50 }]
async function pushStocks(apiKey, campaignId, stocks) {
  if (!stocks.length) return;
  const body = {
    skus: stocks.map(s => ({
      sku: s.sku,
      warehouseStocks: [{ warehouseId: s.warehouseId, count: Math.max(0, s.count) }],
    })),
  };
  return yaRequest(apiKey, campaignId, '/offers/stocks', 'PUT', body);
}

module.exports = { testConnection, getWarehouses, importAllProducts, pushStocks };
