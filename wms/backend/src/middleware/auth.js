const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Не авторизован' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Токен недействителен' });
  }
};

// Проверка роли: role('admin') или role(['admin','manager'])
const role = (allowed) => (req, res, next) => {
  const roles = Array.isArray(allowed) ? allowed : [allowed];
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Недостаточно прав' });
  }
  next();
};

module.exports = { auth, role };
