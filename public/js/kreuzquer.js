// Kreuz & Quer: Spielansicht für Host und Handys (nutzt die Helfer aus lobby.js)

(() => {
  const COLORS = ['red', 'yellow', 'green', 'blue'];
  const COLOR_NAMES = { red: 'Rot', yellow: 'Gelb', green: 'Grün', blue: 'Blau', white1: 'Weiß', white2: 'Weiß' };
  const DICE = ['white1', 'white2', ...COLORS];
  const TIMES = [0, 15, 20, 30, 45, 60, 90, 120];
  // Augen auf einem 3×3-Raster
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const kq = { seenRoll: 0, rolling: false, openSheet: null };

  function act(type, data = {}) {
    socket.emit('game:action', { type, ...data }, (res) => {
      if (res?.error) toast(res.error);
    });
  }

  function playerName(id) {
    return playerById(id)?.name || 'Jemand';
  }

  function me(R) {
    return R.players.find((p) => p.id === S.me.id) || null;
  }

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
          <button data-action="hostPlays" data-value="1" class="${s.hostPlays ? 'on' : ''}">🎮 Spielt mit</button>
          <button data-action="hostPlays" data-value="0" class="${!s.hostPlays ? 'on' : ''}">🎩 Nur Gamemaster</button>
        </div>
      </div>
      <div class="grid-2" style="gap:12px">
        <label class="field"><span>Bedenkzeit pro Schritt</span>
          <select id="kq-time">${TIMES.map((t) => `<option value="${t}" ${t === g.timeLimit ? 'selected' : ''}>${t ? `${t} Sekunden` : 'Kein Zeitlimit'}</option>`).join('')}</select>
        </label>
        <label class="field"><span>Partien hintereinander</span>
          <input id="kq-games" type="number" min="1" max="5" value="${g.games}" inputmode="numeric">
        </label>
      </div>
      <div class="grid-2" style="gap:12px">
        <div>
          <div class="small muted" style="font-weight:700;margin-bottom:6px">Wer fängt an</div>
          <div class="segmented">
            <button data-action="kqSetting" data-key="starter" data-value="random" class="${g.starter === 'random' ? 'on' : ''}">🎲 Zufällig</button>
            <button data-action="kqSetting" data-key="starter" data-value="host" class="${g.starter === 'host' ? 'on' : ''}">👑 Host</button>
          </div>
        </div>
        <div>
          <div class="small muted" style="font-weight:700;margin-bottom:6px">Hilfen</div>
          <div class="segmented">
            <button data-action="kqSetting" data-key="hints" data-value="1" class="${g.hints ? 'on' : ''}">💡 An</button>
            <button data-action="kqSetting" data-key="hints" data-value="0" class="${!g.hints ? 'on' : ''}">Aus</button>
          </div>
        </div>
      </div>
      <div class="small muted">So geht's: Reihum würfelt einer mit zwei weißen und vier farbigen Würfeln. Die Summe der weißen Würfel darf jeder in einer Reihe ankreuzen. Danach darf der Würfelnde noch einen weißen mit einem farbigen Würfel kombinieren. Angekreuzt wird immer von links nach rechts, übersprungene Felder sind verloren. Kreuzt der Würfelnde gar nichts an, gibt es einen Fehlwurf (−5). Das letzte Feld einer Reihe gibt es erst ab fünf Kreuzen, dann ist die Reihe für alle geschlossen. Schluss ist bei vier Fehlwürfen oder zwei geschlossenen Reihen. Mit „Hilfen“ leuchten die erlaubten Felder auf.</div>
    </div>`;
  }

  function dieHtml(name, value, small = false) {
    if (value === null || value === undefined) return `<div class="kq-die ${name.startsWith('white') ? 'white' : name} gone ${small ? 'sm' : ''}"></div>`;
    const pips = PIPS[value] || [];
    return `<div class="kq-die ${name.startsWith('white') ? 'white' : name} ${kq.rolling ? 'rolling' : ''} ${small ? 'sm' : ''}" title="${COLOR_NAMES[name]} ${value}">
      ${Array.from({ length: 9 }, (_, i) => `<span class="${pips.includes(i) ? 'pip' : ''}"></span>`).join('')}</div>`;
  }

  function viewDice(R) {
    if (!R.dice) return '<div class="kq-dice muted">Noch nicht gewürfelt</div>';
    return `<div class="kq-dice">${DICE.map((d) => dieHtml(d, R.dice[d])).join('')}</div>`;
  }

  // Index des letzten Kreuzes in der Reihe
  function lastIndex(R, sheet, color) {
    const marks = sheet.rows[color];
    return marks.length ? R.rows[color].indexOf(marks[marks.length - 1]) : -1;
  }

  function skipped(R, sheet, { color, number }) {
    return R.rows[color].indexOf(number) - lastIndex(R, sheet, color) - 1;
  }

  function viewSheet(R, p, { interactive }) {
    const pending = p.pending;
    const rows = COLORS.map((color) => {
      const last = lastIndex(R, p, color);
      const closed = R.closed.includes(color);
      const cells = R.rows[color].map((n, i) => {
        const marked = p.rows[color].includes(n);
        const isPending = pending && pending.color === color && pending.number === n;
        const option = interactive && R.hints && R.options.some((o) => o.color === color && o.number === n);
        const free = interactive && !R.hints && !marked && i > last && !closed;
        const lost = !marked && i < last;
        const cls = [marked ? 'marked' : '', isPending ? 'pending' : '', option ? 'opt' : '', lost ? 'lost' : '', i === R.rows[color].length - 1 ? 'last' : ''].join(' ');
        const clickable = isPending || option || free;
        return `<button class="kq-cell ${cls}" ${clickable ? `data-action="kqMark" data-color="${color}" data-n="${n}"` : 'disabled'}>${n}</button>`;
      }).join('');
      const lock = `<span class="kq-lock ${p.locks[color] ? 'marked' : ''} ${closed ? 'closed' : ''}" title="${closed ? 'Reihe geschlossen' : 'Schloss'}">${closed || p.locks[color] ? '🔒' : '🔓'}</span>`;
      return `<div class="kq-row ${color} ${closed ? 'is-closed' : ''}">${cells}${lock}</div>`;
    }).join('');
    const pen = Array.from({ length: 4 }, (_, i) => `<span class="kq-pen ${i < p.penalties ? 'on' : ''}">${i < p.penalties ? '✕' : ''}</span>`).join('');
    const sc = p.score;
    return `<div class="kq-sheet">
      ${rows}
      <div class="kq-foot">
        <span class="small muted">Fehlwürfe</span>${pen}
        <span class="kq-sum small">${COLORS.map((c) => `<b class="kq-chip ${c}">${sc.rows[c]}</b>`).join('+')}${sc.penalty ? ` − ${sc.penalty}` : ''} = <b>${sc.total}</b></span>
      </div>
    </div>`;
  }

  function stepHint(R) {
    const active = esc(playerName(R.activeId));
    if (R.phase === 'roll') return R.isActive ? 'Du bist dran!' : `${active} würfelt gleich …`;
    if (R.phase === 'white') {
      const sum = R.dice.white1 + R.dice.white2;
      return `Weiße Summe <b>${sum}</b>: Alle dürfen sie in einer Reihe ankreuzen.`;
    }
    if (R.phase === 'color') {
      return R.isActive ? 'Kombiniere einen weißen mit einem farbigen Würfel.' : `${active} kombiniert noch einen weißen mit einem farbigen Würfel.`;
    }
    return '';
  }

  function viewActions(R) {
    const mine = me(R);
    if (R.phase === 'roll') {
      return R.isActive ? '<button class="btn primary big kq-roll" data-action="kqRoll">🎲 Würfeln</button>' : '';
    }
    if (!R.canAct) {
      if (R.phase === 'white' && mine) {
        const waiting = R.players.filter((p) => !p.done).map((p) => p.id);
        return `<div class="small muted center">✓ Fertig. Warte auf ${avatarStack(waiting)}</div>`;
      }
      return '';
    }
    const pending = mine?.pending;
    let info = '';
    if (pending) {
      const lost = skipped(R, mine, pending);
      const lock = pending.number === R.rows[pending.color][R.rows[pending.color].length - 1];
      info = `Du kreuzt <b class="kq-chip ${pending.color}">${COLOR_NAMES[pending.color]} ${pending.number}</b> an${lock ? ' und schließt die Reihe 🔒' : ''}.`;
      if (R.hints && lost > 0) info += ` <span class="kq-warn">Dabei ${lost === 1 ? 'verfällt 1 Feld' : `verfallen ${lost} Felder`}.</span>`;
    } else if (R.phase === 'color' && !R.usedThisTurn) {
      info = R.hints && !R.options.length
        ? '<span class="kq-warn">Keine Kombination passt. Du bekommst einen Fehlwurf.</span>'
        : '<span class="kq-warn">Kreuzt du nichts an, gibt es einen Fehlwurf.</span>';
    } else {
      info = R.hints && !R.options.length ? 'Kein passendes Feld frei.' : 'Tippe auf ein Feld oder passe.';
    }
    return `<div class="kq-actions">
      <div class="small">${info}</div>
      <div class="row" style="justify-content:center">
        ${pending ? '<button class="btn" data-action="kqUnmark">↩︎ Zurück</button>' : ''}
        <button class="btn primary" data-action="kqDone">${pending ? '✓ Fertig' : 'Passen'}</button>
      </div>
    </div>`;
  }

  function viewEvents(R) {
    return R.events.map((e) => {
      const name = esc(playerName(e.playerId));
      if (e.type === 'lock') return `<div class="notice">🔒 ${name} hat ${COLOR_NAMES[e.color]} geschlossen. Der Würfel ist raus.</div>`;
      if (e.type === 'penalty') return `<div class="notice">✕ ${name} bekommt einen Fehlwurf.</div>`;
      return '';
    }).join('');
  }

  function viewPlayers(R) {
    return `<div class="kq-players">${R.players.map((p) => {
      const player = playerById(p.id);
      const status = R.phase === 'white' ? (p.done ? '✓' : '…') : p.id === R.activeId ? '🎲' : '';
      return `<button class="kq-player ${p.id === R.activeId ? 'active' : ''} ${kq.openSheet === p.id ? 'open' : ''} ${player?.connected === false ? 'offline' : ''}" data-action="kqOpen" data-player="${p.id}">
        ${avatarHtml(player, 'sm')}<span class="name">${esc(player?.name || '?')}${p.id === S.me.id ? ' (du)' : ''}</span>
        <span class="small muted">${'✕'.repeat(p.penalties)}</span><b>${p.total}</b><span class="st">${status}</span></button>`;
    }).join('')}</div>`;
  }

  function viewOtherSheet(R) {
    const p = R.players.find((x) => x.id === kq.openSheet && x.id !== S.me.id);
    if (!p) return '';
    return `<div class="card stack"><div class="row spread"><b>Blatt von ${esc(playerName(p.id))}</b><button class="btn small ghost" data-action="kqOpen" data-player="${p.id}">✕</button></div>${viewSheet(R, p, { interactive: false })}</div>`;
  }

  function viewPlaying(R) {
    const mine = me(R);
    const sheets = mine
      ? `${viewSheet(R, mine, { interactive: R.canAct })}${viewActions(R)}${viewPlayers(R)}${viewOtherSheet(R)}`
      // Gamemaster ohne eigenes Blatt sieht alle Blätter
      : `${viewPlayers(R)}<div class="kq-all">${R.players.map((p) => `<div class="card stack"><div class="row">${avatarHtml(playerById(p.id), 'sm')} <b>${esc(playerName(p.id))}</b></div>${viewSheet(R, p, { interactive: false })}</div>`).join('')}</div>`;
    const active = playerById(R.activeId);
    return `<div class="stack">
      <div class="q-head">
        <div class="small muted"><b>Partie ${R.gameNo}/${R.games}</b>${R.closed.length ? ` · ${R.closed.length} ${R.closed.length === 1 ? 'Reihe' : 'Reihen'} geschlossen` : ''}</div>
        ${R.deadline ? '<span class="timer" id="timer"></span>' : ''}
      </div>
      <div class="kq-turn">${avatarHtml(active, 'sm')} <b>${esc(active?.name || '?')}</b>&nbsp;${R.isActive ? '(du) bist am Zug' : 'ist am Zug'}</div>
      ${viewEvents(R)}
      ${viewDice(R)}
      <div class="center">${stepHint(R)}</div>
      ${sheets}
    </div>`;
  }

  function endReason(R) {
    const out = R.players.filter((p) => p.penalties >= 4).map((p) => esc(playerName(p.id)));
    if (out.length) return `${out.join(' und ')} ${out.length === 1 ? 'hat' : 'haben'} den vierten Fehlwurf.`;
    return `Zwei Reihen sind geschlossen: ${R.closed.map((c) => COLOR_NAMES[c]).join(' und ')}.`;
  }

  function ranking(R) {
    return R.players.map((p) => ({ id: p.id, pts: R.totals[p.id] || 0 })).sort((a, b) => b.pts - a.pts);
  }

  function viewEnd(R) {
    const ranked = ranking(R);
    const final = R.phase === 'final';
    const top = [ranked[1], ranked[0], ranked[2]].filter(Boolean);
    const heights = { 0: 140, 1: 100, 2: 70 };
    const winner = ranked[0];
    const tie = ranked[1] && ranked[1].pts === winner.pts;
    const title = final ? (tie ? 'Unentschieden!' : `${esc(playerName(winner.id))} gewinnt!`) : `Partie ${R.gameNo} von ${R.games} ist vorbei`;
    return `<div class="stack">
      <div class="center"><div style="font-size:3rem">${final ? '🏆' : '🎲'}</div><h1>${title}</h1><p class="muted">${endReason(R)}</p></div>
      ${final ? `<div class="podium">${top.map((t) => {
        const place = ranked.filter((o) => o.pts > t.pts).length;
        return `<div class="step"><div>${avatarHtml(playerById(t.id))}</div><b>${esc(playerName(t.id))}</b><div class="small muted">${t.pts} Punkte</div>
          <div class="block" style="--team:var(--accent);height:${heights[place] ?? 70}px">${place + 1}</div></div>`;
      }).join('')}</div>` : ''}
      <div class="card stack">
        <h3 style="margin:0">${final && R.games > 1 ? 'Gesamtwertung' : 'Wertung'}</h3>
        ${ranked.map((t) => {
          const place = ranked.filter((o) => o.pts > t.pts).length + 1;
          const sc = R.lastScores[t.id];
          return `<div class="score-row" style="--team:var(--accent)"><span class="rank">${place}.</span>${avatarHtml(playerById(t.id), 'sm')}<span class="name">${esc(playerName(t.id))}</span>
            <span class="kq-sum small">${COLORS.map((c) => `<b class="kq-chip ${c}">${sc.rows[c]}</b>`).join('+')}${sc.penalty ? ` − ${sc.penalty}` : ''} = ${sc.total}</span>
            <span class="pts">${t.pts}</span></div>`;
        }).join('')}
      </div>
      <details class="card"><summary>Alle Spielblätter dieser Partie</summary>
        <div class="kq-all" style="margin-top:12px">${R.players.map((p) => `<div class="stack"><b>${esc(playerName(p.id))}</b>${viewSheet(R, p, { interactive: false })}</div>`).join('')}</div>
      </details>
      ${S.me.isHost ? '' : `<div class="muted center">${final ? 'Der Host kann eine neue Runde starten.' : 'Der Host startet gleich die nächste Partie.'}</div>`}
    </div>`;
  }

  function view() {
    const R = S.round;
    // Würfel nur einmal pro Wurf rollen lassen
    if (R.rollSeq !== kq.seenRoll) {
      kq.seenRoll = R.rollSeq;
      kq.rolling = R.rollSeq > 0;
      if (kq.rolling) setTimeout(() => { kq.rolling = false; document.querySelectorAll('.kq-die.rolling').forEach((d) => d.classList.remove('rolling')); }, 700);
    }
    return R.phase === 'result' || R.phase === 'final' ? viewEnd(R) : viewPlaying(R);
  }

  function hostbar() {
    const R = S.round;
    if (R.phase === 'final') return '<button class="btn primary" data-action="toLobby">Neue Runde (zur Lobby)</button>';
    if (R.phase === 'result') return '<button class="btn primary" data-action="next">Nächste Partie ▶︎</button>';
    const label = R.phase === 'roll' ? `🎲 Für ${esc(playerName(R.activeId))} würfeln` : '⏭ Nicht länger warten';
    return `<button class="btn" data-action="kqForce">${label}</button>`;
  }

  gameViews.kreuzquer = { settings: viewSettings, view, hostbar };

  Object.assign(actions, {
    kqSetting: (el) => {
      const v = el.dataset.value;
      sendHost('settings', { game: { [el.dataset.key]: el.dataset.key === 'hints' ? v === '1' : v } });
    },
    kqRoll: () => act('roll'),
    kqMark: (el) => {
      const R = S.round;
      const pending = me(R)?.pending;
      const color = el.dataset.color;
      const number = Number(el.dataset.n);
      if (pending && pending.color === color && pending.number === number) act('unmark');
      else act('mark', { color, number });
    },
    kqUnmark: () => act('unmark'),
    kqDone: () => act('done'),
    kqOpen: (el) => {
      kq.openSheet = kq.openSheet === el.dataset.player ? null : el.dataset.player;
      render();
    },
    kqForce: () => {
      const R = S.round;
      if (R.phase === 'roll' || confirm('Nicht länger warten? Wer noch nicht fertig ist, passt.')) act('force');
    },
  });

  app.addEventListener('change', (e) => {
    if (S?.game.id !== 'kreuzquer') return;
    if (e.target.id === 'kq-time') sendHost('settings', { game: { timeLimit: Number(e.target.value) } });
    else if (e.target.id === 'kq-games') sendHost('settings', { game: { games: Number(e.target.value) } });
  });
})();
