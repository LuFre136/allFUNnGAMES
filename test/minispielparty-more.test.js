// Tests für die zweite Runde Minispiele: node --test

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

function run(t, ms) {
  for (let left = ms; left > 0; left -= 50) t.mock.timers.tick(Math.min(50, left));
}

// Bis zum Zeitpunkt `at` vorspulen
function until(t, at) {
  const ms = at - Date.now();
  if (ms > 0) run(t, ms);
}

function play(t, n, id, format = 'ffa', fix = {}) {
  const s = setup(n, { count: 3 });
  s.g.playlist[0] = id;
  s.g.formats[0] = format;
  s.g.toIntro();
  Object.assign(s.g.setup, fix);
  if (fix.teams) s.g.setup.teams = MinispielParty.TEAMS.map((tm, i) => ({ ...tm, ids: fix.teams[i] }));
  for (let i = 1; i <= n; i++) s.g.action(s.p(i), { type: 'ready' });
  assert.strictEqual(s.g.phase, 'play');
  t.mock.timers.tick(3600);
  const move = (i, m) => s.g.action(s.p(i), { type: 'move', move: m });
  const view = (i) => s.g.instance.view(s.p(i));
  return { ...s, move, view };
}

const pointsOf = (g, id) => g.totals.get(id);
const ids = (g) => g.history[0].groups.map((x) => x.ids);

test.beforeEach((t) => t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 }));

test('Neue Minispiele sind angemeldet und können ihre Spielarten', () => {
  const f = (id) => minigames.byId[id].formats || ['ffa'];
  assert.deepStrictEqual(f('einzelgaenger'), ['ffa']);
  assert.deepStrictEqual(f('kopfrechner'), ['ffa']);
  assert.deepStrictEqual(f('balancierer'), ['ffa']);
  assert.deepStrictEqual(f('minenfeld'), ['solo']);
  assert.deepStrictEqual(f('huetchenspiel'), ['solo']);
  assert.deepStrictEqual(f('teammemory'), ['teams']);
  assert.deepStrictEqual(f('zaehlfieber'), ['ffa', 'teams']);
});

test('Einzelgänger: genau eine Figur gibt es einmal, ein falscher Tipp kostet Zeit', (t) => {
  const { g, move, view } = play(t, 3, 'einzelgaenger');
  for (let r = 0; r < 4; r++) {
    const rd = view(1).list[r];
    assert.strictEqual(rd.index, r);
    until(t, rd.startAt);
    const count = new Map();
    for (const e of rd.cells) count.set(e, (count.get(e) || 0) + 1);
    assert.strictEqual(rd.cells.length, 25);
    assert.deepStrictEqual([...count.values()].filter((n) => n === 1).length, 1);
    const single = rd.cells.findIndex((e) => count.get(e) === 1);
    const wrong = single === 0 ? 1 : 0;
    assert.strictEqual(view(1).list[r].single, null, 'die Lösung wird erst am Ende gezeigt');
    assert.strictEqual(move(1, { type: 'tap', round: r, cell: single }).right, true);
    run(t, 500);
    assert.strictEqual(move(2, { type: 'tap', round: r, cell: wrong }).right, false);
    move(2, { type: 'tap', round: r, cell: single });
    run(t, 500);
    move(3, { type: 'tap', round: r, cell: single });
    assert.strictEqual(view(1).list[r].closed, true);
    assert.strictEqual(view(1).list[r].single, single);
  }
  run(t, 2100);
  assert.strictEqual(g.phase, 'result');
  // p2: 4 × 0,5 s + 4 × 3 s Strafe ist langsamer als p3 mit 4 × 1 s
  assert.deepStrictEqual(ids(g), [['p1'], ['p3'], ['p2']]);
  g.dispose();
});

function solve(text) {
  const [a, op, b] = text.split(' ');
  const x = Number(a);
  const y = Number(b);
  return { '+': x + y, '−': x - y, '×': x * y, ':': x / y }[op];
}

test('Kopfrechner: wer zuerst 8 richtig hat, gewinnt; falsch sperrt kurz', (t) => {
  const { g, move, view } = play(t, 3, 'kopfrechner');
  const answer = (i, right = true) => {
    const { task } = view(i);
    const value = solve(task.text);
    assert.ok(task.options.includes(value));
    assert.strictEqual(task.options.length, 4);
    return move(i, { type: 'answer', i: task.i, value: right ? value : task.options.find((v) => v !== value) });
  };
  assert.strictEqual(answer(2, false).right, false);
  assert.strictEqual(answer(2).locked, true, 'gesperrt nach einer falschen Antwort');
  run(t, 1300);
  assert.strictEqual(answer(2).right, true);
  answer(3);
  for (let k = 0; k < 8; k++) assert.strictEqual(answer(1).right, true);
  assert.strictEqual(view(1).me.done, true);
  assert.strictEqual(g.phase, 'play');
  run(t, 60000);
  assert.strictEqual(g.phase, 'result');
  // p2 und p3 haben beide 1 richtig, p3 ohne Fehler
  assert.deepStrictEqual(ids(g), [['p1'], ['p3'], ['p2']]);
  g.dispose();
});

test('Balancierer: die gemeldete Zeit ist durch die vergangene Zeit gedeckelt', (t) => {
  const { g, move, view } = play(t, 2, 'balancierer');
  run(t, 5000);
  move(1, { type: 'score', ms: 99999 });
  assert.ok(view(1).scores.p1 <= 5400, `gedeckelt: ${view(1).scores.p1}`);
  run(t, 20000);
  move(1, { type: 'score', ms: 12000, final: true });
  move(2, { type: 'score', ms: 8000, final: true });
  assert.strictEqual(g.phase, 'result');
  assert.deepStrictEqual(ids(g), [['p1'], ['p2']]);
  g.dispose();
});

test('Minenfeld: Minen sieht nur der Einzelne, wer drauftritt, ist raus', (t) => {
  const { g, move, view } = play(t, 5, 'minenfeld', 'solo', { solo: 'p1' });
  assert.ok(move(2, { type: 'mine', row: 1, col: 0 }).error);
  for (let c = 0; c < 4; c++) move(1, { type: 'mine', row: 1, col: c });
  assert.ok(move(1, { type: 'mine', row: 2, col: 4 }).error, 'nicht mehr als 4 Minen');
  assert.strictEqual(view(1).mines.length, 4);
  assert.strictEqual(view(2).mines.length, 0);
  assert.ok(move(2, { type: 'step', row: 0, col: 0 }).error, 'erst nach dem Verstecken');
  move(1, { type: 'done' });
  assert.strictEqual(view(2).phase, 'run');
  // p2 läuft am Rand vorbei und kommt durch
  for (let r = 0; r < 6; r++) move(2, { type: 'step', row: r, col: 4 });
  assert.deepStrictEqual(view(3).safe, ['p2']);
  assert.ok(move(3, { type: 'step', row: 1, col: 0 }).error, 'immer die nächste Reihe');
  move(3, { type: 'step', row: 0, col: 0 });
  assert.ok(move(3, { type: 'step', row: 1, col: 2 }).error, 'nur gerade oder schräg');
  assert.strictEqual(move(3, { type: 'step', row: 1, col: 1 }).boom, true);
  assert.deepStrictEqual(view(4).mines, [6], 'die getroffene Mine sehen jetzt alle');
  for (const i of [4, 5]) {
    move(i, { type: 'step', row: 0, col: 2 });
    move(i, { type: 'step', row: 1, col: 2 });
  }
  assert.strictEqual(g.phase, 'result');
  assert.strictEqual(g.history[0].winner, 'solo');
  assert.strictEqual(pointsOf(g, 'p1'), 4);
  g.dispose();
});

test('Hütchenspiel: die Kugel wandert mit, mindestens die Hälfte richtig gewinnt für die Gruppe', (t) => {
  const { g, move, view } = play(t, 4, 'huetchenspiel', 'solo', { solo: 'p1' });
  const round = (rights) => {
    const v = view(1);
    assert.ok(move(1, { type: 'swap', a: 0, b: 1 }).error, 'erst wird die Kugel gezeigt');
    until(t, v.showUntil);
    move(1, { type: 'swap', a: 0, b: 1 });
    move(1, { type: 'swap', a: 1, b: 2 });
    let slot = v.ball;
    for (const [a, b] of [[0, 1], [1, 2]]) slot = slot === a ? b : slot === b ? a : slot;
    assert.strictEqual(view(1).dealerSlot, slot);
    assert.strictEqual(view(2).dealerSlot, null);
    assert.ok(move(2, { type: 'guess', slot }).error, 'noch wird getauscht');
    move(1, { type: 'done' });
    const w = view(2);
    assert.strictEqual(w.state, 'guess');
    assert.ok(w.guessFrom >= w.swaps[1].at + w.swapMs - 1);
    until(t, w.guessFrom);
    [2, 3, 4].forEach((i, k) => move(i, { type: 'guess', slot: k < rights ? slot : (slot + 1) % 3 }));
    assert.strictEqual(view(2).state, 'reveal');
    run(t, 3100);
  };
  round(2);
  assert.strictEqual(view(2).round, 2);
  round(0);
  assert.strictEqual(g.phase, 'result');
  assert.strictEqual(g.history[0].winner, 'solo', '2 von 6 richtig reicht nicht');
  g.dispose();
});

test('Team-Memory: der Reihe nach aufdecken, wer zuerst alle Paare hat, gewinnt', (t) => {
  const { g, move, view } = play(t, 4, 'teammemory', 'teams', { teams: [['p1', 'p2'], ['p3', 'p4']] });
  const num = (id) => Number(id.slice(1));
  const flip = (team, card) => move(num(view(1).teams[team].whose), { type: 'flip', card });
  assert.ok(move(2, { type: 'flip', card: 0 }).error || move(1, { type: 'flip', card: 0 }).error, 'nur wer dran ist');
  // Erst deckt Team Blau alles einmal auf und merkt sich die Karten
  run(t, 8100);
  const faces = {};
  for (let k = 0; k < 16; k += 2) {
    const before = view(1).teams[0].whose;
    flip(0, k);
    flip(0, k + 1);
    Object.assign(faces, view(1).teams[0].faces);
    run(t, 1200);
    assert.notStrictEqual(view(1).teams[0].whose, before, 'nach dem Zug ist der Nächste dran');
  }
  assert.strictEqual(Object.keys(faces).length, 16);
  const pairs = {};
  for (const [k, e] of Object.entries(faces)) (pairs[e] ||= []).push(Number(k));
  const matched = new Set(view(1).teams[0].matched);
  for (const [a, b] of Object.values(pairs)) {
    if (matched.has(a)) continue;
    flip(0, a);
    flip(0, b);
  }
  assert.strictEqual(g.phase, 'result');
  assert.strictEqual(g.history[0].winner, 0);
  assert.match(g.history[0].info, /^8 Paare gegen/);
  g.dispose();
});

test('Team-Zählfieber: jeder im Team zählt eine andere Sorte, die kleinere Abweichung gewinnt', (t) => {
  const { g, move, view } = play(t, 4, 'zaehlfieber', 'teams', { teams: [['p1', 'p2'], ['p3', 'p4']] });
  assert.notStrictEqual(view(1).target.emoji, view(2).target.emoji);
  assert.strictEqual(view(1).target.emoji, view(3).target.emoji);
  assert.strictEqual(view(1).teamMode, true);
  const right = (i) => view(i).critters.filter((c) => c.e === view(i).target.emoji).length;
  run(t, 13000);
  move(1, { type: 'answer', value: right(1) });
  move(2, { type: 'answer', value: right(2) + 1 });
  move(3, { type: 'answer', value: right(3) + 2 });
  move(4, { type: 'answer', value: right(4) });
  assert.strictEqual(g.phase, 'result');
  assert.strictEqual(g.history[0].winner, 0);
  assert.match(g.history[0].info, /0,5 gegen 1,0/);
  g.dispose();
});
