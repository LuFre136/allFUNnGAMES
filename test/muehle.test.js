// Regeltests für Mühle: node --test

const test = require('node:test');
const assert = require('node:assert');
const Muehle = require('../server/games/muehle');

const { Rules } = Muehle;

function setup(game = {}, n = 2) {
  const players = new Map();
  for (let i = 1; i <= n; i++) players.set(`p${i}`, { id: `p${i}`, name: `Spieler ${i}`, connected: true, isHost: i === 1 });
  const lobby = {
    hostId: 'p1',
    players,
    settings: { hostPlays: true, game: { ...Muehle.defaultSettings(), ...game } },
    activePlayers: () => [...players.values()].filter((p) => p.connected),
    broadcast() {},
  };
  const g = new Muehle(lobby);
  return { lobby, g, p: (i) => players.get(`p${i}`) };
}

function started(game = {}) {
  const ctx = setup(game);
  ctx.g.start();
  ctx.g.ids = ['p1', 'p2']; // p1 ist in der ersten Partie Weiß
  return ctx;
}

// Baut eine Stellung direkt auf
function position(stones, { hand = { w: 0, b: 0 }, turn = 'w', flying = true } = {}) {
  const s = Rules.create({ flying });
  s.hand = { ...hand };
  s.turn = turn;
  for (const [p, c] of Object.entries(stones)) s.board[p] = c;
  return s;
}

test('Brett: 24 Punkte, 16 Mühlen, jede Seitenmitte hat Verbindung zum Nachbarring', () => {
  assert.strictEqual(Rules.COORDS.length, 24);
  assert.strictEqual(Rules.MILLS.length, 16);
  assert.deepStrictEqual(Rules.NEIGHBORS[0], [1, 7]);
  assert.deepStrictEqual(Rules.NEIGHBORS[9], [1, 8, 10, 17]);
  assert.deepStrictEqual(Rules.NEIGHBORS[17], [9, 16, 18]);
  // Jede Mühle liegt auf einer geraden Linie des Rasters
  for (const m of Rules.MILLS) {
    const xs = new Set(m.map((p) => Rules.COORDS[p][0]));
    const ys = new Set(m.map((p) => Rules.COORDS[p][1]));
    assert.ok(xs.size === 1 || ys.size === 1, `Mühle ${m}`);
  }
  // Nachbarn sind symmetrisch
  Rules.NEIGHBORS.forEach((list, a) => list.forEach((b) => assert.ok(Rules.NEIGHBORS[b].includes(a))));
});

test('Spiel braucht genau zwei Spieler', () => {
  assert.throws(() => setup({}, 1).g.start(), /zu zweit/);
  assert.throws(() => setup({}, 3).g.start(), /zu zweit/);
  assert.doesNotThrow(() => setup({}, 2).g.start());
});

test('Setzen, Mühle schließen, Stein nehmen; geschützte Steine in Mühlen', () => {
  const { g, p } = started();
  const go = (i, data) => assert.deepStrictEqual(g.action(p(i), data), { ok: true });
  assert.ok(g.action(p(2), { type: 'place', to: 0 }).error, 'Schwarz ist nicht dran');
  go(1, { type: 'place', to: 0 });
  go(2, { type: 'place', to: 8 });
  go(1, { type: 'place', to: 1 });
  go(2, { type: 'place', to: 9 });
  go(1, { type: 'place', to: 2 }); // Mühle 0-1-2
  assert.strictEqual(g.state.pendingRemove, 1);
  assert.strictEqual(g.state.turn, 'w');
  assert.deepStrictEqual(g.lastMove.mills, [[0, 1, 2]]);
  assert.ok(g.action(p(1), { type: 'place', to: 5 }).error);
  assert.ok(g.action(p(1), { type: 'remove', at: 1 }).error, 'eigener Stein');
  go(1, { type: 'remove', at: 8 });
  assert.strictEqual(g.state.turn, 'b');
  assert.deepStrictEqual(g.lastMove.removed, [8]);
  assert.strictEqual(g.view(p(1)).players[1].lost, 1);
  // Steine in einer Mühle sind geschützt, solange es andere gibt
  const s = position({ 0: 'w', 1: 'w', 2: 'w', 5: 'w', 16: 'b', 17: 'b' }, { turn: 'b' });
  s.pendingRemove = 1;
  assert.deepStrictEqual(Rules.removable(s), [5]);
  s.board[5] = null;
  assert.deepStrictEqual(Rules.removable(s), [0, 1, 2]);
});

test('Ziehen nur zum freien Nachbarn, Springen mit drei Steinen', () => {
  const s = position({ 0: 'w', 1: 'w', 9: 'w', 10: 'w', 20: 'b', 21: 'b', 22: 'b', 4: 'w' });
  const moves = Rules.legalMoves(s).filter((m) => m.from === 0);
  assert.deepStrictEqual(moves.map((m) => m.to), [7]);
  s.turn = 'b';
  assert.strictEqual(Rules.phaseOf(s, 'b'), 'fly');
  assert.strictEqual(Rules.legalMoves(s).filter((m) => m.from === 20).length, 24 - 8);
  const noFly = position({ 20: 'b', 21: 'b', 22: 'b', 0: 'w', 1: 'w', 2: 'w', 3: 'w' }, { turn: 'b', flying: false });
  assert.strictEqual(Rules.phaseOf(noFly, 'b'), 'move');
});

test('Wer nur noch zwei Steine hat, verliert', () => {
  const s = position({ 0: 'w', 1: 'w', 3: 'w', 16: 'b', 17: 'b', 22: 'b' });
  Rules.apply(s, { type: 'move', from: 3, to: 2 });
  assert.strictEqual(s.pendingRemove, 1);
  Rules.apply(s, { type: 'remove', at: 22 });
  assert.deepStrictEqual(s.result, { winner: 'w', reason: 'stones' });
});

test('Wer nicht mehr ziehen kann, ist eingesperrt und verliert', () => {
  // Schwarz auf 0, 2 und 4; Weiß sperrt mit dem Zug nach 5 den letzten freien Nachbarn
  const s = position({ 0: 'b', 2: 'b', 4: 'b', 1: 'w', 7: 'w', 3: 'w', 6: 'w' }, { flying: false });
  Rules.apply(s, { type: 'move', from: 6, to: 5 });
  assert.deepStrictEqual(s.result, { winner: 'w', reason: 'blocked' });
});

test('Doppelmühle nimmt standardmäßig einen Stein, mit Einstellung zwei', () => {
  for (const [take, expected] of [[1, 1], [2, 2]]) {
    const s = position({ 0: 'w', 1: 'w', 9: 'w', 17: 'w', 20: 'b', 21: 'b', 12: 'b', 13: 'b' }, { hand: { w: 1, b: 0 } });
    s.doubleMill = take;
    Rules.apply(s, { type: 'place', to: 2 });
    assert.strictEqual(s.pendingRemove, 1, 'eine Mühle');
    const e = position({ 1: 'w', 17: 'w', 8: 'w', 10: 'w', 20: 'b', 21: 'b', 12: 'b', 13: 'b', 14: 'b' }, { hand: { w: 1, b: 0 } });
    e.doubleMill = take;
    Rules.apply(e, { type: 'place', to: 9 }); // 8-9-10 und 1-9-17
    assert.strictEqual(e.pendingRemove, expected);
  }
});

test('Dreimal dieselbe Stellung ist Remis', () => {
  const s = position({ 0: 'w', 4: 'w', 6: 'w', 16: 'b', 18: 'b', 20: 'b', 11: 'w', 13: 'b' }, { flying: false });
  const loop = [
    { type: 'move', from: 0, to: 1 }, { type: 'move', from: 16, to: 17 },
    { type: 'move', from: 1, to: 0 }, { type: 'move', from: 17, to: 16 },
  ];
  let i = 0;
  while (!s.result && i < 20) Rules.apply(s, loop[i++ % loop.length]);
  assert.deepStrictEqual(s.result, { winner: null, reason: 'repetition' });
  assert.strictEqual(i, 9, 'die Stellung nach dem ersten Zug kommt im neunten Zug zum dritten Mal');
});

test('Zufallspartien enden immer und verlieren keine Steine', () => {
  for (let i = 0; i < 300; i++) {
    const s = Rules.create({ flying: i % 2 === 0, doubleMill: i % 3 === 0 ? 2 : 1 });
    let guard = 0;
    while (!s.result && guard++ < 5000) {
      const moves = Rules.legalMoves(s);
      assert.ok(moves.length, 'ohne Ergebnis gibt es immer einen Zug');
      Rules.apply(s, moves[Math.floor(Math.random() * moves.length)]);
      for (const c of ['w', 'b']) assert.ok(s.hand[c] + Rules.onBoard(s, c) <= Rules.STONES);
    }
    assert.ok(s.result, 'Partie endet');
  }
});

test('Serie Best of 3: Farben wechseln, nach zwei Siegen ist Schluss', () => {
  const { g, p } = started();
  assert.strictEqual(g.colorOf('p1'), 'w');
  g.action(p(2), { type: 'resign' });
  assert.strictEqual(g.phase, 'gameEnd');
  assert.strictEqual(g.result.winnerId, 'p1');
  assert.strictEqual(g.result.reason, 'resign');
  g.next();
  assert.strictEqual(g.colorOf('p1'), 'b');
  assert.strictEqual(g.turnId(), 'p2');
  g.action(p(1), { type: 'draw' });
  assert.strictEqual(g.phase, 'gameEnd');
  assert.deepStrictEqual(g.score, { p1: 1.5, p2: 0.5 });
  g.next();
  g.action(p(2), { type: 'resign' });
  assert.strictEqual(g.phase, 'final');
  assert.strictEqual(g.view(p(2)).stats.p1.wins, 2);
});

test('Gleichstand nach drei Partien: Entscheidungspartie', () => {
  const { g, p } = started();
  g.action(p(1), { type: 'draw' });
  g.next();
  g.action(p(1), { type: 'draw' });
  g.next();
  g.action(p(1), { type: 'draw' });
  assert.strictEqual(g.phase, 'gameEnd');
  g.next();
  assert.strictEqual(g.gameNo, 4);
  g.action(p(1), { type: 'resign' });
  assert.strictEqual(g.phase, 'final');
});

test('Nur der Host darf Remis erklären, Zug auslosen und die Serie beenden', () => {
  const { g, p } = started({ bestOf: 0 });
  assert.ok(g.action(p(2), { type: 'draw' }).error);
  assert.ok(g.action(p(2), { type: 'force' }).error);
  g.action(p(1), { type: 'force' });
  assert.strictEqual(g.state.turn, 'b');
  for (let i = 0; i < 5; i++) {
    g.action(p(1), { type: 'resign' });
    g.next();
  }
  assert.strictEqual(g.phase, 'play', 'ohne Ende läuft weiter');
  g.action(p(1), { type: 'finish' });
  assert.strictEqual(g.phase, 'final');
  g.dispose();
});

test('Geteiltes Gerät: der Gast zieht am Gerät des Hosts', () => {
  const { g, lobby, p } = setup({}, 1);
  lobby.players.set('g1', { id: 'g1', name: 'Gast', connected: true, guestOf: 'p1' });
  g.start();
  g.ids = ['p1', 'g1'];
  assert.deepStrictEqual(g.action(p(1), { type: 'place', to: 0 }), { ok: true });
  assert.deepStrictEqual(g.action(p(1), { type: 'place', to: 5 }), { ok: true });
  assert.strictEqual(g.state.board[5], 'b');
  // Aufgeben am geteilten Gerät trifft den, der am Zug ist (Weiß = p1)
  g.action(p(1), { type: 'resign' });
  assert.strictEqual(g.result.winnerId, 'g1');
});

test('Zeitablauf macht einen Zufallszug, dreimal hintereinander verliert', () => {
  const { g } = started({ timeLimit: 15 });
  g.timeout();
  assert.strictEqual(g.state.turn, 'b');
  g.timeout();
  g.timeout();
  g.timeout();
  assert.strictEqual(g.phase, 'play');
  g.timeout();
  assert.strictEqual(g.phase, 'gameEnd');
  assert.strictEqual(g.result.reason, 'time');
  assert.strictEqual(g.result.winnerId, 'p2');
  g.dispose();
});

test('Wer weg ist, bekommt eine Frist, wer zurückkommt, spielt weiter', () => {
  const { g, p, lobby } = started();
  p(2).connected = false;
  g.playersChanged();
  assert.strictEqual(g.view(p(1)).awayId, 'p2');
  p(2).connected = true;
  g.playersChanged();
  assert.strictEqual(g.awayId, null);
  assert.ok(lobby);
  g.dispose();
});

test('Ansicht: legale Züge nur für den, der dran ist', () => {
  const { g, p } = started();
  assert.strictEqual(g.view(p(1)).legal.length, 24);
  assert.strictEqual(g.view(p(2)).legal.length, 0);
  assert.strictEqual(g.view(p(1)).players[0].hand, 9);
});
