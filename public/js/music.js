// Spotify-Wiedergabe beim Host über die Spotify-Embed-API.
// Der Player liegt unter einer Abdeckung, damit Titel und Cover erst bei der Auflösung sichtbar werden.
// Ohne Spotify-Login im Browser spielt Spotify eine 30-Sekunden-Vorschau, mit Login den ganzen Song.
// Songs ohne Spotify-ID laufen als 30-Sekunden-Vorschau über Deezer (previewUrl, siehe server/deezer.js).

const Music = (() => {
  const dock = document.getElementById('music-dock');
  const hint = document.getElementById('music-hint');
  let apiPromise = null;
  let controller = null;
  let currentId = null;
  let paused = true;
  const audio = new Audio();
  const altButton = document.getElementById('music-alt');
  let previewSrc = null; // läuft gerade eine Vorschau, sonst null
  let altUrl = null; // Vorschau, auf die der Host umschalten kann, wenn Spotify nicht spielt

  audio.addEventListener('playing', () => setHint('Läuft … (30-Sekunden-Vorschau)'));
  audio.addEventListener('pause', () => { if (previewSrc && !audio.ended) setHint('Pausiert'); });
  audio.addEventListener('ended', () => setHint('Vorschau zu Ende. „Von vorn“ spielt sie noch einmal.'));
  audio.addEventListener('error', () => { if (previewSrc) setHint('Keine Vorschau gefunden. Tausche den Song aus.'); });

  function loadApi() {
    if (!apiPromise) {
      apiPromise = new Promise((resolve) => {
        window.onSpotifyIframeApiReady = (api) => resolve(api);
        const script = document.createElement('script');
        script.src = 'https://open.spotify.com/embed/iframe-api/v1';
        script.async = true;
        script.onerror = () => resolve(null);
        document.head.appendChild(script);
        setTimeout(() => resolve(null), 15000);
      });
    }
    return apiPromise;
  }

  function setHint(text) {
    hint.textContent = text;
  }

  function showPreview(url) {
    dock.classList.add('preview');
    altButton.classList.add('hidden');
    if (previewSrc === url) return;
    previewSrc = url;
    if (controller && !paused) controller.pause();
    currentId = null;
    setHint('Lade Vorschau …');
    audio.src = url;
    // Blockiert der Browser das automatische Abspielen, tippt der Host selbst auf Abspielen
    audio.play().catch(() => { if (!audio.error) setHint('Bereit. Tippe auf Abspielen.'); });
  }

  function stopPreview() {
    dock.classList.remove('preview');
    if (!previewSrc) return;
    previewSrc = null;
    audio.pause();
    audio.removeAttribute('src');
  }

  async function show(trackId, revealed, previewUrl = null) {
    dock.classList.remove('hidden');
    dock.classList.toggle('revealed', !!revealed);
    if (previewUrl && (!trackId || previewSrc === previewUrl)) {
      showPreview(previewUrl);
      return;
    }
    stopPreview();
    altUrl = previewUrl;
    altButton.classList.toggle('hidden', !previewUrl);
    if (!trackId) {
      setHint('Für diesen Song ist keine Spotify-ID hinterlegt.');
      return;
    }
    if (trackId === currentId) return;
    currentId = trackId;
    setHint('Lade Spotify …');
    const api = await loadApi();
    if (!api) {
      setHint('Spotify konnte nicht geladen werden. Ist das Gerät online?');
      return;
    }
    const uri = `spotify:track:${trackId}`;
    if (!controller) {
      await new Promise((resolve) => {
        api.createController(document.getElementById('spotify-embed'), { uri, width: '100%', height: 80 }, (c) => {
          controller = c;
          c.addListener('playback_update', (e) => {
            paused = e.data.isPaused;
            setHint(paused ? 'Pausiert' : 'Läuft …');
          });
          c.addListener('ready', () => {
            setHint('Bereit. Tippe auf Abspielen.');
            resolve();
          });
          setTimeout(resolve, 5000);
        });
      });
    } else {
      controller.loadUri(uri);
    }
    controller.play();
  }

  function reveal() {
    dock.classList.add('revealed');
  }

  function hide() {
    if (dock.classList.contains('hidden')) return;
    dock.classList.add('hidden');
    if (controller && !paused) controller.pause();
    currentId = null;
    stopPreview();
    altButton.classList.add('hidden');
  }

  document.getElementById('music-play').addEventListener('click', () => (previewSrc ? audio.play().catch(() => {}) : controller?.resume()));
  document.getElementById('music-pause').addEventListener('click', () => (previewSrc ? audio.pause() : controller?.pause()));
  document.getElementById('music-restart').addEventListener('click', () => {
    if (previewSrc) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
      return;
    }
    controller?.seek(0);
    controller?.resume();
  });
  altButton.addEventListener('click', () => { if (altUrl) showPreview(altUrl); });

  return { show, reveal, hide, loadApi };
})();
