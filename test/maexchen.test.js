// Regeltests für Mäxchen: node --test

const test = require('node:test');
const assert = require('node:assert');
const Maexchen = require('../server/games/maexchen');

function setup(n, game = {}) {
  const players = new Map();
  for (let i = 1; i <= n; i++) players.set(`p${i}`, { id: `p${i}`, name: `Spieler ${i}`, connected: true, isHost: i === 1 });
  const lobby = {
    hostId: 'p1',
    players,
    settings: { hostPlays: true, game: { ...Maexchen.defaultSettings(), ...game } },
    activePlayers: () => [...players.values()].filter((p) => p.connected),
    broadcast() {},
  };
  const g = new Maexchen(lobby);
  g.start();
  g.order = [...players.keys()];
  g.turnId = 'p1';
  return { lobby, g, p: (i) => players.get(`p${i}`) };
}

// Würfelt für den Spieler am Zug und legt das Ergebnis fest
function rollAs(g, player, dice) {
  assert.deepStrictEqual(g.action(player, { type: 'roll' }), { ok: true });
  g.dice = dice;
}

test('Reihenfolge der Würfe: 31 ist das Kleinste, dann Pasche, Mäxchen ganz oben', () => {
  const { VALUES, rank, valueOf } = Maexchen;
  assert.strictEqual(VALUES.length, 21);
  assert.strictEqual(VALUES[0], 31);
  assert.strictEqual(VALUES[VALUES.length - 1], 21);
  assert.deepStrictEqual(VALUES.slice(13, 20), [65, 11, 22, 33, 44, 55, 66]);
  assert.strictEqual(valueOf([1, 2]), 21);
  assert.strictEqual(valueOf([3, 5]), 53);
  assert.ok(rank(11) > rank(65));
});

test('Nur der Würfelnde sieht die Würfel', () => {
  const { g, p } = setup(3);
  rollAs(g, p(1), [4, 2]);
  assert.deepStrictEqual(g.view(p(1)).myDice, [4, 2]);
  assert.strictEqual(g.view(p(2)).myDice, null);
  assert.strictEqual(g.view(p(3)).myDice, null);
  assert.ok(!JSON.stringify(g.view(p(2))).includes('"truth"'));
});

test('Ansage muss höher sein als die vorige, Glauben gibt den Becher weiter', () => {
  const { g, p } = setup(3);
  rollAs(g, p(1), [4, 2]);
  assert.ok(g.action(p(2), { type: 'announce', value: 42 }).error);
  g.action(p(1), { type: 'announce', value: 42 });
  assert.strictEqual(g.phase, 'decide');
  assert.strictEqual(g.deciderId, 'p2');
  g.action(p(2), { type: 'believe' });
  assert.strictEqual(g.phase, 'roll');
  assert.strictEqual(g.turnId, 'p2');
  rollAs(g, p(2), [1, 3]);
  assert.ok(g.action(p(2), { type: 'announce', value: 41 }).error);
  assert.ok(g.action(p(2), { type: 'announce', value: 42 }).error);
  assert.deepStrictEqual(g.action(p(2), { type: 'announce', value: 43 }), { ok: true });
  assert.strictEqual(g.deciderId, 'p3');
});

test('Aufgedeckter Bluff kostet den Bluffer ein Leben, er beginnt die nächste Runde', () => {
  const { g, p } = setup(3);
  rollAs(g, p(1), [3, 1]);
  g.action(p(1), { type: 'announce', value: 62 });
  g.action(p(2), { type: 'challenge' });
  assert.strictEqual(g.phase, 'reveal');
  assert.strictEqual(g.lives.p1, 2);
  assert.strictEqual(g.lives.p2, 3);
  assert.strictEqual(g.view(p(3)).reveal.actual, 31);
  assert.strictEqual(g.nextStarter, 'p1');
  assert.ok(g.action(p(2), { type: 'roll' }).error);
  rollAs(g, p(1), [5, 5]);
  assert.strictEqual(g.phase, 'announce');
  assert.strictEqual(g.claim, null);
});

test('Wer zu Unrecht aufdeckt, verliert; mehr als angesagt zählt als ehrlich', () => {
  const { g, p } = setup(3);
  rollAs(g, p(1), [6, 6]);
  g.action(p(1), { type: 'announce', value: 54 });
  g.action(p(2), { type: 'challenge' });
  assert.strictEqual(g.lives.p2, 2);
  assert.strictEqual(g.lives.p1, 3);
});

test('Mäxchen: glauben heißt aufgeben, aufgedeckt kostet es zwei Leben', () => {
  let { g, p } = setup(3);
  rollAs(g, p(1), [2, 1]);
  g.action(p(1), { type: 'announce', value: 21 });
  g.action(p(2), { type: 'believe' });
  assert.strictEqual(g.lives.p2, 2);
  assert.strictEqual(g.view(p(3)).reveal.dice, null);

  ({ g, p } = setup(3));
  rollAs(g, p(1), [2, 1]);
  g.action(p(1), { type: 'announce', value: 21 });
  g.action(p(2), { type: 'challenge' });
  assert.strictEqual(g.lives.p2, 1);

  ({ g, p } = setup(3, { maexDouble: false }));
  rollAs(g, p(1), [2, 1]);
  g.action(p(1), { type: 'announce', value: 21 });
  g.action(p(2), { type: 'challenge' });
  assert.strictEqual(g.lives.p2, 2);
});

test('Ausgeschiedene werden übersprungen, der Letzte gewinnt', () => {
  const { g, p } = setup(3, { lives: 1 });
  rollAs(g, p(1), [3, 1]);
  g.action(p(1), { type: 'announce', value: 65 });
  g.action(p(2), { type: 'challenge' });
  assert.strictEqual(g.lives.p1, 0);
  assert.strictEqual(g.nextStarter, 'p2');
  rollAs(g, p(2), [3, 2]);
  g.action(p(2), { type: 'announce', value: 32 });
  assert.strictEqual(g.deciderId, 'p3');
  g.action(p(3), { type: 'believe' });
  rollAs(g, p(3), [3, 1]);
  g.action(p(3), { type: 'announce', value: 41 });
  assert.strictEqual(g.deciderId, 'p2');
  g.action(p(2), { type: 'challenge' });
  assert.strictEqual(g.phase, 'final');
  assert.deepStrictEqual(g.view(p(1)).ranking, ['p2', 'p3', 'p1']);
});

test('Wer die Verbindung verliert, wird übersprungen oder das Spiel spielt für ihn', () => {
  const { g, p } = setup(3);
  rollAs(g, p(1), [4, 1]);
  p(2).connected = false;
  g.action(p(1), { type: 'announce', value: 41 });
  assert.strictEqual(g.deciderId, 'p3');
  g.action(p(3), { type: 'believe' });
  p(3).connected = false;
  g.playersChanged();
  // Für den Abwesenden wird gewürfelt und angesagt, dann ist wieder Spieler 1 dran
  assert.strictEqual(g.phase, 'decide');
  assert.strictEqual(g.deciderId, 'p1');
  assert.ok(Maexchen.rank(g.claim.value) > Maexchen.rank(41));
});

test('Neue Spieler steigen mit den wenigsten Leben ein', () => {
  const { g, p, lobby } = setup(2);
  rollAs(g, p(1), [3, 1]);
  g.action(p(1), { type: 'announce', value: 65 });
  g.action(p(2), { type: 'challenge' });
  lobby.players.set('p9', { id: 'p9', name: 'Neu', connected: true });
  g.playersChanged();
  assert.strictEqual(g.lives.p9, 2);
  assert.ok(g.order.includes('p9'));
});

test('Geteiltes Gerät: Gäste spielen am Handy ihres Gastgebers mit', () => {
  const { lobby, g, p } = setup(2);
  assert.strictEqual(Maexchen.meta().sharedDevice, true);
  lobby.players.set('g1', { id: 'g1', name: 'Gast', connected: true, isHost: false, guestOf: 'p2' });
  g.playersChanged();
  assert.ok(g.order.includes('g1'));
  g.order = ['p1', 'p2', 'g1'];
  rollAs(g, p(1), [4, 2]);
  g.action(p(1), { type: 'announce', value: 42 });
  g.action(p(2), { type: 'believe' });
  rollAs(g, p(2), [5, 3]);
  g.action(p(2), { type: 'announce', value: 53 });
  // Der Gast entscheidet über das Handy von Spieler 2, nicht über das von Spieler 1
  assert.strictEqual(g.deciderId, 'g1');
  assert.ok(g.action(p(1), { type: 'believe' }).error);
  assert.strictEqual(g.view(p(2)).mine, true);
  assert.deepStrictEqual(g.action(p(2), { type: 'challenge' }), { ok: true });
  assert.strictEqual(g.lives.g1, 2);
});
