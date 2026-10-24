// Backgammon: Spielansicht für Host und Handys (nutzt die Helfer aus lobby.js)

(() => {
  const MATCH_TO = [1, 3, 5, 7, 11];
  const TIMES = [0, 30, 60, 120];
  const COLOR_NAMES = { w: 'Weiß', b: 'Schwarz' };
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  // Brett im SVG: 12 Spalten à 70, dazwischen die Bar, rechts das Ablagefach
  const COL = 70;
  const BAR_X = 440;
  const BAR_W = 60;
  const TOP = 20;
  const BOTTOM = 780;
  const TIP = 300; // Höhe einer Zunge
  const R_CHECKER = 31;
  const TRAY_X = 930;
  const bg = { selected: null, seenRoll: 0, rolling: false };

  function act(type, data = {}) {
    socket.emit('game:action', { type, ...data }, (res) => {
      if (res?.error) toast(res.error);
    });
  }

  function playerName(id) {
    return playerById(id)?.name || 'Jemand';
  }

  function other(c) {
    return c === 'w' ? 'b' : 'w';
  }

  // Name einer Seite mit Farbe, z. B. „Lukas (Weiß)“
  function sideName(R, c) {
    return esc(R.sides[c].name);
  }

  function chip(c) {
    return `<span class="bg-chip ${c}" title="${COLOR_NAMES[c]}"></span>`;
  }

  // Wer am Zug ist, mit Namen (auf geteilten Geräten nie „Du“)
  function actorName(R, c) {
    if (R.teamMode) {
      const mover = R.sides[c].ids[0];
      return `${esc(mover ? playerName(mover) : R.sides[c].name)} <span class="muted small">(${sideName(R, c)})</span>`;
    }
    return sideName(R, c);
  }

  // Welche Farbe auf diesem Gerät unten liegt
  function bottomColor(R) {
    if (R.myColors.length === 2) return R.actor || R.turn || (R.openDice.w === null ? 'w' : 'b');
    if (R.myColors.length === 1) return R.myColors[0];
    return R.mySide || 'w';
  }

  function canMoveHere(R) {
    return R.phase === 'move' && R.myColors.includes(R.turn);
  }

  function canSuggest(R) {
    return R.phase === 'move' && R.teamMode && R.mySide === R.turn && !R.myColors.includes(R.turn);
  }

  function sharedHere() {
    return S.players.some((p) => p.guestOf === S.me.id);
  }

  // ---------- Lobby ----------

  function lobbyExtra() {
    if (S.me.isHost && !S.settings.hostPlays) return '';
    if (S.settings.game.teamMode) return '';
    const guests = S.players.filter((p) => p.guestOf === S.me.id);
    return `<div class="card stack">
      <h3 style="margin:0">Mitspieler an diesem Gerät</h3>
      <div class="small muted">Nur ein Handy oder Tablet? Trag hier die zweite Person ein, dann spielt ihr beide an diesem Gerät. Das Brett dreht sich immer zu dem, der dran ist.</div>
      ${guests.map((p) => `<div class="member">${avatarHtml(p, 'sm')}<span class="name">${esc(p.name)}</span>
        <button class="btn small icon ghost" data-action="bgRemoveGuest" data-player="${p.id}" title="Entfernen">✕</button></div>`).join('')}
      <form id="bg-guest-form" class="row" style="flex-wrap:nowrap">
        <input id="bg-guest-name" type="text" maxlength="24" placeholder="Name" autocomplete="off" style="flex:1;min-width:0">
        <button class="btn primary small" type="submit">+ Hinzufügen</button>
      </form>
    </div>`;
  }

  function seg(key, value, options) {
    return `<div class="segmented">${options.map(([v, text]) => `<button data-action="bgSetting" data-key="${key}" data-value="${v ? 1 : 0}" class="${value === v ? 'on' : ''}">${text}</button>`).join('')}</div>`;
  }

  function seatSelect(c, g) {
    const players = S.players.filter((p) => p.connected && (!p.isHost || S.settings.hostPlays));
    return `<label class="field"><span>${chip(c)} ${COLOR_NAMES[c]}</span>
      <select id="bg-seat-${c}"><option value="">Automatisch</option>${players.map((p) => `<option value="${p.id}" ${g.seats[c] === p.id ? 'selected' : ''} ${g.seats[other(c)] === p.id ? 'disabled' : ''}>${esc(p.name)}</option>`).join('')}</select>
    </label>`;
  }

  function viewSettings() {
    const s = S.settings;
    const g = s.game;
    const label = (text) => `<div class="small muted" style="font-weight:700;margin-bottom:6px">${text}</div>`;
    return `<div class="card stack">
      <h3>Einstellungen</h3>
      <div class="grid-2" style="gap:12px">
        <label class="field"><span>Lobbyname</span><input id="set-lobbyName" type="text" maxlength="40" value="${esc(s.lobbyName)}"></label>
        <label class="field"><span>Dein Spielername</span><input id="set-myName" type="text" maxlength="24" value="${esc(S.me.name)}"></label>
      </div>
      <div>${label('Dein Profilbild')}${avatarPicker(S.me.avatar, 'hostAvatar')}</div>
      <div>${label('Deine Rolle')}
        <div class="segmented">
          <button data-action="hostPlays" data-value="1" class="${s.hostPlays ? 'on' : ''}">🎮 Spielt mit</button>
          <button data-action="hostPlays" data-value="0" class="${!s.hostPlays ? 'on' : ''}">🎩 Nur Gamemaster</button>
        </div>
      </div>
      <div>${label('Modus')}${seg('teamMode', g.teamMode, [[false, '⚔️ Duell'], [true, '👥 Team gegen Team']])}</div>
      ${g.teamMode
        ? '<div class="small muted">Zwei Teams spielen gegeneinander. Pro Spiel zieht ein anderes Teammitglied, die anderen können Züge vorschlagen.</div>'
        : `<div class="grid-2" style="gap:12px">${seatSelect('w', g)}${seatSelect('b', g)}</div>
           <div class="small muted">Automatisch: die ersten beiden in der Lobby. Alle anderen schauen zu und tippen vor jedem Spiel auf den Sieger.</div>`}
      <div class="grid-2" style="gap:12px">
        <label class="field"><span>Partie bis</span>
          <select id="bg-match">${MATCH_TO.map((n) => `<option value="${n}" ${n === g.matchTo ? 'selected' : ''}>${n} ${n === 1 ? 'Punkt' : 'Punkte'}</option>`).join('')}</select>
        </label>
        <label class="field"><span>Zeit pro Zug</span>
          <select id="bg-time">${TIMES.map((t) => `<option value="${t}" ${t === g.timeLimit ? 'selected' : ''}>${t ? `${t} Sekunden` : 'Kein Zeitlimit'}</option>`).join('')}</select>
        </label>
      </div>
      <div class="grid-2" style="gap:12px">
        <div>${label('Verdopplungswürfel')}${seg('cube', g.cube, [[false, 'Aus'], [true, '🎲 An']])}</div>
        <div>${label('Gammon und Backgammon')}${seg('gammons', g.gammons, [[true, 'Zählen doppelt/dreifach'], [false, 'Jeder Sieg 1 Punkt']])}</div>
        <div>${label('Augenzahl anzeigen')}${seg('pips', g.pips, [[true, 'An'], [false, 'Aus']])}</div>
        <div>${label('Zugvorschläge')}${seg('hints', g.hints, [[false, 'Aus'], [true, '💡 Ziehbare Steine leuchten']])}</div>
      </div>
      <div class="small muted">So geht's: Jede Seite zieht ihre 15 Steine mit zwei Würfeln einmal ums Brett ins eigene Heimfeld (unten rechts) und würfelt sie von dort hinaus. Jede Augenzahl ist ein eigener Zug, ein Pasch zählt vierfach. Zwei gegnerische Steine sperren eine Zunge, ein einzelner wird geschlagen und muss von der Bar neu einsteigen. Wer zuerst alle Steine draußen hat, gewinnt das Spiel.${g.gammons ? ' Hat der Verlierer noch keinen Stein draußen, ist es ein Gammon (2 Punkte), steckt er dazu noch im Heimfeld des Siegers oder auf der Bar, ein Backgammon (3 Punkte).' : ''}${g.cube ? ' Mit dem Verdopplungswürfel darf man vor dem Würfeln den Einsatz verdoppeln. Der Gegner nimmt an oder gibt das Spiel verloren. Im ersten Spiel, nachdem jemand nur noch einen Punkt vom Ziel entfernt ist, wird nicht verdoppelt (Crawford-Regel).' : ''}${g.timeLimit ? ' Läuft die Zeit ab, würfelt das Spiel bzw. zieht einen zufälligen erlaubten Zug.' : ''}</div>
    </div>`;
  }

  // ---------- Brett ----------

  // Spalte (0 bis 11 von links) und Reihe einer Zunge aus Sicht der unteren Farbe
  function place(index, bottom) {
    const q = bottom === 'w' ? index : 25 - index;
    if (q <= 12) return { col: 12 - q, top: false, q };
    return { col: q - 13, top: true, q };
  }

  function colX(col) {
    return 20 + col * COL + COL / 2 + (col >= 6 ? BAR_W : 0);
  }

  function checkerY(top, k) {
    return top ? TOP + R_CHECKER + k * 62 : BOTTOM - R_CHECKER - k * 62;
  }

  function checker(x, y, color, cls = '', label = '') {
    return `<g class="bg-checker ${color} ${cls}"><circle cx="${x}" cy="${y}" r="${R_CHECKER - 1}"/><circle class="ring" cx="${x}" cy="${y}" r="${R_CHECKER - 9}"/>${label ? `<text x="${x}" y="${y + 9}">${label}</text>` : ''}</g>`;
  }

  function dieSvg(x, y, value, size, cls = '') {
    const pips = PIPS[value] || [];
    const step = size / 4;
    const dots = pips.map((k) => `<circle cx="${x + step * (1 + (k % 3))}" cy="${y + step * (1 + Math.floor(k / 3))}" r="${size / 11}"/>`).join('');
    return `<g class="bg-die ${cls}"><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${size / 6}"/>${dots}</g>`;
  }

  function diceSvg(R, bottom) {
    const out = [];
    const row = (list, side) => {
      const size = list.length > 2 ? 50 : 60;
      const gap = 12;
      const width = list.length * size + (list.length - 1) * gap;
      const center = side === 'right' ? 500 + 210 : 20 + 210;
      let x = center - width / 2;
      for (const d of list) {
        out.push(dieSvg(x, 400 - size / 2, d.value, size, `${d.used ? 'used' : ''} ${bg.rolling ? 'rolling' : ''}`));
        x += size + gap;
      }
    };
    if (R.phase === 'opening') {
      for (const c of ['w', 'b']) {
        const v = R.openDice[c] ?? (R.openTie ? R.openTie[0] : null);
        if (v) row([{ value: v, used: !R.openDice[c] }], c === bottom ? 'right' : 'left');
      }
    } else if (R.dice) {
      row(R.dice, R.turn === bottom ? 'right' : 'left');
    } else if (R.lastTurn && R.phase === 'roll') {
      row(R.lastTurn.dice.map((value) => ({ value, used: true })), R.lastTurn.color === bottom ? 'right' : 'left');
    }
    return out.join('');
  }

  function cubeSvg(R, bottom) {
    if (!R.cube.enabled) return '';
    const y = R.cube.owner === null ? 400 : R.cube.owner === bottom ? BOTTOM - 70 : TOP + 70;
    const size = 50;
    return `<g class="bg-cube ${R.cube.crawford ? 'off' : ''}"><rect x="${BAR_X + 5}" y="${y - size / 2}" width="${size}" height="${size}" rx="8"/>
      <text x="${BAR_X + 30}" y="${y + 9}">${R.cube.crawford ? '–' : R.cube.value === 1 ? '64' : R.cube.value}</text></g>`;
  }

  // Was angetippt werden kann
  function interaction(R) {
    const active = canMoveHere(R) || canSuggest(R);
    if (!active) return { froms: new Set(), targets: new Map() };
    const froms = new Set(R.legal.map((m) => String(m.from)));
    if (bg.selected !== null && !froms.has(String(bg.selected))) bg.selected = null;
    const targets = new Map();
    for (const m of R.legal) if (bg.selected !== null && String(m.from) === String(bg.selected)) targets.set(String(m.to), m.die);
    return { froms, targets };
  }

  // Wo der nächste Stein auf einer Zunge landen würde (für Markierungen)
  function landing(R, index, bottom) {
    const { col, top } = place(index, bottom);
    const n = Math.min(Math.abs(R.board.points[index]), 5);
    return { x: colX(col), y: checkerY(top, Math.min(n, 4)) };
  }

  function boardSvg(R) {
    const bottom = bottomColor(R);
    const top = other(bottom);
    const { froms, targets } = interaction(R);
    const hintFroms = R.hints ? froms : new Set();
    const parts = [];
    // Rahmen, Spielfläche, Bar und Ablage
    parts.push(`<rect class="bg-frame" x="0" y="0" width="1060" height="800" rx="18"/>`);
    parts.push(`<rect class="bg-felt" x="20" y="${TOP}" width="420" height="${BOTTOM - TOP}"/><rect class="bg-felt" x="500" y="${TOP}" width="420" height="${BOTTOM - TOP}"/>`);
    parts.push(`<rect class="bg-bar" x="${BAR_X}" y="${TOP}" width="${BAR_W}" height="${BOTTOM - TOP}"/>`);
    parts.push(`<rect class="bg-tray ${targets.has('off') ? 'target' : ''}" x="${TRAY_X}" y="${TOP}" width="110" height="${BOTTOM - TOP}" rx="10"/>`);
    parts.push(`<line class="bg-tray-line" x1="${TRAY_X}" y1="400" x2="${TRAY_X + 110}" y2="400"/>`);
    // Letzter Zug bzw. die schon gezogenen Steine
    const marks = R.phase === 'move' ? R.pending : R.phase === 'roll' && R.lastTurn ? R.lastTurn.moves : [];
    const marked = new Set(marks.flatMap((m) => [String(m.from), String(m.to)]));
    for (let i = 1; i <= 24; i++) {
      const { col, top: isTop, q } = place(i, bottom);
      const x = colX(col);
      const y0 = isTop ? TOP : BOTTOM;
      const y1 = isTop ? TOP + TIP : BOTTOM - TIP;
      const cls = [col % 2 ? 'odd' : 'even', marked.has(String(i)) ? 'marked' : '', String(bg.selected) === String(i) ? 'selected' : ''].join(' ');
      parts.push(`<polygon class="bg-point ${cls}" points="${x - COL / 2 + 2},${y0} ${x + COL / 2 - 2},${y0} ${x},${y1}"/>`);
      parts.push(`<text class="bg-num" x="${x}" y="${isTop ? 14 : 796}">${q}</text>`);
    }
    // Steine auf den Zungen
    for (let i = 1; i <= 24; i++) {
      const v = R.board.points[i];
      if (!v) continue;
      const color = v > 0 ? 'w' : 'b';
      const n = Math.abs(v);
      const { col, top: isTop } = place(i, bottom);
      const x = colX(col);
      const shown = Math.min(n, 5);
      for (let k = 0; k < shown; k++) {
        const last = k === shown - 1;
        const cls = last && hintFroms.has(String(i)) ? 'movable' : '';
        const sel = last && String(bg.selected) === String(i) ? 'selected' : '';
        parts.push(checker(x, checkerY(isTop, k), color, `${cls} ${sel}`, last && n > 5 ? n : ''));
      }
    }
    // Bar: die untere Farbe unterhalb der Mitte, die obere darüber
    for (const c of [bottom, top]) {
      const n = R.board.bar[c];
      for (let k = 0; k < Math.min(n, 4); k++) {
        const y = c === bottom ? 480 + R_CHECKER + k * 62 : 320 - R_CHECKER - k * 62;
        const last = k === Math.min(n, 4) - 1;
        const movable = last && c === R.turn && hintFroms.has('bar') ? 'movable' : '';
        const sel = last && c === R.turn && bg.selected === 'bar' ? 'selected' : '';
        parts.push(checker(BAR_X + BAR_W / 2, y, c, `${movable} ${sel}`, last && n > 4 ? n : ''));
      }
    }
    // Ablage: hinausgewürfelte Steine als Scheiben
    for (const c of [bottom, top]) {
      for (let k = 0; k < R.board.off[c]; k++) {
        const y = c === bottom ? BOTTOM - 22 - k * 23 : TOP + 4 + k * 23;
        parts.push(`<rect class="bg-slab ${c}" x="${TRAY_X + 12}" y="${y}" width="86" height="18" rx="5"/>`);
      }
      if (R.board.off[c]) parts.push(`<text class="bg-offcount" x="${TRAY_X + 55}" y="${c === bottom ? 440 : 375}">${R.board.off[c]}</text>`);
    }
    parts.push(diceSvg(R, bottom));
    parts.push(cubeSvg(R, bottom));
    // Ziele des angetippten Steins
    for (const [to, die] of targets) {
      if (to === 'off') {
        parts.push(`<g class="bg-target"><circle cx="${TRAY_X + 55}" cy="${R.turn === bottom ? 600 : 200}" r="${R_CHECKER}"/><text x="${TRAY_X + 55}" y="${(R.turn === bottom ? 600 : 200) + 9}">${die}</text></g>`);
        continue;
      }
      const { x, y } = landing(R, Number(to), bottom);
      parts.push(`<g class="bg-target"><circle cx="${x}" cy="${y}" r="${R_CHECKER}"/><text x="${x}" y="${y + 9}">${die}</text></g>`);
    }
    // Vorschläge aus dem Team
    for (const s of R.suggestions) {
      if (s.to === 'off') continue;
      const { x, y } = landing(R, Number(s.to), bottom);
      const name = playerName(s.playerId);
      parts.push(`<g class="bg-suggest"><circle cx="${x}" cy="${y}" r="20"/><text x="${x}" y="${y + 7}">${esc(name[0] || '?')}</text></g>`);
    }
    // Tippflächen
    if (froms.size) {
      for (let i = 1; i <= 24; i++) {
        const { col, top: isTop } = place(i, bottom);
        parts.push(`<rect class="bg-hit" data-action="bgPoint" data-pt="${i}" x="${colX(col) - COL / 2}" y="${isTop ? TOP : BOTTOM - TIP - 40}" width="${COL}" height="${TIP + 40}"/>`);
      }
      parts.push(`<rect class="bg-hit" data-action="bgPoint" data-pt="bar" x="${BAR_X}" y="${TOP}" width="${BAR_W}" height="${BOTTOM - TOP}"/>`);
      parts.push(`<rect class="bg-hit" data-action="bgPoint" data-pt="off" x="${TRAY_X}" y="${TOP}" width="110" height="${BOTTOM - TOP}"/>`);
    }
    return `<svg class="bg-svg" viewBox="0 0 1060 800" role="img" aria-label="Backgammon-Brett">${parts.join('')}</svg>`;
  }

  // ---------- Spielansicht ----------

  function sideCard(R, c) {
    const s = R.sides[c];
    const active = R.actor === c || (R.phase === 'opening' && R.openDice[c] === null);
    let who;
    if (R.teamMode) {
      const team = teamById(s.teamId);
      who = `<span class="team-dot" style="--team:${team?.color || 'var(--line)'}"></span><span class="bg-side-name">${esc(s.name)}</span>`;
    } else {
      who = `${avatarHtml(playerById(s.ids[0]), 'sm')}<span class="bg-side-name">${esc(s.name)}</span>`;
    }
    const mover = R.teamMode && s.ids[0] ? `<div class="small muted">zieht: ${esc(playerName(s.ids[0]))}</div>` : '';
    const offline = !s.present ? '<div class="small" style="color:var(--pink)">nicht da</div>' : '';
    const cube = R.cube.enabled && R.cube.owner === c && R.cube.value > 1 ? `<span class="bg-mini-cube" title="Verdopplungswürfel">${R.cube.value}</span>` : '';
    return `<div class="bg-side ${active ? 'active' : ''}">
      <div class="row" style="gap:6px;flex-wrap:nowrap">${chip(c)}${who}${cube}</div>
      ${mover}${offline}
      <div class="bg-score"><b>${R.score[c]}</b><span class="muted small"> / ${R.matchTo}</span></div>
      ${R.showPips ? `<div class="small muted">noch ${s.pips} Augen</div>` : ''}
    </div>`;
  }

  function viewStatus(R) {
    let text;
    if (R.waiting) {
      text = `⏳ Warte auf ${actorName(R, R.waiting)} …`;
    } else if (R.phase === 'opening') {
      const missing = ['w', 'b'].filter((c) => R.openDice[c] === null);
      text = R.openTie ? `Gleichstand mit ${R.openTie[0]}! Beide würfeln noch einmal.` : `Anfangswurf: Wer die höhere Zahl würfelt, beginnt. ${missing.length === 1 ? `Es fehlt noch ${actorName(R, missing[0])}.` : ''}`;
    } else if (R.phase === 'roll') {
      text = `${actorName(R, R.actor)} ist dran${R.canDouble ? ': würfeln oder verdoppeln' : ': würfeln'}`;
    } else if (R.phase === 'move') {
      text = `${actorName(R, R.actor)} zieht${R.dice ? ` mit ${R.dice.filter((d, i) => i < 2 || R.dice[0].value !== R.dice[1].value).map((d) => d.value).join(' und ')}${R.dice.length === 4 ? ' (Pasch!)' : ''}` : ''}`;
    } else if (R.phase === 'doubled') {
      text = `${sideName(R, other(R.actor))} verdoppelt auf ${R.cube.value * 2}. ${actorName(R, R.actor)} nimmt an oder gibt auf.`;
    } else if (R.phase === 'gameEnd' || R.phase === 'final') {
      text = R.result ? `${sideName(R, R.result.winner)} gewinnt ${R.phase === 'final' ? 'die Partie' : 'das Spiel'}!` : '';
    }
    const mine = R.actor && R.myColors.includes(R.actor) && !R.waiting;
    return `<div class="bg-status ${mine ? 'mine' : ''}">${text}</div>`;
  }

  function viewControls(R) {
    const mine = (c) => R.myColors.includes(c);
    if (R.phase === 'opening') {
      const c = ['w', 'b'].find((x) => R.openDice[x] === null && mine(x));
      if (!c) return '';
      return `<div class="bg-controls"><button class="btn primary big" data-action="bgRoll">🎲 Anfangswurf${R.myColors.length > 1 || sharedHere() ? ` für ${esc(R.sides[c].name)}` : ''}</button></div>`;
    }
    if (!R.actor || !mine(R.actor)) {
      if (canSuggest(R)) return '<div class="small muted center">Tippe einen Stein und sein Ziel an, um deinem Team einen Zug vorzuschlagen.</div>';
      return '';
    }
    if (R.phase === 'roll') {
      return `<div class="bg-controls">
        ${R.canDouble ? `<button class="btn big" data-action="bgDouble">✖️2 Verdoppeln auf ${R.cube.value * 2}</button>` : ''}
        <button class="btn primary big" data-action="bgRoll">🎲 Würfeln${R.myColors.length > 1 ? ` (${esc(R.sides[R.actor].name)})` : ''}</button>
      </div>`;
    }
    if (R.phase === 'move') {
      const hint = R.canCommit ? 'Alles gezogen. Passt der Zug?' : bg.selected !== null ? 'Jetzt das Ziel antippen.' : 'Tippe einen Stein an, dann sein Ziel.';
      return `<div class="stack" style="gap:8px">
        <div class="small muted center">${hint}</div>
        <div class="bg-controls">
          <button class="btn big" data-action="bgUndo" ${R.pending.length ? '' : 'disabled'}>↩︎ Rückgängig</button>
          <button class="btn primary big" data-action="bgCommit" ${R.canCommit ? '' : 'disabled'}>✅ Zug fertig</button>
        </div>
      </div>`;
    }
    if (R.phase === 'doubled') {
      const v = R.cube.value;
      return `<div class="stack" style="gap:8px">
        <div class="bg-controls">
          <button class="btn primary big" data-action="bgTake">👍 Annehmen (um ${v * 2} weiterspielen)</button>
          <button class="btn pink big" data-action="bgDrop">🏳️ Aufgeben (${v} ${v === 1 ? 'Punkt' : 'Punkte'} für ${sideName(R, other(R.actor))})</button>
        </div>
        <div class="small muted center">Annehmen: Ab jetzt geht es um ${v * 2} Punkte, und nur ${sideName(R, R.actor)} darf als Nächstes verdoppeln. Aufgeben: Das Spiel ist sofort verloren, aber nur mit ${v} ${v === 1 ? 'Punkt' : 'Punkten'}.</div>
      </div>`;
    }
    return '';
  }

  function viewTips(R) {
    if (R.phase !== 'opening' || !R.tipsOpen) return '';
    const total = R.tipCounts.w + R.tipCounts.b;
    // Der Fernseher eines reinen Gamemasters tippt nicht mit
    const canTip = !R.mySide && !R.myColors.length && !isGamemaster();
    const buttons = canTip
      ? `<div class="bg-controls">${['w', 'b'].map((c) => `<button class="btn big ${R.myTip === c ? 'primary' : ''}" data-action="bgTip" data-color="${c}">${chip(c)} ${sideName(R, c)} gewinnt</button>`).join('')}</div>`
      : '';
    if (!buttons && !total) return '';
    return `<div class="card stack bg-tips">
      <div><b>🔮 Wer gewinnt dieses Spiel?</b> <span class="small muted">Zuschauer tippen bis zum ersten Zug. Jeder richtige Tipp gibt einen Punkt.</span></div>
      ${buttons}
      ${total ? `<div class="small muted center">${R.tipCounts.w} für ${sideName(R, 'w')} · ${R.tipCounts.b} für ${sideName(R, 'b')}</div>` : ''}
    </div>`;
  }

  // Duell: Fehlt ein Spieler, kann der Host jemand anderen einsetzen
  function viewSeatSwap(R) {
    if (!S.me.isHost || R.teamMode || R.phase === 'final') return '';
    const missing = ['w', 'b'].filter((c) => !R.sides[c].present);
    if (!missing.length) return '';
    const seated = new Set(['w', 'b'].map((c) => R.sides[c].ids[0]));
    const candidates = S.players.filter((p) => p.connected && !seated.has(p.id) && (!p.isHost || S.settings.hostPlays));
    if (!candidates.length) return '';
    return `<div class="card stack">${missing.map((c) => `<div><b>${sideName(R, c)} ist nicht da.</b> <span class="small muted">Wer übernimmt ${COLOR_NAMES[c]}?</span></div>
      <div class="row">${candidates.map((p) => `<button class="btn small" data-action="bgSeat" data-color="${c}" data-player="${p.id}">${avatarHtml(p, 'sm')} ${esc(p.name)}</button>`).join('')}</div>`).join('')}</div>`;
  }

  function resultText(r) {
    if (r.dropped) return 'Aufgabe nach Verdopplung';
    if (r.counted === 3) return 'Backgammon!';
    if (r.counted === 2) return 'Gammon!';
    if (r.type > 1) return r.type === 3 ? 'Backgammon (zählt einfach)' : 'Gammon (zählt einfach)';
    return 'Sieg';
  }

  function viewGameEnd(R) {
    const r = R.result;
    if (!r) return '';
    const right = Object.entries(r.tips || {}).filter(([, c]) => c === r.winner).map(([id]) => esc(playerName(id)));
    return `<div class="card stack bg-result">
      <div class="bg-result-head">${chip(r.winner)} ${sideName(R, r.winner)}: ${resultText(r)} <b>+${r.points}</b></div>
      ${r.cube > 1 ? `<div class="small muted center">Verdopplungswürfel auf ${r.cube}</div>` : ''}
      <div class="center bg-bigscore">${sideName(R, 'w')} <b>${R.score.w}</b> : <b>${R.score.b}</b> ${sideName(R, 'b')}</div>
      ${right.length ? `<div class="small center">🔮 Richtig getippt: ${right.join(', ')}</div>` : ''}
      ${R.phase === 'gameEnd' ? `<div class="small muted center">${S.me.isHost ? 'Starte das nächste Spiel unten in der Leiste.' : 'Gleich startet der Host das nächste Spiel.'}</div>` : ''}
    </div>`;
  }

  function viewLog(R) {
    if (!R.log.length) return '';
    return `<div class="bg-log">${[...R.log].reverse().slice(0, 4).map((l) => `<div>${esc(l.text)}</div>`).join('')}</div>`;
  }

  function viewPlaying(R) {
    const bottom = bottomColor(R);
    return `<div class="stack bg">
      <div class="q-head">
        <div class="small muted"><b>Backgammon</b> · Spiel ${R.gameNo} · Partie bis ${R.matchTo}${R.cube.crawford ? ' · Crawford-Spiel, kein Verdoppeln' : ''}</div>
        ${R.deadline ? '<span class="timer" id="timer"></span>' : ''}
      </div>
      <div class="bg-sides">${sideCard(R, other(bottom))}${sideCard(R, bottom)}</div>
      ${viewStatus(R)}
      <div class="bg-board">${boardSvg(R)}</div>
      <div class="bg-rotate small muted center">Tipp: Im Querformat wird das Brett größer.</div>
      ${viewControls(R)}
      ${viewTips(R)}
      ${R.phase === 'gameEnd' ? viewGameEnd(R) : ''}
      ${viewSeatSwap(R)}
      ${viewLog(R)}
    </div>`;
  }

  function viewFinal(R) {
    const winner = R.result.winner;
    const tips = Object.entries(R.tipScore).sort((a, b) => b[1] - a[1]);
    const statRow = (icon, title, fn) => `<div class="score-row" style="--team:var(--accent)"><span class="rank">${icon}</span><span class="name">${title}</span>
      <span class="small">${sideName(R, 'w')}: <b>${fn('w')}</b> · ${sideName(R, 'b')}: <b>${fn('b')}</b></span></div>`;
    return `<div class="stack bg">
      <div class="center"><div style="font-size:3rem">🏆</div><h1>${sideName(R, winner)} gewinnt die Partie!</h1>
        <div class="bg-bigscore">${chip('w')} ${sideName(R, 'w')} <b>${R.score.w}</b> : <b>${R.score.b}</b> ${sideName(R, 'b')} ${chip('b')}</div></div>
      <div class="bg-board">${boardSvg(R)}</div>
      <div class="card stack">
        <h3 style="margin:0">Spiele</h3>
        ${R.results.map((r) => `<div class="score-row" style="--team:var(--accent)"><span class="rank">${r.gameNo}.</span><span class="name">${chip(r.winner)} ${sideName(R, r.winner)}</span>
          <span class="small muted">${resultText(r)}${r.cube > 1 ? ` · Würfel ${r.cube}` : ''}</span><b>+${r.points}</b></div>`).join('')}
      </div>
      <div class="card stack">
        <h3 style="margin:0">Statistik</h3>
        ${statRow('💥', 'Geschlagene Steine', (c) => R.stats[c].hits)}
        ${statRow('🎲', 'Pasche', (c) => R.stats[c].doubles)}
      </div>
      ${tips.length ? `<div class="card stack"><h3 style="margin:0">🔮 Beste Tipper</h3>${tips.map(([id, n], i) => `<div class="score-row" style="--team:var(--accent)"><span class="rank">${i + 1}.</span>${avatarHtml(playerById(id), 'sm')}
        <span class="name">${esc(playerName(id))}</span><span class="small muted">${n} richtig</span></div>`).join('')}</div>` : ''}
      ${S.me.isHost ? '' : '<div class="muted center">Der Host kann eine neue Partie starten.</div>'}
    </div>`;
  }

  function view() {
    const R = S.round;
    if (R.phase !== 'move') bg.selected = null;
    if (R.rollSeq !== bg.seenRoll) {
      bg.seenRoll = R.rollSeq;
      bg.selected = null;
      bg.rolling = R.rollSeq > 0;
      if (bg.rolling) setTimeout(() => { bg.rolling = false; document.querySelectorAll('.bg-die.rolling').forEach((d) => d.classList.remove('rolling')); }, 650);
    }
    return R.phase === 'final' ? viewFinal(R) : viewPlaying(R);
  }

  function hostbar() {
    const R = S.round;
    if (R.phase === 'final') return '<button class="btn primary" data-action="toLobby">Neue Partie (zur Lobby)</button>';
    if (R.phase === 'gameEnd') return '<button class="btn primary" data-action="next">Nächstes Spiel ▶︎</button>';
    const who = R.phase === 'opening' ? 'beide' : R.sides[R.actor]?.name || '';
    return `<button class="btn" data-action="bgForce">⏩ Für ${esc(who)} weiter</button>`;
  }

  gameViews.backgammon = { settings: viewSettings, lobbyExtra, view, hostbar };

  Object.assign(actions, {
    bgSetting: (el) => sendHost('settings', { game: { [el.dataset.key]: el.dataset.value === '1' } }),
    bgRoll: () => act('roll'),
    bgDouble: () => act('double'),
    bgTake: () => act('take'),
    bgDrop: () => { if (confirm('Wirklich aufgeben?')) act('drop'); },
    bgUndo: () => act('undo'),
    bgCommit: () => act('commit'),
    bgTip: (el) => act('tip', { color: el.dataset.color }),
    bgSeat: (el) => act('seat', { color: el.dataset.color, playerId: el.dataset.player }),
    bgRemoveGuest: (el) => socket.emit('guest:remove', { playerId: el.dataset.player }, (res) => { if (res?.error) toast(res.error); }),
    bgPoint: (el) => {
      const R = S.round;
      const pt = el.dataset.pt === 'bar' || el.dataset.pt === 'off' ? el.dataset.pt : Number(el.dataset.pt);
      const { froms, targets } = interaction(R);
      if (bg.selected !== null && targets.has(String(pt))) {
        const from = bg.selected;
        bg.selected = null;
        act(canMoveHere(R) ? 'move' : 'suggest', { from, to: pt });
        render();
        return;
      }
      if (String(pt) === String(bg.selected)) bg.selected = null;
      else if (froms.has(String(pt))) bg.selected = pt;
      else if (bg.selected === null) toast(R.board.bar[R.turn] ? 'Erst muss der Stein von der Bar rein.' : 'Dieser Stein kann gerade nicht ziehen.');
      else bg.selected = null;
      render();
    },
    bgForce: () => {
      const R = S.round;
      const what = { opening: 'den Anfangswurf würfeln', roll: 'würfeln', move: 'einen zufälligen erlaubten Zug ziehen', doubled: 'die Verdopplung annehmen' }[R.phase];
      if (confirm(`Für ${R.phase === 'opening' ? 'beide' : R.sides[R.actor].name} ${what}?`)) act('force');
    },
  });

  app.addEventListener('submit', (e) => {
    if (e.target.id !== 'bg-guest-form') return;
    e.preventDefault();
    const input = document.getElementById('bg-guest-name');
    const name = input.value.trim();
    if (!name) return toast('Bitte gib einen Namen ein.');
    const avatar = avatars.length ? avatars[Math.floor(Math.random() * avatars.length)] : null;
    socket.emit('guest:add', { name, avatar }, (res) => {
      if (res?.error) return toast(res.error);
      const field = document.getElementById('bg-guest-name');
      if (field) field.value = '';
    });
  });

  app.addEventListener('change', (e) => {
    if (S?.game.id !== 'backgammon') return;
    const id = e.target.id;
    if (id === 'bg-match') sendHost('settings', { game: { matchTo: Number(e.target.value) } });
    else if (id === 'bg-time') sendHost('settings', { game: { timeLimit: Number(e.target.value) } });
    else if (id === 'bg-seat-w' || id === 'bg-seat-b') sendHost('settings', { game: { seats: { [id.slice(-1)]: e.target.value || null } } });
  });
})();
