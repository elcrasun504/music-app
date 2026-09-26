const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const {
  createUser,
  getUserByEmail,
  getUserByUsername,
  getUserById,
} = require('../database');

const router = express.Router();
const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,20}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getClientIp(req) {
  const forwarded = req.headers && req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }

  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : 'unknown';
}

const adminCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimit.ipKeyGenerator(getClientIp(req)),
  handler: (req, res) => {
    req.session.flash = {
      type: 'error',
      message: 'Demasiados intentos fallidos. Intenta de nuevo en 15 minutos.',
    };
    res.redirect('/auth/admin-code');
  },
});

router.get('/login', (req, res) => {
  res.render('login', {
    error: null,
    user: req.session.user || null,
    flash: req.session.flash || null,
  });
});

router.get('/admin-code', (req, res) => {
  if (!req.session.pendingAdminLogin) {
    return res.redirect('/auth/login');
  }

  res.render('admin-code', {
    error: null,
    user: req.session.user || null,
    flash: req.session.flash || null,
  });
});

router.post('/login', async (req, res) => {
  const emailInput = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const remember = Boolean(req.body.remember);

  if (!emailInput || !password) {
    return res.status(400).render('login', {
      error: 'Introduce tu email y contraseña.',
      user: req.session.user || null,
      flash: req.session.flash || null,
    });
  }

  const user = (await getUserByEmail(emailInput)) || (await getUserByUsername(emailInput));

  if (!user) {
    return res.status(401).render('login', {
      error: 'Credenciales incorrectas.',
      user: req.session.user || null,
      flash: req.session.flash || null,
    });
  }

  const isValidPassword = await bcrypt.compare(password, user.passwordHash);

  if (!isValidPassword) {
    return res.status(401).render('login', {
      error: 'Credenciales incorrectas.',
      user: req.session.user || null,
      flash: req.session.flash || null,
    });
  }

  if (user.role === 'admin' || user.username === 'admin' || emailInput === 'admin') {
    req.session.pendingAdminLogin = {
      userId: user.id,
      username: user.username,
      email: user.email,
    };
    req.session.cookie.maxAge = remember ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    req.session.flash = { type: 'info', message: 'Código de administrador requerido.' };
    return res.redirect('/auth/admin-code');
  }

  req.session.user = {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
  };
  req.session.cookie.maxAge = remember ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

  const returnTo = req.session.returnTo;
  const safeReturnTo = returnTo && !returnTo.startsWith('/songs/upload') ? returnTo : '/';
  delete req.session.returnTo;

  res.redirect(safeReturnTo);
});

router.post('/admin-code', adminCodeLimiter, async (req, res) => {
  const pending = req.session.pendingAdminLogin;

  if (!pending) {
    return res.redirect('/auth/login');
  }

  const code = String(req.body.code || '').trim();
  const adminCodeHash = process.env.ADMIN_CODE_HASH;

  if (!adminCodeHash) {
    req.session.flash = { type: 'error', message: 'No está configurado el código de administrador.' };
    return res.redirect('/auth/admin-code');
  }

  if (!code || code.length < 4) {
    req.session.flash = { type: 'error', message: 'El código de administrador debe tener al menos 4 caracteres.' };
    return res.redirect('/auth/admin-code');
  }

  const isValidCode = await bcrypt.compare(code, adminCodeHash);

  if (!isValidCode) {
    req.session.flash = { type: 'error', message: 'Código de administrador incorrecto.' };
    return res.redirect('/auth/admin-code');
  }

  const user = (await getUserById(pending.userId)) || (await getUserByUsername(pending.username)) || (await getUserByEmail(pending.email));

  if (!user) {
    req.session.flash = { type: 'error', message: 'No se pudo completar el acceso de administrador.' };
    delete req.session.pendingAdminLogin;
    return res.redirect('/auth/login');
  }

  req.session.user = {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
  };
  delete req.session.pendingAdminLogin;

  const returnTo = req.session.returnTo;
  const safeReturnTo = returnTo && !returnTo.startsWith('/songs/upload') ? returnTo : '/';
  delete req.session.returnTo;

  res.redirect(safeReturnTo);
});

router.get('/register', (req, res) => {
  res.render('register', {
    error: null,
    user: req.session.user || null,
    flash: req.session.flash || null,
  });
});

router.get('/check-username', async (req, res) => {
  const username = String(req.query.username || '').trim();

  if (!USERNAME_REGEX.test(username)) {
    return res.json({ available: false, message: 'Usa solo letras, números, guion bajo o guion medio.' });
  }

  const existingUser = await getUserByUsername(username);
  return res.json({
    available: !existingUser,
    message: existingUser ? 'Ese nombre de usuario ya está en uso.' : 'Nombre disponible.',
  });
});

router.post('/register', async (req, res) => {
  const username = (req.body.username || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';

  if (!username || !email || !password) {
    return res.status(400).render('register', {
      error: 'Completa todos los campos.',
      user: req.session.user || null,
      flash: req.session.flash || null,
    });
  }

  if (!USERNAME_REGEX.test(username)) {
    return res.status(400).render('register', {
      error: 'El nombre de usuario debe tener entre 3 y 20 caracteres y solo usar letras, números, guiones y guiones bajos.',
      user: req.session.user || null,
      flash: req.session.flash || null,
    });
  }

  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).render('register', {
      error: 'Introduce un correo electrónico válido.',
      user: req.session.user || null,
      flash: req.session.flash || null,
    });
  }

  if (password.length < 6) {
    return res.status(400).render('register', {
      error: 'La contraseña debe tener al menos 6 caracteres.',
      user: req.session.user || null,
      flash: req.session.flash || null,
    });
  }

  if (await getUserByUsername(username)) {
    return res.status(409).render('register', {
      error: 'Ese nombre de usuario ya está en uso.',
      user: req.session.user || null,
      flash: req.session.flash || null,
    });
  }

  if (await getUserByEmail(email)) {
    return res.status(409).render('register', {
      error: 'Ese email ya está registrado.',
      user: req.session.user || null,
      flash: req.session.flash || null,
    });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await createUser({ username, email, passwordHash });

  req.session.flash = {
    type: 'success',
    message: 'Cuenta creada correctamente. Ya puedes iniciar sesión.',
  };
  res.redirect('/auth/login');
});

router.post('/logout', (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      return res.status(500).render('error', {
        message: 'No se pudo cerrar la sesión. Inténtalo de nuevo.',
        user: null,
      });
    }

    res.clearCookie('connect.sid');
    res.redirect('/');
  });
});

module.exports = router;
