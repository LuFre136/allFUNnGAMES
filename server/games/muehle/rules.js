// Mühle-Regeln ohne Lobby: Brett, legale Züge, Mühlen, Wegnehmen, Springen, Ende und Remis.
// Die 24 Punkte liegen auf drei Ringen: außen 0–7, Mitte 8–15, innen 16–23, jeweils im Uhrzeigersinn
// ab der Ecke oben links. Ungerade Punkte sind Seitenmitten und mit dem Nachbarring verbunden.

const STONES = 9;
const DRAW_MOVES = 50; // Züge ohne Schlagen, sobald jemand springen darf

// Lage auf einem 7×7-Raster, für die Darstellung
const COORDS = [
  [0, 0], [3, 0], [6, 0], [6, 3], [6, 6], [3, 6], [0, 6], [0, 3],
  [1, 1], [3, 1], [5, 1], [5, 3], [5, 5], [3, 5], [1, 5], [1, 3],
  [2, 2], [3, 2], [4, 2], [4, 3], [4, 4], [3, 4], [2, 4], [2, 3],
];

const NEIGHBORS = (() => {
  const n = Array.from({ length: 24 }, () => []);
  const link = (a, b) => { n[a].push(b); n[b].push(a); };
  for (let r = 0; r < 3; r++) {
    for (let k = 0; k < 8; k++) link(r * 8 + k, r * 8 + ((k + 1) % 8));
  }
  for (const k of [1, 3, 5, 7]) {
    link(k, 8 + k);
    link(8 + k, 16 + k);
  }
  return n.map((list) => list.sort((a, b) => a - b));
})();

const MILLS = (() => {
  const mills = [];
  for (let r = 0; r < 3; r++) {
    for (const k of [0, 2, 4, 6]) mills.push([r * 8 + k, r * 8 + k + 1, r * 8 + ((k + 2) % 8)]);
  }
  for (const k of [1, 3, 5, 7]) mills.push([k, 8 + k, 16 + k]);
  return mills;
})();

const other = (color) => (color === 'w' ? 'b' : 'w');

function create({ flying = true, doubleMill = 1 } = {}) {
  const state = {
    board: Array(24).fill(null),
    hand: { w: STONES, b: STONES },
    turn: 'w',
    pendingRemove: 0,
    flying,
    doubleMill,
    noCapture: 0,
    positions: {},
    plies: 0, // abgeschlossene Züge beider Spieler
    mills: { w: 0, b: 0 },
    result: null, // { winner: 'w'|'b'|null, reason }
  };
  countPosition(state);
  return state;
}

function onBoard(state, color) {
  return state.board.filter((c) => c === color).length;
}

// setzt | zieht | springt
function phaseOf(state, color) {
  if (state.hand[color] > 0) return 'place';
  if (state.flying && onBoard(state, color) === 3) return 'fly';
  return 'move';
}

function millsAt(board, point) {
  const color = board[point];
  if (!color) return [];
  return MILLS.filter((m) => m.includes(point) && m.every((p) => board[p] === color));
}

function inMill(board, point) {
  return millsAt(board, point).length > 0;
}

// Gegnerische Steine, die man nach einer Mühle nehmen darf
function removable(state) {
  const enemy = other(state.turn);
  const stones = [];
  for (let p = 0; p < 24; p++) if (state.board[p] === enemy) stones.push(p);
  const free = stones.filter((p) => !inMill(state.board, p));
  return free.length ? free : stones;
}

function legalMoves(state) {
  if (state.result) return [];
  if (state.pendingRemove) return removable(state).map((at) => ({ type: 'remove', at }));
  const color = state.turn;
  const empty = [];
  for (let p = 0; p < 24; p++) if (!state.board[p]) empty.push(p);
  const phase = phaseOf(state, color);
  if (phase === 'place') return empty.map((to) => ({ type: 'place', to }));
  const moves = [];
  for (let from = 0; from < 24; from++) {
    if (state.board[from] !== color) continue;
    const targets = phase === 'fly' ? empty : NEIGHBORS[from].filter((p) => !state.board[p]);
    for (const to of targets) moves.push({ type: 'move', from, to });
  }
  return moves;
}

function isLegal(state, move) {
  return legalMoves(state).some((m) => m.type === move.type && m.to === move.to && m.from === move.from && m.at === move.at);
}

function positionKey(state) {
  return `${state.board.map((c) => c || '.').join('')}${state.turn}`;
}

function countPosition(state) {
  const key = positionKey(state);
  state.positions[key] = (state.positions[key] || 0) + 1;
  return state.positions[key];
}

// Führt einen (vorher geprüften) Zug aus. Gibt zurück, welche Mühlen entstanden sind.
function apply(state, move) {
  const color = state.turn;
  let formed = [];
  if (move.type === 'remove') {
    state.board[move.at] = null;
    state.pendingRemove--;
    state.noCapture = 0;
    if (state.pendingRemove > 0 && !removable(state).length) state.pendingRemove = 0;
    if (!state.pendingRemove) endTurn(state, true);
    return { formed };
  }
  if (move.type === 'place') {
    state.board[move.to] = color;
    state.hand[color]--;
  } else {
    state.board[move.from] = null;
    state.board[move.to] = color;
  }
  formed = millsAt(state.board, move.to);
  if (formed.length) {
    state.mills[color] += formed.length;
    const enemyStones = onBoard(state, other(color));
    const take = formed.length >= 2 && state.doubleMill === 2 ? 2 : 1;
    state.pendingRemove = Math.min(take, enemyStones);
  }
  if (!state.pendingRemove) endTurn(state, false);
  return { formed };
}

function flyingActive(state) {
  return state.flying && ['w', 'b'].some((c) => state.hand[c] === 0 && onBoard(state, c) === 3);
}

function endTurn(state, captured) {
  state.plies++;
  state.turn = other(state.turn);
  if (!captured) state.noCapture = flyingActive(state) ? state.noCapture + 1 : 0;
  const next = state.turn;
  if (state.hand[next] + onBoard(state, next) < 3) {
    state.result = { winner: other(next), reason: 'stones' };
    return;
  }
  if (!legalMoves(state).length) {
    state.result = { winner: other(next), reason: 'blocked' };
    return;
  }
  if (countPosition(state) >= 3) {
    state.result = { winner: null, reason: 'repetition' };
    return;
  }
  if (state.noCapture >= DRAW_MOVES) state.result = { winner: null, reason: 'noCapture' };
}

module.exports = {
  STONES,
  DRAW_MOVES,
  COORDS,
  NEIGHBORS,
  MILLS,
  other,
  create,
  onBoard,
  phaseOf,
  millsAt,
  removable,
  legalMoves,
  isLegal,
  apply,
};
