// RPS-Regeln ohne Lobby: Brett, Aufstellung, Züge, Kämpfe mit Schere, Stein, Papier, Gleichstand und Ende.
// Das Brett hat 7 Spalten und 6 Reihen, Feld = Reihe * 7 + Spalte. Rot steht unten (Reihen 4 und 5),
// Blau oben (Reihen 0 und 1). Jede Seite hat 14 Figuren: Fahne, Falle und je 4 Steine, Papiere, Scheren.

const crypto = require('crypto');

const COLS = 7;
const ROWS = 6;
const WEAPONS = ['rock', 'paper', 'scissors'];
const PER_WEAPON = 4;
const BEATS = { rock: 'scissors', scissors: 'paper', paper: 'rock' };

const other = (color) => (color === 'red' ? 'blue' : 'red');
const randomInt = (n) => crypto.randomInt(n);

// Heimfelder einer Seite, von der eigenen Grundlinie aus gesehen links nach rechts
function homeCells(color) {
  const rows = color === 'red' ? [5, 4] : [0, 1];
  const cells = [];
  for (const r of rows) for (let c = 0; c < COLS; c++) cells.push(r * COLS + c);
  return cells;
}

function neighbors(cell) {
  const r = Math.floor(cell / COLS);
  const c = cell % COLS;
  const list = [];
  if (r > 0) list.push(cell - COLS);
  if (r < ROWS - 1) list.push(cell + COLS);
  if (c > 0) list.push(cell - 1);
  if (c < COLS - 1) list.push(cell + 1);
  return list;
}

function shuffle(list, rand = randomInt) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// Zufällige Aufstellung: Fahne und Falle irgendwo, dazu je 4 Waffen
function randomArrangement(rand = randomInt) {
  const types = ['flag', 'trap'];
  for (const w of WEAPONS) for (let i = 0; i < PER_WEAPON; i++) types.push(w);
  return shuffle(types, rand);
}

// Neu mischen: Fahne und Falle bleiben stehen, nur die Waffen werden neu verteilt
function reshuffle(arrangement, rand = randomInt) {
  const slots = [];
  const weapons = [];
  arrangement.forEach((t, i) => {
    if (WEAPONS.includes(t)) {
      slots.push(i);
      weapons.push(t);
    }
  });
  shuffle(weapons, rand);
  const next = [...arrangement];
  slots.forEach((slot, k) => { next[slot] = weapons[k]; });
  return next;
}

function validArrangement(arrangement) {
  if (!Array.isArray(arrangement) || arrangement.length !== COLS * 2) return false;
  const count = (t) => arrangement.filter((x) => x === t).length;
  return count('flag') === 1 && count('trap') === 1 && WEAPONS.every((w) => count(w) === PER_WEAPON);
}

function create(arrangements, { first = 'red' } = {}) {
  const board = Array(COLS * ROWS).fill(null);
  let nextId = 1;
  for (const color of ['red', 'blue']) {
    homeCells(color).forEach((cell, i) => {
      board[cell] = { id: nextId++, color, type: arrangements[color][i], known: false };
    });
  }
  return {
    board,
    turn: first,
    plies: 0,
    sinceClash: 0,
    duel: null, // Gleichstand: { from, to, picks: { red, blue }, rounds }
    result: null, // { winner, reason }
    stats: { red: { won: 0, lost: 0, trapped: 0 }, blue: { won: 0, lost: 0, trapped: 0 } },
  };
}

const movable = (piece) => piece && WEAPONS.includes(piece.type);

function legalMoves(state, color = state.turn) {
  if (state.result || state.duel) return [];
  const moves = [];
  state.board.forEach((piece, from) => {
    if (!piece || piece.color !== color || !movable(piece)) return;
    for (const to of neighbors(from)) {
      const target = state.board[to];
      if (!target || target.color !== color) moves.push({ from, to });
    }
  });
  return moves;
}

function isLegal(state, move) {
  return legalMoves(state).some((m) => m.from === move.from && m.to === move.to);
}

// Kampf zweier Waffen: 'attacker' | 'defender' | 'tie'
function fight(a, d) {
  if (a === d) return 'tie';
  return BEATS[a] === d ? 'attacker' : 'defender';
}

// Führt einen (vorher geprüften) Zug aus. Gibt zurück, was passiert ist, für die Anzeige.
function apply(state, move, { reveal = true } = {}) {
  const { from, to } = move;
  const attacker = state.board[from];
  const defender = state.board[to];
  const color = attacker.color;
  if (!defender) {
    state.board[to] = attacker;
    state.board[from] = null;
    state.sinceClash++;
    endTurn(state);
    return { from, to, color, kind: 'move', pieceId: attacker.id };
  }
  state.sinceClash = 0;
  const clash = { from, to, color, kind: 'clash', pieceId: attacker.id, defenderId: defender.id, attacker: attacker.type, defender: defender.type, rounds: [] };
  if (defender.type === 'flag') {
    defender.known = true;
    state.board[to] = attacker;
    state.board[from] = null;
    clash.outcome = 'flag';
    state.result = { winner: color, reason: 'flag' };
    return clash;
  }
  if (defender.type === 'trap') {
    defender.known = true;
    state.board[from] = null;
    state.stats[color].lost++;
    state.stats[other(color)].trapped++;
    clash.outcome = 'trap';
    endTurn(state);
    return clash;
  }
  return settle(state, clash, { reveal });
}

// Waffen vergleichen; bei Gleichstand wählen beide neu (state.duel), sonst bleibt der Sieger stehen
function settle(state, clash, { reveal }) {
  const attacker = state.board[clash.from];
  const defender = state.board[clash.to];
  clash.rounds.push([attacker.type, defender.type]);
  const outcome = fight(attacker.type, defender.type);
  if (outcome === 'tie') {
    state.duel = { from: clash.from, to: clash.to, picks: { red: null, blue: null }, clash };
    clash.outcome = 'tie';
    return clash;
  }
  state.duel = null;
  const winner = outcome === 'attacker' ? attacker : defender;
  const loser = outcome === 'attacker' ? defender : attacker;
  winner.known = reveal;
  state.stats[winner.color].won++;
  state.stats[loser.color].lost++;
  if (outcome === 'attacker') state.board[clash.to] = attacker;
  state.board[clash.from] = null;
  clash.outcome = outcome;
  endTurn(state);
  return clash;
}

// Neue Waffe nach einem Gleichstand; sind beide gewählt, wird weitergekämpft
function pick(state, color, weapon, { reveal = true } = {}) {
  const duel = state.duel;
  if (!duel || !WEAPONS.includes(weapon) || duel.picks[color]) return null;
  duel.picks[color] = weapon;
  if (!duel.picks.red || !duel.picks.blue) return null;
  const attacker = state.board[duel.from];
  const defender = state.board[duel.to];
  attacker.type = duel.picks[attacker.color];
  defender.type = duel.picks[defender.color];
  const clash = duel.clash;
  clash.attacker = attacker.type;
  clash.defender = defender.type;
  return settle(state, clash, { reveal });
}

function hasPieces(state, color) {
  return state.board.some((p) => p && p.color === color && movable(p));
}

function endTurn(state) {
  state.plies++;
  state.turn = other(state.turn);
  // Ohne Kämpfer ist die Partie sofort vorbei, nicht erst, wenn man dran wäre
  const armed = ['red', 'blue'].filter((c) => hasPieces(state, c));
  if (armed.length < 2) {
    state.result = armed.length ? { winner: armed[0], reason: 'pieces' } : { winner: null, reason: 'stuck' };
    return;
  }
  if (!legalMoves(state).length) {
    // Wer nicht mehr ziehen kann, verliert. Können beide nicht, ist es Remis.
    const stuck = state.turn;
    state.result = legalMoves(state, other(stuck)).length
      ? { winner: other(stuck), reason: 'blocked' }
      : { winner: null, reason: 'stuck' };
  }
}

function count(state, color, type) {
  return state.board.filter((p) => p && p.color === color && (!type || p.type === type)).length;
}

module.exports = {
  COLS,
  ROWS,
  WEAPONS,
  PER_WEAPON,
  BEATS,
  other,
  homeCells,
  neighbors,
  randomArrangement,
  reshuffle,
  validArrangement,
  create,
  legalMoves,
  isLegal,
  fight,
  apply,
  pick,
  count,
};
