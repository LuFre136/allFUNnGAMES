// Regeltests für Sag's anders!: node --test

const test = require('node:test');
const assert = require('node:assert');
const SagsAnders = require('../server/games/sagsanders');
const { normalize } = require('../server/util');

// Zwei Teams: p1 (Host), p2, p3 in Rot, p4, p5, p6 in Blau
function fakeLobby(game = {}, perTeam = 3) {
  const players = new Map();
  const teams = [{ id: 't1', name: 'Rot' }, { id: 't2', name: 'Blau' }];
  for (let i = 1; i <= perTeam * 2; i++) {
    players.set(`p${i}`, { id: `p${i}`, name: `Spieler ${i}`, connected: true, isHost: i === 1, teamId: i <= perTeam ? 't1' : 't2' });
  }
  return {
    hostId: 'p1',
    players,
    teams,
    settings: { hostPlays: true, game: { ...SagsAnders.defaultSettings(), ...game } },
    playersInTeam: (id) => [...players.values()].filter((p) => p.teamId === id),
    broadcast() {},
  };
}

// Laufende Sanduhren am Ende jedes Tests stoppen
const running = [];
test.afterEach(() => running.splice(0).forEach((g) => g.dispose()));

function setup(game, perTeam) {
  const lobby = fakeLobby({ orderMode: 'lobby', ...game }, perTeam);
  const g = new SagsAnders(lobby);
  running.push(g);
  g.start();
  return { lobby, game: g, p: (i) => lobby.players.get(`p${i}`) };
}

function explainer(game, lobby) {
  return lobby.players.get(game.turn.explainerId);
}

// Ein Spieler aus einem anderen Team, der nicht der Host ist
function guard(game, lobby) {
  return [...lobby.players.values()].find((p) => p.teamId !== game.turn.teamId && !p.isHost);
}

function guesser(game, lobby) {
  return [...lobby.players.values()].find((p) => p.teamId === game.turn.teamId && p.id !== game.turn.explainerId && !p.isHost);
}

test('Kartenstapel: 300 Karten, keine doppelten Begriffe, Begriff nie in den eigenen verbotenen Wörtern', () => {
  const cards = SagsAnders.cards;
  assert.strictEqual(cards.length, 300);
  assert.strictEqual(new Set(cards.map((c) => normalize(c.word))).size, cards.length);
  for (const c of cards) {
    assert.ok(c.taboo.length >= 5, `${c.word} hat zu wenige verbotene Wörter`);
    const taboo = c.taboo.map(normalize);
    assert.strictEqual(new Set(taboo).size, taboo.length, `${c.word} hat doppelte verbotene Wörter`);
    const word = normalize(c.word).replace(/\s/g, '');
    for (const t of taboo) assert.ok(!t.replace(/\s/g, '').includes(word), `„${c.word}“ steckt in „${t}“`);
    assert.ok(SagsAnders.categories.includes(c.category), `${c.word}: unbekannte Kategorie`);
    assert.ok([1, 2, 3].includes(c.level));
  }
});

test('Start braucht zwei Teams mit je zwei Spielern', () => {
  const lobby = fakeLobby({}, 3);
  lobby.players.get('p3').teamId = 't2';
  lobby.players.get('p2').teamId = 't2';
  assert.throws(() => new SagsAnders(lobby).start(), /mindestens zwei Spieler/);
  const solo = fakeLobby({}, 2);
  for (const p of solo.players.values()) p.teamId = 't1';
  assert.throws(() => new SagsAnders(solo).start(), /mindestens zwei Teams/);
  assert.throws(() => setup({ categories: [] }), /zu wenige Karten/);
});

test('der Host erklärt nie, nur Erklärer und Wächter sehen die Karte', () => {
  const { game, lobby, p } = setup();
  for (let i = 0; i < 6; i++) {
    assert.notStrictEqual(game.turn.explainerId, 'p1');
    game.go();
    const ex = explainer(game, lobby);
    assert.ok(game.view(ex).card, 'Erklärer sieht die Karte');
    assert.ok(game.view(guard(game, lobby)).card, 'Wächter sieht die Karte');
    assert.strictEqual(game.view(guesser(game, lobby)).card, null);
    assert.strictEqual(game.view(p(1)).card, null, 'Host-Bildschirm zeigt die Karte nie');
    assert.strictEqual(game.view(guesser(game, lobby)).results, null);
    game.timeUp();
    game.next();
  }
});

test('Teams wechseln sich ab, Erklärer reihum im Team', () => {
  const { game } = setup({}, 3);
  const seen = [];
  for (let i = 0; i < 6; i++) {
    seen.push([game.turn.teamId, game.turn.explainerId]);
    game.timeUp();
    game.next();
  }
  assert.deepStrictEqual(seen.map((s) => s[0]), ['t1', 't2', 't1', 't2', 't1', 't2']);
  // In Rot erklären nur p2 und p3 (p1 ist der Host), in Blau p4, p5, p6
  assert.deepStrictEqual(seen.filter((s) => s[0] === 't1').map((s) => s[1]), ['p2', 'p3', 'p2']);
  assert.deepStrictEqual(seen.filter((s) => s[0] === 't2').map((s) => s[1]), ['p4', 'p5', 'p6']);
});

test('Richtig, Überspringen, Buzz und Punkte', () => {
  const { game, lobby } = setup({ skipPenalty: true });
  game.go();
  const ex = explainer(game, lobby);
  assert.ok(game.correct(ex).ok);
  assert.ok(game.correct(ex).ok);
  assert.ok(game.skip(ex).ok);
  assert.ok(game.buzz(guard(game, lobby), game.cardNo).ok);
  assert.ok(game.correct(ex).ok);
  assert.strictEqual(game.turnScore(game.turn), 3 - 1 - 1);
  assert.ok(game.buzz(guesser(game, lobby), game.cardNo).error, 'das eigene Team darf nicht buzzern');
  assert.ok(game.correct(guard(game, lobby)).error, 'nur der Erklärer wertet');
  game.timeUp();
  assert.strictEqual(game.phase, 'review');
  assert.strictEqual(game.turn.results.at(-1).result, 'timeout');
  game.next();
  assert.strictEqual(game.scores().t1, 1);
});

test('nur der erste Buzz pro Karte zählt', () => {
  const { game, lobby, p } = setup();
  game.go();
  const no = game.cardNo;
  game.buzz(p(4), no);
  game.buzz(p(5), no);
  assert.strictEqual(game.turn.results.length, 1);
  assert.strictEqual(game.turn.results[0].by, 'p4');
  assert.strictEqual(game.cardNo, no + 1);
  // Wer einen Augenblick später drückt, sieht schon die neue Karte: das zählt auch nicht
  game.buzz(p(5), game.cardNo);
  assert.strictEqual(game.turn.results.length, 1);
  game.lastBuzzAt -= 2000;
  game.buzz(p(5), game.cardNo);
  assert.strictEqual(game.turn.results.length, 2);
  assert.ok(explainer(game, lobby));
});

test('Zurücknehmen holt die letzte Karte zurück, ein alter Buzz trifft sie nicht', () => {
  const { game, lobby } = setup();
  game.go();
  const ex = explainer(game, lobby);
  const first = game.card;
  game.correct(ex);
  const second = game.card;
  const staleNo = game.cardNo;
  assert.ok(game.undo(ex).ok);
  assert.strictEqual(game.card, first);
  assert.strictEqual(game.turn.results.length, 0);
  game.buzz(guard(game, lobby), staleNo);
  assert.strictEqual(game.turn.results.length, 0, 'verspäteter Buzz zählt nicht');
  game.correct(ex);
  assert.strictEqual(game.card, second);
});

test('Überspringen begrenzt oder ausgeschaltet', () => {
  const { game, lobby } = setup({ skipLimit: 1 });
  game.go();
  const ex = explainer(game, lobby);
  assert.ok(game.skip(ex).ok);
  assert.ok(game.skip(ex).error);
  const off = setup({ skipLimit: 0 });
  off.game.go();
  assert.ok(off.game.skip(explainer(off.game, off.lobby)).error);
});

test('Punkte fallen nie unter 0, der Host korrigiert in der Auflösung', () => {
  const { game, lobby } = setup();
  game.go();
  game.buzz(guard(game, lobby), game.cardNo);
  game.lastBuzzAt = 0;
  game.buzz(guard(game, lobby), game.cardNo);
  game.timeUp();
  assert.strictEqual(game.scores().t1, 0);
  assert.ok(game.setResult(0, 'correct').ok);
  assert.ok(game.setResult(2, 'correct').ok, 'auch die Karte beim Gong');
  assert.strictEqual(game.turnScore(game.turn), 1);
  assert.strictEqual(game.scores().t1, 1);
  game.next();
  assert.ok(game.setResult(0, 'buzz').error, 'nur in der Auflösung');
});

test('Spielende nach Runden: jeder erklärt so oft wie eingestellt', () => {
  const { game } = setup({ rounds: 2 }, 3);
  // größtes Team erklärt mit 3 Spielern, also 2 × 3 Züge pro Team
  let turns = 0;
  while (game.phase !== 'final') {
    game.timeUp();
    game.next();
    turns++;
  }
  assert.strictEqual(turns, 12);
  assert.ok(game.awards());
});

test('Spielende mit Zielpunktzahl erst nach der vollen Runde', () => {
  const { game, lobby } = setup({ endMode: 'score', target: 10 });
  game.go();
  const ex = explainer(game, lobby);
  for (let i = 0; i < 10; i++) game.correct(ex);
  game.timeUp();
  game.next();
  assert.strictEqual(game.phase, 'ready', 'Team Blau ist noch dran');
  game.timeUp();
  game.next();
  assert.strictEqual(game.phase, 'final');
  assert.strictEqual(game.awards().bestTurn.value, 10);
});

test('Erklärer trennt die Verbindung: Zeit hält an, Host wählt jemand anderen', () => {
  const { game, lobby } = setup();
  game.go();
  const ex = explainer(game, lobby);
  ex.connected = false;
  game.playersChanged();
  assert.ok(game.paused);
  assert.ok(game.remainingMs > 0);
  assert.ok(game.correct(ex).error);
  const other = guesser(game, lobby);
  assert.ok(game.setExplainer(other.id).ok);
  assert.ok(game.resume().ok);
  assert.ok(game.correct(other).ok);
  assert.ok(game.setExplainer('p1').error, 'der Host-Bildschirm erklärt nie');
});

test('vor dem Zug springt ein getrennter Erklärer zum nächsten im Team', () => {
  const { game, lobby } = setup();
  const ex = explainer(game, lobby);
  ex.connected = false;
  game.playersChanged();
  assert.notStrictEqual(game.turn.explainerId, ex.id);
  assert.strictEqual(lobby.players.get(game.turn.explainerId).teamId, game.turn.teamId);
});

test('Einstellungen werden begrenzt', () => {
  const s = SagsAnders.sanitizeSettings(SagsAnders.defaultSettings(), {
    turnTime: 7, rounds: 99, tabooCount: 1, categories: ['Tiere', 'Quatsch'], level: 'x', skipLimit: 3, endMode: 'score', target: 25,
  });
  assert.strictEqual(s.turnTime, 60);
  assert.strictEqual(s.rounds, 10);
  assert.strictEqual(s.tabooCount, 3);
  assert.deepStrictEqual(s.categories, ['Tiere']);
  assert.strictEqual(s.level, 'all');
  assert.strictEqual(s.skipLimit, 3);
  assert.strictEqual(s.endMode, 'score');
  assert.strictEqual(s.target, 25);
  assert.strictEqual(SagsAnders.availableCount({ ...s, level: 'easy' }), SagsAnders.cards.filter((c) => c.category === 'Tiere' && c.level === 1).length);
});
