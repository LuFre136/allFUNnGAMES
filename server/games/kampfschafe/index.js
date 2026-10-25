// Kampfschafe (nach dem ICQ-Spiel Warsheep): Zwei bis vier Schafarmeen stehen sich gegenüber. Reihum ist eine
// Einheit dran und hat ein paar Sekunden, um zu fahren, zu zielen und zu schießen. Wer als Letzter noch Schafe
// hat, gewinnt. Jede Armee gehört einem Spieler oder einem Team.

const crypto = require('crypto');
const World = require('../../../public/js/kampfschafe-world');
const { fire } = require('./combat');
const { shuffle, pick } = require('../../util');

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;
const MAX_SIDES = 4;
const ARMY_SIZES = [0, 6, 10]; // 0 = automatisch
const TURN_TIMES = [10, 15, 20, 30];
const SETS = [1, 2, 3];
const MAP_CHOICES = [...World.MAP_IDS, 'random'];
const LOG_SIZE = 8;
const TICK_MS = 33;
const READY_MS = 2500; // kurze Ansage, wer gleich dran ist
const SHARED_READY_MS = 20000; // geteiltes Handy: wartet auf „Los“, höchstens so lange
const FIRE_PAUSE_MS = 500;
const AIM_SHARE = 0.2; // im letzten Fünftel nur noch drehen und schießen (Original: 2 von 10 Sekunden)
const MAX_INPUT_PER_SEC = 40;

const ARMY_COLORS = [
  { name: 'Rot', color: '#dc2626' },
  { name: 'Blau', color: '#2563eb' },
  { name: 'Grün', color: '#16a34a' },
  { name: 'Gelb', color: '#ca8a04' },
];

const KILL_LINES = ['Mäh!', 'Määäh!', 'Wolle weg!', 'Schäfchen zählen …', 'Ab auf die Weide im Himmel.'];

class Kampfschafe {
  constructor(lobby) {
    this.lobby = lobby;
    this.sides = [];
    this.units = [];
    this.medkits = [];
    this.setNo = 0;
    this.wins = {};
    this.results = [];
    this.stats = {};
    this.log = [];
    this.logSeq = 0;
    this.shot = null;
    this.shotSeq = 0;
    this.turn = null;
    this.turnSeq = 0;
    this.phaseTimer = null;
    this.tickTimer = null;
    this.outOrder = [];
    this.setOver = false;
    this.inputWindow = { start: 0, count: 0 };
  }

  static meta() {
    return {
      id: 'kampfschafe',
      name: 'Kampfschafe',
      icon: '🐑',
      description: 'Schafarmeen im Gefecht wie bei ICQ Warsheep: fahren, zielen, feuern … in ein paar Sekunden.',
      players: `${MIN_PLAYERS}–${MAX_PLAYERS} Spieler`,
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      available: true,
      teams: 'optional',
      maxTeams: MAX_SIDES,
      sharedDevice: true, // nichts ist geheim, ein Handy kann reihum gehen
    };
  }

  static defaultSettings() {
    return {
      teamMode: false,
      tv: true,
      map: 'wiesen',
      army: 0,
      turnTime: 15,
      sets: 1,
      medkits: true,
      freeChoice: false,
    };
  }

  static sanitizeSettings(current, patch) {
    const next = { ...current };
    for (const k of ['teamMode', 'tv', 'medkits', 'freeChoice']) if (patch[k] !== undefined) next[k] = Boolean(patch[k]);
    if (patch.map !== undefined && MAP_CHOICES.includes(patch.map)) next.map = patch.map;
    if (patch.army !== undefined && ARMY_SIZES.includes(Number(patch.army))) next.army = Number(patch.army);
    if (patch.turnTime !== undefined && TURN_TIMES.includes(Number(patch.turnTime))) next.turnTime = Number(patch.turnTime);
    if (patch.sets !== undefined && SETS.includes(Number(patch.sets))) next.sets = Number(patch.sets);
    return next;
  }

  // Ohne Fernseher spielt das Host-Gerät immer mit
  static syncSettings(settings) {
    if (!settings.game.tv) settings.hostPlays = true;
  }

  static availableCount() {
    return 0;
  }

  get settings() {
    return this.lobby.settings.game;
  }

  get map() {
    return World.MAPS[this.mapId];
  }

  addLog(text) {
    this.log.push({ seq: ++this.logSeq, text });
    if (this.log.length > LOG_SIZE) this.log.shift();
  }

  // ---------- Armeen ----------

  start() {
    const colors = shuffle([...ARMY_COLORS.keys()]);
    if (this.settings.teamMode) {
      const teams = this.lobby.teams.filter((t) => this.lobby.playersInTeam(t.id).length).slice(0, MAX_SIDES);
      if (teams.length < 2) throw new Error('Mindestens zwei Teams brauchen Spieler.');
      this.sides = teams.map((t, i) => ({ id: `s${i}`, teamId: t.id, playerIds: null, color: colors[i], turns: 0 }));
    } else {
      const active = this.lobby.activePlayers();
      if (active.length < 2) throw new Error('Kampfschafe braucht mindestens zwei Spieler.');
      if (active.length > MAX_SIDES) throw new Error(`Ohne Teams können höchstens ${MAX_SIDES} spielen. Schaltet die Teams ein.`);
      this.sides = shuffle(active).map((p, i) => ({ id: `s${i}`, teamId: null, playerIds: [p.id], color: colors[i], turns: 0 }));
    }
    for (const s of this.sides) this.wins[s.id] = 0;
    this.startSet();
  }

  members(side) {
    if (side.teamId) return this.lobby.playersInTeam(side.teamId);
    return side.playerIds.map((id) => this.lobby.players.get(id)).filter(Boolean);
  }

  present(side) {
    return this.members(side).some((p) => p.connected);
  }

  sideName(side) {
    if (side.teamId) return this.lobby.teamById(side.teamId)?.name || ARMY_COLORS[side.color].name;
    return this.members(side)[0]?.name || ARMY_COLORS[side.color].name;
  }

  sideById(id) {
    return this.sides.find((s) => s.id === id) || null;
  }

  aliveUnits(side) {
    return this.units.filter((u) => u.hp > 0 && u.side === side.id);
  }

  totalHp(side) {
    return this.aliveUnits(side).reduce((sum, u) => sum + u.hp, 0);
  }

  stat(playerId) {
    if (!this.stats[playerId]) this.stats[playerId] = { damage: 0, friendly: 0, kills: 0, medkits: 0, shots: 0 };
    return this.stats[playerId];
  }

  armySize() {
    if (this.settings.army) return this.settings.army;
    return this.sides.length === 2 ? 10 : 6;
  }

  // ---------- Ablauf ----------

  startSet() {
    this.setNo++;
    this.mapId = this.settings.map === 'random' ? pick(World.MAP_IDS) : this.settings.map;
    const map = this.map;
    const kinds = World.ARMIES[map.army][this.armySize()];
    const groups = World.layout(this.mapId, this.sides.length, kinds.length);
    this.units = [];
    this.sides.forEach((s, i) => {
      const facing = Math.atan2(World.CENTER.y - groups[i][0].y, World.CENTER.x - groups[i][0].x);
      groups[i].forEach((p, k) => {
        const type = World.typeFor(map, kinds[k]);
        this.units.push({ id: `${s.id}-${k}`, side: s.id, type: type.key, x: p.x, y: p.y, f: facing, hp: type.hp, maxHp: type.hp, r: type.r });
      });
      // Die Reihenfolge der Einheiten wird gelost, wie im Original
      s.order = shuffle(groups[i].map((_, k) => `${s.id}-${k}`));
      s.ptr = 0;
    });
    this.medkits = this.settings.medkits ? map.medkits.map((m, i) => ({ id: `m${i}`, x: m.x, y: m.y, used: false })) : [];
    this.outOrder = [];
    this.setOver = false;
    this.shot = null;
    this.result = null;
    if (this.setNo === 1) this.startIndex = crypto.randomInt(this.sides.length);
    else this.startIndex = (this.startIndex + 1) % this.sides.length;
    this.beginTurn(this.sides[this.startIndex]);
  }

  // Wer auf einer Seite steuert: Teammitglieder wechseln sich ab
  pickShooter(side) {
    const members = this.members(side);
    const online = members.filter((p) => p.connected);
    const list = online.length ? online : members;
    if (!list.length) return null;
    return list[side.turns % list.length].id;
  }

  // Nächste lebende Einheit der Seite in der gelosten Reihenfolge
  nextUnit(side) {
    for (let k = 0; k < side.order.length; k++) {
      const id = side.order[(side.ptr + k) % side.order.length];
      const u = this.units.find((x) => x.id === id);
      if (u && u.hp > 0) {
        side.ptr = (side.ptr + k + 1) % side.order.length;
        return u;
      }
    }
    return null;
  }

  sharedDevice(playerId) {
    const p = this.lobby.players.get(playerId);
    if (!p) return false;
    if (p.guestOf) return true;
    return [...this.lobby.players.values()].some((q) => q.guestOf === p.id);
  }

  beginTurn(side) {
    this.clearTimers();
    const unit = this.nextUnit(side);
    side.turns++;
    this.turnSeq++;
    const shooterId = this.pickShooter(side);
    const shared = this.sharedDevice(shooterId);
    this.turn = {
      seq: this.turnSeq,
      side: side.id,
      unitId: unit.id,
      shooterId,
      needsGo: shared,
      readyEnd: Date.now() + (shared ? SHARED_READY_MS : READY_MS),
      moveEnd: null,
      end: null,
      target: null,
      input: { x: 0, y: 0 },
      moved: false,
    };
    this.phase = 'ready';
    this.phaseTimer = setTimeout(() => {
      this.phaseTimer = null;
      this.go();
      this.lobby.broadcast();
    }, this.turn.readyEnd - Date.now());
  }

  // Die Zeit läuft: fahren, dann nur noch zielen und schießen
  go() {
    if (this.phase !== 'ready') return;
    this.clearTimers();
    const total = this.settings.turnTime * 1000;
    const now = Date.now();
    this.turn.start = now;
    this.turn.moveEnd = now + Math.round(total * (1 - AIM_SHARE));
    this.turn.end = now + total;
    this.phase = 'turn';
    this.lastTick = now;
    this.tickTimer = setInterval(() => this.tick(), TICK_MS);
    this.phaseTimer = setTimeout(() => {
      this.phaseTimer = null;
      this.timeUp();
      this.lobby.broadcast();
    }, total);
  }

  currentSide() {
    return this.turn ? this.sideById(this.turn.side) : null;
  }

  currentUnit() {
    return this.turn ? this.units.find((u) => u.id === this.turn.unitId) || null : null;
  }

  // Die nächste Seite im Kreis, die noch Schafe hat (wer nicht da ist, wird übersprungen, solange es andere gibt)
  nextSide(from) {
    const idx = this.sides.findIndex((s) => s.id === from.id);
    const alive = [];
    for (let k = 1; k <= this.sides.length; k++) {
      const s = this.sides[(idx + k) % this.sides.length];
      if (this.aliveUnits(s).length) alive.push(s);
    }
    return alive.find((s) => this.present(s)) || alive[0] || from;
  }

  controls(player) {
    if (this.phase !== 'ready' && this.phase !== 'turn') return false;
    const shooter = this.lobby.players.get(this.turn?.shooterId);
    if (!shooter) return false;
    return shooter.id === player.id || shooter.guestOf === player.id;
  }

  // ---------- Bewegung ----------

  blockedAt(unit, x, y) {
    const type = World.typeFor(this.map, unit.type);
    if (World.blockedByTerrain(this.map, x, y, unit.r, type.flies)) return true;
    if (type.flies) return false;
    return this.units.some((u) => u.id !== unit.id && u.hp > 0 && !World.typeFor(this.map, u.type).flies
      && Math.hypot(u.x - x, u.y - y) < u.r + unit.r);
  }

  tick() {
    if (this.phase !== 'turn') return;
    const now = Date.now();
    const dt = Math.min(0.1, (now - this.lastTick) / 1000);
    this.lastTick = now;
    const unit = this.currentUnit();
    if (!unit) return;
    let changed = false;
    let full = false;
    const { x: ix, y: iy } = this.turn.input;
    const len = Math.hypot(ix, iy);
    if (len > 0.05 && now < this.turn.moveEnd) {
      const type = World.typeFor(this.map, unit.type);
      const step = type.speed * dt * Math.min(1, len);
      const dx = (ix / len) * step;
      const dy = (iy / len) * step;
      // Erst direkt, sonst an der Kante entlang rutschen
      const tries = [[dx, dy], [dx, 0], [0, dy]];
      for (const [mx, my] of tries) {
        if (!mx && !my) continue;
        if (!this.blockedAt(unit, unit.x + mx, unit.y + my) || this.blockedAt(unit, unit.x, unit.y)) {
          unit.x = Math.round((unit.x + mx) * 10) / 10;
          unit.y = Math.round((unit.y + my) * 10) / 10;
          changed = true;
          this.turn.moved = true;
          break;
        }
      }
      if (!this.turn.target) unit.f = Math.atan2(iy, ix);
      changed = true;
      if (!type.flies) full = this.pickupMedkits(unit) || full;
    }
    if (this.turn.target) {
      const f = Math.atan2(this.turn.target.y - unit.y, this.turn.target.x - unit.x);
      if (f !== unit.f) {
        unit.f = f;
        changed = true;
      }
    }
    if (full) this.lobby.broadcast();
    else if (changed || this.turn.dirty) this.sendPos(unit);
    this.turn.dirty = false;
  }

  pickupMedkits(unit) {
    let took = false;
    for (const m of this.medkits) {
      if (m.used || Math.hypot(m.x - unit.x, m.y - unit.y) >= unit.r + World.MEDKIT_R) continue;
      m.used = true;
      took = true;
      const side = this.sideById(unit.side);
      for (const u of this.aliveUnits(side)) u.hp = u.maxHp;
      this.stat(this.turn.shooterId).medkits++;
      this.addLog(`🩹 ${this.lobby.players.get(this.turn.shooterId)?.name || this.sideName(side)} schnappt sich ein Medipack: Alle Schafe wieder gesund!`);
    }
    return took;
  }

  // Position live an alle Geräte (ohne kompletten Spielstand)
  sendPos(unit) {
    const t = this.turn;
    const payload = { turn: t.seq, id: unit.id, x: unit.x, y: unit.y, f: Math.round(unit.f * 1000) / 1000, target: t.target };
    for (const p of this.lobby.players.values()) if (p.socketId) this.lobby.send(p, 'ks-pos', payload);
  }

  // Steuerbefehle kommen schnell und ohne Neuzeichnen (wie die Striche beim Montagsmaler)
  draw(player, data = {}) {
    if (!this.controls(player)) return { error: 'Du bist nicht dran.' };
    const now = Date.now();
    if (now - this.inputWindow.start > 1000) this.inputWindow = { start: now, count: 0 };
    if (++this.inputWindow.count > MAX_INPUT_PER_SEC) return { ok: true };
    if (data.op === 'input') {
      const x = Number(data.x);
      const y = Number(data.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return { error: 'Ungültig.' };
      const len = Math.hypot(x, y);
      this.turn.input = len > 1 ? { x: x / len, y: y / len } : { x, y };
      return { ok: true };
    }
    if (data.op === 'aim') {
      const target = this.cleanTarget(data);
      if (!target) return { error: 'Ungültig.' };
      this.turn.target = target;
      this.turn.dirty = true;
      if (this.phase === 'ready') this.sendPos(this.currentUnit());
      return { ok: true };
    }
    return { error: 'Unbekannt.' };
  }

  cleanTarget(data) {
    const x = Number(data.x);
    const y = Number(data.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x: Math.round(Math.max(0, Math.min(World.W, x))), y: Math.round(Math.max(0, Math.min(World.H, y))) };
  }

  // ---------- Schießen ----------

  shoot(player, data) {
    if (this.phase === 'ready' && this.controls(player)) this.go();
    if (this.phase !== 'turn') return { error: 'Gerade geht das nicht.' };
    if (!this.controls(player)) return { error: 'Du bist nicht dran.' };
    const unit = this.currentUnit();
    const target = this.cleanTarget(data) || this.turn.target;
    if (!target) return { error: 'Tippe erst auf das Ziel.' };
    this.clearTimers();
    const side = this.currentSide();
    const before = Object.fromEntries(this.units.map((u) => [u.id, u.hp]));
    const aliveBefore = Object.fromEntries(this.sides.map((s) => [s.id, this.aliveUnits(s).length]));
    const hpBefore = Object.fromEntries(this.sides.map((s) => [s.id, this.totalHp(s)]));
    const result = fire(this.map, this.units, unit.id, target, Math.random);
    unit.f = result.angle;
    for (const u of this.units) u.hp = result.hp[u.id];
    this.shotSeq++;
    this.shot = {
      seq: this.shotSeq,
      turn: this.turn.seq,
      side: side.id,
      unitId: unit.id,
      type: unit.type,
      shooterId: this.turn.shooterId,
      from: { x: unit.x, y: unit.y },
      target,
      angle: result.angle,
      projectiles: result.projectiles,
      explosions: result.explosions,
      planes: result.planes,
      hits: result.hits,
      duration: result.duration,
      startAt: Date.now(),
      before,
      aliveBefore,
      logBefore: this.logSeq, // Meldungen zu diesem Schuss erst zeigen, wenn er abgespielt ist
    };
    this.resolve(side, unit, result.hits, hpBefore);
    this.phase = 'firing';
    this.phaseTimer = setTimeout(() => {
      this.phaseTimer = null;
      this.afterFire();
      this.lobby.broadcast();
    }, result.duration + FIRE_PAUSE_MS);
    return { ok: true };
  }

  // Wertet einen Schuss aus: Schaden, wer ist raus, ist der Satz vorbei?
  resolve(side, unit, hits, hpBefore) {
    const st = this.stat(this.turn.shooterId);
    st.shots++;
    let enemy = 0;
    let own = 0;
    const kills = [];
    for (const h of hits) {
      const target = this.units.find((u) => u.id === h.id);
      if (target.side === side.id) own += h.dmg;
      else enemy += h.dmg;
      if (h.kill) kills.push(target);
    }
    st.damage += enemy;
    st.friendly += own;
    st.kills += kills.filter((u) => u.side !== side.id).length;

    const shooter = this.lobby.players.get(this.turn.shooterId)?.name || this.sideName(side);
    const type = World.typeFor(this.map, unit.type);
    const enemyKills = kills.filter((u) => u.side !== side.id).length;
    const ownKills = kills.length - enemyKills;
    let text = `${type.badge} ${shooter} (${type.name})`;
    if (!enemy && !own) text += ' trifft nichts.';
    else if (enemy) text += ` macht ${enemy} Schaden${enemyKills ? `, ${enemyKills === 1 ? 'ein Schaf' : `${enemyKills} Schafe`} erledigt. ${pick(KILL_LINES)}` : '.'}`;
    else text += ` trifft nur die eigenen (${own} Schaden).`;
    if (own && enemy) text += ` Dazu ${own} Schaden an den eigenen.`;
    if (ownKills) text += ` 🙈 ${ownKills === 1 ? 'Ein eigenes Schaf' : `${ownKills} eigene Schafe`} erwischt!`;
    this.addLog(text);

    const nowOut = this.sides.filter((s) => !this.outOrder.includes(s.id) && this.aliveUnits(s).length === 0);
    for (const s of nowOut) {
      this.outOrder.push(s.id);
      this.addLog(`💀 ${this.sideName(s)} hat keine Schafe mehr.`);
    }
    const remaining = this.sides.filter((s) => this.aliveUnits(s).length > 0);
    if (remaining.length === 1) {
      this.finishSet(remaining[0]);
    } else if (remaining.length === 0) {
      // Unentschieden gibt es nicht: Wer mit dem letzten Schuss auch sich selbst erledigt, verliert
      const others = nowOut.filter((s) => s.id !== side.id);
      others.sort((a, b) => hpBefore[b.id] - hpBefore[a.id]);
      this.finishSet(others[0] || side);
    } else {
      this.pendingSide = this.nextSide(side).id;
    }
  }

  finishSet(winner) {
    this.pendingSide = null;
    this.wins[winner.id]++;
    this.addLog(`🏆 ${this.sideName(winner)} gewinnt ${this.settings.sets > 1 ? 'den Satz' : 'die Schlacht'}!`);
    this.result = { winner: winner.id, left: this.aliveUnits(winner).length, setNo: this.setNo };
    this.results.push({ ...this.result, map: this.mapId });
    this.setOver = true;
  }

  afterFire() {
    if (this.phase !== 'firing') return;
    if (this.setOver) {
      this.setOver = false;
      this.turn = null;
      const best = Math.max(...Object.values(this.wins));
      this.phase = best >= this.settings.sets ? 'final' : 'setEnd';
      return;
    }
    const side = this.sideById(this.pendingSide);
    this.pendingSide = null;
    this.beginTurn(side);
  }

  timeUp() {
    if (this.phase !== 'turn') return;
    const side = this.currentSide();
    this.addLog(`⏱ ${this.lobby.players.get(this.turn.shooterId)?.name || this.sideName(side)} hat nicht geschossen, die Zeit ist um.`);
    this.beginTurn(this.nextSide(side));
  }

  skip() {
    if (this.phase !== 'ready' && this.phase !== 'turn') return { error: 'Gerade ist niemand am Zug.' };
    const side = this.currentSide();
    this.addLog(`⏭ ${this.lobby.players.get(this.turn.shooterId)?.name || this.sideName(side)} wird übersprungen.`);
    this.beginTurn(this.nextSide(side));
    return { ok: true };
  }

  // Freie Wahl (Einstellung): andere eigene Einheit nehmen, solange noch nichts bewegt wurde
  select(player, { unitId }) {
    if (!this.settings.freeChoice) return { error: 'Die Einheit wird gelost.' };
    if (!this.controls(player)) return { error: 'Du bist nicht dran.' };
    if (this.turn.moved) return { error: 'Du bist schon losgefahren.' };
    const unit = this.units.find((u) => u.id === unitId);
    if (!unit || unit.hp <= 0 || unit.side !== this.turn.side) return { error: 'Nimm eines deiner eigenen Schafe.' };
    this.turn.unitId = unit.id;
    this.turn.target = null;
    return { ok: true };
  }

  next() {
    if (this.phase !== 'setEnd') return;
    this.startSet();
  }

  clearTimers() {
    clearTimeout(this.phaseTimer);
    clearInterval(this.tickTimer);
    this.phaseTimer = null;
    this.tickTimer = null;
  }

  action(player, data) {
    switch (data.type) {
      case 'go':
        if (!this.controls(player) || this.phase !== 'ready') return { error: 'Gerade geht das nicht.' };
        this.go();
        return { ok: true };
      case 'fire':
        return this.shoot(player, data);
      case 'select':
        return this.select(player, data);
      case 'force':
        if (!player.isHost) return { error: 'Nur der Host darf das.' };
        return this.skip();
      default:
        return { error: 'Unbekannte Aktion.' };
    }
  }

  playersChanged() {
    // Ist die Person am Zug weg, übernimmt jemand anderes aus dem Team
    if (this.phase !== 'ready' && this.phase !== 'turn') return;
    const side = this.currentSide();
    const shooter = this.lobby.players.get(this.turn.shooterId);
    if (side && side.teamId && (!shooter || !shooter.connected || shooter.teamId !== side.teamId)) {
      const replacement = this.members(side).find((p) => p.connected);
      if (replacement) this.turn.shooterId = replacement.id;
    }
  }

  // ---------- Ansicht ----------

  standings() {
    const lasted = (s) => (this.outOrder.includes(s.id) ? this.outOrder.indexOf(s.id) : this.sides.length);
    return this.sides
      .map((s) => ({
        id: s.id,
        wins: this.wins[s.id],
        lasted: lasted(s),
        damage: this.members(s).reduce((sum, p) => sum + (this.stats[p.id]?.damage || 0), 0),
      }))
      .sort((a, b) => b.wins - a.wins || b.lasted - a.lasted || b.damage - a.damage);
  }

  awards() {
    const entries = Object.entries(this.stats);
    const top = (key) => {
      const best = Math.max(0, ...entries.map(([, s]) => s[key]));
      return best > 0 ? { ids: entries.filter(([, s]) => s[key] === best).map(([id]) => id), value: best } : null;
    };
    return { sniper: top('kills'), friendly: top('friendly'), medic: top('medkits') };
  }

  view(viewer) {
    const mySides = this.sides.filter((s) => this.members(s).some((p) => p.id === viewer.id || p.guestOf === viewer.id)).map((s) => s.id);
    const t = this.turn;
    return {
      phase: this.phase,
      setNo: this.setNo,
      sets: this.settings.sets,
      mapId: this.mapId,
      tv: this.settings.tv,
      freeChoice: this.settings.freeChoice,
      turnTime: this.settings.turnTime,
      teamMode: Boolean(this.settings.teamMode),
      sides: this.sides.map((s) => {
        const team = s.teamId ? this.lobby.teamById(s.teamId) : null;
        return {
          id: s.id,
          name: this.sideName(s),
          teamId: s.teamId,
          members: this.members(s).map((p) => p.id),
          color: team?.color || ARMY_COLORS[s.color].color,
          colorName: ARMY_COLORS[s.color].name,
          alive: this.aliveUnits(s).length,
          hp: this.totalHp(s),
          wins: this.wins[s.id],
          out: this.outOrder.includes(s.id),
          present: this.present(s),
        };
      }),
      units: this.units.map((u) => ({ id: u.id, side: u.side, type: u.type, x: u.x, y: u.y, f: Math.round(u.f * 1000) / 1000, hp: u.hp, maxHp: u.maxHp, r: u.r })),
      medkits: this.medkits,
      turn: t && (this.phase === 'ready' || this.phase === 'turn')
        ? { seq: t.seq, side: t.side, unitId: t.unitId, shooterId: t.shooterId, needsGo: t.needsGo, readyEnd: t.readyEnd, start: t.start ?? null, moveEnd: t.moveEnd, end: t.end, target: t.target, moved: t.moved }
        : null,
      mySides,
      canAct: this.controls(viewer),
      shot: this.shot,
      result: this.result,
      results: this.results,
      standings: this.phase === 'final' ? this.standings() : null,
      awards: this.phase === 'final' ? this.awards() : null,
      log: this.log,
      deadline: null,
      paused: false,
      serverNow: Date.now(),
    };
  }

  dispose() {
    this.clearTimers();
  }
}

Kampfschafe.ARMY_COLORS = ARMY_COLORS;
module.exports = Kampfschafe;
