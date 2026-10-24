// Backgammon-Regeln ohne Spielablauf: Brett, erlaubte Züge, Wertung.
//
// Das Brett ist aus Sicht von Weiß nummeriert: Zungen 1 bis 24, Weiß zieht von 24 nach 1 und würfelt
// unter 1 hinaus, Schwarz zieht von 1 nach 24. In `points` stehen positive Zahlen für weiße Steine,
// negative für schwarze. Für die Zugberechnung rechnet jede Farbe in eigenen Zahlen: 1 bis 24 vom
// eigenen Heimfeld aus, 25 ist die Bar, 0 ist draußen.

const CHECKERS = 15;
const BAR = 25;
const OFF = 0;
const COLORS = ['w', 'b'];

function other(color) {
  return color === 'w' ? 'b' : 'w';
}

function initialBoard() {
  const points = Array(25).fill(0);
  // 2 auf der 24, 5 auf der 13, 3 auf der 8, 5 auf der 6 (aus eigener Sicht)
  for (const [own, n] of [[24, 2], [13, 5], [8, 3], [6, 5]]) {
    points[own] += n;
    points[25 - own] -= n;
  }
  return { points, bar: { w: 0, b: 0 }, off: { w: 0, b: 0 } };
}

function clone(board) {
  return { points: [...board.points], bar: { ...board.bar }, off: { ...board.off } };
}

// Eigene Zahl → Index im Brett (nur 1 bis 24)
function toIndex(color, own) {
  return color === 'w' ? own : 25 - own;
}

// Wie viele Steine von `color` auf der eigenen Zunge `own` liegen
function mine(board, color, own) {
  if (own === BAR) return board.bar[color];
  const v = board.points[toIndex(color, own)];
  return color === 'w' ? Math.max(0, v) : Math.max(0, -v);
}

function theirs(board, color, own) {
  return mine(board, other(color), 25 - own);
}

// Alle Steine im Heimfeld (eigene Zungen 1 bis 6)?
function allHome(board, color) {
  if (board.bar[color]) return false;
  for (let own = 7; own <= 24; own++) if (mine(board, color, own)) return false;
  return true;
}

// Alle Einzelzüge mit einer Augenzahl
function singleMoves(board, color, die) {
  const moves = [];
  if (board.bar[color]) {
    const to = BAR - die;
    if (theirs(board, color, to) <= 1) moves.push({ from: BAR, to, die });
    return moves;
  }
  const home = allHome(board, color);
  for (let from = 24; from >= 1; from--) {
    if (!mine(board, color, from)) continue;
    const to = from - die;
    if (to >= 1) {
      if (theirs(board, color, to) <= 1) moves.push({ from, to, die });
    } else if (home) {
      // Genau hinaus oder mit zu hoher Zahl, wenn weiter hinten kein Stein mehr liegt
      let higher = false;
      for (let p = from + 1; p <= 6; p++) if (mine(board, color, p)) higher = true;
      if (to === 0 || !higher) moves.push({ from, to: OFF, die });
    }
  }
  return moves;
}

// Führt einen Einzelzug aus, gibt das neue Brett zurück und ob geschlagen wurde
function applyMove(board, color, move) {
  const next = clone(board);
  const sign = color === 'w' ? 1 : -1;
  if (move.from === BAR) next.bar[color]--;
  else next.points[toIndex(color, move.from)] -= sign;
  let hit = false;
  if (move.to === OFF) {
    next.off[color]++;
  } else {
    const i = toIndex(color, move.to);
    if (next.points[i] === -sign) {
      next.points[i] = 0;
      next.bar[other(color)]++;
      hit = true;
    }
    next.points[i] += sign;
  }
  return { board: next, hit };
}

function diceList(dice) {
  return dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : [dice[0], dice[1]];
}

function key(move) {
  return `${move.from}-${move.to}-${move.die}`;
}

// Alle vollständigen, regelgerechten Zugfolgen für einen Wurf. Es gilt: so viele Augenzahlen wie möglich
// nutzen, und wenn nur eine von zwei verschiedenen geht, die höhere, falls möglich.
function legalSequences(board, color, dice) {
  const all = [];
  let best = 0;
  const walk = (b, left, seq) => {
    let moved = false;
    const tried = new Set();
    for (let k = 0; k < left.length; k++) {
      const die = left[k];
      if (tried.has(die)) continue;
      tried.add(die);
      for (const move of singleMoves(b, color, die)) {
        moved = true;
        const rest = [...left.slice(0, k), ...left.slice(k + 1)];
        walk(applyMove(b, color, move).board, rest, [...seq, move]);
      }
    }
    if (!moved) {
      best = Math.max(best, seq.length);
      all.push(seq);
    }
  };
  walk(board, diceList(dice), []);
  let result = all.filter((s) => s.length === best);
  if (best === 1 && dice[0] !== dice[1]) {
    const high = Math.max(...dice);
    if (result.some((s) => s[0].die === high)) result = result.filter((s) => s[0].die === high);
  }
  if (best === 0) return [[]];
  return result;
}

// Welche Einzelzüge nach den schon gemachten (`done`) noch erlaubt sind
function nextMoves(sequences, done) {
  const prefix = done.map(key).join('|');
  const seen = new Map();
  for (const seq of sequences) {
    if (seq.length <= done.length) continue;
    if (seq.slice(0, done.length).map(key).join('|') !== prefix) continue;
    const m = seq[done.length];
    seen.set(key(m), m);
  }
  return [...seen.values()];
}

function isComplete(sequences, done) {
  const prefix = done.map(key).join('|');
  return sequences.some((s) => s.length === done.length && s.map(key).join('|') === prefix);
}

function pipCount(board, color) {
  let pips = board.bar[color] * 25;
  for (let own = 1; own <= 24; own++) pips += mine(board, color, own) * own;
  return pips;
}

// 1 = einfacher Sieg, 2 = Gammon, 3 = Backgammon
function winType(board, winner) {
  const loser = other(winner);
  if (board.off[loser] > 0) return 1;
  if (board.bar[loser]) return 3;
  // Steine des Verlierers im Heimfeld des Siegers (eigene Zungen 19 bis 24 des Verlierers)
  for (let own = 19; own <= 24; own++) if (mine(board, loser, own)) return 3;
  return 2;
}

function checkerCount(board, color) {
  let n = board.bar[color] + board.off[color];
  for (let own = 1; own <= 24; own++) n += mine(board, color, own);
  return n;
}

// Eigene Zahl ↔ Zahl für die Geräte: Zungen als Brett-Index 1–24, dazu 'bar' und 'off'
function toPublic(color, own) {
  if (own === BAR) return 'bar';
  if (own === OFF) return 'off';
  return toIndex(color, own);
}

function fromPublic(color, value) {
  if (value === 'bar') return BAR;
  if (value === 'off') return OFF;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 24) return null;
  return color === 'w' ? n : 25 - n;
}

module.exports = {
  CHECKERS,
  BAR,
  OFF,
  COLORS,
  other,
  initialBoard,
  clone,
  mine,
  allHome,
  singleMoves,
  applyMove,
  legalSequences,
  nextMoves,
  isComplete,
  pipCount,
  winType,
  checkerCount,
  toPublic,
  fromPublic,
  key,
};
