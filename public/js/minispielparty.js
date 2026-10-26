// Minispiel Party: Einstellungen, Ablauf (Ansage, Ergebnis, Siegerehrung) und die Bühne für die Minispiele.
// Die Minispiele selbst stehen in minispielparty-games.js.

(() => {
  const ID = 'minispielparty';
  const mp = {
    el: document.createElement('div'), // Bühne, bleibt beim Neuzeichnen erhalten
    key: null,
    ctl: null,
    offset: null, // eigener Uhrabgleich, stabiler als der aus jedem Zustand
    syncKey: null,
    raf: 0,
  };
  mp.el.className = 'mp-stage';
  mp.el.innerHTML = '<div class="mp-game"></div><div class="mp-count hidden"></div>';

  function now() {
    return Date.now() + (mp.offset ?? clockOffset);
  }

  function act(type, data = {}, done) {
    socket.emit('game:action', { type, ...data }, (res) => {
      if (res?.error) toast(res.error);
      done?.(res || {});
    });
  }

  function setGame(patch) {
    sendHost('settings', { game: patch });
  }

  function pname(id) {
    return esc(playerById(id)?.name || 'Jemand');
  }

  function names(ids) {
    const list = ids.map(pname);
    return list.length > 1 ? `${list.slice(0, -1).join(', ')} und ${list[list.length - 1]}` : list[0] || '';
  }

  // Großer Bildschirm: das Host-Gerät, wenn mit Fernseher gespielt wird
  function big(R) {
    return S.me.isHost && R.tv;
  }

  // Uhr mit dem Server abgleichen: einige Pings, der schnellste zählt
  async function syncClock() {
    let best = null;
    for (let i = 0; i < 6; i++) {
      const t0 = Date.now();
      const res = await emitAck(socket, 'game:draw', { op: 'ping' });
      const t1 = Date.now();
      if (!res.t) return;
      const rtt = t1 - t0;
      if (!best || rtt < best.rtt) best = { rtt, offset: res.t + rtt / 2 - t1 };
    }
    // Während eines Minispiels nicht mehr verstellen
    if (best && S?.round?.phase !== 'play') mp.offset = best.offset;
  }

  // ---------- Einstellungen ----------

  function seg(key, value, options) {
    return `<div class="segmented" style="grid-template-columns:repeat(${options.length},1fr)">${options.map(([v, text]) => `<button data-action="mpSetting" data-key="${key}" data-value="${v}" class="${String(value) === String(v) ? 'on' : ''}">${text}</button>`).join('')}</div>`;
  }

  function viewSettings() {
    const s = S.settings;
    const g = s.game;
    const meta = S.game;
    const label = (text) => `<div class="small muted" style="font-weight:700;margin-bottom:6px">${text}</div>`;
    return `<div class="card stack">
      <h3>Einstellungen</h3>
      <div class="grid-2" style="gap:12px">
        <label class="field"><span>Lobbyname</span><input id="set-lobbyName" type="text" maxlength="40" value="${esc(s.lobbyName)}"></label>
        <label class="field"><span>Dein Spielername</span><input id="set-myName" type="text" maxlength="24" value="${esc(S.me.name)}"></label>
      </div>
      <div>${label('Dein Profilbild')}${avatarPicker(S.me.avatar, 'hostAvatar')}</div>
      <div>${label('Fernseher')}${seg('tv', g.tv ? 1 : 0, [[1, '📺 Mit Fernseher'], [0, '📱 Nur Handys']])}
        <div class="small muted" style="margin-top:6px">${g.tv
          ? 'Dieses Gerät ist die Bühne: Ansage, Minispiel und Punkte. Spielst du mit, tippst du am Fernseher mit Maus oder Leertaste, sonst bist du nur Gamemaster und trittst zum Mitspielen zusätzlich mit dem Handy bei.'
          : 'Kein Fernseher: Jedes Handy zeigt das Minispiel selbst, auch dieses Gerät spielt mit.'}</div>
      </div>
      ${g.tv ? `<div>${label('Deine Rolle')}
        <div class="segmented">
          <button data-action="hostPlays" data-value="1" class="${s.hostPlays ? 'on' : ''}">🎮 Spielt mit</button>
          <button data-action="hostPlays" data-value="0" class="${!s.hostPlays ? 'on' : ''}">🎩 Nur Gamemaster</button>
        </div></div>` : ''}
      <div class="grid-2" style="gap:12px">
        <label class="field"><span>Anzahl Minispiele</span>
          <select id="mp-count">${meta.countOptions.map((n) => `<option value="${n}" ${n === g.count ? 'selected' : ''}>${n} Minispiele</option>`).join('')}</select>
        </label>
        <div>${label('Letztes Minispiel zählt doppelt')}${seg('doubleLast', g.doubleLast ? 1 : 0, [[1, 'An'], [0, 'Aus']])}</div>
      </div>
      <div>${label('Punkte')}${seg('scoring', g.scoring, [['behind', '👥 Pro Spieler dahinter'], ['top3', '🥇 3/2/1 für die Besten']])}
        <div class="small muted" style="margin-top:6px">${g.scoring === 'behind'
          ? 'Jeder bekommt so viele Punkte, wie Spieler hinter ihm liegen. Bei sechs Spielern bekommt der Erste 5, der Letzte 0.'
          : 'Nur die ersten drei Plätze bekommen Punkte: 3, 2 und 1.'}</div>
      </div>
      <div>
        <div class="row spread" style="margin-bottom:6px"><span class="small muted" style="font-weight:700">Minispiele (${g.games.length} von ${meta.minigames.length})</span>
          <span class="row"><button class="btn small ghost" data-action="mpAllGames">Alle</button></span></div>
        <div class="mp-pick">${meta.minigames.map((m) => `<button class="mp-pick-one ${g.games.includes(m.id) ? 'on' : ''}" data-action="mpToggleGame" data-id="${m.id}">
          <span class="mp-pick-icon">${m.icon}</span><b>${esc(m.name)}</b><span class="small muted">${esc(m.short)}${m.motion ? ' 📳' : ''}</span></button>`).join('')}</div>
      </div>
      <div class="small muted">So geht's: Eine Partie besteht aus kurzen Minispielen, die alle gleichzeitig auf dem Handy spielen. Vor jedem Minispiel steht kurz da, wie es geht. Nach jedem Minispiel gibt es Punkte, am Ende gewinnt, wer die meisten hat. 📳 = mit Schütteln (geht auch mit Tippen). Für 2 bis 12 Spieler.</div>
    </div>`;
  }

  // ---------- Ansichten ----------

  function head(R) {
    const m = R.current;
    return `<div class="q-head mp-head">
      <div class="small muted"><b>Minispiel ${R.index + 1}/${R.total}</b>${R.double ? ' · <span class="mp-double">⭐ zählt doppelt</span>' : ''}</div>
      <div class="mp-head-name">${m ? `${m.icon} ${esc(m.name)}` : ''}</div>
    </div>`;
  }

  function standingsList(R, { limit = 0, highlight = true } = {}) {
    const rows = limit ? R.standings.slice(0, limit) : R.standings;
    return `<div class="scoreboard">${rows.map((e) => `<div class="score-row ${highlight && e.id === S.me.id ? 'me' : ''}" style="--team:var(--accent)"><span class="rank">${e.place}.</span>
      <span class="name">${avatarHtml(playerById(e.id), 'sm')} ${pname(e.id)}</span><span class="pts">${e.points}</span></div>`).join('')}</div>`;
  }

  function viewIntro(R) {
    const m = R.current;
    const ready = new Set(R.ready);
    const players = R.standings.map((e) => e.id).filter((id) => playerById(id)?.connected);
    const mineReady = ready.has(S.me.id);
    return `<div class="stack">
      ${head(R)}
      <div class="card mp-intro">
        <div class="mp-intro-icon">${m.icon}</div>
        <h1>${esc(m.name)}</h1>
        <p class="mp-howto">${esc(m.howto)}</p>
        ${m.motion ? '<div class="small muted">📳 Mit Schütteln. Wer nicht schütteln kann, tippt.</div>' : ''}
      </div>
      ${R.playing ? `<button class="btn ${mineReady ? 'ghost' : 'primary'} big mp-ready" data-action="mpReady" ${mineReady ? 'disabled' : ''}>${mineReady ? '✅ Bereit! Warte auf die anderen …' : 'Bereit! 👍'}</button>` : ''}
      <div class="mp-ready-list">${players.map((id) => `<span class="mp-chip ${ready.has(id) ? 'done' : ''}">${avatarHtml(playerById(id), 'sm')} ${pname(id)} ${ready.has(id) ? '✅' : '⏳'}</span>`).join('')}</div>
      <div class="small muted center">Sind alle bereit, geht es los. Spätestens in <span class="timer" id="timer"></span></div>
      ${R.index > 0 && big(R) ? `<div class="card stack"><h3 style="margin:0">Zwischenstand</h3>${standingsList(R, { limit: 12, highlight: false })}</div>` : ''}
    </div>`;
  }

  function viewPlay(R) {
    return `<div class="stack">${head(R)}<div id="mp-slot"></div>${!R.inGame && !big(R) ? '<div class="notice center">Du schaust bei diesem Minispiel zu. Beim nächsten bist du dabei!</div>' : ''}</div>`;
  }

  // Gewonnen hat nur, wer vor jemandem liegt
  function won(last, g) {
    return g.place === 1 && !g.none && last.groups.length > 1;
  }

  function resultRows(last) {
    return last.groups.map((g) => g.ids.map((id) => `<div class="score-row ${id === S.me.id ? 'me' : ''}" style="--team:${g.place === 1 ? 'var(--accent)' : 'var(--line)'}">
      <span class="rank">${won(last, g) ? '🏆' : `${g.place}.`}</span>
      <span class="name">${avatarHtml(playerById(id), 'sm')} ${pname(id)}</span>
      <span class="small muted">${esc(g.label)}</span>
      <span class="pts">${g.points ? `+${g.points}` : '0'}</span></div>`).join('')).join('');
  }

  function myLine(R, last) {
    const g = last.groups.find((x) => x.ids.includes(S.me.id));
    if (!g) return '';
    const total = R.standings.find((e) => e.id === S.me.id);
    return `<div class="mp-myline">${won(last, g) ? '🏆 Gewonnen!' : `Platz ${g.place}`} · <b>+${g.points}</b> ${g.points === 1 ? 'Punkt' : 'Punkte'}${total ? ` · gesamt ${total.points} (Platz ${total.place})` : ''}</div>`;
  }

  function viewResult(R) {
    const last = R.last;
    const m = last.game;
    const extra = MinispielGames[m.id]?.result?.(last) || '';
    const nextHint = S.me.isHost ? '' : `<div class="small muted center">${R.lastOne ? 'Gleich kommt die Siegerehrung.' : `Als Nächstes: ${R.next ? `${R.next.icon} ${esc(R.next.name)}` : '…'}. Der Host startet es.`}</div>`;
    return `<div class="stack">
      ${head(R)}
      <div class="center"><h2 style="margin:0">🏁 ${esc(m.name)}: Ergebnis</h2>${last.info ? `<p class="mp-info">${esc(last.info)}</p>` : ''}${last.double ? '<div class="mp-double">⭐ doppelte Punkte</div>' : ''}</div>
      ${!big(R) && R.playing ? myLine(R, last) : ''}
      <div class="grid-2">
        <div class="card stack"><h3 style="margin:0">Dieses Minispiel</h3><div class="scoreboard">${resultRows(last)}</div></div>
        <div class="card stack"><h3 style="margin:0">Gesamtstand</h3>${standingsList(R)}</div>
      </div>
      ${extra}
      ${nextHint}
    </div>`;
  }

  function viewFinal(R) {
    const a = R.awards || {};
    const st = R.standings;
    const podium = [st.filter((e) => e.place === 2), st.filter((e) => e.place === 1), st.filter((e) => e.place === 3)];
    const step = (list, cls, medal) => `<div class="mp-podium-step ${cls}">${list.map((e) => `<div class="mp-podium-who">${avatarHtml(playerById(e.id), cls === 'first' ? 'lg' : '')}<b>${pname(e.id)}</b><span class="small">${e.points} ${e.points === 1 ? 'Punkt' : 'Punkte'}</span></div>`).join('') || ''}<div class="mp-podium-block">${list.length ? medal : ''}</div></div>`;
    const award = (icon, title, ids, text) => `<div class="card mp-award"><div class="icon">${icon}</div><div><b>${title}</b><div>${names(ids)}</div><div class="small muted">${text}</div></div></div>`;
    const awards = [
      a.wins && award('🔥', 'Dauerbrenner', a.wins.ids, `${a.wins.n} ${a.wins.n === 1 ? 'Minispiel' : 'Minispiele'} gewonnen`),
      a.fastest && award('⚡', 'Blitzmerker', [a.fastest.id], `schnellste Reaktion: ${a.fastest.ms} ms`),
      a.bombs && award('💣', 'Bombenpech', a.bombs.ids, `${a.bombs.n}× in der Hand explodiert`),
      a.lasts && award('🐢', 'Pechvogel', a.lasts.ids, `${a.lasts.n}× Letzter`),
    ].filter(Boolean).join('');
    const history = (R.history || []).map((h, i) => {
      const m = S.game.minigames.find((x) => x.id === h.id);
      return `<div class="score-row" style="--team:var(--accent)"><span class="rank">${i + 1}.</span><span class="name">${m.icon} ${esc(m.name)}${h.double ? ' ⭐' : ''}</span>
        <span class="small">${h.skipped ? '<span class="muted">übersprungen</span>' : `🏆 ${names(h.winners)}`}</span></div>`;
    }).join('');
    return `<div class="stack">
      <div class="center"><div style="font-size:3rem">🎪</div><h1>Siegerehrung</h1></div>
      <div class="mp-podium">${step(podium[0], 'second', '🥈')}${step(podium[1], 'first', '🥇')}${step(podium[2], 'third', '🥉')}</div>
      ${awards ? `<div class="mp-awards">${awards}</div>` : ''}
      <div class="grid-2">
        <div class="card stack"><h3 style="margin:0">Endstand</h3>${standingsList(R)}</div>
        <div class="card stack"><h3 style="margin:0">Alle Minispiele</h3><div class="scoreboard">${history}</div></div>
      </div>
      ${S.me.isHost ? '' : '<div class="muted center">Der Host kann eine neue Partie starten.</div>'}
    </div>`;
  }

  function view() {
    const R = S.round;
    const body = { intro: viewIntro, play: viewPlay, result: viewResult, final: viewFinal }[R.phase];
    return `<div class="mp ${big(R) ? 'mp-big' : ''}">${body(R)}</div>`;
  }

  function hostbar() {
    const R = S.round;
    if (R.phase === 'final') return '<button class="btn primary" data-action="toLobby">Neue Partie (zur Lobby)</button>';
    if (R.phase === 'intro') return '<button class="btn ghost" data-action="mpSkip">⏭ Überspringen</button><button class="btn pink" data-action="mpNext">▶︎ Los geht’s</button>';
    if (R.phase === 'play') return '<button class="btn ghost" data-action="mpSkip">⏭ Abbrechen (keine Punkte)</button><button class="btn" data-action="mpNext">🏁 Jetzt werten</button>';
    return `<button class="btn primary" data-action="mpNext">${R.lastOne ? '🏆 Zur Siegerehrung' : 'Nächstes Minispiel ▶︎'}</button>`;
  }

  // ---------- Bühne ----------

  function unmount() {
    mp.ctl?.unmount?.();
    mp.ctl = null;
    mp.key = null;
    mp.el.querySelector('.mp-game').innerHTML = '';
    mp.el.remove();
  }

  function loop() {
    mp.raf = requestAnimationFrame(loop);
    const R = S?.round;
    if (!mp.ctl || R?.phase !== 'play') return;
    const t = now();
    const count = mp.el.querySelector('.mp-count');
    const left = R.startAt - t;
    const text = left > 0 ? String(Math.min(3, Math.ceil(left / 1000))) : left > -700 ? 'Los!' : '';
    if (count.dataset.v !== text) {
      count.dataset.v = text;
      count.textContent = text;
      count.classList.toggle('hidden', !text);
    }
    try {
      mp.ctl.frame?.(t);
    } catch (err) {
      console.error(err);
    }
  }

  function mount(R) {
    const mod = MinispielGames[R.current.id];
    if (!mod) return;
    mp.key = R.playId;
    const c = {
      round: () => S.round,
      game: () => S.round.game,
      big: big(R),
      play: Boolean(R.inGame),
      now,
      mine: () => S.me.id,
      move: (m, done) => act('move', { move: m }, done),
      draw: (data) => socket.emit('game:draw', data, () => {}),
    };
    mp.ctl = mod.mount(mp.el.querySelector('.mp-game'), c);
    mp.el.dataset.game = R.current.id;
    if (!mp.raf) loop();
  }

  function afterRender() {
    if (S?.game.id !== ID || S.phase !== 'playing') {
      if (mp.ctl) unmount();
      return;
    }
    const R = S.round;
    // Uhr vor jedem Minispiel neu abgleichen
    if (R.phase === 'intro' && mp.syncKey !== R.index) {
      mp.syncKey = R.index;
      syncClock();
    }
    if (R.phase !== 'play') {
      if (mp.ctl) unmount();
      return;
    }
    const slot = document.getElementById('mp-slot');
    if (!slot) return;
    if (mp.key !== R.playId) {
      if (mp.ctl) unmount();
      mount(R);
    } else {
      mp.ctl?.update?.(R);
    }
    slot.appendChild(mp.el);
  }

  gameViews[ID] = { settings: viewSettings, view, hostbar, afterRender };

  socket.on('mp-live', (data) => {
    if (S?.game.id !== ID || S.round?.phase !== 'play' || data.seq !== S.round.playId) return;
    mp.ctl?.live?.(data);
  });

  // Am Fernseher: Leertaste statt Tippen
  document.addEventListener('keydown', (e) => {
    if (S?.game.id !== ID || S.round?.phase !== 'play' || !mp.ctl?.tap) return;
    if (e.code !== 'Space' || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
    e.preventDefault();
    if (!e.repeat) mp.ctl.tap();
  });

  // ---------- Eingaben ----------

  Object.assign(actions, {
    mpSetting: (el) => {
      const { key, value } = el.dataset;
      setGame({ [key]: key === 'scoring' ? value : value === '1' });
    },
    mpToggleGame: (el) => {
      const list = S.settings.game.games;
      const id = el.dataset.id;
      const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
      if (!next.length) return toast('Mindestens ein Minispiel muss dabei sein.');
      setGame({ games: next });
    },
    mpAllGames: () => setGame({ games: S.game.minigames.map((m) => m.id) }),
    mpReady: () => {
      // Für Schüttelspiele die Erlaubnis gleich hier holen, das geht nur nach einem Tippen
      if (S.round.current?.motion) MinispielGames.motion.request();
      act('ready');
    },
    mpNext: () => act('next'),
    mpSkip: () => {
      if (confirm('Dieses Minispiel ohne Punkte überspringen?')) act('skip');
    },
  });

  app.addEventListener('change', (e) => {
    if (S?.game.id !== ID) return;
    if (e.target.id === 'mp-count') setGame({ count: Number(e.target.value) });
  });
})();
