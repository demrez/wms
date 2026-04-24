const db = require('../db/knex');
const wb    = require('./wb');
const ozon  = require('./ozon');
const yandex = require('./yandex');

// ── Логирование ──────────────────────────────────────────────────
async function log(connectionId, action, status, itemsCount = 0, errorMsg = null) {
  await db('mp_sync_log').insert({ connection_id: connectionId, action, status, items_count: itemsCount, error_msg: errorMsg });
  await db('mp_connections').where({ id: connectionId }).update({
    last_sync_at: new Date(),
    last_sync_status: status,
    updated_at: new Date(),
  });
}

// ── Нормализация товаров из разных МП в единый формат ───────────
function normalizeWbProduct(card) {
  const barcode = card.sizes?.[0]?.skus?.[0] || '';
  const photo =
    card.photos?.[0]?.big ||
    card.photos?.[0]?.c246x328 ||
    card.photos?.[0]?.tm ||
    card.mediaFiles?.[0] ||
    '';
  return {
    mp_sku: String(card.nmID || card.nmId || ''),
    mp_barcode: barcode,
    mp_article: card.vendorCode || '',
    mp_name: card.title || card.subjectName || '',
    mp_photo_url: photo,
  };
}

function normalizeOzonProduct(item) {
  const photo = item.primary_image || item.images?.[0] || item.image?.[0] || '';
  return {
    mp_sku: String(item.id || item.product_id || ''),
    mp_barcode: item.barcode || item.barcodes?.[0] || '',
    mp_article: item.offer_id || '',
    mp_name: item.name || '',
    mp_photo_url: photo,
  };
}

function normalizeYandexProduct(mapping) {
  return {
    mp_sku: mapping.offer?.shopSku || '',
    mp_barcode: mapping.offer?.barcodes?.[0] || '',
    mp_article: mapping.offer?.shopSku || '',
    mp_name: mapping.offer?.name || '',
    mp_photo_url: mapping.offer?.pictures?.[0]?.url || '',
  };
}

// ── Импорт товаров из МП ─────────────────────────────────────────
async function importProducts(connectionId) {
  const conn = await db('mp_connections').where({ id: connectionId }).first();
  if (!conn) throw new Error('Подключение не найдено');

  let rawProducts = [];

  try {
    if (conn.marketplace === 'wb') {
      rawProducts = await wb.importAllProducts(conn.api_key);
    } else if (conn.marketplace === 'ozon') {
      rawProducts = await ozon.importAllProducts(conn.client_id, conn.api_key);
    } else if (conn.marketplace === 'yandex') {
      rawProducts = await yandex.importAllProducts(conn.api_key, conn.campaign_id);
    }
  } catch (err) {
    await log(connectionId, 'import_products', 'error', 0, err.message);
    throw err;
  }

  // Нормализуем
  const normalize = conn.marketplace === 'wb' ? normalizeWbProduct
    : conn.marketplace === 'ozon' ? normalizeOzonProduct
    : normalizeYandexProduct;

  const normalized = rawProducts.map(normalize).filter(p => p.mp_barcode || p.mp_sku);

  let matched = 0, created = 0, skipped = 0;

  for (const mpProduct of normalized) {
    // Ищем наш товар по штрихкоду или артикулу
    let product = null;

    if (mpProduct.mp_barcode) {
      const barcode = await db('product_barcodes')
        .where({ marketplace: conn.marketplace, barcode: mpProduct.mp_barcode })
        .first();
      if (barcode) {
        product = await db('products').where({ id: barcode.product_id }).first();
      }
    }

    if (!product && mpProduct.mp_article) {
      product = await db('products')
        .where({ company_id: conn.company_id, article: mpProduct.mp_article })
        .first();
    }

    if (product) {
      // Обновляем или создаём запись mp_products
      await db('mp_products')
        .insert({
          product_id: product.id,
          connection_id: connectionId,
          ...mpProduct,
          synced_at: new Date(),
        })
        .onConflict(['product_id', 'connection_id'])
        .merge({ ...mpProduct, synced_at: new Date() });

      // Обновляем штрихкод если его нет
      if (mpProduct.mp_barcode) {
        await db('product_barcodes')
          .insert({
            product_id: product.id,
            marketplace: conn.marketplace,
            barcode: mpProduct.mp_barcode,
            article_mp: mpProduct.mp_article,
          })
          .onConflict(['product_id', 'marketplace'])
          .merge({ barcode: mpProduct.mp_barcode, article_mp: mpProduct.mp_article });
      }
      if (mpProduct.mp_photo_url && !product.photo_url) {
        await db('products').where({ id: product.id }).update({
          photo_url: mpProduct.mp_photo_url,
          updated_at: new Date(),
        });
      }
      matched++;
    } else {
      // Создаём новый товар автоматически
      if (mpProduct.mp_name) {
        const [newProduct] = await db('products').insert({
          company_id: conn.company_id,
          name: mpProduct.mp_name,
          article: mpProduct.mp_article || null,
          photo_url: mpProduct.mp_photo_url || null,
        }).returning('*');

        await db('stock').insert({ product_id: newProduct.id });

        await db('mp_products').insert({
          product_id: newProduct.id,
          connection_id: connectionId,
          ...mpProduct,
          synced_at: new Date(),
        });

        if (mpProduct.mp_barcode) {
          await db('product_barcodes').insert({
            product_id: newProduct.id,
            marketplace: conn.marketplace,
            barcode: mpProduct.mp_barcode,
            article_mp: mpProduct.mp_article,
          }).onConflict().ignore();
        }
        created++;
      } else {
        skipped++;
      }
    }
  }

  await log(connectionId, 'import_products', 'ok', matched + created);
  return { total: rawProducts.length, matched, created, skipped };
}

// ── Отправка остатков на МП ──────────────────────────────────────
async function pushStocks(connectionId) {
  const conn = await db('mp_connections').where({ id: connectionId }).first();
  if (!conn?.warehouse_id) throw new Error('Не задан склад для FBS');

  // Берём все привязанные товары и их остатки
  const mpProducts = await db('mp_products')
    .join('products', 'products.id', 'mp_products.product_id')
    .join('stock', 'stock.product_id', 'products.id')
    .where('mp_products.connection_id', connectionId)
    .select(
      'mp_products.*',
      db.raw('GREATEST(0, stock.quantity - stock.defect_qty - stock.reserved_qty) as available_qty')
    );

  if (!mpProducts.length) {
    await log(connectionId, 'push_stocks', 'ok', 0);
    return { updated: 0 };
  }

  try {
    let result;

    if (conn.marketplace === 'wb') {
      const stocks = mpProducts
        .filter(p => p.mp_barcode)
        .map(p => ({ sku: p.mp_barcode, amount: Number(p.available_qty) }));
      result = await wb.pushStocks(conn.api_key, conn.warehouse_id, stocks);

    } else if (conn.marketplace === 'ozon') {
      const stocks = mpProducts
        .filter(p => p.mp_sku)
        .map(p => ({
          product_id: Number(p.mp_sku),
          warehouse_id: conn.warehouse_id,
          stock: Number(p.available_qty),
        }));
      result = await ozon.pushStocks(conn.client_id, conn.api_key, stocks);

    } else if (conn.marketplace === 'yandex') {
      const stocks = mpProducts
        .filter(p => p.mp_sku)
        .map(p => ({
          sku: p.mp_sku,
          warehouseId: conn.warehouse_id,
          count: Number(p.available_qty),
        }));
      result = await yandex.pushStocks(conn.api_key, conn.campaign_id, stocks);
    }

    // Сохраняем что отправили
    for (const p of mpProducts) {
      await db('mp_products').where({ id: p.id })
        .update({ last_stock_sent: Number(p.available_qty), synced_at: new Date() });
    }

    await log(connectionId, 'push_stocks', 'ok', mpProducts.length);
    return { updated: mpProducts.length };

  } catch (err) {
    await log(connectionId, 'push_stocks', 'error', 0, err.message);
    throw err;
  }
}

// ── Авто-синхронизация всех активных подключений ─────────────────
// Вызывается cron-ом каждые 15 минут
async function syncAll() {
  const connections = await db('mp_connections')
    .where({ is_active: true, auto_sync_stocks: true });

  const results = [];
  for (const conn of connections) {
    try {
      const result = await pushStocks(conn.id);
      results.push({ id: conn.id, marketplace: conn.marketplace, ...result });
    } catch (err) {
      results.push({ id: conn.id, marketplace: conn.marketplace, error: err.message });
    }
  }
  return results;
}

module.exports = { importProducts, pushStocks, syncAll };
