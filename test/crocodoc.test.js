// Regeltests für Croco Doc: node --test

const test = require('node:test');
const assert = require('node:assert');
const CrocoDoc = require('../server/games/crocodoc');

function fakeLobby(n, game = {}) {
  const players = new Map();
  for (let i = 1; i <= n; i++) players.set(`p${i}`, { id: `p${i}`, connected: true, isHost: i === 1 });
  return {
    hostId: 'p1',
    players,
    settings: { game: { ...CrocoDoc.defaultSettings(), ...game } },
    activePlayers: () => [...players.values()].filter((p) => p.connected),
    broadcast() {},
  };
}

function setup(n = 3, game = { orderMode: 'manual', order: ['p1', 'p2', 'p3'] }) {
  const lobby = fakeLobby(n, game);
  const g = new CrocoDoc(lobby);
  g.start();
  return { lobby, game: g, p: (i) => lobby.players.get(`p${i}`) };
}

// Ein Zahn, der nicht zuschnappt
function safeTooth(game) {
  return game.pressed.findIndex((by, i) => !by && i !== game.badTooth);
}

test('feste Reihenfolge des Hosts, fehlende Spieler hinten dran', () => {
  const { game } = setup(4, { orderMode: 'manual', order: ['p3', 'gone', 'p1'] });
  assert.deepStrictEqual(game.order, ['p3', 'p1', 'p2', 'p4']);
  assert.strictEqual(game.activeId, 'p3');
});

test('zufällige Reihenfolge enthält alle Spieler', () => {
  const { game } = setup(5, { orderMode: 'random' });
  assert.deepStrictEqual([...game.order].sort(), ['p1', 'p2', 'p3', 'p4', 'p5']);
});

test('reihum drücken, nur wer dran ist, kein Zahn doppelt', () => {
  const { game, p } = setup();
  const i = safeTooth(game);
  assert.ok(game.action(p(2), { type: 'press', index: i }).error);
  assert.deepStrictEqual(game.action(p(1), { type: 'press', index: i }), { ok: true });
  assert.strictEqual(game.activeId, 'p2');
  assert.ok(game.action(p(2), { type: 'press', index: i }).error);
});

test('der wunde Zahn beißt, Rundenmodus zählt Bisse', () => {
  const { game, p } = setup(3, { orderMode: 'manual', order: ['p1', 'p2', 'p3'], rounds: 2 });
  game.action(p(1), { type: 'press', index: safeTooth(game) });
  game.action(p(2), { type: 'press', index: game.badTooth });
  assert.strictEqual(game.phase, 'bitten');
  assert.strictEqual(game.bites.p2, 1);
  assert.strictEqual(game.view(p(3)).teeth[game.badTooth].bad, true);
  game.next();
  assert.strictEqual(game.phase, 'turn');
  assert.strictEqual(game.activeId, 'p3');
  game.action(p(3), { type: 'press', index: game.badTooth });
  assert.strictEqual(game.phase, 'final');
  const ranking = game.ranking();
  assert.deepStrictEqual(ranking.map((r) => [r.id, r.place]), [['p1', 1], ['p2', 2], ['p3', 2]]);
});

test('wunder Zahn ist vor dem Biss geheim', () => {
  const { game, p } = setup();
  assert.ok(game.view(p(1)).teeth.every((t) => !t.bad));
});

test('K.-o.: Gebissene scheiden aus, der Letzte gewinnt', () => {
  const { game, p } = setup(3, { orderMode: 'manual', order: ['p1', 'p2', 'p3'], mode: 'ko' });
  game.action(p(1), { type: 'press', index: game.badTooth });
  assert.deepStrictEqual(game.out, ['p1']);
  game.next();
  assert.strictEqual(game.activeId, 'p2');
  game.action(p(2), { type: 'press', index: safeTooth(game) });
  assert.strictEqual(game.activeId, 'p3');
  game.action(p(3), { type: 'press', index: safeTooth(game) });
  assert.strictEqual(game.activeId, 'p2');
  game.action(p(2), { type: 'press', index: game.badTooth });
  assert.strictEqual(game.phase, 'final');
  assert.deepStrictEqual(game.ranking().map((r) => [r.id, r.place]), [['p3', 1], ['p2', 2], ['p1', 3]]);
});

test('Host kann zufällig drücken und überspringen, Abwesende werden übersprungen', () => {
  const { game, p } = setup();
  assert.ok(game.action(p(2), { type: 'skip' }).error);
  game.action(p(1), { type: 'skip' });
  assert.strictEqual(game.activeId, 'p2');
  p(3).connected = false;
  game.action(p(1), { type: 'force' });
  if (game.phase === 'turn') assert.strictEqual(game.activeId, 'p1');
  assert.strictEqual(game.pressed.filter(Boolean).length, 1);
});

test('Einstellungen werden begrenzt', () => {
  const s = CrocoDoc.sanitizeSettings(CrocoDoc.defaultSettings(), { teeth: 99, rounds: 0, timeLimit: 7, mode: 'x', orderMode: 'manual', order: ['a', 'a', 3, 'b'] });
  assert.strictEqual(s.teeth, 24);
  assert.strictEqual(s.rounds, 1);
  assert.strictEqual(s.timeLimit, 0);
  assert.strictEqual(s.mode, 'rounds');
  assert.strictEqual(s.orderMode, 'manual');
  assert.deepStrictEqual(s.order, ['a', 'b']);
});
