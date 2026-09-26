const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function normalizeId(value) {
  const numericValue = Number(value);
  return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : null;
}

const DEFAULT_SITE_SETTINGS = {
  siteName: 'Cholumusica',
  heroText: 'Descubre tu próxima obsesión sonora.',
  accentColor: '#7657E8',
  backgroundColor: '#151B2B',
  cardColor: '#252B3B',
  typography: 'Inter',
  headingFont: 'Sora',
  bodyFont: 'Inter',
  fontScale: 'medium',
  siteEmoji: '🎵',
  headerEmoji: '🎧',
  heroEmoji: '✨',
  primaryButtonText: 'Añadir canción',
  secondaryButtonText: 'Explorar más',
  welcomeText: 'Explora la biblioteca más reciente, crea playlists con estilo y comparte música con la comunidad.',
  libraryTitle: 'Biblioteca',
  playlistsTitle: 'Mis Playlists',
  heroImagePath: null,
  emptyStateText: 'Aún no hay canciones — ¡sube la primera!',
  footerText: 'Hecho con ❤️ para la comunidad.',
  profileStatsTitle: 'Mi actividad',
  seasonTheme: false,
  logoPath: null,
  visualStyle: 'aurora',
  cardStyle: 'soft',
  layoutDensity: 'comfortable',
  backgroundPattern: 'mesh',
  navStyle: 'glass',
  textColor: '#F4F1EA',
  mutedColor: '#AAB3C2',
  primaryButtonColor: '#7657E8',
  secondaryButtonColor: '#376DAE',
  dangerButtonColor: '#C84F68',
  motionMode: 'full',
  mediaPreload: 'metadata',
};

const DEFAULT_USER_PERMISSIONS = {
  upload: true,
  playlist: true,
  profile: true,
};

function normalizePermissions(value) {
  let permissions = value;
  if (typeof value === 'string') {
    try {
      permissions = JSON.parse(value);
    } catch (error) {
      permissions = {};
    }
  }

  return {
    upload: Boolean(permissions && permissions.upload),
    playlist: Boolean(permissions && permissions.playlist),
    profile: Boolean(permissions && permissions.profile),
  };
}

async function getUserByEmail(email) {
  return prisma.user.findUnique({
    where: { email: String(email || '').trim().toLowerCase() },
  });
}

async function getUserByUsername(username) {
  const normalized = String(username || '').trim();
  if (!normalized) return null;

  return prisma.user.findUnique({
    where: { username: normalized },
  });
}

async function getUserById(id) {
  const safeId = normalizeId(id);
  if (safeId === null) return null;
  return prisma.user.findUnique({ where: { id: safeId } });
}

async function getAllUsers() {
  return prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      bio: true,
      permissions: true,
      createdAt: true,
    },
  }).then((users) => users.map((user) => ({ ...user, permissions: normalizePermissions(user.permissions) })));
}

async function updateUserRole(id, role) {
  const safeId = normalizeId(id);
  if (safeId === null) throw new Error('ID de usuario no válido.');

  return prisma.user.update({
    where: { id: safeId },
    data: { role },
  });
}

async function deleteUserById(id) {
  const safeId = normalizeId(id);
  if (safeId === null) throw new Error('ID de usuario no válido.');

  return prisma.user.delete({
    where: { id: safeId },
  });
}

async function createUser({ username, email, passwordHash, role = 'user', permissions = DEFAULT_USER_PERMISSIONS }) {
  return prisma.user.create({
    data: {
      username: username.trim(),
      email: email.trim().toLowerCase(),
      passwordHash,
      role,
      permissions: JSON.stringify(normalizePermissions(permissions)),
    },
  });
}

async function updateUserAccount(id, { username, email, passwordHash, role, bio, avatarPath, permissions }) {
  const safeId = normalizeId(id);
  if (safeId === null) throw new Error('ID de usuario no válido.');

  const data = {
    username: username.trim(),
    email: email.trim().toLowerCase(),
    role,
    bio: bio === undefined ? undefined : bio.trim().slice(0, 500),
    avatarPath: avatarPath === undefined ? undefined : avatarPath,
    permissions: JSON.stringify(normalizePermissions(permissions)),
  };
  if (passwordHash) data.passwordHash = passwordHash;

  return prisma.user.update({ where: { id: safeId }, data });
}

async function updateUserProfile(id, { bio, avatarPath } = {}) {
  const safeId = normalizeId(id);
  if (safeId === null) throw new Error('ID de usuario no válido.');

  const data = {};
  if (bio !== undefined) data.bio = bio;
  if (avatarPath !== undefined) data.avatarPath = avatarPath;

  return prisma.user.update({
    where: { id: safeId },
    data,
  });
}

async function getSongById(id) {
  const safeId = normalizeId(id);
  if (safeId === null) return null;
  return prisma.song.findUnique({ where: { id: safeId } });
}

async function getAllSongs(viewerId = null, sort = 'newest') {
  const safeViewerId = normalizeId(viewerId);
  const orderBy = sort === 'az' ? { title: 'asc' } : sort === 'za' ? { title: 'desc' } : { uploadedAt: 'desc' };
  const songs = await prisma.song.findMany({
    orderBy,
    include: {
      uploader: {
        select: { username: true },
      },
      preferences: safeViewerId ? { where: { userId: safeViewerId } } : false,
      personalizations: safeViewerId ? { where: { userId: safeViewerId } } : false,
    },
  });

  return songs.map((song) => {
    const preference = song.preferences && song.preferences[0];
    const personalization = song.personalizations && song.personalizations[0];
    return {
      ...song,
      title: personalization && personalization.title ? personalization.title : song.title,
      artist: personalization && personalization.artist ? personalization.artist : song.artist,
      coverPath: song.coverPath,
      uploader_id: song.uploaderId,
      uploader_username: song.uploader.username,
      isHiddenForViewer: Boolean(preference && preference.hidden),
    };
  });
}

async function setSongVisibility(userId, songId, hidden) {
  const safeUserId = normalizeId(userId);
  const safeSongId = normalizeId(songId);
  if (safeUserId === null || safeSongId === null) throw new Error('Datos de canción no válidos.');

  return prisma.songPreference.upsert({
    where: { userId_songId: { userId: safeUserId, songId: safeSongId } },
    update: { hidden: Boolean(hidden) },
    create: { userId: safeUserId, songId: safeSongId, hidden: Boolean(hidden) },
  });
}

async function saveSongPersonalization(userId, songId, { title, artist }) {
  const safeUserId = normalizeId(userId);
  const safeSongId = normalizeId(songId);
  if (safeUserId === null || safeSongId === null) throw new Error('Datos de canción no válidos.');

  return prisma.songPersonalization.upsert({
    where: { userId_songId: { userId: safeUserId, songId: safeSongId } },
    update: { title: title.trim(), artist: artist.trim() },
    create: { userId: safeUserId, songId: safeSongId, title: title.trim(), artist: artist.trim() },
  });
}

async function getAllVideos() {
  const videos = await prisma.song.findMany({
    where: { mediaType: 'video' },
    orderBy: { uploadedAt: 'desc' },
    include: {
      uploader: {
        select: { username: true },
      },
    },
  });

  return videos.map((video) => ({
    ...video,
    uploader_id: video.uploaderId,
    uploader_username: video.uploader.username,
  }));
}

async function createSong({
  title,
  artist,
  filename,
  filepath,
  mediaType = 'audio',
  uploader_id,
  duration,
  album = '',
  year = null,
  genre = '',
  coverPath = null,
  trackNumber = null,
  metadataSource = {},
}) {
  const safeUploaderId = normalizeId(uploader_id);
  if (safeUploaderId === null) {
    throw new Error('ID de usuario no válido para subir la canción.');
  }

  return prisma.song.create({
    data: {
      title: title.trim() || 'Sin título',
      artist: artist.trim() || 'Artista desconocido',
      album: album || null,
      year: year ? Number(year) : null,
      genre: genre || null,
      coverPath: coverPath || null,
      trackNumber: trackNumber ? Number(trackNumber) : null,
      metadataSource: JSON.stringify(metadataSource || {}),
      filename,
      filepath,
      mediaType: mediaType === 'video' ? 'video' : 'audio',
      duration: Number(duration || 0),
      uploader: {
        connect: { id: safeUploaderId },
      },
    },
  });
}

async function updateSongById(songId, { title, artist, album, year, genre, coverPath, trackNumber, metadataSource }) {
  const safeId = normalizeId(songId);
  if (safeId === null) throw new Error('ID de canción no válido.');

  return prisma.song.update({
    where: { id: safeId },
    data: {
      title: title.trim(),
      artist: artist.trim(),
      album: album || null,
      year: year ? Number(year) : null,
      genre: genre || null,
      coverPath: coverPath || null,
      trackNumber: trackNumber ? Number(trackNumber) : null,
      metadataSource: metadataSource ? JSON.stringify(metadataSource) : undefined,
    },
  });
}

async function deleteSongById(songId) {
  const safeId = normalizeId(songId);
  if (safeId === null) throw new Error('ID de canción no válido.');

  await prisma.playlistSong.deleteMany({
    where: { songId: safeId },
  });

  return prisma.song.delete({
    where: { id: safeId },
  });
}

async function getSongsByUploader(uploaderId) {
  const safeUploaderId = normalizeId(uploaderId);
  if (safeUploaderId === null) return [];

  const songs = await prisma.song.findMany({
    where: { uploaderId: safeUploaderId },
    orderBy: { uploadedAt: 'desc' },
    include: {
      uploader: {
        select: { username: true },
      },
    },
  });

  return songs.map((song) => ({
    ...song,
    coverPath: song.coverPath,
    uploader_id: song.uploaderId,
    uploader_username: song.uploader.username,
  }));
}

async function createPlaylist(name, ownerId) {
  const safeOwnerId = normalizeId(ownerId);
  if (safeOwnerId === null) throw new Error('ID de propietario no válido.');

  return prisma.playlist.create({
    data: {
      name: name.trim(),
      owner: {
        connect: { id: safeOwnerId },
      },
    },
  });
}

async function updatePlaylistById(playlistId, name) {
  const safeId = normalizeId(playlistId);
  if (safeId === null) throw new Error('ID de playlist no válido.');

  return prisma.playlist.update({
    where: { id: safeId },
    data: { name: name.trim() },
  });
}

async function deletePlaylistById(playlistId) {
  const safeId = normalizeId(playlistId);
  if (safeId === null) throw new Error('ID de playlist no válido.');

  await prisma.playlistSong.deleteMany({
    where: { playlistId: safeId },
  });

  return prisma.playlist.delete({
    where: { id: safeId },
  });
}

async function getUserPlaylists(ownerId) {
  const safeOwnerId = normalizeId(ownerId);
  if (safeOwnerId === null) return [];

  return prisma.playlist.findMany({
    where: { ownerId: safeOwnerId },
    orderBy: { createdAt: 'desc' },
  });
}

async function getPlaylistById(id, ownerId) {
  const safeId = normalizeId(id);
  const safeOwnerId = normalizeId(ownerId);
  if (safeId === null || safeOwnerId === null) return null;

  return prisma.playlist.findFirst({
    where: {
      id: safeId,
      ownerId: safeOwnerId,
    },
  });
}

async function getPlaylistSongs(playlistId) {
  const safePlaylistId = normalizeId(playlistId);
  if (safePlaylistId === null) return [];

  const playlistSongs = await prisma.playlistSong.findMany({
    where: { playlistId: safePlaylistId },
    orderBy: { position: 'asc' },
    include: {
      song: {
        include: {
          uploader: {
            select: { username: true },
          },
        },
      },
    },
  });

  return playlistSongs.map((entry) => ({
    ...entry.song,
    position: entry.position,
    coverPath: entry.song.coverPath,
    uploader_id: entry.song.uploaderId,
    uploader_username: entry.song.uploader.username,
  }));
}

async function getAllPlaylists() {
  return prisma.playlist.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      owner: {
        select: { username: true },
      },
    },
  });
}

async function addSongToPlaylist(playlistId, songId) {
  const existing = await prisma.playlistSong.findUnique({
    where: {
      playlistId_songId: {
        playlistId: Number(playlistId),
        songId: Number(songId),
      },
    },
  });

  if (existing) {
    return false;
  }

  const safePlaylistId = normalizeId(playlistId);
  const safeSongId = normalizeId(songId);
  if (safePlaylistId === null || safeSongId === null) return false;

  const lastEntry = await prisma.playlistSong.findFirst({
    where: { playlistId: safePlaylistId },
    orderBy: { position: 'desc' },
  });

  await prisma.playlistSong.create({
    data: {
      playlistId: safePlaylistId,
      songId: safeSongId,
      position: lastEntry ? lastEntry.position + 1 : 0,
    },
  });

  return true;
}

async function removeSongFromPlaylist(playlistId, songId) {
  const safePlaylistId = normalizeId(playlistId);
  const safeSongId = normalizeId(songId);
  if (safePlaylistId === null || safeSongId === null) return;

  await prisma.playlistSong.delete({
    where: {
      playlistId_songId: {
        playlistId: safePlaylistId,
        songId: safeSongId,
      },
    },
  }).catch(() => undefined);
}

async function getSiteSettings() {
  const settings = await prisma.siteSettings.findFirst({ orderBy: { id: 'asc' } });

  if (!settings) {
    return { ...DEFAULT_SITE_SETTINGS };
  }

  return {
    ...DEFAULT_SITE_SETTINGS,
    siteName: settings.siteName || DEFAULT_SITE_SETTINGS.siteName,
    heroText: settings.heroText || DEFAULT_SITE_SETTINGS.heroText,
    accentColor: settings.accentColor || DEFAULT_SITE_SETTINGS.accentColor,
    backgroundColor: settings.backgroundColor === '#0F0F12' ? DEFAULT_SITE_SETTINGS.backgroundColor : settings.backgroundColor || DEFAULT_SITE_SETTINGS.backgroundColor,
    cardColor: settings.cardColor === '#1A1A1F' ? DEFAULT_SITE_SETTINGS.cardColor : settings.cardColor || DEFAULT_SITE_SETTINGS.cardColor,
    typography: settings.typography || DEFAULT_SITE_SETTINGS.typography,
    headingFont: settings.headingFont || DEFAULT_SITE_SETTINGS.headingFont,
    bodyFont: settings.bodyFont || DEFAULT_SITE_SETTINGS.bodyFont,
    fontScale: settings.fontScale || DEFAULT_SITE_SETTINGS.fontScale,
    siteEmoji: settings.siteEmoji || DEFAULT_SITE_SETTINGS.siteEmoji,
    headerEmoji: settings.headerEmoji || DEFAULT_SITE_SETTINGS.headerEmoji,
    heroEmoji: settings.heroEmoji || DEFAULT_SITE_SETTINGS.heroEmoji,
    primaryButtonText: settings.primaryButtonText || DEFAULT_SITE_SETTINGS.primaryButtonText,
    secondaryButtonText: settings.secondaryButtonText || DEFAULT_SITE_SETTINGS.secondaryButtonText,
    welcomeText: settings.welcomeText || DEFAULT_SITE_SETTINGS.welcomeText,
    libraryTitle: settings.libraryTitle || DEFAULT_SITE_SETTINGS.libraryTitle,
    playlistsTitle: settings.playlistsTitle || DEFAULT_SITE_SETTINGS.playlistsTitle,
    heroImagePath: settings.heroImagePath || DEFAULT_SITE_SETTINGS.heroImagePath,
    emptyStateText: settings.emptyStateText || DEFAULT_SITE_SETTINGS.emptyStateText,
    footerText: settings.footerText || DEFAULT_SITE_SETTINGS.footerText,
    profileStatsTitle: settings.profileStatsTitle || DEFAULT_SITE_SETTINGS.profileStatsTitle,
    seasonTheme: Boolean(settings.seasonTheme),
    logoPath: settings.logoPath || null,
    visualStyle: settings.visualStyle || DEFAULT_SITE_SETTINGS.visualStyle,
    cardStyle: settings.cardStyle || DEFAULT_SITE_SETTINGS.cardStyle,
    layoutDensity: settings.layoutDensity || DEFAULT_SITE_SETTINGS.layoutDensity,
    backgroundPattern: settings.backgroundPattern || DEFAULT_SITE_SETTINGS.backgroundPattern,
    navStyle: settings.navStyle || DEFAULT_SITE_SETTINGS.navStyle,
    textColor: settings.textColor || DEFAULT_SITE_SETTINGS.textColor,
    mutedColor: settings.mutedColor || DEFAULT_SITE_SETTINGS.mutedColor,
    primaryButtonColor: settings.primaryButtonColor || DEFAULT_SITE_SETTINGS.primaryButtonColor,
    secondaryButtonColor: settings.secondaryButtonColor || DEFAULT_SITE_SETTINGS.secondaryButtonColor,
    dangerButtonColor: settings.dangerButtonColor || DEFAULT_SITE_SETTINGS.dangerButtonColor,
    motionMode: settings.motionMode || DEFAULT_SITE_SETTINGS.motionMode,
    mediaPreload: settings.mediaPreload || DEFAULT_SITE_SETTINGS.mediaPreload,
  };
}

async function upsertSiteSettings(settingsInput = {}) {
  const payload = {
    siteName: settingsInput.siteName || DEFAULT_SITE_SETTINGS.siteName,
    heroText: settingsInput.heroText || DEFAULT_SITE_SETTINGS.heroText,
    accentColor: settingsInput.accentColor || DEFAULT_SITE_SETTINGS.accentColor,
    backgroundColor: settingsInput.backgroundColor || DEFAULT_SITE_SETTINGS.backgroundColor,
    cardColor: settingsInput.cardColor || DEFAULT_SITE_SETTINGS.cardColor,
    typography: settingsInput.typography || DEFAULT_SITE_SETTINGS.typography,
    headingFont: settingsInput.headingFont || DEFAULT_SITE_SETTINGS.headingFont,
    bodyFont: settingsInput.bodyFont || DEFAULT_SITE_SETTINGS.bodyFont,
    fontScale: settingsInput.fontScale || DEFAULT_SITE_SETTINGS.fontScale,
    siteEmoji: settingsInput.siteEmoji || DEFAULT_SITE_SETTINGS.siteEmoji,
    headerEmoji: settingsInput.headerEmoji || DEFAULT_SITE_SETTINGS.headerEmoji,
    heroEmoji: settingsInput.heroEmoji || DEFAULT_SITE_SETTINGS.heroEmoji,
    primaryButtonText: settingsInput.primaryButtonText || DEFAULT_SITE_SETTINGS.primaryButtonText,
    secondaryButtonText: settingsInput.secondaryButtonText || DEFAULT_SITE_SETTINGS.secondaryButtonText,
    welcomeText: settingsInput.welcomeText || DEFAULT_SITE_SETTINGS.welcomeText,
    libraryTitle: settingsInput.libraryTitle || DEFAULT_SITE_SETTINGS.libraryTitle,
    playlistsTitle: settingsInput.playlistsTitle || DEFAULT_SITE_SETTINGS.playlistsTitle,
    heroImagePath: settingsInput.heroImagePath || DEFAULT_SITE_SETTINGS.heroImagePath,
    emptyStateText: settingsInput.emptyStateText || DEFAULT_SITE_SETTINGS.emptyStateText,
    footerText: settingsInput.footerText || DEFAULT_SITE_SETTINGS.footerText,
    profileStatsTitle: settingsInput.profileStatsTitle || DEFAULT_SITE_SETTINGS.profileStatsTitle,
    seasonTheme: Boolean(settingsInput.seasonTheme),
    logoPath: settingsInput.logoPath || null,
    visualStyle: settingsInput.visualStyle || DEFAULT_SITE_SETTINGS.visualStyle,
    cardStyle: settingsInput.cardStyle || DEFAULT_SITE_SETTINGS.cardStyle,
    layoutDensity: settingsInput.layoutDensity || DEFAULT_SITE_SETTINGS.layoutDensity,
    backgroundPattern: settingsInput.backgroundPattern || DEFAULT_SITE_SETTINGS.backgroundPattern,
    navStyle: settingsInput.navStyle || DEFAULT_SITE_SETTINGS.navStyle,
    textColor: settingsInput.textColor || DEFAULT_SITE_SETTINGS.textColor,
    mutedColor: settingsInput.mutedColor || DEFAULT_SITE_SETTINGS.mutedColor,
    primaryButtonColor: settingsInput.primaryButtonColor || DEFAULT_SITE_SETTINGS.primaryButtonColor,
    secondaryButtonColor: settingsInput.secondaryButtonColor || DEFAULT_SITE_SETTINGS.secondaryButtonColor,
    dangerButtonColor: settingsInput.dangerButtonColor || DEFAULT_SITE_SETTINGS.dangerButtonColor,
    motionMode: settingsInput.motionMode || DEFAULT_SITE_SETTINGS.motionMode,
    mediaPreload: settingsInput.mediaPreload || DEFAULT_SITE_SETTINGS.mediaPreload,
  };

  const existing = await prisma.siteSettings.findFirst({ orderBy: { id: 'asc' } });

  if (existing) {
    return prisma.siteSettings.update({
      where: { id: existing.id },
      data: payload,
    });
  }

  return prisma.siteSettings.create({ data: payload });
}

async function getUserStats(userId) {
  const safeUserId = normalizeId(userId);
  if (safeUserId === null) {
    return { songCount: 0, playlistCount: 0 };
  }

  const [songCount, playlistCount] = await Promise.all([
    prisma.song.count({ where: { uploaderId: safeUserId } }),
    prisma.playlist.count({ where: { ownerId: safeUserId } }),
  ]);

  return {
    songCount,
    playlistCount,
  };
}

module.exports = {
  prisma,
  DEFAULT_SITE_SETTINGS,
  DEFAULT_USER_PERMISSIONS,
  normalizePermissions,
  getUserByEmail,
  getUserByUsername,
  getUserById,
  getAllUsers,
  updateUserRole,
  deleteUserById,
  createUser,
  updateUserAccount,
  updateUserProfile,
  getSongById,
  getAllSongs,
  getAllVideos,
  getSongsByUploader,
  createSong,
  updateSongById,
  deleteSongById,
  createPlaylist,
  updatePlaylistById,
  deletePlaylistById,
  getUserPlaylists,
  getPlaylistById,
  getPlaylistSongs,
  getAllPlaylists,
  addSongToPlaylist,
  removeSongFromPlaylist,
  getUserStats,
  getSiteSettings,
  upsertSiteSettings,
  setSongVisibility,
  saveSongPersonalization,
};
