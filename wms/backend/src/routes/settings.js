const express = require('express');
const fs = require('fs');
const path = require('path');
const { z } = require('zod');
const db = require('../db/knex');
const { auth, role } = require('../middleware/auth');
const { photoUpload } = require('../middleware/upload');

const router = express.Router();
router.use(auth);

const settingsSchema = z.object({
  brand_name: z.string().min(1).max(255),
  company_name: z.string().min(1).max(255),
  legal_name: z.string().optional().nullable(),
  inn: z.string().optional().nullable(),
  kpp: z.string().optional().nullable(),
  ogrn: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal('')).nullable(),
  bank_name: z.string().optional().nullable(),
  bik: z.string().optional().nullable(),
  checking_account: z.string().optional().nullable(),
  correspondent_account: z.string().optional().nullable(),
  signer_name: z.string().optional().nullable(),
  signer_title: z.string().optional().nullable(),
  site_url: z.string().optional().nullable(),
});

function getBaseUrl(req) {
  if (process.env.BASE_URL) return process.env.BASE_URL;
  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol = forwardedProto || req.protocol;
  const host = req.headers.host;
  return `${protocol}://${host}`;
}

function getStoredPathFromUrl(fileUrl) {
  if (!fileUrl || typeof fileUrl !== 'string') return null;
  const marker = '/uploads/';
  const idx = fileUrl.indexOf(marker);
  if (idx === -1) return null;
  const relativePath = fileUrl.slice(idx + marker.length);
  if (!relativePath) return null;
  return path.join(process.env.UPLOAD_DIR || './uploads', relativePath);
}

function deleteStoredFileByUrl(fileUrl) {
  const filePath = getStoredPathFromUrl(fileUrl);
  if (!filePath) return false;
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

router.get('/profile', role(['admin', 'manager']), async (req, res) => {
  const settings = await db('account_settings').where({ is_default: true }).first();
  res.json(settings || null);
});

router.patch('/profile', role(['admin', 'manager']), async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues });
  }

  const existing = await db('account_settings').where({ is_default: true }).first();
  const payload = { ...parsed.data, updated_at: new Date() };

  if (!payload.email) payload.email = null;
  if (existing) {
    const [updated] = await db('account_settings')
      .where({ id: existing.id })
      .update(payload)
      .returning('*');
    return res.json(updated);
  }

  const [created] = await db('account_settings')
    .insert({ ...payload, is_default: true })
    .returning('*');
  return res.status(201).json(created);
});

router.post('/profile/signature', role(['admin', 'manager']), (req, res, next) => {
  req.uploadSubdir = 'signatures';
  next();
}, photoUpload.single('signature'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

  const settings = await db('account_settings').where({ is_default: true }).first();
  const baseUrl = getBaseUrl(req);
  const url = `${baseUrl}/uploads/signatures/${req.file.filename}`;

  if (settings?.signature_url) {
    deleteStoredFileByUrl(settings.signature_url);
  }

  if (settings) {
    await db('account_settings')
      .where({ id: settings.id })
      .update({ signature_url: url, updated_at: new Date() });
  } else {
    await db('account_settings').insert({
      brand_name: 'FluxWMS',
      company_name: 'ООО «Фулфилмент»',
      is_default: true,
      signature_url: url,
    });
  }

  res.json({ url });
});

module.exports = router;
