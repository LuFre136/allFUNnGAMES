// Tests für die Wortauswahl bei Just One: node --test

const test = require('node:test');
const assert = require('node:assert');
const JustOne = require('../server/games/justone');
const { words, hard } = require('../server/games/justone/words.json');

test('schwere Begriffe sind eindeutig und nicht in der normalen Liste', () => {
  assert.ok(hard.length >= 400);
  assert.equal(new Set(hard).size, hard.length);
  const normal = new Set(words);
  assert.deepEqual(hard.filter((w) => normal.has(w)), []);
});

test('Schwierigkeit wählt den Wortpool und begrenzt die Kartenzahl', () => {
  const start = JustOne.defaultSettings();
  assert.equal(start.wordLevel, 'normal');
  assert.equal(JustOne.sanitizeSettings(start, { wordLevel: 'quatsch' }).wordLevel, 'normal');

  const hardSettings = JustOne.sanitizeSettings(start, { wordLevel: 'hard', cardCount: 9999 });
  assert.equal(hardSettings.cardCount, Math.floor(hard.length / 4));
  const mixed = JustOne.sanitizeSettings(hardSettings, { wordLevel: 'mixed', cardCount: 9999 });
  assert.equal(mixed.cardCount, Math.floor((words.length + hard.length) / 4));
  assert.equal(JustOne.availableCount(mixed), mixed.cardCount);
});

test('ein Spiel mit schweren Begriffen zieht nur schwere Begriffe', () => {
  const players = [1, 2, 3].map((id) => ({ id: `p${id}`, name: `P${id}` }));
  const lobby = {
    settings: { game: { cardCount: 13, clueTimeLimit: 0, wordLevel: 'hard' } },
    players: new Map(players.map((p) => [p.id, p])),
    activePlayers: () => players,
  };
  const game = new JustOne(lobby);
  game.start();
  const set = new Set(hard);
  assert.equal(game.deck.length, 13);
  assert.ok(game.deck.flat().every((w) => set.has(w)));
  game.clearTimer();
});
