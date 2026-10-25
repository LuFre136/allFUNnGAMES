// Tests für Kampfschafe: node --test

const test = require('node:test');
const assert = require('node:assert');
const Kampfschafe = require('../server/games/kampfschafe');
const { fire } = require('../server/games/kampfschafe/combat');
const World = require('../public/js/kampfschafe-world');

function fakeLobby(n, game = {}) {
  const players = new Map();
  for (let i = 1; i <= n; i++) players.set(`p${i}`, { id: `p${i}`, name: `Spieler ${i}`, connected: true, socketId: `sock${i}`, isHost: i === 1, teamId: null });
  const teams = [{ id: 't1', name: 'Rot', color: '#f00' }, { id: 't2', name: 'Blau', color: '#00f' }, { id: 't3', name: 'Grün', color: '#0f0' }];
  return {
    hostId: 'p1',
    players,
    teams,
    sent: [],
    settings: { hostPlays: true, game: { ...Kampfschafe.defaultSettings(), ...game } },
    activePlayers: () => [...players.values()].filter((p) => p.connected),
    playersInTeam: (id) => [...players.values()].filter((p) => p.teamId === id),
    teamById: (id) => teams.find((t) => t.id === id) || null,
    send(p, event, payload) { this.sent.push({ p: p.id, event, payload }); },
    broadcast() {},
  };
}

function setup(n = 2, game = {}) {
  const lobby = fakeLobby(n, game);
  const g = new Kampfschafe(lobby);
  g.start();
  return { lobby, g };
}

const shooter = (g) => g.lobby.players.get(g.turn.shooterId);

// Nur bestimmte Einheiten aufs Feld stellen
function place(g, list) {
  g.units = list.map(([id, type, x, y, hp]) => {
    const t = World.typeFor(g.map, type);
    return { id, side: id.split('-')[0], type, x, y, f: 0, hp: hp ?? t.hp, maxHp: t.hp, r: t.r };
  });
  for (const s of g.sides) {
    s.order = g.units.filter((u) => u.side === s.id).map((u) => u.id);
    s.ptr = 0;
  }
}

function startTurn(g, unitId) {
  g.turn.unitId = unitId;
  g.turn.side = unitId.split('-')[0];
  g.turn.shooterId = g.members(g.sideById(g.turn.side))[0].id;
  g.go();
}

function finishFire(g) {
  clearTimeout(g.phaseTimer);
  g.afterFire();
}

test('jede Karte hat für 2 bis 4 Armeen genug freie Startplätze, Medipacks liegen frei', () => {
  for (const m of World.MAP_IDS) {
    const map = World.MAPS[m];
    for (let sides = 2; sides <= 4; sides++) {
      for (const n of [6, 10]) {
        const groups = World.layout(m, sides, n);
        assert.strictEqual(groups.length, sides);
        const all = groups.flat();
        for (const g of groups) assert.strictEqual(g.length, n, `${m} ${sides} Armeen ${n} Schafe`);
        for (const p of all) assert.ok(!World.blockedByTerrain(map, p.x, p.y, 22), `${m} Platz ${p.x},${p.y}`);
        for (let i = 0; i < all.length; i++) {
          for (let j = i + 1; j < all.length; j++) assert.ok(Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y) >= 52);
        }
      }
    }
    for (const k of map.medkits) assert.ok(!World.blockedByTerrain(map, k.x, k.y, World.MEDKIT_R), `${m} Medipack`);
  }
});

test('Armeen: 10 Schafe wie im Original, auf der Seenplatte mit Hubschraubern', () => {
  assert.deepStrictEqual(World.ARMIES.normal[10].filter((k) => k === 'bazooka').length, 3);
  for (const army of Object.values(World.ARMIES)) for (const list of Object.values(army)) assert.ok(list.includes('jeep') && list.includes('heli'));
  assert.ok(World.ARMIES.heli[10].includes('heli') && !World.ARMIES.heli[10].includes('bazooka'));
  const { g } = setup(2, { map: 'seen' });
  assert.strictEqual(g.units.length, 20);
  assert.strictEqual(g.units.filter((u) => u.type === 'heli').length, 6);
  assert.strictEqual(g.units.find((u) => u.type === 'panzer').maxHp, 45);
  g.dispose();
  const four = setup(4);
  assert.strictEqual(four.g.units.length, 24);
  four.g.dispose();
});

test('Rakete bleibt an einem Baum hängen, Explosion trifft nur in der Nähe', () => {
  const map = { obstacles: [{ k: 'tree', t: 'circle', x: 300, y: 100, r: 20 }], army: 'normal' };
  const units = [
    { id: 's0-0', side: 's0', type: 'bazooka', x: 100, y: 100, hp: 20, r: 15 },
    { id: 's1-0', side: 's1', type: 'mg', x: 500, y: 100, hp: 40, r: 16 },
  ];
  const res = fire(map, units, 's0-0', { x: 500, y: 100 });
  assert.strictEqual(res.projectiles.length, 1);
  assert.ok(res.projectiles[0].x1 <= 281, 'stoppt am Baum');
  assert.strictEqual(res.hp['s1-0'], 40);
  const open = fire({ obstacles: [], army: 'normal' }, units, 's0-0', { x: 500, y: 100 });
  assert.strictEqual(open.hp['s1-0'], 40 - 25, 'Volltreffer');
});

test('Wasser hält Schüsse nicht auf, aber die Fahrt', () => {
  const map = { obstacles: [{ k: 'water', t: 'circle', x: 300, y: 100, r: 40 }], army: 'normal' };
  const units = [
    { id: 's0-0', side: 's0', type: 'panzer', x: 100, y: 100, hp: 50, r: 20 },
    { id: 's1-0', side: 's1', type: 'bazooka', x: 450, y: 100, hp: 20, r: 15 },
  ];
  const res = fire(map, units, 's0-0', { x: 450, y: 100 });
  assert.strictEqual(res.hp['s1-0'], 0);
  assert.ok(World.blockedByTerrain(map, 300, 100, 15));
  assert.ok(!World.blockedByTerrain(map, 300, 100, 15, true), 'Hubschrauber fliegen drüber');
});

test('MG: 21 Schuss, begrenzte Reichweite, jeder Treffer 1 Schaden', () => {
  const map = { obstacles: [], army: 'normal' };
  const near = [
    { id: 's0-0', side: 's0', type: 'mg', x: 100, y: 100, hp: 40, r: 16 },
    { id: 's1-0', side: 's1', type: 'panzer', x: 220, y: 100, hp: 50, r: 20 },
  ];
  let i = 0;
  const straight = () => [0.5, 0.5][i++ % 2];
  const res = fire(map, near, 's0-0', { x: 220, y: 100 }, straight);
  assert.strictEqual(res.projectiles.length, 21);
  assert.strictEqual(res.hp['s1-0'], 50 - 21);
  const far = [near[0], { ...near[1], x: 450 }];
  assert.strictEqual(fire(map, far, 's0-0', { x: 450, y: 100 }, straight).hp['s1-0'], 50, 'außer Reichweite');
});

test('Luftangriff trifft auch eigene Schafe, aber nie den Funker', () => {
  const map = { obstacles: [], army: 'normal' };
  const units = [
    { id: 's0-0', side: 's0', type: 'funker', x: 500, y: 300, hp: 10, r: 15 },
    { id: 's0-1', side: 's0', type: 'bazooka', x: 520, y: 300, hp: 20, r: 15 },
    { id: 's1-0', side: 's1', type: 'mg', x: 800, y: 300, hp: 40, r: 16 },
  ];
  const res = fire(map, units, 's0-0', { x: 510, y: 300 }, () => 0.5);
  assert.strictEqual(res.planes.length, 3);
  assert.strictEqual(res.explosions.length, 6);
  assert.strictEqual(res.hp['s0-0'], 10);
  assert.ok(res.hp['s0-1'] < 20, 'eigenes Schaf getroffen');
  assert.strictEqual(res.hp['s1-0'], 40);
  assert.ok(res.duration > 1500);
});

test('Ablauf: Ansage, Fahren mit Kollision, Zielen, Schuss, nächste Armee', () => {
  const { g } = setup(2);
  assert.strictEqual(g.phase, 'ready');
  const first = g.turn.side;
  const p = shooter(g);
  assert.ok(g.action(p, { type: 'go' }).ok);
  assert.strictEqual(g.phase, 'turn');
  const unit = g.currentUnit();
  const x0 = unit.x;
  const dir = unit.x < 500 ? 1 : -1;
  assert.ok(g.draw(p, { op: 'input', x: dir, y: 0 }).ok);
  g.lastTick = Date.now() - 100;
  g.tick();
  assert.ok(Math.abs(unit.x - x0) > 3, 'ist gefahren');
  assert.ok(g.lobby.sent.some((m) => m.event === 'ks-pos'));
  const other = [...g.lobby.players.values()].find((q) => q.id !== p.id);
  assert.ok(g.draw(other, { op: 'input', x: 1, y: 0 }).error);
  assert.ok(g.action(other, { type: 'fire', x: 500, y: 300 }).error);
  const res = g.action(p, { type: 'fire', x: 500, y: 320 });
  assert.ok(res.ok, res.error);
  assert.strictEqual(g.phase, 'firing');
  assert.ok(g.shot.duration > 0);
  finishFire(g);
  assert.strictEqual(g.phase, 'ready');
  assert.notStrictEqual(g.turn.side, first);
  g.dispose();
});

test('Fahren: Hindernisse und andere Schafe blocken, nach der Fahrzeit nur noch zielen', () => {
  const { g } = setup(2, { map: 'wiesen' });
  place(g, [['s0-0', 'bazooka', 220, 320], ['s0-1', 'mg', 300, 400], ['s1-0', 'mg', 800, 300]]);
  startTurn(g, 's0-0');
  const p = shooter(g);
  g.draw(p, { op: 'input', x: 1, y: 0 });
  for (let i = 0; i < 20; i++) {
    g.lastTick = Date.now() - 100;
    g.tick();
  }
  const u = g.currentUnit();
  // Felsen bei (290,320) mit Radius 26: das Schaf bleibt davor stehen
  assert.ok(u.x > 240 && Math.hypot(u.x - 290, u.y - 320) >= 26 + u.r - 0.5, `steht bei ${u.x},${u.y}`);
  g.turn.moveEnd = Date.now() - 1;
  const before = { x: u.x, y: u.y };
  g.draw(p, { op: 'input', x: 0, y: 1 });
  g.lastTick = Date.now() - 100;
  g.tick();
  assert.deepStrictEqual({ x: u.x, y: u.y }, before);
  g.draw(p, { op: 'aim', x: 800, y: 300 });
  g.tick();
  assert.ok(Math.abs(u.f - Math.atan2(300 - u.y, 800 - u.x)) < 1e-9, 'dreht zum Ziel');
  g.dispose();
});

test('Medipack macht die ganze Armee gesund und verschwindet', () => {
  const { g } = setup(2, { map: 'wiesen' });
  const kit = g.medkits[0];
  place(g, [['s0-0', 'mg', kit.x - 40, kit.y, 5], ['s0-1', 'panzer', 100, 100, 7], ['s1-0', 'mg', 900, 300, 3]]);
  startTurn(g, 's0-0');
  const p = shooter(g);
  g.draw(p, { op: 'input', x: 1, y: 0 });
  for (let i = 0; i < 10 && !kit.used; i++) {
    g.lastTick = Date.now() - 100;
    g.tick();
  }
  assert.ok(kit.used);
  assert.strictEqual(g.units.find((u) => u.id === 's0-0').hp, 40);
  assert.strictEqual(g.units.find((u) => u.id === 's0-1').hp, 50);
  assert.strictEqual(g.units.find((u) => u.id === 's1-0').hp, 3);
  assert.strictEqual(g.stats[p.id].medkits, 1);
  g.dispose();
});

test('Sieg, wenn die letzte gegnerische Einheit fällt; wer sich mit dem letzten Schuss selbst erledigt, verliert', () => {
  let { g } = setup(2, { map: 'wiesen' });
  place(g, [['s0-0', 'panzer', 600, 120], ['s1-0', 'bazooka', 750, 120, 10]]);
  startTurn(g, 's0-0');
  g.action(shooter(g), { type: 'fire', x: 750, y: 120 });
  finishFire(g);
  assert.strictEqual(g.phase, 'final');
  assert.strictEqual(g.result.winner, 's0');
  g.dispose();

  ({ g } = setup(2, { map: 'wiesen' }));
  // Panzer schießt aus nächster Nähe: beide letzten Schafe sterben, der Schütze verliert
  place(g, [['s0-0', 'panzer', 600, 120, 5], ['s1-0', 'bazooka', 645, 120, 5]]);
  startTurn(g, 's0-0');
  g.action(shooter(g), { type: 'fire', x: 645, y: 120 });
  assert.strictEqual(g.units.every((u) => u.hp === 0), true);
  finishFire(g);
  assert.strictEqual(g.result.winner, 's1');
  g.dispose();
});

test('Gewinnsätze: nächster Satz mit neuer Aufstellung, Startseite wechselt', () => {
  const { g } = setup(2, { sets: 2 });
  const start = g.turn.side;
  const enemy = g.sides.find((s) => s.id !== start);
  for (const u of g.units) if (u.side === enemy.id) u.hp = 0;
  g.units.find((u) => u.side === enemy.id).hp = 1;
  const last = g.units.find((u) => u.side === enemy.id && u.hp === 1);
  place(g, [[`${start}-0`, 'panzer', 600, 120], [last.id, 'bazooka', 750, 120, 1]]);
  startTurn(g, `${start}-0`);
  g.action(shooter(g), { type: 'fire', x: 750, y: 120 });
  finishFire(g);
  assert.strictEqual(g.phase, 'setEnd');
  g.next();
  assert.strictEqual(g.setNo, 2);
  assert.strictEqual(g.units.length, 20);
  assert.notStrictEqual(g.turn.side, start);
  g.dispose();
});

test('Zeit abgelaufen: Zug verfällt; Host kann überspringen', () => {
  const { g } = setup(3);
  const first = g.turn.side;
  g.go();
  g.timeUp();
  assert.strictEqual(g.phase, 'ready');
  assert.notStrictEqual(g.turn.side, first);
  const second = g.turn.side;
  assert.ok(g.action(g.lobby.players.get('p1'), { type: 'force' }).ok);
  assert.notStrictEqual(g.turn.side, second);
  g.dispose();
});

test('Einheiten reihum in geloster Reihenfolge, freie Wahl als Einstellung', () => {
  const { g } = setup(2);
  const side = g.currentSide();
  const seen = [g.turn.unitId];
  for (let i = 0; i < 9; i++) {
    g.beginTurn(side);
    seen.push(g.turn.unitId);
  }
  assert.strictEqual(new Set(seen).size, 10, 'jede Einheit einmal');
  assert.ok(g.action(shooter(g), { type: 'select', unitId: seen[0] }).error, 'aus = gelost');
  g.dispose();

  const free = setup(2, { freeChoice: true }).g;
  const own = free.units.find((u) => u.side === free.turn.side && u.id !== free.turn.unitId);
  assert.ok(free.action(shooter(free), { type: 'select', unitId: own.id }).ok);
  assert.strictEqual(free.turn.unitId, own.id);
  const foreign = free.units.find((u) => u.side !== free.turn.side);
  assert.ok(free.action(shooter(free), { type: 'select', unitId: foreign.id }).error);
  free.dispose();
});

test('Geteiltes Gerät: Zug wartet auf „Los“, der Gast steuert über das Gerät des Gastgebers', () => {
  const lobby = fakeLobby(1);
  lobby.players.set('g1', { id: 'g1', name: 'Gast', connected: true, isHost: false, teamId: null, guestOf: 'p1' });
  const g = new Kampfschafe(lobby);
  g.start();
  assert.ok(g.turn.needsGo);
  const host = lobby.players.get('p1');
  assert.ok(g.controls(host), 'beide Schafarmeen laufen über das eine Handy');
  assert.ok(g.action(host, { type: 'go' }).ok);
  assert.strictEqual(g.phase, 'turn');
  g.dispose();
});

test('Ohne Teams höchstens vier Armeen, mit Teams wird reihum gesteuert', () => {
  assert.throws(() => setup(5));
  const lobby = fakeLobby(4, { teamMode: true });
  ['t1', 't1', 't2', 't2'].forEach((t, i) => { lobby.players.get(`p${i + 1}`).teamId = t; });
  const g = new Kampfschafe(lobby);
  g.start();
  assert.strictEqual(g.sides.length, 2);
  const side = g.currentSide();
  const a = g.turn.shooterId;
  g.beginTurn(side);
  assert.notStrictEqual(g.turn.shooterId, a);
  g.dispose();
});

test('Einstellungen werden geprüft, ohne Fernseher spielt der Host mit', () => {
  const s = Kampfschafe.sanitizeSettings(Kampfschafe.defaultSettings(), { map: 'mond', army: 7, turnTime: 10, sets: 3, medkits: 0 });
  assert.strictEqual(s.map, 'wiesen');
  assert.strictEqual(s.army, 0);
  assert.strictEqual(s.turnTime, 10);
  assert.strictEqual(s.sets, 3);
  assert.strictEqual(s.medkits, false);
  const settings = { hostPlays: false, game: { tv: false } };
  Kampfschafe.syncSettings(settings);
  assert.strictEqual(settings.hostPlays, true);
});

test('Friendly Fire: das eigene Schaf im Weg fängt den Schuss ab', () => {
  const map = { obstacles: [], army: 'normal' };
  const units = [
    { id: 's0-0', side: 's0', type: 'bazooka', x: 100, y: 100, hp: 20, r: 15 },
    { id: 's0-1', side: 's0', type: 'mg', x: 160, y: 100, hp: 40, r: 16 },
    { id: 's1-0', side: 's1', type: 'mg', x: 400, y: 100, hp: 40, r: 16 },
    { id: 's1-1', side: 's1', type: 'mg', x: 500, y: 100, hp: 40, r: 16 },
  ];
  const res = fire(map, units, 's0-0', { x: 500, y: 100 });
  assert.ok(res.hp['s0-1'] < 40);
  assert.strictEqual(res.hp['s1-0'], 40);
  assert.strictEqual(res.hp['s1-1'], 40);
});

test('Jeep: schnell, Bord-MG mit 12 Schuss', () => {
  const map = { obstacles: [], army: 'normal' };
  const units = [
    { id: 's0-0', side: 's0', type: 'jeep', x: 100, y: 100, hp: 25, r: 16 },
    { id: 's1-0', side: 's1', type: 'panzer', x: 300, y: 100, hp: 50, r: 20 },
  ];
  const res = fire(map, units, 's0-0', { x: 300, y: 100 }, () => 0.5);
  assert.strictEqual(res.projectiles.length, 12);
  assert.strictEqual(res.hp['s1-0'], 38);
  assert.ok(World.TYPES.jeep.speed > World.TYPES.heli.speed);
});

test('Hindernisse: Bodentruppen kommen weder durch Bäume noch durchs Wasserloch, der Hubschrauber schon', () => {
  const { g } = setup(2, { map: 'wiesen' });
  // Teich in der Mitte bei (500,320)
  place(g, [['s0-0', 'jeep', 420, 320], ['s0-1', 'heli', 420, 400], ['s1-0', 'mg', 900, 300]]);
  for (const id of ['s0-0', 's0-1']) {
    g.clearTimers();
    g.phase = 'ready';
    startTurn(g, id);
    g.draw(shooter(g), { op: 'input', x: 1, y: 0 });
    for (let i = 0; i < 20; i++) {
      g.lastTick = Date.now() - 100;
      g.tick();
    }
  }
  const jeep = g.units.find((u) => u.id === 's0-0');
  const heli = g.units.find((u) => u.id === 's0-1');
  assert.ok(jeep.x < 500 - 55 - jeep.r + 1, `Jeep bei ${jeep.x}`);
  assert.ok(heli.x > 560, `Hubschrauber bei ${heli.x}`);
  g.dispose();
});
