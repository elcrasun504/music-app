const fs = require('fs');
const path = require('path');
const mm = require('music-metadata');
const { v4: uuidv4 } = require('uuid');

function sanitizeText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value)
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeFilenameValue(value) {
  return sanitizeText(value)
    .replace(/\.[^/.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function parseYear(value) {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    return parseYear(value[0]);
  }

  const match = String(value).match(/(\d{4})/);
  return match ? Number(match[1]) : null;
}

function parseTrackNumber(value) {
  if (!value) {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isNaN(value) ? null : value;
  }

  const match = String(value).match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function guessFromFilename(filename) {
  const baseName = path.basename(filename, path.extname(filename));
  const cleaned = normalizeFilenameValue(baseName);

  if (!cleaned) {
    return { title: '', artist: '' };
  }

  const separators = [' - ', ' – ', ' — ', ' | '];
  for (const separator of separators) {
    if (cleaned.includes(separator)) {
      const parts = cleaned.split(separator).map((part) => sanitizeText(part)).filter(Boolean);
      if (parts.length >= 2) {
        const maybeArtist = parts[0];
        const maybeTitle = parts[1];
        if (maybeTitle.length >= 2) {
          return {
            title: maybeTitle,
            artist: maybeArtist,
          };
        }
      }
    }
  }

  return {
    title: cleaned,
    artist: '',
  };
}

async function safeFetchJson(url, headers = {}, timeoutMs = 2500) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'music-app/1.0 (+https://localhost)',
        ...headers,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function saveAssetFromBuffer(buffer, uploadDir, folderName = 'covers', extension = 'jpg') {
  const targetDir = path.join(uploadDir, folderName);
  fs.mkdirSync(targetDir, { recursive: true });

  const fileName = `${uuidv4()}.${extension}`;
  const filePath = path.join(targetDir, fileName);
  fs.writeFileSync(filePath, buffer);

  return `/uploads/${folderName}/${fileName}`;
}

function saveEmbeddedCover(picture, uploadDir) {
  if (!picture || !picture.data) {
    return null;
  }

  const mimeType = picture.format || 'image/jpeg';
  const extension = mimeType.includes('png') ? 'png' : 'jpg';
  const buffer = Buffer.isBuffer(picture.data) ? picture.data : Buffer.from(picture.data);

  return saveAssetFromBuffer(buffer, uploadDir, 'covers', extension);
}

async function searchItunes(term) {
  if (!term) {
    return null;
  }

  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=5`;

  try {
    const data = await safeFetchJson(url);
    const result = data.results && data.results[0];

    if (!result) {
      return null;
    }

    return {
      title: sanitizeText(result.trackName || result.collectionName || ''),
      artist: sanitizeText(result.artistName || ''),
      album: sanitizeText(result.collectionName || ''),
      year: parseYear(result.releaseDate || result.collectionReleaseDate),
      genre: sanitizeText(result.primaryGenreName || ''),
      coverPath: result.artworkUrl100 ? await downloadRemoteImage(result.artworkUrl100.replace('100x100', '600x600'), 'covers') : null,
    };
  } catch (error) {
    console.error('[AUDIO METADATA] Error en búsqueda a iTunes:', {
      term,
      url,
      name: error && error.name,
      message: error && error.message,
      stack: error && error.stack ? error.stack : error,
    });
    return null;
  }
}

async function downloadRemoteImage(imageUrl, folderName = 'covers') {
  if (!imageUrl) {
    return null;
  }

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const extension = imageUrl.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
    return saveAssetFromBuffer(buffer, path.join(process.cwd(), 'uploads'), folderName, extension);
  } catch (error) {
    return null;
  }
}

async function searchMusicBrainz(term) {
  if (!term) {
    return null;
  }

  try {
    const url = `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(term)}&limit=1&fmt=json`;
    const data = await safeFetchJson(url, {
      'User-Agent': 'MusicApp/1.0 (joseguerra.dev@gmail.com)',
      'Accept': 'application/json',
    });

    const recording = data.recordings && data.recordings[0];
    if (!recording) {
      return null;
    }

    const artist = recording['artist-credit'] && recording['artist-credit'][0] ? recording['artist-credit'][0].artist.name : '';
    const releases = recording.releases || [];
    const album = releases[0] ? releases[0].title : '';
    const year = parseYear(releases[0] && releases[0].date ? releases[0].date : '');

    return {
      title: sanitizeText(recording.title || ''),
      artist: sanitizeText(artist),
      album: sanitizeText(album),
      year,
      genre: '',
      coverPath: null,
    };
  } catch (error) {
    console.error('[AUDIO METADATA] Error en búsqueda a MusicBrainz:', {
      term,
      name: error && error.name,
      message: error && error.message,
      stack: error && error.stack ? error.stack : error,
    });
    return null;
  }
}

async function analyzeAudioFile(fileBuffer, originalName, filePath, uploadDir) {
  const mimeType = filePath ? undefined : undefined;

  let metadata;
  try {
    metadata = await mm.parseBuffer(fileBuffer, { mimeType });
  } catch (error) {
    console.error('[AUDIO METADATA] Error en mm.parseBuffer:', {
      originalName,
      filePath,
      fileBufferLength: fileBuffer ? fileBuffer.length : 0,
      name: error && error.name,
      message: error && error.message,
      stack: error && error.stack ? error.stack : error,
    });
    throw Object.assign(new Error('No se pudo leer la metadata del archivo de audio.'), {
      code: 'FILE_ANALYSIS_FAILED',
      cause: error,
    });
  }

  const common = metadata.common || {};
  const format = metadata.format || {};

  const guessed = guessFromFilename(originalName);
  const defaultResult = {
    title: sanitizeText(common.title || guessed.title || ''),
    artist: sanitizeText(Array.isArray(common.artist) ? common.artist[0] : common.artist || guessed.artist || ''),
    album: sanitizeText(common.album || ''),
    year: parseYear(common.year),
    genre: sanitizeText(Array.isArray(common.genre) ? common.genre[0] : common.genre || ''),
    trackNumber: parseTrackNumber(common.track && common.track.no),
    duration: Number.isFinite(format.duration) ? Math.round(format.duration) : 0,
    coverPath: null,
    metadataSource: {},
  };

  if (common.picture && common.picture.length > 0) {
    defaultResult.coverPath = saveEmbeddedCover(common.picture[0], uploadDir);
    defaultResult.metadataSource.coverPath = 'file';
  }

  for (const [key, value] of Object.entries({
    title: defaultResult.title,
    artist: defaultResult.artist,
    album: defaultResult.album,
    year: defaultResult.year,
    genre: defaultResult.genre,
    trackNumber: defaultResult.trackNumber,
  })) {
    if (value) {
      defaultResult.metadataSource[key] = 'file';
    }
  }

  if (!defaultResult.title && guessed.title) {
    defaultResult.title = guessed.title;
    defaultResult.metadataSource.title = 'filename';
  }

  if (!defaultResult.artist && guessed.artist) {
    defaultResult.artist = guessed.artist;
    defaultResult.metadataSource.artist = 'filename';
  }

  const searchTerm = [defaultResult.artist, defaultResult.title].filter(Boolean).join(' ');
  let externalMatch = null;

  if (searchTerm) {
    try {
      const [itunesResult, musicBrainzResult] = await Promise.allSettled([
        searchItunes(searchTerm),
        searchMusicBrainz(searchTerm),
      ]);

      const firstSuccessful = [itunesResult, musicBrainzResult]
        .map((result) => result.status === 'fulfilled' ? result.value : null)
        .find(Boolean);

      externalMatch = firstSuccessful || null;
    } catch (error) {
      console.error('[AUDIO METADATA] Búsquedas externas crash:', {
        searchTerm,
        name: error && error.name,
        message: error && error.message,
        stack: error && error.stack ? error.stack : error,
      });
    }
  }

  if (externalMatch) {
    if (!defaultResult.title && externalMatch.title) {
      defaultResult.title = externalMatch.title;
      defaultResult.metadataSource.title = 'internet';
    }
    if (!defaultResult.artist && externalMatch.artist) {
      defaultResult.artist = externalMatch.artist;
      defaultResult.metadataSource.artist = 'internet';
    }
    if (!defaultResult.album && externalMatch.album) {
      defaultResult.album = externalMatch.album;
      defaultResult.metadataSource.album = 'internet';
    }
    if (!defaultResult.year && externalMatch.year) {
      defaultResult.year = externalMatch.year;
      defaultResult.metadataSource.year = 'internet';
    }
    if (!defaultResult.genre && externalMatch.genre) {
      defaultResult.genre = externalMatch.genre;
      defaultResult.metadataSource.genre = 'internet';
    }
    if (!defaultResult.coverPath && externalMatch.coverPath) {
      defaultResult.coverPath = externalMatch.coverPath;
      defaultResult.metadataSource.coverPath = 'internet';
    }
  }

  if (!defaultResult.album && defaultResult.title && defaultResult.artist) {
    try {
      const fallback = await searchMusicBrainz(`${defaultResult.artist} ${defaultResult.title}`);
      if (fallback) {
        defaultResult.album = defaultResult.album || fallback.album;
        defaultResult.year = defaultResult.year || fallback.year;
        defaultResult.genre = defaultResult.genre || fallback.genre;
        defaultResult.coverPath = defaultResult.coverPath || fallback.coverPath;
        if (!defaultResult.metadataSource.album) defaultResult.metadataSource.album = fallback.album ? 'internet' : defaultResult.metadataSource.album;
        if (!defaultResult.metadataSource.year) defaultResult.metadataSource.year = fallback.year ? 'internet' : defaultResult.metadataSource.year;
        if (!defaultResult.metadataSource.genre) defaultResult.metadataSource.genre = fallback.genre ? 'internet' : defaultResult.metadataSource.genre;
        if (!defaultResult.metadataSource.coverPath) defaultResult.metadataSource.coverPath = fallback.coverPath ? 'internet' : defaultResult.metadataSource.coverPath;
      }
    } catch (error) {
      console.error('[AUDIO METADATA] Fallback MusicBrainz crash:', {
        artist: defaultResult.artist,
        title: defaultResult.title,
        name: error && error.name,
        message: error && error.message,
        stack: error && error.stack ? error.stack : error,
      });
    }
  }

  if (!defaultResult.coverPath && common.picture && common.picture.length > 0) {
    defaultResult.coverPath = saveEmbeddedCover(common.picture[0], uploadDir);
  }

  defaultResult.metadataSource = Object.keys(defaultResult.metadataSource).length > 0 ? defaultResult.metadataSource : {};

  return defaultResult;
}

module.exports = {
  analyzeAudioFile,
  guessFromFilename,
};
