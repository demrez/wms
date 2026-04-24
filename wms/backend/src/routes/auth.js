const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const db = require('../db/knex');
const { auth } = require('../middleware/auth');

const router = express.Router();

const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Неверные данные', details: parsed.error.issues });
  }
  const normalizedEmail = parsed.data.email.trim().toLowerCase();
  const normalizedPassword = parsed.data.password.trim();
  const emailAliases = {
    admin: 'admin@wms.ru',
    client: 'client@wms.ru',
    manager: 'manager@wms.ru',
  };
  const email = emailAliases[normalizedEmail] || normalizedEmail;
  const password = normalizedPassword;

  const user = await db('users').where({ email, is_active: true }).first();
  if (!user) return res.status(401).json({ error: 'Неверный email или пароль' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Неверный email или пароль' });

  const token = jwt.sign(
    { id: user.id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  res.json({
    token,
    user: { id: user.id, email: user.email, role: user.role, full_name: user.full_name },
  });
});

// GET /api/auth/me
router.get('/me', auth, async (req, res) => {
  const user = await db('users').where({ id: req.user.id }).select('id','email','role','full_name','phone').first();
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  res.json(user);
});

module.exports = router;
