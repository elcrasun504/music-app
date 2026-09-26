document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('confirm-modal');
  const modalTitle = document.getElementById('confirm-modal-title');
  const modalMessage = document.getElementById('confirm-modal-message');
  const modalConfirm = document.getElementById('confirm-modal-confirm');
  const modalCancel = document.getElementById('confirm-modal-cancel');

  let pendingForm = null;

  document.querySelectorAll('[data-confirm-form]').forEach((button) => {
    button.addEventListener('click', () => {
      pendingForm = document.getElementById(button.dataset.confirmForm);
      modalTitle.textContent = button.dataset.confirmTitle || 'Confirmación';
      modalMessage.textContent = button.dataset.confirmMessage || '¿Estás seguro?';
      modal.classList.add('open');
    });
  });

  if (modalCancel) {
    modalCancel.addEventListener('click', () => {
      modal.classList.remove('open');
      pendingForm = null;
    });
  }

  if (modalConfirm) {
    modalConfirm.addEventListener('click', () => {
      if (pendingForm) {
        pendingForm.submit();
      }
      modal.classList.remove('open');
    });
  }

  if (modal) {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        modal.classList.remove('open');
        pendingForm = null;
      }
    });
  }

  const searchInput = document.getElementById('library-search');
  if (searchInput) {
    const cards = document.querySelectorAll('.song-card');

    searchInput.addEventListener('input', () => {
      const query = searchInput.value.trim().toLowerCase();

      cards.forEach((card) => {
        const text = card.dataset.search || card.textContent || '';
        const matches = !query || text.toLowerCase().includes(query);
        card.style.display = matches ? '' : 'none';
      });
    });
  }

  document.querySelectorAll('[data-toggle-edit]').forEach((button) => {
    button.addEventListener('click', () => {
      const targetId = button.dataset.toggleEdit;
      const form = document.querySelector(`[data-edit-form="${targetId}"]`);
      if (!form) return;
      form.classList.toggle('hidden');
    });
  });

  const playlistMediaContainer = document.getElementById('playlist-media-container');
  const playlistTracks = Array.from(document.querySelectorAll('[data-track-src]'));

  if (playlistMediaContainer && playlistTracks.length) {
    let currentIndex = 0;
    let playlistMedia = null;

    const createPlaylistMedia = (track) => {
      const mediaType = track.dataset.trackType === 'video' ? 'video' : 'audio';
      const element = document.createElement(mediaType);
      element.controls = true;
      element.preload = document.body.dataset.mediaPreload || 'metadata';
      element.playsInline = true;
      element.className = mediaType === 'video' ? 'playlist-video' : 'playlist-audio';
      playlistMediaContainer.replaceChildren(element);
      playlistMedia = element;
      playlistMedia.addEventListener('ended', () => setTrack(currentIndex + 1));
      return element;
    };

    const setTrack = (index) => {
      currentIndex = (index + playlistTracks.length) % playlistTracks.length;
      const selected = playlistTracks[currentIndex];

      const media = createPlaylistMedia(selected);
      media.src = selected.dataset.trackSrc;
      media.load();
      media.play().catch(() => undefined);

      playlistTracks.forEach((track, i) => {
        track.classList.toggle('active', i === currentIndex);
      });
    };

    playlistTracks.forEach((track, index) => {
      track.addEventListener('click', () => setTrack(index));
      const playButton = track.querySelector('[data-play-track]');
      if (playButton) {
        playButton.addEventListener('click', () => setTrack(index));
      }
    });

    const firstTrack = playlistTracks[0];
    if (firstTrack) {
      firstTrack.classList.add('active');
      createPlaylistMedia(firstTrack);
    }
  }

  const globalAudio = document.getElementById('global-audio');
  const globalPlayer = document.getElementById('global-player');
  const globalPlayerCover = document.getElementById('global-player-cover');
  const globalPlayerTitle = document.getElementById('global-player-title');
  const globalPlayerArtist = document.getElementById('global-player-artist');
  const globalPlayerCurrent = document.getElementById('global-player-current');
  const globalPlayerTotal = document.getElementById('global-player-total');
  const globalPlayerProgressBar = document.getElementById('global-player-progress-bar');
  const globalPlayerToggle = document.getElementById('global-player-toggle');
  const globalPlayerProgress = document.getElementById('global-player-progress');
  const globalPlayerPrevious = document.getElementById('global-player-previous');
  const globalPlayerNext = document.getElementById('global-player-next');
  const globalPlayerCollapse = document.getElementById('global-player-collapse');
  const globalPlayerMute = document.getElementById('global-player-mute');
  const globalPlayerVolume = document.getElementById('global-player-volume');
  const globalPlayerAutoplay = document.getElementById('global-player-autoplay');

  const PLAYER_STORAGE_KEY = 'cholumusica:player-state';
  const PLAYER_AUTOPLAY_KEY = 'cholumusica:autoplay';

  function readAutoplayPreference() {
    try {
      const stored = window.localStorage.getItem(PLAYER_AUTOPLAY_KEY);
      return stored === null ? true : stored === 'true';
    } catch (error) {
      return true;
    }
  }

  function writeAutoplayPreference(value) {
    try {
      window.localStorage.setItem(PLAYER_AUTOPLAY_KEY, String(value));
    } catch (error) {
      // Almacenamiento no disponible: se mantiene la preferencia en memoria.
    }
  }

  function readPlayerState() {
    try {
      const raw = window.localStorage.getItem(PLAYER_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed.src === 'string' && parsed.src ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  function writePlayerState(state) {
    try {
      if (!state) {
        window.localStorage.removeItem(PLAYER_STORAGE_KEY);
        return;
      }
      window.localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      // Almacenamiento no disponible (modo privado, cuota excedida, etc.): se ignora.
    }
  }

  function formatClock(value) {
    const seconds = Number.isFinite(value) ? Math.max(0, value) : 0;
    const minutes = Math.floor(seconds / 60);
    const remaining = Math.floor(seconds % 60);
    return `${minutes}:${String(remaining).padStart(2, '0')}`;
  }

  let activeSong = null;
  let autoplayEnabled = readAutoplayPreference();

  function persistPlayerState() {
    if (!globalAudio || !activeSong || !activeSong.src) {
      writePlayerState(null);
      return;
    }

    writePlayerState({
      src: activeSong.src,
      title: activeSong.title,
      artist: activeSong.artist,
      cover: activeSong.cover,
      duration: activeSong.duration,
      currentTime: globalAudio.currentTime || 0,
      isPlaying: !globalAudio.paused,
    });
  }

  function updateGlobalPlayerUI() {
    if (!globalPlayer) return;

    const hasSong = Boolean(activeSong && activeSong.src);
    globalPlayer.classList.toggle('is-empty', !hasSong);
    globalPlayer.style.display = hasSong ? '' : 'none';
    document.body.classList.toggle('has-global-player', hasSong);
    document.body.classList.toggle('has-global-player', hasSong);

    if (!hasSong) {
if (globalPlayerTitle) globalPlayerTitle.textContent = 'Selecciona una canción';
    if (globalPlayerArtist) globalPlayerArtist.textContent = 'Cholumusica';
    if (globalPlayerCover) globalPlayerCover.src = '/public/images/placeholder-cover.svg';
    if (globalPlayerCurrent) globalPlayerCurrent.textContent = '0:00';
    if (globalPlayerTotal) globalPlayerTotal.textContent = '0:00';
    if (globalPlayerProgressBar) globalPlayerProgressBar.style.width = '0%';
    if (globalPlayerToggle) {
      globalPlayerToggle.textContent = '▶️';
      globalPlayerToggle.setAttribute('aria-label', 'Reproducir');
      globalPlayerToggle.title = 'Reproducir';
    }
    return;
    }

    const { title, artist, cover, duration } = activeSong;
    if (globalPlayerTitle) globalPlayerTitle.textContent = title || 'Sin título';
    if (globalPlayerArtist) globalPlayerArtist.textContent = artist || 'Artista desconocido';
    if (globalPlayerCover) globalPlayerCover.src = cover || '/public/images/placeholder-cover.svg';
    if (globalPlayerTotal) globalPlayerTotal.textContent = formatClock(duration || (globalAudio && globalAudio.duration) || 0);

    if (globalAudio && !Number.isNaN(globalAudio.duration) && globalPlayerProgressBar) {
      const progress = globalAudio.duration ? (globalAudio.currentTime / globalAudio.duration) * 100 : 0;
      globalPlayerProgressBar.style.width = `${Math.min(progress, 100)}%`;
    }

    if (globalPlayerToggle) {
      globalPlayerToggle.textContent = globalAudio && !globalAudio.paused ? '⏸️' : '▶️';
      globalPlayerToggle.setAttribute('aria-label', globalAudio && !globalAudio.paused ? 'Pausar' : 'Reproducir');
      globalPlayerToggle.title = globalAudio && !globalAudio.paused ? 'Pausar' : 'Reproducir';
    }
    if (globalPlayerProgress) {
      const progress = globalAudio && globalAudio.duration ? (globalAudio.currentTime / globalAudio.duration) * 100 : 0;
      globalPlayerProgress.setAttribute('aria-valuenow', String(Math.round(progress)));
    }
    if (globalPlayerAutoplay) {
      globalPlayerAutoplay.classList.toggle('is-active', autoplayEnabled);
      globalPlayerAutoplay.setAttribute('aria-pressed', String(autoplayEnabled));
      globalPlayerAutoplay.setAttribute('aria-label', `Reproducción automática ${autoplayEnabled ? 'activada' : 'desactivada'}`);
      globalPlayerAutoplay.title = `Reproducción automática ${autoplayEnabled ? 'activada' : 'desactivada'}`;
      globalPlayerAutoplay.textContent = '🔁';
    }
  }

  if (globalAudio) {
    let lastPersistedAt = 0;

    globalAudio.addEventListener('timeupdate', () => {
      if (globalPlayerCurrent) globalPlayerCurrent.textContent = formatClock(globalAudio.currentTime);
      if (globalPlayerTotal) globalPlayerTotal.textContent = formatClock(globalAudio.duration || activeSong?.duration || 0);
      if (globalPlayerProgressBar) {
        const progress = globalAudio.duration ? (globalAudio.currentTime / globalAudio.duration) * 100 : 0;
        globalPlayerProgressBar.style.width = `${Math.min(progress, 100)}%`;
      }

      const now = Date.now();
      if (now - lastPersistedAt > 3000) {
        lastPersistedAt = now;
        persistPlayerState();
      }
    });

    globalAudio.addEventListener('loadedmetadata', updateGlobalPlayerUI);
    globalAudio.addEventListener('play', () => {
      updateGlobalPlayerUI();
      persistPlayerState();
    });
    globalAudio.addEventListener('pause', () => {
      updateGlobalPlayerUI();
      persistPlayerState();
    });
    globalAudio.addEventListener('ended', () => {
      if (!autoplayEnabled) {
        updateGlobalPlayerUI();
        persistPlayerState();
        return;
      }

      const songCards = Array.from(document.querySelectorAll('.song-card[data-song-src]'));
      const currentIndex = songCards.findIndex((card) => card.dataset.songSrc === activeSong?.src);
      if (currentIndex >= 0 && currentIndex < songCards.length - 1) {
        playCard(songCards[currentIndex + 1]);
      } else {
        updateGlobalPlayerUI();
        writePlayerState(null);
      }
    });

    window.addEventListener('pagehide', persistPlayerState);
    window.addEventListener('beforeunload', persistPlayerState);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') persistPlayerState();
    });
  }

  if (globalPlayerToggle && globalAudio) {
    globalPlayerToggle.addEventListener('click', () => {
      if (!activeSong || !activeSong.src) return;
      if (globalAudio.paused) {
        globalAudio.play();
      } else {
        globalAudio.pause();
      }
      updateGlobalPlayerUI();
    });
  }

  if (globalPlayerCollapse && globalPlayer) {
    globalPlayerCollapse.addEventListener('click', () => {
      const expanded = globalPlayerCollapse.getAttribute('aria-expanded') !== 'false';
      globalPlayer.classList.toggle('is-collapsed', expanded);
      document.body.classList.toggle('is-player-collapsed', expanded);
      document.body.classList.toggle('is-player-collapsed', expanded);
      globalPlayerCollapse.setAttribute('aria-expanded', String(!expanded));
      globalPlayerCollapse.setAttribute('aria-label', expanded ? 'Mostrar controles' : 'Ocultar controles');
      globalPlayerCollapse.title = expanded ? 'Mostrar controles' : 'Ocultar controles';
      globalPlayerCollapse.textContent = expanded ? '⬇️' : '⬆️';
    });
  }

  if (globalPlayerProgress && globalAudio) {
    const seekToPosition = (clientX) => {
      if (!globalAudio.duration || !Number.isFinite(globalAudio.duration)) return;
      const rect = globalPlayerProgress.getBoundingClientRect();
      const ratio = (clientX - rect.left) / rect.width;
      globalAudio.currentTime = Math.min(Math.max(ratio, 0), 1) * globalAudio.duration;
      persistPlayerState();
      updateGlobalPlayerUI();
    };

    globalPlayerProgress.addEventListener('click', (event) => seekToPosition(event.clientX));
    globalPlayerProgress.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const offset = event.key === 'ArrowRight' ? 5 : -5;
      globalAudio.currentTime = Math.min(Math.max(globalAudio.currentTime + offset, 0), globalAudio.duration || 0);
      updateGlobalPlayerUI();
      persistPlayerState();
    });
  }

  const songCards = Array.from(document.querySelectorAll('.song-card[data-song-src]'));

  function playCard(card) {
    if (!card || !globalAudio) return;

    activeSong = {
      src: card.dataset.songSrc || '',
      title: card.dataset.songTitle || 'Sin título',
      artist: card.dataset.songArtist || 'Artista desconocido',
      cover: card.dataset.songCover || '/public/images/placeholder-cover.svg',
      duration: Number(card.dataset.songDuration || 0) || 0,
    };
    globalAudio.src = activeSong.src;
    globalAudio.load();
    globalAudio.play().catch(() => updateGlobalPlayerUI());
    updateGlobalPlayerUI();
    persistPlayerState();
  }

  document.querySelectorAll('[data-play-song]').forEach((button) => {
    button.addEventListener('click', () => {
      const card = button.closest('.song-card');
      if (!card) return;
      if (activeSong && activeSong.src === card.dataset.songSrc && globalAudio && !globalAudio.paused) {
        globalAudio.pause();
      } else {
        playCard(card);
      }
    });
  });

  if (globalPlayerPrevious) {
    globalPlayerPrevious.addEventListener('click', () => {
      const currentIndex = songCards.findIndex((card) => card.dataset.songSrc === activeSong?.src);
      if (currentIndex > 0) playCard(songCards[currentIndex - 1]);
    });
  }

  if (globalPlayerNext) {
    globalPlayerNext.addEventListener('click', () => {
      const currentIndex = songCards.findIndex((card) => card.dataset.songSrc === activeSong?.src);
      if (currentIndex >= 0 && currentIndex < songCards.length - 1) playCard(songCards[currentIndex + 1]);
    });
  }

  if (globalPlayerVolume && globalAudio) {
    globalPlayerVolume.addEventListener('input', () => {
      globalAudio.volume = Number(globalPlayerVolume.value);
      globalAudio.muted = globalAudio.volume === 0;
      if (globalPlayerMute) {
        globalPlayerMute.textContent = globalAudio.muted ? '🔇' : '🔊';
        globalPlayerMute.setAttribute('aria-label', globalAudio.muted ? 'Activar sonido' : 'Silenciar');
        globalPlayerMute.title = globalAudio.muted ? 'Activar sonido' : 'Silenciar';
      }
    });
  }

  if (globalPlayerMute && globalAudio) {
    globalPlayerMute.addEventListener('click', () => {
      globalAudio.muted = !globalAudio.muted;
      globalPlayerMute.textContent = globalAudio.muted ? '🔇' : '🔊';
      globalPlayerMute.setAttribute('aria-label', globalAudio.muted ? 'Activar sonido' : 'Silenciar');
      globalPlayerMute.title = globalAudio.muted ? 'Activar sonido' : 'Silenciar';
    });
  }

  if (globalPlayerAutoplay) {
    globalPlayerAutoplay.addEventListener('click', () => {
      autoplayEnabled = !autoplayEnabled;
      writeAutoplayPreference(autoplayEnabled);
      updateGlobalPlayerUI();
    });
  }

  if (globalAudio) {
    const savedState = readPlayerState();

    if (savedState) {
      activeSong = {
        src: savedState.src,
        title: savedState.title,
        artist: savedState.artist,
        cover: savedState.cover,
        duration: savedState.duration,
      };

      globalAudio.src = savedState.src;
      globalAudio.load();

      globalAudio.addEventListener(
        'loadedmetadata',
        () => {
          globalAudio.currentTime = Number(savedState.currentTime) || 0;
          updateGlobalPlayerUI();

          if (savedState.isPlaying) {
            globalAudio.play().catch(() => {
              // El navegador bloqueó la reproducción automática; el usuario puede
              // retomarla manualmente con el botón de play.
              updateGlobalPlayerUI();
            });
          }
        },
        { once: true }
      );

      updateGlobalPlayerUI();
    } else {
      updateGlobalPlayerUI();
    }
  }

  const uploadForm = document.getElementById('upload-form');
  const fileInput = document.getElementById('audio-file-input');
  const dropZone = document.getElementById('file-dropzone');
  const uploadStatus = document.getElementById('upload-status');
  const uploadPreview = document.getElementById('upload-preview');
  const coverPreview = document.getElementById('cover-preview');
  const metaTitle = document.getElementById('meta-title');
  const metaArtist = document.getElementById('meta-artist');
  const metaAlbum = document.getElementById('meta-album');
  const metaYear = document.getElementById('meta-year');
  const metaGenre = document.getElementById('meta-genre');
  const metaDuration = document.getElementById('meta-duration');
  const confirmUploadButton = document.getElementById('confirm-upload-button');
  const resetUploadButton = document.getElementById('reset-upload-button');

  const MAX_BATCH_FILES = 20;
  let draftUpload = null;
  let batchQueue = [];
  let batchPreviewItems = [];
  let batchIsBusy = false;

  const batchQueuePanel = document.getElementById('batch-queue-panel');
  const batchFileList = document.getElementById('batch-file-list');
  const batchProgressText = document.getElementById('batch-progress-text');
  const batchProgressBar = document.getElementById('batch-progress-bar');
  const batchPreviewPanel = document.getElementById('batch-preview-panel');
  const batchPreviewList = document.getElementById('batch-preview-list');
  const batchFailedList = document.getElementById('batch-failed-list');
  const startBatchButton = document.getElementById('start-batch-button');
  const clearBatchButton = document.getElementById('clear-batch-button');
  const confirmBatchButton = document.getElementById('confirm-batch-button');
  const resetBatchButton = document.getElementById('reset-batch-button');

  function triggerConfetti() {
    const container = document.body.appendChild(document.createElement('div'));
    container.className = 'main-confetti';
    for (let index = 0; index < 40; index += 1) {
      const piece = document.createElement('span');
      piece.className = 'confetti-piece';
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = ['#8b5cf6', '#22d3ee', '#f472b6', '#fbbf24', '#34d399'][index % 5];
      piece.style.animationDuration = `${2 + Math.random() * 2.7}s`;
      piece.style.transform = `rotate(${Math.random() * 360}deg)`;
      container.appendChild(piece);
    }
    setTimeout(() => container.remove(), 2400);
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function setUploadStatus(message, type = 'info') {
    if (!uploadStatus) return;
    uploadStatus.textContent = message;
    uploadStatus.className = `notice ${type}`;
    uploadStatus.classList.remove('hidden');
  }

  function resetUploadState() {
    if (fileInput) fileInput.value = '';
    if (uploadPreview) uploadPreview.classList.add('hidden');
    batchQueue = [];
    batchPreviewItems = [];
    batchIsBusy = false;
    if (batchQueuePanel) batchQueuePanel.classList.add('hidden');
    if (batchPreviewPanel) batchPreviewPanel.classList.add('hidden');
    if (batchFileList) batchFileList.innerHTML = '';
    if (batchPreviewList) batchPreviewList.innerHTML = '';
    if (batchFailedList) batchFailedList.innerHTML = '';
    draftUpload = null;
    if (startBatchButton) startBatchButton.classList.add('hidden');
    if (uploadStatus) {
      uploadStatus.textContent = 'Selecciona un archivo para empezar.';
      uploadStatus.className = 'notice info';
      uploadStatus.classList.remove('hidden');
    }
  }

  function formatDuration(seconds) {
    const total = Number(seconds || 0);
    if (!total || Number.isNaN(total)) return '0:00';
    const minutes = Math.floor(total / 60);
    const remaining = total % 60;
    return `${minutes}:${String(remaining).padStart(2, '0')}`;
  }

  function getMediaFiles(fileList) {
    if (!fileList) return [];
    return Array.from(fileList).filter((file) => {
      const isAudio = file && file.type && file.type.startsWith('audio/');
      const isVideo = file && file.type === 'video/mp4';
      const extension = /\.(mp3|wav|ogg|m4a|mp4)$/i.test(file.name || '');
      return isAudio || isVideo || extension;
    });
  }

  function renderBatchQueue() {
    if (!batchQueuePanel || !batchFileList || !batchProgressText || !batchProgressBar) return;

    if (!batchQueue.length) {
      batchQueuePanel.classList.add('hidden');
      batchFileList.innerHTML = '';
      batchProgressText.textContent = '0 de 0 canciones procesadas';
      batchProgressBar.style.width = '0%';
      return;
    }

    batchQueuePanel.classList.remove('hidden');
    const processed = batchQueue.filter((item) => item.status === 'ready' || item.status === 'error').length;
    const total = batchQueue.length;
    const percentage = total ? Math.round((processed / total) * 100) : 0;
    batchProgressText.textContent = `${processed} de ${total} canciones procesadas`;
    batchProgressBar.style.width = `${percentage}%`;

    batchFileList.innerHTML = batchQueue.map((item) => {
      const preview = item.preview || {};
      const thumb = preview.coverPath ? `<img src="${preview.coverPath}" alt="Carátula" />` : '<span>♫</span>';
      const statusText = {
        waiting: 'En espera',
        analyzing: 'Analizando metadatos...',
        ready: 'Listo',
        error: 'Error',
      }[item.status] || 'En espera';

      return `
        <div class="batch-file-card ${item.status === 'error' ? 'error' : ''}">
          <div class="batch-thumb">${thumb}</div>
          <div class="batch-file-meta">
            <div class="batch-file-name">${escapeHtml(item.file.name)}</div>
            ${item.error ? `<div class="batch-file-error">${escapeHtml(item.error)}</div>` : ''}
          </div>
          <div class="batch-state">${statusText}</div>
        </div>
      `;
    }).join('');
  }

  function renderBatchPreview() {
    if (!batchPreviewPanel || !batchPreviewList || !batchFailedList) return;

    batchPreviewItems = batchQueue.filter((item) => item.status === 'ready');
    const failedItems = batchQueue.filter((item) => item.status === 'error');

    if (!batchPreviewItems.length) {
      batchPreviewPanel.classList.add('hidden');
      batchPreviewList.innerHTML = '';
    } else {
      batchPreviewPanel.classList.remove('hidden');
      batchPreviewList.innerHTML = batchPreviewItems.map((item) => {
        const preview = item.preview || {};
        const cover = preview.coverPath ? `<img src="${preview.coverPath}" alt="Carátula" />` : '<span>♫</span>';
        const title = preview.title || item.file.name.replace(/\.[^.]+$/, '');
        const artist = preview.artist || '';
        const album = preview.album || '';
        return `
          <div class="batch-preview-item" data-item-id="${item.id}">
            <div class="batch-preview-cover">${cover}</div>
            <div class="batch-preview-fields">
              <label>
                Título
                <input data-batch-field="title" data-item-id="${item.id}" value="${escapeHtml(title)}" />
              </label>
              <label>
                Artista
                <input data-batch-field="artist" data-item-id="${item.id}" value="${escapeHtml(artist)}" />
              </label>
              <label>
                Álbum
                <input data-batch-field="album" data-item-id="${item.id}" value="${escapeHtml(album)}" />
              </label>
            </div>
          </div>
        `;
      }).join('');
    }

    if (!failedItems.length) {
      batchFailedList.innerHTML = '';
      return;
    }

    batchFailedList.innerHTML = failedItems.map((item) => `
      <div class="batch-failed-item">
        <div class="batch-file-meta">
          <div class="batch-file-name">${escapeHtml(item.file.name)}</div>
          <div class="batch-file-error">${escapeHtml(item.error || 'No se pudo analizar esta canción.')}</div>
        </div>
        <button class="secondary-btn" type="button" data-retry-item="${item.id}" aria-label="Reintentar" title="Reintentar">🔄</button>
      </div>
    `).join('');
  }

  function queueSelectedFiles(fileList) {
    const files = getMediaFiles(fileList);
    if (!files.length) {
      setUploadStatus('Selecciona al menos un archivo de audio o vídeo válido.', 'error');
      return;
    }

    if (files.length > MAX_BATCH_FILES) {
      setUploadStatus(`Máximo ${MAX_BATCH_FILES} archivos por lote. Divide la carga en tandas más pequeñas.`, 'error');
      return;
    }

    batchQueue = files.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      file,
      status: 'waiting',
      preview: null,
      error: null,
      fileName: file.name,
    }));

    if (startBatchButton) startBatchButton.classList.remove('hidden');
    renderBatchQueue();
    setUploadStatus(`${files.length} archivo(s) listo(s) para analizar.`, 'info');
  }

  async function analyzeSingleFile(file) {
    const formData = new FormData();
    formData.append('audio', file);

    const response = await fetch('/songs/upload/analyze', {
      method: 'POST',
      body: formData,
      headers: {
        Accept: 'application/json',
      },
    });

    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || 'No se pudo analizar la canción.');
    }

    return data;
  }

  async function processBatchQueue() {
    if (batchIsBusy || !batchQueue.length) return;
    batchIsBusy = true;

    for (const item of batchQueue) {
      if (item.status === 'ready') continue;
      item.status = 'analyzing';
      item.error = null;
      renderBatchQueue();

      try {
        const data = await analyzeSingleFile(item.file);
        item.preview = data.preview || {};
        item.mediaType = data.mediaType || (item.file.type === 'video/mp4' ? 'video' : 'audio');
        item.fileName = data.fileName || item.file.name;
        item.fileUrl = data.fileUrl || '';
        item.status = 'ready';
      } catch (error) {
        item.status = 'error';
        item.error = error && error.message ? error.message : 'No se pudo analizar la canción.';
      }

      renderBatchQueue();
    }

    batchIsBusy = false;
    renderBatchPreview();

    const readyCount = batchQueue.filter((item) => item.status === 'ready').length;
    const errorCount = batchQueue.filter((item) => item.status === 'error').length;

    if (readyCount > 0) {
      setUploadStatus(`${readyCount} de ${batchQueue.length} canciones preparadas. Revisa la vista previa antes de confirmar.`, 'success');
    } else if (errorCount > 0) {
      setUploadStatus(`${errorCount} archivo(s) fallaron. Puedes reintentarlos individualmente.`, 'error');
    }
  }

  async function retryBatchItem(itemId) {
    const item = batchQueue.find((candidate) => candidate.id === itemId);
    if (!item) return;

    item.status = 'analyzing';
    item.error = null;
    renderBatchQueue();
    renderBatchPreview();

    try {
      const data = await analyzeSingleFile(item.file);
      item.preview = data.preview || {};
      item.fileName = data.fileName || item.file.name;
      item.fileUrl = data.fileUrl || '';
      item.status = 'ready';
      renderBatchQueue();
      renderBatchPreview();
    } catch (error) {
      item.status = 'error';
      item.error = error && error.message ? error.message : 'No se pudo analizar la canción.';
      renderBatchQueue();
      renderBatchPreview();
    }
  }

  if (dropZone) {
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        fileInput.click();
      }
    });

    ['dragover', 'dragenter'].forEach((eventName) => {
      dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropZone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropZone.classList.remove('dragover');
      });
    });

    dropZone.addEventListener('drop', (event) => {
      const files = getMediaFiles(event.dataTransfer.files || []);
      if (files.length) {
        fileInput.files = event.dataTransfer.files;
        queueSelectedFiles(event.dataTransfer.files);
      }
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', (event) => {
      const selectedFiles = event.target.files;
      if (!selectedFiles || !selectedFiles.length) return;
      if (selectedFiles.length > 1) {
        queueSelectedFiles(selectedFiles);
      }
    });
  }

  if (startBatchButton) {
    startBatchButton.addEventListener('click', () => {
      if (!batchQueue.length) {
        setUploadStatus('Primero selecciona archivos para procesar.', 'error');
        return;
      }
      processBatchQueue();
    });
  }

  if (clearBatchButton) {
    clearBatchButton.addEventListener('click', () => {
      if (fileInput) fileInput.value = '';
      batchQueue = [];
      batchPreviewItems = [];
      batchIsBusy = false;
      if (batchQueuePanel) batchQueuePanel.classList.add('hidden');
      if (batchPreviewPanel) batchPreviewPanel.classList.add('hidden');
      if (batchFileList) batchFileList.innerHTML = '';
      if (batchPreviewList) batchPreviewList.innerHTML = '';
      if (batchFailedList) batchFailedList.innerHTML = '';
      if (startBatchButton) startBatchButton.classList.add('hidden');
      setUploadStatus('Lista de archivos limpiada.', 'info');
    });
  }

  if (batchPreviewList) {
    batchPreviewList.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      const itemId = target.dataset.itemId;
      const field = target.dataset.batchField;
      const item = batchQueue.find((candidate) => candidate.id === itemId);
      if (!item || !item.preview) return;
      const value = target.value.trim();
      if (field === 'title') item.preview.title = value;
      if (field === 'artist') item.preview.artist = value;
      if (field === 'album') item.preview.album = value;
    });
  }

  if (batchFailedList) {
    batchFailedList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-retry-item]');
      if (!button) return;
      retryBatchItem(button.dataset.retryItem);
    });
  }

  if (uploadForm) {
    uploadForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const files = fileInput && fileInput.files ? Array.from(fileInput.files) : [];

      if (files.length > 1) {
        queueSelectedFiles(fileInput.files);
        return;
      }

      const file = files[0] || null;
      if (!file) {
        setUploadStatus('Selecciona un archivo de audio o vídeo antes de continuar.', 'error');
        return;
      }

      setUploadStatus('Analizando canción...', 'info');

      const formData = new FormData();
      formData.append('audio', file);

      try {
        const response = await fetch('/songs/upload/analyze', {
          method: 'POST',
          body: formData,
          headers: {
            Accept: 'application/json',
          },
        });

        const data = await response.json();

        if (!response.ok || !data.ok) {
          setUploadStatus(data.error || 'No se pudo analizar la canción.', 'error');
          return;
        }

        draftUpload = data;
        const preview = data.preview || {};

        if (metaTitle) metaTitle.value = preview.title || '';
        if (metaArtist) metaArtist.value = preview.artist || '';
        if (metaAlbum) metaAlbum.value = preview.album || '';
        if (metaYear) metaYear.value = preview.year || '';
        if (metaGenre) metaGenre.value = preview.genre || '';
        if (metaDuration) metaDuration.value = formatDuration(preview.duration);

        if (coverPreview) {
          if (preview.coverPath) {
            coverPreview.src = preview.coverPath;
            coverPreview.classList.remove('hidden');
          } else {
            coverPreview.src = '';
            coverPreview.classList.add('hidden');
          }
        }

        if (uploadPreview) {
          uploadPreview.classList.remove('hidden');
        }

        if (preview.title || preview.artist) {
          setUploadStatus('Metadatos detectados. Revísalos y confirma antes de guardar.', 'success');
        } else {
          setUploadStatus('No pudimos detectar los datos. Complétalos manualmente antes de subir.', 'error');
        }
      } catch (error) {
        setUploadStatus('No se pudo analizar la canción. Inténtalo de nuevo.', 'error');
      }
    });
  }

  if (confirmUploadButton) {
    confirmUploadButton.addEventListener('click', async () => {
      if (!draftUpload) {
        setUploadStatus('Primero analiza un archivo para guardarlo.', 'error');
        return;
      }

      const payload = {
        fileName: draftUpload.fileName,
        title: metaTitle ? metaTitle.value.trim() : '',
        artist: metaArtist ? metaArtist.value.trim() : '',
        album: metaAlbum ? metaAlbum.value.trim() : '',
        year: metaYear ? Number(metaYear.value || 0) || null : null,
        genre: metaGenre ? metaGenre.value.trim() : '',
        duration: draftUpload.preview && draftUpload.preview.duration ? Number(draftUpload.preview.duration) : 0,
        coverPath: draftUpload.preview && draftUpload.preview.coverPath ? draftUpload.preview.coverPath : null,
        metadataSource: draftUpload.preview && draftUpload.preview.metadataSource ? draftUpload.preview.metadataSource : {},
          mediaType: draftUpload.mediaType || 'audio',
      };

      setUploadStatus('Guardando canción...', 'info');

      try {
        const response = await fetch('/songs/upload/confirm', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (!response.ok || !data.ok) {
          setUploadStatus(data.error || 'No se pudo guardar la canción.', 'error');
          return;
        }

        window.location.href = data.redirect || '/';
      } catch (error) {
        setUploadStatus('No se pudo guardar la canción. Inténtalo de nuevo.', 'error');
      }
    });
  }

  if (confirmBatchButton) {
    confirmBatchButton.addEventListener('click', async () => {
      const readyItems = batchQueue.filter((item) => item.status === 'ready');
      if (!readyItems.length) {
        setUploadStatus('No hay canciones listas para confirmar.', 'error');
        return;
      }

      const payloadItems = readyItems.map((item) => ({
        fileName: item.fileName || item.file.name,
        title: (item.preview && item.preview.title) || item.file.name.replace(/\.[^.]+$/, ''),
        artist: (item.preview && item.preview.artist) || '',
        album: (item.preview && item.preview.album) || '',
        year: (item.preview && item.preview.year) || null,
        genre: (item.preview && item.preview.genre) || '',
        duration: (item.preview && item.preview.duration) || 0,
        coverPath: (item.preview && item.preview.coverPath) || null,
        metadataSource: (item.preview && item.preview.metadataSource) || {},
        trackNumber: (item.preview && item.preview.trackNumber) || null,
        mediaType: item.mediaType || (item.file.type === 'video/mp4' ? 'video' : 'audio'),
      }));

      setUploadStatus('Guardando lote...', 'info');

      try {
        const response = await fetch('/songs/upload/confirm-batch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ items: payloadItems }),
        });

        const data = await response.json();
        if (!response.ok || !data.ok) {
          setUploadStatus(data.error || 'No se pudo guardar el lote.', 'error');
          return;
        }

        const uploadedCount = Number(data.uploadedCount || 0);
        const failedCount = Number(data.failedCount || 0);
        setUploadStatus(`${uploadedCount} canciones subidas correctamente, ${failedCount} con error.`, 'success');
        triggerConfetti();
        batchQueue = batchQueue.filter((item) => item.status === 'error');
        renderBatchQueue();
        renderBatchPreview();
      } catch (error) {
        setUploadStatus('No se pudo guardar el lote. Inténtalo de nuevo.', 'error');
      }
    });
  }

  if (resetBatchButton) {
    resetBatchButton.addEventListener('click', resetUploadState);
  }

  if (resetUploadButton) {
    resetUploadButton.addEventListener('click', resetUploadState);
  }

  const addSongsButton = document.getElementById('open-add-songs');
  const addSongsModal = document.getElementById('add-songs-modal');
  const closeAddSongs = document.getElementById('close-add-songs');
  const playlistSongSearch = document.getElementById('playlist-song-search');
  const playlistSongList = document.getElementById('playlist-song-list');
  const currentPlaylistId = document.querySelector('[data-playlist-id]')?.dataset.playlistId;

  if (addSongsButton && addSongsModal && currentPlaylistId) {
    async function renderAvailableSongs() {
      const response = await fetch(`/playlists/${currentPlaylistId}/addable`);
      const data = await response.json();
      const songs = data.songs || [];
      const query = (playlistSongSearch?.value || '').trim().toLowerCase();
      const visibleSongs = songs.filter((song) => !query || `${song.title} ${song.artist}`.toLowerCase().includes(query));

      if (!visibleSongs.length) {
        playlistSongList.innerHTML = '<div class="empty-song-picker">No se encontraron canciones. Sube tu primera canción para empezar.</div>';
        return;
      }

      playlistSongList.innerHTML = visibleSongs.map((song) => `
        <div class="song-picker-item ${song.alreadyAdded ? 'already-added' : ''}">
          <div class="song-picker-cover">
            ${song.coverPath ? `<img src="${song.coverPath}" alt="Carátula de ${song.title}" />` : '<span>♫</span>'}
          </div>
          <div class="song-picker-meta">
            <strong>${song.title || 'Sin título'}</strong>
            <span>${song.artist || 'Artista desconocido'}</span>
          </div>
          <button
            type="button"
            class="primary-btn small-btn add-song-button"
            data-song-id="${song.id}"
            aria-label="${song.alreadyAdded ? 'Canción ya añadida' : 'Añadir canción'}"
            title="${song.alreadyAdded ? 'Canción ya añadida' : 'Añadir canción'}"
            ${song.alreadyAdded ? 'disabled' : ''}
          >
            ${song.alreadyAdded ? '✅' : '➕'}
          </button>
        </div>
      `).join('');

      playlistSongList.querySelectorAll('.add-song-button').forEach((button) => {
        button.addEventListener('click', async () => {
          const response = await fetch(`/playlists/${currentPlaylistId}/add-song-async`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({ song_id: Number(songId) }),
          });

          const data = await response.json();
          if (data.ok) {
            await renderAvailableSongs();
            if (window.location.pathname.includes('/playlists/')) {
              window.location.reload();
            }
          }
        });
      });
    }

    addSongsButton.addEventListener('click', () => {
      addSongsModal.classList.add('open');
      renderAvailableSongs();
    });

    closeAddSongs.addEventListener('click', () => addSongsModal.classList.remove('open'));
    addSongsModal.addEventListener('click', (event) => {
      if (event.target === addSongsModal) {
        addSongsModal.classList.remove('open');
      }
    });

    if (playlistSongSearch) {
      playlistSongSearch.addEventListener('input', renderAvailableSongs);
    }
  }

  const appearanceForm = document.getElementById('appearance-form');
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabPanels = document.querySelectorAll('.tab-panel');
  const surpriseButton = document.getElementById('surprise-button');
  const easterEgg = document.getElementById('easter-egg');
  const fontPreviewSample = document.getElementById('font-preview-sample');
  const fontPreviewAuth = document.getElementById('font-preview-auth');
  const contrastWarning = document.getElementById('contrast-warning');
  const emojiPickerTrigger = document.getElementById('emoji-picker-trigger');
  const previewShell = document.getElementById('preview-shell');
  const previewTitle = document.querySelector('.preview-title');
  const previewHeroText = document.getElementById('preview-hero-text');
  const previewEmoji = document.querySelector('.preview-emoji');
  const previewHeroEmoji = document.querySelector('.preview-hero-emoji');
  const previewPill = document.querySelector('.preview-pill');
  const previewButton = document.querySelector('.preview-btn');

  function sanitizeText(value) {
    return (value || '').replace(/[<>]/g, '').trim();
  }

  function hexToRgb(hex) {
    const clean = hex.replace('#', '');
    if (clean.length !== 6) return { r: 255, g: 255, b: 255 };
    const int = Number.parseInt(clean, 16);
    return {
      r: (int >> 16) & 255,
      g: (int >> 8) & 255,
      b: int & 255,
    };
  }

  function luminance(hex) {
    const { r, g, b } = hexToRgb(hex);
    const normalized = [r, g, b].map((channel) => {
      const value = channel / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * normalized[0] + 0.7152 * normalized[1] + 0.0722 * normalized[2];
  }

  function updateContrastWarning() {
    if (!contrastWarning) return;
    const accent = document.querySelector('input[name="accentColor"]')?.value || '#8b5cf6';
    const background = document.querySelector('input[name="backgroundColor"]')?.value || '#0f172a';
    const accentL = luminance(accent);
    const bgL = luminance(background);
    const contrast = (Math.max(accentL, bgL) + 0.05) / (Math.min(accentL, bgL) + 0.05);
    const visible = contrast >= 4.5;
    contrastWarning.classList.toggle('hidden', visible);
    if (!visible) {
      contrastWarning.textContent = '⚠️ El contraste es bajo: prueba una tonalidad más oscura o más intensa para que el texto siga legible.';
    }
  }

  function ensureFontLink() {
    const heading = document.querySelector('input[name="headingFont"]')?.value || 'Sora';
    const body = document.querySelector('input[name="bodyFont"]')?.value || 'Inter';
    const forms = document.querySelector('select[name="typography"]')?.value || 'Inter';
    const choices = [heading, body, forms].filter(Boolean);
    const unique = [...new Set(choices.map((font) => font.trim()))].filter((font) => font && font !== 'inherit');
    const fontQuery = unique.map((font) => `family=${encodeURIComponent(font)}:wght@400;500;600;700;800`).join('&');
    const existing = document.getElementById('live-font-link');
    const href = unique.length ? `https://fonts.googleapis.com/css2?${fontQuery}&display=swap` : '';

    if (!href) {
      if (existing) existing.remove();
      return;
    }

    if (existing) {
      existing.href = href;
      return;
    }

    const link = document.createElement('link');
    link.id = 'live-font-link';
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  function updateAppearancePreview() {
    const root = document.documentElement;
    const accent = document.querySelector('input[name="accentColor"]')?.value || '#8b5cf6';
    const background = document.querySelector('input[name="backgroundColor"]')?.value || '#0f172a';
    const card = document.querySelector('input[name="cardColor"]')?.value || '#111827';
    const headingFont = sanitizeText(document.querySelector('input[name="headingFont"]')?.value || 'Sora');
    const bodyFont = sanitizeText(document.querySelector('input[name="bodyFont"]')?.value || 'Inter');
    const formsFont = sanitizeText(document.querySelector('select[name="typography"]')?.value || 'Inter');
    const scaleValue = document.querySelector('select[name="fontScale"]')?.value || 'medium';
    const scaleMap = { small: 0.92, medium: 1, large: 1.08, xlarge: 1.2 };
    const siteName = sanitizeText(document.querySelector('input[name="siteName"]')?.value || 'CholuMúsica');
    const heroText = sanitizeText(document.querySelector('input[name="heroText"]')?.value || 'Descubre música que te mueve');
    const primaryButtonText = sanitizeText(document.querySelector('input[name="primaryButtonText"]')?.value || 'Añadir canción');
    const siteEmoji = sanitizeText(document.querySelector('input[name="siteEmoji"]')?.value || '🎵');
    const heroEmoji = sanitizeText(document.querySelector('input[name="heroEmoji"]')?.value || '✨');

    root.style.setProperty('--primary', accent);
    root.style.setProperty('--bg', background);
    root.style.setProperty('--panel', card);
    root.style.setProperty('--font-heading', `'${headingFont}', 'Segoe UI', sans-serif`);
    root.style.setProperty('--font-body', `'${bodyFont}', 'Segoe UI', sans-serif`);
    root.style.setProperty('--font-scale', String(scaleMap[scaleValue] || 1));

    if (previewShell) {
      previewShell.style.setProperty('--primary', accent);
      previewShell.style.setProperty('--bg', background);
      previewShell.style.setProperty('--panel', card);
      previewShell.style.setProperty('--font-heading', `'${headingFont}', 'Segoe UI', sans-serif`);
      previewShell.style.setProperty('--font-body', `'${bodyFont}', 'Segoe UI', sans-serif`);
      previewShell.style.setProperty('--font-scale', String(scaleMap[scaleValue] || 1));
    }

    if (previewTitle) previewTitle.textContent = siteName;
    if (previewHeroText) previewHeroText.textContent = heroText;
    if (previewEmoji) previewEmoji.textContent = sanitizeText(document.querySelector('input[name="headerEmoji"]')?.value || '🎧');
    if (previewHeroEmoji) previewHeroEmoji.textContent = heroEmoji;
    if (previewPill) previewPill.textContent = `${siteEmoji} ${sanitizeText(document.querySelector('input[name="libraryTitle"]')?.value || 'Biblioteca')}`;
    if (previewButton) {
      previewButton.textContent = '➕';
      previewButton.setAttribute('aria-label', primaryButtonText);
      previewButton.title = primaryButtonText;
    }

    const brandingNodes = document.querySelectorAll('[data-live-site-name]');
    brandingNodes.forEach((node) => {
      node.textContent = siteName;
    });

    const heroNameNodes = document.querySelectorAll('[data-live-hero-title]');
    heroNameNodes.forEach((node) => {
      node.textContent = heroText;
    });

    const buttonNodes = document.querySelectorAll('[data-live-primary-button]');
    buttonNodes.forEach((node) => {
      node.textContent = '➕';
      node.setAttribute('aria-label', primaryButtonText);
      node.title = primaryButtonText;
    });

    const emojiTargets = document.querySelectorAll('[data-live-site-emoji]');
    emojiTargets.forEach((node) => {
      node.textContent = siteEmoji;
    });

    const heroEmojiTargets = document.querySelectorAll('[data-live-hero-emoji]');
    heroEmojiTargets.forEach((node) => {
      node.textContent = heroEmoji;
    });

    if (fontPreviewSample) {
      fontPreviewSample.textContent = heroText;
      fontPreviewSample.style.fontFamily = `'${headingFont}', 'Segoe UI', sans-serif`;
    }
    if (fontPreviewAuth) {
      fontPreviewAuth.style.fontFamily = `'${formsFont}', 'Segoe UI', sans-serif`;
    }

    ensureFontLink();
    updateContrastWarning();
  }

  if (appearanceForm) {
    const elements = appearanceForm.querySelectorAll('input, select, textarea');
    elements.forEach((element) => {
      element.addEventListener('input', updateAppearancePreview);
      element.addEventListener('change', updateAppearancePreview);
    });

    tabButtons.forEach((button) => {
      button.addEventListener('click', () => {
        tabButtons.forEach((tab) => tab.classList.toggle('active', tab === button));
        tabPanels.forEach((panel) => {
          panel.classList.toggle('active', panel.dataset.panel === button.dataset.tab);
        });
      });
    });

    if (emojiPickerTrigger) {
      const picker = document.getElementById('emoji-picker-container') || document.createElement('div');
      if (!picker.id) {
        picker.id = 'emoji-picker-container';
        picker.className = 'emoji-picker hidden';
      }
      picker.className = 'emoji-picker hidden';
      if (!picker.dataset.ready) {
        const emojiSet = ['🎵', '🎧', '✨', '🔥', '🌙', '☀️', '🎶', '💜', '🌈', '🎉', '📚', '💿', '🎤', '🎸', '🪩', '🌟'];
        emojiSet.forEach((emoji) => {
          const item = document.createElement('button');
          item.type = 'button';
          item.textContent = emoji;
          item.title = emoji;
          item.addEventListener('click', () => {
            const target = document.querySelector('input[name="siteEmoji"]') || document.querySelector('input[name="headerEmoji"]');
            if (target) {
              target.value = emoji;
              target.dispatchEvent(new Event('input', { bubbles: true }));
            }
            picker.classList.add('hidden');
          });
          picker.appendChild(item);
        });
        picker.dataset.ready = 'true';
      }
      if (!picker.parentElement && emojiPickerTrigger.parentElement) {
        emojiPickerTrigger.parentElement.appendChild(picker);
      }

      emojiPickerTrigger.addEventListener('click', () => {
        picker.classList.toggle('hidden');
      });
    }

    updateAppearancePreview();
  }

  if (surpriseButton && easterEgg) {
    surpriseButton.addEventListener('click', () => {
      easterEgg.classList.remove('hidden');
      const audio = document.getElementById('global-audio');
      if (audio && audio.src) {
        audio.play().catch(() => {});
      }
      const container = document.body.appendChild(document.createElement('div'));
      container.className = 'main-confetti';
      for (let index = 0; index < 40; index += 1) {
        const piece = document.createElement('span');
        piece.className = 'confetti-piece';
        piece.style.left = `${Math.random() * 100}%`;
        piece.style.background = ['#8b5cf6', '#22d3ee', '#f472b6', '#fbbf24', '#34d399'][index % 5];
        piece.style.animationDuration = `${2 + Math.random() * 2.7}s`;
        piece.style.transform = `rotate(${Math.random() * 360}deg)`;
        container.appendChild(piece);
      }
      setTimeout(() => container.remove(), 2400);
    });
  }
});
