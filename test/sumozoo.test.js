// Tests für Sumo Zoo: node --test

const test = require('node:test');
const assert = require('node:assert');
const SumoZoo = require('../server/games/sumozoo');
const { simulate } = require('../server/games/sumozoo/physics');
const World = require('../public/js/sumozoo-world');

function fakeLobby(n, game = {}) {
  const players = new Map();
  for (let i = 1; i <= n; i++) players.set(`p${i}`, { id: `p${i}`, name: `Spieler ${i}`, connected: true, isHost: i === 1, teamId: null });
  const teams = [{ id: 't1', name: 'Rot', color: '#f00' }, { id: 't2', name: 'Blau', color: '#00f' }, { id: 't3', name: 'Grün', color: '#0f0' }];
  return {
    hostId: 'p1',
    players,
    teams,
    settings: { hostPlays: true, game: { ...SumoZoo.defaultSettings(), ...game } },
    activePlayers: () => [...players.values()].filter((p) => p.connected),
    playersInTeam: (id) => [...players.values()].filter((p) => p.teamId === id),
    teamById: (id) => teams.find((t) => t.id === id) || null,
    send() {},
    broadcast() {},
  };
}

function setup(n = 2, game = {}) {
  const lobby = fakeLobby(n, game);
  const g = new SumoZoo(lobby);
  g.start();
  return { lobby, g };
}

const shooter = (g) => g.lobby.players.get(g.shooterId);

// Stellt die Tiere einer Seite gezielt auf, alle anderen bleiben weg
function place(g, spec) {
  g.animals = [];
  for (const [side, list] of Object.entries(spec)) {
    list.forEach(([x, y], k) => g.animals.push({ id: `${side}-${k}`, side, x, y, alive: true }));
  }
}

function finishRoll(g) {
  clearTimeout(g.rollTimer);
  g.afterRoll();
}

test('jede Karte hat für 2 bis 4 Seiten und 3 bis 8 Tiere eine passende Aufstellung', () => {
  for (const m of World.MAP_IDS) {
    for (let sides = 2; sides <= 4; sides++) {
      for (let n = 3; n <= 8; n++) {
        const patterns = World.patternsFor(m, sides, n);
        assert.ok(patterns.includes('block'), `${m} ${sides} Seiten ${n} Tiere`);
        for (const p of patterns) {
          const groups = World.layout(m, sides, n, p);
          assert.strictEqual(groups.length, sides);
          for (const g of groups) for (const a of g) assert.ok(World.onGround(World.MAPS[m], a.x, a.y));
        }
      }
    }
  }
});

test('Oval wie im Original: Seiten wechseln sich ab, passt auf Plateau, Ring und Wasserloch', () => {
  for (const m of ['plateau', 'ring', 'wasserloch']) {
    for (let sides = 2; sides <= 4; sides++) {
      for (let n = 3; n <= 7; n++) assert.ok(World.layout(m, sides, n, 'oval'), `${m} ${sides} Seiten ${n} Tiere`);
    }
  }
  assert.strictEqual(World.layout('bruecke', 2, 6, 'oval'), null);
  const { g } = setup(2);
  assert.strictEqual(g.pattern, 'oval');
  const { g: g2 } = setup(2, { map: 'bruecke' });
  assert.notStrictEqual(g2.pattern, 'oval');
  g.dispose();
  g2.dispose();
});

test('Mauern: ein Tier prallt ab statt hinunterzufallen, durch die Lücke fällt es', () => {
  const map = World.MAPS.plateau;
  // nach oben gegen die Mauer (x = 300 liegt vor einem Mauerstück)
  let r = simulate(map, [{ id: 'a', x: 300, y: 300, alive: true }], { id: 'a', angle: -Math.PI / 2, power: 1 });
  assert.strictEqual(r.final[0].alive, true);
  // nach oben durch die Lücke in der Mitte
  r = simulate(map, [{ id: 'a', x: 500, y: 300, alive: true }], { id: 'a', angle: -Math.PI / 2, power: 1 });
  assert.strictEqual(r.final[0].alive, false);
  // Zielhilfe endet an der Mauer
  const line = World.aimLine([], { id: 'a', x: 300, y: 300 }, -Math.PI / 2, 1000, map.walls);
  assert.ok(line.wall);
  assert.ok(Math.abs(300 - line.length - (71 + World.WALL + World.RADIUS)) < 5);
});

test('Karten: Rand, Loch und Steg', () => {
  const { plateau, wasserloch, bruecke, ring } = World.MAPS;
  assert.ok(World.onGround(plateau, 500, 320));
  assert.ok(!World.onGround(plateau, 30, 320));
  assert.ok(!World.onGround(plateau, 65, 65)); // abgerundete Ecke
  assert.ok(!World.onGround(wasserloch, 500, 320));
  assert.ok(World.onGround(wasserloch, 500, 200));
  assert.ok(World.onGround(bruecke, 500, 320));
  assert.ok(!World.onGround(bruecke, 500, 200));
  assert.ok(!World.onGround(ring, 500, 20));
});

test('Physik: jeder Stoß endet, nichts steckt ineinander, Ergebnis ist reproduzierbar', () => {
  const map = World.MAPS.plateau;
  const groups = World.layout('plateau', 4, 5, 'block');
  const animals = groups.flatMap((g, s) => g.map((p, k) => ({ id: `s${s}-${k}`, x: p.x, y: p.y, alive: true })));
  for (let i = 0; i < 200; i++) {
    const shot = { id: animals[i % animals.length].id, angle: (i * 2.399) % (Math.PI * 2), power: ((i * 37) % 100) / 100 };
    const r = simulate(map, animals, shot);
    assert.ok(r.duration <= 12100);
    const alive = r.final.filter((a) => a.alive);
    for (const a of alive) assert.ok(World.onGround(map, a.x, a.y));
    for (let x = 0; x < alive.length; x++) {
      for (let y = x + 1; y < alive.length; y++) {
        assert.ok(Math.hypot(alive[x].x - alive[y].x, alive[x].y - alive[y].y) >= 2 * World.RADIUS - 2);
      }
    }
    assert.deepStrictEqual(simulate(map, animals, shot).final, r.final);
    for (const t of r.tracks) assert.strictEqual(t.pts.length, r.frames * 2);
  }
});

test('Physik: frontaler Stoß überträgt den Schwung, das gestoßene Tier fällt über die Kante', () => {
  const map = World.MAPS.plateau;
  const animals = [{ id: 'a', x: 600, y: 320, alive: true }, { id: 'b', x: 800, y: 320, alive: true }];
  const r = simulate(map, animals, { id: 'a', angle: 0, power: 1 });
  const a = r.final.find((x) => x.id === 'a');
  const b = r.final.find((x) => x.id === 'b');
  assert.strictEqual(b.alive, false);
  assert.strictEqual(a.alive, true);
  assert.ok(a.x <= 765, 'der Stoßende bleibt fast stehen');
  assert.deepStrictEqual(r.falls.map((f) => f.id), ['b']);
});

test('Start: Seiten, Tiere und Startspieler', () => {
  const { g } = setup(3);
  assert.strictEqual(g.sides.length, 3);
  assert.strictEqual(g.animals.length, 15); // 3 Seiten à 5 Tiere
  assert.strictEqual(g.phase, 'aim');
  assert.ok(shooter(g));
  const { g: g2 } = setup(2);
  assert.strictEqual(g2.animals.length, 12);
  assert.throws(() => setup(5), /höchstens 4/);
  assert.throws(() => setup(1), /mindestens zwei/);
});

test('nur wer dran ist, darf schubsen, und nur eigene Tiere', () => {
  const { g, lobby } = setup(2);
  const other = [...lobby.players.values()].find((p) => p.id !== g.shooterId);
  const mine = g.animals.find((a) => a.side === g.turnSide);
  const theirs = g.animals.find((a) => a.side !== g.turnSide);
  assert.match(g.action(other, { type: 'shoot', animalId: mine.id, angle: 0, power: 0.5 }).error, /nicht dran/);
  assert.match(g.action(shooter(g), { type: 'shoot', animalId: theirs.id, angle: 0, power: 0.5 }).error, /eigenen/);
  assert.match(g.action(shooter(g), { type: 'shoot', animalId: mine.id, angle: 0, power: 0 }).error, /schwach/);
  assert.ok(g.action(shooter(g), { type: 'shoot', animalId: mine.id, angle: 0, power: 0.3 }).ok);
  assert.strictEqual(g.phase, 'rolling');
  assert.match(g.action(shooter(g), { type: 'shoot', animalId: mine.id, angle: 0, power: 0.3 }).error, /rollt/);
  g.dispose();
});

test('Extrazug nach Treffer (Standard an), sonst ist die nächste Seite dran', () => {
  for (const extraTurn of [true, false]) {
    const { g } = setup(2, { extraTurn });
    const me = g.turnSide;
    const them = g.sides.find((s) => s.id !== me).id;
    place(g, { [me]: [[500, 320]], [them]: [[700, 320], [500, 150], [300, 500]] });
    const who = g.shooterId;
    g.action(shooter(g), { type: 'shoot', animalId: `${me}-0`, angle: 0, power: 1 });
    assert.strictEqual(g.animals.find((a) => a.id === `${them}-0`).alive, false);
    finishRoll(g);
    assert.strictEqual(g.turnSide, extraTurn ? me : them);
    if (extraTurn) assert.strictEqual(g.shooterId, who);
    g.dispose();
  }
});

test('Eigentor gibt keinen Extrazug', () => {
  const { g } = setup(2);
  const me = g.turnSide;
  const them = g.sides.find((s) => s.id !== me).id;
  place(g, { [me]: [[500, 320], [700, 320]], [them]: [[300, 150]] });
  g.action(shooter(g), { type: 'shoot', animalId: `${me}-0`, angle: 0, power: 1 });
  assert.strictEqual(g.animals.find((a) => a.id === `${me}-1`).alive, false);
  assert.strictEqual(g.stats[g.shot.shooterId].own, 1);
  finishRoll(g);
  assert.strictEqual(g.turnSide, them);
  g.dispose();
});

test('letztes gegnerisches Tier runter: Satz gewonnen, Partie vorbei', () => {
  const { g } = setup(2);
  const me = g.turnSide;
  const them = g.sides.find((s) => s.id !== me).id;
  place(g, { [me]: [[500, 320]], [them]: [[700, 320]] });
  g.action(shooter(g), { type: 'shoot', animalId: `${me}-0`, angle: 0, power: 1 });
  assert.strictEqual(g.result.winner, me);
  assert.strictEqual(g.result.left, 1);
  finishRoll(g);
  assert.strictEqual(g.phase, 'final');
  assert.strictEqual(g.view(shooter(g)).standings[0].id, me);
  assert.ok(g.awards().lastOne.sides.includes(me));
});

test('Gewinnsätze: nach dem ersten Satz geht es weiter, die Startseite wechselt', () => {
  const { g } = setup(2, { sets: 2 });
  const first = g.turnSide;
  const them = g.sides.find((s) => s.id !== first).id;
  place(g, { [first]: [[500, 320]], [them]: [[700, 320]] });
  g.action(shooter(g), { type: 'shoot', animalId: `${first}-0`, angle: 0, power: 1 });
  finishRoll(g);
  assert.strictEqual(g.phase, 'setEnd');
  g.next();
  assert.strictEqual(g.setNo, 2);
  assert.strictEqual(g.phase, 'aim');
  assert.strictEqual(g.turnSide, them);
  assert.strictEqual(g.animals.filter((a) => a.alive).length, 12);
  g.dispose();
});

test('fallen die letzten Tiere aller Seiten beim selben Stoß, gewinnt wessen Tier zuletzt fiel', () => {
  for (const [mine, theirs, expected] of [[0.5, 0.3, 'me'], [0.2, 0.4, 'them'], [0.3, 0.3, null]]) {
    const { g } = setup(2);
    const me = g.turnSide;
    const them = g.sides.find((s) => s.id !== me).id;
    place(g, { [me]: [[900, 320]], [them]: [[920, 400]] });
    for (const a of g.animals) a.alive = false;
    g.resolve(g.currentSide(), [{ id: `${me}-0`, t: mine }, { id: `${them}-0`, t: theirs }]);
    assert.strictEqual(g.result.winner, expected === 'me' ? me : expected === 'them' ? them : null);
    g.dispose();
  }
});

test('mit drei Seiten scheidet eine Seite aus und wird übersprungen', () => {
  const { g } = setup(3, { extraTurn: false });
  const order = g.sides.map((s) => s.id);
  const me = g.turnSide;
  const idx = order.indexOf(me);
  const next = order[(idx + 1) % 3];
  const after = order[(idx + 2) % 3];
  place(g, { [me]: [[500, 320]], [next]: [[700, 320]], [after]: [[300, 150]] });
  g.action(shooter(g), { type: 'shoot', animalId: `${me}-0`, angle: 0, power: 1 });
  assert.deepStrictEqual(g.outOrder, [next]);
  finishRoll(g);
  assert.strictEqual(g.turnSide, after);
  g.dispose();
});

test('Teams: Mitglieder wechseln sich ab', () => {
  const lobby = fakeLobby(4, { teamMode: true });
  ['t1', 't1', 't2', 't2'].forEach((t, i) => { lobby.players.get(`p${i + 1}`).teamId = t; });
  const g = new SumoZoo(lobby);
  g.start();
  assert.strictEqual(g.sides.length, 2);
  const side = g.currentSide();
  const firstShooter = g.shooterId;
  g.skip('test');
  g.skip('test');
  assert.strictEqual(g.currentSide(), side);
  assert.notStrictEqual(g.shooterId, firstShooter);
  assert.strictEqual(lobby.players.get(g.shooterId).teamId, side.teamId);
  g.dispose();
});

test('geteiltes Gerät: der Besitzer schubst für seinen Gast', () => {
  const lobby = fakeLobby(1);
  lobby.players.set('g1', { id: 'g1', name: 'Gast', connected: true, isHost: false, teamId: null, guestOf: 'p1' });
  const g = new SumoZoo(lobby);
  g.start();
  const owner = lobby.players.get('p1');
  g.shooterId = 'g1';
  g.turnSide = g.sides.find((s) => s.playerIds[0] === 'g1').id;
  const mine = g.animals.find((a) => a.side === g.turnSide);
  assert.ok(g.action(owner, { type: 'shoot', animalId: mine.id, angle: 1, power: 0.2 }).ok);
  g.dispose();
});

test('ohne Fernseher spielt der Host mit', () => {
  const settings = { hostPlays: false, game: { ...SumoZoo.defaultSettings(), tv: false } };
  SumoZoo.syncSettings(settings);
  assert.strictEqual(settings.hostPlays, true);
});

test('Zeit abgelaufen: Der Zug verfällt', () => {
  const { g } = setup(2);
  const me = g.turnSide;
  assert.ok(g.action(g.lobby.players.get('p1'), { type: 'force' }).ok);
  assert.notStrictEqual(g.turnSide, me);
  g.dispose();
});
