const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { createSong, getSongById, deleteSongById, updateSongById } = require('../database');
const { authCheck } = require('../middleware/auth-check');
const { analyzeAudioFile } = require('../lib/audio-metadata');
const { detectFileType } = require('../lib/file-type-compat');

const router = express.Router();
router.use(authCheck);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
});

const allowedMimeTypes = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/vnd.wave',
  'audio/ogg',
  'application/ogg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
]);

const allowedExtensions = new Set(['mp3', 'wav', 'ogg', 'm4a']);

async function getMimeAndExtension(file) {
  const browserMime = file && file.mimetype ? file.mimetype.toLowerCase() : null;

  if (browserMime && allowedMimeTypes.has(browserMime)) {
    const extFromName = path.extname(file.originalname || '').slice(1).toLowerCase();
    return { mimeType: browserMime, extension: allowedExtensions.has(extFromName) ? extFromName : 'wav' };
  }

  try {
    const mimeInfo = await detectFileType(file.buffer);

    const mimeType = mimeInfo && mimeInfo.mime ? mimeInfo.mime : browserMime;
    const extension = mimeInfo && mimeInfo.ext ? mimeInfo.ext : path.extname(file.originalname || '').slice(1).toLowerCase();

    return {
      mimeType,
      extension: extension ? extension.toLowerCase() : null,
    };
  } catch (error) {
    console.error('[UPLOAD/ANALYZE] Error al detectar MIME/extension:', error && error.stack ? error.stack : error);
    return {
      mimeType: browserMime,
      extension: path.extname(file.originalname || '').slice(1).toLowerCase() || null,
    };
  }
}

router.get('/upload', (req, res) => {
  res.render('upload', {
    error: null,
    successMessage: null,
    user: req.session.user,
    flash: req.session.flash || null,
  });
});

router.post('/upload/analyze', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'No se seleccionó ningún archivo de audio.' });
    }

    console.log('[UPLOAD/ANALYZE] Inicio del análisis:', {
      originalName: req.file.originalname,
      size: req.file.size,
      mimeHeader: req.file.mimetype,
      encoding: req.file.encoding,
      fileSizeMb: (req.file.size / (1024 * 1024)).toFixed(2),
    });

    if (req.file.size > 20 * 1024 * 1024) {
      return res.status(400).json({ ok: false, error: 'El archivo supera el tamaño máximo permitido (20 MB).' });
    }

    const { mimeType, extension } = await getMimeAndExtension(req.file);

    console.log('[UPLOAD/ANALYZE] MIME final:', mimeType, 'Extension final:', extension);

    if (!mimeType || !allowedMimeTypes.has(mimeType)) {
      return res.status(400).json({ ok: false, error: 'El archivo no es un audio válido. Usa MP3, WAV, OGG o M4A.' });
    }

    if (!extension || !allowedExtensions.has(extension)) {
      return res.status(400).json({ ok: false, error: 'Formato no permitido. Solo se admiten MP3, WAV, OGG y M4A.' });
    }

    const uploadDir = path.join(__dirname, '..', 'uploads');
    fs.mkdirSync(uploadDir, { recursive: true });

    const uniqueFilename = `${uuidv4()}.${extension}`;
    const filePath = path.join(uploadDir, uniqueFilename);

    const preview = await analyzeAudioFile(req.file.buffer, req.file.originalname, filePath, uploadDir);

    fs.writeFileSync(filePath, req.file.buffer);

    console.log('[UPLOAD/ANALYZE] Archivo guardado temporalmente en:', filePath);

    return res.json({
      ok: true,
      fileName: uniqueFilename,
      fileUrl: `/uploads/${uniqueFilename}`,
      preview,
    });
  } catch (error) {
    console.error('[UPLOAD/ANALYZE] ERROR real atrapado por el catch genérico:');
    console.error('Name:', error && error.name);
    console.error('Message:', error && error.message);
    console.error('Code:', error && error.code);
    console.error('Cause:', error && error.cause);
    console.error('Stack:', error && error.stack ? error.stack : error);
    return res.status(500).json({ ok: false, error: 'No se pudo analizar la canción. Inténtalo de nuevo.' });
  }
});

router.post('/upload/confirm-batch', async (req, res) => {
  try {
    const items = Array.isArray(req.body && req.body.items) ? req.body.items : [];
    if (!items.length) {
      return res.status(400).json({ ok: false, error: 'No hay canciones válidas para confirmar.' });
    }

    const uploaded = [];
    const failed = [];

    for (const item of items) {
      try {
        const fileName = (item.fileName || item.filename || '').trim();
        if (!fileName) {
          failed.push({ fileName: item.fileName || item.filename || 'Sin nombre', error: 'Falta el nombre del archivo.' });
          continue;
        }

        const normalizedFileName = path.basename(fileName);
        const filePath = path.join(__dirname, '..', 'uploads', normalizedFileName);
        if (!fs.existsSync(filePath)) {
          failed.push({ fileName: normalizedFileName, error: 'El archivo temporal ya no existe.' });
          continue;
        }

        const title = (item.title || '').trim() || 'Sin título';
        const artist = (item.artist || '').trim() || 'Artista desconocido';
        const metadataSource = item.metadataSource && typeof item.metadataSource === 'object' ? item.metadataSource : {};

        const song = await createSong({
          title,
          artist,
          filename: normalizedFileName,
          filepath: `/uploads/${normalizedFileName}`,
          uploader_id: req.session.user.id,
          duration: Number(item.duration || 0),
          album: item.album || '',
          year: item.year || null,
          genre: item.genre || '',
          coverPath: item.coverPath || null,
          trackNumber: item.trackNumber || null,
          metadataSource,
        });

        uploaded.push({ songId: song.id, fileName: normalizedFileName });
      } catch (error) {
        console.error('[UPLOAD/BATCH] Error guardando una canción del lote:', error);
        failed.push({ fileName: item.fileName || item.filename || 'Sin nombre', error: error.message || 'No se pudo guardar la canción.' });
      }
    }

    return res.json({
      ok: true,
      uploadedCount: uploaded.length,
      failedCount: failed.length,
      uploaded,
      failed,
      redirect: '/',
    });
  } catch (error) {
    console.error('[UPLOAD/BATCH] Error general del lote:', error);
    return res.status(500).json({ ok: false, error: 'No se pudo guardar el lote de canciones.' });
  }
});

router.post('/upload/confirm', async (req, res) => {
  try {
    const payload = req.body || {};
    const fileName = (payload.fileName || payload.filename || '').trim();
    const title = (payload.title || '').trim();
    const artist = (payload.artist || '').trim();

    if (!fileName) {
      return res.status(400).json({ ok: false, error: 'No hay un archivo válido para guardar.' });
    }

    const normalizedFileName = path.basename(fileName);
    const filePath = path.join(__dirname, '..', 'uploads', normalizedFileName);

    if (!fs.existsSync(filePath)) {
      return res.status(400).json({ ok: false, error: 'El archivo temporal ya no existe.' });
    }

    const titleValue = title || 'Sin título';
    const artistValue = artist || 'Artista desconocido';
    const metadataSource = payload.metadataSource && typeof payload.metadataSource === 'object' ? payload.metadataSource : {};

    const song = await createSong({
      title: titleValue,
      artist: artistValue,
      filename: normalizedFileName,
      filepath: `/uploads/${normalizedFileName}`,
      uploader_id: req.session.user.id,
      duration: Number(payload.duration || 0),
      album: payload.album || '',
      year: payload.year || null,
      genre: payload.genre || '',
      coverPath: payload.coverPath || null,
      trackNumber: payload.trackNumber || null,
      metadataSource,
    });

    return res.json({ ok: true, songId: song.id, redirect: '/' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: 'No se pudo guardar la canción. Inténtalo de nuevo.' });
  }
});

router.post('/:id/delete', async (req, res) => {
  try {
    const songId = Number(req.params.id);
    const song = await getSongById(songId);

    if (!song) {
      req.session.flash = { type: 'error', message: 'La canción no existe.' };
      return res.redirect('/');
    }

    if (song.uploaderId !== req.session.user.id) {
      req.session.flash = { type: 'error', message: 'No tienes permiso para eliminar esta canción.' };
      return res.redirect('/');
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
    req.session.flash = { type: 'success', message: 'Canción eliminada.' };
    return res.redirect('/');
  } catch (error) {
    console.error(error);
    req.session.flash = { type: 'error', message: 'No se pudo eliminar la canción.' };
    return res.redirect('/');
  }
});

router.post('/:id/edit', async (req, res) => {
  try {
    const songId = Number(req.params.id);
    const title = (req.body.title || '').trim();
    const artist = (req.body.artist || '').trim();

    const song = await getSongById(songId);
    if (!song) {
      req.session.flash = { type: 'error', message: 'La canción no existe.' };
      return res.redirect('/');
    }

    if (song.uploaderId !== req.session.user.id) {
      req.session.flash = { type: 'error', message: 'No tienes permiso para editar esta canción.' };
      return res.redirect('/');
    }

    if (!title || !artist) {
      req.session.flash = { type: 'error', message: 'El título y el artista son obligatorios.' };
      return res.redirect('/');
    }

    await updateSongById(songId, { title, artist });
    req.session.flash = { type: 'success', message: 'Cambios guardados correctamente.' };
    return res.redirect('/');
  } catch (error) {
    console.error(error);
    req.session.flash = { type: 'error', message: 'No se pudieron guardar los cambios.' };
    return res.redirect('/');
  }
});

module.exports = router;
