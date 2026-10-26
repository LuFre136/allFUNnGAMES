// Tests für „Einer gegen alle“, Team-Minispiele und die Team-Party: node --test

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

// Uhr in kleinen Schritten vorspulen, damit auch Zeitgeber laufen, die erst unterwegs gestellt werden
function run(t, ms) {
  for (let left = ms; left > 0; left -= 50) t.mock.timers.tick(Math.min(50, left));
}

// Minispiel `id` in der Spielart `format` sofort starten; `fix` legt Einzelnen oder Teams fest
function play(t, n, id, format, fix = {}, game = {}) {
  const s = setup(n, { count: 3, ...game });
  s.g.playlist[0] = id;
  s.g.formats[0] = format;
  s.g.toIntro();
  Object.assign(s.g.setup, fix);
  if (fix.teams) s.g.setup.teams = MinispielParty.TEAMS.map((tm, i) => ({ ...tm, ids: fix.teams[i] }));
  for (let i = 1; i <= n; i++) s.g.action(s.p(i), { type: 'ready' });
  assert.strictEqual(s.g.phase, 'play');
  t.mock.timers.tick(3600);
  const move = (i, m) => s.g.action(s.p(i), { type: 'move', move: m });
  const draw = (i, d) => s.g.draw(s.p(i), d);
  return { ...s, move, draw };
}

const pointsOf = (g, id) => g.totals.get(id);

test.beforeEach((t) => t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 }));

test('Gemischt: jedes dritte Minispiel ist „Einer gegen alle“ oder Team, die anderen jeder gegen jeden', () => {
  const { g } = setup(6, { count: 12 });
  g.formats.forEach((f, i) => {
    assert.strictEqual(f === 'ffa', i % 3 !== 2, `Platz ${i}: ${f}`);
    assert.ok(minigames.byId[g.playlist[i]].formats?.includes(f) || (f === 'ffa' && !minigames.byId[g.playlist[i]].formats), g.playlist[i]);
  });
  g.dispose();
});

test('Nur jeder gegen jeden, und mit 3 Spielern keine Teams', () => {
  const a = setup(5, { count: 12, formatMix: 'ffa' });
  assert.ok(a.g.formats.every((f) => f === 'ffa'));
  a.g.dispose();
  const b = setup(3, { count: 16, formatMix: 'many' });
  assert.ok(b.g.formats.every((f) => f !== 'teams'));
  assert.ok(b.g.formats.includes('solo'));
  b.g.dispose();
});

test('Teams werden jedes Mal neu und gleich groß gemischt, der Einzelne zufällig', () => {
  const { g } = setup(7, { count: 3 });
  g.formats[0] = 'teams';
  g.playlist[0] = 'tauziehen';
  g.toIntro();
  const sizes = g.setup.teams.map((x) => x.ids.length).sort();
  assert.deepStrictEqual(sizes, [3, 4]);
  assert.strictEqual(new Set(g.setup.teams.flatMap((x) => x.ids)).size, 7);
  g.formats[0] = 'solo';
  g.playlist[0] = 'torwart';
  g.toIntro();
  assert.ok(g.lobby.players.has(g.setup.solo));
  g.dispose();
});

test('Torwart: hält er jeden dritten Schuss, bekommt er so viele Punkte wie Gegner', (t) => {
  const { g, move } = play(t, 4, 'torwart', 'solo', { solo: 'p1' });
  for (let r = 0; r < 5; r++) {
    move(1, { type: 'pick', corner: 0 });
    move(2, { type: 'pick', corner: 0 }); // gehalten
    move(3, { type: 'pick', corner: 2 });
    move(4, { type: 'pick', corner: 1 });
    run(t, 2600);
  }
  assert.strictEqual(g.phase, 'result');
  const last = g.history[0];
  assert.strictEqual(last.winner, 'solo');
  assert.strictEqual(pointsOf(g, 'p1'), 3);
  assert.strictEqual(pointsOf(g, 'p2'), 0);
  g.dispose();
});

test('Torwart: treffen die Schützen, bekommt jeder aus der Gruppe einen Punkt', (t) => {
  const { g, move } = play(t, 4, 'torwart', 'solo', { solo: 'p1' });
  for (let r = 0; r < 5; r++) {
    move(1, { type: 'pick', corner: 0 });
    for (const i of [2, 3, 4]) move(i, { type: 'pick', corner: 2 });
    run(t, 2600);
  }
  assert.strictEqual(g.history[0].winner, 'group');
  assert.deepStrictEqual([1, 2, 3, 4].map((i) => pointsOf(g, `p${i}`)), [0, 1, 1, 1]);
  g.dispose();
});

test('Ochs am Berg: Tippen bei Rot schickt zurück an den Start, Rot hält höchstens 3 s', (t) => {
  const { g, draw } = play(t, 3, 'ochsamberg', 'solo', { solo: 'p1' });
  for (let k = 0; k < 5; k++) {
    draw(2, { op: 'step' });
    t.mock.timers.tick(100);
  }
  assert.strictEqual(g.instance.view(g.lobby.players.get('p2')).pos.p2, 5);
  draw(1, { op: 'light', red: true });
  t.mock.timers.tick(200);
  draw(2, { op: 'step' }); // noch in der Schonfrist
  assert.strictEqual(g.instance.view(g.lobby.players.get('p2')).pos.p2, 6);
  t.mock.timers.tick(300);
  draw(2, { op: 'step' });
  assert.strictEqual(g.instance.view(g.lobby.players.get('p2')).pos.p2, 0, 'erwischt');
  run(t, 3000);
  assert.strictEqual(g.instance.view(g.lobby.players.get('p1')).red, false, 'nach 3 s wieder grün');
  // Beide laufen ins Ziel
  for (let k = 0; k < 40; k++) {
    draw(2, { op: 'step' });
    draw(3, { op: 'step' });
    t.mock.timers.tick(100);
  }
  assert.strictEqual(g.phase, 'result');
  assert.strictEqual(g.history[0].winner, 'group');
  g.dispose();
});

test('Gespensterhaus: erwischt das Gespenst alle, gewinnt es', (t) => {
  const { g, move } = play(t, 3, 'gespensterhaus', 'solo', { solo: 'p1' });
  move(2, { type: 'hide', door: 0 });
  move(3, { type: 'hide', door: 1 });
  move(1, { type: 'open', door: 0 });
  move(1, { type: 'open', door: 1 });
  run(t, 3600);
  assert.strictEqual(g.phase, 'result');
  assert.strictEqual(g.history[0].winner, 'solo');
  assert.strictEqual(pointsOf(g, 'p1'), 2);
  g.dispose();
});

test('Tauziehen: wer weit genug zieht, gewinnt; jeder im Team bekommt Punkte für die Gegner', (t) => {
  const { g, draw } = play(t, 4, 'tauziehen', 'teams', { teams: [['p1', 'p2'], ['p3', 'p4']] });
  for (let k = 1; k <= 30; k++) {
    draw(1, { op: 'pull', n: k });
    draw(2, { op: 'pull', n: k });
    t.mock.timers.tick(80);
  }
  assert.strictEqual(g.phase, 'result');
  assert.strictEqual(g.history[0].winner, 0);
  assert.deepStrictEqual([1, 2, 3, 4].map((i) => pointsOf(g, `p${i}`)), [2, 2, 0, 0]);
  g.dispose();
});

test('Staffel-Farbfolge: der Reihe nach tippen, ein Fehler wirft das Team raus', (t) => {
  const { g, move } = play(t, 4, 'staffel', 'teams', { teams: [['p1', 'p2'], ['p3', 'p4']] });
  const seq = g.instance.view(g.lobby.players.get('p1')).sequence;
  run(t, 1200);
  assert.ok(move(2, { type: 'press', color: seq[0] }).error, 'p1 ist zuerst dran');
  move(1, { type: 'press', color: seq[0] }); // Länge 1 geschafft
  move(3, { type: 'press', color: (seq[0] + 1) % 4 }); // falsch
  run(t, 2000);
  move(2, { type: 'press', color: seq[0] });
  move(1, { type: 'press', color: seq[1] }); // Länge 2 geschafft
  run(t, 2500);
  move(2, { type: 'press', color: (seq[0] + 1) % 4 }); // falsch, Team 0 raus
  assert.strictEqual(g.phase, 'result');
  assert.strictEqual(g.history[0].winner, 0);
  g.dispose();
});

test('Turmbau: Mitte trifft genau, daneben fällt herunter, der höhere Turm gewinnt', (t) => {
  const { g, move } = play(t, 4, 'turmbau', 'teams', { teams: [['p1', 'p2'], ['p3', 'p4']] });
  move(1, { type: 'drop', ms: 0 });
  const v = () => g.instance.view(g.lobby.players.get('p1')).teams;
  assert.strictEqual(v()[0].height, 1);
  assert.strictEqual(v()[0].blocks[1].w, 80);
  run(t, 600);
  move(2, { type: 'drop', ms: 0 });
  assert.strictEqual(v()[0].height, 2);
  // Team 1: ganz außen, daneben (Viertelperiode = ganz rechts)
  move(3, { type: 'drop', ms: 550 });
  assert.strictEqual(v()[1].height, 1, 'ragt nur teilweise über');
  assert.ok(v()[1].blocks[1].w < 80);
  run(t, 45000);
  assert.strictEqual(g.phase, 'result');
  assert.strictEqual(g.history[0].winner, 0);
  g.dispose();
});

test('Team-Party: feste Teams, jedes Minispiel ist ein Punkt für ein Team', (t) => {
  const { g, move } = play(t, 4, 'stoppuhr', 'ffa', {}, { mode: 'team', count: 4 });
  const [blue] = g.teams;
  assert.strictEqual(g.teams[0].ids.length, 2);
  const ids = g.setup.teams.flatMap((x) => x.ids);
  assert.strictEqual(new Set(ids).size, 4);
  // Team Blau stoppt genau, Team Rot daneben
  for (const id of ids) {
    const i = Number(id.slice(1));
    move(i, { type: 'stop', ms: blue.ids.includes(id) ? 10000 : 14000 });
  }
  assert.strictEqual(g.phase, 'result');
  assert.deepStrictEqual(g.teamScore, [1, 0]);
  const before = g.teams.map((x) => [...x.ids]);
  g.next();
  assert.deepStrictEqual(g.teams.map((x) => x.ids), before, 'Teams bleiben gleich');
  g.dispose();
});

test('Brett: einer gegen alle bringt dem Einzelnen 5 Münzen pro Gegner, jeder Gegner zahlt 3', (t) => {
  const { g, move } = (() => {
    const s = setup(4, { mode: 'brett', rounds: 5 });
    s.g.board.dispose?.();
    s.g.playlist[0] = 'gespensterhaus';
    s.g.formats[0] = 'solo';
    s.g.toIntro();
    s.g.setup.solo = 'p1';
    for (let i = 1; i <= 4; i++) s.g.action(s.p(i), { type: 'ready' });
    t.mock.timers.tick(3600);
    return { ...s, move: (i, m) => s.g.action(s.p(i), { type: 'move', move: m }) };
  })();
  // Gespenst öffnet 2 Türen, alle verstecken sich dahinter
  move(2, { type: 'hide', door: 0 });
  move(3, { type: 'hide', door: 0 });
  move(4, { type: 'hide', door: 1 });
  move(1, { type: 'open', door: 0 });
  move(1, { type: 'open', door: 1 });
  run(t, 3600);
  const coins = Object.fromEntries(g.history[0].coins.map((c) => [c.id, c.coins]));
  assert.deepStrictEqual(coins, { p1: 15, p2: -3, p3: -3, p4: -3 });
  g.dispose();
});
