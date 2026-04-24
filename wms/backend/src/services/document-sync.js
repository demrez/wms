const fs = require('fs');
const path = require('path');
const db = require('../db/knex');
const { generateInvoicePdf, generateAcceptanceSheetPdf, generateTechnicalTaskPdf } = require('./pdf');
const { notifyInfo, notifyNewInvoice } = require('./notifications');
const { loadOrderBillingBundle, buildOrderBillingItems } = require('./order-billing-items');

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

function getStoredPathFromUrl(fileUrl) {
  if (!fileUrl || typeof fileUrl !== 'string') return null;

  const marker = '/uploads/';
  const idx = fileUrl.indexOf(marker);
  if (idx === -1) return null;

  const relativePath = fileUrl.slice(idx + marker.length);
  if (!relativePath) return null;
  return path.join(UPLOAD_DIR, relativePath);
}

async function deleteStoredFileByUrl(fileUrl) {
  const filePath = getStoredPathFromUrl(fileUrl);
  if (!filePath) return false;
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

async function loadOrderBundle(orderId) {
  const order = await db('orders')
    .join('companies', 'companies.id', 'orders.company_id')
    .where('orders.id', orderId)
    .select(
      'orders.*',
      'companies.name as company_name',
      'companies.inn as company_inn'
    )
    .first();

  if (!order) return null;

  const details = order.type === 'supply'
    ? await db('supply_details').where({ order_id: orderId }).first()
    : order.type === 'logistics'
      ? await db('logistics').where({ order_id: orderId }).first()
      : null;

  const items = await db('order_items')
    .join('products', 'products.id', 'order_items.product_id')
    .where('order_items.order_id', orderId)
    .select(
      'order_items.*',
      'products.name as product_name',
      'products.article',
      'products.photo_url',
      'products.color',
      'products.size',
      'products.composition',
      'products.weight_g',
      'products.dim_l',
      'products.dim_w',
      'products.dim_h',
      db.raw(`(
        select pb.barcode
        from product_barcodes pb
        where pb.product_id = products.id
        order by
          case
            when pb.marketplace = 'ff' then 0
            when pb.marketplace = 'wb' then 1
            when pb.marketplace = 'ozon' then 2
            else 3
          end,
          pb.created_at asc
        limit 1
      ) as barcode`)
    )
    .orderBy('products.name');

  return {
    order: { ...order, details },
    company: {
      name: order.company_name,
      inn: order.company_inn,
    },
    items,
    details,
  };
}

async function replaceOrderDocument({ orderId, docType, title, fileName, fileUrl, uploadedBy }) {
  const existingDocs = await db('order_documents')
    .where({ order_id: orderId, doc_type: docType });

  for (const existing of existingDocs) {
    await deleteStoredFileByUrl(existing.file_url);
  }

  await db('order_documents')
    .where({ order_id: orderId, doc_type: docType })
    .delete();

  const [document] = await db('order_documents').insert({
    order_id: orderId,
    doc_type: docType,
    title,
    file_name: fileName,
    file_url: fileUrl,
    uploaded_by: uploadedBy || null,
  }).returning('*');

  return document;
}

async function syncAcceptanceDocument(orderId, { uploadedBy } = {}) {
  const bundle = await loadOrderBundle(orderId);
  if (!bundle) return null;

  const { order, company, items } = bundle;
  const { url, filePath } = await generateAcceptanceSheetPdf(order, items, company);

  const document = await replaceOrderDocument({
    orderId: order.id,
    docType: 'acceptance_sheet',
    title: `Лист приёмки № ${order.number}`,
    fileName: path.basename(filePath),
    fileUrl: url,
    uploadedBy,
  });

  notifyInfo({
    companyId: order.company_id,
    title: `Лист приёмки по заявке #${order.number}`,
    body: 'Лист приёмки сформирован и доступен в клиентском кабинете.',
  }).catch(() => {});

  return document;
}

async function syncTechnicalTaskDocument(orderId, { uploadedBy, notify = true } = {}) {
  const bundle = await loadOrderBundle(orderId);
  if (!bundle) return null;

  const { order, company, items } = bundle;
  const existingDocs = await db('order_documents').where({ order_id: order.id, doc_type: 'technical_task' });
  const { url, filePath } = await generateTechnicalTaskPdf(order, items, company);

  const document = await replaceOrderDocument({
    orderId: order.id,
    docType: 'technical_task',
    title: `Техническое задание № ${order.number}`,
    fileName: path.basename(filePath),
    fileUrl: url,
    uploadedBy,
  });

  if (notify && existingDocs.length === 0) {
    notifyInfo({
      companyId: order.company_id,
      title: `Техническое задание по заявке #${order.number}`,
      body: 'Техническое задание сформировано и доступно в клиентском кабинете.',
    }).catch(() => {});
  }

  return document;
}

async function upsertInvoiceDocument({
  order,
  company,
  items,
  type,
  uploadedBy,
  notesOverride,
  taxRate = 0,
}) {
  const subtotal = items.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const total = Number((subtotal * (1 + Number(taxRate || 0) / 100)).toFixed(2));
  const notes = notesOverride || (type === 'invoice'
    ? `Счёт по заявке #${order.number}`
    : `Акт по заявке #${order.number}`);

  const invoice = await db.transaction(async (trx) => {
    const existing = await trx('invoices')
      .where({ order_id: order.id, type })
      .first();

    let savedInvoice;
    if (existing) {
      await deleteStoredFileByUrl(existing.pdf_url);
      const [updated] = await trx('invoices')
        .where({ id: existing.id })
        .update({
          company_id: order.company_id,
          order_id: order.id,
          type,
          status: 'sent',
          period_from: null,
          period_to: null,
          subtotal,
          tax_rate: existing.tax_rate || taxRate || 0,
          total,
          notes,
          created_by: existing.created_by || uploadedBy || null,
          updated_at: new Date(),
        })
        .returning('*');
      savedInvoice = updated;

      await trx('invoice_items').where({ invoice_id: existing.id }).delete();
    } else {
      const [created] = await trx('invoices').insert({
        company_id: order.company_id,
        order_id: order.id,
        type,
        status: 'sent',
        period_from: null,
        period_to: null,
        subtotal,
        tax_rate: taxRate || 0,
        total,
        notes,
        created_by: uploadedBy || order.created_by || null,
      }).returning('*');
      savedInvoice = created;
    }

    if (items.length) {
      await trx('invoice_items').insert(items.map((item) => ({
        ...item,
        invoice_id: savedInvoice.id,
      })));
    }

    return savedInvoice;
  });

  const { url } = await generateInvoicePdf(invoice, items, company);
  await db('invoices').where({ id: invoice.id }).update({ pdf_url: url, updated_at: new Date() });

  return { ...invoice, pdf_url: url, items };
}

async function syncBillingDocuments(orderId, { uploadedBy, force = true, notify = true } = {}) {
  const bundle = await loadOrderBillingBundle(orderId);
  if (!bundle) return null;

  const { order, company } = bundle;
  const items = await buildOrderBillingItems(bundle);
  if (!items.length) return null;

  const existingDocs = await db('invoices')
    .where({ order_id: order.id })
    .whereIn('type', ['invoice', 'act'])
    .select('id');
  if (!force && existingDocs.length === 0) {
    return null;
  }

  const invoice = await upsertInvoiceDocument({
    order,
    company,
    items,
    type: 'invoice',
    uploadedBy,
  });

  const act = await upsertInvoiceDocument({
    order,
    company,
    items,
    type: 'act',
    uploadedBy,
  });

  if (notify) {
    notifyNewInvoice({ invoice, companyId: order.company_id }).catch(() => {});
    notifyInfo({
      companyId: order.company_id,
      title: `Документы по заявке #${order.number} готовы`,
      body: 'Счёт и акт сформированы и доступны в клиентском кабинете.',
    }).catch(() => {});
  }

  return { invoice, act };
}

async function createOrderBillingDocument(orderId, {
  uploadedBy,
  type = 'invoice',
  notesOverride,
  taxRate = 0,
  notify = true,
} = {}) {
  const bundle = await loadOrderBillingBundle(orderId);
  if (!bundle) return null;

  const { order, company } = bundle;
  const items = await buildOrderBillingItems(bundle);
  if (!items.length) return null;

  const invoice = await upsertInvoiceDocument({
    order,
    company,
    items,
    type,
    uploadedBy,
    notesOverride,
    taxRate,
  });

  if (notify && type === 'invoice') {
    notifyNewInvoice({ invoice, companyId: order.company_id }).catch(() => {});
  }

  return invoice;
}

async function deleteInvoiceDocument(invoiceId) {
  const invoice = await db('invoices').where({ id: invoiceId }).first();
  if (!invoice) return null;

  await deleteStoredFileByUrl(invoice.pdf_url);
  await db('invoices').where({ id: invoiceId }).delete();
  return invoice;
}

async function resolveOrderDocumentDownload(orderId, kind, { uploadedBy } = {}) {
  const normalizedKind = String(kind || '').trim().toLowerCase();

  if (normalizedKind === 'acceptance_sheet') {
    const document = await syncAcceptanceDocument(orderId, { uploadedBy });
    return document?.file_url || null;
  }

  if (normalizedKind === 'technical_task') {
    const document = await syncTechnicalTaskDocument(orderId, { uploadedBy, notify: false });
    return document?.file_url || null;
  }

  if (normalizedKind === 'invoice' || normalizedKind === 'act') {
    const synced = await syncBillingDocuments(orderId, { uploadedBy, force: true, notify: false });
    const invoice = synced?.[normalizedKind] || await db('invoices')
      .where({ order_id: orderId, type: normalizedKind })
      .orderBy('created_at', 'desc')
      .first();

    return invoice?.pdf_url || null;
  }

  return null;
}

module.exports = {
  deleteStoredFileByUrl,
  syncAcceptanceDocument,
  syncTechnicalTaskDocument,
  syncBillingDocuments,
  deleteInvoiceDocument,
  resolveOrderDocumentDownload,
  loadOrderBundle,
  upsertInvoiceDocument,
  createOrderBillingDocument,
  loadOrderBillingBundle,
  buildOrderBillingItems,
};
