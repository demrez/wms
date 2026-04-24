const db = require('../db/knex');
const { notifyStageChange } = require('./telegram');

// Найти user_id клиента по company_id
async function getUserByCompany(companyId) {
  const company = await db('companies').where({ id: companyId }).first();
  return company?.user_id || null;
}

// Создать уведомление в БД
async function createNotification({ userId, type, title, body, orderId, invoiceId }) {
  if (!userId) return null;
  const [n] = await db('client_notifications').insert({
    user_id: userId, type, title, body,
    order_id: orderId || null,
    invoice_id: invoiceId || null,
  }).returning('*');
  return n;
}

// Смена этапа заявки → уведомить клиента
async function notifyOrderStage({ order, newStage, note }) {
  const STAGE_LABELS = {
    new:'Новая', approval:'Согласование', pickup:'Забор груза',
    in_transit:'В пути', receiving:'Приёмка', accepted:'Принято',
    waiting:'Ожидает', in_progress:'В работе', delivered:'Доставлено',
    mp_shipping: 'Отгрузка на МП',
    done:'Готово',
  };
  const TYPE_LABELS = { supply:'Поставка', processing:'Обработка', logistics:'Логистика' };

  const userId = await getUserByCompany(order.company_id);
  if (!userId) return;

  await createNotification({
    userId,
    type: 'order_stage',
    title: `Заявка #${order.number} — ${STAGE_LABELS[newStage] || newStage}`,
    body: note || `Тип: ${TYPE_LABELS[order.type] || order.type}. Статус изменён.`,
    orderId: order.id,
  });
}

// Новый счёт → уведомить клиента
async function notifyNewInvoice({ invoice, companyId }) {
  const userId = await getUserByCompany(companyId);
  if (!userId) return;

  await createNotification({
    userId,
    type: 'invoice',
    title: `Новый счёт №${invoice.number}`,
    body: `Сумма: ${Number(invoice.total).toLocaleString('ru-RU')} ₽. Доступен для скачивания.`,
    invoiceId: invoice.id,
  });
}

// Брак при приёмке → уведомить клиента
async function notifyDefectFound({ order, productName, defectQty }) {
  const userId = await getUserByCompany(order.company_id);
  if (!userId) return;

  await createNotification({
    userId,
    type: 'defect',
    title: `Обнаружен брак при приёмке`,
    body: `Товар: ${productName}. Кол-во: ${defectQty} шт. Заявка #${order.number}.`,
    orderId: order.id,
  });
}

// Информационное уведомление
async function notifyInfo({ companyId, title, body }) {
  const userId = await getUserByCompany(companyId);
  if (!userId) return;
  await createNotification({ userId, type: 'info', title, body });
}

module.exports = {
  createNotification,
  notifyOrderStage,
  notifyNewInvoice,
  notifyDefectFound,
  notifyInfo,
};
