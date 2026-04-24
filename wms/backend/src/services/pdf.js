// PDF генерация через pdfmake (npm install pdfmake)
const path = require('path');
const fs = require('fs');
const db = require('../db/knex');

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const PDF_DIR = path.join(UPLOAD_DIR, 'pdfs');
if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR, { recursive: true });

const BASE_URL = process.env.BASE_URL || 'https://www.smart-wms.ru';

// Цвета бренда
const TEAL = '#0F6E56';
const LIGHT_TEAL = '#E1F5EE';
const GRAY = '#6E6C66';
const LIGHT_GRAY = '#F8F8F6';

function resolvePdfFonts() {
  const roboto = {
    normal: path.join(__dirname, '../../assets/fonts/Roboto-Regular.ttf'),
    bold: path.join(__dirname, '../../assets/fonts/Roboto-Bold.ttf'),
    italics: path.join(__dirname, '../../assets/fonts/Roboto-Italic.ttf'),
    bolditalics: path.join(__dirname, '../../assets/fonts/Roboto-BoldItalic.ttf'),
  };

  const hasRoboto = [roboto.normal, roboto.bold, roboto.italics]
    .every((fontPath) => fs.existsSync(fontPath));

  if (hasRoboto) {
    return {
      fonts: { Roboto: roboto },
      defaultFont: 'Roboto',
    };
  }

  // Надёжный fallback для серверов без кастомных ttf-файлов (Ubuntu обычно имеет DejaVu).
  const dejavu = {
    normal: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    bold: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    // На некоторых минимальных образах есть только regular/bold.
    italics: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf',
    bolditalics: '/usr/share/fonts/truetype/dejavu/DejaVuSans-BoldOblique.ttf',
  };
  const hasDejavuBase = [dejavu.normal, dejavu.bold].every((p) => fs.existsSync(p));
  if (hasDejavuBase) {
    const safeDejavu = {
      normal: dejavu.normal,
      bold: dejavu.bold,
      italics: fs.existsSync(dejavu.italics) ? dejavu.italics : dejavu.normal,
      bolditalics: fs.existsSync(dejavu.bolditalics) ? dejavu.bolditalics : dejavu.bold,
    };
    return { fonts: { DejaVu: safeDejavu }, defaultFont: 'DejaVu' };
  }

  // Последний fallback: пусть pdfmake попытается использовать системный Helvetica (может не сработать на некоторых окружениях).
  return { fonts: { Helvetica: { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' } }, defaultFont: 'Helvetica' };
}

async function getRequisites() {
  const settings = await db('account_settings').where({ is_default: true }).first().catch(() => null);
  return {
    name: settings?.company_name || process.env.COMPANY_NAME || 'ООО «Фулфилмент»',
    legalName: settings?.legal_name || settings?.company_name || process.env.COMPANY_NAME || 'ООО «Фулфилмент»',
    inn: settings?.inn || process.env.COMPANY_INN || '7700000000',
    kpp: settings?.kpp || process.env.COMPANY_KPP || '',
    ogrn: settings?.ogrn || process.env.COMPANY_OGRN || '',
    address: settings?.address || process.env.COMPANY_ADDRESS || 'г. Москва, ул. Складская, д. 1',
    phone: settings?.phone || process.env.COMPANY_PHONE || '+7 (495) 000-00-00',
    email: settings?.email || process.env.COMPANY_EMAIL || 'info@fulfillment.ru',
    bank: settings?.bank_name || process.env.COMPANY_BANK || 'АО «Банк»',
    bik: settings?.bik || process.env.COMPANY_BIK || '044525000',
    account: settings?.checking_account || process.env.COMPANY_ACCOUNT || '40702810000000000000',
    correspondentAccount: settings?.correspondent_account || process.env.COMPANY_CORR_ACCOUNT || '',
    signerName: settings?.signer_name || process.env.COMPANY_SIGNER_NAME || 'Генеральный директор',
    signerTitle: settings?.signer_title || process.env.COMPANY_SIGNER_TITLE || 'Генеральный директор',
    siteUrl: settings?.site_url || process.env.COMPANY_SITE_URL || '',
    signature_url: settings?.signature_url || null,
  };
}

function buildPaymentQrPayload(req, amount, invoiceNumber) {
  const sum = Math.max(0, Math.round(Number(amount || 0) * 100));
  const clean = (value) => String(value || '').replace(/\|/g, ' ').replace(/\n/g, ' ').trim();
  const lines = [
    'ST00012',
    `Name=${clean(req.legalName || req.name)}`,
    `PersonalAcc=${clean(req.account)}`,
    `BankName=${clean(req.bank)}`,
    `BIC=${clean(req.bik)}`,
    req.correspondentAccount ? `CorrespAcc=${clean(req.correspondentAccount)}` : '',
    `PayeeINN=${clean(req.inn)}`,
    req.kpp ? `KPP=${clean(req.kpp)}` : '',
    `Sum=${String(sum).padStart(12, '0')}`,
    `Purpose=${clean(`Оплата по счёту № ${invoiceNumber}`)}`,
  ].filter(Boolean);
  return lines.join('|');
}

async function generatePdf(docDefinition, filename) {
  const PdfPrinter = require('pdfmake');
  const { fonts } = resolvePdfFonts();

  const printer = new PdfPrinter(fonts);
  const doc = printer.createPdfKitDocument(docDefinition);

  return new Promise((resolve, reject) => {
    const filePath = path.join(PDF_DIR, filename);
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    doc.end();
    stream.on('finish', () => resolve({
      filePath,
      url: `${BASE_URL}/uploads/pdfs/${filename}`,
    }));
    stream.on('error', reject);
  });
}

function getStoredPathFromUrl(fileUrl) {
  if (!fileUrl || typeof fileUrl !== 'string') return null;
  const marker = '/uploads/';
  const idx = fileUrl.indexOf(marker);
  if (idx === -1) return null;
  const relativePath = fileUrl.slice(idx + marker.length);
  if (!relativePath) return null;
  return path.join(UPLOAD_DIR, relativePath);
}

function getImageMimeType(filePath) {
  const ext = path.extname(filePath || '').toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}

function escapeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function formatOrderTypeLabel(type) {
  if (type === 'supply') return 'Поставка';
  if (type === 'processing') return 'Обработка';
  if (type === 'logistics') return 'Логистика';
  return type || '—';
}

function resolveTaskWarehouse(order) {
  if (order?.type === 'logistics') return order.details?.dest_warehouse || '—';
  if (order?.type === 'supply') return order.details?.pickup_address || '—';
  return order?.details?.pickup_address || order?.details?.dest_warehouse || '—';
}

async function loadImageDataUrl(fileUrl) {
  const filePath = getStoredPathFromUrl(fileUrl);
  if (!filePath || !fs.existsSync(filePath)) return null;
  const buffer = fs.readFileSync(filePath);
  const mime = getImageMimeType(filePath);
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

// ── Счёт / Акт ──────────────────────────────────────────────────
async function generateInvoicePdf(invoice, items, company) {
  const { defaultFont } = resolvePdfFonts();
  const req = await getRequisites();
  const signatureDataUrl = await loadImageDataUrl(req.signature_url);
  const paymentQr = buildPaymentQrPayload(req, invoice.total, invoice.number);
  const typeLabel = invoice.type === 'invoice' ? 'Счёт' : 'Акт';
  const dateStr = new Date(invoice.created_at).toLocaleDateString('ru-RU');
  const periodStr = invoice.period_from
    ? `${new Date(invoice.period_from).toLocaleDateString('ru-RU')} — ${new Date(invoice.period_to).toLocaleDateString('ru-RU')}`
    : dateStr;

  const tableBody = [
    [
      { text: '№', style: 'tableHeader', alignment: 'center' },
      { text: 'Наименование услуги', style: 'tableHeader' },
      { text: 'Ед.', style: 'tableHeader', alignment: 'center' },
      { text: 'Кол-во', style: 'tableHeader', alignment: 'right' },
      { text: 'Цена', style: 'tableHeader', alignment: 'right' },
      { text: 'Сумма', style: 'tableHeader', alignment: 'right' },
    ],
    ...items.map((item, i) => [
      { text: i + 1, alignment: 'center' },
      item.description,
      { text: item.unit, alignment: 'center' },
      { text: Number(item.quantity).toLocaleString('ru-RU'), alignment: 'right' },
      { text: `${Number(item.unit_price).toLocaleString('ru-RU')} ₽`, alignment: 'right' },
      { text: `${Number(item.total).toLocaleString('ru-RU')} ₽`, alignment: 'right', bold: true },
    ]),
  ];

  const requisitesStack = [
    { text: 'Реквизиты получателя', style: 'label', color: TEAL, margin: [0, 0, 0, 8] },
    { text: req.legalName || req.name, bold: true, margin: [0, 0, 0, 6] },
    {
      columns: [
        { width: 118, text: 'ИНН / КПП / ОГРН', style: 'label' },
        { width: '*', text: `${req.inn}${req.kpp ? ` · ${req.kpp}` : ''}${req.ogrn ? ` · ${req.ogrn}` : ''}`, style: 'label' },
      ],
      columnGap: 8,
      margin: [0, 0, 0, 3],
    },
    {
      columns: [
        { width: 118, text: 'Банк', style: 'label' },
        { width: '*', text: req.bank, style: 'label' },
      ],
      columnGap: 8,
      margin: [0, 0, 0, 3],
    },
    {
      columns: [
        { width: 118, text: 'БИК', style: 'label' },
        { width: '*', text: req.bik, style: 'label' },
      ],
      columnGap: 8,
      margin: [0, 0, 0, 3],
    },
    {
      columns: [
        { width: 118, text: 'Расчётный счёт', style: 'label' },
        { width: '*', text: req.account, style: 'label' },
      ],
      columnGap: 8,
      margin: [0, 0, 0, 3],
    },
    ...(req.correspondentAccount ? [{
      columns: [
        { width: 118, text: 'Корр. счёт', style: 'label' },
        { width: '*', text: req.correspondentAccount, style: 'label' },
      ],
      columnGap: 8,
      margin: [0, 0, 0, 3],
    }] : []),
    {
      columns: [
        { width: 118, text: 'Адрес', style: 'label' },
        { width: '*', text: req.address, style: 'label' },
      ],
      columnGap: 8,
      margin: [0, 0, 0, 3],
    },
    {
      columns: [
        { width: 118, text: 'Контакты', style: 'label' },
        { width: '*', text: `${req.phone} · ${req.email}`, style: 'label' },
      ],
      columnGap: 8,
    },
  ];

  const payerStack = [
    { text: 'Плательщик', style: 'label', color: TEAL, margin: [0, 0, 0, 6] },
    { text: company?.name || invoice.company_name || '—', bold: true, margin: [0, 0, 0, 4] },
    ...(company?.inn ? [{
      columns: [
        { width: 118, text: 'ИНН', style: 'label' },
        { width: '*', text: company.inn, style: 'label' },
      ],
      columnGap: 8,
    }] : []),
  ];

  const docDef = {
    pageSize: 'A4',
    pageMargins: [40, 50, 40, 60],
    defaultStyle: { font: defaultFont, fontSize: 10, color: '#1A1A18' },
    styles: {
      h1:          { fontSize: 18, bold: true, color: TEAL },
      h2:          { fontSize: 13, bold: true, color: TEAL },
      label:       { fontSize: 9, color: GRAY },
      sectionCard: { fillColor: '#F5FBF8' },
      tableHeader: { bold: true, fillColor: TEAL, color: '#fff', fontSize: 9, alignment: 'center' },
      totalRow:    { bold: true, fontSize: 11 },
    },
    content: [
      {
        columns: [
          {
            stack: [
              { text: `${typeLabel} № ${invoice.number}`, style: 'h1' },
              { text: `от ${dateStr}`, style: 'label', margin: [0, 3, 0, 0] },
              { text: `Период: ${periodStr}`, style: 'label' },
            ],
          },
          {
            stack: [
              { qr: paymentQr, fit: 100, foreground: TEAL, background: '#fff', alignment: 'right', margin: [0, 0, 0, 8] },
              { text: 'Оплата по QR', style: 'label', alignment: 'right' },
            ],
            width: 150,
          },
        ],
        margin: [0, 0, 0, 20],
      },

      {
        table: { widths: ['*'], body: [[{
          stack: requisitesStack,
          margin: [12, 10, 12, 10],
        }]]},
        layout: {
          hLineColor: () => LIGHT_TEAL,
          vLineColor: () => LIGHT_TEAL,
          fillColor: () => '#F7FCF9',
        },
        margin: [0, 0, 0, 12],
      },

      {
        table: { widths: ['*'], body: [[{
          stack: payerStack,
          margin: [12, 9, 12, 9],
        }]]},
        layout: {
          hLineColor: () => LIGHT_TEAL,
          vLineColor: () => LIGHT_TEAL,
          fillColor: () => '#FCFEFD',
        },
        margin: [0, 0, 0, 20],
      },

      ...(invoice.type === 'act' ? [
        {
          text: 'Исполнитель выполнил все обязательства в полном объеме в срок и в надлежащем качестве. Заказчик претензий к исполнителю не имеет.',
          margin: [0, 0, 0, 16],
          lineHeight: 1.35,
        },
      ] : []),

      {
        table: {
          headerRows: 1,
          widths: [25, '*', 35, 55, 65, 75],
          body: tableBody,
        },
        layout: {
          hLineColor: (i) => i === 0 ? TEAL : '#E4E2DA',
          vLineColor: () => '#E4E2DA',
          fillColor: (row) => row === 0 ? TEAL : (row % 2 === 0 ? LIGHT_GRAY : null),
        },
        margin: [0, 0, 0, 12],
      },

      {
        unbreakable: true,
        stack: [
          {
            columns: [
              { text: '', width: '*' },
              {
                width: 'auto',
                table: {
                  body: [
                    ...(Number(invoice.tax_rate) > 0 ? [
                      [{ text: 'Итого без НДС:', alignment: 'right', margin: [0, 0, 10, 0] },
                       { text: `${Number(invoice.subtotal).toLocaleString('ru-RU')} ₽`, bold: true }],
                      [{ text: `НДС ${invoice.tax_rate}%:`, alignment: 'right', margin: [0, 0, 10, 0] },
                       { text: `${(invoice.total - invoice.subtotal).toLocaleString('ru-RU')} ₽` }],
                    ] : []),
                    [{ text: 'Итого к оплате:', alignment: 'right', bold: true, fontSize: 12, margin: [0, 4, 10, 0] },
                     { text: `${Number(invoice.total).toLocaleString('ru-RU')} ₽`, bold: true, fontSize: 12, color: TEAL }],
                  ],
                },
                layout: 'noBorders',
              },
            ],
            margin: [0, 0, 0, 20],
          },
          {
            columns: [
              {
                stack: [
                  { canvas: [{ type: 'line', x1: 0, y1: 18, x2: 150, y2: 18, lineColor: '#C8C6BE' }], margin: [0, 0, 0, 0] },
                  signatureDataUrl
                    ? { image: signatureDataUrl, fit: [180, 72], margin: [0, -40, 0, 18] }
                    : { text: '', margin: [0, -40, 0, 18] },
                  { text: req.signerName || 'Иванов И.И.', style: 'label', margin: [0, 0, 0, 0] },
                  { text: req.signerTitle || 'Подписант', style: 'label' },
                ],
              },
              {
                stack: [
                  { canvas: [{ type: 'line', x1: 42, y1: 18, x2: 170, y2: 18, lineColor: '#C8C6BE' }], margin: [0, 0, 0, 0] },
                  { text: '', margin: [0, 34, 0, 0] },
                  { text: 'Заказчик:', style: 'label', alignment: 'right', margin: [0, 0, 0, 2] },
                  { text: company?.name || invoice.company_name || '—', style: 'label', alignment: 'right', margin: [0, 0, 0, 0] },
                ],
                width: 170,
              },
            ],
          },
        ],
      },
    ],
  };

  const filename = `invoice_${invoice.number}_${Date.now()}.pdf`;
  return generatePdf(docDef, filename);
}

async function generateAcceptanceSheetPdf(order, items, company = {}) {
  const { defaultFont } = resolvePdfFonts();
  const req = await getRequisites();
  const signatureDataUrl = await loadImageDataUrl(req.signature_url);
  const dateStr = new Date(order.created_at || Date.now()).toLocaleDateString('ru-RU');
  const docDate = order.details?.delivery_date
    ? new Date(order.details.delivery_date).toLocaleDateString('ru-RU')
    : dateStr;
  const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const acceptedQuantity = items.reduce((sum, item) => sum + Number(item.ready_qty || item.quantity || 0), 0);
  const totalDefect = items.reduce((sum, item) => sum + Number(item.defect_qty || 0), 0);
  const places = Number(order.details?.places_count || 0);
  const weight = Number(order.details?.weight_kg || 0);
  const volume = Number(order.details?.volume_m3 || 0);
  const shipWarehouse = order.type === 'logistics'
    ? order.details?.dest_warehouse || '—'
    : order.details?.pickup_address || '—';

  const rows = [
    [
      { text: '№', style: 'tableHeader', alignment: 'center' },
      { text: 'Штрих-код', style: 'tableHeader', alignment: 'center' },
      { text: 'Артикул', style: 'tableHeader', alignment: 'center' },
      { text: 'Наименование', style: 'tableHeader' },
      { text: 'Цвет', style: 'tableHeader', alignment: 'center' },
      { text: 'Размер', style: 'tableHeader', alignment: 'center' },
      { text: 'Заявлено', style: 'tableHeader', alignment: 'center' },
      { text: 'Принято', style: 'tableHeader', alignment: 'center' },
      { text: 'Брак', style: 'tableHeader', alignment: 'center' },
      { text: 'Вес', style: 'tableHeader', alignment: 'center' },
      { text: 'Д', style: 'tableHeader', alignment: 'center' },
      { text: 'Ш', style: 'tableHeader', alignment: 'center' },
      { text: 'В', style: 'tableHeader', alignment: 'center' },
    ],
    ...items.map((item, i) => ([
      { text: i + 1, alignment: 'center' },
      { text: item.barcode || '—', alignment: 'center', fontSize: 8 },
      { text: item.article || '—', alignment: 'center' },
      { text: item.product_name || '—' },
      { text: item.color || '—', alignment: 'center' },
      { text: item.size || '—', alignment: 'center' },
      { text: Number(item.quantity || 0).toLocaleString('ru-RU'), alignment: 'center' },
      { text: Number(item.ready_qty || item.quantity || 0).toLocaleString('ru-RU'), alignment: 'center', bold: true, color: TEAL },
      { text: Number(item.defect_qty || 0).toLocaleString('ru-RU'), alignment: 'center' },
      { text: item.weight_g ? Number(item.weight_g).toLocaleString('ru-RU') : '—', alignment: 'center' },
      { text: item.dim_l || '—', alignment: 'center' },
      { text: item.dim_w || '—', alignment: 'center' },
      { text: item.dim_h || '—', alignment: 'center' },
    ])),
  ];

  const docDef = {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [26, 26, 26, 28],
    defaultStyle: { font: defaultFont, fontSize: 9, color: '#1A1A18' },
    styles: {
      h1: { fontSize: 17, bold: true, color: TEAL },
      h2: { fontSize: 11, bold: true, color: TEAL },
      label: { fontSize: 8.5, color: GRAY },
      tableHeader: { bold: true, fillColor: TEAL, color: '#fff', fontSize: 8.5, alignment: 'center' },
    },
    content: [
      {
        columns: [
          {
            stack: [
              { text: `Лист приёмки № ${order.number}`, style: 'h1' },
              { text: `Заявка #${order.number} от ${docDate}`, style: 'label', margin: [0, 2, 0, 0] },
              { text: `Клиент: ${order.company_name || company.name || '—'}`, style: 'label' },
            ],
          },
          { stack: [
            { text: req.name, style: 'h2', alignment: 'right' },
            { text: `ИНН ${req.inn}${req.kpp ? ` · КПП ${req.kpp}` : ''}${req.ogrn ? ` · ОГРН ${req.ogrn}` : ''}`, style: 'label', alignment: 'right', margin: [0, 4, 0, 0] },
            { text: req.address, style: 'label', alignment: 'right' },
          ]},
        ],
        margin: [0, 0, 0, 12],
      },
      {
        table: {
          widths: ['*', '*', '*', '*', '*'],
          body: [[
            { stack: [{ text: 'Поставщик', style: 'label' }, { text: req.name, bold: true }] },
            { stack: [{ text: 'Ответственный', style: 'label' }, { text: order.details?.contact_name || '—', bold: true }] },
            { stack: [{ text: 'Мест / единиц', style: 'label' }, { text: `${places} / ${totalQuantity}`, bold: true }] },
            { stack: [{ text: 'Вес / объём', style: 'label' }, { text: `${weight.toFixed(1)} кг / ${volume.toFixed(1)} м³`, bold: true }] },
            { stack: [{ text: 'Склад отгрузки', style: 'label' }, { text: shipWarehouse, bold: true }] },
          ]],
        },
        layout: { hLineColor: () => '#E4E2DA', vLineColor: () => '#E4E2DA' },
        margin: [0, 0, 0, 12],
      },
      {
        table: {
          headerRows: 1,
          widths: [20, 55, 38, '*', 36, 36, 44, 44, 34, 40, 24, 24, 24],
          body: rows,
        },
        layout: {
          hLineColor: (i) => i === 0 ? TEAL : '#D7DDE5',
          vLineColor: () => '#D7DDE5',
          fillColor: (row) => (row === 0 ? TEAL : row % 2 === 0 ? '#FAFAFA' : null),
        },
      },
      {
        columns: [
          { text: `Итого: заявлено ${totalQuantity}, принято ${acceptedQuantity}, брак ${totalDefect}`, style: 'label' },
          { text: `${req.name}`, alignment: 'right', style: 'label' },
        ],
        margin: [0, 10, 0, 0],
      },
      {
        columns: [
          {
            stack: [
              { canvas: [{ type: 'line', x1: 0, y1: 18, x2: 150, y2: 18, lineColor: '#C8C6BE' }], margin: [0, 0, 0, 0] },
              signatureDataUrl
                ? { image: signatureDataUrl, fit: [180, 72], margin: [0, -40, 0, 18] }
                : { text: '', margin: [0, -40, 0, 18] },
              { text: req.signerName || 'Иванов И.И.', style: 'label', margin: [0, 0, 0, 0] },
              { text: req.signerTitle || 'Подписант', style: 'label' },
            ],
          },
          {
            stack: [
              { canvas: [{ type: 'line', x1: 42, y1: 18, x2: 170, y2: 18, lineColor: '#C8C6BE' }], margin: [0, 0, 0, 0] },
              { text: '', margin: [0, 34, 0, 0] },
              { text: 'Заказчик:', style: 'label', alignment: 'right', margin: [0, 0, 0, 2] },
              { text: company?.name || order.company_name || '—', style: 'label', alignment: 'right' },
            ],
            width: 170,
          },
        ],
        margin: [0, 24, 0, 0],
      },
    ],
  };

  const filename = `acceptance_${order.number}_${Date.now()}.pdf`;
  return generatePdf(docDef, filename);
}

async function generateTechnicalTaskPdf(order, items, company = {}) {
  const { defaultFont } = resolvePdfFonts();
  const req = await getRequisites();
  const signatureDataUrl = await loadImageDataUrl(req.signature_url);
  const dateStr = new Date(order.created_at || Date.now()).toLocaleDateString('ru-RU');
  const docDate = order.details?.delivery_date
    ? new Date(order.details.delivery_date).toLocaleDateString('ru-RU')
    : dateStr;
  const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const shipWarehouse = resolveTaskWarehouse(order);

  const rows = [
    [
      { text: '№', style: 'tableHeader', alignment: 'center' },
      { text: 'Товар', style: 'tableHeader' },
      { text: 'Артикул', style: 'tableHeader', alignment: 'center' },
      { text: 'Штрихкод', style: 'tableHeader', alignment: 'center' },
      { text: 'Цвет / Размер / Состав', style: 'tableHeader', alignment: 'center' },
      { text: 'Кол-во', style: 'tableHeader', alignment: 'center' },
      { text: 'Задача', style: 'tableHeader' },
    ],
    ...items.map((item, i) => ([
      { text: i + 1, alignment: 'center' },
      { text: item.product_name || '—', bold: true },
      { text: item.article || '—', alignment: 'center' },
      { text: item.barcode || '—', alignment: 'center', fontSize: 8 },
      { text: [item.color, item.size, item.composition].filter(Boolean).join(' / ') || '—', alignment: 'center' },
      { text: Number(item.quantity || 0).toLocaleString('ru-RU'), alignment: 'center' },
      { text: escapeText(item.pack_note || (order.type === 'processing' ? 'Обработать товар по стандарту заявки' : 'Подготовить товар по регламенту заявки')), fontSize: 8.5 },
    ])),
  ];

  const docDef = {
    pageSize: 'A4',
    pageMargins: [38, 44, 38, 54],
    defaultStyle: { font: defaultFont, fontSize: 9.5, color: '#1A1A18' },
    styles: {
      h1: { fontSize: 18, bold: true, color: TEAL },
      h2: { fontSize: 12.5, bold: true, color: TEAL },
      label: { fontSize: 8.5, color: GRAY },
      tableHeader: { bold: true, fillColor: TEAL, color: '#fff', fontSize: 8.5, alignment: 'center' },
      infoTitle: { fontSize: 10, bold: true, color: TEAL },
      infoValue: { fontSize: 9.5, bold: true },
    },
    content: [
      {
        columns: [
          {
            stack: [
              { text: 'Техническое задание', style: 'h1' },
              { text: `Заявка № ${order.number} · ${docDate}`, style: 'label', margin: [0, 3, 0, 0] },
              { text: `Клиент: ${order.company_name || company.name || '—'}`, style: 'label' },
            ],
          },
          {
            stack: [
              { text: req.name, style: 'h2', alignment: 'right' },
              { text: `ИНН ${req.inn}${req.kpp ? ` · КПП ${req.kpp}` : ''}${req.ogrn ? ` · ОГРН ${req.ogrn}` : ''}`, style: 'label', alignment: 'right', margin: [0, 3, 0, 0] },
              { text: req.address, style: 'label', alignment: 'right' },
            ],
          },
        ],
        margin: [0, 0, 0, 14],
      },
      {
        table: {
          widths: ['*', '*', '*'],
          body: [[
            { stack: [{ text: 'Тип заявки', style: 'infoTitle' }, { text: formatOrderTypeLabel(order.type), style: 'infoValue' }], margin: [8, 8, 8, 8] },
            { stack: [{ text: 'Склад отгрузки', style: 'infoTitle' }, { text: shipWarehouse, style: 'infoValue' }], margin: [8, 8, 8, 8] },
            { stack: [{ text: 'Всего единиц', style: 'infoTitle' }, { text: Number(totalQuantity).toLocaleString('ru-RU'), style: 'infoValue' }], margin: [8, 8, 8, 8] },
          ]],
        },
        layout: { hLineColor: () => '#E4E2DA', vLineColor: () => '#E4E2DA' },
        margin: [0, 0, 0, 14],
      },
      {
        table: {
          headerRows: 1,
          widths: [20, '*', 42, 64, 120, 48, 140],
          body: rows,
        },
        layout: {
          hLineColor: (i) => i === 0 ? TEAL : '#D7DDE5',
          vLineColor: () => '#D7DDE5',
          fillColor: (row) => (row === 0 ? TEAL : row % 2 === 0 ? '#FAFAFA' : null),
        },
      },
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: 'Комментарий к заданию', style: 'infoTitle', margin: [0, 0, 0, 4] },
              { text: escapeText(order.comment || 'Без комментария'), style: 'label' },
            ],
          },
          {
            width: 'auto',
            stack: [
              { text: 'Ответственный', style: 'infoTitle', alignment: 'right', margin: [0, 0, 0, 4] },
              { text: escapeText(order.details?.contact_name || '—'), style: 'infoValue', alignment: 'right' },
              { text: escapeText(order.details?.contact_phone || '—'), style: 'label', alignment: 'right' },
            ],
          },
        ],
        margin: [0, 14, 0, 18],
      },
      {
        columns: [
          {
            stack: [
              { canvas: [{ type: 'line', x1: 0, y1: 18, x2: 150, y2: 18, lineColor: '#C8C6BE' }], margin: [0, 0, 0, 0] },
              signatureDataUrl
                ? { image: signatureDataUrl, fit: [180, 72], margin: [0, -40, 0, 18] }
                : { text: '', margin: [0, -40, 0, 18] },
              { text: req.signerName || 'Иванов И.И.', style: 'label', margin: [0, 0, 0, 0] },
              { text: req.signerTitle || 'Подписант', style: 'label' },
            ],
          },
          {
            stack: [
              { canvas: [{ type: 'line', x1: 42, y1: 18, x2: 170, y2: 18, lineColor: '#C8C6BE' }], margin: [0, 0, 0, 0] },
              { text: '', margin: [0, 34, 0, 0] },
              { text: 'Заказчик:', style: 'label', alignment: 'right', margin: [0, 0, 0, 2] },
              { text: company?.name || order.company_name || '—', style: 'label', alignment: 'right' },
            ],
            width: 170,
          },
        ],
        margin: [0, 8, 0, 0],
      },
    ],
  };

  const filename = `technical_task_${order.number}_${Date.now()}.pdf`;
  return generatePdf(docDef, filename);
}

// ── КП / Предложение ────────────────────────────────────────────
async function generateProposalPdf(proposal, items) {
  const { defaultFont } = resolvePdfFonts();
  const req = await getRequisites();
  const signatureDataUrl = await loadImageDataUrl(req.signature_url);
  const dateStr = new Date(proposal.created_at).toLocaleDateString('ru-RU');

  const tableBody = [
    [
      { text: '№', style: 'tableHeader', alignment: 'center' },
      { text: 'Товары (работы, услуги)', style: 'tableHeader' },
      { text: 'Кол-во', style: 'tableHeader', alignment: 'right' },
      { text: 'Ед.', style: 'tableHeader', alignment: 'center' },
      { text: 'Цена', style: 'tableHeader', alignment: 'right' },
      { text: 'В месяц', style: 'tableHeader', alignment: 'right' },
    ],
    ...items.map((item, i) => [
      { text: i + 1, alignment: 'center', fontSize: 9 },
      { stack: [
        { text: item.label, bold: true, fontSize: 9.5 },
        item.description ? { text: item.description, fontSize: 7.5, color: GRAY } : {},
      ]},
      { text: Number(item.quantity).toLocaleString('ru-RU'), alignment: 'right', fontSize: 9 },
      { text: item.unit, alignment: 'center', fontSize: 9 },
      { text: `${Number(item.unit_price).toLocaleString('ru-RU')} ₽`, alignment: 'right', fontSize: 9 },
      { text: `${Number(item.total).toLocaleString('ru-RU')} ₽`, alignment: 'right', bold: true, fontSize: 9.5 },
    ]),
  ];

  const docDef = {
    pageSize: 'A4',
    pageMargins: [40, 50, 40, 60],
    defaultStyle: { font: defaultFont, fontSize: 10, color: '#1A1A18' },
    styles: {
      h1:          { fontSize: 16, bold: true },
      label:       { fontSize: 9, color: GRAY },
      tableHeader: { bold: true, fontSize: 8.5, alignment: 'center' },
    },
    content: [
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: 'Получатель:', style: 'label' },
              { text: proposal.client_name || '—', margin: [0, 2, 0, 0] },
            ],
          },
        ],
        margin: [0, 0, 0, 10],
      },
      { text: `Коммерческое предложение № ${proposal.number} от ${dateStr}`, style: 'h1', margin: [0, 0, 0, 12] },
      { text: 'Здравствуйте,', margin: [0, 0, 0, 4] },
      { text: 'исходя из имеющихся данных, предоставляем следующий примерный расчет:', margin: [0, 0, 0, 16] },
      {
        text: proposal.title || '',
        style: 'label',
        margin: [0, 0, 0, proposal.title ? 10 : 0],
      },

      {
        table: {
          headerRows: 1,
          widths: [20, '*', 48, 40, 58, 66],
          body: tableBody,
        },
        layout: {
          hLineWidth: () => 0.7,
          vLineWidth: () => 0.7,
          hLineColor: () => '#D6D2C8',
          vLineColor: () => '#E4E2DA',
          fillColor: () => null,
          paddingLeft: () => 5,
          paddingRight: () => 5,
          paddingTop: () => 5,
          paddingBottom: () => 5,
        },
        margin: [0, 0, 0, 12],
      },

      {
        columns: [
          { text: '', width: '*' },
          {
            width: 'auto',
            table: {
              body: [
                [
                  { text: 'Итого к оплате:', alignment: 'right', bold: true, fontSize: 12, margin: [0, 0, 12, 0] },
                  { text: `${Number(proposal.total_monthly).toLocaleString('ru-RU')} ₽`, bold: true, fontSize: 12 },
                ],
              ],
            },
            layout: 'noBorders',
          },
        ],
        margin: [0, 0, 0, 18],
      },

      proposal.notes ? { text: proposal.notes, fontSize: 10, margin: [0, 0, 0, 12] } : {},
      {
        text: 'С уважением,',
        margin: [0, 6, 0, 10],
      },
      {
        stack: [
          signatureDataUrl
            ? { image: signatureDataUrl, fit: [180, 80], margin: [0, 0, 0, 4] }
            : { text: '', margin: [0, 0, 0, 4] },
          { text: req.signerName || 'Иванов И.И.' },
          { text: req.legalName || req.name, bold: true, margin: [0, 14, 0, 0] },
          { text: req.address, style: 'label' },
        ],
      },
    ],
  };

  const filename = `proposal_${proposal.number}_${Date.now()}.pdf`;
  return generatePdf(docDef, filename);
}

module.exports = {
  generateInvoicePdf,
  generateProposalPdf,
  generateAcceptanceSheetPdf,
  generateTechnicalTaskPdf,
};
