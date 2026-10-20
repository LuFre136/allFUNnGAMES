// Regeltests für Kreuz & Quer: node --test

const test = require('node:test');
const assert = require('node:assert');
const KreuzQuer = require('../server/games/kreuzquer');

function fakeLobby(n) {
  const players = new Map();
  for (let i = 1; i <= n; i++) players.set(`p${i}`, { id: `p${i}`, connected: true, isHost: i === 1 });
  return {
    hostId: 'p1',
    players,
    settings: { game: { ...KreuzQuer.defaultSettings(), timeLimit: 0, starter: 'host' } },
    activePlayers: () => [...players.values()].filter((p) => p.connected),
    broadcast() {},
  };
}

function setup(n = 2) {
  const lobby = fakeLobby(n);
  const game = new KreuzQuer(lobby);
  game.start();
  return { lobby, game, p: (i) => lobby.players.get(`p${i}`) };
}

function rollWith(game, dice) {
  assert.deepStrictEqual(game.roll(), { ok: true });
  Object.assign(game.dice, dice);
}

test('Punkte pro Reihe', () => {
  assert.deepStrictEqual([1, 2, 3, 4, 12].map(KreuzQuer.rowPoints), [1, 3, 6, 10, 78]);
});

test('nur rechts vom letzten Kreuz, letztes Feld erst ab fünf Kreuzen', () => {
  const sheet = { rows: { red: [5], yellow: [], green: [], blue: [] }, locks: {}, penalties: 0 };
  const closed = new Set();
  assert.ok(!KreuzQuer.canMark(sheet, 'red', 4, closed));
  assert.ok(!KreuzQuer.canMark(sheet, 'red', 5, closed));
  assert.ok(KreuzQuer.canMark(sheet, 'red', 6, closed));
  assert.ok(!KreuzQuer.canMark(sheet, 'red', 12, closed));
  sheet.rows.red = [2, 3, 4, 5, 6];
  assert.ok(KreuzQuer.canMark(sheet, 'red', 12, closed));
  assert.ok(KreuzQuer.canMark(sheet, 'green', 12, closed));
  assert.ok(!KreuzQuer.canMark(sheet, 'green', 12, new Set(['green'])));
});

test('weiße Summe für alle, Farbkombination nur für den Würfelnden', () => {
  const { game, p } = setup();
  assert.strictEqual(game.activeId, 'p1');
  assert.ok(game.action(p(2), { type: 'roll' }).error);
  rollWith(game, { white1: 3, white2: 4, red: 1, yellow: 6, green: 2, blue: 5 });
  assert.deepStrictEqual(game.action(p(2), { type: 'mark', color: 'blue', number: 7 }), { ok: true });
  assert.ok(game.action(p(2), { type: 'mark', color: 'red', number: 8 }).error);
  game.action(p(1), { type: 'done' });
  game.action(p(2), { type: 'done' });
  assert.strictEqual(game.phase, 'color');
  assert.deepStrictEqual(game.sheet('p2').rows.blue, [7]);
  assert.ok(game.action(p(2), { type: 'mark', color: 'red', number: 4 }).error);
  // Weiß 3 + Rot 1 = 4
  assert.deepStrictEqual(game.action(p(1), { type: 'mark', color: 'red', number: 4 }), { ok: true });
  game.action(p(1), { type: 'done' });
  assert.deepStrictEqual(game.sheet('p1').rows.red, [4]);
  assert.strictEqual(game.sheet('p1').penalties, 0);
  assert.strictEqual(game.phase, 'roll');
  assert.strictEqual(game.activeId, 'p2');
});

test('Fehlwurf nur für den Würfelnden, wenn er nichts ankreuzt', () => {
  const { game, p } = setup();
  rollWith(game, { white1: 1, white2: 1, red: 1, yellow: 1, green: 1, blue: 1 });
  game.action(p(1), { type: 'done' });
  game.action(p(2), { type: 'done' });
  game.action(p(1), { type: 'done' });
  assert.strictEqual(game.sheet('p1').penalties, 1);
  assert.strictEqual(game.sheet('p2').penalties, 0);
});

test('vier Fehlwürfe beenden das Spiel mit Wertung', () => {
  const { game, p } = setup();
  game.sheet('p1').penalties = 3;
  game.sheet('p2').rows.red = [2, 3, 4];
  rollWith(game, { white1: 1, white2: 1 });
  game.action(p(1), { type: 'done' });
  game.action(p(2), { type: 'done' });
  game.action(p(1), { type: 'done' });
  assert.strictEqual(game.phase, 'final');
  assert.strictEqual(game.totals.p1, -20);
  assert.strictEqual(game.totals.p2, 6);
});

test('gleichzeitiges Schließen: beide bekommen das Schloss, zwei Reihen beenden das Spiel', () => {
  const { game, p } = setup();
  game.sheet('p1').rows.red = [2, 3, 4, 5, 6];
  game.sheet('p2').rows.red = [7, 8, 9, 10, 11];
  game.closed.add('yellow');
  rollWith(game, { white1: 6, white2: 6 });
  game.action(p(1), { type: 'mark', color: 'red', number: 12 });
  game.action(p(2), { type: 'mark', color: 'red', number: 12 });
  game.action(p(1), { type: 'done' });
  game.action(p(2), { type: 'done' });
  assert.ok(game.sheet('p1').locks.red && game.sheet('p2').locks.red);
  assert.strictEqual(game.phase, 'final');
  // 6 Kreuze + Schloss = 7 → 28 Punkte
  assert.strictEqual(game.totals.p1, 28);
});

test('geschlossene Reihe: Würfel fliegt raus', () => {
  const { game } = setup();
  game.closed.add('green');
  rollWith(game, {});
  assert.strictEqual(game.dice.green, null);
});

test('mehrere Partien addieren die Punkte', () => {
  const { lobby, game, p } = setup();
  lobby.settings.game.games = 2;
  game.sheet('p1').penalties = 3;
  rollWith(game, { white1: 1, white2: 1 });
  game.action(p(1), { type: 'done' });
  game.action(p(2), { type: 'done' });
  game.action(p(1), { type: 'done' });
  assert.strictEqual(game.phase, 'result');
  game.action(p(1), { type: 'next' });
  assert.strictEqual(game.phase, 'roll');
  assert.strictEqual(game.activeId, 'p2');
  assert.strictEqual(game.sheet('p1').penalties, 0);
  assert.strictEqual(game.view(p(1)).players.find((x) => x.id === 'p1').total, -20);
});

test('getrennter Mitspieler hält den weißen Schritt nicht auf', () => {
  const { game, p } = setup(3);
  rollWith(game, { white1: 2, white2: 2 });
  game.action(p(1), { type: 'done' });
  game.action(p(2), { type: 'done' });
  p(3).connected = false;
  game.playersChanged();
  assert.strictEqual(game.phase, 'color');
});
