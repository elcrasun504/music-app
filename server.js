const express = require('express');
const session = require('express-session');
const path = require('path');
const dotenv = require('dotenv');
const authRoutes = require('./routes/auth');
const songsRoutes = require('./routes/songs');
const playlistsRoutes = require('./routes/playlists');
const adminRoutes = require('./routes/admin');
const adminAccessRoutes = require('./routes/admin-access');
const { getAllSongs, getUserPlaylists, getSiteSettings, getUserStats } = require('./database');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');

function hexToRgba(hex, alpha = 1) {
  const value = hex.replace('#', '');
  const safeHex = value.length === 3 ? value.split('').map((char) => char + char).join('') : value;
  const numeric = Number.parseInt(safeHex, 16);
  const r = (numeric >> 16) & 255;
  const g = (numeric >> 8) & 255;
  const b = numeric & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function buildSiteCss(settings) {
  const accent = settings.accentColor || '#8B5CF6';
  const bg = settings.backgroundColor || '#0F0F12';
  const card = settings.cardColor || '#1A1A1F';
  const typography = settings.typography || 'Inter';
  const headingFont = settings.headingFont || 'Sora';
  const bodyFont = settings.bodyFont || 'Inter';
  const fontScale = { small: 0.92, medium: 1, large: 1.08, xlarge: 1.2 }[settings.fontScale || 'medium'] || 1;

  return `
    :root {
      --bg: ${bg};
      --panel: ${card};
      --panel-soft: ${hexToRgba(card, 0.9)};
      --primary: ${accent};
      --primary-strong: ${accent};
      --success: #10B981;
      --cyan: #22D3EE;
      --text: #F2F2F2;
      --muted: #9CA3AF;
      --border: rgba(255, 255, 255, 0.08);
      --danger: #EF4444;
      --shadow: 0 18px 32px rgba(0, 0, 0, 0.35);
      --radius: 12px;
      --font-scale: ${fontScale};
      --font-body: '${bodyFont}', 'Inter', 'Segoe UI', sans-serif;
      --font-heading: '${headingFont}', 'Sora', 'Segoe UI', sans-serif;
      --z-header: 20;
      --z-dropdown: 40;
      --z-modal: 100;
      --z-content: 1;
    }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font-body);
      min-width: 0;
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    .brand a,
    .brand-text,
    .hero h1,
    .panel h2,
    .card-soft h2,
    .form-box h1,
    .playlist-card h3,
    .track-item strong,
    .song-card h3,
    .section-header h1,
    .modal-card h3,
    .user-pill,
    .site-name,
    .stat-card strong {
      font-family: var(--font-heading);
    }

    .brand-logo {
      display: block;
      height: 36px;
      width: auto;
      max-width: 160px;
      object-fit: contain;
    }

    .hero {
      background: linear-gradient(135deg, ${hexToRgba(accent, 0.18)}, ${hexToRgba('#22D3EE', 0.08)});
    }
  `;
}

function buildGoogleFontsLink(settings) {
  const headingFont = (settings.headingFont || 'Sora').trim();
  const bodyFont = (settings.bodyFont || 'Inter').trim();
  const familyNames = [...new Set([headingFont, bodyFont])].filter(Boolean);

  if (!familyNames.length) {
    return 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap';
  }

  const families = familyNames.map((name) => `family=${encodeURIComponent(name)}:wght@400;500;600;700;800`).join('&');
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'fallback-secret',
    resave: false,
    rolling: true,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    },
  })
);

app.use(async (req, res, next) => {
  const siteSettings = await getSiteSettings();
  res.locals.siteSettings = siteSettings;
  res.locals.siteCss = buildSiteCss(siteSettings);
  res.locals.googleFontHref = buildGoogleFontsLink(siteSettings);
  res.locals.user = req.session && req.session.user ? req.session.user : null;
  res.locals.flash = req.session && req.session.flash ? req.session.flash : null;
  res.locals.userStats = req.session && req.session.user ? await getUserStats(req.session.user.id) : null;
  if (req.session) {
    delete req.session.flash;
  }
  next();
});

app.use('/public', express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  etag: true,
  lastModified: true,
  index: false,
}));
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  index: false,
  dotfiles: 'ignore',
  maxAge: '1d',
  etag: true,
  lastModified: true,
}));

app.get('/', async (req, res) => {
  const songs = await getAllSongs();
  const userPlaylists = req.session.user ? await getUserPlaylists(req.session.user.id) : [];

  const userStats = req.session.user ? await getUserStats(req.session.user.id) : null;

  res.render('index', {
    songs,
    userPlaylists,
    user: req.session.user || null,
    userStats,
    flash: res.locals.flash,
    successMessage: null,
    errorMessage: null,
  });
});

app.get('/login', (req, res) => {
  res.redirect('/auth/login');
});

app.get('/register', (req, res) => {
  res.redirect('/auth/register');
});

app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/admin-access', adminAccessRoutes);
app.use('/songs', songsRoutes);
app.use('/playlists', playlistsRoutes);

app.use((req, res) => {
  const user = req.session ? req.session.user || null : null;

  res.status(404).render('error', {
    message: 'La página que buscas no existe.',
    user,
    flash: res.locals.flash,
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  const user = req.session ? req.session.user || null : null;

  res.status(500).render('error', {
    message: 'Ha ocurrido un error en el servidor. Inténtalo más tarde.',
    user,
    flash: res.locals.flash,
  });
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
