const { getUserById, normalizePermissions } = require('../database');

async function authCheck(req, res, next) {
  if (!req.session || !req.session.user) {
    req.session.returnTo = req.originalUrl;
    return res.redirect('/auth/login');
  }

  const freshUser = await getUserById(req.session.user.id);

  if (!freshUser) {
    req.session.destroy((error) => {
      if (error) {
        console.error('No se pudo cerrar la sesión vencida:', error);
      }
      return res.redirect('/auth/login');
    });
    return;
  }

  req.session.user = {
    id: freshUser.id,
    username: freshUser.username,
    email: freshUser.email,
    role: freshUser.role,
    permissions: normalizePermissions(freshUser.permissions),
  };

  req.user = req.session.user;
  next();
}

module.exports = { authCheck };
