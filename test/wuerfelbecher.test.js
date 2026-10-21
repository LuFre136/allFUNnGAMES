// Regeltests für Würfelbecher: node --test

const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const Wuerfelbecher = require('../server/games/wuerfelbecher');
const { createBoard } = require('../server/highscores');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-'));
const boardFile = path.join(tmp, 'highscores.json');
Wuerfelbecher.useHighscores(createBoard('test', { file: boardFile, github: false }));

function fakeLobby(n, game = {}) {
  const players = new Map();
  for (let i = 1; i <= n; i++) players.set(`p${i}`, { id: `p${i}`, connected: true, isHost: i === 1 });
  return {
    hostId: 'p1',
    players,
    settings: { game: { ...Wuerfelbecher.defaultSettings(), orderMode: 'manual', order: [...players.keys()], ...game } },
    activePlayers: () => [...players.values()].filter((p) => p.connected),
    broadcast() {},
  };
}

function setup(n = 2, game = {}) {
  const lobby = fakeLobby(n, game);
  const g = new Wuerfelbecher(lobby);
  g.start();
  return { lobby, game: g, p: (i) => lobby.players.get(`p${i}`) };
}

test('Punkte je Kategorie', () => {
  const s = Wuerfelbecher.scoreFor;
  assert.strictEqual(s('threes', [3, 3, 1, 3, 6]), 9);
  assert.strictEqual(s('threeKind', [3, 3, 1, 3, 6]), 16);
  assert.strictEqual(s('threeKind', [3, 3, 1, 2, 6]), 0);
  assert.strictEqual(s('fourKind', [5, 5, 5, 5, 2]), 22);
  assert.strictEqual(s('fourKind', [5, 5, 5, 5, 5]), 25);
  assert.strictEqual(s('fullHouse', [2, 2, 5, 5, 5]), 25);
  assert.strictEqual(s('fullHouse', [5, 5, 5, 5, 5]), 0);
  assert.strictEqual(s('smallStraight', [1, 2, 3, 4, 4]), 30);
  assert.strictEqual(s('smallStraight', [6, 3, 5, 4, 1]), 30);
  assert.strictEqual(s('smallStraight', [1, 2, 3, 5, 6]), 0);
  assert.strictEqual(s('largeStraight', [2, 3, 4, 5, 6]), 40);
  assert.strictEqual(s('largeStraight', [1, 2, 3, 4, 6]), 0);
  assert.strictEqual(s('kniffel', [4, 4, 4, 4, 4]), 50);
  assert.strictEqual(s('chance', [1, 2, 3, 4, 6]), 16);
});

test('Bonus ab 63 Punkten oben', () => {
  const sheet = Object.fromEntries(Wuerfelbecher.CATEGORIES.map((c) => [c, null]));
  Object.assign(sheet, { ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 });
  assert.deepStrictEqual(Wuerfelbecher.sheetScore(sheet), { upper: 63, bonus: 35, lower: 0, total: 98 });
  sheet.sixes = 12;
  assert.strictEqual(Wuerfelbecher.sheetScore(sheet).bonus, 0);
});

test('höchstens drei Würfe, gehaltene Würfel bleiben liegen', () => {
  const { game, p } = setup();
  assert.ok(game.action(p(2), { type: 'roll' }).error, 'nur wer dran ist');
  assert.ok(game.action(p(1), { type: 'hold', index: 0 }).error, 'halten erst nach dem ersten Wurf');
  assert.deepStrictEqual(game.action(p(1), { type: 'roll' }), { ok: true });
  game.dice = [6, 6, 6, 1, 2];
  for (const i of [0, 1, 2]) game.action(p(1), { type: 'hold', index: i });
  game.action(p(1), { type: 'roll' });
  assert.deepStrictEqual(game.dice.slice(0, 3), [6, 6, 6]);
  game.action(p(1), { type: 'roll' });
  assert.deepStrictEqual(game.dice.slice(0, 3), [6, 6, 6]);
  assert.ok(game.action(p(1), { type: 'roll' }).error);
});

test('eintragen, Feld nur einmal, dann ist der Nächste dran', () => {
  const { game, p } = setup();
  assert.ok(game.action(p(1), { type: 'score', category: 'chance' }).error, 'erst würfeln');
  game.action(p(1), { type: 'roll' });
  game.dice = [2, 2, 3, 3, 3];
  assert.deepStrictEqual(game.action(p(1), { type: 'score', category: 'fullHouse' }), { ok: true });
  assert.strictEqual(game.sheets.get('p1').fullHouse, 25);
  assert.strictEqual(game.activeId, 'p2');
  game.action(p(2), { type: 'roll' });
  game.action(p(2), { type: 'score', category: 'kniffel' });
  assert.strictEqual(game.sheets.get('p2').kniffel, 0);
  game.action(p(1), { type: 'roll' });
  assert.ok(game.action(p(1), { type: 'score', category: 'fullHouse' }).error);
});

test('Partie endet, wenn alle Blöcke voll sind', () => {
  const { game, p } = setup(2, { games: 2 });
  for (let turn = 0; turn < 26; turn++) {
    const id = game.activeId;
    game.action(p(Number(id.slice(1))), { type: 'roll' });
    const free = Wuerfelbecher.CATEGORIES.find((c) => game.sheets.get(id)[c] === null);
    game.action(p(Number(id.slice(1))), { type: 'score', category: free });
  }
  assert.strictEqual(game.phase, 'result');
  game.next();
  assert.strictEqual(game.phase, 'turn');
  assert.strictEqual(game.activeId, 'p2', 'zweite Partie beginnt der Nächste');
});

test('Mitspieler am selben Gerät würfelt über das Gerät seines Gastgebers', () => {
  const { lobby, game, p } = setup(1);
  lobby.players.set('g1', { id: 'g1', connected: true, guestOf: 'p1' });
  game.playersChanged();
  game.action(p(1), { type: 'roll' });
  game.action(p(1), { type: 'score', category: 'chance' });
  assert.strictEqual(game.activeId, 'g1');
  assert.deepStrictEqual(game.action(p(1), { type: 'roll' }), { ok: true });
});

test('Host spielt automatisch das beste Feld, abwesende Spieler werden übersprungen', () => {
  const { game, p } = setup(3);
  game.action(p(1), { type: 'force' });
  assert.strictEqual(Object.values(game.sheets.get('p1')).filter((v) => v !== null).length, 1);
  assert.strictEqual(game.activeId, 'p2');
  p(3).connected = false;
  game.action(p(2), { type: 'roll' });
  game.action(p(2), { type: 'score', category: 'chance' });
  assert.strictEqual(game.activeId, 'p1');
  assert.ok(game.action(p(2), { type: 'force' }).error, 'nur der Host');
});

function playOut(game, lobby, pick = () => null) {
  while (game.phase === 'turn') {
    const id = game.activeId;
    const owner = lobby.players.get(id).guestOf || id;
    game.action(lobby.players.get(owner), { type: 'roll' });
    const free = Wuerfelbecher.CATEGORIES.filter((c) => game.sheets.get(id)[c] === null);
    game.action(lobby.players.get(owner), { type: 'score', category: pick(id, free) || free[0] });
  }
}

test('Bestenliste: höchstens zehn, beste zuerst, bei Gleichstand der frühere', () => {
  const board = createBoard('t2', { file: path.join(tmp, 't2.json'), github: false, limit: 3 });
  const e = (id, total, date) => ({ id, total, date });
  assert.deepStrictEqual(board.add([e('a', 100, '2026-01-02'), e('b', 200, '2026-01-01')]), ['a', 'b']);
  assert.deepStrictEqual(board.add([e('c', 100, '2026-01-01'), e('d', 50, '2026-01-03')]), ['c']);
  assert.deepStrictEqual(board.list().map((x) => x.id), ['b', 'c', 'a']);
  // Neu geladen aus der Datei
  const again = createBoard('t2', { file: path.join(tmp, 't2.json'), github: false, limit: 3 });
  assert.deepStrictEqual(again.list().map((x) => x.id), ['b', 'c', 'a']);
});

test('volle Blöcke landen nach der Partie in der Bestenliste, Host blendet sie ein', () => {
  const { lobby, game, p } = setup(2);
  playOut(game, lobby);
  assert.strictEqual(game.phase, 'final');
  assert.strictEqual(game.newHighscores.length, 2);
  assert.deepStrictEqual([...game.highscorePlayers].sort(), ['p1', 'p2']);
  const saved = JSON.parse(fs.readFileSync(boardFile, 'utf8')).highscores;
  assert.ok(saved.every((e) => e.sheet && typeof e.total === 'number' && e.name));
  assert.ok(game.action(p(2), { type: 'highscores' }).error, 'nur der Host');
  assert.deepStrictEqual(game.action(p(1), { type: 'highscores' }), { ok: true });
  const view = game.view(p(2));
  assert.ok(view.showHighscores && view.highscores.length >= 2);
  game.action(p(1), { type: 'highscores' });
  assert.strictEqual(game.view(p(2)).highscores, undefined);
});
