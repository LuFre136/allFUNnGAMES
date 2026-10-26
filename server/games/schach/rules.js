// Regelkern für Schach: klassisch auf 8 × 8 für zwei, oder auf dem Kreuzbrett (14 × 14 ohne die
// 3 × 3-Ecken) für drei oder vier, jeder gegen jeden oder zwei gegen zwei.
//
// Felder sind Zahlen idx = y * n + x, (0, 0) ist unten links (a1). Plätze (seats): klassisch 0 = Weiß
// (unten) und 2 = Schwarz (oben); auf dem Kreuzbrett 0 = Rot (unten), 1 = Blau (links), 2 = Gelb (oben),
// 3 = Grün (rechts). Gezogen wird im Uhrzeigersinn 0 → 1 → 2 → 3.

const TYPES = ['k', 'q', 'r', 'b', 'n', 'p'];
const PROMOS = ['q', 'r', 'b', 'n'];
const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const LETTER = { k: 'K', q: 'D', r: 'T', b: 'L', n: 'S', p: '' }; // deutsche Kurzzeichen
const FILES = 'abcdefghijklmn';
const BACK = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
const DRAW_MOVES = 50; // Züge (pro Spieler) ohne Schlagen und ohne Bauernzug, dann ist es Remis

const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const ROOK = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const BISHOP = [[1, 1], [-1, 1], [-1, -1], [1, -1]];

// ---------- Brett und Plätze ----------

function valid(s, x, y) {
  const { n } = s;
  if (x < 0 || y < 0 || x >= n || y >= n) return false;
  if (!s.cross) return true;
  const edgeX = x < 3 || x > 10;
  const edgeY = y < 3 || y > 10;
  return !(edgeX && edgeY);
}

// Wandelt eigene Koordinaten (lf = Linie von links aus Sicht des Spielers, lr = Reihe ab der eigenen
// Grundreihe) in Brettkoordinaten um
function toGlobal(s, seat, lf, lr) {
  const m = s.n - 1;
  if (!s.cross) return seat === 0 ? [lf, lr] : [lf, m - lr];
  switch (seat) {
    case 0: return [lf, lr];
    case 1: return [lr, m - lf];
    case 2: return [m - lf, m - lr];
    default: return [m - lr, lf];
  }
}

function forward(s, seat) {
  if (!s.cross) return seat === 0 ? [0, 1] : [0, -1];
  return [[0, 1], [1, 0], [0, -1], [-1, 0]][seat];
}

// Wie weit ein Feld von der eigenen Grundreihe entfernt ist
function localRank(s, seat, x, y) {
  const m = s.n - 1;
  if (!s.cross) return seat === 0 ? y : m - y;
  return [y, x, m - y, m - x][seat];
}

function promoRank(s) {
  return 7; // klassisch die letzte Reihe, auf dem Kreuzbrett die 8. Reihe (Mitte), wie bei 4-Spieler-Schach üblich
}

function label(s, idx) {
  return `${FILES[idx % s.n]}${Math.floor(idx / s.n) + 1}`;
}

// mode: 'classic' (zwei, 8 × 8), 'ffa' (jeder gegen jeden) oder 'teams' (gegenüber spielt zusammen)
function create({ seats, mode = 'classic' } = {}) {
  const cross = mode !== 'classic';
  const n = cross ? 14 : 8;
  const list = seats || (cross ? [0, 1, 2, 3] : [0, 2]);
  const s = {
    n,
    cross,
    mode,
    seats: [...list].sort((a, b) => a - b),
    alive: {},
    out: [], // ausgeschiedene Plätze in Reihenfolge: { seat, reason }
    board: new Array(n * n).fill(null),
    turn: null,
    ep: null, // En passant (nur klassisch): { at, cap }
    halfmove: 0,
    plies: 0,
    positions: new Map(),
    captured: {}, // geschlagene Figuren pro Platz (was er genommen hat)
    result: null,
    lastNote: null,
  };
  const start = cross ? 3 : 0;
  for (const seat of s.seats) {
    s.alive[seat] = true;
    s.captured[seat] = [];
    BACK.forEach((t, i) => {
      const [x, y] = toGlobal(s, seat, start + i, 0);
      s.board[y * n + x] = { o: seat, t, m: false };
      const [px, py] = toGlobal(s, seat, start + i, 1);
      s.board[py * n + px] = { o: seat, t: 'p', m: false };
    });
  }
  s.turn = s.seats[0];
  remember(s);
  return s;
}

function partner(s, a, b) {
  return s.mode === 'teams' && a !== b && (a % 2) === (b % 2);
}

function teamOf(seat) {
  return seat % 2;
}

function aliveSeats(s) {
  return s.seats.filter((seat) => s.alive[seat]);
}

function enemies(s, seat) {
  return aliveSeats(s).filter((o) => o !== seat && !partner(s, seat, o));
}

// Darf `seat` die Figur `piece` schlagen? Figuren ausgeschiedener Spieler sind für alle frei.
function capturable(s, seat, piece) {
  if (!piece || piece.o === seat) return false;
  if (!s.alive[piece.o]) return true;
  return !partner(s, seat, piece.o);
}

// ---------- Angriffe ----------

function attacks(s, from, piece, tx, ty) {
  const n = s.n;
  const x = from % n;
  const y = Math.floor(from / n);
  const dx = tx - x;
  const dy = ty - y;
  if (!dx && !dy) return false;
  switch (piece.t) {
    case 'p': {
      const [fx, fy] = forward(s, piece.o);
      // Schlagrichtung: ein Feld vor und eins zur Seite
      if (fx === 0) return dy === fy && Math.abs(dx) === 1;
      return dx === fx && Math.abs(dy) === 1;
    }
    case 'n': return (Math.abs(dx) === 1 && Math.abs(dy) === 2) || (Math.abs(dx) === 2 && Math.abs(dy) === 1);
    case 'k': return Math.abs(dx) <= 1 && Math.abs(dy) <= 1;
    default: {
      const straight = dx === 0 || dy === 0;
      const diagonal = Math.abs(dx) === Math.abs(dy);
      if (piece.t === 'r' && !straight) return false;
      if (piece.t === 'b' && !diagonal) return false;
      if (piece.t === 'q' && !straight && !diagonal) return false;
      const sx = Math.sign(dx);
      const sy = Math.sign(dy);
      let cx = x + sx;
      let cy = y + sy;
      while (cx !== tx || cy !== ty) {
        if (!valid(s, cx, cy) || s.board[cy * n + cx]) return false;
        cx += sx;
        cy += sy;
      }
      return true;
    }
  }
}

function attackedBy(s, idx, bySeats) {
  const tx = idx % s.n;
  const ty = Math.floor(idx / s.n);
  const set = new Set(bySeats);
  for (let i = 0; i < s.board.length; i++) {
    const p = s.board[i];
    if (p && set.has(p.o) && attacks(s, i, p, tx, ty)) return true;
  }
  return false;
}

function kingOf(s, seat) {
  return s.board.findIndex((p) => p && p.o === seat && p.t === 'k');
}

function inCheck(s, seat) {
  const k = kingOf(s, seat);
  return k >= 0 && attackedBy(s, k, enemies(s, seat));
}

// ---------- Züge ----------

function pseudoMoves(s, seat) {
  const n = s.n;
  const out = [];
  const add = (from, to, extra) => {
    const piece = s.board[from];
    if (piece.t === 'p' && localRank(s, seat, to % n, Math.floor(to / n)) === promoRank(s)) {
      for (const promo of PROMOS) out.push({ from, to, promo, ...extra });
    } else out.push({ from, to, ...extra });
  };
  for (let from = 0; from < s.board.length; from++) {
    const piece = s.board[from];
    if (!piece || piece.o !== seat) continue;
    const x = from % n;
    const y = Math.floor(from / n);
    if (piece.t === 'p') {
      const [fx, fy] = forward(s, seat);
      const one = [x + fx, y + fy];
      if (valid(s, ...one) && !s.board[one[1] * n + one[0]]) {
        add(from, one[1] * n + one[0]);
        const two = [x + 2 * fx, y + 2 * fy];
        if (!piece.m && valid(s, ...two) && !s.board[two[1] * n + two[0]]) add(from, two[1] * n + two[0]);
      }
      for (const side of [-1, 1]) {
        const cx = x + fx + (fx === 0 ? side : 0);
        const cy = y + fy + (fy === 0 ? side : 0);
        if (!valid(s, cx, cy)) continue;
        const to = cy * n + cx;
        if (capturable(s, seat, s.board[to])) add(from, to);
        else if (s.ep && s.ep.at === to && s.board[s.ep.cap]?.o !== seat) add(from, to, { ep: true });
      }
      continue;
    }
    if (piece.t === 'n' || piece.t === 'k') {
      for (const [dx, dy] of piece.t === 'n' ? KNIGHT : KING) {
        const cx = x + dx;
        const cy = y + dy;
        if (!valid(s, cx, cy)) continue;
        const to = cy * n + cx;
        const target = s.board[to];
        if (!target || capturable(s, seat, target)) add(from, to);
      }
      continue;
    }
    const dirs = piece.t === 'r' ? ROOK : piece.t === 'b' ? BISHOP : [...ROOK, ...BISHOP];
    for (const [dx, dy] of dirs) {
      let cx = x + dx;
      let cy = y + dy;
      while (valid(s, cx, cy)) {
        const to = cy * n + cx;
        const target = s.board[to];
        if (target) {
          if (capturable(s, seat, target)) add(from, to);
          break;
        }
        add(from, to);
        cx += dx;
        cy += dy;
      }
    }
  }
  return out;
}

// Rochade: König zwei Felder Richtung Turm, der Turm springt auf das Feld, über das der König ging
function castlingMoves(s, seat) {
  const n = s.n;
  const k = kingOf(s, seat);
  if (k < 0 || s.board[k].m) return [];
  const foes = enemies(s, seat);
  if (attackedBy(s, k, foes)) return [];
  const kx = k % n;
  const ky = Math.floor(k / n);
  const [fx, fy] = forward(s, seat);
  // Entlang der Grundreihe: senkrecht zur Zugrichtung der Bauern
  const axis = fx === 0 ? [1, 0] : [0, 1];
  const out = [];
  for (const dir of [-1, 1]) {
    const sx = axis[0] * dir;
    const sy = axis[1] * dir;
    let cx = kx + sx;
    let cy = ky + sy;
    let between = 0;
    let rook = -1;
    while (valid(s, cx, cy)) {
      const p = s.board[cy * n + cx];
      if (p) {
        if (p.o === seat && p.t === 'r' && !p.m) rook = cy * n + cx;
        break;
      }
      between++;
      cx += sx;
      cy += sy;
    }
    if (rook < 0 || between < 2) continue;
    const pass = (ky + sy) * n + (kx + sx);
    const to = (ky + 2 * sy) * n + (kx + 2 * sx);
    if (attackedBy(s, pass, foes) || attackedBy(s, to, foes)) continue;
    out.push({ from: k, to, castle: between === 2 ? 'short' : 'long', rook, rookTo: pass });
  }
  return out;
}

// Spielt einen Zug auf dem Brett, ohne Regeln zu prüfen; gibt eine Funktion zum Zurücknehmen zurück
function makeRaw(s, move) {
  const board = s.board;
  const piece = board[move.from];
  const saved = [[move.from, piece], [move.to, board[move.to]]];
  let captured = board[move.to];
  if (move.ep) {
    saved.push([s.ep.cap, board[s.ep.cap]]);
    captured = board[s.ep.cap];
    board[s.ep.cap] = null;
  }
  if (move.castle) {
    saved.push([move.rook, board[move.rook]], [move.rookTo, board[move.rookTo]]);
    board[move.rookTo] = { ...board[move.rook], m: true };
    board[move.rook] = null;
  }
  board[move.to] = { o: piece.o, t: move.promo || piece.t, m: true };
  board[move.from] = null;
  return {
    captured,
    undo() {
      for (let i = saved.length - 1; i >= 0; i--) board[saved[i][0]] = saved[i][1];
    },
  };
}

function legalMoves(s, seat = s.turn) {
  if (s.result || !s.alive[seat]) return [];
  const out = [];
  for (const move of [...pseudoMoves(s, seat), ...castlingMoves(s, seat)]) {
    const { undo } = makeRaw(s, move);
    const ok = !inCheck(s, seat);
    undo();
    if (ok) out.push(move);
  }
  return out;
}

function sameMove(a, b) {
  return a.from === b.from && a.to === b.to && (a.promo || null) === (b.promo || null);
}

function findLegal(s, move, legal = legalMoves(s)) {
  return legal.find((m) => sameMove(m, move)) || null;
}

// ---------- Ende der Partie ----------

function positionKey(s) {
  const cells = s.board.map((p) => (p ? `${p.o}${p.t}${(p.t === 'k' || p.t === 'r') && !p.m ? '*' : ''}${s.alive[p.o] ? '' : 'x'}` : '.')).join(',');
  return `${s.turn}|${s.ep ? s.ep.at : '-'}|${cells}`;
}

function remember(s) {
  const key = positionKey(s);
  const count = (s.positions.get(key) || 0) + 1;
  s.positions.set(key, count);
  return count;
}

function material(s, seat) {
  return s.board.filter((p) => p && p.o === seat && p.t !== 'k').map((p) => p.t);
}

function insufficient(s) {
  const alive = aliveSeats(s);
  const sets = alive.map((seat) => material(s, seat));
  if (sets.every((m) => m.length === 0)) return true;
  if (s.cross) return false;
  // Klassisch: König gegen König, gegen König und Leichtfigur, oder Läufer auf gleichfarbigen Feldern
  const all = sets.flat();
  if (all.length === 1 && (all[0] === 'b' || all[0] === 'n')) return true;
  if (all.every((t) => t === 'b')) {
    const colors = new Set(s.board.map((p, i) => (p && p.t === 'b' ? (i % s.n + Math.floor(i / s.n)) % 2 : null)).filter((c) => c !== null));
    return colors.size === 1;
  }
  return false;
}

// Kann `seat` mit dem, was er hat, überhaupt noch mattsetzen? (für Zeitablauf im klassischen Spiel)
function canMate(s, seat) {
  const m = material(s, seat);
  if (!m.length) return false;
  if (m.length === 1 && (m[0] === 'b' || m[0] === 'n')) return false;
  return true;
}

// Plätze 1, 2, … : wer zuletzt übrig ist, ist vorn; bei Remis teilen sich die Übrigen die Plätze
function finish(s, { winners, draw = false, reason }) {
  const places = {};
  const total = s.seats.length;
  if (s.mode === 'teams') {
    for (const seat of s.seats) places[seat] = draw ? 1.5 : winners.includes(seat) ? 1 : 2;
  } else {
    s.out.forEach((o, i) => { places[o.seat] = total - i; });
    const rest = aliveSeats(s);
    const avg = rest.length ? (1 + rest.length) / 2 : 1;
    for (const seat of rest) places[seat] = draw ? avg : 1;
  }
  s.result = { winners: draw ? [] : winners, draw, reason, places };
  s.turn = null;
}

// Nimmt einen Platz aus dem Spiel (matt, patt, aufgegeben, Zeit, König geschlagen)
function eliminate(s, seat, reason) {
  if (!s.alive[seat] || s.result) return;
  if (s.mode !== 'ffa') {
    // Zu zweit oder im Team ist die Partie damit vorbei
    s.alive[seat] = false;
    s.out.push({ seat, reason });
    const winners = s.seats.filter((o) => o !== seat && !partner(s, seat, o) && s.alive[o]);
    finish(s, { winners, reason });
    return;
  }
  s.alive[seat] = false;
  s.out.push({ seat, reason });
  const rest = aliveSeats(s);
  if (rest.length === 1) {
    finish(s, { winners: rest, reason });
    return;
  }
  if (s.turn === seat) advance(s);
}

function nextSeat(s, seat) {
  const i = s.seats.indexOf(seat);
  for (let k = 1; k <= s.seats.length; k++) {
    const next = s.seats[(i + k) % s.seats.length];
    if (s.alive[next]) return next;
  }
  return null;
}

// Gibt den Zug weiter; wer keinen Zug mehr hat, ist matt oder patt
function advance(s) {
  while (!s.result) {
    s.turn = nextSeat(s, s.turn);
    if (s.turn === null || legalMoves(s, s.turn).length) return;
    const seat = s.turn;
    const mate = inCheck(s, seat);
    if (s.mode !== 'ffa') {
      // Zu zweit und im Team: matt verliert, patt ist Remis
      if (mate) eliminate(s, seat, 'mate');
      else finish(s, { winners: [], draw: true, reason: 'stalemate' });
      return;
    }
    // Jeder gegen jeden: matt oder patt scheidet aus, die anderen spielen weiter
    s.alive[seat] = false;
    s.out.push({ seat, reason: mate ? 'mate' : 'stalemate' });
    const rest = aliveSeats(s);
    if (rest.length === 1) finish(s, { winners: rest, reason: mate ? 'mate' : 'stalemate' });
  }
}

// Führt einen geprüften Zug aus und gibt Infos für die Anzeige zurück
function apply(s, move) {
  const legal = findLegal(s, move);
  if (!legal) throw new Error('Dieser Zug geht nicht.');
  const seat = s.turn;
  const piece = s.board[legal.from];
  const epCap = legal.ep ? s.ep.cap : null;
  const { captured } = makeRaw(s, legal);
  s.plies++;
  s.ep = null;
  if (piece.t === 'p' && !s.cross) {
    const dist = Math.abs(Math.floor(legal.to / s.n) - Math.floor(legal.from / s.n));
    if (dist === 2) s.ep = { at: (legal.from + legal.to) / 2, cap: legal.to };
  }
  if (captured || piece.t === 'p') s.halfmove = 0;
  else s.halfmove++;
  if (captured) s.captured[seat].push(captured.t);

  let note = legal.castle ? (legal.castle === 'short' ? '0-0' : '0-0-0')
    : `${LETTER[piece.t]}${label(s, legal.from)}${captured ? '×' : '–'}${label(s, legal.to)}${legal.promo ? `=${LETTER[legal.promo]}` : ''}`;
  const info = {
    seat,
    from: legal.from,
    to: legal.to,
    piece: piece.t,
    promo: legal.promo || null,
    castle: legal.castle ? { from: legal.rook, to: legal.rookTo } : null,
    captured: captured ? { o: captured.o, t: captured.t } : null,
    capturedAt: epCap ?? (captured ? legal.to : null),
    out: [],
  };

  const outBefore = s.out.length;
  // Wird ein König geschlagen (möglich, wenn jemand vorher nicht aus dem Schach kam), ist der Spieler raus
  if (captured && captured.t === 'k' && s.alive[captured.o]) {
    eliminate(s, captured.o, 'king');
  }
  if (!s.result) {
    const checks = enemies(s, seat).filter((o) => inCheck(s, o));
    advance(s);
    const mated = s.out.slice(outBefore).some((o) => o.reason === 'mate');
    if (mated) note += '#';
    else if (checks.length) note += '+';
  }
  info.out = s.out.slice(outBefore);
  if (!s.result) {
    const reps = remember(s);
    if (reps >= 3) finish(s, { winners: [], draw: true, reason: 'repetition' });
    else if (insufficient(s)) finish(s, { winners: [], draw: true, reason: 'material' });
    else if (s.halfmove >= DRAW_MOVES * aliveSeats(s).length) finish(s, { winners: [], draw: true, reason: 'fifty' });
  }
  info.note = note;
  s.lastNote = note;
  return info;
}

module.exports = {
  TYPES,
  PROMOS,
  VALUE,
  LETTER,
  FILES,
  DRAW_MOVES,
  create,
  valid,
  toGlobal,
  forward,
  localRank,
  label,
  partner,
  teamOf,
  aliveSeats,
  enemies,
  attackedBy,
  kingOf,
  inCheck,
  legalMoves,
  findLegal,
  apply,
  eliminate,
  finish,
  advance,
  canMate,
  insufficient,
  material,
};
