// Spotify-Wiedergabe beim Host über die Spotify-Embed-API.
// Der Player liegt unter einer Abdeckung, damit Titel und Cover erst bei der Auflösung sichtbar werden.
// Ohne Spotify-Login im Browser spielt Spotify eine 30-Sekunden-Vorschau, mit Login den ganzen Song.

const Music = (() => {
  const dock = document.getElementById('music-dock');
  const hint = document.getElementById('music-hint');
  let apiPromise = null;
  let controller = null;
  let currentId = null;
  let paused = true;

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

  async function show(trackId, revealed) {
    dock.classList.remove('hidden');
    dock.classList.toggle('revealed', !!revealed);
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
  }

  document.getElementById('music-play').addEventListener('click', () => controller?.resume());
  document.getElementById('music-pause').addEventListener('click', () => controller?.pause());
  document.getElementById('music-restart').addEventListener('click', () => {
    controller?.seek(0);
    controller?.resume();
  });

  return { show, reveal, hide, loadApi };
})();
