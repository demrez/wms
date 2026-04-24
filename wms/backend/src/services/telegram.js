// Telegram Bot уведомления при смене этапов заявок

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_IDS  = (process.env.TELEGRAM_CHAT_IDS || '').split(',').filter(Boolean);

const STAGE_LABELS = {
  new: 'Новая', approval: 'Согласование', pickup: 'Забор груза',
  in_transit: 'В пути', receiving: 'Приёмка', accepted: 'Принято',
  waiting: 'Ожидает', in_progress: 'В работе', delivered: 'Доставлено', mp_shipping: 'Отгрузка на МП', done: 'Готово',
};
const TYPE_LABELS = { supply: 'Поставка', processing: 'Обработка', logistics: 'Логистика' };

// Только эти переходы достойны уведомлений — не спамим на каждый клик
const NOTIFY_STAGES = new Set(['pickup', 'in_transit', 'receiving', 'accepted', 'mp_shipping', 'done']);

async function sendMessageToChat(chatId, text) {
  const targetChatId = String(chatId || '').trim();
  if (!TELEGRAM_BOT_TOKEN || !targetChatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: targetChatId, text, parse_mode: 'HTML' }),
    });
  } catch (err) {
    console.error('Telegram error:', err.message);
  }
}

async function sendMessage(text) {
  if (TELEGRAM_CHAT_IDS.length === 0) return;
  for (const chatId of TELEGRAM_CHAT_IDS) {
    await sendMessageToChat(chatId, text);
  }
}

async function notifyStageChange({ order, newStage, note, changedBy }) {
  if (!NOTIFY_STAGES.has(newStage)) return;

  const emoji = {
    pickup: '🚛', in_transit: '📦', receiving: '🏭',
    accepted: '✅', mp_shipping: '🧭', done: '🎉',
  }[newStage] || '📋';

  const lines = [
    `${emoji} <b>Заявка #${order.number} — ${STAGE_LABELS[newStage]}</b>`,
    ``,
    `Клиент: ${order.company_name}`,
    `Тип: ${TYPE_LABELS[order.type] || order.type}`,
    `Этап: ${STAGE_LABELS[order.stage]} → <b>${STAGE_LABELS[newStage]}</b>`,
  ];

  if (note) lines.push(`\nКомментарий: ${note}`);
  if (changedBy) lines.push(`Менеджер: ${changedBy}`);

  await sendMessage(lines.join('\n'));
}

async function notifyCompanyStageChange({ company, order, newStage, note, changedBy }) {
  if (!company?.telegram_notifications || !company?.telegram_chat_id) return;

  const emoji = {
    new: '🆕',
    approval: '🤝',
    pickup: '🚛',
    in_transit: '📦',
    receiving: '🏭',
    accepted: '✅',
    waiting: '⏳',
    in_progress: '🔧',
    delivered: '🚚',
    mp_shipping: '🧭',
    done: '🎉',
  }[newStage] || '📋';

  const lines = [
    `${emoji} <b>Заявка #${order.number} — ${STAGE_LABELS[newStage] || newStage}</b>`,
    ``,
    `Клиент: ${order.company_name || company.name}`,
    `Тип: ${TYPE_LABELS[order.type] || order.type}`,
    `Этап: ${STAGE_LABELS[order.stage] || order.stage} → <b>${STAGE_LABELS[newStage] || newStage}</b>`,
  ];

  if (note) lines.push(`\nКомментарий: ${note}`);
  if (changedBy) lines.push(`Менеджер: ${changedBy}`);

  await sendMessageToChat(company.telegram_chat_id, lines.join('\n'));
}

async function notifyNewOrder({ order, companyName }) {
  const lines = [
    `📥 <b>Новая заявка #${order.number}</b>`,
    ``,
    `Клиент: ${companyName}`,
    `Тип: ${TYPE_LABELS[order.type] || order.type}`,
  ];
  if (order.comment) lines.push(`Комментарий: ${order.comment}`);
  await sendMessage(lines.join('\n'));
}

async function notifyDefect({ productName, companyName, defectQty, orderNumber }) {
  const text = [
    `⚠️ <b>Брак при приёмке</b>`,
    ``,
    `Товар: ${productName}`,
    `Клиент: ${companyName}`,
    `Кол-во брака: ${defectQty} шт.`,
    `Заявка: #${orderNumber}`,
  ].join('\n');
  await sendMessage(text);
}

module.exports = {
  notifyStageChange,
  notifyCompanyStageChange,
  notifyNewOrder,
  notifyDefect,
};
