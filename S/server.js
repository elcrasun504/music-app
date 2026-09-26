const express = require('express');
const session = require('express-session');
const path = require('path');
const dotenv = require('dotenv');
const authRoutes = require('./routes/auth');
const songsRoutes = require('./routes/songs');
const playlistsRoutes = require('./routes/playlists');
const adminRoutes = require('./routes/admin');
const profileRoutes = require('./routes/profile');
const { getAllSongs, getAllVideos, getUserPlaylists, getSiteSettings, getUserStats } = require('./database');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const SESSION_SECRET = process.env.SESSION_SECRET || '';

if (IS_PRODUCTION && SESSION_SECRET.length < 32) {
  throw new Error('En producción, define SESSION_SECRET con al menos 32 caracteres aleatorios.');
}

if (IS_PRODUCTION) {
  app.set('trust proxy', 1);
}

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
  const radius = { sharp: '4px', soft: '12px', round: '22px' }[settings.cardStyle || 'soft'] || '12px';
  const density = { compact: '0.8rem', comfortable: '1.2rem', spacious: '1.8rem' }[settings.layoutDensity || 'comfortable'] || '1.2rem';
  const textColor = settings.textColor || '#F4F1EA';
  const mutedColor = settings.mutedColor || '#AAB3C2';
  const primaryButtonColor = settings.primaryButtonColor || accent;
  const secondaryButtonColor = settings.secondaryButtonColor || '#376DAE';
  const dangerButtonColor = settings.dangerButtonColor || '#C84F68';
  const motionMode = settings.motionMode === 'reduced' ? 'reduced' : 'full';

  return `
    :root {
      --bg: ${bg};
      --panel: ${card};
      --panel-soft: ${hexToRgba(card, 0.9)};
      --primary: ${accent};
      --primary-strong: ${accent};
      --success: #10B981;
      --cyan: #22D3EE;
      --text: ${textColor};
      --muted: ${mutedColor};
      --button-primary: ${primaryButtonColor};
      --button-secondary: ${secondaryButtonColor};
      --button-danger: ${dangerButtonColor};
      --border: rgba(255, 255, 255, 0.08);
      --danger: #EF4444;
      --shadow: 0 18px 32px rgba(0, 0, 0, 0.35);
      --radius: 12px;
      --radius-card: ${radius};
      --layout-gap: ${density};
      --font-scale: ${fontScale};
      --font-body: '${bodyFont}', 'Inter', 'Segoe UI', sans-serif;
      --font-heading: '${headingFont}', 'Sora', 'Segoe UI', sans-serif;
      --z-header: 20;
      --z-dropdown: 40;
      --z-modal: 100;
      --z-content: 1;
    }

    body {
      background-image: ${settings.backgroundPattern === 'grid'
    ? 'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)'
    : settings.backgroundPattern === 'plain' ? 'none' : `radial-gradient(circle at 15% 0%, ${hexToRgba(accent, 0.16)}, transparent 34rem), radial-gradient(circle at 90% 18%, ${hexToRgba('#22D3EE', 0.1)}, transparent 30rem)`};
      background-size: ${settings.backgroundPattern === 'grid' ? '32px 32px' : 'auto'};
    }

    .panel,
    .card-soft,
    .song-card,
    .playlist-card,
    .form-box,
    .global-player {
      border-radius: var(--radius-card);
    }

    .song-grid,
    .playlist-list,
    .admin-dashboard {
      gap: var(--layout-gap);
    }

    .topbar {
      background: ${settings.navStyle === 'solid' ? bg : 'rgba(17, 17, 22, 0.72)'};
      ${settings.navStyle === 'underline' ? 'backdrop-filter: none; border-bottom: 2px solid var(--primary);' : ''}
    }

    .nav-links button,
    .primary-btn {
      background: linear-gradient(135deg, var(--button-primary), ${hexToRgba(primaryButtonColor, 0.72)});
    }

    .secondary-btn,
    .ghost-btn {
      border-color: ${hexToRgba(secondaryButtonColor, 0.6)};
    }

    .danger-btn {
      background: ${hexToRgba(dangerButtonColor, 0.18)};
      border-color: ${hexToRgba(dangerButtonColor, 0.65)};
    }

    ${motionMode === 'reduced' ? `
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }` : ''}

    body {
      background-color: var(--bg);
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
  const formFont = (settings.typography || 'Inter').trim();
  const familyNames = [...new Set([headingFont, bodyFont, formFont])].filter(Boolean);

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
    secret: SESSION_SECRET || 'development-only-fallback-secret',
    resave: false,
    rolling: true,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: IS_PRODUCTION,
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
app.get('/service-worker.js', (req, res) => {
  res.set('Service-Worker-Allowed', '/');
  res.set('Cache-Control', 'no-cache');
  res.type('application/javascript');
  res.sendFile(path.join(__dirname, 'public', 'service-worker.js'));
});
app.get('/pwa/site.css', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.type('text/css');
  res.send(res.locals.siteCss);
});
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  index: false,
  dotfiles: 'ignore',
  maxAge: '1d',
  etag: true,
  lastModified: true,
}));

app.get('/', async (req, res) => {
  const videos = await getAllVideos();
  res.render('home', {
    featuredVideo: videos[0] || null,
    user: req.session.user || null,
    flash: res.locals.flash,
  });
});

app.get('/library', async (req, res) => {
  const sort = ['az', 'za', 'newest'].includes(req.query.sort) ? req.query.sort : 'newest';
  const songs = await getAllSongs(req.session.user && req.session.user.id, sort);
  const userPlaylists = req.session.user ? await getUserPlaylists(req.session.user.id) : [];

  const userStats = req.session.user ? await getUserStats(req.session.user.id) : null;

  res.render('index', {
    songs,
    sort,
    userPlaylists,
    user: req.session.user || null,
    userStats,
    flash: res.locals.flash,
    errorMessage: null,
  });
});

app.get('/videos', async (req, res, next) => {
  try {
    const userPlaylists = req.session.user ? await getUserPlaylists(req.session.user.id) : [];
    res.render('videos', {
      videos,
      userPlaylists,
      user: req.session.user || null,
      flash: res.locals.flash,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/login', (req, res) => {
  res.redirect('/auth/login');
});

app.get('/register', (req, res) => {
  res.redirect('/auth/register');
});

app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/profile', profileRoutes);
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
