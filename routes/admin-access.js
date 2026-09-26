const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');

const router = express.Router();

const logDir = path.join(__dirname, '..', 'logs');
fs.mkdirSync(logDir, { recursive: true });

function getClientIp(req) {
  const forwarded = req.headers && req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }

  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : 'unknown';
}

function logAttempt({ ip, success, pinLength }) {
  const line = `${new Date().toISOString()} | ip=${ip} | success=${success} | pinLength=${pinLength}\n`;
  fs.appendFileSync(path.join(logDir, 'admin-access.log'), line, 'utf8');
}

const adminAccessLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimit.ipKeyGenerator(getClientIp(req)),
  handler: (req, res) => {
    const ip = getClientIp(req);
    logAttempt({ ip, success: false, pinLength: String(req.body.pin || '').length });
    res.status(429).render('error', {
      message: 'Demasiados intentos fallidos. Intenta de nuevo en 15 minutos.',
      user: req.session && req.session.user ? req.session.user : null,
      flash: req.session && req.session.flash ? req.session.flash : null,
    });
  },
});

router.get('/', (req, res) => {
  res.render('admin-access', {
    user: req.session && req.session.user ? req.session.user : null,
    flash: req.session && req.session.flash ? req.session.flash : null,
    error: null,
  });
});

router.post('/', adminAccessLimiter, async (req, res) => {
  const pin = String(req.body.pin || '').trim();
  const ip = getClientIp(req);

  if (!process.env.ADMIN_PIN_HASH) {
    logAttempt({ ip, success: false, pinLength: pin.length });
    req.session.flash = { type: 'error', message: 'No está configurado el PIN de administrador.' };
    return res.redirect('/admin-access');
  }

  const isValid = await bcrypt.compare(pin, process.env.ADMIN_PIN_HASH);

  if (!isValid) {
    logAttempt({ ip, success: false, pinLength: pin.length });
    req.session.flash = { type: 'error', message: 'PIN incorrecto. Inténtalo de nuevo.' };
    return res.redirect('/admin-access');
  }

  logAttempt({ ip, success: true, pinLength: pin.length });
  req.session.user = {
    id: 'admin-pin',
    username: 'Admin PIN',
    email: 'admin-pin@local',
    role: 'admin',
  };
  req.session.flash = { type: 'success', message: 'Acceso de administrador concedido.' };
  return res.redirect('/admin');
});

module.exports = router;
