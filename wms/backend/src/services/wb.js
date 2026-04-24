// Wildberries API v2/v3
// Документация: https://openapi.wildberries.ru

const WB_STATS_URL    = 'https://statistics-api.wildberries.ru';
const WB_CONTENT_URL  = 'https://content-api.wildberries.ru';
const WB_MP_URL       = 'https://marketplace-api.wildberries.ru';
const WB_PRICES_URL   = 'https://discounts-prices-api.wildberries.ru';
const WB_SUPPLIES_URL = 'https://supplies-api.wildberries.ru';

async function wbRequest(apiKey, baseUrl, path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: {
      'Authorization': apiKey,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${baseUrl}${path}`, opts);

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let detail = text;
    try {
      const parsed = JSON.parse(text);
      if (parsed?.detail) detail = parsed.detail;
      if (parsed?.title && parsed?.detail) detail = `${parsed.title}: ${parsed.detail}`;
    } catch (_) {}

    if (res.status === 401 && /token scope not allowed/i.test(text)) {
      throw new Error(
        'Токен WB создан без нужных прав. Для импорта товаров включите доступ к разделу "Контент (карточки товаров)".'
      );
    }

    throw new Error(`WB API ${method} ${path} → ${res.status}: ${detail}`);
  }

  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return null;
}

// ── Проверка токена ──────────────────────────────────────────────
async function testConnection(apiKey) {
  try {
    // Запрашиваем список складов — простой способ проверить токен
    const data = await wbRequest(apiKey, WB_SUPPLIES_URL, '/api/v3/warehouses');
    return { ok: true, warehouses: data || [] };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── Получить склады WB (для настройки подключения) ───────────────
async function getWarehouses(apiKey) {
  return wbRequest(apiKey, WB_SUPPLIES_URL, '/api/v3/warehouses');
}

// ── Импорт товаров из WB ─────────────────────────────────────────
// Возвращает массив товаров с nmId, артикулами, штрихкодами
async function importProducts(apiKey, { limit = 100, offset = 0 } = {}) {
  const body = {
    settings: {
      cursor: { limit, offset },
      filter: { withPhoto: -1 },
    },
  };
  const data = await wbRequest(apiKey, WB_CONTENT_URL, '/content/v2/get/cards/list', 'POST', body);
  return data?.cards || [];
}

// Получить все товары (постранично)
async function importAllProducts(apiKey) {
  const all = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const cards = await importProducts(apiKey, { limit, offset });
    all.push(...cards);
    if (cards.length < limit) break;
    offset += limit;
  }
  return all;
}

// ── Обновить остатки FBS на складе ──────────────────────────────
// stocks: [{ sku: '123', amount: 50 }, ...]
async function pushStocks(apiKey, warehouseId, stocks) {
  if (!stocks.length) return { updatedRows: 0 };

  // WB принимает максимум 1000 записей за раз
  const chunks = [];
  for (let i = 0; i < stocks.length; i += 1000) {
    chunks.push(stocks.slice(i, i + 1000));
  }

  let totalUpdated = 0;
  for (const chunk of chunks) {
    const body = { stocks: chunk.map(s => ({ sku: String(s.sku), amount: Math.max(0, s.amount) })) };
    await wbRequest(apiKey, WB_SUPPLIES_URL, `/api/v3/stocks/${warehouseId}`, 'PUT', body);
    totalUpdated += chunk.length;
  }
  return { updatedRows: totalUpdated };
}

// ── Создать поставку FBO ─────────────────────────────────────────
async function createSupply(apiKey, name) {
  const data = await wbRequest(apiKey, WB_SUPPLIES_URL, '/api/v3/supplies', 'POST', { name });
  return data; // { id: 'WB-GI-...' }
}

// Добавить заказы в поставку
async function addOrdersToSupply(apiKey, supplyId, orderIds) {
  for (const orderId of orderIds) {
    await wbRequest(apiKey, WB_SUPPLIES_URL, `/api/v3/supplies/${supplyId}/orders/${orderId}`, 'PATCH');
  }
}

// Закрыть поставку
async function closeSupply(apiKey, supplyId) {
  return wbRequest(apiKey, WB_SUPPLIES_URL, `/api/v3/supplies/${supplyId}/deliver`, 'PATCH');
}

// ── Получить штрихкоды для стикеров ─────────────────────────────
async function getOrderStickers(apiKey, orderIds) {
  const body = { orders: orderIds };
  return wbRequest(apiKey, WB_SUPPLIES_URL, '/api/v3/orders/stickers?type=png&width=58&height=40', 'POST', body);
}

module.exports = {
  testConnection,
  getWarehouses,
  importAllProducts,
  importProducts,
  pushStocks,
  createSupply,
  addOrdersToSupply,
  closeSupply,
  getOrderStickers,
};
