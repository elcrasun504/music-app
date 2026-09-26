document.addEventListener('DOMContentLoaded', () => {
  const fileInput = document.getElementById('offline-file-input');
  const chooseFilesButton = document.getElementById('offline-choose-files');
  const trackList = document.getElementById('offline-track-list');
  const audio = document.getElementById('offline-audio');
  const status = document.getElementById('offline-status');
  const retryButton = document.getElementById('offline-retry');
  const objectUrls = [];

  chooseFilesButton.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.length = 0;
    trackList.replaceChildren();

    const files = Array.from(fileInput.files || []).filter((file) =>
      file.type.startsWith('audio/') || /\.(aac|flac|m4a|mp3|ogg|opus|wav|weba)$/i.test(file.name));
    if (!files.length) {
      status.textContent = 'Selecciona archivos de audio desde el dispositivo.';
      return;
    }

    files.forEach((file, index) => {
      const objectUrl = URL.createObjectURL(file);
      objectUrls.push(objectUrl);

      const button = document.createElement('button');
      button.className = 'secondary-btn offline-track-button';
      button.type = 'button';
      button.textContent = '🎵';
      button.setAttribute('aria-label', `Reproducir ${file.name}`);
      button.title = file.name;
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => {
        audio.src = objectUrl;
        audio.play().catch(() => {
          status.textContent = 'Pulsa reproducir para empezar a escuchar.';
        });
        trackList.querySelectorAll('.offline-track-button').forEach((trackButton) => {
          trackButton.setAttribute('aria-pressed', String(trackButton === button));
        });
        status.textContent = `Reproduciendo: ${file.name}`;
      });

      const item = document.createElement('li');
      const name = document.createElement('span');
      name.className = 'offline-track-name';
      name.textContent = file.name;
      item.dataset.trackIndex = String(index);
      item.append(button);
      item.append(name);
      trackList.append(item);
    });

    status.textContent = `${files.length} archivo(s) listos para reproducir.`;
  });

  retryButton.addEventListener('click', () => window.location.assign('/'));

  window.addEventListener('pagehide', () => {
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
  });
});