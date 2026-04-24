const bcrypt = require('bcryptjs');

function skuBarcode(prefix, index) {
  return `${prefix}${String(index).padStart(8, '0')}`;
}

exports.seed = async function(knex) {
  await knex('charges').del();
  await knex('company_tariffs').del();
  await knex('warehouse_ops').del();
  await knex('logistics').del();
  await knex('supply_details').del();
  await knex('order_stages').del();
  await knex('order_items').del();
  await knex('orders').del();
  await knex('stock').del();
  await knex('product_barcodes').del();
  await knex('products').del();
  await knex('companies').del();
  await knex('users').del();

  const adminHash = await bcrypt.hash('admin123', 10);
  const clientHash = await bcrypt.hash('client123', 10);

  const [admin] = await knex('users').insert({
    email: 'admin@wms.ru',
    password_hash: adminHash,
    role: 'admin',
    full_name: 'Администратор WMS',
    phone: '+7 999 100-10-10',
  }).returning('*');

  const [manager] = await knex('users').insert({
    email: 'manager@wms.ru',
    password_hash: adminHash,
    role: 'manager',
    full_name: 'Менеджер склада',
    phone: '+7 999 200-20-20',
  }).returning('*');

  const clientProfiles = [
    {
      user: { email: 'client1@wms.ru', full_name: 'Кузьмичева Елена Сергеевна', phone: '+7 900 111-11-11' },
      company: {
        name: 'ИП Кузьмичева Елена Сергеевна',
        legal_name: 'Индивидуальный предприниматель Кузьмичева Елена Сергеевна',
        inn: '771234567890',
        phone: '+7 495 111-11-11',
        address: 'Москва, ул. Южнопортовая, д. 7, стр. 2',
      },
      products: [
        { name: 'Игровой набор Боба Фетт против Кэла Байна', article: 'nabor03', brand: 'BrickLands', color: 'серый', size: '—', weight_g: 420, country: 'Россия', composition: 'ABS-пластик', stock: { quantity: 260, defect_qty: 4, reserved_qty: 20, paid_storage: false }, pack_note: 'В пакет' },
        { name: 'Игровой набор Большой динозавр Индоминус-рекс', article: 'nabor01', brand: 'BrickLands', color: 'белый', size: '—', weight_g: 610, country: 'Россия', composition: 'ABS-пластик', stock: { quantity: 145, defect_qty: 2, reserved_qty: 12, paid_storage: false }, pack_note: 'В пакет. БЕЛЫЕ ДИНОЗАВРЫ' },
      ],
      order: {
        type: 'processing',
        stage: 'in_progress',
        status: 'active',
        comment: 'Проверить комплектность и уложить в индивидуальные пакеты.',
      },
    },
    {
      user: { email: 'client2@wms.ru', full_name: 'Бабикина Маргарита Владимировна', phone: '+7 900 222-22-22' },
      company: {
        name: 'ООО "Маркет Норд"',
        legal_name: 'Общество с ограниченной ответственностью "Маркет Норд"',
        inn: '7801456789',
        phone: '+7 812 222-22-22',
        address: 'Санкт-Петербург, Московское ш., д. 25, корп. 1',
      },
      products: [
        { name: 'Термопринтер для этикеток Bluetooth Wi-Fi', article: 'TP2BW2', brand: 'LabelRun', color: 'черный', size: 'M', weight_g: 980, country: 'Китай', composition: 'Пластик, металл', stock: { quantity: 58, defect_qty: 3, reserved_qty: 5, paid_storage: true }, pack_note: 'Проверить наличие кабеля питания' },
        { name: 'Набор хозяйственного кускового мыла 2 шт', article: 'soap-kit-2', brand: 'EcoHome', color: 'бежевый', size: '2 шт', weight_g: 220, country: 'Россия', composition: 'Натуральное мыло', stock: { quantity: 312, defect_qty: 0, reserved_qty: 18, paid_storage: false }, pack_note: 'Комплектовать по 2 штуки' },
      ],
      order: {
        type: 'supply',
        stage: 'pickup',
        status: 'active',
        comment: 'Забрать коробки со склада клиента и принять поштучно.',
        supply: {
          delivery_type: 'Водитель Фулфилмента',
          delivery_date: '2026-04-11T10:30:00.000Z',
          pickup_address: 'Санкт-Петербург, Московское ш., д. 25, корп. 1',
          places_count: 18,
          weight_kg: 148.5,
          volume_m3: 2.4,
          cargo_number: 'SPB-240411-18',
          contact_name: 'Бабикина Маргарита Владимировна',
          contact_phone: '+7 900 222-22-22',
        },
      },
    },
    {
      user: { email: 'client3@wms.ru', full_name: 'Асланов Сеймур Фархадин Оглы', phone: '+7 900 333-33-33' },
      company: {
        name: 'ИП Асланов Сеймур Фархадин Оглы',
        legal_name: 'Индивидуальный предприниматель Асланов Сеймур Фархадин Оглы',
        inn: '500334455667',
        phone: '+7 495 333-33-33',
        address: 'Московская область, Подольск, Домодедовское ш., д. 12',
      },
      products: [
        { name: 'Беспроводной 2D сканер штрихкодов для ПВЗ', article: 'SVI3', brand: 'ScanMaster', color: 'фиолетовый', size: '—', weight_g: 265, country: 'Китай', composition: 'Пластик', stock: { quantity: 277, defect_qty: 0, reserved_qty: 70, paid_storage: false }, pack_note: 'Наклеить стикер ПВЗ' },
        { name: 'Сканер штрих кода беспроводной 2D с Bluetooth', article: 'SBU2', brand: 'ScanMaster', color: 'синий', size: '—', weight_g: 250, country: 'Китай', composition: 'Пластик', stock: { quantity: 290, defect_qty: 4, reserved_qty: 40, paid_storage: false }, pack_note: 'Проверить заряд кабеля' },
      ],
      order: {
        type: 'logistics',
        stage: 'approval',
        status: 'active',
        comment: 'Доставить поставку через транзитный склад WB.',
        logistics: {
          dest_type: 'transit',
          dest_warehouse: 'WB - Электросталь',
          ship_date: '2026-04-12T08:00:00.000Z',
          pass_number: 'WB-GI-210663679',
        },
      },
    },
    {
      user: { email: 'client4@wms.ru', full_name: 'Чернобыль Максим Владимирович', phone: '+7 900 444-44-44' },
      company: {
        name: 'ООО "Точка Нова"',
        legal_name: 'Общество с ограниченной ответственностью "Точка Нова"',
        inn: '5409876543',
        phone: '+7 383 444-44-44',
        address: 'Новосибирск, ул. Станционная, д. 60/1',
      },
      products: [
        { name: 'Арбалеты и колчаны для рыцарей LEGO', article: 'R45', brand: 'BrickForge', color: 'коричневый', size: '—', weight_g: 110, country: 'Россия', composition: 'ABS-пластик', stock: { quantity: 180, defect_qty: 1, reserved_qty: 16, paid_storage: false }, pack_note: 'Пакет. В пакет сортируем по 10 комплектов' },
        { name: 'Баллиста для фигурок LEGO', article: 'R28', brand: 'BrickForge', color: 'коричневый', size: '—', weight_g: 95, country: 'Россия', composition: 'ABS-пластик', stock: { quantity: 94, defect_qty: 0, reserved_qty: 6, paid_storage: false }, pack_note: 'Пакет' },
      ],
      order: {
        type: 'processing',
        stage: 'waiting',
        status: 'active',
        comment: 'Собрать наборы и проверить артикула перед маркировкой.',
      },
    },
    {
      user: { email: 'client5@wms.ru', full_name: 'Дьяков Иван Игоревич', phone: '+7 900 555-55-55' },
      company: {
        name: 'ООО "СканМаркет"',
        legal_name: 'Общество с ограниченной ответственностью "СканМаркет"',
        inn: '1650456123',
        phone: '+7 843 555-55-55',
        address: 'Казань, ул. Восстания, д. 102',
      },
      products: [
        { name: 'Сканер штрих кода 2D беспроводной Bluetooth', article: 'SOR1', brand: 'ScanMaster', color: 'оранжевый', size: '—', weight_g: 240, country: 'Китай', composition: 'Пластик', stock: { quantity: 415, defect_qty: 9, reserved_qty: 30, paid_storage: true }, pack_note: 'Комплектовать с инструкцией' },
        { name: 'Паста для розжига огня Розжигатор №1', article: 'R40', brand: 'FireGo', color: 'серый', size: '40 мл', weight_g: 48, country: 'Россия', composition: 'Гелеобразный состав', stock: { quantity: 34, defect_qty: 0, reserved_qty: 4, paid_storage: false }, pack_note: 'карточку собрал правильно Алексей' },
      ],
      order: {
        type: 'supply',
        stage: 'receiving',
        status: 'active',
        comment: 'Поставка на склад с последующей проверкой брака.',
        supply: {
          delivery_type: 'Самостоятельно',
          delivery_date: '2026-04-10T15:00:00.000Z',
          pickup_address: 'Казань, ул. Восстания, д. 102',
          places_count: 7,
          weight_kg: 82,
          volume_m3: 1.1,
          cargo_number: 'KZN-240410-07',
          contact_name: 'Дьяков Иван Игоревич',
          contact_phone: '+7 900 555-55-55',
        },
      },
    },
  ];

  const createdCompanies = [];
  const createdProducts = [];

  let barcodeIndex = 1;
  for (const profile of clientProfiles) {
    const [clientUser] = await knex('users').insert({
      email: profile.user.email,
      password_hash: clientHash,
      role: 'client',
      full_name: profile.user.full_name,
      phone: profile.user.phone,
    }).returning('*');

    const [company] = await knex('companies').insert({
      user_id: clientUser.id,
      name: profile.company.name,
      legal_name: profile.company.legal_name,
      inn: profile.company.inn,
      phone: profile.company.phone,
      address: profile.company.address,
    }).returning('*');

    createdCompanies.push(company);

    for (const productData of profile.products) {
      const [product] = await knex('products').insert({
        company_id: company.id,
        name: productData.name,
        article: productData.article,
        brand: productData.brand,
        color: productData.color,
        size: productData.size,
        weight_g: productData.weight_g,
        country: productData.country,
        composition: productData.composition,
        photo_url: null,
      }).returning('*');

      await knex('product_barcodes').insert([
        {
          product_id: product.id,
          marketplace: 'ff',
          barcode: skuBarcode('2001', barcodeIndex),
          article_mp: productData.article,
        },
        {
          product_id: product.id,
          marketplace: 'wb',
          barcode: skuBarcode('2012', barcodeIndex),
          article_mp: `${productData.article}-WB`,
        },
        {
          product_id: product.id,
          marketplace: 'ozon',
          barcode: skuBarcode('2039', barcodeIndex),
          article_mp: `${productData.article}-OZ`,
        },
      ]);

      await knex('stock').insert({
        product_id: product.id,
        quantity: productData.stock.quantity,
        defect_qty: productData.stock.defect_qty,
        reserved_qty: productData.stock.reserved_qty,
        paid_storage: productData.stock.paid_storage,
      });

      createdProducts.push({ ...product, pack_note: productData.pack_note, company_id: company.id });
      barcodeIndex += 1;
    }
  }

  const ordersPlan = [
    { companyIndex: 0, productIndexes: [0, 1] },
    { companyIndex: 1, productIndexes: [2, 3] },
    { companyIndex: 2, productIndexes: [4, 5] },
    { companyIndex: 3, productIndexes: [6, 7] },
    { companyIndex: 4, productIndexes: [8, 9] },
  ];

  for (let i = 0; i < ordersPlan.length; i += 1) {
    const profile = clientProfiles[i];
    const company = createdCompanies[ordersPlan[i].companyIndex];
    const products = ordersPlan[i].productIndexes.map((index) => createdProducts[index]);

    const [order] = await knex('orders').insert({
      company_id: company.id,
      type: profile.order.type,
      stage: profile.order.stage,
      status: profile.order.status,
      comment: profile.order.comment,
      created_by: manager.id,
    }).returning('*');

    const orderItems = products.map((product, itemIndex) => {
      const quantity = [200, 100, 40, 25, 10, 18, 7, 55, 30, 12][i * 2 + itemIndex] || 20;
      const readyQty = profile.order.type === 'processing' ? Math.max(quantity - (itemIndex + 1) * 2, 0) : quantity;
      const defectQty = profile.order.type === 'processing' && itemIndex === 1 ? 2 : 0;
      return {
        order_id: order.id,
        product_id: product.id,
        quantity,
        ready_qty: readyQty,
        defect_qty: defectQty,
        pack_note: product.pack_note,
      };
    });

    await knex('order_items').insert(orderItems);
    await knex('order_stages').insert([
      { order_id: order.id, stage: 'new', note: 'Заявка создана', changed_by: manager.id },
      { order_id: order.id, stage: profile.order.stage, note: 'Актуальный этап заявки', changed_by: manager.id },
    ]);

    if (profile.order.supply) {
      await knex('supply_details').insert({ order_id: order.id, ...profile.order.supply });
    }

    if (profile.order.logistics) {
      await knex('logistics').insert({ order_id: order.id, ...profile.order.logistics });
    }

    const totalQuantity = orderItems.reduce((sum, item) => sum + item.quantity, 0);
    await knex('charges').insert([
      {
        company_id: company.id,
        order_id: order.id,
        tariff_code: 'processing_per_unit',
        description: 'Обработка товарных единиц',
        quantity: totalQuantity,
        unit_price: 12.5,
        total: totalQuantity * 12.5,
        status: i % 2 === 0 ? 'confirmed' : 'pending',
        created_by: manager.id,
      },
      {
        company_id: company.id,
        order_id: order.id,
        tariff_code: 'logistics_per_order',
        description: 'Логистическое сопровождение заявки',
        quantity: 1,
        unit_price: 750,
        total: 750,
        status: i === 0 ? 'paid' : 'pending',
        created_by: manager.id,
      },
    ]);
  }

  await knex('warehouse_ops').insert([
    {
      product_id: createdProducts[8].id,
      op_type: 'in',
      quantity: 120,
      note: 'Приёмка поставки по заявке',
      created_by: manager.id,
    },
    {
      product_id: createdProducts[0].id,
      op_type: 'defect',
      quantity: 4,
      note: 'Выявлен брак при обработке',
      created_by: manager.id,
    },
    {
      product_id: createdProducts[4].id,
      op_type: 'move',
      quantity: 60,
      note: 'Перемещение на транзитный склад',
      created_by: manager.id,
    },
  ]);

  console.log('✅ Seed выполнен');
  console.log('   admin@wms.ru / admin123');
  console.log('   manager@wms.ru / admin123');
  console.log('   client1@wms.ru / client123');
  console.log('   client2@wms.ru / client123');
  console.log('   client3@wms.ru / client123');
  console.log('   client4@wms.ru / client123');
  console.log('   client5@wms.ru / client123');
};
