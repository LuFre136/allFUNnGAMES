// Sag's anders!: Spielansicht für Fernseher (Host), Erklärer, Ratende und Wächter (nutzt die Helfer aus lobby.js)

(() => {
  const TURN_TIMES = [30, 45, 60, 75, 90, 120, 150, 180];
  const TARGETS = [10, 15, 20, 25, 30, 40, 50];
  const SKIPS = [[99, 'beliebig oft'], [5, 'höchstens 5 pro Zug'], [3, 'höchstens 3 pro Zug'], [1, 'einmal pro Zug'], [0, 'nicht erlaubt']];
  const RESULTS = {
    correct: { icon: '✓', label: 'Richtig' },
    skip: { icon: '⏭', label: 'Übersprungen' },
    buzz: { icon: '🔔', label: 'Buzz' },
    timeout: { icon: '⏱', label: 'Zeit um' },
  };
  const sa = { lastSeq: null, audio: null };

  function act(type, data = {}) {
    socket.emit('game:action', { type, ...data }, (res) => {
      if (res?.error) toast(res.error);
    });
  }

  function setting(key, value) {
    sendHost('settings', { game: { [key]: value } });
  }

  function teamName(id) {
    return teamById(id)?.name || 'Team';
  }

  function teamColor(id) {
    return teamById(id)?.color || 'var(--accent)';
  }

  function playerName(id) {
    return playerById(id)?.name || 'Jemand';
  }

  function timeLabel(t) {
    return t % 60 === 0 ? `${t / 60} ${t === 60 ? 'Minute' : 'Minuten'}` : `${t} Sekunden`;
  }

  function segmented(key, value, options) {
    return `<div class="segmented" style="grid-template-columns:repeat(${options.length},1fr)">${options.map(([v, label]) =>
      `<button data-action="saSetting" data-key="${key}" data-value="${v}" class="${String(value) === String(v) ? 'on' : ''}">${label}</button>`).join('')}</div>`;
  }

  function select(id, value, options) {
    return `<select id="${id}">${options.map(([v, label]) => `<option value="${v}" ${String(v) === String(value) ? 'selected' : ''}>${label}</option>`).join('')}</select>`;
  }

  // ---------- Töne (Web Audio, keine Dateien nötig) ----------

  function audio() {
    if (!sa.audio) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      sa.audio = new Ctx();
    }
    if (sa.audio.state === 'suspended') sa.audio.resume().catch(() => {});
    return sa.audio;
  }

  function tone(freq, duration, { type = 'sine', volume = 0.25, delay = 0, slide = null } = {}) {
    const ctx = audio();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t + duration);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  const sounds = {
    buzz: () => { tone(150, 0.5, { type: 'square', volume: 0.2 }); tone(155, 0.5, { type: 'sawtooth', volume: 0.12 }); },
    correct: () => { tone(880, 0.15, { volume: 0.2 }); tone(1320, 0.25, { volume: 0.2, delay: 0.1 }); },
    skip: () => tone(500, 0.15, { volume: 0.12, slide: 300 }),
    time: () => { tone(196, 1.6, { volume: 0.3 }); tone(392, 1.2, { volume: 0.12 }); },
    start: () => tone(660, 0.2, { volume: 0.15 }),
  };

  function flash(type) {
    const el = document.querySelector('.sa');
    if (!el) return;
    el.classList.remove('flash-buzz', 'flash-correct');
    void el.offsetWidth;
    if (type === 'buzz' || type === 'correct') el.classList.add(`flash-${type}`);
  }

  // Ereignisse vom Server: Ton, Aufblinken, beim Buzz kurz vibrieren
  socket.on('state', () => {
    if (S?.game.id !== 'sagsanders' || !S.round?.event) {
      sa.lastSeq = null;
      return;
    }
    const { seq, type } = S.round.event;
    if (sa.lastSeq !== null && seq !== sa.lastSeq) {
      try { sounds[type]?.(); } catch { /* ohne Ton weiter */ }
      flash(type);
      if (type === 'buzz' && S.round.role === 'explainer') navigator.vibrate?.(300);
    }
    sa.lastSeq = seq;
  });

  // Browser erlauben Töne erst nach einer Berührung
  document.addEventListener('pointerdown', () => { if (S?.game.id === 'sagsanders') audio(); }, { passive: true });

  // ---------- Lobby ----------

  function viewSettings() {
    const s = S.settings;
    const g = s.game;
    const cats = S.game.categories;
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
          <button data-action="hostPlays" data-value="1" class="${s.hostPlays ? 'on' : ''}">🎮 Spielt mit</button>
          <button data-action="hostPlays" data-value="0" class="${!s.hostPlays ? 'on' : ''}">🎩 Nur Gamemaster</button>
        </div>
        <div class="small muted" style="margin-top:6px">Dein Bildschirm ist der Fernseher, dort schaut das ratende Team hin. Er zeigt die Karte deshalb nie. Spielst du mit, rätst du mit deinem Team. Wer als Host auch erklären oder buzzern will, tritt zusätzlich mit dem Handy bei.</div>
      </div>
      <div class="grid-2" style="gap:12px">
        <label class="field"><span>Zeit pro Zug</span>${select('sa-time', g.turnTime, TURN_TIMES.map((t) => [t, timeLabel(t)]))}</label>
        <label class="field"><span>Spielende</span>${select('sa-end', g.endMode, [['rounds', 'nach Runden'], ['score', 'bei Zielpunktzahl']])}</label>
        ${g.endMode === 'rounds'
          ? `<label class="field"><span>Runden (so oft erklärt jeder)</span>${select('sa-rounds', g.rounds, Array.from({ length: 10 }, (_, i) => [i + 1, `${i + 1} ${i ? 'Runden' : 'Runde'}`]))}</label>`
          : `<label class="field"><span>Zielpunktzahl</span>${select('sa-target', g.target, TARGETS.map((t) => [t, `${t} Punkte`]))}</label>`}
        <label class="field"><span>Überspringen</span>${select('sa-skips', g.skipLimit, SKIPS)}</label>
        <label class="field"><span>Überspringen kostet</span>${select('sa-skip-penalty', g.skipPenalty ? 1 : 0, [[0, 'nichts'], [1, '1 Punkt']])}</label>
        <label class="field"><span>Buzz kostet</span>${select('sa-buzz-penalty', g.buzzPenalty ? 1 : 0, [[1, '1 Punkt'], [0, 'nichts']])}</label>
        <label class="field"><span>Verbotene Wörter pro Karte</span>${select('sa-taboo', g.tabooCount, [[5, '5 (normal)'], [4, '4'], [3, '3 (leichter, gut für Kinder)']])}</label>
      </div>
      <div>
        <div class="small muted" style="font-weight:700;margin-bottom:6px">Schwierigkeit</div>
        ${segmented('level', g.level, [['all', '🎯 Gemischt'], ['easy', '🙂 Nur leichte'], ['hard', '🧠 Nur knifflige']])}
      </div>
      <div>
        <div class="row spread" style="margin-bottom:6px"><span class="small muted" style="font-weight:700">Kategorien (${S.availableQuestions} Karten)</span>
          <span class="row"><button class="btn small ghost" data-action="saAllCats">Alle</button><button class="btn small ghost" data-action="saNoCats">Keine</button></span></div>
        <div class="chips">${cats.map((c) => `<button class="chip ${g.categories.includes(c.name) ? 'on' : ''}" data-action="saCat" data-cat="${esc(c.name)}">${esc(c.name)} <small>${c.count}</small></button>`).join('')}</div>
      </div>
      <div>
        <div class="small muted" style="font-weight:700;margin-bottom:6px">Reihenfolge</div>
        ${segmented('orderMode', g.orderMode, [['random', '🎲 Zufällig'], ['lobby', '📋 Wie in der Lobby']])}
        <div class="small muted" style="margin-top:6px">${g.orderMode === 'lobby' ? 'Die Teams kommen in der Reihenfolge von oben nach unten dran, in jedem Team erklärt zuerst, wer zuerst beigetreten ist.' : 'Teams und Erklärer werden zu Beginn ausgelost.'} Vor jedem Zug kannst du den Erklärer noch ändern.</div>
      </div>
      <div class="small muted">So geht's: Die Teams sind abwechselnd dran. Einer erklärt seinem Team Begriffe, ohne die verbotenen Wörter, den Begriff selbst oder Teile davon zu sagen. Keine Gesten, keine Geräusche, keine Übersetzungen, keine Anfangsbuchstaben. Das Team rät laut. Die anderen Teams sehen die Karte auf dem Handy und drücken „Buzz!“, wenn etwas Verbotenes fällt. Jeder erratene Begriff bringt einen Punkt. Jedes Team braucht mindestens zwei Spieler.</div>
    </div>`;
  }

  // ---------- Spiel ----------

  function viewTeams(R) {
    return `<div class="sa-teams">${R.teams.map((t) => {
      const turn = t.id === R.turnTeamId && R.phase !== 'final';
      return `<div class="sa-team ${turn ? 'turn' : ''} ${R.myTeamId === t.id ? 'mine' : ''}" style="--team:${teamColor(t.id)}">
        <div class="sa-team-head"><span class="team-dot"></span><b>${esc(teamName(t.id))}</b></div>
        <span class="num">${t.score}</span>
      </div>`;
    }).join('')}</div>`;
  }

  function viewCounts(R) {
    const c = R.counts;
    return `<div class="sa-counts">
      <span class="ok">✓ ${c.correct}</span>
      <span>⏭ ${c.skip}</span>
      <span class="bad">🔔 ${c.buzz}</span>
    </div>`;
  }

  function viewCard(card) {
    return `<div class="sa-card">
      <div class="sa-cat small">${esc(card.category)}</div>
      <div class="sa-word">${esc(card.word)}</div>
      <ul class="sa-taboo">${card.taboo.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    </div>`;
  }

  function viewWho(R) {
    const ex = playerById(R.explainerId);
    return `<div class="sa-who" style="--team:${teamColor(R.turnTeamId)}">
      ${ex ? avatarHtml(ex, 'lg') : ''}
      <div><div class="small muted">${esc(teamName(R.turnTeamId))} ist dran</div>
      <div class="sa-who-name">${ex ? `${esc(ex.name)} erklärt` : 'Niemand kann erklären'}${ex && !R.explainerOnline ? ' <span class="sa-offline">offline</span>' : ''}</div></div>
    </div>`;
  }

  function viewReady(R) {
    const me = R.role;
    let body;
    if (me === 'explainer') {
      body = `<div class="stack center">
        <div class="sa-big">Du erklärst!</div>
        <div class="muted">Halte das Handy so, dass dein Team die Karte nicht sieht. Die Sanduhr startet, sobald du tippst.</div>
        <button class="btn primary big sa-go" data-action="saGo">▶︎ Los!</button>
      </div>`;
    } else if (me === 'guard') {
      body = '<div class="center muted">Ihr seid die Wächter: Ihr seht gleich die Karte. Fällt ein verbotenes Wort, drückt „Buzz!“.</div>';
    } else if (me === 'guesser') {
      body = `<div class="center muted">Gleich geht's los. ${esc(playerName(R.explainerId))} erklärt, ihr ratet laut.</div>`;
    } else {
      body = `<div class="center muted">Warte, bis ${esc(playerName(R.explainerId))} auf „Los!“ tippt …</div>`;
    }
    return `${viewWho(R)}<div class="card">${body}</div>${viewHostTools(R)}`;
  }

  function viewExplain(R) {
    const me = R.role;
    const timer = `<div class="sa-timer-wrap"><span class="timer sa-timer" id="timer"></span></div>`;
    const paused = R.paused
      ? `<div class="notice">⏸ ${esc(R.notice || 'Pause.')}${me === 'explainer' || S.me.isHost ? ' <button class="btn small primary" data-action="saResume">▶︎ Weiter</button>' : ''}</div>`
      : '';
    let body;
    if (me === 'explainer') {
      const skipLabel = R.skipsLeft === null ? 'Überspringen' : R.skipsLeft ? `Überspringen (${R.skipsLeft})` : 'Überspringen (keins mehr)';
      body = `${viewCard(R.card)}
        <div class="sa-actions">
          <button class="btn big sa-skip" data-action="saSkip" ${R.skipsLeft === 0 || R.paused ? 'disabled' : ''}>⏭ ${skipLabel}</button>
          <button class="btn big sa-correct" data-action="saCorrect" ${R.paused ? 'disabled' : ''}>✓ Richtig</button>
        </div>
        ${R.canUndo ? '<div class="center"><button class="btn small ghost" data-action="saUndo">↶ Letzte Karte zurück</button></div>' : ''}`;
    } else if (me === 'guard') {
      body = `${viewCard(R.card)}
        <button class="sa-buzz" data-action="saBuzz" data-card="${R.cardNo}" ${R.paused ? 'disabled' : ''}>BUZZ!</button>
        <div class="small muted center">Fällt ein verbotenes Wort oder der Begriff selbst, drück den Knopf.</div>`;
    } else if (me === 'guesser') {
      body = `<div class="card center"><div class="sa-big">Rate laut!</div><div class="muted">${esc(playerName(R.explainerId))} erklärt euch die Begriffe.</div></div>`;
    } else {
      body = `<div class="card center muted">${esc(teamName(R.turnTeamId))} rät, die anderen Teams passen auf.</div>`;
    }
    return `${viewWho(R)}${timer}${viewCounts(R)}${paused}${body}${viewHostTools(R)}`;
  }

  function viewReview(R) {
    const host = S.me.isHost;
    const rows = R.results.map((r, i) => {
      const res = RESULTS[r.result];
      const by = r.result === 'buzz' && r.by ? ` von ${esc(playerName(r.by))}` : '';
      const controls = host
        ? `<span class="toggle sa-toggle">${['correct', 'skip', 'buzz'].map((k) => `<button class="${r.result === k ? `on ${k}` : ''}" data-action="saResult" data-i="${i}" data-result="${k}" title="${RESULTS[k].label}">${RESULTS[k].icon}</button>`).join('')}</span>`
        : `<span class="sa-res ${r.result}">${res.icon} ${res.label}${by}</span>`;
      return `<div class="sa-row ${r.result}">
        <div class="sa-row-word"><b>${esc(r.word)}</b><span class="small muted">${r.taboo.map(esc).join(' · ')}</span>${host && by ? `<span class="small" style="color:var(--bad)">Buzz${by}</span>` : ''}</div>
        ${controls}
      </div>`;
    }).join('');
    const pts = R.turnScore;
    return `${viewWho(R)}
      <div class="sa-turn-score" style="--team:${teamColor(R.turnTeamId)}">
        <div class="small muted">Dieser Zug</div><div class="num">${pts > 0 ? '+' : ''}${pts}</div>
        ${viewCounts(R)}
      </div>
      ${R.notice ? `<div class="notice">${esc(R.notice)}</div>` : ''}
      ${host && R.results.length ? '<div class="small" style="color:var(--accent)">Stimmt etwas nicht? Tippe bei einer Karte auf ✓, ⏭ oder 🔔, um das Ergebnis zu ändern. Ein Begriff, der genau beim Gong noch gerufen wurde, kann so auch zählen.</div>' : ''}
      <div class="sa-list">${rows || '<div class="muted center">In diesem Zug gab es keine Karte.</div>'}</div>`;
  }

  function viewFinal(R) {
    const ranked = R.teams.slice().sort((a, b) => b.score - a.score);
    const tie = ranked[1] && ranked[1].score === ranked[0].score;
    const top = [ranked[1], ranked[0], ranked[2]].filter(Boolean);
    const heights = { 0: 140, 1: 100, 2: 70 };
    const a = R.awards;
    const award = (icon, title, entry, unit) => entry
      ? `<div class="sa-award">${avatarHtml(playerById(entry.playerId))}<div><div class="small muted">${icon} ${title}</div><b>${esc(playerName(entry.playerId))}</b> <span class="muted">${entry.value} ${unit}</span></div></div>`
      : '';
    return `<div class="center"><div style="font-size:3rem">🏆</div><h1>${tie ? 'Unentschieden!' : `${esc(teamName(ranked[0].id))} gewinnt!`}</h1></div>
      <div class="podium">${top.map((t) => {
        const place = ranked.filter((o) => o.score > t.score).length;
        return `<div class="step"><b>${esc(teamName(t.id))}</b><div class="small muted">${t.score} Punkte</div>
          <div class="block" style="--team:${teamColor(t.id)};height:${heights[place] ?? 70}px">${place + 1}</div></div>`;
      }).join('')}</div>
      <div class="sa-awards">
        ${award('🗣️', 'Bester Zug', a.bestTurn, a.bestTurn?.value === 1 ? 'Begriff in einem Zug' : 'Begriffe in einem Zug')}
        ${award('⭐', 'Meiste Begriffe erklärt', a.mostCorrect, 'insgesamt')}
        ${award('🔔', 'Aufmerksamster Wächter', a.topGuard, a.topGuard?.value === 1 ? 'Buzz' : 'Buzzes')}
      </div>
      ${S.me.isHost ? '' : '<div class="muted center">Der Host kann eine neue Runde starten.</div>'}`;
  }

  function viewHostTools(R) {
    if (!S.me.isHost) return '';
    if (R.phase !== 'ready' && !(R.phase === 'explain' && R.paused)) return '';
    const options = R.candidates.map((id) => playerById(id)).filter(Boolean);
    if (!options.length) return '';
    return `<details class="card" ${R.explainerOnline ? '' : 'open'}><summary>Erklärer ändern</summary>
      <label class="field" style="margin-top:10px"><span>${esc(teamName(R.turnTeamId))}</span><select id="sa-explainer">${options.map((p) =>
        `<option value="${p.id}" ${p.id === R.explainerId ? 'selected' : ''}>${esc(p.name)}${p.connected ? '' : ' (offline)'}</option>`).join('')}</select></label>
    </details>`;
  }

  function view() {
    const R = S.round;
    const roleText = {
      explainer: '🗣️ Du erklärst',
      guesser: '🤔 Du rätst mit',
      guard: '🔔 Du passt auf',
      spectator: S.me.isHost ? '📺 Fernseher' : '👀 Du schaust zu',
    }[R.role];
    const progress = R.endMode === 'rounds' ? `Zug ${Math.min(R.turnNo, R.totalTurns)} von ${R.totalTurns}` : `Ziel: ${R.target} Punkte`;
    let main;
    if (R.phase === 'ready') main = viewReady(R);
    else if (R.phase === 'explain') main = viewExplain(R);
    else if (R.phase === 'review') main = viewReview(R);
    else main = viewFinal(R);
    return `<div class="stack sa sa-${R.phase} sa-role-${R.role}">
      <div class="q-head"><div class="small muted"><b>${progress}</b> · ${roleText}${R.myTeamId ? ` bei ${esc(teamName(R.myTeamId))}` : ''}</div></div>
      ${viewTeams(R)}
      ${main}
    </div>`;
  }

  function hostbar() {
    const R = S.round;
    if (R.phase === 'final') return '<button class="btn primary" data-action="toLobby">Neue Runde (zur Lobby)</button>';
    if (R.phase === 'review') {
      const last = R.endMode === 'rounds' && R.turnNo >= R.totalTurns;
      return `<button class="btn primary" data-action="saNext">${last ? '🏆 Zum Endergebnis' : 'Nächstes Team ▶︎'}</button>`;
    }
    if (R.phase === 'ready') {
      return `<button class="btn" data-action="saEndTurn">⏭ Zug überspringen</button><button class="btn primary" data-action="saGo">▶︎ Los!</button>`;
    }
    return `<button class="btn" data-action="${R.paused ? 'saResume' : 'saPause'}">${R.paused ? '▶︎ Weiter' : '⏸ Pause'}</button>
      <button class="btn pink" data-action="saEndTurn">⏹ Zug beenden</button>`;
  }

  gameViews.sagsanders = { settings: viewSettings, view, hostbar };

  Object.assign(actions, {
    saSetting: (el) => setting(el.dataset.key, el.dataset.value),
    saCat: (el) => {
      const cats = new Set(S.settings.game.categories);
      if (cats.has(el.dataset.cat)) cats.delete(el.dataset.cat);
      else cats.add(el.dataset.cat);
      setting('categories', [...cats]);
    },
    saAllCats: () => setting('categories', S.game.categories.map((c) => c.name)),
    saNoCats: () => setting('categories', []),
    saGo: () => act('go'),
    saCorrect: () => act('correct'),
    saSkip: () => act('skip'),
    saUndo: () => act('undo'),
    saBuzz: (el) => act('buzz', { cardNo: Number(el.dataset.card) }),
    saPause: () => act('pause'),
    saResume: () => act('resume'),
    saEndTurn: () => {
      const text = S.round.phase === 'ready' ? 'Diesen Zug überspringen? Das Team bekommt dafür keine Punkte.' : 'Den Zug jetzt beenden?';
      if (confirm(text)) act('endTurn');
    },
    saResult: (el) => act('setResult', { index: Number(el.dataset.i), result: el.dataset.result }),
    saNext: () => act('next'),
  });

  app.addEventListener('change', (e) => {
    if (S?.game.id !== 'sagsanders') return;
    const id = e.target.id;
    const v = e.target.value;
    if (id === 'sa-time') setting('turnTime', Number(v));
    else if (id === 'sa-end') setting('endMode', v);
    else if (id === 'sa-rounds') setting('rounds', Number(v));
    else if (id === 'sa-target') setting('target', Number(v));
    else if (id === 'sa-skips') setting('skipLimit', Number(v));
    else if (id === 'sa-skip-penalty') setting('skipPenalty', v === '1');
    else if (id === 'sa-buzz-penalty') setting('buzzPenalty', v === '1');
    else if (id === 'sa-taboo') setting('tabooCount', Number(v));
    else if (id === 'sa-explainer') act('setExplainer', { playerId: v });
  });
})();
