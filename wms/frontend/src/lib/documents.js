export function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('ru-RU');
}

export function formatMoney(value) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function rublesToWords(value) {
  const unitsMale = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
  const unitsFemale = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
  const teens = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
  const tens = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
  const hundreds = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];
  const forms = [
    ['рубль', 'рубля', 'рублей'],
    ['тысяча', 'тысячи', 'тысяч'],
    ['миллион', 'миллиона', 'миллионов'],
  ];

  const plural = (num, [one, two, five]) => {
    const n10 = num % 10;
    const n100 = num % 100;
    if (n10 === 1 && n100 !== 11) return one;
    if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return two;
    return five;
  };

  const tripletToWords = (num, female = false) => {
    if (!num) return [];
    const words = [];
    const h = Math.floor(num / 100);
    const t = Math.floor((num % 100) / 10);
    const u = num % 10;
    if (h) words.push(hundreds[h]);
    if (t === 1) {
      words.push(teens[u]);
    } else {
      if (t) words.push(tens[t]);
      if (u) words.push((female ? unitsFemale : unitsMale)[u]);
    }
    return words;
  };

  let rubles = Math.floor(Number(value || 0));
  const kopecks = Math.round((Number(value || 0) - rubles) * 100);
  if (rubles === 0) return `ноль рублей ${String(kopecks).padStart(2, '0')} копеек`;

  const parts = [];
  let rank = 0;
  while (rubles > 0 && rank < forms.length) {
    const chunk = rubles % 1000;
    if (chunk) {
      const words = tripletToWords(chunk, rank === 1);
      parts.unshift(...words, plural(chunk, forms[rank]));
    }
    rubles = Math.floor(rubles / 1000);
    rank += 1;
  }

  return `${parts.join(' ')} ${String(kopecks).padStart(2, '0')} копеек`;
}

export function printDocument(title, html) {
  const win = window.open('', '_blank', 'width=980,height=760');
  if (!win) return;
  win.document.write(`
    <!doctype html>
    <html lang="ru">
      <head>
        <meta charset="UTF-8" />
        <title>${title}</title>
        <style>
          body { font-family: Manrope, Arial, sans-serif; color: #1f2937; padding: 32px; }
          h1 { font-size: 28px; margin: 0 0 8px; }
          h2 { font-size: 18px; margin: 24px 0 12px; }
          .muted { color: #6b7280; font-size: 14px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px; margin-top: 20px; }
          .row { display: flex; justify-content: space-between; gap: 16px; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { text-align: left; border-bottom: 1px solid #e5e7eb; padding: 10px 8px; font-size: 14px; }
          th { background: #f8fafc; }
          .totals { margin-top: 16px; max-width: 360px; margin-left: auto; }
          .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 56px; margin-top: 52px; align-items: end; }
          .sign-line {
            position: relative;
            min-height: 98px;
            padding-top: 20px;
            color: #475569;
            font-size: 12px;
            display: flex;
            flex-direction: column;
            justify-content: flex-end;
          }
          .sign-line::before {
            content: '';
            position: absolute;
            left: 0;
            top: 24px;
            width: 160px;
            border-top: 1px solid #94a3b8;
          }
        </style>
      </head>
      <body>${html}</body>
    </html>
  `);
  win.document.close();
  win.focus();
}

function buildCommonDocumentStyles() {
  return `
    .invoice,
    .doc-shell { font-family: Arial, sans-serif; color: #202020; }
    .invoice-top,
    .doc-top { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 18px; align-items: flex-start; }
    .invoice-title,
    .doc-title { font-size: 26px; font-weight: 700; margin-bottom: 8px; line-height: 1.08; color: #0f6e56; }
    .invoice-sub,
    .doc-sub { font-size: 13px; color: #4b5563; line-height: 1.45; }
    .invoice-qr,
    .doc-qr { width: 92px; height: 92px; background:
      linear-gradient(90deg,#111 8px,transparent 8px) 0 0/16px 16px,
      linear-gradient(#111 8px,transparent 8px) 0 0/16px 16px,
      linear-gradient(90deg,transparent 8px,#111 8px) 8px 8px/16px 16px,
      linear-gradient(transparent 8px,#111 8px) 8px 8px/16px 16px,
      #fff;
      border: 1px solid #d7dde5;
      border-radius: 8px;
      flex-shrink: 0;
    }
    .invoice-box-title,
    .doc-card-title { font-size: 14px; font-weight: 700; margin-bottom: 6px; }
    .invoice-box-text,
    .doc-card-text { font-size: 12px; line-height: 1.45; color: #374151; margin-bottom: 16px; }
    .invoice-box,
    .doc-box {
      border: 1px solid #bfe7d8;
      border-radius: 14px;
      padding: 16px 18px;
      margin-bottom: 16px;
      background: #fff;
    }
    .doc-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px; margin-top: 20px; }
    .doc-info-row { display: flex; justify-content: space-between; gap: 16px; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
    .doc-info-row strong { text-align: right; }
    .doc-table,
    .invoice-table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    .doc-table th, .doc-table td,
    .invoice-table th, .invoice-table td { text-align: left; border: 1px solid #d7dde5; padding: 8px 8px; font-size: 12px; vertical-align: top; }
    .doc-table th, .invoice-table thead th { background: #0f6e56; color: #fff; font-weight: 700; text-align: center; }
    .doc-table .center,
    .invoice-table td.center { text-align: center; }
    .doc-table .right,
    .invoice-table td.right { text-align: right; }
    .doc-table .muted,
    .invoice-table .muted { color: #6b7280; }
    .doc-table tfoot td,
    .invoice-table tfoot td { font-weight: 700; background: #fff; }
    .task-row td,
    .invoice-table .task-row td { border-top: none; background: #fafafa; }
    .doc-tz-task { font-size: 11px; color: #4b5563; line-height: 1.35; }
    .doc-totals { margin-top: 16px; max-width: 420px; margin-left: auto; }
    .doc-total-line,
    .invoice-total-line { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; }
    .doc-total-line strong,
    .invoice-total-line strong { font-weight: 700; }
    .doc-total-money,
    .invoice-total-money { color: #0f6e56; font-size: 30px; font-weight: 800; text-align: right; line-height: 1; }
    .doc-total-sub,
    .invoice-total-sub { font-size: 11px; color: #64748b; text-align: right; }
    .doc-words,
    .invoice-words { margin-top: 12px; font-size: 13px; font-weight: 700; }
    .doc-signatures,
    .invoice-signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 46px; margin-top: 46px; align-items: end; }
    .doc-sign-line,
    .invoice-sign-line {
      position: relative;
      min-height: 92px;
      padding-top: 14px;
      color: #475569;
      font-size: 12px;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
    }
    .doc-sign-line::before,
    .invoice-sign-line::before {
      content: '';
      position: absolute;
      left: 0;
      top: 18px;
      width: 150px;
      border-top: 1px solid #94a3b8;
    }
    .doc-sign-image,
    .invoice-sign-image {
      position: absolute;
      left: 0;
      top: -40px;
      max-width: 300px;
      max-height: 132px;
      object-fit: contain;
      display: block;
    }
  `;
}

function buildInvoiceLikeHeader({ title, subtitle, company, showQr = false }) {
  return `
    <div class="invoice-top">
      <div>
        <div class="invoice-title">${escapeHtml(title)}</div>
        ${subtitle ? `<div class="invoice-sub">${escapeHtml(subtitle)}</div>` : ''}
        ${company ? `<div class="invoice-sub">${escapeHtml(company)}</div>` : ''}
      </div>
      ${showQr ? '<div class="invoice-qr" aria-hidden="true"></div>' : ''}
    </div>
  `;
}

function buildSignatureBlock(profile, { prefix = 'С уважением,', counterpartyName = '—' } = {}) {
  const signatureLabel = profile?.signer_name || 'Иванов И.И.';
  const signerTitle = profile?.signer_title || 'Подписант';
  return `
    <div class="invoice-signatures">
      <div class="invoice-sign-line">
        ${profile?.signature_url ? `<img class="invoice-sign-image" src="${escapeHtml(profile.signature_url)}" alt="Подпись" />` : ''}
        <div>${escapeHtml(prefix)} ${escapeHtml(signatureLabel)}</div>
        <div>${escapeHtml(signerTitle)}</div>
      </div>
      <div class="invoice-sign-line">Заказчик: ${escapeHtml(counterpartyName)}</div>
    </div>
  `;
}

function buildInvoiceStyleBox(title, text) {
  return `
    <div class="invoice-box">
      <div class="invoice-box-title">${escapeHtml(title)}</div>
      <div class="invoice-box-text">${text}</div>
    </div>
  `;
}

export function buildInvoiceHtml(order, charges, fmt) {
  const profile = arguments[3] || {};
  const summary = charges?.summary || { total: 0, paid: 0, pending: 0 };
  const serviceRows = charges?.items || [];
  const consumableRows = (order?.consumables || []).map((item) => ({
    description: `Расходник: ${item.name}${item.comment ? ` (${item.comment})` : ''}`,
    quantity: Number(item.quantity || 0),
    unit: item.unit || 'шт',
    unit_price: Number(item.unit_price || 0),
    total: Number(item.total || Number(item.quantity || 0) * Number(item.unit_price || 0)),
  }));
  const shipmentRows = (order?.marketplace_shipments || []).map((item) => ({
    description: [
      `Логистика ${(item.marketplace || '').toUpperCase() || 'МП'}`,
      item.warehouse_name,
      item.places_count ? `${item.places_count} мест` : '',
      item.quantity ? `${item.quantity} ед.` : '',
      item.ship_date ? new Date(item.ship_date).toLocaleDateString('ru-RU') : '',
      item.note || '',
    ].filter(Boolean).join(' — '),
    quantity: Number(item.quantity || 1),
    unit: 'ед.',
    unit_price: Number(item.billing_unit_price ?? item.unit_price ?? 0),
    total: Number(item.billing_total ?? (Number(item.quantity || 1) * Number(item.billing_unit_price ?? item.unit_price ?? 0)) ?? 0),
  }));
  const rows = [...serviceRows, ...consumableRows, ...shipmentRows];
  const consumablesTotal = consumableRows.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const shipmentsTotal = shipmentRows.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const invoiceTotal = Number(summary.pending || summary.total || 0) + consumablesTotal + shipmentsTotal;
  const supplierName = profile.legal_name || profile.company_name || 'ООО «Фулфилмент»';
  const supplierInn = profile.inn || '7700000000';
  const supplierKpp = profile.kpp || '';
  const supplierOgrn = profile.ogrn || '';
  const supplierAddress = profile.address || 'г. Москва, ул. Складская, д. 1';
  const bankName = profile.bank_name || 'АО «Банк»';
  const bic = profile.bik || '044525000';
  const account = profile.correspondent_account || '30101810000000000000';
  const checking = profile.checking_account || '40702810000000000000';
  const bankAddress = profile.address || 'г. Москва';
  const totalWords = rublesToWords(invoiceTotal);
  return `
    <style>
      .invoice { font-family: Arial, sans-serif; color: #202020; }
      .invoice-top { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 18px; align-items: flex-start; }
      .invoice-title { font-size: 26px; font-weight: 700; margin-bottom: 8px; color: #0f6e56; }
      .invoice-sub { font-size: 13px; color: #4b5563; }
      .invoice-qr { width: 92px; height: 92px; background:
        linear-gradient(90deg,#111 8px,transparent 8px) 0 0/16px 16px,
        linear-gradient(#111 8px,transparent 8px) 0 0/16px 16px,
        linear-gradient(90deg,transparent 8px,#111 8px) 8px 8px/16px 16px,
        linear-gradient(transparent 8px,#111 8px) 8px 8px/16px 16px,
        #fff;
        border: 1px solid #d7dde5;
        border-radius: 8px;
      }
      .invoice-box-title { font-size: 14px; font-weight: 700; margin-bottom: 6px; }
      .invoice-box-text { font-size: 12px; line-height: 1.45; color: #374151; margin-bottom: 16px; }
      .invoice-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      .invoice-table th, .invoice-table td { border: 1px solid #d7dde5; padding: 8px 6px; font-size: 12px; vertical-align: top; }
      .invoice-table thead th { background: #0f6e56; color: #fff; text-align: center; font-weight: 700; }
      .invoice-table td.center { text-align: center; }
      .invoice-table td.right { text-align: right; }
      .invoice-table tfoot td { font-weight: 700; background: #fff; }
      .invoice-total-line { display: flex; justify-content: space-between; margin-top: 10px; font-size: 14px; font-weight: 700; }
      .invoice-total-money { color: #0f6e56; font-size: 30px; font-weight: 800; text-align: right; line-height: 1; }
      .invoice-total-sub { font-size: 11px; color: #64748b; text-align: right; }
      .invoice-words { margin-top: 12px; font-size: 13px; font-weight: 700; }
      .invoice-signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 46px; margin-top: 46px; align-items: end; }
      .invoice-sign-line {
        position: relative;
        min-height: 92px;
        padding-top: 14px;
        color: #475569;
        font-size: 12px;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
      }
      .invoice-sign-line::before {
        content: '';
        position: absolute;
        left: 0;
        top: 18px;
        width: 150px;
        border-top: 1px solid #94a3b8;
      }
      .invoice-sign-image {
        position: absolute;
        left: 0;
        top: -42px;
        max-width: 300px;
        max-height: 132px;
        object-fit: contain;
        display: block;
      }
    </style>
    <div class="invoice">
      <div class="invoice-top">
        <div>
          <div class="invoice-title">Счет на оплату</div>
          <div class="invoice-sub">Заявка #${order.number} от ${formatDateTime(order.created_at)}</div>
          <div class="invoice-sub">Клиент: ${order.company_name}</div>
        </div>
        <div class="invoice-qr" aria-hidden="true"></div>
      </div>

      <div class="invoice-box-title">Поставщик и банковские реквизиты</div>
      <div class="invoice-box-text">
        ${supplierName} • ИНН ${supplierInn}${supplierKpp ? ` • КПП ${supplierKpp}` : ''}${supplierOgrn ? ` • ОГРН ${supplierOgrn}` : ''}<br />
        Адрес: ${supplierAddress}<br /><br />
        Банк: ${bankName} • БИК ${bic} • Кор. счёт ${account}<br />
        Р/с ${checking}<br />
        Юр. адрес банка: ${bankAddress}
      </div>

      <table class="invoice-table">
        <thead>
          <tr>
            <th style="width: 42px;">№</th>
            <th>Товары (работы, услуги)</th>
            <th style="width: 58px;">Кол-во</th>
            <th style="width: 58px;">Ед.</th>
            <th style="width: 78px;">Цена, ₽</th>
            <th style="width: 70px;">Скидка, %</th>
            <th style="width: 92px;">Сумма скидки, ₽</th>
            <th style="width: 88px;">Сумма, ₽</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((item, index) => `
            <tr>
              <td class="center">${index + 1}</td>
              <td>${item.description || ''}</td>
              <td class="center">${fmt(item.quantity)}</td>
              <td class="center">${item.unit || 'шт'}</td>
              <td class="right">${formatNumber(item.unit_price)}</td>
              <td class="center">—</td>
              <td class="right">—</td>
              <td class="right">${formatNumber(item.total)}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="7" class="right">Итого к оплате</td>
            <td class="right">${formatNumber(invoiceTotal)}</td>
          </tr>
        </tfoot>
      </table>

      <div class="invoice-words">Всего к оплате (прописью): ${totalWords}</div>
      <div class="invoice-total-line">
        <div></div>
        <div>
          <div class="invoice-total-money">${formatNumber(invoiceTotal)} ₽</div>
          <div class="invoice-total-sub">без НДС</div>
        </div>
      </div>

      <div class="invoice-signatures">
        <div class="invoice-sign-line">
          ${profile?.signature_url ? `<img class="invoice-sign-image" src="${escapeHtml(profile.signature_url)}" alt="Подпись" />` : ''}
          <div>С уважением, ${escapeHtml(profile?.signer_name || 'Иванов И.И.')}</div>
          <div>${escapeHtml(profile?.signer_title || 'Подписант')}</div>
        </div>
        <div class="invoice-sign-line">Заказчик: ${escapeHtml(order.company_name || '—')}</div>
      </div>
    </div>
  `;
}

export function buildActHtml(order, charges, fmt) {
  const profile = arguments[3] || {};
  const summary = charges?.summary || { total: 0 };
  const serviceRows = charges?.items || [];
  const consumableRows = (order?.consumables || []).map((item) => ({
    description: `Расходник: ${item.name}${item.comment ? ` (${item.comment})` : ''}`,
    name: item.name,
    quantity: Number(item.quantity || 0),
    unit: item.unit || 'шт',
    unit_price: Number(item.unit_price || 0),
    total: Number(item.total || Number(item.quantity || 0) * Number(item.unit_price || 0)),
  }));
  const shipmentRows = (order?.marketplace_shipments || []).map((item) => ({
    description: [
      `Логистика ${(item.marketplace || '').toUpperCase() || 'МП'}`,
      item.warehouse_name,
      item.places_count ? `${item.places_count} мест` : '',
      item.quantity ? `${item.quantity} ед.` : '',
      item.ship_date ? new Date(item.ship_date).toLocaleDateString('ru-RU') : '',
      item.note || '',
    ].filter(Boolean).join(' — '),
    name: 'Логистика',
    quantity: Number(item.quantity || 1),
    unit: 'ед.',
    unit_price: Number(item.billing_unit_price ?? item.unit_price ?? 0),
    total: Number(item.billing_total ?? (Number(item.quantity || 1) * Number(item.billing_unit_price ?? item.unit_price ?? 0)) ?? 0),
  }));
  const rows = [...serviceRows, ...consumableRows, ...shipmentRows];
  const actTotal = rows.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const supplierName = profile.legal_name || profile.company_name || 'ООО «Фулфилмент»';
  const supplierInn = profile.inn || '7700000000';
  const supplierKpp = profile.kpp || '';
  const supplierOgrn = profile.ogrn || '';
  const supplierAddress = profile.address || 'г. Москва, ул. Складская, д. 1';
  return `
    <style>${buildCommonDocumentStyles()}</style>
    <div class="invoice doc-shell">
      ${buildInvoiceLikeHeader({
        title: 'Акт оказанных услуг',
        subtitle: `По заявке № ${escapeHtml(order.number)} от ${escapeHtml(formatDateTime(order.created_at))}`,
        company: order.company_name,
      })}

      ${buildInvoiceStyleBox(
        'Поставщик и реквизиты',
        `
        ${supplierName} • ИНН ${supplierInn}${supplierKpp ? ` • КПП ${supplierKpp}` : ''}${supplierOgrn ? ` • ОГРН ${supplierOgrn}` : ''}<br />
        Адрес: ${supplierAddress}
        `,
      )}

      <div class="invoice-box" style="margin-top: 0;">
        <div class="invoice-box-title">Заказчик / основание / тип заявки</div>
        <div class="invoice-box-text" style="margin-bottom: 0; display: flex; flex-wrap: wrap; gap: 18px 28px;">
          <span><strong>Заказчик:</strong> ${escapeHtml(order.company_name)}</span>
          <span><strong>Основание:</strong> Заявка ${escapeHtml(order.number)}</span>
          <span><strong>Тип заявки:</strong> ${escapeHtml(formatTypeLabel(order.type))}</span>
        </div>
      </div>

      <table class="invoice-table">
        <thead>
          <tr>
            <th style="width: 42px;">№</th>
            <th>Товар / услуга</th>
            <th style="width: 72px;">Кол-во</th>
            <th style="width: 62px;">Ед.</th>
            <th style="width: 86px;">Цена, ₽</th>
            <th style="width: 86px;">Сумма, ₽</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((item, index) => `
            <tr>
              <td class="center">${index + 1}</td>
              <td>
                <div style="font-weight: 600;">${escapeHtml(item.service_name || item.description || item.name || '—')}</div>
              </td>
              <td class="center">${escapeHtml(fmt(item.quantity))}</td>
              <td class="center">${escapeHtml(item.unit || 'шт')}</td>
              <td class="right">${formatNumber(item.unit_price)}</td>
              <td class="right">${formatNumber(item.total)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="doc-totals">
        <div class="doc-total-line"><span>Итого услуг и расходников:</span><strong>${formatMoney(actTotal || summary.total)}</strong></div>
      </div>

      ${buildSignatureBlock(profile, { counterpartyName: order.company_name || '—' })}
    </div>
  `;
}

function resolveDocumentDate(order) {
  return order.details?.delivery_date || order.details?.ship_date || order.created_at;
}

function resolveDocumentLocation(order) {
  if (order.type === 'logistics') return order.details?.dest_warehouse || '—';
  return order.details?.pickup_address || '—';
}

function resolveShipWarehouse(order) {
  if (order.type === 'logistics') return order.details?.dest_warehouse || '—';
  return order.details?.pickup_address || '—';
}

function formatTypeLabel(type) {
  return type === 'supply' ? 'Поставка' : type === 'processing' ? 'Обработка' : type === 'logistics' ? 'Логистика' : type;
}

function formatItemMeta(item) {
  const parts = [];
  if (item.color) parts.push(item.color);
  if (item.size) parts.push(item.size);
  if (item.composition) parts.push(item.composition);
  return parts.length ? parts.join(' / ') : '—';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function buildOrderSheetHtml(order, fmt, options = {}, profile = {}) {
  const rows = order.items || [];
  const totalQuantity = rows.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const acceptedQuantity = rows.reduce((sum, item) => sum + Number(item.ready_qty || item.quantity || 0), 0);
  const documentDate = resolveDocumentDate(order);
  const shipWarehouse = resolveShipWarehouse(order);
  const supplier = order.company_name || '—';
  const responsible = options.responsibleName || order.details?.contact_name || '—';
  const places = fmt(order.details?.places_count || 0);
  const weight = Number(order.details?.weight_kg || 0).toFixed(1);
  const volume = Number(order.details?.volume_m3 || 0).toFixed(1);

  return `
    <style>
      .doc-sheet { font-family: Arial, sans-serif; color: #202020; }
      .doc-sheet-title { text-align: center; font-size: 19px; font-weight: 700; margin-bottom: 16px; color: #0f6e56; }
      .doc-sheet-head { margin-bottom: 16px; line-height: 1.45; }
      .doc-sheet-line { font-size: 13px; font-weight: 700; }
      .doc-sheet-line span { font-weight: 400; font-size: 12px; }
      .sheet-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      .sheet-table th, .sheet-table td { border: 1px solid #d7dde5; padding: 4px 5px; font-size: 11px; vertical-align: top; }
      .sheet-table thead th { background: #0f6e56; font-weight: 700; text-align: center; font-size: 10px; color: #fff; }
      .sheet-table td.num, .sheet-table td.qty, .sheet-table td.fact, .sheet-table td.center { text-align: center; white-space: nowrap; }
      .sheet-table td.title { font-weight: 400; }
      .sheet-table td.meta { color: #4b5563; }
      .sheet-table td.title-wrap { line-height: 1.28; font-size: 10px; }
      .sheet-table tfoot td { font-size: 12px; font-weight: 700; background: #fff; }
      .sheet-table tfoot td.total-label { text-align: right; }
      .sheet-sign { display: grid; grid-template-columns: 1fr 1fr; gap: 46px; margin-top: 46px; align-items: end; }
      .sheet-sign-line {
        position: relative;
        min-height: 92px;
        padding-top: 14px;
        color: #475569;
        font-size: 12px;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
      }
      .sheet-sign-line::before {
        content: '';
        position: absolute;
        left: 0;
        top: 18px;
        width: 150px;
        border-top: 1px solid #94a3b8;
      }
    </style>
    <div class="doc-sheet">
      <div class="doc-sheet-title">Лист приёмки № ${escapeHtml(order.number)} от ${escapeHtml(new Date(documentDate).toLocaleDateString('ru-RU'))}</div>

      <div class="doc-sheet-head">
        <div class="doc-sheet-line">Поставщик<br /><span>${escapeHtml(supplier)}</span></div>
        <div class="doc-sheet-line">Ответственный<br /><span>${escapeHtml(responsible)}</span></div>
        <div class="doc-sheet-line">Мест ${escapeHtml(places)}&nbsp;&nbsp;&nbsp; Единиц ${escapeHtml(fmt(totalQuantity))}</div>
        <div class="doc-sheet-line">Вес груза ${escapeHtml(weight)} кг&nbsp;&nbsp;&nbsp; Объём ${escapeHtml(volume)} м³&nbsp;&nbsp;&nbsp; ${escapeHtml(shipWarehouse)}</div>
      </div>

      <table class="sheet-table">
        <thead>
          <tr>
            <th style="width: 48px;">Фото</th>
            <th style="width: 90px;">Штрих-код</th>
            <th style="width: 86px;">Артикул</th>
            <th>Наименование</th>
            <th style="width: 58px;">Цвет</th>
            <th style="width: 46px;">Размер</th>
            <th style="width: 64px;">Заявлено</th>
            <th style="width: 54px;">Принято</th>
            <th style="width: 44px;">Брак</th>
            <th style="width: 46px;">Вес</th>
            <th style="width: 24px;">Д</th>
            <th style="width: 24px;">Ш</th>
            <th style="width: 24px;">В</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((item, index) => `
            <tr>
              <td class="center">${item.photo_url ? `<img src="${escapeHtml(item.photo_url)}" alt="" style="width:34px;height:34px;object-fit:cover;display:block;margin:0 auto;" />` : '—'}</td>
              <td class="center">${escapeHtml(item.barcode || '—')}</td>
              <td class="center" style="color:#2563eb;">${escapeHtml(item.article || '—')}</td>
              <td class="title-wrap">${escapeHtml(item.product_name)}</td>
              <td class="center">${escapeHtml(item.color || '—')}</td>
              <td class="center">${escapeHtml(item.size || '—')}</td>
              <td class="qty">${escapeHtml(fmt(item.quantity))}</td>
              <td class="fact">${escapeHtml(fmt(item.ready_qty || item.quantity || 0))}</td>
              <td class="center">${escapeHtml(fmt(item.defect_qty || 0))}</td>
              <td class="center">${escapeHtml(item.weight_g ? fmt(item.weight_g) : '—')}</td>
              <td class="center">${escapeHtml(item.dim_l || '—')}</td>
              <td class="center">${escapeHtml(item.dim_w || '—')}</td>
              <td class="center">${escapeHtml(item.dim_h || '—')}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="6" class="total-label">Итого:</td>
            <td class="center">${escapeHtml(fmt(totalQuantity))}</td>
            <td class="center">${escapeHtml(fmt(acceptedQuantity))}</td>
            <td colspan="5"></td>
          </tr>
        </tfoot>
      </table>

      <div class="sheet-sign">
        <div class="sheet-sign-line">
          ${profile?.signature_url ? `<img class="doc-sign-image" src="${escapeHtml(profile.signature_url)}" alt="Подпись" />` : ''}
          <div>С уважением, ${escapeHtml(profile?.signer_name || 'Иванов И.И.')}</div>
          <div>${escapeHtml(profile?.signer_title || 'Подписант')}</div>
        </div>
        <div class="sheet-sign-line">Заказчик: ${escapeHtml(order.company_name || '—')}</div>
      </div>
    </div>
  `;
}

export function buildIdentificationSheetHtml(order, fmt, profile = {}) {
  const rows = order.items || [];
  return `
    <style>${buildCommonDocumentStyles()}</style>
    <div class="invoice doc-shell">
      ${buildInvoiceLikeHeader({
        title: 'Лист идентификации',
        subtitle: `Заявка № ${escapeHtml(order.number)} · ${escapeHtml(formatDateTime(resolveDocumentDate(order)))}`,
        company: order.company_name,
        showQr: false,
      })}

      ${buildInvoiceStyleBox(
        'Назначение документа',
        `
        Сверка товара, артикулов, баркодов, маркировки и характеристик перед приемкой или обработкой.
        `,
      )}

      <table class="invoice-table">
        <thead>
          <tr>
            <th style="width: 40px;">№</th>
            <th>Товар</th>
            <th style="width: 100px;">Артикул</th>
            <th style="width: 150px;">Штрихкод</th>
            <th style="width: 180px;">Идентификаторы</th>
            <th style="width: 70px;">Кол-во</th>
            <th style="width: 110px;">Маркировка</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((item, index) => `
            <tr>
              <td class="center">${index + 1}</td>
              <td style="font-weight: 600;">${escapeHtml(item.product_name)}</td>
              <td class="center">${escapeHtml(item.article || '—')}</td>
              <td class="center">${escapeHtml(item.barcode || '—')}</td>
              <td>${escapeHtml(formatItemMeta(item))}</td>
              <td class="center">${escapeHtml(fmt(item.quantity))}</td>
              <td>${escapeHtml(item.pack_note || 'Требуется проверка и маркировка')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="invoice-box" style="margin-top: 18px;">
        <div class="invoice-box-title">Примечание</div>
        <div class="invoice-box-text" style="margin-bottom: 0;">
        Документ используется для проверки идентификации товара, артикулов, штрихкодов и маркировки перед обработкой или отгрузкой.
        </div>
      </div>

      ${buildSignatureBlock(profile, { counterpartyName: order.company_name || '—' })}
    </div>
  `;
}

export function buildTechnicalTaskHtml(order, fmt, profile = {}) {
  const rows = order.items || [];
  const totalQuantity = rows.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  return `
    <style>${buildCommonDocumentStyles()}</style>
    <div class="invoice doc-shell">
      ${buildInvoiceLikeHeader({
        title: 'Техническое задание',
        subtitle: `Заявка № ${escapeHtml(order.number)} · ${escapeHtml(formatDateTime(resolveDocumentDate(order)))}`,
        company: order.company_name,
        showQr: false,
      })}

      ${buildInvoiceStyleBox(
        'Параметры заявки',
        `
        <div class="doc-info-grid" style="margin-top: 0;">
          <div class="doc-info-row"><span>Тип заявки</span><strong>${escapeHtml(formatTypeLabel(order.type))}</strong></div>
          <div class="doc-info-row"><span>Склад отгрузки</span><strong>${escapeHtml(resolveShipWarehouse(order))}</strong></div>
          <div class="doc-info-row"><span>Комментарий</span><strong>${escapeHtml(order.comment || 'Без комментария')}</strong></div>
          <div class="doc-info-row"><span>Контакт</span><strong>${escapeHtml(order.details?.contact_name || '—')}</strong></div>
          <div class="doc-info-row"><span>Телефон</span><strong>${escapeHtml(order.details?.contact_phone || '—')}</strong></div>
          <div class="doc-info-row"><span>Всего единиц</span><strong>${escapeHtml(fmt(totalQuantity))}</strong></div>
        </div>
        `,
      )}

      <div class="invoice-box-title" style="margin-top: 22px;">Состав и задачи</div>
      <table class="invoice-table">
        <thead>
          <tr>
            <th style="width: 40px;">№</th>
            <th>Товар</th>
            <th style="width: 90px;">Артикул</th>
            <th style="width: 70px;">Кол-во</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((item, index) => `
            <tr>
              <td class="num">${index + 1}</td>
              <td style="font-weight: 600;">${escapeHtml(item.product_name)}</td>
              <td style="text-align:center;">${escapeHtml(item.article || '—')}</td>
              <td style="text-align:center;">${escapeHtml(fmt(item.quantity))}</td>
            </tr>
            <tr class="task-row">
              <td></td>
              <td colspan="3" class="doc-tz-task">${escapeHtml(item.pack_note || (order.type === 'processing' ? 'Обработать товар по стандарту заявки' : 'Подготовить товар по регламенту заявки'))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="invoice-box" style="margin-top: 18px;">
        <div class="invoice-box-title">Комментарий к заданию</div>
        <div class="invoice-box-text" style="margin-bottom: 0;">
        Исполнитель выполняет работы в соответствии с составом заявки, комментариями по позициям и действующим регламентом склада.
        </div>
      </div>

      ${buildSignatureBlock(profile, { counterpartyName: order.company_name || '—' })}
    </div>
  `;
}
