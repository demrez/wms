exports.seed = async function(knex) {
  await knex('service_consumables').del();
  await knex('service_templates').del();
  await knex('supply_item_ops').del();
  await knex('supply_items').del();

  const items = await knex('supply_items').insert([
    { name: 'Короб S (30x20x20)', sku: 'BOX-S', unit: 'pcs', stock_qty: 600, cost_price: 18, sale_price: 35, min_stock: 80 },
    { name: 'Короб M (40x30x30)', sku: 'BOX-M', unit: 'pcs', stock_qty: 420, cost_price: 28, sale_price: 55, min_stock: 60 },
    { name: 'Короб L (60x40x40)', sku: 'BOX-L', unit: 'pcs', stock_qty: 180, cost_price: 45, sale_price: 85, min_stock: 25 },
    { name: 'БОПП пакет', sku: 'BOPP', unit: 'pcs', stock_qty: 3000, cost_price: 1.8, sale_price: 3, min_stock: 400 },
    { name: 'Пакет zip-lock A4', sku: 'ZIP-A4', unit: 'pcs', stock_qty: 2000, cost_price: 1.2, sale_price: 3, min_stock: 250 },
    { name: 'Скотч коричневый 50 м', sku: 'TAPE-B', unit: 'roll', stock_qty: 120, cost_price: 55, sale_price: 0, min_stock: 20 },
    { name: 'Стретч-плёнка рулон', sku: 'FILM', unit: 'roll', stock_qty: 95, cost_price: 180, sale_price: 0, min_stock: 10 },
    { name: 'Пузырчатая плёнка 1 м', sku: 'BUBBLE', unit: 'm', stock_qty: 200, cost_price: 12, sale_price: 0, min_stock: 30 },
    { name: 'Этикетка 58x40', sku: 'LBL-S', unit: 'pcs', stock_qty: 5000, cost_price: 0.3, sale_price: 1, min_stock: 500 },
    { name: 'Термоэтикетка 100x150', sku: 'LBL-L', unit: 'pcs', stock_qty: 2000, cost_price: 0.8, sale_price: 2, min_stock: 200 },
    { name: 'Европаллета', sku: 'PALLET', unit: 'pcs', stock_qty: 40, cost_price: 350, sale_price: 450, min_stock: 8 },
  ]).returning('*');

  const bySku = Object.fromEntries(items.map((item) => [item.sku, item.id]));

  const services = await knex('service_templates').insert([
    { name: 'Приёмка товара — Забор груза', category: 'receiving', unit: 'per_order', base_price: 3000, sort_order: 1, description: 'Организация забора груза до склада фулфилмента' },
    { name: 'Приёмка товара — Разгрузка товара на складе ФФ', category: 'receiving', unit: 'per_order', base_price: 30, sort_order: 2, description: 'Разгрузка и подача коробов на приемку' },
    { name: 'Приёмка товара — Снятие мешков, пакетов, скотча и др. упаковки', category: 'receiving', unit: 'per_order', base_price: 100, sort_order: 3, description: 'Снятие транспортной упаковки перед приемкой' },
    { name: 'Приёмка товара — Принятие поставки на склад', category: 'receiving', unit: 'per_unit', base_price: 6, sort_order: 4, description: 'Поштучная приемка и заведение в учет' },
    { name: 'Обработка товара — Штрихкодирование товара', category: 'labeling', unit: 'per_unit', base_price: 6, sort_order: 5, description: 'Наклейка штрихкода и проверка читаемости' },
    { name: 'Обработка товара — Распределение по коробкам (микс)', category: 'packing', unit: 'per_order', base_price: 70, sort_order: 6, description: 'Распределение SKU по микс-коробам' },
    { name: 'Обработка товара — Короб 60/40/40', category: 'packing', unit: 'per_order', base_price: 150, sort_order: 7, description: 'Сборка и подготовка крупного транспортного короба' },
    { name: 'Обработка товара — Подготовка к поставке', category: 'packing', unit: 'per_order', base_price: 25, sort_order: 8, description: 'Финальная проверка и консолидация поставки' },
    { name: 'Обработка товара — Проверка на брак', category: 'photo', unit: 'per_unit', base_price: 25, sort_order: 9, description: 'Осмотр товара на дефекты и комплектность' },
    { name: 'Обработка товара — Упаковка в БОПП', category: 'packing', unit: 'per_unit', base_price: 25, sort_order: 10, description: 'Упаковка товара в БОПП-пакет' },
    { name: 'Обработка товара — Упаковка в zip-lock пакет', category: 'packing', unit: 'per_unit', base_price: 8, sort_order: 11, description: 'Упаковка мелких комплектующих в zip-lock пакет' },
    { name: 'Обработка товара — Стикеровка', category: 'labeling', unit: 'per_unit', base_price: 3, sort_order: 12, description: 'Наклейка служебных стикеров и маркировки МП' },
    { name: 'Обработка товара — Маркировка Честный Знак', category: 'labeling', unit: 'per_unit', base_price: 8, sort_order: 13, description: 'Нанесение кодов маркировки Честный Знак' },
    { name: 'Обработка товара — Формирование монопаллеты', category: 'packing', unit: 'per_order', base_price: 350, sort_order: 14, description: 'Сборка монопаллеты под отгрузку' },
    { name: 'Обработка товара — Стретч-упаковка паллеты', category: 'packing', unit: 'per_order', base_price: 150, sort_order: 15, description: 'Обмотка паллеты стрейч-пленкой' },
    { name: 'Обработка товара — Фотофиксация брака', category: 'photo', unit: 'per_unit', base_price: 10, sort_order: 16, description: 'Фотоотчет по бракованным товарам' },
    { name: 'Хранение (платное)', category: 'storage', unit: 'per_day', base_price: 0.5, sort_order: 17, description: 'Платное хранение единицы товара за день' },
    { name: 'Логистика WB — Оформление поставки', category: 'logistics', unit: 'per_order', base_price: 500, sort_order: 18, description: 'Оформление поставки в WB' },
    { name: 'Логистика WB — Алексин (Тула)', category: 'logistics', unit: 'per_order', base_price: 700, sort_order: 19, description: 'Доставка до склада WB Алексин' },
    { name: 'Логистика Ozon — Оформление поставки', category: 'logistics', unit: 'per_order', base_price: 550, sort_order: 20, description: 'Оформление поставки в Ozon' },
    { name: 'Логистика Яндекс.Маркет — Оформление поставки', category: 'logistics', unit: 'per_order', base_price: 550, sort_order: 21, description: 'Оформление поставки в Яндекс.Маркет' },
    { name: 'Приемка товара — Забор груза (ТЯК Москва / ТЦ Садовод / Южные ворота / Карго)', category: 'receiving', unit: 'per_m3', base_price: 2500, sort_order: 22, description: '2500р/м3; за каждый последующий м3 +1000р; въезд на территорию рынка, стоянка и грузчики оплачиваются отдельно' },
    { name: 'Приемка товара — Разгрузка товара на складе', category: 'receiving', unit: 'per_m3', base_price: 300, sort_order: 23, description: '300р/м3; за каждый последующий м3 +300р' },
    { name: 'Приемка товара — Пересчет товара при приёмке', category: 'receiving', unit: 'per_unit', base_price: 2, sort_order: 24, description: '2р/ед; пересчёт - обязательная услуга при обработке товара' },
    { name: 'Приемка товара — Сортировка по видам/цветам/размерам', category: 'receiving', unit: 'per_unit', base_price: 2, sort_order: 25, description: '2р/ед; включается, если более 1 баркода' },
    { name: 'Приемка товара — Отгрузка товара со склада (курьер/ТК)', category: 'logistics', unit: 'per_m3', base_price: 300, sort_order: 26, description: '300р/м3; за каждый последующий м3 +300р' },
    { name: 'Приемка товара — Фото/видео отчет при приёмке', category: 'photo', unit: 'per_order', base_price: 300, sort_order: 27, description: '300р; общий обзор грузовых мест' },
    { name: 'Приемка товара — Снятие обрешетки с короба', category: 'receiving', unit: 'per_unit', base_price: 200, sort_order: 28, description: '200р/ед' },
    { name: 'Приемка товара — Подготовка товара на фотосессию + отгрузка / приёмка', category: 'photo', unit: 'per_order', base_price: 300, sort_order: 29, description: '300р' },
    { name: 'Приемка товара — Оформление заявки на забор груза курьером', category: 'logistics', unit: 'per_order', base_price: 300, sort_order: 30, description: '300р; Яндекс / Достависта / СДЭК / ДЛ' },
    { name: 'Приемка товара — Транспортировочный короб / мешок', category: 'packing', unit: 'per_unit', base_price: 100, sort_order: 31, description: '100р' },
    { name: 'Обработка товара — Перекрытие ШК ВБ', category: 'labeling', unit: 'per_unit', base_price: 4, sort_order: 32, description: '4р/ед' },
    { name: 'Обработка товара — Снять / навесить бирку', category: 'labeling', unit: 'per_unit', base_price: 5, sort_order: 33, description: '5р/ед; пластиковый или веревочный биркодержатель' },
    { name: 'Обработка товара — Бирка - пустышка', category: 'labeling', unit: 'per_unit', base_price: 2, sort_order: 34, description: '2р/ед; белая бирка с двух сторон' },
    { name: 'Обработка товара — Маркировка одинарная', category: 'labeling', unit: 'per_unit', base_price: 7, sort_order: 35, description: '7р/этикетка; если одного баркода ШК меньше 10ед, цена х2' },
    { name: 'Обработка товара — Маркировка от 2-х этикеток', category: 'labeling', unit: 'per_unit', base_price: 6, sort_order: 36, description: '6р/этикетка; если одного баркода ШК меньше 10ед, цена х2' },
    { name: 'Обработка товара — Маркировка ЧЗ', category: 'labeling', unit: 'per_unit', base_price: 7, sort_order: 37, description: '7р/этикетка' },
    { name: 'Обработка товара — Маркировка ШК+ЧЗ', category: 'labeling', unit: 'per_unit', base_price: 10, sort_order: 38, description: '10р/этикетка; печать на термотрансферном принтере' },
    { name: 'Обработка товара — Упаковка товара в фабричную упаковку после маркировки', category: 'packing', unit: 'per_unit', base_price: 5, sort_order: 39, description: '5р/ед' },
    { name: 'Обработка товара — Вложение / изъятие вкладыша', category: 'packing', unit: 'per_unit', base_price: 2, sort_order: 40, description: '2р/ед' },
    { name: 'Обработка товара — Наклеить наклейку бренда с лого', category: 'labeling', unit: 'per_unit', base_price: 2, sort_order: 41, description: '2р/ед' },
    { name: 'Обработка товара — Фиксация скотчем', category: 'packing', unit: 'per_unit', base_price: 2, sort_order: 42, description: '2р/ед' },
    { name: 'Обработка товара — Фиксация круглой прозрачной этикеткой', category: 'packing', unit: 'per_unit', base_price: 2, sort_order: 43, description: '2р/ед' },
    { name: 'Обработка товара — Комплектовка / фасовка', category: 'packing', unit: 'per_unit', base_price: 10, sort_order: 44, description: 'от 10р/ед' },
    { name: 'Обработка товара — Снятие мерок для одежды (по ТЗ клиента)', category: 'other', unit: 'per_unit', base_price: 300, sort_order: 45, description: '300р/sku; 6 показателей' },
    { name: 'Обработка товара — Замер габаритов товара (длина, ширина, высота)', category: 'other', unit: 'per_unit', base_price: 100, sort_order: 46, description: '100р/sku' },
    { name: 'Обработка товара — Замер веса товара', category: 'other', unit: 'per_unit', base_price: 100, sort_order: 47, description: '100р/sku' },
    { name: 'Обработка товара — Отчет о наклеенных ЧЗ (по поставке)', category: 'labeling', unit: 'per_unit', base_price: 10, sort_order: 48, description: '10р/ед ЧЗ' },
    { name: 'Обработка товара — Печать бирок с ваших логотипом', category: 'labeling', unit: 'per_unit', base_price: 5, sort_order: 49, description: 'от 5р/ед' },
    { name: 'Обработка товара — Сборка коробок (четырехклапанная)', category: 'packing', unit: 'per_unit', base_price: 7, sort_order: 50, description: '7р/ед' },
    { name: 'Обработка товара — Сборка коробок (самосборная)', category: 'packing', unit: 'per_unit', base_price: 12, sort_order: 51, description: '12р/ед' },
    { name: 'Обработка товара — Сборка коробок (коробка-крышка)', category: 'packing', unit: 'per_unit', base_price: 15, sort_order: 52, description: '15р/ед' },
    { name: 'Обработка товара — Проверка на брак - 1 уровень', category: 'photo', unit: 'per_unit', base_price: 8, sort_order: 53, description: '8р/ед; стандартный осмотр' },
    { name: 'Обработка товара — Проверка на брак - 2 уровень', category: 'photo', unit: 'per_unit', base_price: 16, sort_order: 54, description: '16р/ед; детальная проверка' },
    { name: 'Обработка товара — Проверка на брак - 3 уровень', category: 'photo', unit: 'per_unit', base_price: 24, sort_order: 55, description: 'от 24р/ед; проверка по ТЗ клиента' },
    { name: 'Обработка товара — Обрезка ниток - 1 уровень', category: 'packing', unit: 'per_unit', base_price: 3, sort_order: 56, description: '3р/ед; мало ниток (1-3 места)' },
    { name: 'Обработка товара — Обрезка ниток - 2 уровень', category: 'packing', unit: 'per_unit', base_price: 6, sort_order: 57, description: '6р/ед; много ниток (4-6 мест)' },
    { name: 'Обработка товара — Обрезка ниток - 3 уровень', category: 'packing', unit: 'per_unit', base_price: 10, sort_order: 58, description: 'от 10р/ед; очень много ниток / обработка по ТЗ' },
    { name: 'Обработка товара — Фото брака каждой единицы товара', category: 'photo', unit: 'per_unit', base_price: 5, sort_order: 59, description: '5р/ед' },
    { name: 'Обработка товара — Укладка товара в упаковку клиента после проверки на брак', category: 'packing', unit: 'per_unit', base_price: 10, sort_order: 60, description: '10р/ед' },
    { name: 'Обработка товара — Отпаривание', category: 'other', unit: 'per_unit', base_price: 60, sort_order: 61, description: 'от 60р/ед' },
  ]).returning('*');

  const byService = Object.fromEntries(services.map((service) => [service.name, service.id]));

  await knex('service_consumables').insert([
    { service_id: byService['Обработка товара — Короб 60/40/40'], item_id: bySku['BOX-L'], qty_per_use: 1 },
    { service_id: byService['Обработка товара — Короб 60/40/40'], item_id: bySku['TAPE-B'], qty_per_use: 0.2 },
    { service_id: byService['Обработка товара — Упаковка в БОПП'], item_id: bySku['BOPP'], qty_per_use: 1 },
    { service_id: byService['Обработка товара — Упаковка в zip-lock пакет'], item_id: bySku['ZIP-A4'], qty_per_use: 1 },
    { service_id: byService['Обработка товара — Стикеровка'], item_id: bySku['LBL-S'], qty_per_use: 1 },
    { service_id: byService['Обработка товара — Маркировка Честный Знак'], item_id: bySku['LBL-L'], qty_per_use: 1 },
    { service_id: byService['Обработка товара — Стретч-упаковка паллеты'], item_id: bySku['FILM'], qty_per_use: 0.5 },
    { service_id: byService['Обработка товара — Формирование монопаллеты'], item_id: bySku['PALLET'], qty_per_use: 1 },
    { service_id: byService['Обработка товара — Формирование монопаллеты'], item_id: bySku['FILM'], qty_per_use: 0.5 },
    { service_id: byService['Обработка товара — Распределение по коробкам (микс)'], item_id: bySku['BOX-M'], qty_per_use: 1 },
    { service_id: byService['Обработка товара — Распределение по коробкам (микс)'], item_id: bySku['TAPE-B'], qty_per_use: 0.15 },
  ]);

  console.log('✅ Расходники и услуги созданы');
};
