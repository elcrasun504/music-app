const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const {
  getUserByUsername,
  getUserById,
  updateUserProfile,
  getUserStats,
  getSongsByUploader,
} = require('../database');
const { authCheck } = require('../middleware/auth-check');
const { detectFileType } = require('../lib/file-type-compat');

const router = express.Router();

const BIO_MAX_LENGTH = 280;
const AVATAR_MAX_SIZE = 5 * 1024 * 1024;

const allowedAvatarMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const allowedAvatarExtensions = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AVATAR_MAX_SIZE },
});

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    bio: user.bio || '',
    avatarPath: user.avatarPath || null,
    createdAt: user.createdAt,
  };
}

async function renderProfile(req, res, { username, notFoundRedirect }) {
  const profileUser = await getUserByUsername(username);

  if (!profileUser) {
    req.session.flash = { type: 'error', message: 'Ese usuario no existe.' };
    return res.redirect(notFoundRedirect || '/');
  }

  const isOwner = Boolean(req.session.user && req.session.user.id === profileUser.id);
  const [stats, songs] = await Promise.all([
    getUserStats(profileUser.id),
    getSongsByUploader(profileUser.id),
  ]);

  return res.render('profile', {
    profileUser: publicUser(profileUser),
    isOwner,
    stats,
    songs,
    user: req.session.user || null,
    flash: res.locals.flash,
    error: null,
  });
}

router.get('/', authCheck, async (req, res) => {
  res.redirect(`/profile/${encodeURIComponent(req.session.user.username)}`);
});

router.get('/:username', async (req, res) => {
  await renderProfile(req, res, { username: req.params.username, notFoundRedirect: '/' });
});

router.post('/bio', authCheck, async (req, res) => {
  const bio = String(req.body.bio || '').trim();

  if (bio.length > BIO_MAX_LENGTH) {
    req.session.flash = { type: 'error', message: `La bio no puede superar los ${BIO_MAX_LENGTH} caracteres.` };
    return res.redirect(`/profile/${encodeURIComponent(req.session.user.username)}`);
  }

  await updateUserProfile(req.session.user.id, { bio });
  req.session.flash = { type: 'success', message: 'Bio actualizada.' };
  return res.redirect(`/profile/${encodeURIComponent(req.session.user.username)}`);
});

router.post('/avatar', authCheck, avatarUpload.single('avatar'), async (req, res) => {
  const redirectTo = `/profile/${encodeURIComponent(req.session.user.username)}`;

  try {
    if (!req.file) {
      req.session.flash = { type: 'error', message: 'Selecciona una imagen para tu foto de perfil.' };
      return res.redirect(redirectTo);
    }

    const browserMime = (req.file.mimetype || '').toLowerCase();
    let mimeType = allowedAvatarMimeTypes.has(browserMime) ? browserMime : null;
    let extension = path.extname(req.file.originalname || '').slice(1).toLowerCase();

    if (!mimeType) {
      const detected = await detectFileType(req.file.buffer).catch(() => null);
      mimeType = detected && detected.mime ? detected.mime : null;
      extension = detected && detected.ext ? detected.ext : extension;
    }

    if (!mimeType || !allowedAvatarMimeTypes.has(mimeType)) {
      req.session.flash = { type: 'error', message: 'Formato no permitido. Usa JPG, PNG, WEBP o GIF.' };
      return res.redirect(redirectTo);
    }

    if (!extension || !allowedAvatarExtensions.has(extension)) {
      extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : mimeType === 'image/gif' ? 'gif' : 'jpg';
    }

    const avatarDir = path.join(__dirname, '..', 'uploads', 'avatars');
    fs.mkdirSync(avatarDir, { recursive: true });

    const uniqueFilename = `${uuidv4()}.${extension}`;
    fs.writeFileSync(path.join(avatarDir, uniqueFilename), req.file.buffer);

    const previousUser = await getUserById(req.session.user.id);
    await updateUserProfile(req.session.user.id, { avatarPath: `/uploads/avatars/${uniqueFilename}` });

    if (previousUser && previousUser.avatarPath) {
      const previousFile = path.join(__dirname, '..', previousUser.avatarPath.replace(/^\//, ''));
      if (fs.existsSync(previousFile)) {
        fs.unlinkSync(previousFile);
      }
    }

    req.session.flash = { type: 'success', message: 'Foto de perfil actualizada.' };
    return res.redirect(redirectTo);
  } catch (error) {
    console.error('[PROFILE/AVATAR] Error al subir la foto de perfil:', error);
    req.session.flash = { type: 'error', message: 'No se pudo subir la foto de perfil.' };
    return res.redirect(redirectTo);
  }
});

router.post('/avatar/delete', authCheck, async (req, res) => {
  const redirectTo = `/profile/${encodeURIComponent(req.session.user.username)}`;

  try {
    const currentUser = await getUserById(req.session.user.id);

    if (currentUser && currentUser.avatarPath) {
      const filePath = path.join(__dirname, '..', currentUser.avatarPath.replace(/^\//, ''));
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await updateUserProfile(req.session.user.id, { avatarPath: null });
    req.session.flash = { type: 'success', message: 'Foto de perfil eliminada.' };
  } catch (error) {
    console.error('[PROFILE/AVATAR] Error al eliminar la foto de perfil:', error);
    req.session.flash = { type: 'error', message: 'No se pudo eliminar la foto de perfil.' };
  }

  return res.redirect(redirectTo);
});

module.exports = router;
