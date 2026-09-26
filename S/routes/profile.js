const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const {
  getUserById,
  getUserByUsername,
  getSongsByUploader,
  getUserStats,
  updateUserProfile,
} = require('../database');
const { authCheck } = require('../middleware/auth-check');

const router = express.Router();
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, callback) => {
      const destination = path.join(__dirname, '..', 'public', 'uploads', 'avatars');
      fs.mkdirSync(destination, { recursive: true });
      callback(null, destination);
    },
    filename: (req, file, callback) => {
      const extension = path.extname(file.originalname || '').toLowerCase();
      callback(null, `${req.session.user.id}-${Date.now()}${extension}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) {
      return callback(null, true);
    }
    return callback(new Error('El avatar debe ser una imagen JPG, PNG, WEBP o GIF.'));
  },
});

router.get('/', authCheck, async (req, res, next) => {
  try {
    const profile = await getUserById(req.session.user.id);
    if (!profile) {
      return res.status(404).render('error', {
        message: 'No se encontró tu perfil.',
        user: null,
        flash: res.locals.flash,
      });
    }
    const songs = await getSongsByUploader(profile.id);
    const stats = await getUserStats(profile.id);
    return res.render('profile', { profile, songs, stats, isOwner: true, error: null });
  } catch (error) {
    return next(error);
  }
});

router.get('/:username', async (req, res, next) => {
  try {
    const profile = await getUserByUsername(req.params.username);
    if (!profile) return res.status(404).render('error', { message: 'El perfil no existe.', user: req.session.user || null, flash: res.locals.flash });

    const songs = await getSongsByUploader(profile.id);
    const stats = await getUserStats(profile.id);
    return res.render('profile', {
      profile,
      songs,
      stats,
      isOwner: Boolean(req.session.user && req.session.user.id === profile.id),
      error: null,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/update', authCheck, upload.single('avatar'), async (req, res) => {
  try {
    const avatarPath = req.file ? `/public/uploads/avatars/${req.file.filename}` : undefined;
    await updateUserProfile(req.session.user.id, {
      bio: String(req.body.bio || '').trim().slice(0, 500),
      avatarPath,
    });
    req.session.flash = { type: 'success', message: 'Perfil actualizado.' };
  } catch (error) {
    req.session.flash = { type: 'error', message: error.message || 'No se pudo actualizar el perfil.' };
  }
  return res.redirect('/profile');
});

router.use((error, req, res, next) => {
  if (error && error.code === 'LIMIT_FILE_SIZE') {
    req.session.flash = { type: 'error', message: 'El avatar no puede superar 5 MB.' };
    return res.redirect('/profile');
  }
  if (error) {
    req.session.flash = { type: 'error', message: error.message || 'No se pudo actualizar el perfil.' };
    return res.redirect('/profile');
  }
  return next(error);
});

module.exports = router;
