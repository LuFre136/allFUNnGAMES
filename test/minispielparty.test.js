// Tests für die Minispiel Party: node --test

const test = require('node:test');
const assert = require('node:assert');
const MinispielParty = require('../server/games/minispielparty');
const minigames = require('../server/games/minispielparty/minigames');

function setup(n, game = {}) {
  const players = new Map();
  for (let i = 1; i <= n; i++) players.set(`p${i}`, { id: `p${i}`, name: `Spieler ${i}`, connected: true, isHost: i === 1 });
  const lobby = {
    hostId: 'p1',
    players,
    settings: { hostPlays: true, game: { ...MinispielParty.defaultSettings(), ...game } },
    activePlayers: () => [...players.values()].filter((p) => p.connected),
    broadcast() {},
    send() {},
  };
  const g = new MinispielParty(lobby);
  g.start();
  return { lobby, g, p: (i) => players.get(`p${i}`) };
}

// Startet das Minispiel `id` sofort und spult die Uhr bis zum Start vor
function play(t, n, id, game = {}) {
  const s = setup(n, { games: [id], count: 3, ...game });
  for (let i = 1; i <= n; i++) s.g.action(s.p(i), { type: 'ready' });
  assert.strictEqual(s.g.phase, 'play');
  assert.strictEqual(s.g.current.id, id);
  t.mock.timers.tick(3600);
  const move = (i, m) => s.g.action(s.p(i), { type: 'move', move: m });
  return { ...s, move };
}

test.beforeEach((t) => t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 }));

test('Punkte: so viele wie Spieler hinter einem, oder 3/2/1', () => {
  const { pointsFor } = MinispielParty;
  assert.deepStrictEqual([1, 2, 3, 4, 5, 6].map((place) => pointsFor('behind', place, 1, 6)), [5, 4, 3, 2, 1, 0]);
  // Zwei Erste: beide bekommen die Punkte für die vier dahinter
  assert.strictEqual(pointsFor('behind', 1, 2, 6), 4);
  assert.deepStrictEqual([1, 2, 3, 4].map((place) => pointsFor('top3', place, 1, 6)), [3, 2, 1, 0]);
});

test('Reihenfolge: jedes Minispiel erst wieder, wenn alle dran waren, nie zweimal hintereinander', () => {
  const { g } = setup(3, { count: 16 });
  assert.strictEqual(g.playlist.length, 16);
  assert.strictEqual(new Set(g.playlist.slice(0, 9)).size, 9);
  for (let i = 1; i < g.playlist.length; i++) assert.notStrictEqual(g.playlist[i], g.playlist[i - 1]);
  g.dispose();
});

test('Ablauf: Bereit → Countdown → Minispiel → Ergebnis → nächstes → Siegerehrung', (t) => {
  const { g, p, move } = play(t, 3, 'stoppuhr', { games: ['stoppuhr'], count: 3 });
  move(1, { type: 'stop', ms: 10010 });
  move(2, { type: 'stop', ms: 9500 });
  move(3, { type: 'stop', ms: 13000 });
  assert.strictEqual(g.phase, 'result');
  const last = g.view(p(1)).last;
  assert.deepStrictEqual(last.groups.map((x) => x.ids), [['p1'], ['p2'], ['p3']]);
  assert.deepStrictEqual(last.groups.map((x) => x.points), [2, 1, 0]);
  assert.ok(g.action(p(2), { type: 'next' }).error, 'nur der Host darf weiter');
  g.action(p(1), { type: 'next' });
  assert.strictEqual(g.phase, 'intro');
  g.action(p(1), { type: 'skip' });
  g.action(p(1), { type: 'skip' });
  assert.strictEqual(g.phase, 'final');
  assert.strictEqual(g.view(p(1)).standings[0].id, 'p1');
  g.dispose();
});

test('Ohne „Bereit!“ geht es nach 30 Sekunden trotzdem los', (t) => {
  const { g } = setup(3);
  t.mock.timers.tick(30001);
  assert.strictEqual(g.phase, 'play');
  g.dispose();
});

test('Letztes Minispiel doppelt', (t) => {
  const { g, p, move } = play(t, 2, 'stoppuhr', { count: 3, doubleLast: true });
  g.action(p(1), { type: 'skip' });
  g.action(p(1), { type: 'skip' });
  assert.strictEqual(g.index, 2);
  g.action(p(1), { type: 'next' });
  assert.ok(g.view(p(1)).double);
  t.mock.timers.tick(3600);
  move(1, { type: 'stop', ms: 10000 });
  move(2, { type: 'stop', ms: 12000 });
  assert.strictEqual(g.totals.get('p1'), 2);
  g.dispose();
});

test('Schnellzieher: Zeiten addieren, zu früh gibt Strafe, Ergebnisse erst nach dem Durchgang', (t) => {
  const { g, p, move } = play(t, 2, 'schnellzieher');
  t.mock.timers.tick(1000);
  move(1, { type: 'react', round: 0, ms: 250 });
  assert.strictEqual(g.view(p(2)).game.shown[0], null);
  move(2, { type: 'react', round: 0, early: true });
  assert.ok(g.view(p(2)).game.shown[0], 'alle haben getippt');
  for (const r of [1, 2]) {
    t.mock.timers.tick(7000);
    move(1, { type: 'react', round: r, ms: 300 });
    move(2, { type: 'react', round: r, ms: 50 }); // unter 100 ms: geraten
  }
  assert.strictEqual(g.phase, 'result');
  const groups = g.view(p(1)).last.groups;
  assert.deepStrictEqual(groups.map((x) => x.ids), [['p1'], ['p2']]);
  assert.match(groups[1].label, /3× zu früh/);
  assert.deepStrictEqual(g.fastest, { id: 'p1', ms: 250 });
  g.dispose();
});

test('Seilhüpfer: Wer zuletzt rausfliegt, gewinnt; gleichzeitige Ausfälle teilen sich den Platz', (t) => {
  const { g, p, move } = play(t, 4, 'seilhuepfer');
  t.mock.timers.tick(15000);
  move(1, { type: 'out', jumps: 3 });
  move(2, { type: 'out', jumps: 7 });
  move(3, { type: 'out', jumps: 7 });
  assert.strictEqual(g.phase, 'play', 'wartet kurz auf gleichzeitige Ausfälle');
  t.mock.timers.tick(1300);
  assert.strictEqual(g.phase, 'result');
  assert.deepStrictEqual(g.view(p(1)).last.groups.map((x) => x.ids), [['p4'], ['p2', 'p3'], ['p1']]);
  g.dispose();
});

test('Seilhüpfer: mehr Sprünge als schon geschwungen gehen nicht', (t) => {
  const { g, p, move } = play(t, 2, 'seilhuepfer');
  move(1, { type: 'out', jumps: 50 });
  t.mock.timers.tick(1300);
  const groups = g.view(p(1)).last.groups;
  assert.deepStrictEqual(groups.map((x) => x.ids), [['p2'], ['p1']]);
  assert.match(groups[1].label, /^0 Sprünge/);
  g.dispose();
});

test('Farbfolge: längste Folge gewinnt, Runden nur der Reihe nach', (t) => {
  const { g, p, move } = play(t, 3, 'farbfolge');
  assert.ok(move(1, { type: 'level', level: 2 }).error);
  move(1, { type: 'level', level: 1 });
  move(1, { type: 'level', level: 2 });
  move(2, { type: 'level', level: 1 });
  t.mock.timers.tick(1000);
  move(3, { type: 'level', level: 1 });
  for (const i of [1, 2, 3]) move(i, { type: 'out' });
  assert.strictEqual(g.phase, 'result');
  assert.deepStrictEqual(g.view(p(1)).last.groups.map((x) => x.ids), [['p1'], ['p2'], ['p3']]);
  g.dispose();
});

test('Zählfieber: erst nach dem Zählen abgeben, nächste Zahl gewinnt', (t) => {
  const { g, p, move } = play(t, 3, 'zaehlfieber');
  const right = g.instance.view(p(1)).critters.filter((c) => c.e === g.instance.view(p(1)).target.emoji).length;
  assert.ok(move(1, { type: 'answer', value: right }).error);
  t.mock.timers.tick(13000);
  move(1, { type: 'answer', value: right + 2 });
  move(2, { type: 'answer', value: right });
  move(3, { type: 'answer', value: Math.max(0, right - 2) });
  assert.strictEqual(g.phase, 'result');
  const last = g.view(p(1)).last;
  assert.deepStrictEqual(last.groups.map((x) => x.ids), [['p2'], ['p1', 'p3']]);
  assert.match(last.info, new RegExp(`Es waren ${right} `));
  g.dispose();
});

test('Ballonpumpe: Pumpen ist gedeckelt, wer zuerst platzen lässt, gewinnt', (t) => {
  const { g, p } = play(t, 2, 'ballonpumpe');
  g.draw(p(1), { op: 'pump', n: 50 });
  assert.ok(g.instance.view(p(1)).pumps.p1 <= 4, 'nicht schneller als ein Stoß alle 80 ms');
  t.mock.timers.tick(5000);
  g.draw(p(1), { op: 'pump', n: 50 });
  g.draw(p(2), { op: 'pump', n: 20 });
  t.mock.timers.tick(11000);
  assert.strictEqual(g.phase, 'result');
  const groups = g.view(p(1)).last.groups;
  assert.deepStrictEqual(groups.map((x) => x.ids), [['p1'], ['p2']]);
  assert.match(groups[0].label, /💥/);
  g.dispose();
});

test('Heiße Kartoffel: Weitergeben, nicht direkt zurück, Explosion scheidet aus', (t) => {
  const { g, p, move } = play(t, 3, 'kartoffel');
  t.mock.timers.tick(700);
  let v = g.instance.view(p(1));
  assert.strictEqual(v.state, 'live');
  const holder = Number(v.holder.slice(1));
  const other = [1, 2, 3].find((i) => i !== holder);
  const third = [1, 2, 3].find((i) => i !== holder && i !== other);
  assert.ok(move(holder, { type: 'pass', to: `p${other}` }).error, 'erst kurz halten');
  t.mock.timers.tick(400);
  assert.ok(move(other, { type: 'pass', to: `p${holder}` }).error, 'hat sie nicht');
  move(holder, { type: 'pass', to: `p${other}` });
  t.mock.timers.tick(400);
  assert.ok(move(other, { type: 'pass', to: `p${holder}` }).error, 'nicht direkt zurück');
  move(other, { type: 'pass', to: `p${third}` });
  t.mock.timers.tick(12000);
  v = g.instance?.view(p(1));
  assert.ok(!v || v.alive.length <= 2);
  for (let i = 0; i < 60 && g.phase === 'play'; i++) t.mock.timers.tick(1000);
  assert.strictEqual(g.phase, 'result');
  const groups = g.view(p(1)).last.groups;
  assert.strictEqual(groups.length, 3);
  assert.strictEqual(groups[0].ids.length, 1);
  g.dispose();
});

test('Glückstür: Falle scheidet aus, wählen alle die Falle, passiert nichts', (t) => {
  const { g, p, move } = play(t, 3, 'glueckstuer');
  const inst = () => g.instance;
  const trapDoor = () => inst().view(p(1)).doors && null;
  assert.strictEqual(trapDoor(), null);
  // Falle herausfinden: über die Runde hinweg alle auf dieselbe Tür, dann ansehen
  for (const i of [1, 2, 3]) move(i, { type: 'choose', door: 0 });
  const last = inst().view(p(1)).last;
  if (last.traps.includes(0)) {
    assert.ok(last.saved);
    assert.strictEqual(inst().view(p(1)).alive.length, 3);
  } else {
    assert.ok(!last.saved);
    assert.deepStrictEqual(last.out, []);
  }
  t.mock.timers.tick(4100);
  const v = inst().view(p(1));
  assert.strictEqual(v.round, 2);
  assert.strictEqual(v.state, 'choose');
  // Spieler 3 wählt nicht und bekommt nach der Zeit eine zufällige Tür
  move(1, { type: 'choose', door: 0 });
  move(2, { type: 'choose', door: 1 });
  t.mock.timers.tick(10100);
  assert.ok(g.phase === 'result' || inst().view(p(1)).last.choices.p3 !== undefined);
  g.dispose();
});

test('Phantombild: genaue Teile bringen 100 %, Teile im Korb nichts', (t) => {
  const { g, p, move } = play(t, 2, 'phantombild');
  const { target } = g.instance.view(p(1));
  move(1, { type: 'done', parts: target });
  const tray = { eyeL: { x: 10, y: 140 }, eyeR: { x: 35, y: 140 }, nose: { x: 60, y: 140 }, mouth: { x: 85, y: 140 } };
  move(2, { type: 'done', parts: tray });
  assert.strictEqual(g.phase, 'result');
  const groups = g.view(p(1)).last.groups;
  assert.deepStrictEqual(groups.map((x) => x.label), ['100 %', '0 %']);
  g.dispose();
});

test('Alle Minispiele haben Name, Symbol und Erklärung', () => {
  assert.strictEqual(minigames.list.length, 9);
  for (const m of minigames.list) {
    assert.ok(m.id && m.name && m.icon && m.short && m.howto, m.id);
  }
});

test('Wer mitten im Minispiel geht, bekommt keine Punkte, das Spiel läuft weiter', (t) => {
  const { g, p, move } = play(t, 3, 'stoppuhr');
  move(1, { type: 'stop', ms: 10000 });
  move(2, { type: 'stop', ms: 11000 });
  p(3).connected = false;
  g.playersChanged();
  assert.strictEqual(g.phase, 'result');
  const groups = g.view(p(1)).last.groups;
  assert.ok(groups[2].none);
  assert.strictEqual(groups[2].points, 0);
  g.dispose();
});

// ---------- Brettmodus ----------

// Uhr in kleinen Schritten vorspulen, damit auch Zeitgeber laufen, die erst unterwegs gestellt werden
function run(t, ms) {
  for (let left = ms; left > 0; left -= 50) t.mock.timers.tick(Math.min(50, left));
}

function brett(t, n = 3, game = {}) {
  const s = setup(n, { mode: 'brett', ...game });
  const b = s.g.board;
  b.order = [...s.lobby.players.keys()];
  b.turnIdx = 0;
  b.startTurn();
  b.rng = () => 4; // Würfel zeigt 5
  const pl = (i) => b.p.get(`p${i}`);
  const act = (i, type, data = {}) => s.g.action(s.p(i), { type, ...data });
  return { ...s, b, pl, act };
}

test('Brett: Start mit 10 Münzen, Würfel 1–10, Figur läuft und Feld zählt', (t) => {
  const { g, b, pl, act } = brett(t);
  assert.strictEqual(g.phase, 'board');
  assert.strictEqual(pl(1).coins, 10);
  b.star = 20;
  assert.ok(act(2, 'roll').error, 'nicht dran');
  act(1, 'roll');
  assert.deepStrictEqual(b.turn.dice, [5]);
  run(t, 1400 + 5 * 280 + 300);
  assert.strictEqual(pl(1).field, 5);
  assert.strictEqual(pl(1).coins, 13, 'blaues Feld +3');
  run(t, 2700);
  assert.strictEqual(b.turn.id, 'p2');
  g.dispose();
});

test('Brett: Am Stern vorbei kaufen, dann weiterlaufen', (t) => {
  const { g, b, pl, act } = brett(t);
  b.star = 3;
  pl(1).coins = 30;
  act(1, 'roll');
  run(t, 1400 + 3 * 280 + 300);
  assert.strictEqual(b.turn.step, 'choice');
  assert.strictEqual(b.turn.choice.type, 'star');
  act(1, 'choose', { value: 'yes' });
  assert.strictEqual(pl(1).stars, 1);
  assert.strictEqual(pl(1).coins, 10);
  assert.notStrictEqual(b.star, 3, 'Stern wandert weiter');
  run(t, 1500 + 2 * 280 + 300);
  assert.strictEqual(pl(1).field, 5);
  g.dispose();
});

test('Brett: Zu wenig Münzen für den Stern', (t) => {
  const { g, b, pl, act } = brett(t);
  b.star = 3;
  pl(1).coins = 5;
  act(1, 'roll');
  run(t, 1400 + 3 * 280 + 300);
  assert.notStrictEqual(b.turn.step, 'choice');
  run(t, 1600 + 2 * 280 + 300);
  assert.strictEqual(pl(1).field, 5);
  assert.strictEqual(pl(1).stars, 0);
  g.dispose();
});

test('Brett: Abzweig fragt nach der Richtung', (t) => {
  const { g, b, pl, act } = brett(t);
  b.star = 5;
  pl(1).field = 13;
  act(1, 'roll');
  run(t, 1400 + 3 * 280 + 300);
  assert.strictEqual(pl(1).field, 16);
  assert.strictEqual(b.turn.choice.type, 'fork');
  assert.deepStrictEqual(b.turn.choice.options.map((o) => o.value), [17, 32]);
  act(1, 'choose', { value: 32 });
  run(t, 2 * 280 + 300);
  assert.strictEqual(pl(1).field, 33);
  g.dispose();
});

test('Brett: Shop beim Vorbeilaufen, Doppelwürfel im nächsten Zug', (t) => {
  const { g, b, pl, act } = brett(t, 2);
  b.star = 20;
  pl(1).field = 5;
  act(1, 'roll');
  run(t, 1400 + 3 * 280 + 300);
  assert.strictEqual(b.turn.choice.type, 'shop');
  act(1, 'choose', { value: 'doppel' });
  assert.deepStrictEqual(pl(1).items, ['doppel']);
  assert.strictEqual(pl(1).coins, 4);
  run(t, 1200 + 2 * 280 + 300 + 2700);
  // Spieler 2 zieht, dann ist Spieler 1 wieder dran (nach dem Minispiel)
  assert.strictEqual(b.turn.id, 'p2');
  b.turn.id = 'p1';
  act(1, 'useItem', { item: 'doppel' });
  act(1, 'roll');
  assert.deepStrictEqual(b.turn.dice, [5, 5]);
  assert.deepStrictEqual(pl(1).items, []);
  g.dispose();
});

test('Brett: Nach der Runde ein Minispiel um Münzen, dann nächste Runde', (t) => {
  const { g, b, pl, p, act } = brett(t, 2, { games: ['stoppuhr'], rounds: 5 });
  b.star = 20;
  for (const i of [1, 2]) {
    act(i, 'roll');
    run(t, 1400 + 5 * 280 + 300 + 2700);
  }
  assert.strictEqual(g.phase, 'intro');
  g.action(p(1), { type: 'ready' });
  g.action(p(2), { type: 'ready' });
  run(t, 3600);
  const before = pl(1).coins;
  g.action(p(1), { type: 'move', move: { type: 'stop', ms: 10000 } });
  g.action(p(2), { type: 'move', move: { type: 'stop', ms: 13000 } });
  assert.strictEqual(g.phase, 'result');
  assert.strictEqual(pl(1).coins, before + 2, 'Platzpunkte mal zwei');
  g.action(p(1), { type: 'next' });
  assert.strictEqual(g.phase, 'board');
  assert.strictEqual(b.round, 2);
  g.dispose();
});

test('Brett: Duell um 5 Münzen', (t) => {
  const { g, b, pl, act } = brett(t);
  b.star = 20;
  pl(1).field = 6;
  pl(1).coins = 0; // kein Geld für den Shop unterwegs, 6 + 5 = 11 ist ein Duellfeld
  act(1, 'roll');
  run(t, 1400 + 5 * 280 + 600);
  assert.strictEqual(b.turn.choice.type, 'duel');
  act(1, 'choose', { value: 'p3' });
  run(t, 1900);
  assert.strictEqual(g.phase, 'intro');
  assert.deepStrictEqual(g.special.ids, ['p1', 'p3']);
  assert.ok(g.action(g.lobby.players.get('p2'), { type: 'ready' }).error, 'p2 schaut zu');
  g.endDuel('p1', 'p3');
  assert.strictEqual(g.phase, 'board');
  assert.strictEqual(pl(1).coins, 5);
  assert.strictEqual(pl(3).coins, 5);
  g.dispose();
});

test('Brett: Rangliste nach Sternen, dann Münzen; Bonussterne', (t) => {
  const { g, b, pl } = brett(t, 3, { bonusStars: true });
  pl(1).stars = 1; pl(1).coins = 3;
  pl(2).stars = 1; pl(2).coins = 9;
  pl(3).stars = 0; pl(3).coins = 50;
  assert.deepStrictEqual(b.standings().map((e) => e.id), ['p2', 'p1', 'p3']);
  pl(3).earned = 99;
  const bonus = b.bonusStars();
  assert.ok(bonus.some((x) => x.key === 'earned' && x.ids[0] === 'p3'));
  assert.strictEqual(pl(3).stars, 1);
  g.dispose();
});

test('Brett: Wer weg ist, setzt aus', (t) => {
  const { g, b, p } = brett(t);
  p(2).connected = false;
  b.turnIdx = 1;
  b.startTurn();
  assert.strictEqual(b.turn.step, 'effect');
  run(t, 1600);
  assert.strictEqual(b.turn.id, 'p3');
  g.dispose();
});
