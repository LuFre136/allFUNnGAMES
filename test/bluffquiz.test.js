// Regeltests für das Bluff-Quiz: node --test

const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');

// Ausgeschlossene Fragen landen in einer Wegwerfdatei statt in data/
process.env.EXCLUSIONS_FILE = path.join(os.tmpdir(), `bq-test-${process.pid}.json`);
const BluffQuiz = require('../server/games/bluffquiz');

// Einzeln: p1 (Host) bis pN; im Team-Modus p1, p2 in t1, p3, p4 in t2, p5 in t3
function fakeLobby(n, game = {}) {
  const players = new Map();
  const teams = [{ id: 't1' }, { id: 't2' }, { id: 't3' }];
  for (let i = 1; i <= n; i++) {
    players.set(`p${i}`, { id: `p${i}`, connected: true, isHost: i === 1, teamId: teams[Math.floor((i - 1) / 2)]?.id || null });
  }
  return {
    players,
    settings: { hostPlays: true, game: { ...BluffQuiz.defaultSettings(), ...game } },
    teamById: (id) => teams.find((t) => t.id === id) || null,
    activePlayers: () => [...players.values()].filter((p) => p.connected),
    broadcast() {},
  };
}

function setup(n = 3, game = {}) {
  const lobby = fakeLobby(n, game);
  const g = new BluffQuiz(lobby);
  g.start();
  return { lobby, game: g, p: (i) => lobby.players.get(`p${i}`) };
}

function optionOf(game, test) {
  return game.options.find(test).id;
}

test('braucht mindestens drei Spieler', () => {
  const g = new BluffQuiz(fakeLobby(2));
  assert.throws(() => g.start(), /mindestens 3/);
});

test('die echte Antwort wird als Lüge abgelehnt, auch mit Tippfehler', () => {
  const { game, p } = setup();
  const q = game.question;
  const res = game.lie(p(1), q.answer.toLowerCase());
  assert.ok(res.error && res.truth);
  assert.strictEqual(game.lies.size, 0);
});

test('Zahlen müssen genau stimmen, um als Wahrheit zu gelten', () => {
  const { game, p } = setup();
  game.questions[0] = { id: 'x', question: '____', answer: '30000', alternatives: [], suggestions: ['1', '2', '3'] };
  assert.ok(game.lie(p(1), '30000').truth);
  assert.ok(game.lie(p(1), '32000').ok);
});

test('wenn alle geschrieben haben, geht es zur Auswahl; gleiche Lügen werden zusammengefasst', () => {
  const { game, p } = setup(3);
  game.lie(p(1), 'Quatsch');
  game.lie(p(2), 'quatsch');
  assert.strictEqual(game.phase, 'write');
  game.lie(p(3), 'Unsinn');
  assert.strictEqual(game.phase, 'pick');
  const shared = game.options.find((o) => o.authors.length === 2);
  assert.deepStrictEqual(shared.authors.sort(), ['p1', 'p2']);
  assert.strictEqual(game.options.filter((o) => o.truth).length, 1);
  assert.ok(game.options.length >= 4, 'mit Vorschlägen aufgefüllt');
  game.dispose();
});

test('die eigene Lüge kann man nicht wählen und nicht liken', () => {
  const { game, p } = setup(3);
  ['A-Lüge', 'B-Lüge', 'C-Lüge'].forEach((t, i) => game.lie(p(i + 1), t));
  const own = optionOf(game, (o) => o.authors.includes('p1'));
  assert.ok(game.pick(p(1), own).error);
  game.pick(p(1), optionOf(game, (o) => o.truth));
  game.pick(p(2), own);
  game.pick(p(3), own);
  assert.strictEqual(game.phase, 'reveal');
  assert.ok(game.like(p(1), own, true).error);
  assert.ok(game.like(p(1), optionOf(game, (o) => o.truth), true).error);
  game.dispose();
});

test('Punkte: Wahrheit, Reingelegte, halbe Punkte für Vorschläge, Likes', () => {
  const { game, p } = setup(3, { doubleLast: false });
  const suggestion = game.suggest(p(3)).text;
  game.lie(p(1), 'Erfunden');
  game.lie(p(2), 'Ausgedacht');
  game.lie(p(3), suggestion);
  const truth = optionOf(game, (o) => o.truth);
  const p1Lie = optionOf(game, (o) => o.authors.includes('p1'));
  const p3Lie = optionOf(game, (o) => o.authors.includes('p3'));
  game.pick(p(1), p3Lie);
  game.pick(p(2), p1Lie);
  game.pick(p(3), truth);
  game.like(p(2), p1Lie, true);
  game.like(p(3), p1Lie, true);
  while (game.phase === 'reveal') game.next();
  const pts = game.history[0].points;
  assert.strictEqual(pts.p1.total, 500 + 200);
  assert.strictEqual(pts.p2.total, 0);
  assert.strictEqual(pts.p3.total, 1000 + 250);
  assert.deepStrictEqual(game.totals, { p1: 700, p2: 0, p3: 1250 });
  game.dispose();
});

test('wer nichts schreibt, bekommt zum Ende der Zeit einen Vorschlag', () => {
  const { game, p } = setup(3);
  game.lie(p(1), 'Erfunden');
  game.next();
  assert.strictEqual(game.phase, 'pick');
  assert.ok(game.lies.get('p2').suggested);
  assert.ok(game.lies.get('p3').suggested);
  game.dispose();
});

test('die letzte Frage zählt doppelt', () => {
  const { game, p } = setup(3, { questionCount: 3 });
  game.index = 2;
  game.startQuestion();
  ['A-Lüge', 'B-Lüge', 'C-Lüge'].forEach((t, i) => game.lie(p(i + 1), t));
  const truth = optionOf(game, (o) => o.truth);
  for (const i of [1, 2, 3]) game.pick(p(i), truth);
  while (game.phase === 'reveal') game.next();
  assert.strictEqual(game.history[2].points.p1.truth, 2000);
  game.dispose();
});

test('im Team-Modus schreibt jedes Team eine Lüge und wählt per Mehrheit', () => {
  const { game, p } = setup(5, { teamMode: true });
  game.lie(p(1), 'Rote Lüge');
  game.lie(p(3), 'Blaue Lüge');
  game.lie(p(4), 'Blaue Lüge zwei');
  game.lie(p(5), 'Grüne Lüge');
  assert.strictEqual(game.phase, 'pick');
  assert.strictEqual(game.options.find((o) => o.authors.includes('t2')).text, 'Blaue Lüge zwei');
  const truth = optionOf(game, (o) => o.truth);
  const red = optionOf(game, (o) => o.authors.includes('t1'));
  assert.ok(game.pick(p(2), red).error, 'eigene Teamlüge gesperrt');
  game.pick(p(1), truth);
  game.pick(p(2), truth);
  game.pick(p(3), red);
  game.pick(p(4), red);
  game.pick(p(5), truth);
  while (game.phase === 'reveal') game.next();
  const pts = game.history[0].points;
  assert.strictEqual(pts.t1.total, 1000 + 500);
  assert.strictEqual(pts.t2.total, 0);
  assert.strictEqual(pts.t3.total, 1000);
  game.dispose();
});

test('einstimmig ausgeschlossene Fragen werden ersetzt', () => {
  const { game, p } = setup(3);
  const old = game.question.id;
  for (const i of [1, 2]) game.voteExclude(p(i), true);
  assert.strictEqual(game.question.id, old);
  game.voteExclude(p(3), true);
  assert.notStrictEqual(game.question.id, old);
  assert.match(game.notice, /ausgeschlossen/);
  game.dispose();
});

test('keine Frage kommt in derselben Lobby doppelt, solange neue da sind', () => {
  const lobby = fakeLobby(3, { questionCount: 10 });
  const first = new BluffQuiz(lobby);
  first.start();
  const second = new BluffQuiz(lobby);
  second.start();
  const a = new Set(first.questions.map((q) => q.id));
  assert.ok(second.questions.every((q) => !a.has(q.id)));
  first.dispose();
  second.dispose();
});
