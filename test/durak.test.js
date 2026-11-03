// Regeltests für Durak: node --test

const test = require('node:test');
const assert = require('node:assert');
const Durak = require('../server/games/durak');

function setup(n, game = {}) {
  const players = new Map();
  for (let i = 1; i <= n; i++) players.set(`p${i}`, { id: `p${i}`, name: `Spieler ${i}`, connected: true, isHost: i === 1 });
  const lobby = {
    hostId: 'p1',
    players,
    settings: { hostPlays: true, game: { ...Durak.defaultSettings(), ...game } },
    activePlayers: () => [...players.values()].filter((p) => p.connected),
    broadcast() {},
  };
  const g = new Durak(lobby);
  g.start();
  return { lobby, g, p: (i) => players.get(`p${i}`) };
}

// Legt Sitzordnung, Hände, Trumpf und Stapel fest; p1 greift p2 an
function deal(g, hands, { trump = 'H', talon = [], firstBout = false } = {}) {
  g.seats = Object.keys(hands);
  g.order = [...g.seats];
  g.hands = Object.fromEntries(Object.entries(hands).map(([id, h]) => [id, [...h]]));
  g.trump = trump;
  g.trumpCard = talon[talon.length - 1] || `${trump}6`;
  g.talon = [...talon];
  g.out = [];
  g.discard = 0;
  g.firstBout = firstBout;
  g.phase = 'play';
  g.startBout(g.seats[0]);
}

const ok = { ok: true };

test('Schlagen: höher in derselben Farbe oder Trumpf gegen Nicht-Trumpf', () => {
  const { beats } = Durak;
  assert.ok(beats('C10', 'C9', 'H'));
  assert.ok(!beats('C9', 'C10', 'H'));
  assert.ok(!beats('S14', 'C6', 'H'));
  assert.ok(beats('H6', 'C14', 'H'));
  assert.ok(!beats('C14', 'H6', 'H'));
  assert.ok(beats('H7', 'H6', 'H'));
  assert.strictEqual(Durak.makeDeck(36).length, 36);
  assert.strictEqual(Durak.makeDeck(52).length, 52);
});

test('Austeilen: sechs Karten pro Spieler, aufgedeckter Trumpf liegt unten im Stapel', () => {
  const { g, p } = setup(4);
  for (const id of g.seats) assert.strictEqual(g.hands[id].length, 6);
  assert.strictEqual(g.talon.length, 12);
  assert.strictEqual(g.talon[g.talon.length - 1], g.trumpCard);
  assert.strictEqual(g.trump, g.trumpCard[0]);
  assert.strictEqual(g.defenderId, g.nextIn(g.attackerId));
  // Fremde Karten sieht keiner
  const other = g.seats.find((id) => id !== 'p1');
  const json = JSON.stringify(g.view(p(1)));
  for (const c of g.hands[other]) assert.ok(!json.includes(`"${c}"`) || g.hands.p1.includes(c) || c === g.trumpCard);
});

test('Mit 36 Karten höchstens sechs Spieler, mit 52 bis zu acht', () => {
  assert.throws(() => setup(7), /52 Karten/);
  const { g } = setup(8, { deckSize: 52 });
  assert.strictEqual(g.talon.length, 4);
});

test('Erste Partie: wer den niedrigsten Trumpf hat, greift an', () => {
  for (let k = 0; k < 20; k++) {
    const { g } = setup(3);
    const trumps = g.seats.flatMap((id) => g.hands[id].filter((c) => c[0] === g.trump).map((c) => ({ id, r: Number(c.slice(1)) })));
    if (!trumps.length) continue;
    const low = trumps.sort((a, b) => a.r - b.r)[0];
    assert.strictEqual(g.attackerId, low.id);
  }
});

test('Angriff, Verteidigung, Nachlegen und Bito', () => {
  const { g, p } = setup(3);
  deal(g, { p1: ['C9', 'S9', 'D7'], p2: ['C10', 'H6', 'S6'], p3: ['D10', 'C7', 'S7'] });
  assert.match(g.action(p(3), { type: 'attack', card: 'D10' }).error, /erste Karte/);
  assert.match(g.action(p(2), { type: 'attack', card: 'C10' }).error, /verteidigst/);
  assert.deepStrictEqual(g.action(p(1), { type: 'attack', card: 'C9' }), ok);
  assert.match(g.action(p(2), { type: 'defend', card: 'S6', index: 0 }).error, /schlägt/);
  assert.deepStrictEqual(g.action(p(2), { type: 'defend', card: 'C10', index: 0 }), ok);
  // Nachlegen nur mit Werten vom Tisch (9 und 10)
  assert.match(g.action(p(3), { type: 'attack', card: 'C7' }).error, /Werte/);
  assert.deepStrictEqual(g.action(p(3), { type: 'attack', card: 'D10' }), ok);
  assert.deepStrictEqual(g.action(p(2), { type: 'defend', card: 'H6', index: 1 }), ok);
  assert.strictEqual(g.table.length, 2);
  // p1 kann noch die 9 nachlegen, p3 nichts mehr: erst wenn p1 fertig sagt, ist der Angriff vorbei
  assert.deepStrictEqual(g.waitingAttackers(), ['p1']);
  assert.deepStrictEqual(g.action(p(1), { type: 'pass' }), ok);
  assert.strictEqual(g.table.length, 0);
  assert.strictEqual(g.discard, 4);
  // Wer alles geschlagen hat, greift an
  assert.strictEqual(g.attackerId, 'p2');
  assert.strictEqual(g.defenderId, 'p3');
});

test('Aufnehmen: Angreifer dürfen noch nachlegen, dann ist der Verteidiger übersprungen', () => {
  const { g, p } = setup(3);
  deal(g, { p1: ['C9', 'S9', 'D7'], p2: ['C6', 'H7', 'S6'], p3: ['D9', 'C7', 'S7'] });
  g.action(p(1), { type: 'attack', card: 'C9' });
  assert.deepStrictEqual(g.action(p(2), { type: 'take' }), ok);
  assert.ok(g.taking);
  assert.deepStrictEqual(g.action(p(3), { type: 'attack', card: 'D9' }), ok);
  g.action(p(3), { type: 'pass' });
  assert.strictEqual(g.table.length, 2);
  g.action(p(1), { type: 'pass' });
  assert.strictEqual(g.table.length, 0);
  assert.deepStrictEqual(g.hands.p2.sort(), ['C6', 'C9', 'D9', 'H7', 'S6'].sort());
  assert.strictEqual(g.attackerId, 'p3');
  assert.strictEqual(g.defenderId, 'p1');
});

test('Nicht mehr Karten als der Verteidiger hat, im ersten Angriff höchstens fünf', () => {
  const { g, p } = setup(2);
  deal(g, { p1: ['C9', 'S9', 'D9'], p2: ['H14', 'H13'] }, { trump: 'H' });
  g.action(p(1), { type: 'attack', card: 'C9' });
  g.action(p(1), { type: 'attack', card: 'S9' });
  assert.match(g.action(p(1), { type: 'attack', card: 'D9' }).error, /nicht mehr Karten/);

  const t = setup(2);
  deal(t.g, { p1: ['C9', 'S9', 'D9', 'H9', 'C10', 'S10'], p2: ['H14', 'H13', 'H12', 'H10', 'H8', 'H7'] }, { trump: 'H', firstBout: true });
  t.g.action(t.p(1), { type: 'attack', card: 'C9' });
  for (const c of ['S9', 'D9', 'H9']) assert.deepStrictEqual(t.g.action(t.p(1), { type: 'attack', card: c }), ok);
  t.g.action(t.p(2), { type: 'defend', card: 'H14', index: 0 });
  t.g.action(t.p(2), { type: 'defend', card: 'H13', index: 1 });
  t.g.action(t.p(2), { type: 'defend', card: 'H12', index: 2 });
  t.g.action(t.p(2), { type: 'defend', card: 'H10', index: 3 });
  assert.deepStrictEqual(t.g.action(t.p(1), { type: 'attack', card: 'C10' }), ok);
  assert.match(t.g.action(t.p(1), { type: 'attack', card: 'S10' }).error, /Mehr als 5/);
});

test('Nachziehen: Angreifer zuerst, Verteidiger zuletzt', () => {
  const { g, p } = setup(3);
  deal(g, { p1: ['C9'], p2: ['C10'], p3: ['D6'] }, { talon: ['S6', 'S7', 'S8', 'S9', 'S10', 'S11', 'S12', 'S13', 'S14', 'D7', 'D8', 'D9', 'D10', 'H6'] });
  g.action(p(1), { type: 'attack', card: 'C9' });
  g.action(p(2), { type: 'defend', card: 'C10', index: 0 });
  // p3 kann nichts nachlegen, der Angriff ist sofort vorbei
  assert.strictEqual(g.table.length, 0);
  assert.deepStrictEqual(g.hands.p1, ['S6', 'S7', 'S8', 'S9', 'S10', 'S11']);
  assert.deepStrictEqual(g.hands.p3, ['D6', 'S12', 'S13', 'S14', 'D7', 'D8']);
  assert.deepStrictEqual(g.hands.p2, ['D9', 'D10', 'H6']);
  assert.strictEqual(g.talon.length, 0);
});

test('Wer zuletzt Karten hat, ist der Durak und muss in der nächsten Partie zuerst verteidigen', () => {
  const { g, p } = setup(2, { partien: 2 });
  deal(g, { p1: ['C9'], p2: ['C6', 'D6'] });
  g.action(p(1), { type: 'attack', card: 'C9' });
  g.action(p(2), { type: 'take' });
  assert.strictEqual(g.phase, 'over');
  assert.strictEqual(g.durakId, 'p2');
  assert.strictEqual(g.scores.p2, 1);
  assert.deepStrictEqual(g.view(p(1)).ranking, ['p1', 'p2']);
  assert.ok(g.action(p(2), { type: 'nextPartie' }).error);
  assert.deepStrictEqual(g.action(p(1), { type: 'nextPartie' }), ok);
  assert.strictEqual(g.defenderId, 'p2');
  // Letzte Partie: danach ist das Spiel aus
  deal(g, { p1: ['C9'], p2: ['C10'] });
  g.action(p(1), { type: 'attack', card: 'C9' });
  g.action(p(2), { type: 'defend', card: 'C10', index: 0 });
  assert.strictEqual(g.phase, 'final');
  assert.strictEqual(g.durakId, null);
});

test('Weiterschieben mit gleichem Wert, nur wenn eingestellt', () => {
  const { g, p } = setup(3);
  deal(g, { p1: ['C9', 'D6'], p2: ['S9', 'C6'], p3: ['D7', 'C7', 'S7'] });
  g.action(p(1), { type: 'attack', card: 'C9' });
  assert.match(g.action(p(2), { type: 'transfer', card: 'S9' }).error, /geht gerade nicht/);
  g.settings.transfer = true;
  assert.ok(g.view(p(2)).moves.find((m) => m.card === 'S9').transfer);
  assert.deepStrictEqual(g.action(p(2), { type: 'transfer', card: 'S9' }), ok);
  assert.strictEqual(g.attackerId, 'p2');
  assert.strictEqual(g.defenderId, 'p3');
  assert.strictEqual(g.table.length, 2);
});

test('Wer nicht verbunden ist, nimmt auf oder ist fertig, die Zeit spielt die billigste Karte', () => {
  const { g, p } = setup(3);
  deal(g, { p1: ['H6', 'C9', 'S10'], p2: ['C10', 'H8'], p3: ['D10', 'C7'] });
  g.action(p(1), { type: 'force' });
  assert.strictEqual(g.table[0].a, 'C9');
  p(2).connected = false;
  g.playersChanged();
  assert.strictEqual(g.table.length, 0);
  assert.ok(g.hands.p2.includes('C9'));
});

test('Zufällige Partien laufen bis zum Ende, keine Karte geht verloren', () => {
  for (let run = 0; run < 200; run++) {
    const n = 2 + (run % 5);
    const { g, p } = setup(n, { transfer: run % 2 === 0, partien: 1, deckSize: run % 3 ? 36 : 52 });
    const total = g.settings.deckSize;
    for (let step = 0; step < 2000 && g.phase === 'play'; step++) {
      const options = [];
      for (const id of g.inIds()) {
        const v = g.view(p(Number(id.slice(1))));
        for (const m of v.moves) {
          if (m.attack) options.push([id, { type: 'attack', card: m.card }]);
          for (const i of m.defend) options.push([id, { type: 'defend', card: m.card, index: i }]);
          if (m.transfer) options.push([id, { type: 'transfer', card: m.card }]);
        }
        if (v.canTake) options.push([id, { type: 'take' }]);
        if (v.canPass) options.push([id, { type: 'pass' }]);
      }
      assert.ok(options.length, 'Es muss immer einen Zug geben');
      const [id, move] = options[Math.floor(Math.random() * options.length)];
      assert.deepStrictEqual(g.action(p(Number(id.slice(1))), move), ok);
      const onTable = g.table.reduce((s, t) => s + (t.d ? 2 : 1), 0);
      const inHands = g.seats.reduce((s, x) => s + g.hands[x].length, 0);
      assert.strictEqual(inHands + onTable + g.talon.length + g.discard, total);
    }
    assert.notStrictEqual(g.phase, 'play');
  }
});
