const express = require('express');
const {
  createPlaylist,
  getPlaylistById,
  getPlaylistSongs,
  getUserPlaylists,
  addSongToPlaylist,
  removeSongFromPlaylist,
  updatePlaylistById,
  deletePlaylistById,
  getAllSongs,
} = require('../database');
const { authCheck } = require('../middleware/auth-check');

const router = express.Router();

router.use(authCheck);

router.get('/', async (req, res) => {
  const playlists = await getUserPlaylists(req.session.user.id);

  res.render('playlists', {
    playlists,
    user: req.session.user,
    error: null,
    flash: req.session.flash || null,
  });
});

router.post('/create', async (req, res) => {
  const name = (req.body.name || '').trim();

  if (!name) {
    req.session.flash = { type: 'error', message: 'El nombre de la playlist no puede estar vacío.' };
    return res.redirect('/playlists');
  }

  await createPlaylist(name, req.session.user.id);
  req.session.flash = { type: 'success', message: 'Playlist creada correctamente.' };
  res.redirect('/playlists');
});

router.post('/add-song', async (req, res) => {
  const songId = Number(req.body.song_id);
  const playlistId = Number(req.body.playlist_id);

  if (!songId || !playlistId) {
    req.session.flash = { type: 'error', message: 'Selecciona una playlist válida.' };
    return res.redirect('/');
  }

  const playlist = await getPlaylistById(playlistId, req.session.user.id);

  if (!playlist) {
    req.session.flash = { type: 'error', message: 'No tienes acceso a esa playlist.' };
    return res.redirect('/');
  }

  const added = await addSongToPlaylist(playlistId, songId);

  if (!added) {
    req.session.flash = { type: 'error', message: 'La canción ya está en esta playlist.' };
    return res.redirect('/');
  }

  req.session.flash = { type: 'success', message: 'Canción agregada a la playlist.' };
  res.redirect('/playlists');
});

router.post('/:id/rename', async (req, res) => {
  const playlistId = Number(req.params.id);
  const playlist = await getPlaylistById(playlistId, req.session.user.id);

  if (!playlist) {
    req.session.flash = { type: 'error', message: 'Playlist no encontrada.' };
    return res.redirect('/playlists');
  }

  const name = (req.body.name || '').trim();

  if (!name) {
    req.session.flash = { type: 'error', message: 'El nombre de la playlist no puede estar vacío.' };
    return res.redirect(`/playlists/${playlistId}`);
  }

  await updatePlaylistById(playlistId, name);
  req.session.flash = { type: 'success', message: 'Playlist renombrada.' };
  res.redirect('/playlists');
});

router.post('/:id/delete', async (req, res) => {
  const playlistId = Number(req.params.id);
  const playlist = await getPlaylistById(playlistId, req.session.user.id);

  if (!playlist) {
    req.session.flash = { type: 'error', message: 'Playlist no encontrada.' };
    return res.redirect('/playlists');
  }

  await deletePlaylistById(playlistId);
  req.session.flash = { type: 'success', message: 'Playlist eliminada.' };
  res.redirect('/playlists');
});

router.get('/:id/addable', async (req, res) => {
  const playlistId = Number(req.params.id);
  const playlist = await getPlaylistById(playlistId, req.session.user.id);

  if (!playlist) {
    return res.status(404).json({ ok: false, error: 'Playlist no encontrada.' });
  }

  const playlistsSongs = await getPlaylistSongs(playlistId);
  const inPlaylist = new Set(playlistsSongs.map((song) => song.id));
  const songs = await getAllSongs();

  res.json({
    ok: true,
    songs: songs.map((song) => ({
      id: song.id,
      title: song.title,
      artist: song.artist,
      coverPath: song.coverPath || null,
      duration: song.duration,
      alreadyAdded: inPlaylist.has(song.id),
    })),
  });
});

router.post('/:id/add-song-async', async (req, res) => {
  const playlistId = Number(req.params.id);
  const playlist = await getPlaylistById(playlistId, req.session.user.id);

  if (!playlist) {
    return res.status(404).json({ ok: false, error: 'Playlist no encontrada.' });
  }

  const songId = Number(req.body.song_id);
  if (!songId) {
    return res.status(400).json({ ok: false, error: 'Debes elegir una canción.' });
  }

  const added = await addSongToPlaylist(playlistId, songId);

  return res.json({ ok: true, added, alreadyAdded: !added, songId });
});

router.get('/:id', async (req, res) => {
  const playlistId = Number(req.params.id);
  const playlist = await getPlaylistById(playlistId, req.session.user.id);

  if (!playlist) {
    return res.status(404).render('error', {
      message: 'Playlist no encontrada.',
      user: req.session.user,
      flash: req.session.flash || null,
    });
  }

  const playlistSongs = await getPlaylistSongs(playlistId);

  res.render('playlist-detail', {
    playlist,
    songs: playlistSongs,
    user: req.session.user,
    flash: req.session.flash || null,
  });
});

router.post('/:id/remove-song/:songId', async (req, res) => {
  const playlistId = Number(req.params.id);
  const songId = Number(req.params.songId);

  const playlist = await getPlaylistById(playlistId, req.session.user.id);
  if (!playlist) {
    req.session.flash = { type: 'error', message: 'Playlist no encontrada.' };
    return res.redirect('/playlists');
  }

  await removeSongFromPlaylist(playlistId, songId);
  req.session.flash = { type: 'success', message: 'Canción quitada de esta playlist.' };
  res.redirect(`/playlists/${playlistId}`);
});

module.exports = router;
