// Regeltests für Hitster: node --test

const test = require('node:test');
const assert = require('node:assert');
const Hitster = require('../server/games/hitster');

function fakeLobby(n, game = {}) {
  const players = new Map();
  for (let i = 1; i <= n; i++) players.set(`p${i}`, { id: `p${i}`, connected: true, isHost: i === 1 });
  return {
    players,
    settings: { hostPlays: true, game: { ...Hitster.defaultSettings(), ...game } },
    activePlayers: () => [...players.values()].filter((p) => p.connected),
    teamById: () => null,
  };
}

function setup(n = 2, game = {}) {
  const lobby = fakeLobby(n, game);
  const h = new Hitster(lobby);
  h.start();
  const p = (key) => lobby.players.get(key);
  // Feste Startkarten und fester Song für planbare Tests
  for (const u of h.units.values()) u.cards = [{ artist: 'A', title: 'Start', year: 1990 }];
  h.song = { artist: 'Queen', title: 'Bohemian Rhapsody', year: 1975 };
  return { h, lobby, active: p(h.activeKey), other: p(h.order.find((k) => k !== h.activeKey)) };
}

test('Stelle passt zum Jahr, gleiche Jahre an beiden Seiten', () => {
  const cards = [{ year: 1980 }, { year: 1990 }];
  assert.ok(Hitster.fits(cards, 0, 1975));
  assert.ok(!Hitster.fits(cards, 1, 1975));
  assert.ok(Hitster.fits(cards, 1, 1980));
  assert.ok(Hitster.fits(cards, 2, 1990));
  assert.ok(Hitster.fits([], 0, 2000));
});

test('Interpret und Titel tolerant erkennen', () => {
  const song = { artist: 'Mark Ronson feat. Bruno Mars', title: 'Uptown Funk' };
  assert.ok(Hitster.guessIsRight({ artist: 'mark ronson', title: 'uptown funk' }, song));
  assert.ok(Hitster.guessIsRight({ artist: 'Bruno Mars', title: 'Uptwn Funk' }, song));
  assert.ok(!Hitster.guessIsRight({ artist: 'Bruno Mars', title: '' }, song));
  assert.ok(Hitster.guessIsRight({ artist: 'Rolling Stones', title: 'Satisfaction' }, { artist: 'The Rolling Stones', title: "(I Can't Get No) Satisfaction" }));
});

test('richtig gelegt: Karte bleibt, Titel richtig gibt einen Chip', () => {
  const { h, active } = setup();
  assert.deepStrictEqual(h.action(active, { type: 'place', slot: 0 }), { ok: true });
  h.action(active, { type: 'confirm', artist: 'Queen', title: 'Bohemian Rhapsody' });
  assert.strictEqual(h.phase, 'challenge');
  h.reveal();
  const unit = h.units.get(h.activeKey);
  assert.deepStrictEqual(unit.cards.map((c) => c.year), [1975, 1990]);
  assert.strictEqual(unit.chips, 3);
  assert.ok(h.result.correct && h.result.guessOk);
});

test('Einspruch gewinnt die Karte, wenn der Aktive falsch liegt', () => {
  const { h, active, other } = setup();
  h.action(active, { type: 'place', slot: 1 });
  h.action(active, { type: 'confirm' });
  assert.strictEqual(h.action(other, { type: 'challenge', slot: 1 }).error, 'Dort liegt die Karte schon. Wähle eine andere Stelle.');
  assert.deepStrictEqual(h.action(other, { type: 'challenge', slot: 0 }), { ok: true });
  // Alle Einspruchsberechtigten haben entschieden: automatisch aufgedeckt
  assert.strictEqual(h.phase, 'reveal');
  assert.ok(!h.result.correct);
  assert.strictEqual(h.result.winnerKey, other.id);
  assert.strictEqual(h.units.get(other.id).cards.length, 2);
  assert.strictEqual(h.units.get(other.id).chips, 1);
  assert.strictEqual(h.units.get(active.id).cards.length, 1);
});

test('ohne Chips gibt es keine Einspruchsphase', () => {
  const { h, active } = setup(2, { chips: false });
  h.action(active, { type: 'place', slot: 1 });
  h.action(active, { type: 'confirm', artist: 'Queen', title: 'Bohemian Rhapsody' });
  assert.strictEqual(h.phase, 'reveal');
  assert.strictEqual(h.units.get(active.id).chips, 0);
});

test('nur wer dran ist, darf legen', () => {
  const { h, other } = setup();
  assert.ok(h.action(other, { type: 'place', slot: 0 }).error);
});

test('Karte kaufen und Sieg bei Zielzahl', () => {
  const { h, active } = setup(2, { targetCards: 3 });
  h.units.get(active.id).chips = 3;
  h.units.get(active.id).cards.push({ artist: 'B', title: 'X', year: 2000 });
  assert.deepStrictEqual(h.action(active, { type: 'buy' }), { ok: true });
  assert.deepStrictEqual(h.units.get(active.id).cards.map((c) => c.year), [1975, 1990, 2000]);
  h.next();
  assert.strictEqual(h.phase, 'final');
  assert.strictEqual(h.ranking()[0].key, active.id);
});

test('Songliste: Jahre plausibel, keine doppelten Einträge', () => {
  const seen = new Set();
  for (const s of Hitster.songs) {
    assert.ok(s.year >= 1950 && s.year <= 2026, `${s.artist} – ${s.title}`);
    const key = `${s.artist}|${s.title}`.toLowerCase();
    assert.ok(!seen.has(key), key);
    seen.add(key);
  }
});
