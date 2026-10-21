// Regeltests für Gleichgesinnt: node --test

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const Gleichgesinnt = require('../server/games/gleichgesinnt');

function fakeLobby(n, game = {}) {
  const players = new Map();
  for (let i = 1; i <= n; i++) players.set(`p${i}`, { id: `p${i}`, connected: true, isHost: i === 1 });
  return {
    players,
    settings: { hostPlays: true, game: { ...Gleichgesinnt.defaultSettings(), ...game } },
    activePlayers: () => [...players.values()].filter((p) => p.connected),
    broadcast() {},
  };
}

function setup(n = 4, game = {}) {
  const lobby = fakeLobby(n, game);
  const g = new Gleichgesinnt(lobby);
  g.start();
  return { lobby, game: g, p: (i) => lobby.players.get(`p${i}`) };
}

// answers: pro Spieler (p1, p2, …) neun Antworten in Feldreihenfolge, je drei pro Kategorie in den Feldern 0–2, 3–5, 6–8
function writeAll(game, lobby, answers) {
  for (let cat = 0; cat < 3; cat++) {
    assert.strictEqual(game.phase, 'pick');
    game.pick(lobby.players.get(game.pickerId), 0);
    answers.forEach((list, k) => {
      const cells = {};
      for (let j = 0; j < 3; j++) cells[cat * 3 + j] = list[cat * 3 + j];
      const res = game.write(lobby.players.get(`p${k + 1}`), cells);
      assert.ok(res.ok, res.error);
    });
  }
  assert.strictEqual(game.phase, 'choose');
}

// Wer dran ist, liest sein erstes offenes Feld vor; alle anderen melden gleiche Wörter (automatisch) oder „nein“
function revealStep(game, lobby) {
  const active = lobby.players.get(game.activeId);
  game.choose(active, game.openCells(active.id)[0]);
  for (const id of game.participants) {
    if (id === active.id || game.phase !== 'claim') continue;
    const auto = game.claims.get(id);
    game.claim(lobby.players.get(id), auto === undefined ? null : auto);
  }
  if (game.phase === 'result') game.afterResult();
}

const nine = (prefix) => Array.from({ length: 9 }, (_, i) => `${prefix}${i}`);

test('braucht 3 bis 12 Spieler', () => {
  assert.throws(() => new Gleichgesinnt(fakeLobby(2)).start(), /mindestens 3/);
  assert.throws(() => new Gleichgesinnt(fakeLobby(13)).start(), /höchstens 12/);
  assert.doesNotThrow(() => new Gleichgesinnt(fakeLobby(12)).start());
});

test('Kategorien sind eindeutig und reichen für viele Partien', () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../server/games/gleichgesinnt/categories.json'), 'utf8'));
  assert.ok(data.categories.length >= 200);
  assert.strictEqual(new Set(data.categories).size, data.categories.length);
});

test('genau drei Antworten, keine doppelte Antwort pro Runde, belegte Felder bleiben belegt', () => {
  const { game, p } = setup(3);
  game.pick(p(1).id === game.pickerId ? p(1) : { id: game.pickerId }, 1);
  assert.strictEqual(game.phase, 'write');
  assert.match(game.write(p(1), { 0: 'Kerze', 1: 'Baum' }).error, /genau 3/);
  assert.match(game.write(p(1), { 0: 'Kerze', 1: 'Kerzen', 2: 'Baum' }).error, /schon/);
  assert.ok(game.write(p(1), { 0: 'Kerze', 1: 'Baum', 2: 'Stern' }).ok);
  // Ändern innerhalb der Kategorie ist erlaubt
  assert.ok(game.write(p(1), { 3: 'Kerze', 4: 'Baum', 5: 'Stern' }).ok);
  assert.deepStrictEqual(game.grids.get('p1').slice(0, 6).map((c) => c?.text ?? null), [null, null, null, 'Kerze', 'Baum', 'Stern']);
  game.write(p(2), { 0: 'a', 1: 'b', 2: 'c' });
  game.write(p(3), { 0: 'a', 1: 'b', 2: 'c' });
  assert.strictEqual(game.phase, 'pick');
  game.pick({ id: game.pickerId }, 0);
  assert.match(game.write(p(1), { 3: 'x', 0: 'y', 1: 'z' }).error, /belegt/);
  assert.match(game.write(p(1), { 0: 'kerze', 1: 'y', 2: 'z' }).error, /schon/);
});

test('Stern bei genau einem Treffer, Kreis bei mehreren, Strich bei keinem', () => {
  const { game, lobby } = setup(4);
  writeAll(game, lobby, [
    ['Kerze', 'Baum', 'Stern', ...nine('a').slice(3)],
    ['Kerze', 'Lametta', 'Engel', ...nine('b').slice(3)],
    ['Kerze', 'Glocke', 'Engel', ...nine('c').slice(3)],
    ['Geschenk', 'Baum', 'Plätzchen', ...nine('d').slice(3)],
  ]);
  game.participants.sort();
  game.activeId = 'p1';
  game.revealTurn = 0;
  game.choose(lobby.players.get('p1'), 0); // Kerze: p2 und p3 haben sie auch
  assert.deepStrictEqual([...game.claims.entries()].sort(), [['p2', 0], ['p3', 0]]);
  game.claim(lobby.players.get('p2'), 0);
  game.claim(lobby.players.get('p3'), 0);
  assert.strictEqual(game.phase, 'claim', 'p4 muss noch antworten');
  game.claim(lobby.players.get('p4'), null);
  assert.strictEqual(game.phase, 'result');
  assert.strictEqual(game.current.outcome, 'many');
  for (const id of ['p1', 'p2', 'p3']) assert.deepStrictEqual([game.grids.get(id)[0].state, game.grids.get(id)[0].star], ['circle', false]);

  game.afterResult();
  assert.strictEqual(game.activeId, 'p2');
  game.choose(lobby.players.get('p2'), 2); // Engel: nur p3
  game.claim(lobby.players.get('p3'), 2);
  game.claim(lobby.players.get('p1'), null);
  game.claim(lobby.players.get('p4'), null);
  assert.strictEqual(game.current.outcome, 'bff');
  assert.ok(game.grids.get('p2')[2].star && game.grids.get('p3')[2].star);

  game.afterResult();
  game.choose(lobby.players.get('p3'), 1); // Glocke: niemand
  for (const id of ['p1', 'p2', 'p4']) game.claim(lobby.players.get(id), null);
  assert.strictEqual(game.current.outcome, 'none');
  assert.strictEqual(game.grids.get('p3')[1].state, 'cross');
});

test('Synonyme meldet man selbst, Nachzügler bekommen leere Felder', () => {
  const { game, lobby, p } = setup(3);
  game.pick({ id: game.pickerId }, 0);
  game.write(p(1), { 0: 'Geige', 1: 'x', 2: 'y' });
  game.write(p(2), { 0: 'Violine', 1: 'q', 2: 'r' });
  game.next(); // Host wartet nicht auf p3
  assert.strictEqual(game.phase, 'pick');
  assert.ok(game.grids.get('p3').slice(0, 3).every((c) => c.empty && c.state === 'cross'));
  for (let k = 0; k < 2; k++) {
    game.pick({ id: game.pickerId }, 0);
    for (let i = 1; i <= 3; i++) game.write(p(i), Object.fromEntries([3, 4, 5].map((c) => [c + k * 3, `w${i}${k}${c}`])));
  }
  game.participants.sort();
  game.activeId = 'p1';
  game.revealTurn = 0;
  game.phase = 'choose';
  game.choose(p(1), 0);
  assert.strictEqual(game.claims.get('p2'), undefined, 'Violine ist kein gleiches Wort');
  game.claim(p(2), 0);
  game.claim(p(3), null);
  assert.strictEqual(game.current.outcome, 'bff');
});

test('Wertung: Kreise, Sterne (bei drei Spielern 1 Punkt) und Bonus für Reihen und Spalten', () => {
  const { game } = setup(4);
  const C = (star = false) => ({ state: 'circle', star });
  const X = { state: 'cross', star: false };
  // obere Reihe (3) und rechte Spalte (3) ganz umkreist, ein Stern
  const grid = [C(true), C(), C(), X, X, C(), X, X, C()];
  assert.deepStrictEqual(game.scoreGrid(grid), {
    circles: 5, stars: 1, starValue: 2, bonus: 6,
    lines: [{ kind: 'row', index: 0, bonus: 3 }, { kind: 'col', index: 2, bonus: 3 }],
    points: 5 + 2 + 6,
  });
  const three = setup(3).game;
  assert.strictEqual(three.scoreGrid(grid).points, 5 + 1 + 6);
});

test('Runde endet, sobald einer keine offene Antwort mehr hat; danach beginnt, wer am wenigsten hat', () => {
  const { game, lobby } = setup(3, { rounds: 2 });
  writeAll(game, lobby, [nine('a'), nine('b'), nine('c')]);
  let steps = 0;
  while (game.phase !== 'roundEnd' && steps < 50) {
    revealStep(game, lobby);
    steps++;
  }
  assert.strictEqual(game.phase, 'roundEnd');
  assert.ok(game.participants.some((id) => !game.openCells(id).length));
  // Alles durchgestrichen: 0 Punkte. Jemand bekommt vorher Punkte, damit die Reihenfolge feststeht.
  game.totals.set('p1', 5);
  game.totals.set('p2', 1);
  game.totals.set('p3', 3);
  game.next();
  assert.strictEqual(game.round, 2);
  writeAll(game, lobby, [nine('a'), nine('b'), nine('c')]);
  assert.strictEqual(game.activeId, 'p2');
});

test('Endstand: Gleichstand entscheidet die beste Runde, danach geteilter Platz', () => {
  const { game } = setup(3, { rounds: 2 });
  game.totals = new Map([['p1', 10], ['p2', 10], ['p3', 10]]);
  game.roundScores = [
    new Map([['p1', { points: 6 }], ['p2', { points: 5 }], ['p3', { points: 5 }]]),
    new Map([['p1', { points: 4 }], ['p2', { points: 5 }], ['p3', { points: 5 }]]),
  ];
  const r = game.ranking();
  assert.deepStrictEqual(r.map((e) => [e.id, e.rank]), [['p1', 1], ['p2', 2], ['p3', 2]]);
});

test('fremde offene Antworten bleiben verdeckt', () => {
  const { game, lobby } = setup(3);
  writeAll(game, lobby, [nine('a'), nine('b'), nine('c')]);
  const v = game.view(lobby.players.get('p1'));
  assert.strictEqual(v.grids.p1[0].text, 'a0');
  assert.strictEqual(v.grids.p2[0].text, null);
});
