const express = require('express');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { detectFileType } = require('../lib/file-type-compat');
const { v4: uuidv4 } = require('uuid');
const {
  getAllUsers,
  createUser,
  updateUserAccount,
  DEFAULT_USER_PERMISSIONS,
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
const SUPPORTED_FONTS = [
  'Inter', 'Manrope', 'DM Sans', 'Plus Jakarta Sans', 'Space Grotesk', 'Sora',
  'Outfit', 'IBM Plex Sans', 'Lora', 'Merriweather', 'Playfair Display', 'Libre Baskerville',
];

const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const baseDir = path.join(__dirname, '..', 'uploads', 'site');
    fs.mkdirSync(baseDir, { recursive: true });
    cb(null, baseDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || 'logo.png').toLowerCase() || '.png';
    const prefix = file.fieldname === 'heroImage' ? 'hero' : file.fieldname === 'avatar' ? 'avatar' : 'logo';
    cb(null, `${prefix}-${uuidv4()}${ext}`);
  },
});

const uploadBranding = multer({
  storage: logoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
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

function colorValue(value, fallback) {
  const candidate = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(candidate) ? candidate : fallback;
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

function permissionsFromBody(body) {
  return {
    upload: body.uploadPermission === 'on',
    playlist: body.playlistPermission === 'on',
    profile: body.profilePermission === 'on',
  };
}

router.post('/users/create', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const role = ['user', 'admin'].includes(req.body.role) ? req.body.role : 'user';

    if (!username || !email || password.length < 6) {
      throw new Error('Completa usuario, email y una contraseña de al menos 6 caracteres.');
    }

    await createUser({
      username,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      role,
      permissions: permissionsFromBody(req.body),
    });
    req.session.flash = { type: 'success', message: 'Perfil creado correctamente.' };
  } catch (error) {
    req.session.flash = { type: 'error', message: error.code === 'P2002' ? 'El usuario o email ya existe.' : error.message };
  }
  return res.redirect('/admin');
});

router.post('/users/:id/update', uploadBranding.fields([{ name: 'avatar', maxCount: 1 }]), async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const username = String(req.body.username || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const role = ['user', 'admin'].includes(req.body.role) ? req.body.role : 'user';
    if (!username || !email) throw new Error('Usuario y email son obligatorios.');

    const avatarFile = req.files && req.files.avatar ? req.files.avatar[0] : null;
    let avatarPath;
    if (avatarFile) {
      if (avatarFile.size > 5 * 1024 * 1024) throw new Error('El avatar no puede superar 5 MB.');
      const realType = await detectFileType(fs.readFileSync(avatarFile.path));
      if (!realType || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(realType.mime)) {
        fs.unlinkSync(avatarFile.path);
        throw new Error('El avatar no es una imagen válida.');
      }
      avatarPath = `/uploads/site/${path.basename(avatarFile.path)}`;
    }

    await updateUserAccount(userId, {
      username,
      email,
      role,
      bio: req.body.bio || '',
      avatarPath,
      passwordHash: password ? await bcrypt.hash(password, 10) : undefined,
      permissions: permissionsFromBody(req.body),
    });
    if (req.session.user.id === userId) {
      req.session.user.username = username;
      req.session.user.email = email;
      req.session.user.role = role;
    }
    req.session.flash = { type: 'success', message: 'Perfil actualizado correctamente.' };
  } catch (error) {
    req.session.flash = { type: 'error', message: error.code === 'P2002' ? 'El usuario o email ya existe.' : error.message };
  }
  return res.redirect('/admin');
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

router.post('/settings', uploadBranding.fields([{ name: 'logo', maxCount: 1 }, { name: 'heroImage', maxCount: 1 }]), async (req, res) => {
  try {
    const currentSettings = await getSiteSettings();
    const logoFile = req.files && req.files.logo ? req.files.logo[0] : null;
    const heroFile = req.files && req.files.heroImage ? req.files.heroImage[0] : null;

    let logoPath = currentSettings.logoPath || null;
    let heroImagePath = currentSettings.heroImagePath || null;

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

    if (heroFile) {
      if (heroFile.size > 5 * 1024 * 1024) {
        throw new Error('La imagen principal no debe superar 5 MB.');
      }

      const realType = await detectFileType(fs.readFileSync(heroFile.path));
      if (!realType || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(realType.mime)) {
        fs.unlinkSync(heroFile.path);
        throw new Error('La imagen principal no es válida.');
      }

      heroImagePath = `/uploads/site/${path.basename(heroFile.path)}`;
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
    const visualStyle = ['aurora', 'studio', 'night'].includes(req.body.visualStyle) ? req.body.visualStyle : currentSettings.visualStyle || 'aurora';
    const cardStyle = ['sharp', 'soft', 'round'].includes(req.body.cardStyle) ? req.body.cardStyle : currentSettings.cardStyle || 'soft';
    const layoutDensity = ['compact', 'comfortable', 'spacious'].includes(req.body.layoutDensity) ? req.body.layoutDensity : currentSettings.layoutDensity || 'comfortable';
    const backgroundPattern = ['mesh', 'grid', 'plain'].includes(req.body.backgroundPattern) ? req.body.backgroundPattern : currentSettings.backgroundPattern || 'mesh';
    const navStyle = ['glass', 'solid', 'underline'].includes(req.body.navStyle) ? req.body.navStyle : currentSettings.navStyle || 'glass';
    const textColor = colorValue(req.body.textColor, currentSettings.textColor || '#F4F1EA');
    const mutedColor = colorValue(req.body.mutedColor, currentSettings.mutedColor || '#AAB3C2');
    const primaryButtonColor = colorValue(req.body.primaryButtonColor, currentSettings.primaryButtonColor || accentColor);
    const secondaryButtonColor = colorValue(req.body.secondaryButtonColor, currentSettings.secondaryButtonColor || '#376DAE');
    const dangerButtonColor = colorValue(req.body.dangerButtonColor, currentSettings.dangerButtonColor || '#C84F68');
    const motionMode = ['full', 'reduced'].includes(req.body.motionMode) ? req.body.motionMode : currentSettings.motionMode || 'full';
    const mediaPreload = ['none', 'metadata'].includes(req.body.mediaPreload) ? req.body.mediaPreload : currentSettings.mediaPreload || 'metadata';

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
      typography: SUPPORTED_FONTS.includes(req.body.typography)
        ? req.body.typography
        : currentSettings.typography,
      headingFont: SUPPORTED_FONTS.includes(headingFont)
        ? headingFont
        : currentSettings.headingFont || 'Sora',
      bodyFont: SUPPORTED_FONTS.includes(bodyFont)
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
      heroImagePath,
      visualStyle,
      cardStyle,
      layoutDensity,
      backgroundPattern,
      navStyle,
      textColor,
      mutedColor,
      primaryButtonColor,
      secondaryButtonColor,
      dangerButtonColor,
      motionMode,
      mediaPreload,
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
