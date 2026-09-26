const { getUserById } = require('../database');

async function requireAdmin(req, res, next) {
  const sessionUser = req.session && req.session.user ? req.session.user : null;

  if (!sessionUser) {
    return res.redirect('/');
  }

  if (sessionUser.role === 'admin' && sessionUser.id === 'admin-pin') {
    req.session.user = {
      ...req.session.user,
      role: 'admin',
    };
    return next();
  }

  const freshUser = await getUserById(sessionUser.id);
  const userRole = freshUser ? freshUser.role : sessionUser.role;

  if (!freshUser || userRole !== 'admin') {
    return res.redirect('/');
  }

  req.session.user = {
    ...req.session.user,
    role: userRole,
  };

  next();
}

module.exports = { requireAdmin };
