// Schach: Spielansicht für Host und Handys (nutzt die Helfer aus lobby.js)

(() => {
  const GAMES = [[1, 'Eine Partie'], [3, '3 Partien'], [5, '5 Partien'], [0, 'Ohne Ende']];
  const CLOCKS = [0, 3, 5, 10, 15, 30];
  const COLOR_CLASSIC = { 0: 'Weiß', 2: 'Schwarz' };
  const COLOR_CROSS = { 0: 'Rot', 1: 'Blau', 2: 'Gelb', 3: 'Grün' };
  const PIECE_NAME = { k: 'König', q: 'Dame', r: 'Turm', b: 'Läufer', n: 'Springer', p: 'Bauer' };
  const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const FILES = 'abcdefghijklmn';
  const U = 100; // Feldgröße im SVG
  const ROTATE_KEY = 'afng:schach:drehen';
  const sc = {
    sel: null, // angetippte eigene Figur
    promo: null, // { from, to } während der Bauer auf die Wahl wartet
    seenSeq: null,
    fresh: false,
    movesOpen: window.innerWidth >= 900, // Zugliste aufgeklappt
    bottom: null, // Platz, der unten liegt (bleibt stehen, wenn keiner der eigenen dran ist)
  };

  function act(type, data = {}) {
    socket.emit('game:action', { type, ...data }, (res) => {
      if (res?.error) toast(res.error);
    });
  }

  function playerName(id) {
    return playerById(id)?.name || 'Jemand';
  }

  function fmtScore(n) {
    return String(n).replace('.5', '½').replace(/^0½/, '½');
  }

  function colorName(R, seat) {
    return (R.cross ? COLOR_CROSS : COLOR_CLASSIC)[seat];
  }

  function seatClass(R, seat) {
    return R.cross ? `c${seat}` : seat === 0 ? 'cw' : 'cb';
  }

  function seatById(R, id) {
    return R.seats.find((s) => s.id === id);
  }

  function rotateOn() {
    return store.get(ROTATE_KEY) !== '0';
  }

  function fmtClock(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(total / 60);
    return `${m}:${String(total % 60).padStart(2, '0')}`;
  }

  // ---------- Figuren (eigene Zeichnungen, damit kein Handy Emojis daraus macht) ----------

  const BASE = '<rect x="24" y="78" width="52" height="11" rx="4"/>';
  const SHAPES = {
    p: `<circle cx="50" cy="30" r="13"/><path d="M35 78 Q37 56 44 45 L56 45 Q63 56 65 78 Z"/>${BASE}`,
    r: `<path d="M33 78 L36 42 L64 42 L67 78 Z"/><path d="M28 42 L28 18 L38 18 L38 26 L45 26 L45 18 L55 18 L55 26 L62 26 L62 18 L72 18 L72 42 Z"/>${BASE}`,
    b: `<path d="M34 78 Q36 62 42 54 L58 54 Q64 62 66 78 Z"/><path d="M50 16 C67 30 66 46 58 54 L42 54 C34 46 33 30 50 16 Z"/><circle cx="50" cy="12" r="6"/><path class="sc-line" d="M55 28 L46 40"/>${BASE}`,
    n: `<path d="M32 78 L34 62 C34 52 40 46 46 40 L32 46 C24 49 18 42 23 35 L43 18 L45 9 L53 17 C68 20 76 36 73 52 L70 78 Z"/><circle class="sc-eye" cx="47" cy="28" r="3.5"/>${BASE}`,
    q: `<path d="M32 78 L25 36 L39 54 L44 26 L50 50 L56 26 L61 54 L75 36 L68 78 Z"/><circle cx="25" cy="32" r="6"/><circle cx="44" cy="22" r="6"/><circle cx="56" cy="22" r="6"/><circle cx="75" cy="32" r="6"/>${BASE}`,
    k: `<path d="M32 78 Q27 54 33 42 L67 42 Q73 54 68 78 Z"/><rect x="30" y="36" width="40" height="9" rx="3"/><path d="M45 6 H55 V14 H63 V23 H55 V36 H45 V23 H37 V14 H45 Z"/>${BASE}`,
  };

  // Die Verschiebung sitzt außen als Attribut, die Animation innen (CSS-transform würde sie sonst ersetzen)
  function pieceSvg(t, cls, x, y, anim = '') {
    return `<g class="sc-piece ${cls}" transform="translate(${x} ${y})"><g class="sc-shape ${anim ? 'slide' : ''}" ${anim}>${SHAPES[t]}</g></g>`;
  }

  function pieceIcon(t, cls) {
    return `<svg class="sc-icon ${cls}" viewBox="0 0 100 100" aria-label="${PIECE_NAME[t]}"><g class="sc-piece"><g class="sc-shape">${SHAPES[t]}</g></g></svg>`;
  }

  // ---------- Lobby ----------

  function playingCount() {
    const s = S.settings;
    return S.players.filter((p) => p.connected && (!p.isHost || s.hostPlays)).length;
  }

  function lobbyExtra() {
    if (S.me.isHost && !S.settings.hostPlays) return '';
    const guests = S.players.filter((p) => p.guestOf === S.me.id);
    const full = playingCount() >= 4;
    return `<div class="card stack">
      <h3 style="margin:0">Mitspieler an diesem Gerät</h3>
      <div class="small muted">Nicht jeder hat ein Handy? Tragt euch hier ein, dann spielt ihr an diesem Gerät und gebt es nach jedem Zug weiter, wie an einem echten Brett. Es geht auch ganz ohne weitere Geräte.</div>
      ${guests.map((p) => `<div class="member">${avatarHtml(p, 'sm')}<span class="name">${esc(p.name)}</span>
        <button class="btn small icon ghost" data-action="scRemoveGuest" data-player="${p.id}" title="Entfernen">✕</button></div>`).join('')}
      ${full ? '<div class="small muted">Mehr als vier spielen nicht mit.</div>' : `<form id="sc-guest-form" class="row" style="flex-wrap:nowrap">
        <input id="sc-guest-name" type="text" maxlength="24" placeholder="Name" autocomplete="off" style="flex:1;min-width:0">
        <button class="btn primary small" type="submit">+ Hinzufügen</button>
      </form>`}
    </div>`;
  }

  function segmented(key, value, options) {
    return `<div class="segmented">${options.map(([v, text]) => `<button data-action="scSetting" data-key="${key}" data-value="${v}" class="${String(v) === String(value) ? 'on' : ''}">${text}</button>`).join('')}</div>`;
  }

  function modeText(count, fourMode) {
    if (count === 2) return '♟️ Zu zweit: klassisches Schach auf 8 × 8, Weiß gegen Schwarz.';
    if (count === 3) return '✚ Zu dritt: Kreuzbrett, jeder gegen jeden (Rot, Blau, Gelb).';
    if (count === 4) return fourMode === 'teams' ? '✚ Zu viert: Kreuzbrett, zwei gegen zwei. Wer gegenüber sitzt, spielt zusammen.' : '✚ Zu viert: Kreuzbrett, jeder gegen jeden.';
    return null;
  }

  function viewSettings() {
    const s = S.settings;
    const g = s.game;
    const playing = playingCount();
    const mode = modeText(playing, g.fourMode);
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
      ${mode ? `<div class="sc-mode">${mode}</div>` : `<div class="sc-note">Schach spielt man zu zweit, zu dritt oder zu viert. Gerade ${playing === 1 ? 'ist 1 Spieler' : `sind ${playing} Spieler`} da.</div>`}
      <div class="grid-2" style="gap:12px">
        <label class="field"><span>Partien</span>
          <select id="sc-games">${GAMES.map(([n, text]) => `<option value="${n}" ${n === g.games ? 'selected' : ''}>${text}</option>`).join('')}</select>
        </label>
        <label class="field"><span>Bedenkzeit pro Spieler</span>
          <select id="sc-clock">${CLOCKS.map((t) => `<option value="${t}" ${t === g.clock ? 'selected' : ''}>${t ? `${t} Minuten` : 'Ohne Uhr'}</option>`).join('')}</select>
        </label>
      </div>
      <div><div class="small muted" style="font-weight:700;margin-bottom:6px">Zu viert</div>${segmented('fourMode', g.fourMode, [['ffa', '⚔️ Jeder gegen jeden'], ['teams', '🤝 Zwei gegen zwei']])}</div>
      <div><div class="small muted" style="font-weight:700;margin-bottom:6px">Mögliche Züge zeigen</div>${segmented('preview', g.preview ? 1 : 0, [[1, '✨ An'], [0, 'Aus']])}</div>
      <div class="small muted">So geht's: Es gelten die normalen Schachregeln mit Rochade${playing === 2 ? ', en passant' : ''} und Umwandlung. Wer am Zug keinen Zug mehr hat, ist matt (im Schach) oder patt. ${playing >= 3 ? 'Auf dem Kreuzbrett wird im Uhrzeigersinn gezogen: Rot, Blau, Gelb, Grün. Bauern verwandeln sich schon auf der 8. Reihe (der Mitte des Bretts), en passant gibt es dort nicht. ' : ''}${playing >= 3 && !(playing === 4 && g.fourMode === 'teams') ? 'Wer matt oder patt ist oder aufgibt, scheidet aus, seine Figuren bleiben grau als Hindernis stehen und dürfen geschlagen werden. Wer zuletzt übrig ist, gewinnt. Punkte gibt es nach Platz. ' : ''}${playing === 4 && g.fourMode === 'teams' ? 'Partner sitzen gegenüber und schlagen sich nicht. Das erste Matt entscheidet, Patt ist Remis. ' : ''}Dreimal dieselbe Stellung, ${50} Züge ohne Schlagen und Bauernzug oder zu wenig Figuren sind Remis.${g.clock ? ' Wessen Uhr abläuft, verliert bzw. scheidet aus.' : ''} Jede Partie rücken alle einen Platz weiter.</div>
    </div>`;
  }

  // ---------- Brett ----------

  // Dreht das Brett so, dass `bottom` unten sitzt: Brettkoordinaten -> Bildschirmkoordinaten
  function orient(R, bottom) {
    const n = R.n;
    const m = n - 1;
    const r = R.cross ? bottom : bottom === 2 ? 2 : 0;
    return (x, y) => {
      switch (r) {
        case 1: return [m - y, x];
        case 2: return [m - x, m - y];
        case 3: return [y, m - x];
        default: return [x, y];
      }
    };
  }

  function validSq(R, x, y) {
    if (!R.cross) return true;
    return !((x < 3 || x > 10) && (y < 3 || y > 10));
  }

  function pickBottom(R) {
    const mine = R.seats.filter((s) => s.mine);
    if (mine.length === 1) return mine[0].seat;
    if (mine.length > 1) {
      if (rotateOn() && R.turn !== null && mine.some((s) => s.seat === R.turn)) sc.bottom = R.turn;
      if (sc.bottom === null || !mine.some((s) => s.seat === sc.bottom)) sc.bottom = mine[0].seat;
      return sc.bottom;
    }
    return R.seats[0].seat;
  }

  function legalFrom(R) {
    const map = new Map();
    for (const [from, to, promo] of R.legal) {
      if (!map.has(from)) map.set(from, new Map());
      const targets = map.get(from);
      if (!targets.has(to)) targets.set(to, !!promo);
    }
    return map;
  }

  function viewBoard(R) {
    const n = R.n;
    const bottom = pickBottom(R);
    const toScreen = orient(R, bottom);
    const px = (idx) => {
      const [sx, sy] = toScreen(idx % n, Math.floor(idx / n));
      return [sx * U, (n - 1 - sy) * U];
    };
    const moves = legalFrom(R);
    if (sc.sel !== null && !moves.has(sc.sel)) sc.sel = null;
    const targets = sc.sel !== null ? moves.get(sc.sel) : new Map();
    const last = R.lastMove;
    const alive = Object.fromEntries(R.seats.map((s) => [s.seat, s.alive]));
    const checked = new Set(R.seats.filter((s) => s.check).map((s) => s.seat));
    let squares = '';
    let marks = '';
    let pieces = '';
    let labels = '';
    for (let idx = 0; idx < n * n; idx++) {
      const x = idx % n;
      const y = Math.floor(idx / n);
      if (!validSq(R, x, y)) continue;
      const [X, Y] = px(idx);
      const dark = (x + y) % 2 === 0;
      const p = R.board[idx];
      const pickable = R.mine && moves.has(idx);
      const target = targets.has(idx);
      const tappable = pickable || target;
      const cls = ['sc-sq', dark ? 'dark' : 'light', tappable ? 'tap' : ''].join(' ');
      squares += `<rect class="${cls}" x="${X}" y="${Y}" width="${U}" height="${U}" ${tappable ? `data-action="scTap" data-sq="${idx}"` : ''}/>`;
      if (last && (last.from === idx || last.to === idx)) marks += `<rect class="sc-last" x="${X}" y="${Y}" width="${U}" height="${U}"/>`;
      if (sc.sel === idx) marks += `<rect class="sc-sel" x="${X}" y="${Y}" width="${U}" height="${U}"/>`;
      if (p && p[1] === 'k' && checked.has(p[0])) marks += `<circle class="sc-check" cx="${X + U / 2}" cy="${Y + U / 2}" r="${U * 0.55}"/>`;
      if (target && R.preview !== false) {
        marks += p ? `<circle class="sc-hit" cx="${X + U / 2}" cy="${Y + U / 2}" r="${U * 0.44}"/>` : `<circle class="sc-dot" cx="${X + U / 2}" cy="${Y + U / 2}" r="${U * 0.15}"/>`;
      }
      if (p) {
        const [o, t] = p;
        let anim = '';
        if (sc.fresh && last) {
          let src = null;
          if (last.to === idx) src = last.from;
          else if (last.castle && last.castle.to === idx) src = last.castle.from;
          if (src !== null) {
            const [fx, fy] = px(src);
            anim = `style="--dx:${fx - X}px;--dy:${fy - Y}px"`;
          }
        }
        const pcls = `${seatClass(R, o)} ${alive[o] === false ? 'dead' : ''} ${pickable ? 'tap' : ''}`;
        pieces += `<g ${tappable ? `data-action="scTap" data-sq="${idx}"` : ''} class="${tappable ? 'tap' : ''}">${pieceSvg(t, pcls, X, Y, anim)}</g>`;
      }
    }
    // Ein geschlagener Stein verblasst kurz an seinem Feld
    if (sc.fresh && last?.captured && last.capturedAt !== null) {
      const [X, Y] = px(last.capturedAt);
      pieces = `${pieceSvg(last.captured.t, `${seatClass(R, last.captured.o)} ghost`, X, Y)}${pieces}`;
    }
    // Buchstaben und Zahlen am unteren und linken Rand
    for (let idx = 0; idx < n * n; idx++) {
      const x = idx % n;
      const y = Math.floor(idx / n);
      if (!validSq(R, x, y)) continue;
      const [sx, sy] = toScreen(x, y);
      const rowEdge = sy === 0 || (R.cross && sy === 3 && (sx < 3 || sx > 10));
      const colEdge = sx === 0 || (R.cross && sx === 3 && (sy < 3 || sy > 10));
      const [X, Y] = px(idx);
      const lightText = (x + y) % 2 === 0 ? 'on-dark' : 'on-light';
      // Welche Brettachse unten verläuft, hängt von der Drehung ab
      const horizontalIsFile = toScreen(1, 0)[1] === toScreen(0, 0)[1];
      if (rowEdge) labels += `<text class="sc-lbl ${lightText}" x="${X + U - 8}" y="${Y + U - 8}" text-anchor="end">${horizontalIsFile ? FILES[x] : y + 1}</text>`;
      if (colEdge) labels += `<text class="sc-lbl ${lightText}" x="${X + 7}" y="${Y + 24}">${horizontalIsFile ? y + 1 : FILES[x]}</text>`;
    }
    const turnCls = R.turn !== null ? seatClass(R, R.turn) : '';
    return `<div class="sc-board ${R.cross ? 'cross' : 'classic'} ${R.mine ? `mine turn-${turnCls}` : ''}">
      <svg viewBox="0 0 ${n * U} ${n * U}" role="img" aria-label="Schachbrett">
        <g>${squares}</g><g class="sc-marks">${marks}</g><g class="sc-labels">${labels}</g><g>${pieces}</g>
      </svg>
      ${sc.promo ? viewPromo(R) : ''}
    </div>`;
  }

  function viewPromo(R) {
    const cls = seatClass(R, R.turn);
    return `<div class="sc-promo"><div class="sc-promo-box">
      <div style="font-weight:900">Verwandeln in …</div>
      <div class="sc-promo-row">${['q', 'r', 'b', 'n'].map((t) => `<button class="sc-promo-btn" data-action="scPromo" data-piece="${t}" title="${PIECE_NAME[t]}">${pieceIcon(t, cls)}<span class="small">${PIECE_NAME[t]}</span></button>`).join('')}</div>
      <button class="btn small ghost" data-action="scPromoCancel">Abbrechen</button>
    </div></div>`;
  }

  // ---------- Spieler ----------

  function capturedHtml(R, seat) {
    const order = ['q', 'r', 'b', 'n', 'p'];
    const list = [...seat.captured].filter((t) => t !== 'k').sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const sum = list.reduce((a, t) => a + VALUE[t], 0);
    if (!list.length) return '<span class="small muted">–</span>';
    return `<span class="sc-caps">${list.map((t) => pieceIcon(t, 'mini')).join('')}</span><b class="small">+${sum}</b>`;
  }

  function viewSeat(R, seat) {
    const player = playerById(seat.id);
    const active = R.phase === 'play' && R.turn === seat.seat;
    const team = seat.team !== null ? `<span class="sc-team">${seat.team === 0 ? 'Team Rot/Gelb' : 'Team Blau/Grün'}</span>` : '';
    let status = '';
    if (!seat.alive && seat.out) status = `<span class="sc-tag out">✖ ${esc(seat.out)}</span>`;
    else if (seat.check) status = '<span class="sc-tag check">Schach!</span>';
    else if (active) status = '<span class="sc-tag turn">am Zug</span>';
    const clock = seat.clock !== null ? `<span class="sc-clock ${active ? 'run' : ''}" ${active && R.clockRunning ? `data-sc-clock="${seat.clock}"` : ''}>${fmtClock(seat.clock)}</span>` : '';
    return `<div class="sc-seat ${seatClass(R, seat.seat)} ${active ? 'active' : ''} ${seat.alive ? '' : 'dead'} ${player?.connected === false ? 'offline' : ''}">
      <div class="sc-who">${avatarHtml(player, 'sm')}<div class="sc-who-text">
        <div class="sc-name"><span class="sc-dot-c"></span>${esc(playerName(seat.id))}</div>
        <div class="small muted">${colorName(R, seat.seat)} ${team}</div>
      </div>${clock}<div class="sc-score" title="Punkte">${fmtScore(seat.score)}</div></div>
      <div class="sc-row">${status || '<span></span>'}<span class="sc-capwrap">${capturedHtml(R, seat)}</span></div>
    </div>`;
  }

  function viewStatus(R) {
    if (R.phase !== 'play' || R.turn === null) return '';
    const seat = R.seats.find((s) => s.seat === R.turn);
    const who = `${avatarHtml(playerById(seat.id), 'sm')} ${esc(playerName(seat.id))} (${colorName(R, seat.seat)})`;
    let text;
    if (R.mine) text = seat.check ? `${who} steht im Schach und ist dran!` : sc.sel !== null ? `${who}: wohin ziehen?` : `${who} ist dran: zieh eine Figur`;
    else text = seat.check ? `${who} steht im Schach und überlegt` : `${who} ist dran`;
    return `<div class="sc-status ${R.mine ? 'mine' : ''} ${seat.check ? 'check' : ''} ${seatClass(R, seat.seat)}">${text}</div>`;
  }

  function viewHistory(R) {
    const items = R.history.slice(-40);
    if (!items.length) return '<div class="small muted">Noch kein Zug.</div>';
    return `<ol class="sc-history" start="${R.history.length - items.length + 1}">${items.map((h) => `<li class="${h.event ? 'event' : ''}"><span class="sc-dot-c ${seatClass(R, h.seat)}"></span>${h.event ? `${esc(playerName(R.seats.find((s) => s.seat === h.seat)?.id))}: ` : ''}${esc(h.note)}</li>`).join('')}</ol>`;
  }

  function scoreLine(R) {
    return [...R.seats].sort((a, b) => b.score - a.score).map((s) => `${esc(playerName(s.id))} <b>${fmtScore(s.score)}</b>`).join(' · ');
  }

  function viewResult(R) {
    const r = R.result;
    let head;
    if (r.draw) head = `🤝 Partie ${r.gameNo}: Remis`;
    else if (r.mode === 'teams') head = `🏆 ${r.winnerIds.map((id) => esc(playerName(id))).join(' & ')} gewinnen Partie ${r.gameNo}!`;
    else head = `🏆 ${esc(playerName(r.winnerIds[0]))} gewinnt Partie ${r.gameNo}!`;
    const order = Object.entries(r.places).sort((a, b) => a[1] - b[1]);
    return `<div class="sc-result card stack">
      <div class="sc-result-head">${head}</div>
      <div class="muted">${esc(r.reasonText)} · ${r.moves} Züge</div>
      ${r.mode === 'ffa' ? `<div class="sc-places">${order.map(([id, place]) => `<div>${Number.isInteger(place) ? `${place}.` : '='} ${avatarHtml(playerById(id), 'sm')} ${esc(playerName(id))} <b>+${fmtScore(r.points[id])}</b></div>`).join('')}</div>` : ''}
      <div class="sc-series">${scoreLine(R)}</div>
      ${S.me.isHost ? '' : '<div class="small muted">Gleich startet der Host die nächste Partie, dann rückt jeder einen Platz weiter.</div>'}
    </div>`;
  }

  function viewPlaying(R) {
    const mineSeats = R.seats.filter((s) => s.mine && s.alive);
    const away = R.away.map((a) => `<div class="sc-note">📵 ${esc(playerName(a.id))} ist nicht verbunden. Ohne Rückkehr innerhalb einer Minute ${R.phase === 'play' ? 'gilt die Partie für sie oder ihn als aufgegeben' : 'endet das Spiel'}.</div>`).join('');
    const turnMine = mineSeats.find((s) => s.seat === R.turn);
    const resignWho = turnMine || mineSeats[0];
    const resign = R.phase === 'play' && resignWho ? `<button class="btn small ghost" data-action="scResign">🏳️ Aufgeben${R.seats.filter((s) => s.mine).length > 1 ? ` (${esc(playerName(resignWho.id))})` : ''}</button>` : '';
    const rotate = R.seats.filter((s) => s.mine).length > 1 ? `<button class="btn small ghost" data-action="scRotate">🔄 Brett drehen: ${rotateOn() ? 'an' : 'aus'}</button>` : '';
    // Reihenfolge der Spielerkarten: im Uhrzeigersinn ab dem, der unten sitzt
    const bottom = pickBottom(R);
    const seats = [...R.seats].sort((a, b) => ((a.seat - bottom + 4) % 4) - ((b.seat - bottom + 4) % 4));
    return `<div class="stack">
      <div class="q-head">
        <div class="small muted"><b>Schach</b> · Partie ${R.gameNo}${R.games ? ` von ${R.games}` : ''} · ${R.mode === 'classic' ? 'klassisch' : R.mode === 'teams' ? 'zwei gegen zwei' : 'jeder gegen jeden'}</div>
      </div>
      ${away}
      ${viewStatus(R)}
      <div class="sc-layout">
        <div class="sc-main">${viewBoard(R)}</div>
        <div class="sc-side">
          <div class="sc-seats">${seats.map((s) => viewSeat(R, s)).join('')}</div>
          <details class="sc-moves card" id="sc-moves" ${sc.movesOpen ? 'open' : ''}><summary><b>Züge</b></summary>${viewHistory(R)}</details>
          ${resign || rotate ? `<div class="row" style="justify-content:center;gap:8px">${rotate}${resign}</div>` : ''}
        </div>
      </div>
      ${R.phase === 'gameEnd' ? viewResult(R) : ''}
    </div>`;
  }

  function viewFinal(R) {
    const ranking = [...R.seats].sort((a, b) => b.score - a.score);
    const best = ranking[0].score;
    const winners = ranking.filter((s) => s.score === best);
    const tie = winners.length > 1;
    const stat = (label, fn) => `<tr><td class="muted">${label}</td>${ranking.map((s) => `<td>${fn(R.stats[s.id])}</td>`).join('')}</tr>`;
    return `<div class="stack">
      <div class="center">
        <div style="font-size:3rem">${tie ? '🤝' : '🏆'}</div>
        <h1>${tie ? `Gleichstand: ${winners.map((s) => esc(playerName(s.id))).join(' & ')}` : `${esc(playerName(winners[0].id))} gewinnt!`}</h1>
        <div class="row" style="justify-content:center;gap:8px">${winners.map((s) => avatarHtml(playerById(s.id))).join('')}</div>
        <div class="sc-series big">${scoreLine(R)}</div>
      </div>
      <div class="sc-final-board">${viewBoard(R)}</div>
      <div class="card stack">
        <h3 style="margin:0">Partien</h3>
        ${R.results.map((x) => `<div class="score-row" style="--team:var(--accent)"><span class="rank">${x.gameNo}.</span>
          <span class="name">${x.draw ? 'Remis' : `${x.winnerIds.map((id) => esc(playerName(id))).join(' & ')} ${x.winnerIds.length > 1 ? 'gewinnen' : 'gewinnt'}`}<div class="small muted">${esc(x.reasonText)} · ${x.moves} Züge</div></span></div>`).join('') || '<div class="muted">Keine Partie beendet.</div>'}
      </div>
      <div class="card stack">
        <h3 style="margin:0">Statistik</h3>
        <table class="sc-stats"><tr><td></td>${ranking.map((s) => `<th>${esc(playerName(s.id))}</th>`).join('')}</tr>
          ${stat('Siege', (s) => s.wins)}
          ${stat('Remis', (s) => s.draws)}
          ${stat('Matt gesetzt', (s) => s.mates)}
          ${stat('Material geschlagen', (s) => s.material)}
          ${stat('Schnellster Sieg', (s) => (s.fastestWin ? `${s.fastestWin} Züge` : '–'))}
        </table>
      </div>
      ${S.me.isHost ? '' : '<div class="muted center">Der Host kann eine neue Runde starten.</div>'}
    </div>`;
  }

  function view() {
    const R = S.round;
    if (!R.mine) {
      sc.sel = null;
      sc.promo = null;
    }
    const seq = R.lastMove?.seq ?? null;
    // Nur beim ersten Zeichnen nach einem neuen Zug animieren (beim ersten Laden gar nicht)
    sc.fresh = seq !== sc.seenSeq && sc.seenSeq !== null && seq !== null;
    if (seq !== sc.seenSeq) {
      sc.seenSeq = seq;
      sc.sel = null;
      sc.promo = null;
    }
    return R.phase === 'final' ? viewFinal(R) : viewPlaying(R);
  }

  function hostbar() {
    const R = S.round;
    if (R.phase === 'final') return '<button class="btn primary" data-action="toLobby">Neue Runde (zur Lobby)</button>';
    const finish = R.games ? '' : '<button class="btn" data-action="scFinish">🏁 Serie beenden</button>';
    if (R.phase === 'gameEnd') return `${finish}<button class="btn primary" data-action="next">Nächste Partie ▶︎</button>`;
    return `${finish}<button class="btn" data-action="scDraw">🤝 Remis</button><button class="btn" data-action="scForce">⏩ Zug für ${esc(playerName(R.turnId))} auslosen</button>`;
  }

  // Schachuhren laufen auf dem Gerät weiter, bis der nächste Stand kommt
  function tickClocks() {
    const R = S?.round;
    if (S?.game.id !== 'schach' || !R?.clockRunning) return;
    for (const el of document.querySelectorAll('[data-sc-clock]')) {
      const ms = Number(el.dataset.scClock) - (Date.now() + clockOffset - R.serverNow);
      el.textContent = fmtClock(ms);
      el.classList.toggle('urgent', ms < 20000);
    }
  }
  setInterval(tickClocks, 250);

  gameViews.schach = { settings: viewSettings, lobbyExtra, view, hostbar, afterRender: tickClocks };

  Object.assign(actions, {
    scSetting: (el) => {
      const raw = el.dataset.value;
      const value = el.dataset.key === 'fourMode' ? raw : raw === '1';
      sendHost('settings', { game: { [el.dataset.key]: value } });
    },
    scTap: (el) => {
      const R = S.round;
      if (!R.mine) return;
      const idx = Number(el.dataset.sq);
      const moves = legalFrom(R);
      if (sc.sel !== null && moves.get(sc.sel)?.has(idx)) {
        const from = sc.sel;
        if (moves.get(from).get(idx)) {
          sc.promo = { from, to: idx };
          render();
          return;
        }
        sc.sel = null;
        act('move', { from, to: idx });
        return;
      }
      if (moves.has(idx)) {
        sc.sel = sc.sel === idx ? null : idx;
        render();
      }
    },
    scPromo: (el) => {
      if (!sc.promo) return;
      const { from, to } = sc.promo;
      sc.promo = null;
      sc.sel = null;
      act('move', { from, to, promo: el.dataset.piece });
    },
    scPromoCancel: () => {
      sc.promo = null;
      render();
    },
    scRotate: () => {
      store.set(ROTATE_KEY, rotateOn() ? '0' : '1');
      render();
    },
    scResign: () => {
      const R = S.round;
      const mine = R.seats.filter((s) => s.mine && s.alive);
      const who = mine.find((s) => s.seat === R.turn) || mine[0];
      if (who && confirm(`${playerName(who.id)} gibt diese Partie auf?`)) act('resign');
    },
    scRemoveGuest: (el) => socket.emit('guest:remove', { playerId: el.dataset.player }, (res) => { if (res?.error) toast(res.error); }),
    scForce: () => {
      if (confirm(`Für ${playerName(S.round.turnId)} einen zufälligen Zug machen?`)) act('force');
    },
    scDraw: () => {
      if (confirm('Diese Partie als Remis werten? Alle, die noch dabei sind, teilen sich die Punkte.')) act('draw');
    },
    scFinish: () => {
      if (confirm('Die Serie jetzt beenden und den Endstand zeigen?')) act('finish');
    },
  });

  app.addEventListener('submit', (e) => {
    if (e.target.id !== 'sc-guest-form') return;
    e.preventDefault();
    const input = document.getElementById('sc-guest-name');
    const name = input.value.trim();
    if (!name) return toast('Bitte gib einen Namen ein.');
    const avatar = avatars.length ? avatars[Math.floor(Math.random() * avatars.length)] : null;
    socket.emit('guest:add', { name, avatar }, (res) => {
      if (res?.error) return toast(res.error);
      const field = document.getElementById('sc-guest-name');
      if (field) field.value = '';
    });
  });

  // toggle steigt nicht auf, darum in der Capture-Phase mithören
  app.addEventListener('toggle', (e) => {
    if (e.target.id === 'sc-moves') sc.movesOpen = e.target.open;
  }, true);

  app.addEventListener('change', (e) => {
    if (S?.game.id !== 'schach') return;
    if (e.target.id === 'sc-games') sendHost('settings', { game: { games: Number(e.target.value) } });
    else if (e.target.id === 'sc-clock') sendHost('settings', { game: { clock: Number(e.target.value) } });
  });
})();
