// RPS: Spielansicht für Host und Handys (nutzt die Helfer aus lobby.js)

(() => {
  const BEST_OF = [[1, 'Eine Partie'], [3, 'Best of 3'], [5, 'Best of 5'], [0, 'Ohne Ende']];
  const TIMES = [0, 15, 30, 60];
  const COLOR = { red: 'Rot', blue: 'Blau' };
  const DOT = { red: '🔴', blue: '🔵' };
  const ICON = { rock: '✊', paper: '✋', scissors: '✌️', flag: '🚩', trap: '🕳️' };
  const NAME = { rock: 'Stein', paper: 'Papier', scissors: 'Schere', flag: 'Fahne', trap: 'Falle' };
  const WEAPONS = ['rock', 'paper', 'scissors'];
  const rp = {
    sel: null, // angetippte eigene Figur (Feld im Spiel, Platz in der Aufstellung)
    seenSeq: null,
    fresh: false, // der letzte Zug ist neu und wird angezeigt
    peek: false, // Host spielt am Fernseher mit: eigene Figuren erst auf Knopfdruck zeigen
  };

  function act(type, data = {}) {
    socket.emit('game:action', { type, ...data }, (res) => {
      if (res?.error) toast(res.error);
    });
  }

  function playerName(id) {
    return playerById(id)?.name || 'Jemand';
  }

  function nameOf(R, color) {
    return playerName(R.players.find((p) => p.color === color)?.id);
  }

  function fmtScore(n) {
    return String(n).replace('.5', '½').replace(/^0½/, '½');
  }

  // Am Host-Gerät liegt das Brett meist auf dem Fernseher, da bleiben die eigenen Figuren zu
  function hideOwn(R) {
    return S.me.isHost && !!R.myColor && !rp.peek;
  }

  // ---------- Lobby ----------

  function segmented(key, value, options) {
    return `<div class="segmented">${options.map(([v, text]) => `<button data-action="rpSetting" data-key="${key}" data-value="${v}" class="${String(v) === String(value) ? 'on' : ''}">${text}</button>`).join('')}</div>`;
  }

  function viewSettings() {
    const s = S.settings;
    const g = s.game;
    const playing = S.players.filter((p) => p.connected && (!p.isHost || s.hostPlays)).length;
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
        ${s.hostPlays ? '<div class="small muted" style="margin-top:6px">Läuft dieses Gerät am Fernseher, bleiben deine Figuren verdeckt, bis du „Meine Figuren zeigen“ tippst. Besser: mit dem Handy zusätzlich beitreten und hier „Nur Gamemaster“ wählen.</div>' : ''}
      </div>
      ${playing !== 2 ? `<div class="rp-note">RPS spielt man zu zweit, jeder mit eigenem Handy. Gerade ${playing === 1 ? 'ist 1 Spieler' : `sind ${playing} Spieler`} da.</div>` : ''}
      <div class="grid-2" style="gap:12px">
        <label class="field"><span>Partien</span>
          <select id="rp-bestOf">${BEST_OF.map(([n, text]) => `<option value="${n}" ${n === g.bestOf ? 'selected' : ''}>${text}</option>`).join('')}</select>
        </label>
        <label class="field"><span>Zeit pro Zug</span>
          <select id="rp-time">${TIMES.map((t) => `<option value="${t}" ${t === g.timeLimit ? 'selected' : ''}>${t ? `${t} Sekunden` : 'Kein Zeitlimit'}</option>`).join('')}</select>
        </label>
      </div>
      <div><div class="small muted" style="font-weight:700;margin-bottom:6px">Wer einen Kampf gewinnt</div>${segmented('reveal', g.reveal ? 1 : 0, [[1, '👁 Bleibt aufgedeckt (wie bei ICQ)'], [0, '🧠 Wird wieder verdeckt']])}</div>
      <div><div class="small muted" style="font-weight:700;margin-bottom:6px">Mögliche Ziele zeigen</div>${segmented('preview', g.preview ? 1 : 0, [[1, '✨ An'], [0, 'Aus']])}</div>
      <div class="small muted">So geht's: Jeder hat 14 Figuren auf seinen zwei Grundreihen: eine Fahne 🚩, eine Falle 🕳️ und je vier Steine ✊, Papiere ✋ und Scheren ✌️. Was wo steht, sieht nur der Besitzer. Vor dem Start legt jeder Fahne und Falle hin, wo er will (zwei Figuren antippen tauscht sie), oder mischt neu. Dann zieht ihr abwechselnd eine Figur ein Feld nach vorn, hinten oder zur Seite. Wer auf eine gegnerische Figur zieht, kämpft: Stein schlägt Schere, Schere schlägt Papier, Papier schlägt Stein. ${g.reveal ? 'Der Sieger bleibt für den Gegner aufgedeckt.' : 'Der Sieger wird danach wieder verdeckt, merkt euch, was ihr gesehen habt.'} Bei Gleichstand wählen beide heimlich eine neue Waffe für ihre Figur. Fahne und Falle bewegen sich nicht; wer in die Falle läuft, ist weg. Wer die Fahne erobert, gewinnt. Wer keine Figur mehr ziehen kann, verliert. Die Farben wechseln jede Partie, Rot fängt an.${g.timeLimit ? ' Läuft die Zeit ab, macht das Spiel einen Zufallszug, beim dritten Mal hintereinander ist die Partie verloren.' : ''}</div>
    </div>`;
  }

  // ---------- Brett ----------

  // Was der Spieler am Zug antippen darf
  function tapInfo(R) {
    const info = { pickable: new Set(), targets: new Set() };
    if (R.phase === 'setup') {
      const me = R.players.find((p) => p.mine);
      if (me && !me.ready) R.board.forEach((p) => { if (p && p.color === R.myColor) info.pickable.add(p.slot); });
      return info;
    }
    if (!R.mine) return info;
    for (const m of R.legal) {
      info.pickable.add(m.from);
      if (m.from === rp.sel) info.targets.add(m.to);
    }
    return info;
  }

  function pieceHtml(R, p, extra = '', style = '') {
    const hidden = !p.type || (p.color === R.myColor && hideOwn(R));
    const glyph = hidden ? '' : ICON[p.type];
    const known = p.color === R.myColor && p.known && !hidden && R.phase === 'play' ? '<span class="rp-known" title="Der Gegner kennt diese Figur">👁</span>' : '';
    return `<span class="rp-piece ${p.color} ${hidden ? 'covered' : p.type} ${extra}" ${style ? `style="${style}"` : ''} ${hidden ? '' : `title="${NAME[p.type]}"`}>${glyph ? `<span class="rp-glyph">${glyph}</span>` : ''}${known}</span>`;
  }

  function viewBoard(R) {
    const info = tapInfo(R);
    const setup = R.phase === 'setup';
    if (rp.sel !== null && !info.pickable.has(rp.sel)) rp.sel = null;
    const last = R.lastMove;
    const duel = R.duel;
    // Wer Blau spielt, sieht das Brett von der anderen Seite
    const flip = R.myColor === 'blue';
    const cells = [];
    for (let i = 0; i < R.cols * R.rows; i++) cells.push(flip ? R.cols * R.rows - 1 - i : i);
    const html = cells.map((cell) => {
      const p = R.board[cell];
      const r = Math.floor(cell / R.cols);
      const c = cell % R.cols;
      const key = setup ? p?.slot : cell;
      const pickable = setup ? p && p.color === R.myColor && info.pickable.has(p.slot) : info.pickable.has(cell);
      const target = !setup && info.targets.has(cell);
      const selected = rp.sel !== null && key === rp.sel && (setup ? p?.color === R.myColor : true);
      const cls = [
        'rp-cell',
        (r + c) % 2 ? 'dark' : 'light',
        pickable || target ? 'tap' : '',
        target && R.preview ? 'target' : '',
        target && p ? 'attack' : '',
        selected ? 'sel' : '',
        last && !setup && (last.to === cell || last.from === cell) ? 'last' : '',
        duel && (duel.from === cell || duel.to === cell) ? 'duel' : '',
      ].join(' ');
      let piece = '';
      if (p) {
        const moved = rp.fresh && last && last.pieceId === p.id && last.from !== undefined;
        if (moved && last.to === cell) {
          const sign = flip ? -1 : 1;
          const dx = ((last.from % R.cols) - c) * sign;
          const dy = (Math.floor(last.from / R.cols) - r) * sign;
          piece = pieceHtml(R, p, 'slide', `--dx:${dx * 100}%;--dy:${dy * 100}%`);
        } else piece = pieceHtml(R, p);
      }
      const action = pickable || target ? `data-action="rpTap" data-cell="${key}"` : '';
      return `<div class="${cls}" ${action}>${piece}</div>`;
    }).join('');
    const banner = rp.fresh && last?.kind === 'clash' ? clashBanner(R, last) : '';
    return `<div class="rp-boardwrap">
      <div class="rp-board ${R.mine ? 'mine' : ''} turn-${R.turn || ''}" style="--cols:${R.cols};--rows:${R.rows}">${html}</div>
      ${banner}
    </div>`;
  }

  // Ergebnis eines Kampfs in Worten
  function clashText(R, m) {
    const a = esc(nameOf(R, m.color));
    const d = esc(nameOf(R, m.color === 'red' ? 'blue' : 'red'));
    if (m.outcome === 'flag') return `${a} erobert die Fahne!`;
    if (m.outcome === 'trap') return `${a} läuft in die Falle!`;
    if (m.outcome === 'tie') return 'Gleichstand! Beide wählen neu.';
    const win = m.outcome === 'attacker' ? m.attacker : m.defender;
    const lose = m.outcome === 'attacker' ? m.defender : m.attacker;
    return `${NAME[win]} schlägt ${NAME[lose]}: ${m.outcome === 'attacker' ? a : d} gewinnt`;
  }

  function clashBanner(R, m) {
    const other = m.color === 'red' ? 'blue' : 'red';
    const ties = m.rounds.length > 1 ? `<div class="small">${m.rounds.length - 1}× Gleichstand vorher</div>` : '';
    return `<div class="rp-banner ${m.outcome}">
      <div class="rp-vs">
        <span class="rp-piece ${m.color} big ${m.outcome === 'defender' || m.outcome === 'trap' ? 'lose' : ''}"><span class="rp-glyph">${ICON[m.attacker]}</span></span>
        <b>gegen</b>
        <span class="rp-piece ${other} big ${m.outcome === 'attacker' || m.outcome === 'flag' ? 'lose' : ''}"><span class="rp-glyph">${ICON[m.defender]}</span></span>
      </div>
      <div class="rp-banner-text">${clashText(R, m)}</div>${ties}
    </div>`;
  }

  // ---------- Spieler ----------

  function viewSide(R, p) {
    const player = playerById(p.id);
    const active = R.phase === 'play' && !R.duel && R.turn === p.color;
    let sub = COLOR[p.color];
    if (R.phase === 'setup') sub += p.ready ? ' · ✅ bereit' : ' · stellt auf …';
    else if (active) sub += ' · ist dran';
    else if (R.duel) sub += R.duel.picked[p.color] ? ' · ✅ hat gewählt' : ' · wählt neu …';
    const left = WEAPONS.map((w) => `<span class="rp-count ${p.left[w] ? '' : 'zero'}" title="${NAME[w]}">${ICON[w]} ${p.left[w]}</span>`).join('');
    return `<div class="rp-side ${p.color} ${active ? 'active' : ''} ${player?.connected === false ? 'offline' : ''}">
      <div class="rp-who">${avatarHtml(player)}<div>
        <div class="rp-name">${DOT[p.color]} ${esc(playerName(p.id))}</div>
        <div class="small muted">${sub}</div>
      </div><div class="rp-score">${fmtScore(p.score)}</div></div>
      <div class="rp-row"><span class="small muted">Noch im Spiel</span><div class="rp-counts">${left}</div></div>
    </div>`;
  }

  function viewStatus(R) {
    const me = R.players.find((p) => p.mine);
    if (R.phase === 'setup') {
      if (!me) return '<div class="rp-status">Beide stellen ihre Figuren auf …</div>';
      if (me.ready) return '<div class="rp-status">✅ Bereit. Warte auf den Gegner …</div>';
      return `<div class="rp-status mine">${rp.sel !== null ? 'Mit welcher Figur tauschen?' : 'Stell deine Figuren auf: zwei antippen tauscht sie'}</div>`;
    }
    if (R.phase !== 'play') return '';
    if (R.duel) {
      const first = R.duel.rounds[R.duel.rounds.length - 1][0];
      if (me && !R.duel.myPick) return `<div class="rp-status duel">Gleichstand: beide ${ICON[first]} ${NAME[first]}! Wähl heimlich eine neue Waffe</div>`;
      return `<div class="rp-status duel">Gleichstand: beide ${ICON[first]} ${NAME[first]}! ${me ? 'Warte auf den Gegner …' : 'Beide wählen heimlich neu …'}</div>`;
    }
    const who = `${avatarHtml(playerById(R.turnId), 'sm')} ${esc(playerName(R.turnId))}`;
    if (R.mine) return `<div class="rp-status mine">${who} ist dran: ${rp.sel !== null ? 'wohin ziehen?' : 'zieh eine Figur'}</div>`;
    return `<div class="rp-status">${who} zieht</div>`;
  }

  function viewSetupControls(R) {
    const me = R.players.find((p) => p.mine);
    if (R.phase !== 'setup' || !me) return '';
    if (me.ready) return '<div class="row center" style="justify-content:center"><button class="btn" data-action="rpUnready">✏️ Doch noch ändern</button></div>';
    return `<div class="row" style="justify-content:center">
      <button class="btn" data-action="rpShuffle">🔀 Neu mischen</button>
      <button class="btn primary" data-action="rpReady">✅ Bereit</button>
    </div>
    <div class="small muted center">Neu mischen verteilt nur Steine, Papiere und Scheren neu, Fahne und Falle bleiben liegen.</div>`;
  }

  function viewPick(R) {
    if (!R.duel || !R.myColor || R.duel.myPick) return '';
    return `<div class="rp-pick">${WEAPONS.map((w) => `<button class="btn big" data-action="rpPick" data-weapon="${w}"><span class="rp-glyph">${ICON[w]}</span> ${NAME[w]}</button>`).join('')}</div>`;
  }

  function seriesLine(R) {
    const [a, b] = R.players;
    return `${esc(playerName(a.id))} <b>${fmtScore(a.score)} : ${fmtScore(b.score)}</b> ${esc(playerName(b.id))}`;
  }

  function viewResult(R) {
    const r = R.result;
    const head = r.winnerId ? `🏆 ${esc(playerName(r.winnerId))} gewinnt Partie ${r.gameNo}!` : `🤝 Partie ${r.gameNo}: Remis`;
    const why = r.winnerId ? (r.reason === 'flag' ? esc(r.reasonText) : `${esc(playerName(r.loserId))}: ${esc(r.reasonText)}`) : esc(r.reasonText);
    return `<div class="rp-result card stack">
      <div class="rp-result-head">${head}</div>
      <div class="muted">${why} · ${Math.ceil(r.plies / 2)} Züge</div>
      <div class="small muted">Jetzt liegen alle Figuren offen.</div>
      <div class="rp-series">${seriesLine(R)}</div>
      ${S.me.isHost ? '' : '<div class="small muted">Gleich startet der Host die nächste Partie, dann mit getauschten Farben.</div>'}
    </div>`;
  }

  function lastLine(R) {
    const m = R.lastMove;
    if (!m || m.kind !== 'clash' || R.phase === 'setup') return '';
    return `<div class="small muted center">Letzter Kampf: ${ICON[m.attacker]} gegen ${ICON[m.defender]}, ${clashText(R, m)}</div>`;
  }

  function viewPlaying(R) {
    const me = R.players.find((p) => p.mine);
    const sides = me ? [R.players.find((p) => !p.mine), me] : ['blue', 'red'].map((c) => R.players.find((p) => p.color === c));
    const away = R.awayId ? `<div class="rp-note">📵 ${esc(playerName(R.awayId))} ist nicht verbunden. Ohne Rückkehr innerhalb einer Minute ${R.phase === 'gameEnd' ? 'endet das Spiel' : 'gilt die Partie als aufgegeben'}.</div>` : '';
    const peek = S.me.isHost && R.myColor && R.phase !== 'gameEnd'
      ? `<button class="btn small ghost" data-action="rpPeek">${rp.peek ? '🙈 Meine Figuren verdecken' : '👁 Meine Figuren zeigen'}</button>` : '';
    const resign = R.phase === 'play' && me ? '<button class="btn small ghost" data-action="rpResign">🏳️ Aufgeben</button>' : '';
    const quiet = R.phase === 'play' && R.sinceClash >= R.drawPlies - 20 ? `<div class="small muted center">Noch ${R.drawPlies - R.sinceClash} Züge ohne Kampf, dann ist es Remis.</div>` : '';
    return `<div class="stack">
      <div class="q-head">
        <div class="small muted"><b>RPS</b> · Partie ${R.gameNo}${R.bestOf ? ` · Best of ${R.bestOf}` : ''} · ${seriesLine(R)}</div>
        ${R.deadline ? '<span class="timer" id="timer"></span>' : ''}
      </div>
      ${away}
      ${viewStatus(R)}
      ${viewPick(R)}
      <div class="rp-layout">
        ${viewSide(R, sides[0])}
        ${viewBoard(R)}
        ${viewSide(R, sides[1])}
      </div>
      ${viewSetupControls(R)}
      ${lastLine(R)}
      ${quiet}
      ${R.phase === 'gameEnd' ? viewResult(R) : ''}
      ${peek || resign ? `<div class="row" style="justify-content:center">${peek}${resign}</div>` : ''}
    </div>`;
  }

  function viewFinal(R) {
    const [a, b] = R.players;
    const winner = a.score === b.score ? null : (a.score > b.score ? a : b);
    const r = R.result;
    const left = r && (r.reason === 'left' || r.leftId) ? `<div class="rp-note">${esc(playerName(r.leftId || r.loserId))} ist nicht zurückgekommen, darum endet das Spiel.</div>` : '';
    const stat = (label, fn) => `<tr><td class="muted">${label}</td>${R.players.map((p) => `<td>${fn(R.stats[p.id])}</td>`).join('')}</tr>`;
    return `<div class="stack">
      <div class="center">
        <div style="font-size:3rem">${winner ? '🏆' : '🤝'}</div>
        <h1>${winner ? `${esc(playerName(winner.id))} gewinnt!` : 'Unentschieden!'}</h1>
        ${winner ? `<div>${avatarHtml(playerById(winner.id))}</div>` : ''}
        <div class="rp-series big">${seriesLine(R)}</div>
      </div>
      ${left}
      <div class="card stack">
        <h3 style="margin:0">Partien</h3>
        ${R.results.map((x) => `<div class="score-row" style="--team:var(--accent)"><span class="rank">${x.gameNo}.</span>
          <span class="name">${x.winnerId ? `${esc(playerName(x.winnerId))} gewinnt` : 'Remis'}<div class="small muted">${esc(x.reasonText)} · ${Math.ceil(x.plies / 2)} Züge · ${DOT.red} ${esc(playerName(x.red))}</div></span></div>`).join('') || '<div class="muted">Keine Partie beendet.</div>'}
      </div>
      <div class="card stack">
        <h3 style="margin:0">Statistik</h3>
        <table class="rp-stats"><tr><td></td>${R.players.map((p) => `<th>${esc(playerName(p.id))}</th>`).join('')}</tr>
          ${stat('Siege', (s) => s.wins)}
          ${stat('Fahnen erobert', (s) => s.flags)}
          ${stat('Kämpfe gewonnen', (s) => s.won)}
          ${stat('Figuren verloren', (s) => s.lost)}
          ${stat('Gegner in der Falle', (s) => s.trapped)}
        </table>
      </div>
      ${S.me.isHost ? '' : '<div class="muted center">Der Host kann eine neue Runde starten.</div>'}
    </div>`;
  }

  function view() {
    const R = S.round;
    if (!R.mine && R.phase !== 'setup') rp.sel = null;
    const seq = R.lastMove?.seq ?? null;
    // Nur beim ersten Zeichnen nach einem neuen Zug animieren (beim ersten Laden gar nicht)
    rp.fresh = seq !== rp.seenSeq && rp.seenSeq !== null && seq !== null;
    if (seq !== rp.seenSeq) {
      rp.seenSeq = seq;
      rp.sel = null;
    }
    if (R.phase === 'setup' && rp.phase !== 'setup') rp.sel = null;
    rp.phase = R.phase;
    return R.phase === 'final' ? viewFinal(R) : viewPlaying(R);
  }

  function hostbar() {
    const R = S.round;
    if (R.phase === 'final') return '<button class="btn primary" data-action="toLobby">Neue Runde (zur Lobby)</button>';
    const finish = R.bestOf ? '' : '<button class="btn" data-action="rpFinish">🏁 Serie beenden</button>';
    if (R.phase === 'gameEnd') return `${finish}<button class="btn primary" data-action="next">Nächste Partie ▶︎</button>`;
    if (R.phase === 'setup') return `${finish}<button class="btn" data-action="rpForce">⏩ Aufstellung beenden</button>`;
    const force = R.duel ? '⏩ Waffe auslosen' : `⏩ Zug für ${esc(playerName(R.turnId))} auslosen`;
    return `${finish}<button class="btn" data-action="rpDraw">🤝 Remis</button><button class="btn" data-action="rpForce">${force}</button>`;
  }

  gameViews.rps = { settings: viewSettings, view, hostbar };

  Object.assign(actions, {
    rpSetting: (el) => sendHost('settings', { game: { [el.dataset.key]: el.dataset.value === '1' } }),
    rpTap: (el) => {
      const R = S.round;
      const key = Number(el.dataset.cell);
      if (R.phase === 'setup') {
        if (rp.sel === null) rp.sel = key;
        else if (rp.sel === key) rp.sel = null;
        else {
          const a = rp.sel;
          rp.sel = null;
          act('swap', { a, b: key });
        }
        return render();
      }
      if (!R.mine) return;
      if (rp.sel !== null && R.legal.some((m) => m.from === rp.sel && m.to === key)) {
        const from = rp.sel;
        rp.sel = null;
        return act('move', { from, to: key });
      }
      if (R.legal.some((m) => m.from === key)) {
        rp.sel = rp.sel === key ? null : key;
        render();
      }
    },
    rpShuffle: () => act('shuffle'),
    rpReady: () => { rp.sel = null; act('ready'); },
    rpUnready: () => act('unready'),
    rpPick: (el) => act('pick', { weapon: el.dataset.weapon }),
    rpPeek: () => { rp.peek = !rp.peek; render(); },
    rpResign: () => {
      if (confirm('Diese Partie aufgeben?')) act('resign');
    },
    rpForce: () => {
      const R = S.round;
      const text = R.phase === 'setup' ? 'Die Aufstellung jetzt beenden? Wer nicht fertig ist, spielt mit der aktuellen Aufstellung.'
        : R.duel ? 'Für alle, die noch nicht gewählt haben, eine Waffe auslosen?'
          : `Für ${playerName(R.turnId)} einen zufälligen Zug machen?`;
      if (confirm(text)) act('force');
    },
    rpDraw: () => {
      if (confirm('Diese Partie als Remis werten? Beide bekommen einen halben Punkt.')) act('draw');
    },
    rpFinish: () => {
      if (confirm('Die Serie jetzt beenden und den Endstand zeigen?')) act('finish');
    },
  });

  app.addEventListener('change', (e) => {
    if (S?.game.id !== 'rps') return;
    if (e.target.id === 'rp-bestOf') sendHost('settings', { game: { bestOf: Number(e.target.value) } });
    else if (e.target.id === 'rp-time') sendHost('settings', { game: { timeLimit: Number(e.target.value) } });
  });
})();
