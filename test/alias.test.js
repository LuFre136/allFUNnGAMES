// Regeltests für Alias: node --test

const test = require('node:test');
const assert = require('node:assert');
const Alias = require('../server/games/alias');

// Zwei Teams: p1 (Host), p2, p3 in Rot, p4, p5, p6 in Blau
function fakeLobby(game = {}, perTeam = 3) {
  const players = new Map();
  const teams = [{ id: 't1', name: 'Rot' }, { id: 't2', name: 'Blau' }];
  for (let i = 1; i <= perTeam * 2; i++) {
    players.set(`p${i}`, { id: `p${i}`, connected: true, isHost: i === 1, teamId: i <= perTeam ? 't1' : 't2' });
  }
  return {
    hostId: 'p1',
    players,
    teams,
    settings: { hostPlays: true, game: { ...Alias.defaultSettings(), ...game } },
    playersInTeam: (id) => [...players.values()].filter((p) => p.teamId === id),
    broadcast() {},
  };
}

function setup(game, perTeam) {
  const lobby = fakeLobby(game, perTeam);
  const g = new Alias(lobby);
  g.start();
  return { lobby, game: g, p: (i) => lobby.players.get(`p${i}`) };
}

// Index einer verdeckten Karte mit dieser Farbe
function cardOf(game, color) {
  return game.key.findIndex((k, i) => k === color && !game.revealed[i]);
}

function spymaster(game, lobby, teamId = game.turnTeamId) {
  return lobby.players.get(game.spymasters[teamId]);
}

function guessers(game, teamId = game.turnTeamId) {
  return game.guessers(teamId);
}

// Ein Hinweis, der garantiert nicht auf dem Tisch liegt
const CLUE = 'Quatschwort';

test('Schlüsselkarte: 9 + 8 + 7 neutral + 1 Attentäter, Startteam hat 9', () => {
  const { game } = setup();
  assert.strictEqual(game.words.length, 25);
  assert.strictEqual(new Set(game.words).size, 25);
  const count = (c) => game.key.filter((k) => k === c).length;
  assert.strictEqual(count(game.turnTeamId), 9);
  assert.strictEqual(count(game.otherTeamId(game.turnTeamId)), 8);
  assert.strictEqual(count('neutral'), 7);
  assert.strictEqual(count('assassin'), 1);
});

test('der Host wird nie Hinweisgeber, nur Hinweisgeber sehen die Farben', () => {
  for (let i = 0; i < 20; i++) {
    const { game, lobby, p } = setup({ spymasterMode: 'random' });
    assert.notStrictEqual(game.spymasters.t1, 'p1');
    const spy = spymaster(game, lobby, 't1');
    assert.ok(game.view(spy).board.every((c) => c.color));
    assert.ok(game.view(p(1)).board.every((c) => c.color === null));
    const guesser = guessers(game, 't1').find((x) => !x.isHost);
    assert.ok(game.view(guesser).board.every((c) => c.color === null));
  }
});

test('Start braucht zwei Spieler pro Team und jemanden außer dem Host', () => {
  const lobby = fakeLobby({}, 2);
  lobby.players.get('p2').teamId = 't2';
  assert.throws(() => new Alias(lobby).start(), /mindestens zwei Spieler/);
  const lobby2 = fakeLobby({}, 2);
  lobby2.players.get('p2').isHost = true;
  assert.throws(() => new Alias(lobby2).start(), /außer dem Host/);
});

test('verbotene Hinweise: Wort auf dem Tisch, Wortfamilie, mehrere Wörter', () => {
  const { game, lobby } = setup();
  const spy = spymaster(game, lobby);
  const word = game.words[0];
  assert.match(game.action(spy, { type: 'clue', word, count: 1 }).error, /zu nah/);
  assert.match(game.action(spy, { type: 'clue', word: `${word}haus`, count: 1 }).error, /zu nah/);
  assert.match(game.action(spy, { type: 'clue', word: 'zwei Wörter', count: 1 }).error, /einzelnes Wort/);
  const other = spymaster(game, lobby, game.otherTeamId(game.turnTeamId));
  assert.ok(game.action(other, { type: 'clue', word: CLUE, count: 1 }).error);
  assert.deepStrictEqual(game.action(spy, { type: 'clue', word: CLUE, count: 2 }), { ok: true });
  assert.strictEqual(game.phase, 'guess');
  assert.strictEqual(game.guessesLeft, 3);
});

test('Mehrheit deckt auf, eigene Karte erlaubt weiterzuraten', () => {
  const { game, lobby } = setup({}, 4);
  const team = game.turnTeamId;
  game.action(spymaster(game, lobby), { type: 'clue', word: CLUE, count: 2 });
  const [a, b] = guessers(game);
  assert.strictEqual(guessers(game).length, 3);
  const i = cardOf(game, team);
  game.action(a, { type: 'pick', index: i });
  assert.strictEqual(game.revealed[i], null);
  game.action(b, { type: 'pick', index: i });
  assert.strictEqual(game.revealed[i], team);
  assert.strictEqual(game.turnTeamId, team);
  assert.strictEqual(game.guessesLeft, 2);
});

test('Passant oder gegnerische Karte beendet den Zug', () => {
  const { game, lobby } = setup({ revealMode: 'first' });
  const team = game.turnTeamId;
  game.action(spymaster(game, lobby), { type: 'clue', word: CLUE, count: 1 });
  game.action(guessers(game)[0], { type: 'pick', index: cardOf(game, 'neutral') });
  assert.strictEqual(game.turnTeamId, game.otherTeamId(team));
  assert.strictEqual(game.phase, 'clue');
  game.action(spymaster(game, lobby), { type: 'clue', word: CLUE, count: 1 });
  game.action(guessers(game)[0], { type: 'pick', index: cardOf(game, team) });
  assert.strictEqual(game.turnTeamId, team);
});

test('höchstens Zahl + 1 Versuche, „Zug beenden“ per Mehrheit', () => {
  const { game, lobby } = setup({ revealMode: 'first' });
  const team = game.turnTeamId;
  game.action(spymaster(game, lobby), { type: 'clue', word: CLUE, count: 1 });
  game.action(guessers(game)[0], { type: 'pick', index: cardOf(game, team) });
  game.action(guessers(game)[0], { type: 'pick', index: cardOf(game, team) });
  assert.strictEqual(game.turnTeamId, game.otherTeamId(team));
  game.action(spymaster(game, lobby), { type: 'clue', word: CLUE, count: 0 });
  assert.strictEqual(game.guessesLeft, null);
  game.action(guessers(game)[0], { type: 'pick', index: 'end' });
  assert.strictEqual(game.turnTeamId, team);
});

test('Attentäter verliert sofort, Partien werden gezählt', () => {
  const { game, lobby } = setup({ revealMode: 'first', winsNeeded: 2 });
  const team = game.turnTeamId;
  const other = game.otherTeamId(team);
  game.action(spymaster(game, lobby), { type: 'clue', word: CLUE, count: 1 });
  game.action(guessers(game)[0], { type: 'pick', index: cardOf(game, 'assassin') });
  assert.strictEqual(game.phase, 'over');
  assert.strictEqual(game.winnerId, other);
  assert.strictEqual(game.endReason, 'assassin');
  assert.ok(game.view(lobby.players.get('p1')).board.every((c) => c.color));
  game.next();
  assert.strictEqual(game.phase, 'clue');
  assert.strictEqual(game.gameNo, 2);
  assert.strictEqual(game.turnTeamId, other, 'Startteam wechselt');
});

test('alle eigenen Karten gefunden gewinnt, auch durch das Gegnerteam', () => {
  const { game, lobby } = setup({ revealMode: 'first', winsNeeded: 1 });
  const team = game.turnTeamId;
  const other = game.otherTeamId(team);
  // Bis auf eine sind alle Karten von „other“ schon aufgedeckt
  game.key.forEach((k, i) => { if (k === other) game.revealed[i] = other; });
  const last = game.key.findIndex((k) => k === other);
  game.revealed[last] = null;
  game.action(spymaster(game, lobby), { type: 'clue', word: CLUE, count: 1 });
  game.action(guessers(game)[0], { type: 'pick', index: last });
  assert.strictEqual(game.winnerId, other);
  game.next();
  assert.strictEqual(game.phase, 'final');
});

test('Hinweisgeber reihum und vom Host festgelegt', () => {
  const { game } = setup();
  const first = game.spymasters.t2;
  game.finish('t1', 'cards');
  game.next();
  assert.notStrictEqual(game.spymasters.t2, first);
  const manual = setup({ spymasterMode: 'manual', spymasters: { t1: 'p3', t2: 'p6' } }).game;
  assert.deepStrictEqual(manual.spymasters, { t1: 'p3', t2: 'p6' });
});

test('Host kann aufdecken, Zug beenden und Hinweis zurückweisen', () => {
  const { game, lobby, p } = setup();
  const team = game.turnTeamId;
  game.action(spymaster(game, lobby), { type: 'clue', word: CLUE, count: 1 });
  assert.deepStrictEqual(game.action(p(1), { type: 'rejectClue' }), { ok: true });
  assert.strictEqual(game.phase, 'clue');
  assert.strictEqual(game.history.length, 0);
  game.action(spymaster(game, lobby), { type: 'clue', word: CLUE, count: 1 });
  const i = cardOf(game, team);
  assert.ok(game.action(p(2), { type: 'reveal', index: i }).error);
  game.action(p(1), { type: 'reveal', index: i });
  assert.strictEqual(game.revealed[i], team);
  game.action(p(1), { type: 'skip' });
  assert.strictEqual(game.turnTeamId, game.otherTeamId(team));
});

test('Hinweisgeber wechselt das Team: ein anderer übernimmt', () => {
  const { game, lobby } = setup();
  const spy = spymaster(game, lobby, 't2');
  spy.teamId = 't1';
  game.playersChanged();
  assert.notStrictEqual(game.spymasters.t2, spy.id);
  assert.strictEqual(lobby.players.get(game.spymasters.t2).teamId, 't2');
});

test('keine zwei Wörter derselben Wortfamilie auf dem Tisch', () => {
  for (let n = 0; n < 30; n++) {
    const { game } = setup();
    const lower = game.words.map((w) => w.toLowerCase());
    assert.ok(!(lower.includes('reif') && lower.includes('reifen')));
  }
});
