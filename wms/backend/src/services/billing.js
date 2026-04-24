const db = require('../db/knex');

// Получить актуальную цену тарифа для компании (инд. тариф или глобальный)
async function getTariffPrice(companyId, tariffCode) {
  const custom = await db('company_tariffs')
    .where({ company_id: companyId, tariff_code: tariffCode })
    .first();
  if (custom) return Number(custom.price);

  const global = await db('tariffs').where({ code: tariffCode, is_active: true }).first();
  return global ? Number(global.price) : 0;
}

// Создать начисление
async function createCharge({
  companyId,
  orderId,
  tariffCode,
  description,
  quantity,
  createdBy,
  unitPrice: unitPriceOverride,
  discount = 0,
}) {
  const unitPrice = unitPriceOverride ?? await getTariffPrice(companyId, tariffCode);
  if (unitPrice === 0) return null; // бесплатно — не создаём запись

  const safeDiscount = Math.max(0, Math.min(100, Number(discount || 0)));
  const total = Number((unitPrice * quantity).toFixed(2));
  const [charge] = await db('charges').insert({
    company_id: companyId,
    order_id: orderId,
    tariff_code: tariffCode,
    description,
    quantity,
    unit_price: unitPrice,
    total,
    discount: safeDiscount,
    created_by: createdBy,
  }).returning('*');
  return charge;
}

// Начислить за приёмку (вызывается при завершении supply-заявки)
async function chargeReceiving({ order, items, userId }) {
  const totalUnits = items.reduce((s, i) => s + Number(i.ready_qty || 0), 0);
  if (totalUnits === 0) return;

  await createCharge({
    companyId: order.company_id,
    orderId: order.id,
    tariffCode: 'receiving_per_unit',
    description: `Приёмка по заявке #${order.number} — ${totalUnits} ед.`,
    quantity: totalUnits,
    createdBy: userId,
  });
}

// Начислить за обработку
async function chargeProcessing({ order, items, userId }) {
  const totalUnits = items.reduce((s, i) => s + Number(i.ready_qty || 0), 0);
  if (totalUnits === 0) return;

  await createCharge({
    companyId: order.company_id,
    orderId: order.id,
    tariffCode: 'processing_per_unit',
    description: `Обработка по заявке #${order.number} — ${totalUnits} ед.`,
    quantity: totalUnits,
    createdBy: userId,
  });
}

// Начислить за логистику
async function chargeLogistics({ order, items, userId }) {
  // Фиксированная часть за оформление
  await createCharge({
    companyId: order.company_id,
    orderId: order.id,
    tariffCode: 'logistics_per_order',
    description: `Логистика по заявке #${order.number} (оформление)`,
    quantity: 1,
    createdBy: userId,
  });

  // За каждую единицу
  const totalUnits = items.reduce((s, i) => s + Number(i.quantity || 0), 0);
  if (totalUnits > 0) {
    await createCharge({
      companyId: order.company_id,
      orderId: order.id,
      tariffCode: 'logistics_per_unit',
      description: `Логистика по заявке #${order.number} — ${totalUnits} ед.`,
      quantity: totalUnits,
      createdBy: userId,
    });
  }
}

// Начислить за брак
async function chargeDefects({ order, defectItems, userId }) {
  const totalDefects = defectItems.reduce((s, i) => s + Number(i.defect_qty || 0), 0);
  if (totalDefects === 0) return;

  await createCharge({
    companyId: order.company_id,
    orderId: order.id,
    tariffCode: 'defect_processing',
    description: `Обработка брака по заявке #${order.number} — ${totalDefects} ед.`,
    quantity: totalDefects,
    createdBy: userId,
  });
}

// Получить сводку начислений по компании
async function getCompanySummary(companyId) {
  const [row] = await db('charges')
    .where({ company_id: companyId })
    .sum('total as total_charged')
    .sum(db.raw("case when status = 'paid' then total else 0 end as total_paid"))
    .sum(db.raw("case when status != 'paid' then total else 0 end as total_pending"));
  return row;
}

module.exports = {
  getTariffPrice, createCharge,
  chargeReceiving, chargeProcessing, chargeLogistics, chargeDefects,
  getCompanySummary,
};
