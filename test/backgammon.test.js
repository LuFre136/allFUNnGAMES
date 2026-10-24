// Regeltests für Backgammon: node --test

const test = require('node:test');
const assert = require('node:assert');
const Backgammon = require('../server/games/backgammon');

const R = Backgammon.rules;

function fakeLobby(n, game = {}) {
  const players = new Map();
  for (let i = 1; i <= n; i++) players.set(`p${i}`, { id: `p${i}`, name: `Spieler ${i}`, connected: true, isHost: i === 1, teamId: null });
  const teams = [{ id: 't1', name: 'Rot' }, { id: 't2', name: 'Blau' }];
  return {
    hostId: 'p1',
    players,
    teams,
    settings: { hostPlays: true, game: { ...Backgammon.defaultSettings(), ...game } },
    activePlayers: () => [...players.values()].filter((p) => p.connected),
    playersInTeam: (id) => [...players.values()].filter((p) => p.teamId === id),
    teamById: (id) => teams.find((t) => t.id === id) || null,
    broadcast() {},
  };
}

function setup(n = 2, game = { seats: { w: 'p1', b: 'p2' } }) {
  const lobby = fakeLobby(n, game);
  const g = new Backgammon(lobby);
  g.start();
  return { lobby, g, p: (i) => lobby.players.get(`p${i}`) };
}

// Leeres Brett, Steine nach Brett-Index (positiv Weiß, negativ Schwarz)
function board(spec, extra = {}) {
  const b = { points: Array(25).fill(0), bar: { w: 0, b: 0 }, off: { w: 0, b: 0 } };
  for (const [i, n] of Object.entries(spec)) b.points[Number(i)] = n;
  Object.assign(b.bar, extra.bar || {});
  Object.assign(b.off, extra.off || {});
  return b;
}

// Setzt einen Wurf für den Spieler am Zug
function giveRoll(g, dice) {
  g.phase = 'roll';
  g.dice = dice;
  g.beginMove();
}

test('Startaufstellung: 15 Steine pro Farbe, 167 Augen', () => {
  const b = R.initialBoard();
  for (const c of R.COLORS) {
    assert.strictEqual(R.checkerCount(b, c), 15);
    assert.strictEqual(R.pipCount(b, c), 167);
  }
  assert.strictEqual(b.points[24], 2);
  assert.strictEqual(b.points[1], -2);
  assert.strictEqual(b.points[6], 5);
  assert.strictEqual(b.points[19], -5);
});

test('gesperrte Zungen und Schlagen', () => {
  const b = board({ 10: 1, 8: -2, 7: -1 });
  const moves = R.singleMoves(b, 'w', 2);
  assert.deepStrictEqual(moves, []); // 10 → 8 ist gesperrt
  const hit = R.singleMoves(b, 'w', 3);
  assert.deepStrictEqual(hit, [{ from: 10, to: 7, die: 3 }]);
  const after = R.applyMove(b, 'w', hit[0]);
  assert.ok(after.hit);
  assert.strictEqual(after.board.bar.b, 1);
  assert.strictEqual(after.board.points[7], 1);
});

test('Steine auf der Bar müssen zuerst rein, sonst verfällt der Wurf', () => {
  // Weiß hat einen Stein auf der Bar, Schwarz sperrt 19 bis 24 bis auf die 22
  const b = board({ 19: -2, 20: -2, 21: -2, 23: -2, 24: -2, 22: 0, 13: 2 }, { bar: { w: 1 } });
  const seqs = R.legalSequences(b, 'w', [3, 4]);
  // Nur die 3 bringt den Stein rein (25 - 3 = 22), danach darf die 4 frei gezogen werden
  for (const s of seqs) assert.deepStrictEqual(s[0], { from: 25, to: 22, die: 3 });
  assert.ok(seqs.every((s) => s.length === 2));
  const blocked = board({ 19: -2, 20: -2, 21: -2, 22: -2, 23: -2, 24: -2, 13: 2 }, { bar: { w: 1 } });
  assert.deepStrictEqual(R.legalSequences(blocked, 'w', [3, 4]), [[]]);
});

test('Zugzwang: geht nur eine Zahl, muss es die höhere sein', () => {
  // Ein weißer Stein auf der 12: mit 6 auf die 6 oder mit 5 auf die 7, danach ist die 1 jeweils gesperrt
  const b = board({ 12: 1, 1: -2 }, { off: { w: 14 } });
  assert.deepStrictEqual(R.legalSequences(b, 'w', [5, 6]), [[{ from: 12, to: 6, die: 6 }]]);
});

test('Hinauswürfeln: genau, mit zu hoher Zahl nur ohne Steine weiter hinten', () => {
  const b = board({ 5: 1, 2: 2 }, { off: { w: 12 } });
  const six = R.singleMoves(b, 'w', 6);
  assert.deepStrictEqual(six, [{ from: 5, to: 0, die: 6 }]);
  const four = R.singleMoves(b, 'w', 4);
  // Mit der 4 darf nicht von der 2 hinaus, solange auf der 5 noch ein Stein liegt
  assert.deepStrictEqual(four, [{ from: 5, to: 1, die: 4 }]);
  const notHome = board({ 7: 1, 2: 2 }, { off: { w: 12 } });
  assert.ok(R.singleMoves(notHome, 'w', 2).every((m) => m.to !== 0));
});

test('Gammon und Backgammon', () => {
  assert.strictEqual(R.winType(board({}, { off: { w: 15, b: 1 } }), 'w'), 1);
  assert.strictEqual(R.winType(board({ 19: -15 }, { off: { w: 15 } }), 'w'), 2);
  assert.strictEqual(R.winType(board({ 3: -1, 19: -14 }, { off: { w: 15 } }), 'w'), 3);
  assert.strictEqual(R.winType(board({ 19: -14 }, { off: { w: 15 }, bar: { b: 1 } }), 'w'), 3);
});

test('Anfangswurf: höhere Zahl beginnt mit beiden Würfeln', () => {
  const { g, p } = setup();
  assert.strictEqual(g.phase, 'opening');
  assert.ok(g.action(p(1), { type: 'move', from: 24, to: 18 }).error);
  g.action(p(1), { type: 'roll' });
  assert.ok(g.action(p(1), { type: 'roll' }).error);
  g.openDice = { w: 5, b: null };
  // Schwarz würfelt, bis es kein Gleichstand mehr ist
  for (let i = 0; i < 50 && g.phase === 'opening'; i++) {
    if (g.openDice.w === null) g.openDice.w = 5;
    g.action(p(2), { type: 'roll' });
  }
  assert.strictEqual(g.phase, 'move');
  assert.strictEqual(g.tipsOpen, false);
  assert.ok(g.dice[0] > g.dice[1], 'der Gewinner des Anfangswurfs zieht seine Zahl zuerst');
  assert.ok(g.dice.includes(5));
  assert.strictEqual(g.turn, g.dice[0] === 5 ? 'w' : 'b');
  assert.ok(g.controls(g.turn === 'w' ? p(1) : p(2), g.turn));
});

test('Züge, Rückgängig und Zug fertig', () => {
  const { g, p } = setup();
  g.turn = 'w';
  giveRoll(g, [6, 1]);
  assert.ok(g.action(p(2), { type: 'move', from: 24, to: 18 }).error, 'Schwarz ist nicht dran');
  assert.ok(g.action(p(1), { type: 'commit' }).error, 'erst ziehen');
  assert.deepStrictEqual(g.action(p(1), { type: 'move', from: 13, to: 7 }), { ok: true });
  assert.strictEqual(g.view(p(1)).canCommit, false);
  g.action(p(1), { type: 'undo' });
  assert.deepStrictEqual(g.board, R.initialBoard());
  g.action(p(1), { type: 'move', from: 13, to: 7 });
  g.action(p(1), { type: 'move', from: 8, to: 7 });
  const v = g.view(p(2));
  assert.strictEqual(v.board.points[7], 2);
  assert.ok(v.dice.every((d) => d.used));
  assert.deepStrictEqual(g.action(p(1), { type: 'commit' }), { ok: true });
  assert.strictEqual(g.turn, 'b');
  assert.strictEqual(g.phase, 'roll');
  assert.strictEqual(g.lastTurn.moves.length, 2);
});

test('Schwarz zieht in Gegenrichtung, Brett-Index bleibt aus Sicht von Weiß', () => {
  const { g, p } = setup();
  g.turn = 'b';
  giveRoll(g, [3, 1]);
  // Schwarz macht seinen 5-Punkt: von 8 und 6 (eigene Sicht) = Brett 17 und 19 nach 20
  assert.deepStrictEqual(g.action(p(2), { type: 'move', from: 17, to: 20 }), { ok: true });
  assert.deepStrictEqual(g.action(p(2), { type: 'move', from: 19, to: 20 }), { ok: true });
  assert.strictEqual(g.board.points[20], -2);
  g.action(p(2), { type: 'commit' });
  assert.strictEqual(g.turn, 'w');
});

test('Pasch zählt vierfach', () => {
  const { g, p } = setup();
  g.turn = 'w';
  giveRoll(g, [2, 2]);
  assert.strictEqual(g.view(p(1)).dice.length, 4);
  for (const [f, t] of [[13, 11], [13, 11], [6, 4], [6, 4]]) assert.deepStrictEqual(g.action(p(1), { type: 'move', from: f, to: t }), { ok: true });
  assert.ok(g.view(p(1)).canCommit);
});

test('Spielende: Gammon zählt doppelt, Partie bis 3', () => {
  const { g, p } = setup(2, { seats: { w: 'p1', b: 'p2' }, matchTo: 3 });
  g.turn = 'w';
  g.board = board({ 1: 1, 19: -15 }, { off: { w: 14 } });
  giveRoll(g, [1, 2]);
  g.action(p(1), { type: 'move', from: 1, to: 'off' });
  assert.strictEqual(g.phase, 'gameEnd');
  assert.strictEqual(g.result.type, 2);
  assert.strictEqual(g.score.w, 2);
  g.next();
  assert.strictEqual(g.phase, 'opening');
  assert.strictEqual(g.gameNo, 2);
  g.turn = 'b';
  g.board = board({ 24: -1, 6: 2 }, { off: { b: 14, w: 13 } });
  giveRoll(g, [1, 5]);
  g.action(p(2), { type: 'move', from: 24, to: 'off' });
  assert.strictEqual(g.score.b, 1);
  assert.strictEqual(g.phase, 'gameEnd');
  g.next();
  g.turn = 'w';
  g.board = board({ 2: 1 }, { off: { w: 14, b: 3 } });
  giveRoll(g, [3, 4]);
  g.action(p(1), { type: 'move', from: 2, to: 'off' });
  assert.strictEqual(g.phase, 'final');
  assert.strictEqual(g.score.w, 3);
});

test('Ohne Gammon-Wertung zählt jeder Sieg einen Punkt', () => {
  const { g, p } = setup(2, { seats: { w: 'p1', b: 'p2' }, gammons: false });
  g.turn = 'w';
  g.board = board({ 1: 1 }, { off: { w: 14 }, bar: { b: 15 } });
  giveRoll(g, [1, 2]);
  g.action(p(1), { type: 'move', from: 1, to: 'off' });
  assert.strictEqual(g.score.w, 1);
});

test('Verdopplungswürfel: aus als Standard, an mit Annehmen und Aufgeben', () => {
  const off = setup();
  off.g.turn = 'w';
  off.g.phase = 'roll';
  assert.ok(off.g.action(off.p(1), { type: 'double' }).error);

  const { g, p } = setup(2, { seats: { w: 'p1', b: 'p2' }, cube: true, matchTo: 5 });
  g.turn = 'w';
  g.phase = 'roll';
  assert.deepStrictEqual(g.action(p(1), { type: 'double' }), { ok: true });
  assert.strictEqual(g.phase, 'doubled');
  assert.ok(g.action(p(1), { type: 'take' }).error, 'Weiß kann nicht selbst annehmen');
  g.action(p(2), { type: 'take' });
  assert.deepStrictEqual(g.cube, { value: 2, owner: 'b' });
  assert.strictEqual(g.phase, 'roll');
  assert.ok(g.action(p(1), { type: 'double' }).error, 'Würfel gehört jetzt Schwarz');
  g.action(p(1), { type: 'roll' });
  g.autoPlay();
  assert.strictEqual(g.turn, 'b');
  g.action(p(2), { type: 'double' });
  g.action(p(1), { type: 'drop' });
  assert.strictEqual(g.score.b, 2);
  assert.strictEqual(g.result.dropped, true);
});

test('Crawford-Regel: im Spiel nach dem Matchball wird nicht verdoppelt, danach wieder', () => {
  const { g, p } = setup(2, { seats: { w: 'p1', b: 'p2' }, cube: true, matchTo: 3 });
  g.score = { w: 2, b: 0 };
  g.phase = 'gameEnd';
  g.next();
  assert.strictEqual(g.crawford, true);
  g.turn = 'b';
  g.phase = 'roll';
  assert.ok(g.action(p(2), { type: 'double' }).error);
  g.phase = 'gameEnd';
  g.next();
  assert.strictEqual(g.crawford, false);
  g.turn = 'b';
  g.phase = 'roll';
  assert.deepStrictEqual(g.action(p(2), { type: 'double' }), { ok: true });
});

test('Zuschauer tippen vor dem ersten Zug, richtige Tipps geben Punkte', () => {
  const { g, p } = setup(4);
  assert.ok(g.action(p(1), { type: 'tip', color: 'b' }).error, 'Spieler tippen nicht');
  assert.deepStrictEqual(g.action(p(3), { type: 'tip', color: 'w' }), { ok: true });
  g.action(p(4), { type: 'tip', color: 'b' });
  assert.deepStrictEqual(g.view(p(1)).tipCounts, { w: 1, b: 1 });
  assert.strictEqual(g.view(p(1)).tips, null, 'wer was getippt hat, bleibt bis zum Start geheim');
  g.tipsOpen = false;
  assert.ok(g.action(p(3), { type: 'tip', color: 'b' }).error);
  g.turn = 'w';
  g.board = board({ 1: 1 }, { off: { w: 14, b: 2 } });
  giveRoll(g, [1, 2]);
  g.action(p(1), { type: 'move', from: 1, to: 'off' });
  assert.deepStrictEqual(g.tipScore, { p3: 1 });
});

test('Sitzplätze: gewünschte Farben, sonst die ersten beiden', () => {
  const a = setup(4, { seats: { w: 'p3', b: null } });
  assert.strictEqual(a.g.seats.w, 'p3');
  assert.strictEqual(a.g.seats.b, 'p1');
  const b = setup(4, { seats: { w: null, b: null } });
  assert.deepStrictEqual([b.g.seats.w, b.g.seats.b].sort(), ['p1', 'p2']);
  assert.throws(() => setup(1, {}), /zwei Spieler/);
  const s = Backgammon.sanitizeSettings(Backgammon.defaultSettings(), { seats: { w: 'p2' } });
  const s2 = Backgammon.sanitizeSettings(s, { seats: { b: 'p2' } });
  assert.deepStrictEqual(s2.seats, { w: null, b: 'p2' });
  assert.strictEqual(Backgammon.defaultSettings().matchTo, 3);
  assert.strictEqual(Backgammon.defaultSettings().cube, false);
});

test('Host setzt einen Zuschauer auf eine Farbe', () => {
  const { g, p } = setup(3);
  assert.ok(g.action(p(2), { type: 'seat', color: 'b', playerId: 'p3' }).error);
  assert.deepStrictEqual(g.action(p(1), { type: 'seat', color: 'b', playerId: 'p3' }), { ok: true });
  assert.ok(g.controls(p(3), 'b'));
  assert.ok(!g.controls(p(2), 'b'));
});

test('Geteiltes Gerät: das Gerät spielt für seinen Gast', () => {
  const lobby = fakeLobby(1, { seats: { w: 'p1', b: 'g1' } });
  lobby.players.set('g1', { id: 'g1', name: 'Gast', connected: true, guestOf: 'p1' });
  const g = new Backgammon(lobby);
  g.start();
  const host = lobby.players.get('p1');
  g.action(host, { type: 'roll' });
  g.action(host, { type: 'roll' });
  assert.ok(g.phase === 'move' || g.openTie);
  assert.deepStrictEqual(g.view(host).myColors, ['w', 'b']);
});

test('Teammodus: ein Ziehender pro Seite, das Team darf vorschlagen', () => {
  const lobby = fakeLobby(4, { teamMode: true });
  for (const [id, t] of [['p1', 't1'], ['p2', 't1'], ['p3', 't2'], ['p4', 't2']]) lobby.players.get(id).teamId = t;
  const g = new Backgammon(lobby);
  g.start();
  const white = g.teamOf.w;
  const moverW = g.movers.w;
  const mate = [...lobby.players.values()].find((x) => x.teamId === white && x.id !== moverW);
  g.turn = 'w';
  giveRoll(g, [6, 1]);
  assert.ok(g.action(mate, { type: 'move', from: 13, to: 7 }).error, 'nur der Ziehende zieht');
  assert.deepStrictEqual(g.action(mate, { type: 'suggest', from: 13, to: 7 }), { ok: true });
  assert.strictEqual(g.view(lobby.players.get(moverW)).suggestions.length, 1);
  const enemy = [...lobby.players.values()].find((x) => x.teamId !== white);
  assert.ok(g.action(enemy, { type: 'suggest', from: 13, to: 7 }).error);
  assert.deepStrictEqual(g.action(lobby.players.get(moverW), { type: 'move', from: 13, to: 7 }), { ok: true });
  // Im nächsten Spiel zieht das andere Teammitglied
  g.phase = 'gameEnd';
  g.next();
  assert.notStrictEqual(g.movers.w, moverW);
  // Verlässt der Ziehende das Spiel, übernimmt ein anderer
  const now = g.movers.w;
  lobby.players.get(now).connected = false;
  g.playersChanged();
  assert.strictEqual(g.movers.w, moverW);
});

test('Ohne möglichen Zug ist sofort der Gegner dran', () => {
  const { g } = setup();
  g.turn = 'w';
  g.board = board({ 19: -2, 20: -2, 21: -2, 22: -2, 23: -2, 24: -2, 13: 2 }, { bar: { w: 1 } });
  giveRoll(g, [3, 4]);
  assert.strictEqual(g.turn, 'b');
  assert.strictEqual(g.phase, 'roll');
  assert.ok(g.lastTurn.noMove);
});

test('Zufallspartien: keine Steine gehen verloren, jede Partie endet', () => {
  for (let n = 0; n < 40; n++) {
    const { g } = setup(2, { seats: { w: 'p1', b: 'p2' }, matchTo: 1 });
    let guard = 0;
    while (g.phase !== 'final' && guard++ < 2000) {
      g.autoPlay();
      for (const c of R.COLORS) assert.strictEqual(R.checkerCount(g.board, c), 15);
      for (let i = 1; i <= 24; i++) assert.ok(Number.isInteger(g.board.points[i]));
    }
    assert.strictEqual(g.phase, 'final', 'Partie endet');
    assert.strictEqual(g.board.off[g.result.winner], 15);
  }
});
