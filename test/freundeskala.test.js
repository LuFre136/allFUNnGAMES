// Regeltests für die Freundeskala: node --test

const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');

// Ausgeschlossene Fragen landen in einer Wegwerfdatei statt in data/
process.env.EXCLUSIONS_FILE = path.join(os.tmpdir(), `fk-test-${process.pid}.json`);
const Freundeskala = require('../server/games/freundeskala');

function fakeLobby(n, game = {}) {
  const players = new Map();
  for (let i = 1; i <= n; i++) players.set(`p${i}`, { id: `p${i}`, connected: true, isHost: i === 1 });
  return {
    players,
    settings: { hostPlays: true, game: { ...Freundeskala.defaultSettings(), ...game } },
    activePlayers: () => [...players.values()].filter((p) => p.connected),
    broadcast() {},
  };
}

function setup(n = 3, game = {}) {
  const lobby = fakeLobby(n, game);
  const g = new Freundeskala(lobby);
  g.start();
  return { lobby, game: g, p: (i) => lobby.players.get(`p${i}`) };
}

// Alle antworten, dann legt jeder in der ausgelosten Reihenfolge an den Platz, den pick(line, id) sagt
function playRound(game, lobby, values, pick) {
  values.forEach((v, i) => game.answer(lobby.players.get(`p${i + 1}`), v));
  while (game.phase === 'place') game.place(lobby.players.get(game.turn), pick(game.line, game.turn));
}

// Legt so, dass die Reihe nach Zahl sortiert bleibt
const sortedSpot = (game) => (line, id) => {
  const v = game.answers.get(id);
  const i = line.findIndex((other) => game.answers.get(other) > v);
  return i === -1 ? line.length : i;
};

test('braucht 3 bis 12 Spieler', () => {
  assert.throws(() => new Freundeskala(fakeLobby(2)).start(), /mindestens 3/);
  assert.throws(() => new Freundeskala(fakeLobby(13)).start(), /höchstens 12/);
  const full = new Freundeskala(fakeLobby(12));
  assert.doesNotThrow(() => full.start());
  full.dispose();
});

test('jede Frage hat Art, Kategorie und bei Anzahlen eine Obergrenze; IDs sind eindeutig', () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../server/games/freundeskala/questions.json'), 'utf8'));
  assert.ok(data.questions.length >= 200);
  assert.strictEqual(new Set(data.questions.map((q) => q.id)).size, data.questions.length);
  for (const q of data.questions) {
    assert.ok(data.categories.includes(q.category), q.id);
    assert.ok(['count', 'scale'].includes(q.kind), q.id);
    if (q.kind === 'count') assert.ok(Number.isInteger(q.max) && q.max > 0, q.id);
    assert.strictEqual(Boolean(q.low), Boolean(q.high), q.id);
  }
});

test('Fragearten lassen sich einschränken', () => {
  const { game } = setup(3, { kinds: 'scale', questionCount: 20 });
  assert.ok(game.questions.every((q) => q.kind === 'scale'));
  assert.strictEqual(game.questions.length, 20);
  game.dispose();
});

test('Zahlen werden geprüft', () => {
  const { game, p } = setup();
  game.questions[0] = { id: 'x', category: 'Alltag', question: '?', kind: 'count', max: 50 };
  assert.ok(game.answer(p(1), '').error);
  assert.ok(game.answer(p(1), 'abc').error);
  assert.ok(game.answer(p(1), -1).error);
  assert.ok(game.answer(p(1), 2.5).error);
  assert.ok(game.answer(p(1), 51).error);
  assert.ok(game.answer(p(1), 50).ok);
  assert.ok(game.answer(p(1), 0).ok, 'ändern geht');
  assert.strictEqual(game.answers.get('p1'), 0);
  game.dispose();
});

test('fremde Zahlen sind bis zur Auflösung geheim', () => {
  const { game, lobby, p } = setup(3);
  [5, 10, 15].forEach((v, i) => game.answer(p(i + 1), v));
  assert.strictEqual(game.phase, 'place');
  const v = game.view(p(2));
  assert.strictEqual(v.myAnswer, 10);
  assert.ok(v.line.every((e) => e.value === undefined));
  assert.strictEqual(JSON.stringify(v).includes('15'), false);
  playRound(game, lobby, [], sortedSpot(game));
  assert.strictEqual(game.phase, 'reveal');
  const r = game.view(p(2));
  assert.strictEqual(r.line[0].value, 5);
  assert.strictEqual(r.line[1].value, undefined, 'Zahlen kommen Schritt für Schritt');
  game.dispose();
});

test('der Erste liegt sofort, danach wird der Reihe nach gelegt', () => {
  const { game, p, lobby } = setup(4);
  [1, 2, 3, 4].forEach((v, i) => game.answer(p(i + 1), v));
  assert.strictEqual(game.line.length, 1);
  assert.strictEqual(game.turnOrder.length, 3);
  const turn = game.turn;
  const other = [...lobby.players.values()].find((pl) => pl.id !== turn && !game.line.includes(pl.id));
  assert.ok(game.place(other, 0).error, 'wer nicht dran ist, darf nicht legen');
  assert.ok(game.place(lobby.players.get(turn), 5).error, 'Platz außerhalb der Reihe');
  assert.ok(game.place(lobby.players.get(turn), 1).ok);
  assert.deepStrictEqual(game.line.slice(-1), [turn]);
  game.dispose();
});

test('richtig sortiert gibt volle Punkte, Gleichstände sind austauschbar', () => {
  const { game, lobby } = setup(4);
  playRound(game, lobby, [3, 7, 3, 10], sortedSpot(game));
  assert.ok(game.result.every((r) => r.correct));
  game.next(); // alles aufdecken
  game.next(); // Punkte
  assert.strictEqual(game.phase, 'scores');
  assert.strictEqual(game.score(), 4);
  assert.strictEqual(game.maxScore(), 4);
});

test('Punkte wie im Brettspiel: nur Bilder genau am richtigen Platz zählen', () => {
  const { game, lobby } = setup(4);
  // Wer dran ist, legt sich ganz nach vorn: Die Reihe steht am Ende genau falsch herum
  playRound(game, lobby, [1, 2, 3, 4], () => 0);
  const line = game.result.map((r) => r.value);
  const sorted = [...line].sort((a, b) => a - b);
  const expected = line.filter((v, i) => v === sorted[i]).length;
  assert.strictEqual(game.result.filter((r) => r.correct).length, expected);
  // Konkreter Fall: 2, 1, 3, 4 hat zwei Treffer
  game.line = ['p2', 'p1', 'p3', 'p4'];
  game.toReveal();
  assert.deepStrictEqual(game.result.map((r) => r.correct), [false, false, true, true]);
  game.dispose();
});

test('wer beim Legen dran ist und geht, rückt ans Ende; der Host kann überspringen', () => {
  const { game, lobby, p } = setup(4);
  [1, 2, 3, 4].forEach((v, i) => game.answer(p(i + 1), v));
  const first = game.turn;
  lobby.players.get(first).connected = false;
  game.playersChanged();
  assert.notStrictEqual(game.turn, first);
  assert.strictEqual(game.turnOrder[game.turnOrder.length - 1], first);
  const second = game.turn;
  assert.ok(game.action(lobby.players.get(second === 'p2' ? 'p3' : 'p2'), { type: 'skip' }).error, 'nur der Host');
  game.action(p(1), { type: 'skip' });
  assert.strictEqual(game.answers.has(second), false);
  assert.notStrictEqual(game.turn, second);
  game.dispose();
});

test('sind nur noch Getrennte übrig, fallen sie raus und die Auflösung beginnt', () => {
  const { game, lobby, p } = setup(3);
  [1, 2, 3].forEach((v, i) => game.answer(p(i + 1), v));
  for (const id of game.turnOrder) lobby.players.get(id).connected = false;
  game.playersChanged();
  assert.strictEqual(game.phase, 'reveal');
  assert.strictEqual(game.result.length, 1);
  game.dispose();
});

test('mit weniger als zwei Antworten wird die Frage übersprungen', () => {
  const { game, p } = setup(3);
  game.answer(p(1), 5);
  game.next();
  assert.strictEqual(game.phase, 'scores');
  assert.match(game.notice, /übersprungen/);
  assert.strictEqual(game.view(p(1)).last, null);
  game.next();
  assert.strictEqual(game.phase, 'answer');
  assert.strictEqual(game.index, 1);
  game.dispose();
});

test('Frage ausschließen braucht alle Stimmen und ersetzt die Frage', () => {
  const { game, p } = setup(3);
  const old = game.question.id;
  game.voteExclude(p(1), true);
  game.voteExclude(p(2), true);
  assert.strictEqual(game.question.id, old);
  game.voteExclude(p(3), true);
  assert.notStrictEqual(game.question.id, old);
  assert.match(game.notice, /ausgeschlossen/);
  assert.ok(!game.questions.some((q) => q.id === old));
  game.dispose();
});

test('Ende mit Bewertung und Sonderpreisen', () => {
  const { game, lobby, p } = setup(3, { questionCount: 3 });
  for (let r = 0; r < 3; r++) {
    playRound(game, lobby, [10, 20, 30], sortedSpot(game));
    game.next();
    game.next();
    game.next();
  }
  assert.strictEqual(game.phase, 'final');
  const v = game.view(p(1));
  assert.strictEqual(v.score, 9);
  assert.match(v.verdict, /Perfekt/);
  assert.strictEqual(v.awards.reader.count, 3);
  assert.strictEqual(v.awards.surprise, null);
  assert.deepStrictEqual(v.awards.extremist.ids.sort(), ['p1', 'p3']);
});
