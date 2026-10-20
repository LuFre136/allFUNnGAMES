// Karaoke: Spielansicht für Host und Handys (nutzt die Helfer aus lobby.js).
// Das Video läuft nur auf dem Host-Gerät in einer eigenen Bühne außerhalb von #app,
// damit es beim Neuzeichnen nicht neu lädt.

(() => {
  const ka = {
    draft: { title: '', url: '', partner: '', singer: '' },
    results: null, // Suchergebnisse (nur mit YOUTUBE_API_KEY)
    searching: false,
    lookedUp: null, // Video-ID, deren Titel schon nachgeschlagen wurde
    seenReaction: 0,
  };

  function act(type, data = {}, done) {
    socket.emit('game:action', { type, ...data }, (res) => {
      if (res?.error) toast(res.error);
      else done?.();
    });
  }

  function playerName(id) {
    return playerById(id)?.name || 'Jemand';
  }

  function singerNames(ids) {
    return ids.map((id) => esc(playerName(id))).join(' & ');
  }

  // Gleiche Regeln wie auf dem Server (parseVideoId)
  function videoId(input) {
    const text = String(input ?? '').trim();
    if (/^[\w-]{11}$/.test(text)) return text;
    try {
      const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
      const host = url.hostname.replace(/^(www|m|music)\./, '');
      let id = null;
      if (host === 'youtu.be') id = url.pathname.split('/')[1];
      else if (host === 'youtube.com' || host === 'youtube-nocookie.com') id = url.searchParams.get('v') || url.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/)?.[1];
      return id && /^[\w-]{11}$/.test(id) ? id : null;
    } catch {
      return null;
    }
  }

  function youtubeSearchUrl(text) {
    const q = /karaoke/i.test(text) ? text : `${text} karaoke`;
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(q.trim())}`;
  }

  function thumb(id, cls = '') {
    return id ? `<img class="ka-thumb ${cls}" src="https://i.ytimg.com/vi/${esc(id)}/mqdefault.jpg" alt="" loading="lazy">` : `<span class="ka-thumb empty ${cls}">🎵</span>`;
  }

  function stars(value) {
    if (value === null || value === undefined) return '';
    return `<span class="ka-stars-static" title="${fmtAvg(value)} von 5"><span class="off">★★★★★</span><span class="on" style="width:${(value / 5) * 100}%">★★★★★</span></span>`;
  }

  function fmtAvg(value) {
    return value === null || value === undefined ? '–' : value.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }

  // ---------- Bühne (Video auf dem Host-Bildschirm) ----------

  const Stage = (() => {
    const el = document.createElement('div');
    el.id = 'ka-stage';
    el.className = 'ka-stage hidden';
    el.innerHTML = `<div class="ka-screen">
        <div id="ka-player"></div>
        <div class="ka-caption" id="ka-caption"></div>
        <div class="ka-reactions" id="ka-reactions"></div>
        <div class="ka-error hidden" id="ka-error"></div>
      </div>
      <div class="row ka-stage-bar">
        <button class="btn small" id="ka-fullscreen">⛶ Vollbild</button>
        <a class="btn small ghost" id="ka-open" target="_blank" rel="noopener">Auf YouTube öffnen ↗</a>
        <span class="small muted" id="ka-hint"></span>
      </div>`;
    document.querySelector('main.wrap').insertBefore(el, document.getElementById('app'));
    const caption = el.querySelector('#ka-caption');
    const error = el.querySelector('#ka-error');
    const hint = el.querySelector('#ka-hint');
    const reactions = el.querySelector('#ka-reactions');
    let apiPromise = null;
    let player = null;
    let fallback = false;
    let current = null; // { songId, videoId }

    function loadApi() {
      if (!apiPromise) {
        apiPromise = new Promise((resolve) => {
          if (window.YT?.Player) return resolve(window.YT);
          const previous = window.onYouTubeIframeAPIReady;
          window.onYouTubeIframeAPIReady = () => {
            previous?.();
            resolve(window.YT);
          };
          const script = document.createElement('script');
          script.src = 'https://www.youtube.com/iframe_api';
          script.async = true;
          script.onerror = () => resolve(null);
          document.head.appendChild(script);
          setTimeout(() => resolve(window.YT?.Player ? window.YT : null), 10000);
        });
      }
      return apiPromise;
    }

    function showError(text) {
      error.innerHTML = text;
      error.classList.toggle('hidden', !text);
    }

    function onStateChange(e) {
      if (e.data === 0 && current) act('ended', { songId: current.songId });
      if (e.data === 1) hint.textContent = '';
    }

    function onError(e) {
      const blocked = e.data === 101 || e.data === 150;
      showError(`<b>${blocked ? 'Dieses Video darf nur direkt auf YouTube abgespielt werden.' : 'Dieses Video gibt es nicht (mehr).'}</b><br>Öffne es auf YouTube oder trag unten einen anderen Link ein.`);
    }

    async function play(songId, id) {
      if (current?.songId === songId && current.videoId === id) return;
      current = { songId, videoId: id };
      showError('');
      el.querySelector('#ka-open').href = `https://www.youtube.com/watch?v=${id}`;
      hint.textContent = 'Lade Video …';
      const YT = await loadApi();
      if (current?.videoId !== id) return;
      if (!YT) {
        // Ohne die Player-API gibt es kein Signal am Songende, dann beendet der Host den Song selbst
        fallback = true;
        player = null;
        el.querySelector('#ka-player').outerHTML = `<iframe id="ka-player" src="https://www.youtube.com/embed/${id}?autoplay=1&playsinline=1&rel=0" allow="autoplay; fullscreen; encrypted-media" allowfullscreen></iframe>`;
        hint.textContent = 'Tippe am Ende des Songs auf „Fertig“.';
        return;
      }
      if (!player || fallback) {
        fallback = false;
        player = await new Promise((resolve) => {
          const p = new YT.Player('ka-player', {
            videoId: id,
            width: '100%',
            height: '100%',
            playerVars: { autoplay: 1, playsinline: 1, rel: 0 },
            events: { onReady: () => { p.playVideo(); resolve(p); }, onStateChange, onError },
          });
          setTimeout(() => resolve(p), 8000);
        });
        hint.textContent = 'Startet das Video nicht von selbst, tippe es an.';
      } else {
        player.loadVideoById(id);
        hint.textContent = '';
      }
    }

    function stop() {
      if (!current) return;
      current = null;
      showError('');
      if (fallback) el.querySelector('#ka-player').src = 'about:blank';
      else player?.stopVideo?.();
    }

    function show(R) {
      el.classList.remove('hidden');
      const song = R.current;
      caption.innerHTML = `🎤 <b>${singerNames(song.singers)}</b><span>${esc(song.title)}</span>`;
      if (song.videoId) {
        play(song.id, song.videoId);
      } else {
        stop();
        el.querySelector('#ka-open').href = youtubeSearchUrl(song.title);
        showError('<b>Für diesen Song ist noch kein Video hinterlegt.</b><br>Such ihn auf YouTube und füg den Link unten ein.');
      }
      for (const r of R.reactions) {
        if (r.id <= ka.seenReaction) continue;
        ka.seenReaction = r.id;
        const span = document.createElement('span');
        span.className = 'ka-float';
        span.style.left = `${8 + Math.random() * 84}%`;
        span.innerHTML = `${esc(r.emoji)}<small>${esc(playerName(r.playerId))}</small>`;
        reactions.appendChild(span);
        setTimeout(() => span.remove(), 3200);
      }
    }

    function hide() {
      if (el.classList.contains('hidden')) return;
      el.classList.add('hidden');
      stop();
      if (document.fullscreenElement === el) document.exitFullscreen().catch(() => {});
    }

    el.querySelector('#ka-fullscreen').addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else (el.requestFullscreen?.() || Promise.reject()).catch(() => toast('Vollbild wird hier nicht unterstützt.'));
    });

    return { show, hide };
  })();

  function afterRender() {
    const R = S?.round;
    if (S?.game.id === 'karaoke' && S.phase === 'playing' && S.me.isHost && R?.phase === 'singing') Stage.show(R);
    else Stage.hide();
  }

  // ---------- Einstellungen ----------

  function viewSettings() {
    const s = S.settings;
    const g = s.game;
    return `<div class="card stack">
      <h3>Einstellungen</h3>
      <div class="grid-2" style="gap:12px">
        <label class="field"><span>Lobbyname</span><input id="set-lobbyName" type="text" maxlength="40" value="${esc(s.lobbyName)}"></label>
        <label class="field"><span>Dein Spielername</span><input id="set-myName" type="text" maxlength="24" value="${esc(S.me.name)}"></label>
      </div>
      <div><div class="small muted" style="font-weight:700;margin-bottom:6px">Dein Profilbild</div>${avatarPicker(S.me.avatar, 'hostAvatar')}</div>
      <div>
        <div class="small muted" style="font-weight:700;margin-bottom:6px">Deine Rolle</div>
        <div class="segmented">
          <button data-action="hostPlays" data-value="1" class="${s.hostPlays ? 'on' : ''}">🎤 Singt mit</button>
          <button data-action="hostPlays" data-value="0" class="${!s.hostPlays ? 'on' : ''}">🎩 Nur Bildschirm</button>
        </div>
      </div>
      <div class="grid-2" style="gap:12px">
        <div>
          <div class="small muted" style="font-weight:700;margin-bottom:6px">Bewertung nach jedem Song</div>
          <div class="segmented">
            <button data-action="kaSetting" data-key="rating" data-value="1" class="${g.rating ? 'on' : ''}">⭐ 1–5 Sterne</button>
            <button data-action="kaSetting" data-key="rating" data-value="0" class="${!g.rating ? 'on' : ''}">Nur Spaß</button>
          </div>
        </div>
        <div>
          <div class="small muted" style="font-weight:700;margin-bottom:6px">Reihenfolge</div>
          <div class="segmented">
            <button data-action="kaSetting" data-key="fairOrder" data-value="1" class="${g.fairOrder ? 'on' : ''}">🔁 Reihum</button>
            <button data-action="kaSetting" data-key="fairOrder" data-value="0" class="${!g.fairOrder ? 'on' : ''}">Wer zuerst kommt</button>
          </div>
        </div>
      </div>
      <label class="field"><span>Songs pro Person in der Warteschlange</span>
        <select id="ka-max">${[1, 2, 3, 4, 5, 10].map((n) => `<option value="${n}" ${n === g.maxQueued ? 'selected' : ''}>${n}</option>`).join('')}</select>
      </label>
      <div class="small muted">So geht's: Dieses Gerät ist die Bühne. Am besten an den Fernseher anschließen oder auf den Beamer streamen. Alle tragen auf dem Handy Songs ein, gesungen wird zu Karaoke-Videos von YouTube mit eingeblendetem Text. Bei „Reihum“ kommt immer zuerst dran, wer am wenigsten gesungen hat. Während des Songs schicken die anderen Applaus, danach vergeben sie Sterne.${S.game.search ? '' : ' Songs sucht ihr auf YouTube und fügt den Link ein.'}</div>
    </div>`;
  }

  // ---------- Song eintragen ----------

  function viewAddForm(R) {
    const d = ka.draft;
    const others = S.players.filter((p) => p.id !== (d.singer || S.me.id) && !(p.isHost && !S.settings.hostPlays));
    const singers = S.players.filter((p) => !(p.isHost && !S.settings.hostPlays));
    const id = videoId(d.url);
    const full = !S.me.isHost && R.myQueued >= S.settings.game.maxQueued;
    if (full) {
      return `<div class="card center muted">Du hast ${R.myQueued} ${R.myQueued === 1 ? 'Song' : 'Songs'} in der Warteschlange. Sobald einer gesungen ist, kannst du den nächsten eintragen.</div>`;
    }
    const results = ka.results ? `<div class="ka-results">${ka.results.length ? ka.results.map((r, i) => `
        <button type="button" class="ka-result ${r.videoId === id ? 'on' : ''}" data-action="kaPick" data-i="${i}">${thumb(r.videoId)}<span><b>${esc(r.title)}</b><small class="muted">${esc(r.channel)}</small></span></button>`).join('') : '<div class="small muted">Nichts gefunden.</div>'}</div>` : '';
    return `<form id="ka-add-form" class="card stack">
      <h3 style="margin:0">🎶 Song eintragen</h3>
      <div class="row" style="align-items:stretch">
        <input id="ka-title" type="text" maxlength="80" placeholder="Interpret – Titel, z. B. ABBA – Mamma Mia" value="${esc(d.title)}" autocomplete="off" style="flex:1;min-width:200px">
        <button class="btn" type="button" data-action="kaSearch" ${ka.searching ? 'disabled' : ''}>🔎 ${S.game.search ? (ka.searching ? 'Suche …' : 'Suchen') : 'Auf YouTube suchen'}</button>
      </div>
      ${results}
      <div class="row" style="align-items:center">
        <span id="ka-url-thumb">${thumb(id, 'sm')}</span>
        <input id="ka-url" type="text" inputmode="url" placeholder="YouTube-Link (optional)" value="${esc(d.url)}" autocomplete="off" autocapitalize="off" spellcheck="false" style="flex:1;min-width:200px">
      </div>
      <div class="small ${d.url && !id ? '' : 'hidden'}" id="ka-url-bad" style="color:var(--bad)">Das sieht nicht nach einem YouTube-Link aus.</div>
      ${S.game.search ? '' : '<div class="small muted">Such auf YouTube nach dem Song mit „Karaoke“, tippe auf Teilen → Link kopieren und füg ihn hier ein. Ohne Link sucht der Host das Video, wenn du dran bist.</div>'}
      <div class="grid-2" style="gap:12px">
        ${S.me.isHost ? `<label class="field"><span>Wer singt?</span><select id="ka-singer">${singers.map((p) => `<option value="${p.id}" ${p.id === (d.singer || (S.settings.hostPlays ? S.me.id : singers[0]?.id)) ? 'selected' : ''}>${esc(p.name)}${p.id === S.me.id ? ' (du)' : ''}</option>`).join('')}</select></label>` : ''}
        <label class="field"><span>Duett mit (optional)</span><select id="ka-partner"><option value="">Allein</option>${others.map((p) => `<option value="${p.id}" ${p.id === d.partner ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      </div>
      <button class="btn primary" type="submit">+ In die Warteschlange</button>
    </form>`;
  }

  async function search() {
    const text = ka.draft.title.trim();
    if (!text) return toast('Gib zuerst Interpret und Titel ein.');
    if (!S.game.search) {
      window.open(youtubeSearchUrl(text), '_blank', 'noopener');
      return;
    }
    ka.searching = true;
    render();
    try {
      const res = await fetch(`/api/karaoke/search?q=${encodeURIComponent(text)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Die Suche hat nicht geklappt.');
      ka.results = data;
    } catch (err) {
      toast(err.message);
    }
    ka.searching = false;
    render();
  }

  // Beim Einfügen eines Links den Videotitel als Songname vorschlagen
  async function lookup(id) {
    if (!id || ka.lookedUp === id || ka.draft.title.trim()) return;
    ka.lookedUp = id;
    try {
      const res = await fetch(`/api/karaoke/video/${id}`);
      if (!res.ok) return;
      const { title } = await res.json();
      if (title && !ka.draft.title.trim() && videoId(ka.draft.url) === id) {
        ka.draft.title = title.replace(/\s*[([](?:karaoke|lyrics|instrumental)[^)\]]*[)\]]\s*/gi, ' ').trim().slice(0, 80);
        render();
      }
    } catch { /* Titel bleibt leer */ }
  }

  // ---------- Warteschlange ----------

  function viewSongRow(song, i, R) {
    const host = S.me.isHost;
    const buttons = [
      host && R.phase !== 'singing' ? `<button class="btn small primary" data-action="kaPlay" data-song="${song.id}" title="Jetzt singen">▶︎</button>` : '',
      host && i > 0 ? `<button class="btn small" data-action="kaBump" data-song="${song.id}" title="Als Nächstes">⬆︎</button>` : '',
      song.editable && !song.videoId ? `<button class="btn small" data-action="kaLink" data-song="${song.id}" title="Link hinzufügen">🔗</button>` : '',
      song.editable ? `<button class="btn small ghost" data-action="kaRemove" data-song="${song.id}" title="Entfernen">✕</button>` : '',
    ].join('');
    return `<div class="ka-song ${song.mine ? 'mine' : ''}">
      <span class="ka-pos">${i + 1}</span>
      ${thumb(song.videoId)}
      <span class="ka-song-text"><b>${esc(song.title)}</b><span class="small muted">${song.singers.map((id) => avatarHtml(playerById(id), 'sm')).join('')} ${singerNames(song.singers)}${song.videoId ? '' : ' · <span style="color:var(--accent)">ohne Video</span>'}</span></span>
      <span class="row" style="gap:6px;flex-wrap:nowrap">${buttons}</span>
    </div>`;
  }

  function viewQueue(R, { limit } = {}) {
    if (!R.queue.length) return '<div class="card center muted">Die Warteschlange ist leer. Tragt Songs ein! 🎶</div>';
    const list = limit ? R.queue.slice(0, limit) : R.queue;
    const more = R.queue.length - list.length;
    return `<div class="card stack">
      <h3 style="margin:0">Warteschlange (${R.queue.length})</h3>
      <div class="ka-queue">${list.map((s, i) => viewSongRow(s, i, R)).join('')}</div>
      ${more > 0 ? `<div class="small muted">… und ${more} weitere</div>` : ''}
    </div>`;
  }

  function viewLastResult(R) {
    const r = R.lastResult;
    if (!r) return '';
    const rating = r.average !== null && r.votes
      ? `<div class="ka-score">${stars(r.average)} <b>${fmtAvg(r.average)}</b> <span class="small muted">aus ${r.votes} ${r.votes === 1 ? 'Stimme' : 'Stimmen'}</span></div>`
      : '';
    return `<div class="ka-result-card">
      <div class="small muted">Zuletzt gesungen</div>
      <div><b>${singerNames(r.singers)}</b> mit „${esc(r.title)}“</div>
      ${rating || '<div>👏👏👏</div>'}
    </div>`;
  }

  function viewUpNext(R) {
    const song = R.queue[0];
    if (!song) return '';
    const mine = song.singers.includes(S.me.id);
    return `<div class="ka-next ${mine ? 'mine' : ''}">
      ${thumb(song.videoId)}
      <div><div class="small muted">Als Nächstes</div><div class="big">${singerNames(song.singers)}</div><div>${esc(song.title)}</div>
      ${mine ? '<div style="color:var(--accent);font-weight:800;margin-top:4px">Das bist du! Mach dich bereit 🎤</div>' : ''}</div>
    </div>`;
  }

  // ---------- Während und nach dem Song ----------

  function viewStarPicker(R, big) {
    return `<div class="ka-stars ${big ? 'big' : ''}">${[1, 2, 3, 4, 5].map((n) => `<button data-action="kaRate" data-n="${n}" class="${R.myRating && n <= R.myRating ? 'on' : ''}" aria-label="${n} Sterne">★</button>`).join('')}</div>`;
  }

  function viewRaters(R) {
    if (!S.settings.game.rating || !R.raters.length) return '';
    const done = R.raters.filter((r) => r.done).length;
    return `<div class="status-bar"><div class="status-team" style="--team:var(--accent)"><b class="small">Bewertet</b>
      ${R.raters.map((r) => avatarHtml(playerById(r.id), `sm ${r.done ? 'voted' : ''}`)).join('')}
      <span class="small muted">${done}/${R.raters.length}</span></div></div>`;
  }

  function viewNowSinging(R) {
    const song = R.current;
    return `<div class="ka-now">
      <div class="small muted">Auf der Bühne</div>
      <div class="ka-now-singers">${song.singers.map((id) => avatarHtml(playerById(id))).join('')}</div>
      <div class="big">${singerNames(song.singers)}</div>
      <div>${esc(song.title)}</div>
    </div>`;
  }

  function viewSinging(R) {
    const song = R.current;
    if (S.me.isHost) {
      return `<div class="stack">
        ${viewNowSinging(R)}
        <form id="ka-video-form" class="row card" style="padding:12px">
          <input id="ka-video-url" type="text" inputmode="url" placeholder="${song.videoId ? 'Anderes Video? YouTube-Link einfügen' : 'YouTube-Link für diesen Song'}" autocomplete="off" style="flex:1;min-width:200px">
          ${song.videoId ? '' : `<a class="btn" href="${esc(youtubeSearchUrl(song.title))}" target="_blank" rel="noopener">🔎 Suchen</a>`}
          <button class="btn primary" type="submit">Abspielen</button>
        </form>
        ${R.canRate ? `<div class="card stack center"><b>Deine Bewertung</b>${viewStarPicker(R)}</div>` : ''}
        ${viewRaters(R)}
        ${viewQueue(R, { limit: 3 })}
      </div>`;
    }
    if (R.isSinger) {
      return `<div class="stack center">
        <div style="font-size:3.5rem">🎤</div>
        <h1 style="font-size:2rem">Du bist dran!</h1>
        <p><b>${esc(song.title)}</b>${song.singers.length > 1 ? ` · Duett mit ${singerNames(song.singers.filter((id) => id !== S.me.id))}` : ''}</p>
        <p class="muted">Den Text siehst du auf dem großen Bildschirm. Viel Spaß!</p>
        <button class="btn big" data-action="kaEnded">✓ Fertig gesungen</button>
      </div>`;
    }
    return `<div class="stack">
      ${viewNowSinging(R)}
      <div class="ka-react">${S.game.reactions.map((e) => `<button data-action="kaReact" data-emoji="${e}">${e}</button>`).join('')}</div>
      ${R.canRate ? `<div class="card stack center"><b>${R.myRating ? 'Deine Bewertung' : 'Schon jetzt bewerten?'}</b>${viewStarPicker(R)}<div class="small muted">Du kannst sie bis zum Ende ändern.</div></div>` : ''}
    </div>`;
  }

  function viewRating(R) {
    const song = R.current;
    let body;
    if (R.canRate) {
      body = `<div class="card stack center"><h2 style="margin:0">Wie war's?</h2>${viewStarPicker(R, true)}
        <div class="small muted">${R.myRating ? 'Danke! Du kannst noch ändern, bis alle bewertet haben.' : 'Tippe auf die Sterne.'}</div></div>`;
    } else if (R.isSinger) {
      body = '<div class="card center"><h2 style="margin:0">Applaus! 👏</h2><p class="muted">Die anderen bewerten gerade deinen Auftritt …</p></div>';
    } else {
      body = '<div class="card center muted">Die Jury bewertet …</div>';
    }
    return `<div class="stack">${viewNowSinging(R)}${body}${viewRaters(R)}</div>`;
  }

  function viewQueuePhase(R) {
    return `<div class="stack">
      ${viewLastResult(R)}
      ${viewUpNext(R)}
      <div class="grid-2">${viewAddForm(R)}${viewQueue(R)}</div>
      ${S.me.isHost ? `<details class="card"><summary>Weitere Sänger einladen</summary><div style="margin-top:12px">${viewShare()}</div></details>` : ''}
    </div>`;
  }

  function viewFinal(R) {
    const medals = ['🥇', '🥈', '🥉'];
    const rated = S.settings.game.rating;
    return `<div class="stack">
      <div class="center"><div style="font-size:3rem">🎤</div><h1>Was für ein Abend!</h1><p class="muted">${R.history.length} ${R.history.length === 1 ? 'Song' : 'Songs'} gesungen</p></div>
      ${R.ranking.length ? `<div class="card stack"><h3 style="margin:0">${rated ? 'Rangliste' : 'Sänger'}</h3>${R.ranking.map((r, i) => `
        <div class="row spread ka-rank"><span class="row" style="gap:8px">${rated && r.average !== null ? `<b style="width:2em">${medals[i] || `${i + 1}.`}</b>` : ''}${avatarHtml(playerById(r.playerId), 'sm')}<b>${esc(playerName(r.playerId))}</b><span class="small muted">${r.songs} ${r.songs === 1 ? 'Song' : 'Songs'}</span></span>
        ${rated ? `<span>${stars(r.average)} <b>${fmtAvg(r.average)}</b></span>` : ''}</div>`).join('')}</div>` : ''}
      ${R.history.length ? `<div class="card stack"><h3 style="margin:0">Alle Songs</h3>${R.history.map((h, i) => `
        <div class="row spread"><span><b>${i + 1}.</b> ${esc(h.title)} <span class="small muted">· ${singerNames(h.singers)}</span></span>${rated ? `<span class="small">${h.average !== null && h.votes ? `${fmtAvg(h.average)} ★` : '–'}</span>` : ''}</div>`).join('')}</div>` : ''}
      ${S.me.isHost ? '' : '<div class="muted center">Der Host kann eine neue Runde starten.</div>'}
    </div>`;
  }

  function view() {
    const R = S.round;
    const body = { queue: viewQueuePhase, singing: viewSinging, rating: viewRating, final: viewFinal }[R.phase](R);
    return `<div>${R.phase === 'final' ? '' : `<div class="q-head"><div class="small muted"><b>🎤 Karaoke</b> · ${R.sungCount} gesungen · ${R.queue.length} in der Warteschlange</div></div>`}${body}</div>`;
  }

  function hostbar() {
    const R = S.round;
    if (R.phase === 'final') return '<button class="btn primary" data-action="toLobby">Neue Runde (zur Lobby)</button>';
    if (R.phase === 'singing') {
      return `<button class="btn" data-action="kaSkip">⏭ Abbrechen</button>
        <button class="btn primary" data-action="kaEnded">✓ Song fertig</button>`;
    }
    if (R.phase === 'rating') return '<button class="btn primary" data-action="kaCloseRating">Bewertung abschließen ▶︎</button>';
    return `${R.sungCount ? '<button class="btn" data-action="kaFinish">🏆 Abschluss</button>' : ''}
      <button class="btn primary" data-action="kaPlay" ${R.queue.length ? '' : 'disabled'}>▶︎ Nächster Song</button>`;
  }

  gameViews.karaoke = { settings: viewSettings, view, hostbar, afterRender };

  Object.assign(actions, {
    kaSetting: (el) => sendHost('settings', { game: { [el.dataset.key]: el.dataset.value === '1' } }),
    kaSearch: () => search(),
    kaPick: (el) => {
      const r = ka.results[Number(el.dataset.i)];
      ka.draft.url = `https://youtu.be/${r.videoId}`;
      ka.draft.title = r.title.slice(0, 80);
      ka.lookedUp = r.videoId;
      render();
    },
    kaPlay: (el) => act('play', { songId: el.dataset.song }),
    kaBump: (el) => act('bump', { songId: el.dataset.song }),
    kaRemove: (el) => { if (confirm('Diesen Song aus der Warteschlange nehmen?')) act('remove', { songId: el.dataset.song }); },
    kaLink: (el) => {
      const url = prompt('YouTube-Link für diesen Song:');
      if (url) act('video', { songId: el.dataset.song, url });
    },
    kaEnded: () => act('ended', { songId: S.round.current?.id }),
    kaSkip: () => { if (confirm('Song abbrechen? Er wird nicht gewertet.')) act('skip'); },
    kaCloseRating: () => act('closeRating'),
    kaFinish: () => { if (confirm('Karaoke-Abend beenden und die Rangliste zeigen?')) act('finish'); },
    kaRate: (el) => act('rate', { stars: Number(el.dataset.n) }),
    kaReact: (el) => act('react', { emoji: el.dataset.emoji }),
  });

  app.addEventListener('input', (e) => {
    if (S?.game.id !== 'karaoke' || !S.round) return;
    if (e.target.id === 'ka-title') ka.draft.title = e.target.value;
    if (e.target.id === 'ka-url') {
      ka.draft.url = e.target.value;
      // Nur die Vorschau austauschen: Ein Neuzeichnen würde den nächsten Klick verschlucken
      const id = videoId(e.target.value);
      document.getElementById('ka-url-thumb').innerHTML = thumb(id, 'sm');
      document.getElementById('ka-url-bad').classList.toggle('hidden', !e.target.value.trim() || !!id);
      if (id) lookup(id);
    }
  });

  app.addEventListener('change', (e) => {
    if (e.target.id === 'ka-max') sendHost('settings', { game: { maxQueued: Number(e.target.value) } });
    else if (e.target.id === 'ka-partner') ka.draft.partner = e.target.value;
    else if (e.target.id === 'ka-singer') {
      ka.draft.singer = e.target.value;
      if (ka.draft.partner === e.target.value) ka.draft.partner = '';
      render();
    }
  });

  app.addEventListener('submit', (e) => {
    if (e.target.id === 'ka-add-form') {
      const d = ka.draft;
      if (!d.title.trim()) return toast('Bitte gib Interpret und Titel an.');
      const singerId = S.me.isHost ? (d.singer || document.getElementById('ka-singer')?.value) : undefined;
      act('add', { title: d.title, url: d.url.trim() || null, partnerId: d.partner || null, singerId }, () => {
        ka.draft = { title: '', url: '', partner: '', singer: d.singer };
        ka.results = null;
        ka.lookedUp = null;
        render();
        toast('Song eingetragen! 🎶', true);
      });
      document.activeElement?.blur?.();
    } else if (e.target.id === 'ka-video-form') {
      const url = document.getElementById('ka-video-url').value;
      if (!videoId(url)) return toast('Das ist kein YouTube-Link.');
      act('video', { songId: S.round.current.id, url });
    }
  });
})();
