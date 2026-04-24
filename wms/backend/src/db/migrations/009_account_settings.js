exports.up = async function(knex) {
  await knex.schema.createTable('account_settings', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('brand_name', 255).notNullable().defaultTo('FluxWMS');
    t.string('company_name', 255).notNullable().defaultTo('ООО «Фулфилмент»');
    t.string('legal_name', 255);
    t.string('inn', 20);
    t.string('kpp', 20);
    t.string('ogrn', 20);
    t.string('address', 500);
    t.string('phone', 50);
    t.string('email', 255);
    t.string('bank_name', 255);
    t.string('bik', 50);
    t.string('checking_account', 64);
    t.string('correspondent_account', 64);
    t.string('signer_name', 255);
    t.string('signer_title', 255);
    t.string('site_url', 255);
    t.boolean('is_default').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });

  await knex('account_settings').insert({
    brand_name: 'FluxWMS',
    company_name: 'ООО «Фулфилмент»',
    legal_name: 'Общество с ограниченной ответственностью «Фулфилмент»',
    inn: '7700000000',
    kpp: '770001001',
    ogrn: '1027700000000',
    address: 'г. Москва, ул. Складская, д. 1',
    phone: '+7 (495) 000-00-00',
    email: 'info@fulfillment.ru',
    bank_name: 'АО «Банк»',
    bik: '044525000',
    checking_account: '40702810000000000000',
    correspondent_account: '30101810000000000000',
    signer_name: 'Иванов Иван Иванович',
    signer_title: 'Генеральный директор',
    site_url: 'https://example.com',
    is_default: true,
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('account_settings');
};
