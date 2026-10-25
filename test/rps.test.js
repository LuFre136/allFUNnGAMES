// Regeltests für RPS: node --test

const test = require('node:test');
const assert = require('node:assert');
const Rps = require('../server/games/rps');

const { Rules } = Rps;

function setup(game = {}, n = 2) {
  const players = new Map();
  for (let i = 1; i <= n; i++) players.set(`p${i}`, { id: `p${i}`, name: `Spieler ${i}`, connected: true, isHost: i === 1 });
  const lobby = {
    hostId: 'p1',
    players,
    settings: { hostPlays: true, game: { ...Rps.defaultSettings(), ...game } },
    activePlayers: () => [...players.values()].filter((p) => p.connected),
    broadcast() {},
  };
  const g = new Rps(lobby);
  return { lobby, g, p: (i) => players.get(`p${i}`) };
}

// p1 ist in der ersten Partie Rot, beide sind sofort bereit
function started(game = {}) {
  const ctx = setup(game);
  ctx.g.start();
  ctx.g.ids = ['p1', 'p2'];
  ctx.go = (i, data) => assert.deepStrictEqual(ctx.g.action(ctx.p(i), data), { ok: true });
  return ctx;
}

// Leeres Brett mit ausgewählten Figuren
function position(pieces, turn = 'red') {
  const s = Rules.create({ red: Rules.randomArrangement(), blue: Rules.randomArrangement() }, { first: turn });
  s.board.fill(null);
  let id = 1;
  for (const [cell, [color, type]] of Object.entries(pieces)) s.board[cell] = { id: id++, color, type, known: false };
  return s;
}

test('Aufstellung: 14 Figuren mit Fahne, Falle und je vier Waffen', () => {
  for (let i = 0; i < 50; i++) assert.ok(Rules.validArrangement(Rules.randomArrangement()));
  const a = Rules.randomArrangement();
  const b = Rules.reshuffle(a);
  assert.ok(Rules.validArrangement(b));
  assert.strictEqual(b.indexOf('flag'), a.indexOf('flag'), 'Fahne bleibt beim Mischen liegen');
  assert.strictEqual(b.indexOf('trap'), a.indexOf('trap'), 'Falle bleibt beim Mischen liegen');
  assert.deepStrictEqual(Rules.homeCells('red').slice(0, 7), [35, 36, 37, 38, 39, 40, 41]);
  assert.deepStrictEqual(Rules.homeCells('blue').slice(7), [7, 8, 9, 10, 11, 12, 13]);
});

test('Spiel braucht genau zwei Spieler', () => {
  assert.throws(() => setup({}, 1).g.start(), /zu zweit/);
  assert.throws(() => setup({}, 3).g.start(), /zu zweit/);
  assert.doesNotThrow(() => setup({}, 2).g.start());
});

test('Aufstellen: tauschen, mischen, bereit; die Figuren des Gegners bleiben geheim', () => {
  const { g, p, go } = started();
  assert.strictEqual(g.phase, 'setup');
  const before = [...g.setup.red.arrangement];
  go(1, { type: 'swap', a: 0, b: 13 });
  assert.strictEqual(g.setup.red.arrangement[0], before[13]);
  assert.strictEqual(g.setup.red.arrangement[13], before[0]);
  assert.ok(g.action(p(1), { type: 'swap', a: 0, b: 14 }).error);
  const v = g.view(p(2));
  const red = v.board.filter((x) => x && x.color === 'red');
  assert.strictEqual(red.length, 14);
  assert.ok(red.every((x) => x.type === null), 'Blau sieht keine roten Figuren');
  assert.ok(v.board.filter((x) => x && x.color === 'blue').every((x) => x.type), 'Blau sieht die eigenen');
  go(1, { type: 'ready' });
  assert.ok(g.action(p(1), { type: 'shuffle' }).error, 'bereit heißt: nichts mehr ändern');
  go(1, { type: 'unready' });
  go(1, { type: 'shuffle' });
  go(1, { type: 'ready' });
  go(2, { type: 'ready' });
  assert.strictEqual(g.phase, 'play');
  assert.strictEqual(g.turnId(), 'p1');
  // Auf dem Brett steht, was aufgestellt wurde
  Rules.homeCells('red').forEach((cell, i) => assert.strictEqual(g.state.board[cell].type, g.setup.red.arrangement[i]));
  // Der Host-Fernseher (spielt nicht mit) sieht nichts Geheimes
  const tv = g.view({ id: 'tv', isHost: true });
  assert.ok(tv.board.filter(Boolean).every((x) => x.type === null));
});

test('Ziehen: ein Feld gerade, nicht auf eigene Figuren, Fahne und Falle stehen fest', () => {
  const s = position({ 23: ['red', 'rock'], 22: ['red', 'paper'], 30: ['red', 'flag'], 16: ['red', 'trap'], 0: ['blue', 'scissors'] });
  const from23 = Rules.legalMoves(s).filter((m) => m.from === 23).map((m) => m.to);
  assert.deepStrictEqual(from23, [24], 'oben Falle, unten Fahne, links Papier: nur rechts frei');
  assert.ok(!Rules.legalMoves(s).some((m) => m.from === 30 || m.from === 16));
  // Auf gegnerische Figuren darf man ziehen (Angriff)
  s.board[24] = { id: 99, color: 'blue', type: 'flag', known: false };
  assert.ok(Rules.isLegal(s, { from: 23, to: 24 }));
  // Am Rand gibt es weniger Nachbarn
  assert.deepStrictEqual(Rules.neighbors(0).sort((a, b) => a - b), [1, 7]);
  assert.deepStrictEqual(Rules.neighbors(41).sort((a, b) => a - b), [34, 40]);
});

test('Kampf: Stein schlägt Schere, Schere schlägt Papier, Papier schlägt Stein', () => {
  assert.strictEqual(Rules.fight('rock', 'scissors'), 'attacker');
  assert.strictEqual(Rules.fight('scissors', 'paper'), 'attacker');
  assert.strictEqual(Rules.fight('paper', 'rock'), 'attacker');
  assert.strictEqual(Rules.fight('scissors', 'rock'), 'defender');
  assert.strictEqual(Rules.fight('rock', 'rock'), 'tie');
  // Angreifer gewinnt: zieht aufs Feld und ist aufgedeckt
  const s = position({ 21: ['red', 'rock'], 14: ['blue', 'scissors'], 0: ['blue', 'paper'], 41: ['red', 'paper'] });
  const e = Rules.apply(s, { from: 21, to: 14 });
  assert.strictEqual(e.outcome, 'attacker');
  assert.strictEqual(s.board[14].color, 'red');
  assert.strictEqual(s.board[14].known, true);
  assert.strictEqual(s.board[21], null);
  assert.strictEqual(s.turn, 'blue');
  // Verteidiger gewinnt: bleibt stehen, Angreifer ist weg
  const t = position({ 21: ['red', 'rock'], 14: ['blue', 'paper'], 0: ['blue', 'paper'], 41: ['red', 'paper'] });
  Rules.apply(t, { from: 21, to: 14 }, { reveal: false });
  assert.strictEqual(t.board[14].color, 'blue');
  assert.strictEqual(t.board[14].known, false, 'ohne Aufdecken bleibt der Sieger verdeckt');
  assert.strictEqual(t.board[21], null);
});

test('Gleichstand: beide wählen heimlich neu, bis es entschieden ist', () => {
  const { g, p, go } = started();
  go(1, { type: 'ready' });
  go(2, { type: 'ready' });
  const s = g.state;
  s.board.fill(null);
  s.board[21] = { id: 1, color: 'red', type: 'rock', known: false };
  s.board[14] = { id: 2, color: 'blue', type: 'rock', known: false };
  s.board[41] = { id: 3, color: 'red', type: 'flag', known: false };
  s.board[0] = { id: 4, color: 'blue', type: 'flag', known: false };
  s.board[6] = { id: 5, color: 'blue', type: 'paper', known: false };
  go(1, { type: 'move', from: 21, to: 14 });
  assert.ok(g.state.duel, 'Gleichstand');
  assert.strictEqual(g.turnId(), null, 'während des Gleichstands zieht niemand');
  assert.ok(g.action(p(1), { type: 'move', from: 21, to: 22 }).error);
  go(2, { type: 'pick', weapon: 'paper' });
  assert.ok(g.action(p(2), { type: 'pick', weapon: 'rock' }).error, 'nur einmal wählen');
  assert.strictEqual(g.view(p(1)).duel.picked.blue, true);
  assert.strictEqual(g.view(p(1)).duel.myPick, null, 'Rot sieht nicht, was Blau gewählt hat');
  go(1, { type: 'pick', weapon: 'paper' });
  assert.ok(g.state.duel, 'wieder gleich');
  assert.strictEqual(g.state.duel.clash.rounds.length, 2);
  go(1, { type: 'pick', weapon: 'scissors' });
  go(2, { type: 'pick', weapon: 'paper' });
  assert.strictEqual(g.state.duel, null);
  assert.strictEqual(g.state.board[14].color, 'red');
  assert.strictEqual(g.state.board[14].type, 'scissors');
  assert.strictEqual(g.lastMove.outcome, 'attacker');
  assert.strictEqual(g.turnId(), 'p2');
});

test('Falle: der Angreifer ist weg, die Falle bleibt und ist aufgedeckt', () => {
  const s = position({ 21: ['red', 'rock'], 14: ['blue', 'trap'], 0: ['blue', 'paper'], 41: ['red', 'paper'] });
  const e = Rules.apply(s, { from: 21, to: 14 });
  assert.strictEqual(e.outcome, 'trap');
  assert.strictEqual(s.board[21], null);
  assert.strictEqual(s.board[14].type, 'trap');
  assert.strictEqual(s.board[14].known, true);
  assert.strictEqual(s.stats.blue.trapped, 1);
});

test('Fahne erobert oder letzten Kämpfer verloren: Partie vorbei', () => {
  const s = position({ 21: ['red', 'scissors'], 14: ['blue', 'flag'], 0: ['blue', 'paper'] });
  Rules.apply(s, { from: 21, to: 14 });
  assert.deepStrictEqual(s.result, { winner: 'red', reason: 'flag' });
  // Blau verliert seinen letzten Kämpfer
  const t = position({ 21: ['red', 'rock'], 14: ['blue', 'scissors'], 0: ['blue', 'flag'], 41: ['red', 'flag'] });
  Rules.apply(t, { from: 21, to: 14 });
  assert.deepStrictEqual(t.result, { winner: 'red', reason: 'pieces' });
});

test('Eingesperrt verliert, auch nach einem Gleichstand entscheidet der Kampf', () => {
  const u = position({ 22: ['red', 'rock'], 0: ['blue', 'paper'], 1: ['blue', 'flag'], 7: ['blue', 'trap'], 41: ['red', 'flag'] });
  Rules.apply(u, { from: 22, to: 23 });
  assert.deepStrictEqual(u.result, { winner: 'red', reason: 'blocked' });
  const v = position({ 21: ['red', 'rock'], 14: ['blue', 'rock'], 0: ['blue', 'flag'], 41: ['red', 'flag'] });
  Rules.apply(v, { from: 21, to: 14 });
  Rules.pick(v, 'red', 'scissors');
  Rules.pick(v, 'blue', 'rock');
  assert.deepStrictEqual(v.result, { winner: 'blue', reason: 'pieces' });
});

test('Zufallspartien enden immer', () => {
  for (let i = 0; i < 200; i++) {
    const s = Rules.create({ red: Rules.randomArrangement(), blue: Rules.randomArrangement() });
    let guard = 0;
    while (!s.result && guard++ < 20000) {
      if (s.duel) {
        for (const c of ['red', 'blue']) if (s.duel && !s.duel.picks[c]) Rules.pick(s, c, Rules.WEAPONS[Math.floor(Math.random() * 3)]);
        continue;
      }
      const moves = Rules.legalMoves(s);
      assert.ok(moves.length, 'ohne Ergebnis gibt es immer einen Zug');
      Rules.apply(s, moves[Math.floor(Math.random() * moves.length)]);
      if (s.sinceClash >= 400) break; // reiner Zufall kann ewig tanzen; im Spiel greift die Remisregel
    }
    for (const c of ['red', 'blue']) assert.ok(Rules.count(s, c) <= 14);
  }
});

test('Serie: Farben wechseln, Aufgeben, Remis, Endstand', () => {
  const { g, p, go } = started();
  go(1, { type: 'ready' });
  go(2, { type: 'ready' });
  assert.strictEqual(g.colorOf('p1'), 'red');
  go(2, { type: 'resign' });
  assert.strictEqual(g.phase, 'gameEnd');
  assert.strictEqual(g.result.winnerId, 'p1');
  // Nach der Partie liegen alle Figuren offen
  assert.ok(g.view(p(2)).board.filter(Boolean).every((x) => x.type));
  g.next();
  assert.strictEqual(g.phase, 'setup');
  assert.strictEqual(g.colorOf('p1'), 'blue');
  go(1, { type: 'force' });
  assert.strictEqual(g.phase, 'play');
  assert.strictEqual(g.turnId(), 'p2', 'Rot fängt an');
  go(1, { type: 'draw' });
  assert.deepStrictEqual(g.score, { p1: 1.5, p2: 0.5 });
  g.next();
  go(1, { type: 'force' });
  go(2, { type: 'resign' });
  assert.strictEqual(g.phase, 'final');
  assert.strictEqual(g.view(p(2)).stats.p1.wins, 2);
});

test('Nur der Host darf Remis werten und Züge auslosen; Zeitablauf zieht zufällig', () => {
  const { g, p, go } = started({ timeLimit: 15 });
  assert.ok(g.action(p(2), { type: 'force' }).error);
  go(1, { type: 'force' });
  assert.strictEqual(g.phase, 'play');
  assert.ok(g.deadline);
  g.timeout();
  assert.strictEqual(g.state.plies, 1);
  assert.ok(g.action(p(2), { type: 'draw' }).error);
  // Dreimal hintereinander die Zeit verstreichen lassen verliert
  const { g: h, go: go2 } = started({ timeLimit: 15 });
  go2(1, { type: 'force' });
  for (let i = 0; i < 6 && h.phase === 'play'; i++) {
    if (h.state.duel) h.timeout();
    h.timeout();
  }
  assert.notStrictEqual(h.phase, 'play');
  g.dispose();
  h.dispose();
});

test('Ansicht: legale Züge nur für den, der dran ist; eigene bekannte Figuren sind markiert', () => {
  const { g, p, go } = started();
  go(1, { type: 'ready' });
  go(2, { type: 'ready' });
  assert.ok(g.view(p(1)).legal.length > 0);
  assert.strictEqual(g.view(p(2)).legal.length, 0);
  assert.strictEqual(g.view(p(2)).myColor, 'blue');
  assert.deepStrictEqual(g.view(p(1)).players[0].left, { rock: 4, paper: 4, scissors: 4 });
});

test('Wer weg ist, bekommt eine Frist, wer zurückkommt, spielt weiter', () => {
  const { g, p } = started();
  p(2).connected = false;
  g.playersChanged();
  assert.strictEqual(g.view(p(1)).awayId, 'p2');
  p(2).connected = true;
  g.playersChanged();
  assert.strictEqual(g.awayId, null);
  g.dispose();
});
