// Regeltests für Karaoke: node --test

const test = require('node:test');
const assert = require('node:assert');
const Karaoke = require('../server/games/karaoke');

function setup(n = 3, settings = {}) {
  const players = new Map();
  for (let i = 1; i <= n; i++) players.set(`p${i}`, { id: `p${i}`, connected: true, isHost: i === 1 });
  const lobby = {
    players,
    settings: { hostPlays: true, game: { ...Karaoke.defaultSettings(), ...settings } },
    activePlayers: () => [...players.values()].filter((p) => p.connected),
  };
  const game = new Karaoke(lobby);
  game.start();
  return { game, p: (i) => players.get(`p${i}`) };
}

test('YouTube-Links aller Formen werden erkannt', () => {
  const id = 'dQw4w9WgXcQ';
  for (const url of [
    id,
    `https://www.youtube.com/watch?v=${id}&t=10`,
    `youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}?si=abc`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://music.youtube.com/watch?v=${id}`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`,
  ]) assert.strictEqual(Karaoke.parseVideoId(url), id, url);
  for (const bad of ['', 'Mamma Mia', 'https://vimeo.com/123', 'https://youtube.com/watch?v=kurz']) assert.strictEqual(Karaoke.parseVideoId(bad), null, bad);
});

test('Reihum: wer weniger gesungen hat, kommt zuerst', () => {
  const { game, p } = setup();
  game.add(p(2), { title: 'A1' });
  game.add(p(2), { title: 'A2' });
  game.add(p(3), { title: 'B1' });
  assert.deepStrictEqual(game.queue().map((s) => s.title), ['A1', 'B1', 'A2']);
  game.play();
  game.ended(p(1), null);
  game.rate(p(1), 5);
  game.rate(p(3), 4);
  assert.strictEqual(game.phase, 'queue');
  game.add(p(2), { title: 'A3' });
  // p2 hat schon gesungen, p3 noch nicht
  assert.deepStrictEqual(game.queue().map((s) => s.title), ['B1', 'A2', 'A3']);
});

test('Ohne Reihum gilt die Reihenfolge der Anmeldung, Vorziehen geht vor', () => {
  const { game, p } = setup(3, { fairOrder: false });
  game.add(p(2), { title: 'A1' });
  game.add(p(2), { title: 'A2' });
  game.add(p(3), { title: 'B1' });
  assert.deepStrictEqual(game.queue().map((s) => s.title), ['A1', 'A2', 'B1']);
  game.bump(game.queue()[2].id);
  assert.deepStrictEqual(game.queue().map((s) => s.title), ['B1', 'A1', 'A2']);
});

test('Limit pro Person gilt nicht für den Host', () => {
  const { game, p } = setup(3, { maxQueued: 1 });
  assert.ok(game.add(p(2), { title: 'A1' }).ok);
  assert.ok(game.add(p(2), { title: 'A2' }).error);
  assert.ok(game.add(p(1), { title: 'H1' }).ok);
  assert.ok(game.add(p(1), { title: 'H2', singerId: 'p3' }).ok);
  assert.deepStrictEqual(game.songs.at(-1).singers, ['p3']);
});

test('Ungültiger Link wird abgelehnt, nur eigene Songs lassen sich entfernen', () => {
  const { game, p } = setup();
  assert.ok(game.add(p(2), { title: 'X', url: 'https://example.com' }).error);
  game.add(p(2), { title: 'X', url: 'https://youtu.be/dQw4w9WgXcQ' });
  const id = game.songs[0].id;
  assert.ok(game.remove(p(3), id).error);
  assert.ok(game.remove(p(1), id).ok);
});

test('Duett: beide Sänger bewerten nicht und werden beide gewertet', () => {
  const { game, p } = setup(4);
  game.add(p(2), { title: 'Duett', partnerId: 'p3' });
  game.play();
  assert.deepStrictEqual(game.raters().map((x) => x.id), ['p1', 'p4']);
  assert.ok(game.rate(p(3), 5).error);
  assert.ok(game.rate(p(4), 4).ok); // schon während des Songs
  game.ended(p(2));
  assert.strictEqual(game.phase, 'rating');
  game.rate(p(1), 2);
  assert.strictEqual(game.phase, 'queue');
  assert.strictEqual(game.lastResult.average, 3);
  game.finish();
  const ranking = game.ranking();
  assert.deepStrictEqual(ranking.map((r) => [r.playerId, r.average]), [['p2', 3], ['p3', 3]]);
});

test('Ohne Bewertung geht es direkt weiter, Abbrechen wertet nicht', () => {
  const { game, p } = setup(3, { rating: false });
  game.add(p(2), { title: 'A' });
  game.add(p(3), { title: 'B' });
  game.play();
  assert.ok(game.ended(p(3)).error);
  game.ended(p(2));
  assert.strictEqual(game.phase, 'queue');
  assert.strictEqual(game.history.length, 1);
  game.play();
  game.skip();
  assert.strictEqual(game.history.length, 1);
});

test('Wer den Raum verlässt, blockiert die Bewertung nicht', () => {
  const { game, p } = setup(3);
  game.add(p(2), { title: 'A' });
  game.play();
  game.ended(p(1));
  game.rate(p(1), 4);
  assert.strictEqual(game.phase, 'rating');
  p(3).connected = false;
  game.playersChanged();
  assert.strictEqual(game.phase, 'queue');
});

test('Reaktionen nur während des Songs und gedrosselt', () => {
  const { game, p } = setup(3);
  assert.ok(game.react(p(3), '👏').error);
  game.add(p(2), { title: 'A' });
  game.play();
  game.react(p(3), '👏');
  game.react(p(3), '🔥');
  assert.strictEqual(game.view(p(1)).reactions.length, 1);
  assert.ok(game.react(p(3), '💩').error);
});
