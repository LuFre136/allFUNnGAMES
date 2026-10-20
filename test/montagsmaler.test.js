// Regeltests für Montagsmaler: node --test

const test = require('node:test');
const assert = require('node:assert');
const Montagsmaler = require('../server/games/montagsmaler');

// p1 ist der Host; im Team-Modus sind p1–p3 in Rot und p4–p6 in Blau
function fakeLobby(game = {}, count = 3) {
  const players = new Map();
  const teams = [{ id: 't1', name: 'Rot' }, { id: 't2', name: 'Blau' }];
  for (let i = 1; i <= count; i++) {
    players.set(`p${i}`, { id: `p${i}`, connected: true, isHost: i === 1, teamId: i <= count / 2 ? 't1' : 't2' });
  }
  const sent = [];
  return {
    players,
    teams,
    sent,
    settings: { hostPlays: true, game: { ...Montagsmaler.defaultSettings(), ...game } },
    activePlayers: () => [...players.values()].filter((p) => p.connected),
    teamById: (id) => teams.find((t) => t.id === id) || null,
    send: (p, event, payload) => sent.push({ to: p.id, event, payload }),
    broadcast() {},
  };
}

function setup(game, count) {
  const lobby = fakeLobby(game, count);
  const g = new Montagsmaler(lobby);
  g.start();
  return { lobby, game: g, p: (id) => lobby.players.get(id) };
}

function startDrawing(game, lobby) {
  const drawer = lobby.players.get(game.turn.drawerId);
  game.action(drawer, { type: 'choose', index: 0 });
  return drawer;
}

function others(game, lobby) {
  return [...lobby.players.values()].filter((p) => p.id !== game.turn.drawerId);
}

test('Nur der Zeichner kennt den Begriff, die anderen sehen Lücken', (t) => {
  const { game, lobby } = setup();
  t.after(() => game.dispose());
  const drawer = startDrawing(game, lobby);
  const word = game.turn.entry.word;
  assert.strictEqual(game.view(drawer).word, word);
  for (const p of others(game, lobby)) {
    const v = game.view(p);
    assert.strictEqual(v.word, null);
    assert.strictEqual(v.mask.length, [...word].length);
  }
});

test('Richtig raten: Punkte für Ratende und Zeichner, Runde endet, wenn alle es haben', (t) => {
  const { game, lobby } = setup();
  t.after(() => game.dispose());
  const drawer = startDrawing(game, lobby);
  const word = game.turn.entry.word;
  const [a, b] = others(game, lobby);
  assert.strictEqual(game.action(a, { type: 'guess', text: 'Quatsch' }).result, 'wrong');
  assert.ok(game.action(a, { type: 'guess', text: word }).error, 'zu schnell hintereinander');
  game.lastGuess.clear();
  assert.strictEqual(game.action(a, { type: 'guess', text: word.toLowerCase() }).result, 'correct');
  assert.ok(game.totals[a.id] >= 10);
  assert.strictEqual(game.totals[drawer.id], 3);
  assert.strictEqual(game.phase, 'draw');
  // Richtige Tipps verrät die Liste den anderen nicht
  assert.ok(game.view(b).guesses.every((g) => g.kind !== 'correct' || g.text === null));
  game.action(b, { type: 'guess', text: word });
  assert.strictEqual(game.phase, 'reveal');
  assert.strictEqual(game.totals[drawer.id], 6);
});

test('Tipp-Prüfung: Formen, Tippfehler, längere Tipps und knapp daneben', () => {
  const g = Object.create(Montagsmaler.prototype);
  const check = (word, also, text) => {
    g.turn = { entry: { word, also } };
    return g.check(text);
  };
  assert.strictEqual(check('Katze', [], 'Katzen'), 'correct');
  assert.strictEqual(check('Haus', [], 'Häuser'), 'correct');
  assert.strictEqual(check('Leuchtturm', [], 'großer Leuchtturm'), 'correct');
  assert.strictEqual(check('Leuchtturm', [], 'Leuchturm'), 'correct');
  assert.strictEqual(check('Fahrrad', ['Rad'], 'Rad'), 'correct');
  assert.strictEqual(check('Eis', [], 'Reise'), 'wrong');
  assert.strictEqual(check('Haus', [], 'Maus'), 'close');
});

test('Striche gehen nur an die anderen und nur vom Zeichner', (t) => {
  const { game, lobby } = setup();
  t.after(() => game.dispose());
  const drawer = startDrawing(game, lobby);
  const [a] = others(game, lobby);
  const turn = game.turn.id;
  assert.ok(game.draw(a, { op: 'add', turn, id: 's1', color: '#111111', size: 16, pts: [1, 2] }).error);
  assert.ok(game.draw(drawer, { op: 'add', turn, id: 's1', color: '#111111', size: 16, pts: [1, 2, 3, 4] }).ok);
  assert.ok(game.draw(drawer, { op: 'add', turn, id: 's1', pts: [5, 6] }).ok);
  assert.ok(game.draw(drawer, { op: 'fill', turn, id: 's2', color: '#e53935', x: 600, y: 450 }).ok);
  assert.ok(game.draw(drawer, { op: 'add', turn, id: 's3', color: 'red', size: 16, pts: [1, 2] }).error);
  assert.deepStrictEqual(game.turn.strokes[0].pts, [1, 2, 3, 4, 5, 6]);
  assert.ok(lobby.sent.every((m) => m.to !== drawer.id && m.event === 'draw'));
  game.draw(drawer, { op: 'undo', turn });
  assert.strictEqual(game.draw(a, { op: 'strokes' }).strokes.length, 1);
});

test('Geht der Zeichner, ist der Nächste dran', (t) => {
  const { game, lobby } = setup();
  t.after(() => game.dispose());
  const drawer = startDrawing(game, lobby);
  lobby.players.delete(drawer.id);
  game.playersChanged();
  assert.strictEqual(game.phase, 'reveal');
  game.nextTurn();
  assert.strictEqual(game.phase, 'choose');
  assert.notStrictEqual(game.turn.drawerId, drawer.id);
});

test('Team-Modus: nur das eigene Team rät, danach dürfen die anderen klauen', (t) => {
  const { game, lobby } = setup({ teamMode: true }, 6);
  t.after(() => game.dispose());
  const drawer = startDrawing(game, lobby);
  const word = game.turn.entry.word;
  const enemy = others(game, lobby).find((p) => p.teamId !== drawer.teamId);
  assert.ok(game.action(enemy, { type: 'guess', text: word }).error);
  game.timeUp();
  assert.strictEqual(game.phase, 'steal');
  assert.strictEqual(game.action(enemy, { type: 'guess', text: word }).result, 'correct');
  assert.strictEqual(game.phase, 'reveal');
  assert.strictEqual(game.totals[enemy.teamId], 5);
});

test('Alle Durchgänge gespielt: Endwertung mit Galerie', (t) => {
  const { game, lobby } = setup({ rounds: 1 });
  t.after(() => game.dispose());
  for (let i = 0; i < 3; i++) {
    const drawer = startDrawing(game, lobby);
    game.draw(drawer, { op: 'add', turn: game.turn.id, id: 'x', color: '#111111', size: 6, pts: [10, 10] });
    game.endTurn('skipped');
    game.nextTurn();
  }
  assert.strictEqual(game.phase, 'final');
  assert.strictEqual(game.draw(lobby.players.get('p1'), { op: 'gallery' }).gallery.length, 3);
});
