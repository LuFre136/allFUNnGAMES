// Sumo Zoo (nach dem ICQ-Spiel Zoopaloola): Jede Seite hat ein paar Zootiere auf einem Felsen. Reihum schubst
// man eines seiner eigenen Tiere los und versucht, die Tiere der anderen über die Kante zu stoßen. Wer als
// Letzter noch Tiere oben hat, gewinnt den Satz. Bis zu vier Seiten, jede ein Spieler oder ein Team.

const crypto = require('crypto');
const World = require('../../../public/js/sumozoo-world');
const { simulate } = require('./physics');
const { shuffle, pick } = require('../../util');

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;
const MAX_SIDES = 4;
const ANIMAL_COUNTS = [0, 3, 4, 5, 6, 7, 8]; // 0 = automatisch
const SETS = [1, 2, 3];
const TIME_LIMITS = [0, 20, 40];
const MAP_CHOICES = [...World.MAP_IDS, 'random'];
const LAYOUTS = ['oval', 'groups'];
const LOG_SIZE = 8;
const ROLL_PAUSE_MS = 700; // kurze Pause nach dem Stoß, bevor der Nächste dran ist
const MAX_AIM_PER_SEC = 25;

// Tierarten: nur Optik, alle gleich groß und gleich schwer
const SPECIES = [
  { key: 'affe', emoji: '🐒', name: 'Affen', own: 'einen eigenen Affen', color: '#d97706' },
  { key: 'elefant', emoji: '🐘', name: 'Elefanten', own: 'einen eigenen Elefanten', color: '#64748b' },
  { key: 'nilpferd', emoji: '🦛', name: 'Nilpferde', own: 'ein eigenes Nilpferd', color: '#a855f7' },
  { key: 'zebra', emoji: '🦓', name: 'Zebras', own: 'ein eigenes Zebra', color: '#111827' },
  { key: 'loewe', emoji: '🦁', name: 'Löwen', own: 'einen eigenen Löwen', color: '#eab308' },
  { key: 'panda', emoji: '🐼', name: 'Pandas', own: 'einen eigenen Panda', color: '#16a34a' },
  { key: 'pinguin', emoji: '🐧', name: 'Pinguine', own: 'einen eigenen Pinguin', color: '#0ea5e9' },
  { key: 'frosch', emoji: '🐸', name: 'Frösche', own: 'einen eigenen Frosch', color: '#e11d48' },
];

const FALL_LINES = ['Platsch!', 'Tschüss!', 'Und weg!', 'Abgang!', 'Bye bye!'];

class SumoZoo {
  constructor(lobby) {
    this.lobby = lobby;
    this.sides = [];
    this.animals = [];
    this.setNo = 0;
    this.wins = {};
    this.results = [];
    this.stats = {}; // pro Spieler: Treffer, Eigentore, bester Stoß
    this.log = [];
    this.logSeq = 0;
    this.shot = null;
    this.shotSeq = 0;
    this.turnSeq = 0;
    this.timer = null;
    this.deadline = null;
    this.rollTimer = null;
    this.setOver = false;
    this.outOrder = [];
    this.aimWindow = { start: 0, count: 0 };
  }

  static meta() {
    return {
      id: 'sumozoo',
      name: 'Sumo Zoo',
      icon: '🐘',
      description: 'Schubs die Tiere der anderen vom Felsen … und pass auf deine eigenen auf.',
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
      map: 'plateau',
      animals: 0,
      layout: 'oval',
      extraTurn: true,
      sets: 1,
      timeLimit: 0,
      aimHelp: true,
    };
  }

  static sanitizeSettings(current, patch) {
    const next = { ...current };
    for (const k of ['teamMode', 'tv', 'extraTurn', 'aimHelp']) if (patch[k] !== undefined) next[k] = Boolean(patch[k]);
    if (patch.map !== undefined && MAP_CHOICES.includes(patch.map)) next.map = patch.map;
    if (patch.layout !== undefined && LAYOUTS.includes(patch.layout)) next.layout = patch.layout;
    if (patch.animals !== undefined && ANIMAL_COUNTS.includes(Number(patch.animals))) next.animals = Number(patch.animals);
    if (patch.sets !== undefined && SETS.includes(Number(patch.sets))) next.sets = Number(patch.sets);
    if (patch.timeLimit !== undefined && TIME_LIMITS.includes(Number(patch.timeLimit))) next.timeLimit = Number(patch.timeLimit);
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

  addLog(text) {
    this.log.push({ seq: ++this.logSeq, text });
    if (this.log.length > LOG_SIZE) this.log.shift();
  }

  // ---------- Seiten ----------

  start() {
    const species = shuffle([...SPECIES.keys()]);
    if (this.settings.teamMode) {
      const teams = this.lobby.teams.filter((t) => this.lobby.playersInTeam(t.id).length).slice(0, MAX_SIDES);
      if (teams.length < 2) throw new Error('Mindestens zwei Teams brauchen Spieler.');
      this.sides = teams.map((t, i) => ({ id: `s${i}`, teamId: t.id, playerIds: null, species: species[i], turns: 0 }));
    } else {
      const active = this.lobby.activePlayers();
      if (active.length < 2) throw new Error('Sumo Zoo braucht mindestens zwei Spieler.');
      if (active.length > MAX_SIDES) throw new Error(`Ohne Teams können höchstens ${MAX_SIDES} spielen. Schaltet die Teams ein.`);
      this.sides = shuffle(active).map((p, i) => ({ id: `s${i}`, teamId: null, playerIds: [p.id], species: species[i], turns: 0 }));
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
    if (side.teamId) return this.lobby.teamById(side.teamId)?.name || SPECIES[side.species].name;
    return this.members(side)[0]?.name || SPECIES[side.species].name;
  }

  sideOf(animalId) {
    return this.sides.find((s) => animalId.startsWith(`${s.id}-`)) || null;
  }

  aliveCount(side) {
    return this.animals.filter((a) => a.alive && a.side === side.id).length;
  }

  stat(playerId) {
    if (!this.stats[playerId]) this.stats[playerId] = { knocked: 0, own: 0, best: 0, shots: 0 };
    return this.stats[playerId];
  }

  // ---------- Ablauf ----------

  animalCount() {
    if (this.settings.animals) return this.settings.animals;
    return this.sides.length === 2 ? 6 : 5;
  }

  startSet() {
    this.setNo++;
    this.mapId = this.settings.map === 'random' ? pick(World.MAP_IDS) : this.settings.map;
    const count = this.animalCount();
    // Oval wie im Original, wenn es auf die Karte passt, sonst Gruppen in zufälliger Form
    const oval = this.settings.layout === 'oval' ? World.layout(this.mapId, this.sides.length, count, 'oval') : null;
    const pattern = oval ? 'oval' : pick(World.patternsFor(this.mapId, this.sides.length, count));
    this.pattern = pattern;
    const groups = oval || World.layout(this.mapId, this.sides.length, count, pattern);
    this.animals = [];
    this.sides.forEach((s, i) => {
      groups[i].forEach((p, k) => this.animals.push({ id: `${s.id}-${k}`, side: s.id, x: p.x, y: p.y, alive: true }));
    });
    this.outOrder = [];
    this.setOver = false;
    this.shot = null;
    this.result = null;
    this.lastOutcome = null;
    // Die Startseite wechselt jeden Satz, im ersten wird gelost
    if (this.setNo === 1) this.startIndex = crypto.randomInt(this.sides.length);
    else this.startIndex = (this.startIndex + 1) % this.sides.length;
    this.beginTurn(this.sides[this.startIndex]);
  }

  // Wer auf einer Seite schubst: Teammitglieder wechseln sich ab
  pickShooter(side) {
    const members = this.members(side);
    const online = members.filter((p) => p.connected);
    const list = online.length ? online : members;
    if (!list.length) return null;
    return list[side.turns % list.length].id;
  }

  beginTurn(side, keepShooter = false) {
    this.turnSide = side.id;
    if (!keepShooter) {
      this.shooterId = this.pickShooter(side);
      side.turns++;
    }
    this.turnSeq++;
    this.phase = 'aim';
    this.startTimer();
  }

  currentSide() {
    return this.sides.find((s) => s.id === this.turnSide) || null;
  }

  // Die nächste Seite im Kreis, die noch Tiere hat (wer nicht da ist, wird übersprungen, solange es andere gibt)
  nextSide(from) {
    const idx = this.sides.findIndex((s) => s.id === from.id);
    const alive = [];
    for (let k = 1; k <= this.sides.length; k++) {
      const s = this.sides[(idx + k) % this.sides.length];
      if (this.aliveCount(s) > 0) alive.push(s);
    }
    return alive.find((s) => this.present(s)) || alive[0] || from;
  }

  controls(player) {
    if (this.phase !== 'aim') return false;
    const shooter = this.lobby.players.get(this.shooterId);
    if (!shooter) return false;
    return shooter.id === player.id || shooter.guestOf === player.id;
  }

  shoot(player, { animalId, angle, power }) {
    if (this.phase !== 'aim') return { error: 'Gerade rollt noch alles.' };
    if (!this.controls(player)) return { error: 'Du bist nicht dran.' };
    const side = this.currentSide();
    const animal = this.animals.find((a) => a.id === animalId);
    if (!animal || !animal.alive || animal.side !== side.id) return { error: 'Schubs eines deiner eigenen Tiere.' };
    const a = Number(angle);
    const p = Number(power);
    if (!Number.isFinite(a) || !Number.isFinite(p)) return { error: 'Ungültiger Stoß.' };
    if (p < 0.03) return { error: 'Zu schwach, zieh weiter zurück.' };

    const before = Object.fromEntries(this.sides.map((s) => [s.id, this.aliveCount(s)]));
    const result = simulate(World.MAPS[this.mapId], this.animals, { id: animal.id, angle: a, power: Math.min(1, p) });
    this.animals = result.final;
    this.clearTimer();
    this.shotSeq++;
    const now = Date.now();
    this.shot = {
      seq: this.shotSeq,
      side: side.id,
      shooterId: this.shooterId,
      animalId: animal.id,
      angle: a,
      power: Math.min(1, p),
      fps: result.fps,
      frames: result.frames,
      duration: result.duration,
      tracks: result.tracks,
      startAt: now,
      before,
      logBefore: this.logSeq, // Meldungen zu diesem Stoß erst zeigen, wenn er abgespielt ist
    };
    this.resolve(side, result.falls);
    this.phase = 'rolling';
    clearTimeout(this.rollTimer);
    this.rollTimer = setTimeout(() => {
      this.rollTimer = null;
      this.afterRoll();
      this.lobby.broadcast();
    }, result.duration + ROLL_PAUSE_MS);
    return { ok: true };
  }

  // Wertet einen Stoß aus: Wer ist runtergefallen, ist eine Seite raus, ist der Satz vorbei?
  resolve(side, falls) {
    const own = falls.filter((f) => f.id.startsWith(`${side.id}-`));
    const foreign = falls.filter((f) => !f.id.startsWith(`${side.id}-`));
    const st = this.stat(this.shooterId);
    st.shots++;
    st.knocked += foreign.length;
    st.own += own.length;
    st.best = Math.max(st.best, foreign.length);

    const shooter = this.lobby.players.get(this.shooterId)?.name || this.sideName(side);
    const sp = SPECIES[side.species];
    if (foreign.length && !own.length) {
      this.addLog(`${sp.emoji} ${shooter} schubst ${foreign.length === 1 ? 'ein Tier' : `${foreign.length} Tiere`} runter. ${pick(FALL_LINES)}`);
    } else if (foreign.length && own.length) {
      this.addLog(`${sp.emoji} ${shooter} schubst ${foreign.length} runter, verliert aber ${own.length === 1 ? 'ein eigenes' : `${own.length} eigene`}.`);
    } else if (own.length) {
      this.addLog(`🙈 Eigentor! ${shooter} schubst ${own.length === 1 ? sp.own : `${own.length} eigene ${sp.name}`} runter.`);
    } else {
      this.addLog(`${sp.emoji} ${shooter} schubst, aber keiner fällt.`);
    }

    // Seiten, die jetzt keine Tiere mehr haben
    const lastFall = {};
    for (const f of falls) {
      const s = this.sideOf(f.id);
      lastFall[s.id] = Math.max(lastFall[s.id] ?? 0, f.t);
    }
    const nowOut = this.sides.filter((s) => !this.outOrder.includes(s.id) && this.aliveCount(s) === 0);
    nowOut.sort((a, b) => lastFall[a.id] - lastFall[b.id]);
    for (const s of nowOut) {
      this.outOrder.push(s.id);
      this.addLog(`💀 ${this.sideName(s)} hat keine Tiere mehr.`);
    }

    const remaining = this.sides.filter((s) => this.aliveCount(s) > 0);
    const extra = this.settings.extraTurn && foreign.length > 0 && own.length === 0 && remaining.length > 1;
    this.lastOutcome = { own: own.length, foreign: foreign.length, extra };

    if (remaining.length === 1) {
      this.finishSet(remaining[0], this.aliveCount(remaining[0]));
    } else if (remaining.length === 0) {
      // Alle letzten Tiere fallen beim selben Stoß: Wessen letztes Tier zuletzt fiel, gewinnt
      const latest = Math.max(...nowOut.map((s) => lastFall[s.id]));
      const winners = nowOut.filter((s) => lastFall[s.id] === latest);
      this.finishSet(winners.length === 1 ? winners[0] : null, 0);
    } else {
      this.pendingTurn = extra ? { side: side.id, keep: true } : { side: this.nextSide(side).id, keep: false };
    }
  }

  finishSet(winner, left) {
    this.pendingTurn = null;
    if (winner) {
      this.wins[winner.id]++;
      this.addLog(`🏆 ${this.sideName(winner)} gewinnt den Satz!`);
    } else {
      this.addLog('🤝 Unentschieden, alle sind gleichzeitig runter.');
    }
    this.result = { winner: winner?.id || null, left, setNo: this.setNo, shooterId: this.shooterId };
    this.results.push({ ...this.result, map: this.mapId });
    this.setOver = true;
  }

  afterRoll() {
    if (this.phase !== 'rolling') return;
    if (this.setOver) {
      this.setOver = false;
      const best = Math.max(...Object.values(this.wins));
      this.phase = best >= this.settings.sets ? 'final' : 'setEnd';
      return;
    }
    const t = this.pendingTurn;
    this.pendingTurn = null;
    const side = this.sides.find((s) => s.id === t.side);
    // Beim Extrazug schubst dieselbe Person, wenn sie noch da ist
    const shooter = this.lobby.players.get(this.shooterId);
    this.beginTurn(side, t.keep && shooter?.connected);
  }

  next() {
    if (this.phase !== 'setEnd') return;
    this.startSet();
  }

  // Zug verfällt (Zeit abgelaufen oder Host überspringt)
  skip(reason) {
    if (this.phase !== 'aim') return { error: 'Gerade ist niemand am Zug.' };
    const side = this.currentSide();
    this.addLog(`⏭ ${this.lobby.players.get(this.shooterId)?.name || this.sideName(side)} ${reason}`);
    this.beginTurn(this.nextSide(side));
    return { ok: true };
  }

  clearTimer() {
    clearTimeout(this.timer);
    this.timer = null;
    this.deadline = null;
  }

  startTimer() {
    this.clearTimer();
    const limit = this.settings.timeLimit;
    if (!limit) return;
    this.deadline = Date.now() + limit * 1000;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.skip('war zu langsam, der Zug verfällt.');
      this.lobby.broadcast();
    }, limit * 1000);
  }

  action(player, data) {
    switch (data.type) {
      case 'shoot':
        return this.shoot(player, data);
      case 'force':
        if (!player.isHost) return { error: 'Nur der Host darf das.' };
        return this.skip('wird übersprungen.');
      default:
        return { error: 'Unbekannte Aktion.' };
    }
  }

  // Zielen live: geht ohne kompletten Spielstand direkt an die anderen Geräte (wie die Striche beim Montagsmaler)
  draw(player, data = {}) {
    if (data.op !== 'aim') return { error: 'Unbekannt.' };
    if (!this.controls(player)) return { error: 'Du bist nicht dran.' };
    const now = Date.now();
    if (now - this.aimWindow.start > 1000) this.aimWindow = { start: now, count: 0 };
    if (++this.aimWindow.count > MAX_AIM_PER_SEC) return { ok: true };
    const animal = this.animals.find((a) => a.id === data.animalId && a.alive && a.side === this.turnSide);
    const angle = Number(data.angle);
    const power = Math.min(1, Math.max(0, Number(data.power) || 0));
    const payload = animal && Number.isFinite(angle) ? { turn: this.turnSeq, animalId: animal.id, angle, power } : { turn: this.turnSeq, animalId: null };
    for (const p of this.lobby.players.values()) {
      if (p.id !== player.id && p.socketId) this.lobby.send(p, 'sz-aim', payload);
    }
    return { ok: true };
  }

  playersChanged() {
    // Ist die Person am Zug weg, übernimmt jemand anderes aus dem Team
    if (this.phase !== 'aim') return;
    const side = this.currentSide();
    const shooter = this.lobby.players.get(this.shooterId);
    if (side && side.teamId && (!shooter || !shooter.connected || shooter.teamId !== side.teamId)) {
      const replacement = this.members(side).find((p) => p.connected);
      if (replacement) this.shooterId = replacement.id;
    }
  }

  // ---------- Ansicht ----------

  // Rangliste: Sätze, dann wer im letzten Satz länger oben war, dann Treffer
  standings() {
    const lasted = (s) => (this.outOrder.includes(s.id) ? this.outOrder.indexOf(s.id) : this.sides.length);
    return this.sides
      .map((s) => ({
        id: s.id,
        wins: this.wins[s.id],
        lasted: lasted(s),
        knocked: this.members(s).reduce((sum, p) => sum + (this.stats[p.id]?.knocked || 0), 0),
      }))
      .sort((a, b) => b.wins - a.wins || b.lasted - a.lasted || b.knocked - a.knocked);
  }

  awards() {
    const entries = Object.entries(this.stats);
    const top = (key) => {
      const best = Math.max(0, ...entries.map(([, s]) => s[key]));
      return best > 0 ? { ids: entries.filter(([, s]) => s[key] === best).map(([id]) => id), value: best } : null;
    };
    const last = this.results.filter((r) => r.winner && r.left === 1);
    return {
      wreckingBall: top('best'),
      ownGoal: top('own'),
      lastOne: last.length ? { sides: [...new Set(last.map((r) => r.winner))] } : null,
    };
  }

  view(viewer) {
    const side = this.currentSide();
    const mySides = this.sides.filter((s) => this.members(s).some((p) => p.id === viewer.id || p.guestOf === viewer.id)).map((s) => s.id);
    return {
      phase: this.phase,
      setNo: this.setNo,
      sets: this.settings.sets,
      mapId: this.mapId,
      pattern: this.pattern,
      tv: this.settings.tv,
      aimHelp: this.settings.aimHelp,
      extraTurn: this.settings.extraTurn,
      teamMode: Boolean(this.settings.teamMode),
      sides: this.sides.map((s) => {
        const sp = SPECIES[s.species];
        const team = s.teamId ? this.lobby.teamById(s.teamId) : null;
        return {
          id: s.id,
          name: this.sideName(s),
          teamId: s.teamId,
          members: this.members(s).map((p) => p.id),
          species: sp.key,
          emoji: sp.emoji,
          speciesName: sp.name,
          color: team?.color || sp.color,
          alive: this.aliveCount(s),
          wins: this.wins[s.id],
          out: this.outOrder.includes(s.id),
          present: this.present(s),
        };
      }),
      animals: this.animals,
      turn: side && this.phase === 'aim' ? { side: side.id, shooterId: this.shooterId, seq: this.turnSeq } : null,
      pendingTurn: this.phase === 'rolling' && this.pendingTurn ? this.pendingTurn : null,
      mySides,
      canShoot: this.controls(viewer),
      shot: this.shot,
      outcome: this.lastOutcome,
      result: this.result,
      results: this.results,
      standings: this.phase === 'final' ? this.standings() : null,
      awards: this.phase === 'final' ? this.awards() : null,
      stats: this.stats,
      log: this.log,
      deadline: this.deadline,
      paused: false,
      serverNow: Date.now(),
    };
  }

  dispose() {
    this.clearTimer();
    clearTimeout(this.rollTimer);
  }
}

SumoZoo.SPECIES = SPECIES;
module.exports = SumoZoo;
