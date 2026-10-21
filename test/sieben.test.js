// Regeltests für Sieben auf einen Streich: node --test

const test = require('node:test');
const assert = require('node:assert');
const Sieben = require('../server/games/sieben');

function fakeLobby(n, game = {}) {
  const players = new Map();
  for (let i = 1; i <= n; i++) players.set(`p${i}`, { id: `p${i}`, name: `Spieler ${i}`, connected: true, isHost: i === 1 });
  return {
    hostId: 'p1',
    players,
    settings: { game: { ...Sieben.defaultSettings(), orderMode: 'manual', order: [...players.keys()], ...game } },
    activePlayers: () => [...players.values()].filter((p) => p.connected),
    broadcast() {},
  };
}

let cardNo = 0;
const num = (value) => ({ id: `t${cardNo++}`, kind: 'number', value });
const card = (kind, value = null) => ({ id: `t${cardNo++}`, kind, value });

// Startet eine Runde, in der die Karten in genau dieser Reihenfolge gezogen werden
function setup(n, draws, game = {}) {
  const lobby = fakeLobby(n, game);
  const g = new Sieben(lobby);
  g.start();
  g.hands = new Map();
  g.roundNo = 0;
  g.discard = [];
  g.deck = [...Array.from({ length: 40 }, () => num(0)), ...[...draws].reverse()];
  g.startRound();
  return { lobby, game: g, p: (i) => lobby.players.get(`p${i}`) };
}

const values = (g, id) => g.hand(id).numbers.map((c) => c.value);

test('Kartenstapel hat 94 Karten in der richtigen Verteilung', () => {
  const deck = Sieben.buildDeck();
  assert.strictEqual(deck.length, 94);
  const count = (kind, value) => deck.filter((c) => c.kind === kind && (value === undefined || c.value === value)).length;
  assert.strictEqual(count('number', 0), 1);
  assert.strictEqual(count('number', 12), 12);
  assert.strictEqual(count('number', 7), 7);
  assert.strictEqual(count('number'), 79);
  assert.strictEqual(count('plus'), 5);
  assert.strictEqual(count('times'), 1);
  for (const kind of ['freeze', 'flip3', 'chance']) assert.strictEqual(count(kind), 3);
  assert.strictEqual(new Set(deck.map((c) => c.id)).size, 94);
});

test('Wertung: ×2 nur auf die Zahlen, dann Plus, dann Bonus', () => {
  const hand = { status: 'stayed', numbers: [num(3), num(5), num(7)], mods: [card('times', 2), card('plus', 4)] };
  assert.strictEqual(Sieben.handScore(hand), 34);
  assert.strictEqual(Sieben.handScore({ ...hand, status: 'seven' }), 49);
  assert.strictEqual(Sieben.handScore({ ...hand, status: 'bust' }), 0);
});

test('Austeilen ab dem Spieler nach dem Geber, dann reihum ziehen oder stoppen', () => {
  const { game, p } = setup(3, [num(1), num(2), num(3), num(4), num(2)]);
  assert.strictEqual(game.dealerId, 'p1');
  assert.deepStrictEqual(values(game, 'p2'), [1]);
  assert.deepStrictEqual(values(game, 'p3'), [2]);
  assert.deepStrictEqual(values(game, 'p1'), [3]);
  assert.strictEqual(game.turnId, 'p2');
  assert.ok(game.action(p(3), { type: 'hit' }).error, 'nur wer dran ist');
  assert.deepStrictEqual(game.action(p(2), { type: 'hit' }), { ok: true });
  assert.deepStrictEqual(values(game, 'p2'), [1, 4]);
  assert.strictEqual(game.turnId, 'p3');
  game.action(p(3), { type: 'hit' });
  assert.strictEqual(game.hand('p3').status, 'bust', 'doppelte 2');
  assert.strictEqual(game.turnId, 'p1');
  game.action(p(1), { type: 'stay' });
  assert.strictEqual(game.hand('p1').status, 'stayed');
  assert.strictEqual(game.turnId, 'p2', 'nur p2 ist noch aktiv');
  game.action(p(2), { type: 'stay' });
  assert.strictEqual(game.phase, 'roundEnd');
  assert.deepStrictEqual(game.lastScores, { p1: 3, p2: 5, p3: 0 });
  assert.deepStrictEqual(game.totals, { p1: 3, p2: 5, p3: 0 });
});

test('Zweite Chance rettet einmal vor der doppelten Zahl', () => {
  const { game, p } = setup(2, [num(5), num(6), card('chance'), num(1), num(5), num(6)]);
  // p2 bekommt 5, p1 6; p2 zieht die Zweite Chance
  game.action(p(2), { type: 'hit' });
  assert.ok(game.hand('p2').chance);
  game.action(p(1), { type: 'hit' });
  game.action(p(2), { type: 'hit' });
  assert.strictEqual(game.hand('p2').status, 'active', 'gerettet');
  assert.strictEqual(game.hand('p2').chance, null);
  assert.deepStrictEqual(values(game, 'p2'), [5]);
  game.action(p(1), { type: 'hit' });
  assert.strictEqual(game.hand('p1').status, 'bust', 'ohne Zweite Chance raus');
});

test('Zweite Chance doppelt: muss an einen anderen ohne Zweite Chance gehen', () => {
  const { game, p } = setup(3, [card('chance'), num(2), num(3), card('chance')]);
  assert.ok(game.hand('p2').chance);
  game.action(p(2), { type: 'hit' });
  assert.deepStrictEqual(game.pending.targets, ['p1', 'p3']);
  assert.ok(game.action(p(1), { type: 'target', playerId: 'p3' }).error, 'nur wer gezogen hat');
  assert.ok(game.action(p(2), { type: 'target', playerId: 'p2' }).error, 'nicht an sich selbst');
  game.action(p(2), { type: 'target', playerId: 'p1' });
  assert.ok(game.hand('p1').chance);
  assert.strictEqual(game.turnId, 'p3');
});

test('Einfrieren sichert die Punkte des Ziels', () => {
  const { game, p } = setup(3, [num(1), num(8), num(3), card('freeze')]);
  game.action(p(2), { type: 'hit' });
  assert.strictEqual(game.pending.card.kind, 'freeze');
  assert.ok(game.action(p(2), { type: 'hit' }).error, 'erst das Ziel wählen');
  game.action(p(2), { type: 'target', playerId: 'p3' });
  assert.strictEqual(game.hand('p3').status, 'frozen');
  assert.strictEqual(game.turnId, 'p1', 'p3 ist übersprungen');
});

test('Drei auf einmal: Aktionskarten werden erst danach gespielt', () => {
  const { game, p } = setup(3, [num(1), num(2), num(3), card('flip3'), num(4), card('freeze'), num(5)]);
  game.action(p(2), { type: 'hit' });
  game.action(p(2), { type: 'target', playerId: 'p3' });
  assert.deepStrictEqual(values(game, 'p3'), [2, 4, 5]);
  assert.strictEqual(game.pending.card.kind, 'freeze');
  assert.strictEqual(game.pending.pid, 'p3');
  game.action(p(3), { type: 'target', playerId: 'p3' });
  assert.strictEqual(game.hand('p3').status, 'frozen');
  assert.strictEqual(game.turnId, 'p1');
});

test('Drei auf einmal endet bei einer doppelten Zahl, beiseitegelegte Karten verfallen', () => {
  const { game, p } = setup(2, [num(1), num(2), card('flip3'), card('freeze'), num(1)]);
  game.action(p(2), { type: 'hit' });
  game.action(p(2), { type: 'target', playerId: 'p2' });
  assert.strictEqual(game.hand('p2').status, 'bust');
  assert.strictEqual(game.pending, null);
  assert.strictEqual(game.turnId, 'p1');
});

test('Nur ein aktiver Spieler: Aktionskarte trifft ihn automatisch', () => {
  const { game, p } = setup(2, [num(1), num(2), num(4), num(2), card('freeze')]);
  game.action(p(2), { type: 'hit' });
  game.action(p(1), { type: 'hit' });
  assert.strictEqual(game.hand('p1').status, 'bust');
  game.action(p(2), { type: 'hit' });
  assert.strictEqual(game.hand('p2').status, 'frozen');
  assert.strictEqual(game.phase, 'roundEnd');
  assert.strictEqual(game.lastScores.p2, 5);
});

test('Sieben verschiedene Zahlen beenden die Runde mit Bonus', () => {
  const { game, p } = setup(2, [num(1), num(9), num(2), num(10), num(3), num(11), num(4), num(12), num(5), card('plus', 4), num(6), card('times', 2), num(7)]);
  for (let i = 0; i < 11; i++) game.action(p(game.turnId === 'p1' ? 1 : 2), { type: 'hit' });
  assert.strictEqual(game.phase, 'roundEnd');
  assert.strictEqual(game.hand('p2').status, 'seven');
  assert.strictEqual(game.lastScores.p2, 28 + 15);
  assert.strictEqual(game.lastScores.p1, (9 + 10 + 11 + 12) * 2 + 4);
});

test('Spielende erst ohne Gleichstand an der Spitze', () => {
  const { game, p } = setup(2, [num(4), num(4)], { target: 100 });
  game.totals = { p1: 96, p2: 96 };
  game.action(p(2), { type: 'stay' });
  game.action(p(1), { type: 'stay' });
  assert.strictEqual(game.phase, 'roundEnd', 'Gleichstand bei 100');
  game.next();
  assert.strictEqual(game.roundNo, 2);
  assert.strictEqual(game.dealerId, 'p2', 'Geber wechselt');
  game.hands.get('p1').numbers.push(num(9));
  game.action(p(game.turnId === 'p1' ? 1 : 2), { type: 'stay' });
  game.action(p(game.turnId === 'p1' ? 1 : 2), { type: 'stay' });
  assert.strictEqual(game.phase, 'final');
});

test('Wer die Verbindung verliert, stoppt automatisch; neue Spieler warten auf die nächste Runde', () => {
  const { game, lobby } = setup(3, [num(1), num(2), num(3)]);
  assert.strictEqual(game.turnId, 'p2');
  lobby.players.get('p2').connected = false;
  lobby.players.set('p4', { id: 'p4', name: 'Neu', connected: true });
  game.playersChanged();
  assert.strictEqual(game.hand('p2').status, 'stayed');
  assert.strictEqual(game.hand('p4').status, 'out');
  assert.strictEqual(game.turnId, 'p3');
});

test('Mitspieler am selben Gerät: das Gerät zieht für seinen Gast', () => {
  const { game, lobby } = setup(2, [num(1), num(2), num(3)]);
  lobby.players.get('p2').guestOf = 'p1';
  assert.deepStrictEqual(game.action(lobby.players.get('p1'), { type: 'hit' }), { ok: true });
  assert.deepStrictEqual(values(game, 'p2'), [1, 3]);
});

test('Zufallspartien: keine Karte geht verloren, jede Partie endet', () => {
  for (let run = 0; run < 300; run++) {
    const n = 2 + (run % 11);
    const lobby = fakeLobby(n);
    const g = new Sieben(lobby);
    g.start();
    let moves = 0;
    while (g.phase !== 'final') {
      assert.ok(moves++ < 20000, 'Partie endet');
      if (g.phase === 'roundEnd') {
        g.next();
        continue;
      }
      if (g.pending) {
        const t = g.pending.targets[Math.floor(Math.random() * g.pending.targets.length)];
        assert.deepStrictEqual(g.action(lobby.players.get(g.pending.pid), { type: 'target', playerId: t }), { ok: true });
      } else {
        const type = Math.random() < 0.7 ? 'hit' : 'stay';
        assert.deepStrictEqual(g.action(lobby.players.get(g.turnId), { type }), { ok: true });
      }
      const inHands = [...g.hands.values()].flatMap(Sieben.handCards);
      const inTasks = g.tasks.flatMap((t) => [t.card, ...(t.aside || [])]).filter(Boolean);
      const all = [...g.deck, ...g.discard, ...inHands, ...inTasks, ...(g.pending ? [g.pending.card] : [])];
      assert.strictEqual(all.length, 94);
      assert.strictEqual(new Set(all.map((c) => c.id)).size, 94);
    }
    const best = Math.max(...Object.values(g.totals));
    assert.ok(best >= 200);
    assert.strictEqual(Object.values(g.totals).filter((t) => t === best).length, 1);
  }
});
