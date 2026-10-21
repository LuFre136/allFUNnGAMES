// Regeltests für Eins bis Zehn: node --test

const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');

// Ausgeschlossene Themen landen in einer Wegwerfdatei statt in data/
process.env.EXCLUSIONS_FILE = path.join(os.tmpdir(), `ez-test-${process.pid}.json`);
const EinsBisZehn = require('../server/games/einsbiszehn');

function fakeLobby(n, game = {}) {
  const players = new Map();
  for (let i = 1; i <= n; i++) players.set(`p${i}`, { id: `p${i}`, name: `Spieler ${i}`, connected: true, isHost: i === 1 });
  return {
    players,
    settings: { hostPlays: true, game: { ...EinsBisZehn.defaultSettings(), answerTime: 0, ...game } },
    activePlayers: () => [...players.values()].filter((p) => p.connected),
    broadcast() {},
  };
}

function setup(n = 4, game = {}) {
  const lobby = fakeLobby(n, game);
  const g = new EinsBisZehn(lobby);
  g.start();
  return { lobby, game: g, p: (id) => lobby.players.get(typeof id === 'number' ? `p${id}` : id) };
}

// Thema wählen, alle mit Zahl antworten lassen
function toOrder(game, lobby) {
  game.choose(0);
  for (const id of game.numbers.keys()) game.answer(lobby.players.get(id), `Antwort ${id}`);
}

// IDs der Antworten nach Zahl sortiert
function ascending(game) {
  return [...game.remaining].sort((a, b) => game.numbers.get(a) - game.numbers.get(b));
}

test('braucht 3 bis 11 Spieler', () => {
  assert.throws(() => new EinsBisZehn(fakeLobby(2)).start(), /mindestens 3/);
  assert.throws(() => new EinsBisZehn(fakeLobby(12)).start(), /höchstens 11/);
  const full = new EinsBisZehn(fakeLobby(11));
  assert.doesNotThrow(() => full.start());
  assert.strictEqual(full.numbers.size, 10);
  full.dispose();
});

test('jedes Thema hat Kategorie, Text und beide Enden; IDs sind eindeutig', () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../server/games/einsbiszehn/themes.json'), 'utf8'));
  assert.ok(data.themes.length >= 140);
  assert.strictEqual(new Set(data.themes.map((t) => t.id)).size, data.themes.length);
  for (const t of data.themes) {
    assert.ok(data.categories.includes(t.category), t.id);
    assert.ok(t.text && t.low && t.high, t.id);
  }
});

test('der Kapitän bekommt keine Zahl, alle anderen verschiedene von 1 bis 10', () => {
  const { game } = setup(6);
  assert.strictEqual(game.phase, 'choose');
  assert.strictEqual(game.numbers.has(game.captain), false);
  const values = [...game.numbers.values()];
  assert.strictEqual(values.length, 5);
  assert.strictEqual(new Set(values).size, 5);
  assert.ok(values.every((v) => v >= 1 && v <= 10));
  game.dispose();
});

test('nur der Kapitän oder der Host wählt das Thema', () => {
  const { game, lobby } = setup(4);
  const other = [...lobby.players.values()].find((p) => p.id !== game.captain && !p.isHost);
  assert.ok(game.action(other, { type: 'choose', index: 0 }).error);
  assert.ok(game.action(lobby.players.get(game.captain), { type: 'choose', index: 1 }).ok);
  assert.strictEqual(game.phase, 'answer');
  assert.strictEqual(game.theme.id, game.options[1].id);
  game.dispose();
});

test('Antworten werden geprüft, der Kapitän antwortet nicht', () => {
  const { game, lobby } = setup(4);
  game.choose(0);
  const someone = lobby.players.get([...game.numbers.keys()][0]);
  assert.ok(game.answer(lobby.players.get(game.captain), 'x').error);
  assert.ok(game.answer(someone, '   ').error);
  assert.ok(game.answer(someone, 'x'.repeat(81)).error);
  assert.ok(game.answer(someone, '  Ein   Boot ').ok);
  assert.strictEqual(game.answers.get(someone.id), 'Ein Boot');
  game.dispose();
});

test('fremde Zahlen bleiben geheim, bis sie aufgedeckt sind', () => {
  const { game, lobby } = setup(5);
  toOrder(game, lobby);
  assert.strictEqual(game.phase, 'order');
  const [a, b] = ascending(game);
  const viewer = lobby.players.get(a);
  const v = game.view(viewer);
  assert.strictEqual(v.myNumber, game.numbers.get(a));
  assert.ok(v.cards.every((c) => c.number === undefined));
  const cap = game.view(lobby.players.get(game.captain));
  assert.strictEqual(cap.myNumber, null);
  game.pick(lobby.players.get(game.captain), a);
  const after = game.view(lobby.players.get(b));
  assert.strictEqual(after.revealed[0].number, game.numbers.get(a));
  assert.ok(after.cards.every((c) => c.number === undefined));
  game.dispose();
});

test('richtig aufgedeckt ist eine perfekte Runde, die kein Herz kostet', () => {
  const { game, lobby } = setup(5, { hearts: 5 });
  toOrder(game, lobby);
  game.hearts = 4;
  const captain = lobby.players.get(game.captain);
  for (const id of ascending(game)) assert.ok(game.pick(captain, id).ok);
  assert.strictEqual(game.phase, 'scores');
  assert.ok(game.history[0].perfect);
  assert.strictEqual(game.hearts, 5, 'perfekte Runde bringt ein Herz zurück');
  game.dispose();
});

test('jede Zahl unter einer schon aufgedeckten kostet ein Herz', () => {
  const { game, lobby } = setup(5, { hearts: 8 });
  toOrder(game, lobby);
  const captain = lobby.players.get(game.captain);
  // Von groß nach klein: alle außer der ersten sind Fehler
  for (const id of ascending(game).reverse()) game.pick(captain, id);
  assert.strictEqual(game.history[0].mistakes, 3);
  assert.strictEqual(game.hearts, 5);
  assert.strictEqual(game.history[0].perfect, false);
  game.dispose();
});

test('nur Kapitän oder Host decken auf', () => {
  const { game, lobby } = setup(4);
  toOrder(game, lobby);
  const other = [...lobby.players.values()].find((p) => p.id !== game.captain && !p.isHost);
  const id = game.remaining[0];
  assert.ok(game.pick(other, id).error);
  assert.ok(game.pick(lobby.players.get('p1'), id).ok, 'der Host darf für den Kapitän');
  assert.ok(game.pick(lobby.players.get('p1'), id).error, 'schon aufgedeckt');
  game.dispose();
});

test('sind alle Herzen weg, ist das Spiel verloren', () => {
  const { game, lobby } = setup(5, { hearts: 3 });
  toOrder(game, lobby);
  game.hearts = 1;
  const captain = lobby.players.get(game.captain);
  const order = ascending(game).reverse();
  game.pick(captain, order[0]);
  game.pick(captain, order[1]);
  assert.strictEqual(game.hearts, 0);
  assert.strictEqual(game.lost, true);
  assert.strictEqual(game.phase, 'scores');
  assert.strictEqual(game.history[0].hidden.length, 2);
  game.next();
  assert.strictEqual(game.phase, 'final');
  assert.strictEqual(game.view(captain).won, false);
  game.dispose();
});

test('jeder ist einmal Kapitän, dann kommt die Wertung', () => {
  const { game, lobby } = setup(4);
  assert.strictEqual(game.totalRounds, 4);
  const captains = [];
  for (let r = 0; r < 4; r++) {
    captains.push(game.captain);
    toOrder(game, lobby);
    for (const id of ascending(game)) game.pick(lobby.players.get(game.captain), id);
    game.next();
  }
  assert.strictEqual(new Set(captains).size, 4);
  assert.strictEqual(game.phase, 'final');
  const v = game.view(lobby.players.get('p1'));
  assert.strictEqual(v.won, true);
  assert.strictEqual(v.perfectRounds, 4);
  assert.strictEqual(v.awards.captain.ids.length, 4);
  assert.strictEqual(v.awards.hardest, null);
});

test('mit weniger als zwei Antworten wird die Runde übersprungen', () => {
  const { game, lobby } = setup(4);
  game.choose(0);
  game.answer(lobby.players.get([...game.numbers.keys()][0]), 'Allein');
  game.next();
  assert.strictEqual(game.phase, 'scores');
  assert.match(game.notice, /übersprungen/);
  game.next();
  assert.strictEqual(game.phase, 'choose');
  assert.strictEqual(game.round, 1);
  game.dispose();
});

test('Kapitän weg bei der Themenwahl: es wird gelost', () => {
  const { game, lobby } = setup(4);
  lobby.players.get(game.captain).connected = false;
  game.playersChanged();
  assert.strictEqual(game.phase, 'answer');
  assert.ok(game.theme);
  game.dispose();
});

test('Thema ausschließen braucht alle Stimmen, dann wählt derselbe Kapitän neu', () => {
  const { game, lobby } = setup(3);
  const captain = game.captain;
  game.choose(0);
  const old = game.theme.id;
  for (const p of [...lobby.players.values()].slice(0, 2)) game.voteExclude(p, true);
  assert.strictEqual(game.phase, 'answer');
  game.voteExclude(lobby.players.get('p3'), true);
  assert.strictEqual(game.phase, 'choose');
  assert.strictEqual(game.captain, captain);
  assert.ok(game.options.every((t) => t.id !== old));
  assert.match(game.notice, /ausgeschlossen/);
  game.dispose();
});

test('schwerste Antwort ist der größte Fehler', () => {
  const { game, lobby } = setup(5, { rounds: 3 });
  toOrder(game, lobby);
  const [a, b, c, d] = ascending(game);
  const cap = lobby.players.get(game.captain);
  [d, a, b, c].forEach((id) => game.pick(cap, id));
  const awards = game.awards();
  assert.strictEqual(awards.hardest.id, a);
  assert.strictEqual(awards.hardest.gap, game.numbers.get(d) - game.numbers.get(a));
  game.dispose();
});
