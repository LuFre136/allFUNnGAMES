// Regeltests für Würfelfuchs: node --test

const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const Wuerfelfuchs = require('../server/games/wuerfelfuchs');
const { createBoard } = require('../server/highscores');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-'));
const boardFile = path.join(tmp, 'highscores.json');
Wuerfelfuchs.useHighscores(createBoard('test', { file: boardFile, github: false }));

const { emptySheet, enter, sheetScore } = Wuerfelfuchs;
const W = 0; const Y = 1; const B = 2; const G = 3; const O = 4; const P = 5;

function fakeLobby(n, game = {}) {
  const players = new Map();
  for (let i = 1; i <= n; i++) players.set(`p${i}`, { id: `p${i}`, connected: true, isHost: i === 1 });
  return {
    hostId: 'p1',
    players,
    settings: { game: { ...Wuerfelfuchs.defaultSettings(), starter: 'host', ...game } },
    activePlayers: () => [...players.values()].filter((p) => p.connected),
    broadcast() {},
  };
}

function setup(n = 2, game = {}) {
  const lobby = fakeLobby(n, game);
  const g = new Wuerfelfuchs(lobby);
  g.start();
  g.order = [...lobby.players.keys()];
  g.turn = 0;
  g.firstTurn = 0;
  g.startTurn();
  return { lobby, game: g, p: (i) => lobby.players.get(`p${i}`) };
}

function setDice(game, values) {
  values.forEach((v, i) => { game.dice[i].value = v; });
}

test('meta setzt Spielerzahl 1–6', () => {
  const m = Wuerfelfuchs.meta();
  assert.strictEqual(m.minPlayers, 1);
  assert.strictEqual(m.maxPlayers, 6);
  assert.strictEqual(m.teams, false);
});

test('Wertung der fünf Farben und Füchse', () => {
  const s = emptySheet();
  // Gelb: erste Spalte (3, 2, 1) voll = 10 Punkte
  for (const cell of [0, 4, 8]) enter(s, 'yellow', cell);
  // Blau: 2, 3, 4 = 3 Kreuze = 4 Punkte, Reihe voll -> 5 in Orange
  for (const cell of [1, 2, 3]) enter(s, 'blue', cell);
  enter(s, 'green', 0); enter(s, 'green', 1);
  enter(s, 'purple', 0, 2); enter(s, 'purple', 1, 5);
  const score = sheetScore(s);
  assert.strictEqual(score.yellow, 10);
  assert.strictEqual(score.blue, 4);
  assert.strictEqual(score.green, 3);
  assert.deepStrictEqual(s.orange, [5], 'Blau-Reihe gibt eine 5 in Orange');
  assert.strictEqual(score.orange, 5);
  assert.strictEqual(score.purple, 7);
  s.foxes = 2;
  assert.strictEqual(sheetScore(s).fox, 6, 'jeder Fuchs zählt das schwächste Feld');
});

test('Orange zählt doppelt und dreifach', () => {
  const s = emptySheet();
  for (let i = 0; i < 11; i++) s.orange.push(6);
  assert.strictEqual(sheetScore(s).orange, 6 * 16);
});

test('Regeln je Farbe: Grün Mindestwert, Lila größer, Blau Summe mit Weiß', () => {
  const lobby = fakeLobby(1);
  const g = new Wuerfelfuchs(lobby);
  g.start();
  const s = g.sheet('p1');
  const dice = g.dice;
  [3, 4, 5, 2, 6, 1].forEach((v, i) => { dice[i].value = v; });
  assert.deepStrictEqual(Wuerfelfuchs.dieTargets(s, dice, B), [{ color: 'blue', cell: 7 }], 'Blau 5 + Weiß 3 = 8');
  assert.deepStrictEqual(Wuerfelfuchs.dieTargets(s, dice, G), [{ color: 'green', cell: 0 }]);
  s.green = 4; // nächstes Kästchen braucht mindestens 5
  assert.deepStrictEqual(Wuerfelfuchs.dieTargets(s, dice, G), []);
  s.purple = [5];
  assert.deepStrictEqual(Wuerfelfuchs.dieTargets(s, dice, P), [], 'Lila 1 ist nicht größer als 5');
  s.purple = [6];
  assert.deepStrictEqual(Wuerfelfuchs.dieTargets(s, dice, P), [{ color: 'purple', cell: 1 }], 'nach einer 6 geht alles');
  // Weiß passt als Joker in jede Farbe
  const colors = new Set(Wuerfelfuchs.dieTargets(s, dice, W).map((t) => t.color));
  assert.deepStrictEqual([...colors].sort(), ['blue', 'orange', 'purple', 'yellow']);
});

test('Kettenreaktion: Bonus löst weiteren Bonus aus', () => {
  const s = emptySheet();
  // Gelbe Zeile 2 (1, 2, 4) voll -> Kreuz in Grün; Grün hat schon 3 Kreuze -> 4. Kästchen bringt +1
  s.green = 3;
  for (const cell of [8, 10, 11]) enter(s, 'yellow', cell);
  assert.strictEqual(s.green, 4);
  assert.strictEqual(s.plusOnes, 1);
});

test('Bonus mit Auswahl wartet auf den Spieler', () => {
  const s = emptySheet();
  // Gelbe Zeile 1 (3, 6, 5) voll -> Kreuz in Blau, frei wählbar
  for (const cell of [0, 1, 2]) enter(s, 'yellow', cell);
  assert.deepStrictEqual(s.pending, [{ type: 'cross', color: 'blue' }]);
  assert.strictEqual(Wuerfelfuchs.bonusTargets(s).length, 11);
  assert.ok(!Wuerfelfuchs.resolveBonus(s, 'yellow', 3));
  assert.ok(Wuerfelfuchs.resolveBonus(s, 'blue', 11));
  assert.strictEqual(s.blue[2][3], true);
  assert.deepStrictEqual(s.pending, []);
});

test('Zug: kleinere Würfel landen auf dem Tablett, nach drei Würfen ist das Tablett dran', () => {
  const { game, p } = setup(2);
  assert.ok(game.action(p(2), { type: 'roll' }).error, 'nur wer dran ist');
  assert.deepStrictEqual(game.action(p(1), { type: 'roll' }), { ok: true });
  setDice(game, [1, 4, 2, 3, 2, 6]);
  // Gelb 4 nehmen (Feld 11): Weiß 1, Blau 2, Grün 3, Orange 2 sind kleiner -> Tablett, Lila 6 bleibt
  assert.ok(game.action(p(1), { type: 'pick', die: Y, color: 'yellow', cell: 0 }).error, 'falsches Feld');
  assert.deepStrictEqual(game.action(p(1), { type: 'pick', die: Y, color: 'yellow', cell: 11 }), { ok: true });
  assert.deepStrictEqual(game.dice.map((d) => d.where), ['tray', 'chosen', 'tray', 'tray', 'tray', 'free']);
  game.action(p(1), { type: 'roll' });
  game.dice[P].value = 3;
  game.action(p(1), { type: 'pick', die: P, color: 'purple', cell: 0 });
  assert.strictEqual(game.phase, 'passive', 'keine Würfel mehr übrig');
  assert.deepStrictEqual(game.sheet('p1').purple, [3]);
  // Passiv: p2 nimmt einen Würfel vom Tablett, aber keinen gewählten
  assert.ok(game.action(p(2), { type: 'take', die: Y, color: 'yellow', cell: 11 }).error);
  assert.ok(game.action(p(1), { type: 'take', die: G, color: 'green', cell: 0 }).error, 'der Aktive nimmt nicht vom Tablett');
  assert.deepStrictEqual(game.action(p(2), { type: 'take', die: G, color: 'green', cell: 0 }), { ok: true });
  assert.ok(game.action(p(2), { type: 'take', die: O, color: 'orange', cell: 0 }).error, 'nur ein Würfel');
  game.action(p(2), { type: 'undo' });
  assert.strictEqual(game.sheet('p2').green, 0);
  game.action(p(2), { type: 'take', die: O, color: 'orange', cell: 0 });
  game.action(p(2), { type: 'done' });
  game.action(p(1), { type: 'done' });
  assert.strictEqual(game.phase, 'active');
  assert.strictEqual(game.activeId, 'p2');
  assert.deepStrictEqual(game.sheet('p2').orange, [2]);
});

test('Neuwurf und +1', () => {
  const { game, p } = setup(2);
  const s = game.sheet('p1');
  assert.strictEqual(s.rerolls, 1, 'Runde 1 bringt einen Neuwurf');
  assert.ok(game.action(p(1), { type: 'reroll' }).error, 'erst würfeln');
  game.action(p(1), { type: 'roll' });
  assert.deepStrictEqual(game.action(p(1), { type: 'reroll' }), { ok: true });
  assert.strictEqual(s.rerolls, 0);
  setDice(game, [1, 1, 1, 1, 6, 1]);
  game.action(p(1), { type: 'pick', die: O, color: 'orange', cell: 0 });
  assert.strictEqual(game.phase, 'passive');
  s.plusOnes = 1;
  assert.deepStrictEqual(game.action(p(1), { type: 'plusOne', die: O, color: 'orange', cell: 1 }), { ok: true }, '+1 darf auch einen gewählten Würfel nehmen');
  assert.strictEqual(s.plusOnes, 0);
  assert.ok(game.action(p(1), { type: 'plusOne', die: G, color: 'green', cell: 0 }).error);
});

test('Runden und Spielende, Bestenliste', () => {
  const { game, p, lobby } = setup(2);
  assert.strictEqual(game.maxRounds, 6);
  let guard = 0;
  while (game.phase !== 'final' && guard++ < 200) {
    if (game.phase === 'active') game.action(p(1), { type: 'force' });
    else game.action(p(1), { type: 'force' });
  }
  assert.strictEqual(game.phase, 'final');
  assert.strictEqual(game.round, 7);
  assert.strictEqual(game.newHighscores.length, 2);
  const saved = JSON.parse(fs.readFileSync(boardFile, 'utf8')).highscores;
  assert.ok(saved.every((e) => typeof e.total === 'number' && e.name !== undefined));
  assert.ok(game.action(p(2), { type: 'highscores' }).error, 'nur der Host');
  game.action(p(1), { type: 'highscores' });
  assert.ok(game.view(p(2)).highscores.length >= 2);
  assert.ok(lobby);
});

test('Solo: das Spiel würfelt das Tablett für den gedachten Mitspieler', () => {
  const { game, p } = setup(1);
  game.action(p(1), { type: 'roll' });
  setDice(game, [1, 1, 1, 1, 1, 6]);
  game.action(p(1), { type: 'pick', die: P, color: 'purple', cell: 0 });
  assert.strictEqual(game.phase, 'passive');
  assert.strictEqual(game.dice.filter((d) => d.where === 'tray').length, 3);
  assert.ok(game.view(p(1)).me.canTake);
  game.action(p(1), { type: 'done' });
  assert.strictEqual(game.round, 2);
  assert.strictEqual(game.activeId, 'p1');
});

test('getrennte Spieler halten die passive Phase nicht auf', () => {
  const { game, p } = setup(3);
  game.action(p(1), { type: 'force' });
  assert.strictEqual(game.phase, 'passive');
  p(3).connected = false;
  game.action(p(1), { type: 'done' });
  game.action(p(2), { type: 'done' });
  assert.strictEqual(game.activeId, 'p2');
});
