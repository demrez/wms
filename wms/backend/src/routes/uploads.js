const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../db/knex');
const { auth } = require('../middleware/auth');
const { photoUpload, docUpload } = require('../middleware/upload');

const router = express.Router();
router.use(auth);

function getBaseUrl(req) {
  if (process.env.BASE_URL) return process.env.BASE_URL;
  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol = forwardedProto || req.protocol;
  const host = req.headers.host;
  return `${protocol}://${host}`;
}

// POST /api/uploads/product-photo/:productId
router.post('/product-photo/:productId', (req, res, next) => {
  req.uploadSubdir = 'products';
  next();
}, photoUpload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

  const baseUrl = getBaseUrl(req);
  const url = `${baseUrl}/uploads/products/${req.file.filename}`;

  // Удаляем старое фото
  const product = await db('products').where({ id: req.params.productId }).first();
  if (product?.photo_url) {
    const oldFile = product.photo_url.replace(`${baseUrl}/uploads/`, '').replace('/uploads/', '');
    const oldPath = path.join(process.env.UPLOAD_DIR || './uploads', oldFile);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  await db('products').where({ id: req.params.productId }).update({ photo_url: url, updated_at: new Date() });
  res.json({ url });
});

// POST /api/uploads/waybill/:orderId
router.post('/waybill/:orderId', (req, res, next) => {
  req.uploadSubdir = 'waybills';
  next();
}, docUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

  const baseUrl = getBaseUrl(req);
  const url = `${baseUrl}/uploads/waybills/${req.file.filename}`;
  await db('supply_details').where({ order_id: req.params.orderId }).update({ waybill_url: url });
  res.json({ url });
});

// POST /api/uploads/order-document/:orderId
router.post('/order-document/:orderId', (req, res, next) => {
  req.uploadSubdir = 'order-docs';
  next();
}, docUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

  const order = await db('orders').where({ id: req.params.orderId }).first();
  if (!order) return res.status(404).json({ error: 'Заявка не найдена' });

  const baseUrl = getBaseUrl(req);
  const url = `${baseUrl}/uploads/order-docs/${req.file.filename}`;
  const docType = req.body.doc_type || 'other';
  const title = req.body.title || req.file.originalname;

  const [document] = await db('order_documents').insert({
    order_id: req.params.orderId,
    doc_type: docType,
    title,
    file_name: req.file.originalname,
    file_url: url,
    uploaded_by: req.user.id,
  }).returning('*');

  res.status(201).json(document);
});

// GET /api/uploads/order-document/:orderId
router.get('/order-document/:orderId', async (req, res) => {
  const order = await db('orders').where({ id: req.params.orderId }).first();
  if (!order) return res.status(404).json({ error: 'Заявка не найдена' });

  const documents = await db('order_documents')
    .leftJoin('users', 'users.id', 'order_documents.uploaded_by')
    .where('order_documents.order_id', req.params.orderId)
    .select('order_documents.*', 'users.full_name as uploaded_by_name')
    .orderBy('order_documents.created_at', 'desc');

  res.json(documents);
});

// DELETE /api/uploads/product-photo/:productId
router.delete('/product-photo/:productId', async (req, res) => {
  const product = await db('products').where({ id: req.params.productId }).first();
  if (product?.photo_url) {
    const baseUrl = getBaseUrl(req);
    const file = product.photo_url.replace(`${baseUrl}/uploads/`, '').replace('/uploads/', '');
    const filePath = path.join(process.env.UPLOAD_DIR || './uploads', file);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await db('products').where({ id: req.params.productId }).update({ photo_url: null });
  }
  res.json({ ok: true });
});

// DELETE /api/uploads/order-document/:documentId
router.delete('/order-document/:documentId', async (req, res) => {
  const document = await db('order_documents').where({ id: req.params.documentId }).first();
  if (!document) return res.status(404).json({ error: 'Документ не найден' });

  const baseUrl = getBaseUrl(req);
  const file = document.file_url.replace(`${baseUrl}/uploads/`, '').replace('/uploads/', '');
  const filePath = path.join(process.env.UPLOAD_DIR || './uploads', file);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  await db('order_documents').where({ id: req.params.documentId }).delete();
  res.json({ ok: true });
});

module.exports = router;
