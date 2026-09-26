const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { detectFileType } = require('../lib/file-type-compat');
const { v4: uuidv4 } = require('uuid');
const {
  getAllUsers,
  updateUserRole,
  deleteUserById,
  getAllSongs,
  deleteSongById,
  getAllPlaylists,
  deletePlaylistById,
  getSiteSettings,
  upsertSiteSettings,
} = require('../database');
const { authCheck } = require('../middleware/auth-check');
const { requireAdmin } = require('../middleware/require-admin');

const router = express.Router();

const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const baseDir = path.join(__dirname, '..', 'uploads', 'site');
    fs.mkdirSync(baseDir, { recursive: true });
    cb(null, baseDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || 'logo.png').toLowerCase() || '.png';
    cb(null, `logo-${uuidv4()}${ext}`);
  },
});

const uploadLogo = multer({
  storage: logoStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('El logo debe ser una imagen válida (PNG, JPG, WEBP o GIF).'));
    }

    cb(null, true);
  },
});

function sanitizeText(value) {
  return String(value || '').replace(/[<>]/g, '').trim();
}

router.use(authCheck, requireAdmin);

router.get('/', async (req, res) => {
  const [users, songs, playlists, siteSettings] = await Promise.all([
    getAllUsers(),
    getAllSongs(),
    getAllPlaylists(),
    getSiteSettings(),
  ]);

  res.render('admin-panel', {
    users,
    songs,
    playlists,
    siteSettings,
    user: req.session.user,
    flash: req.session.flash || null,
  });
});

router.post('/users/:id/role', async (req, res) => {
  const userId = Number(req.params.id);
  const role = String(req.body.role || 'user').trim();

  if (!['user', 'admin'].includes(role)) {
    req.session.flash = { type: 'error', message: 'Rol no válido.' };
    return res.redirect('/admin');
  }

  await updateUserRole(userId, role);
  req.session.flash = { type: 'success', message: 'Rol actualizado correctamente.' };

  if (req.session.user && req.session.user.id === userId) {
    req.session.user.role = role;
  }

  res.redirect('/admin');
});

router.post('/users/:id/delete', async (req, res) => {
  const userId = Number(req.params.id);

  if (req.session.user && req.session.user.id === userId) {
    req.session.flash = { type: 'error', message: 'No puedes eliminar tu propia cuenta desde el panel.' };
    return res.redirect('/admin');
  }

  await deleteUserById(userId);
  req.session.flash = { type: 'success', message: 'Usuario eliminado correctamente.' };
  res.redirect('/admin');
});

router.post('/songs/:id/delete', async (req, res) => {
  const songId = Number(req.params.id);
  const song = await require('../database').getSongById(songId);

  if (!song) {
    req.session.flash = { type: 'error', message: 'La canción no existe.' };
    return res.redirect('/admin');
  }

  const fileToDelete = path.join(__dirname, '..', 'uploads', path.basename(song.filepath));
  if (fs.existsSync(fileToDelete)) {
    fs.unlinkSync(fileToDelete);
  }

  if (song.coverPath) {
    const coverToDelete = path.join(__dirname, '..', song.coverPath.replace(/^\//, ''));
    if (fs.existsSync(coverToDelete)) {
      fs.unlinkSync(coverToDelete);
    }
  }

  await deleteSongById(songId);
  req.session.flash = { type: 'success', message: 'Canción eliminada por el administrador.' };
  res.redirect('/admin');
});

router.post('/playlists/:id/delete', async (req, res) => {
  const playlistId = Number(req.params.id);
  await deletePlaylistById(playlistId);
  req.session.flash = { type: 'success', message: 'Playlist eliminada por el administrador.' };
  res.redirect('/admin');
});

router.post('/settings', uploadLogo.single('logo'), async (req, res) => {
  try {
    const currentSettings = await getSiteSettings();
    const logoFile = req.file;

    let logoPath = currentSettings.logoPath || null;

    if (logoFile) {
      if (logoFile.size > 2 * 1024 * 1024) {
        throw new Error('El logo no debe superar 2 MB.');
      }

      const realType = await detectFileType(fs.readFileSync(logoFile.path));
      if (!realType || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(realType.mime)) {
        fs.unlinkSync(logoFile.path);
        throw new Error('El archivo subido no es una imagen válida.');
      }

      logoPath = `/uploads/site/${path.basename(logoFile.path)}`;
    }

    const accentColor = String(req.body.accentColor || currentSettings.accentColor || '#8B5CF6').trim();
    const backgroundColor = String(req.body.backgroundColor || currentSettings.backgroundColor || '#0F0F12').trim();
    const cardColor = String(req.body.cardColor || currentSettings.cardColor || '#1A1A1F').trim();
    const headingFont = String(req.body.headingFont || currentSettings.headingFont || 'Sora').trim();
    const bodyFont = String(req.body.bodyFont || currentSettings.bodyFont || 'Inter').trim();
    const fontScale = ['small', 'medium', 'large', 'xlarge'].includes(req.body.fontScale) ? req.body.fontScale : currentSettings.fontScale || 'medium';
    const siteEmoji = String(req.body.siteEmoji || currentSettings.siteEmoji || '🎵').trim().slice(0, 4) || '🎵';
    const headerEmoji = String(req.body.headerEmoji || currentSettings.headerEmoji || '🎧').trim().slice(0, 4) || '🎧';
    const heroEmoji = String(req.body.heroEmoji || currentSettings.heroEmoji || '✨').trim().slice(0, 4) || '✨';
    const seasonTheme = Boolean(req.body.seasonTheme === 'on' || req.body.seasonTheme === 'true');

    const isLightSurface = (hex) => {
      const value = hex.replace('#', '');
      const safe = value.length === 3 ? value.split('').map((char) => char + char).join('') : value;
      const num = Number.parseInt(safe, 16);
      const r = (num >> 16) & 255;
      const g = (num >> 8) & 255;
      const b = num & 255;
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return luminance > 0.8;
    };

    if (isLightSurface(backgroundColor) && isLightSurface(cardColor)) {
      throw new Error('Contraste bajo: evita fondos y tarjetas casi blancos con texto claro.');
    }

    const nextSettings = {
      siteName: sanitizeText(req.body.siteName || currentSettings.siteName),
      heroText: sanitizeText(req.body.heroText || currentSettings.heroText),
      accentColor,
      backgroundColor,
      cardColor,
      typography: ['Inter', 'Sora', 'Space Grotesk', 'Poppins', 'Roboto', 'Montserrat', 'Lora', 'Merriweather', 'Nunito', 'Raleway', 'Playfair Display', 'Ubuntu', 'Oswald', 'Pacifico', 'Lobster', 'Bungee', 'Orbitron', 'Quicksand'].includes(req.body.typography)
        ? req.body.typography
        : currentSettings.typography,
      headingFont: ['Inter', 'Sora', 'Space Grotesk', 'Poppins', 'Roboto', 'Montserrat', 'Lora', 'Merriweather', 'Nunito', 'Raleway', 'Playfair Display', 'Ubuntu', 'Oswald', 'Pacifico', 'Lobster', 'Bungee', 'Orbitron', 'Quicksand'].includes(headingFont)
        ? headingFont
        : currentSettings.headingFont || 'Sora',
      bodyFont: ['Inter', 'Sora', 'Space Grotesk', 'Poppins', 'Roboto', 'Montserrat', 'Lora', 'Merriweather', 'Nunito', 'Raleway', 'Playfair Display', 'Ubuntu', 'Oswald', 'Pacifico', 'Lobster', 'Bungee', 'Orbitron', 'Quicksand'].includes(bodyFont)
        ? bodyFont
        : currentSettings.bodyFont || 'Inter',
      fontScale,
      siteEmoji,
      headerEmoji,
      heroEmoji,
      primaryButtonText: sanitizeText(req.body.primaryButtonText || currentSettings.primaryButtonText || 'Añadir canción'),
      secondaryButtonText: sanitizeText(req.body.secondaryButtonText || currentSettings.secondaryButtonText || 'Explorar más'),
      welcomeText: sanitizeText(req.body.welcomeText || currentSettings.welcomeText || 'Explora la biblioteca más reciente, crea playlists con estilo y comparte música con la comunidad.'),
      libraryTitle: sanitizeText(req.body.libraryTitle || currentSettings.libraryTitle || 'Biblioteca'),
      playlistsTitle: sanitizeText(req.body.playlistsTitle || currentSettings.playlistsTitle || 'Mis Playlists'),
      emptyStateText: sanitizeText(req.body.emptyStateText || currentSettings.emptyStateText || 'Aún no hay canciones — ¡sube la primera!'),
      footerText: sanitizeText(req.body.footerText || currentSettings.footerText || 'Hecho con ❤️ para la comunidad.'),
      profileStatsTitle: sanitizeText(req.body.profileStatsTitle || currentSettings.profileStatsTitle || 'Mi actividad'),
      seasonTheme,
      logoPath,
    };

    await upsertSiteSettings(nextSettings);
    req.session.flash = { type: 'success', message: 'Configuración visual actualizada.' };
    return res.redirect('/admin');
  } catch (error) {
    console.error(error);
    req.session.flash = { type: 'error', message: error.message || 'No se pudo guardar la configuración.' };
    return res.redirect('/admin');
  }
});

module.exports = router;
