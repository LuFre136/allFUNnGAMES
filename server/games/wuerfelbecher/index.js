// Würfelbecher (nach Kniffel): Reihum bis zu drei Würfe mit fünf Würfeln, dann ein Feld auf dem Wertungsblock füllen.

const crypto = require('crypto');
const { shuffle } = require('../../util');

const MIN_PLAYERS = 1;
const MAX_PLAYERS = 10;
const DICE = 5;
const ROLLS = 3;
const BONUS_NEEDED = 63;
const BONUS_POINTS = 35;
const TIME_LIMITS = [0, 30, 45, 60, 90, 120];

const UPPER = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
const LOWER = ['threeKind', 'fourKind', 'fullHouse', 'smallStraight', 'largeStraight', 'kniffel', 'chance'];
const CATEGORIES = [...UPPER, ...LOWER];

function die() {
  return crypto.randomInt(1, 7);
}

function counts(dice) {
  const c = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dice) c[d]++;
  return c;
}

function hasRun(dice, length) {
  const set = new Set(dice);
  for (let start = 1; start + length - 1 <= 6; start++) {
    let ok = true;
    for (let v = start; v < start + length; v++) if (!set.has(v)) ok = false;
    if (ok) return true;
  }
  return false;
}

// Punkte, die diese Würfel in der Kategorie bringen
function scoreFor(category, dice) {
  const c = counts(dice);
  const sum = dice.reduce((a, b) => a + b, 0);
  const upper = UPPER.indexOf(category);
  if (upper >= 0) return c[upper + 1] * (upper + 1);
  switch (category) {
    case 'threeKind': return c.some((n) => n >= 3) ? sum : 0;
    case 'fourKind': return c.some((n) => n >= 4) ? sum : 0;
    case 'fullHouse': return c.includes(3) && c.includes(2) ? 25 : 0;
    case 'smallStraight': return hasRun(dice, 4) ? 30 : 0;
    case 'largeStraight': return hasRun(dice, 5) ? 40 : 0;
    case 'kniffel': return c.includes(5) ? 50 : 0;
    case 'chance': return sum;
    default: return 0;
  }
}

function emptySheet() {
  return Object.fromEntries(CATEGORIES.map((c) => [c, null]));
}

function sheetScore(sheet) {
  const sum = (cats) => cats.reduce((a, c) => a + (sheet[c] || 0), 0);
  const upper = sum(UPPER);
  const bonus = upper >= BONUS_NEEDED ? BONUS_POINTS : 0;
  const lower = sum(LOWER);
  return { upper, bonus, lower, total: upper + bonus + lower };
}

function isFull(sheet) {
  return CATEGORIES.every((c) => sheet[c] !== null);
}

class Wuerfelbecher {
  constructor(lobby) {
    this.lobby = lobby;
    this.order = [];
    this.gameNo = 0;
    this.totals = {}; // Punkte aus abgeschlossenen Partien
    this.results = [];
    this.timer = null;
    this.deadline = null;
    this.rollSeq = 0;
  }

  static meta() {
    return {
      id: 'wuerfelbecher',
      name: 'Würfelbecher',
      icon: '🎲',
      description: 'Fünf Würfel, drei Würfe: Wer füllt den Block am besten?',
      players: `${MIN_PLAYERS}–${MAX_PLAYERS} Spieler`,
      available: true,
      teams: false,
      sharedDevice: true, // mehrere Spieler können sich ein Gerät teilen
    };
  }

  static defaultSettings() {
    return { timeLimit: 0, hints: true, games: 1, orderMode: 'random', order: [] };
  }

  static sanitizeSettings(current, patch) {
    const next = { ...current };
    if (patch.timeLimit !== undefined) {
      const t = Number(patch.timeLimit);
      if (TIME_LIMITS.includes(t)) next.timeLimit = t;
    }
    if (patch.hints !== undefined) next.hints = Boolean(patch.hints);
    if (patch.games !== undefined) {
      const n = Math.round(Number(patch.games));
      if (Number.isFinite(n)) next.games = Math.min(Math.max(n, 1), 5);
    }
    if (patch.orderMode !== undefined) next.orderMode = patch.orderMode === 'manual' ? 'manual' : 'random';
    if (Array.isArray(patch.order)) {
      next.order = [...new Set(patch.order.filter((id) => typeof id === 'string').map((id) => id.slice(0, 40)))].slice(0, 60);
    }
    return next;
  }

  static availableCount() {
    return 0;
  }

  get settings() {
    return this.lobby.settings.game;
  }

  players() {
    return this.lobby.activePlayers();
  }

  start() {
    const players = this.players();
    if (players.length < MIN_PLAYERS) throw new Error(`Würfelbecher braucht mindestens ${MIN_PLAYERS} Mitspieler.`);
    if (players.length > MAX_PLAYERS) throw new Error(`Würfelbecher geht mit höchstens ${MAX_PLAYERS} Mitspielern.`);
    const ids = players.map((p) => p.id);
    if (this.settings.orderMode === 'manual') {
      // Reihenfolge des Hosts, wer darin fehlt, kommt hinten dran
      const listed = this.settings.order.filter((id) => ids.includes(id));
      this.order = [...listed, ...ids.filter((id) => !listed.includes(id))];
    } else {
      this.order = shuffle(ids);
    }
    this.gameNo = 0;
    this.totals = {};
    this.results = [];
    this.startGame();
  }

  startGame() {
    this.gameNo++;
    this.sheets = new Map(this.order.map((id) => [id, emptySheet()]));
    this.last = null; // zuletzt eingetragenes Feld
    // Jede Partie beginnt der Nächste in der Reihe
    this.turn = (this.gameNo - 1) % this.order.length;
    this.phase = 'turn';
    this.nextTurn(true);
  }

  sheet(id) {
    if (!this.sheets.has(id)) this.sheets.set(id, emptySheet());
    return this.sheets.get(id);
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
      this.autoPlay();
      this.lobby.broadcast();
    }, limit * 1000);
  }

  // Nächster Spieler mit freien Feldern. Wer nicht verbunden ist, wird übersprungen, solange
  // ein anderer noch Felder frei hat. Sind alle Blöcke voll, ist die Partie vorbei.
  nextTurn(first = false) {
    const present = new Set(this.players().map((p) => p.id));
    const start = first ? this.turn : this.turn + 1;
    const indexes = this.order.map((_, i) => (start + i) % this.order.length);
    const open = indexes.filter((i) => !isFull(this.sheet(this.order[i])));
    if (!open.length) return this.endGame();
    this.turn = open.find((i) => present.has(this.order[i])) ?? open[0];
    this.activeId = this.order[this.turn];
    this.dice = Array(DICE).fill(null);
    this.held = Array(DICE).fill(false);
    this.rolls = 0;
    this.startTimer();
  }

  // Ein Gerät spielt für seinen Spieler und dessen Mitspieler am selben Gerät
  controls(player, id) {
    return id === player.id || this.lobby.players.get(id)?.guestOf === player.id;
  }

  roll() {
    if (this.phase !== 'turn') return { error: 'Gerade wird nicht gewürfelt.' };
    if (this.rolls >= ROLLS) return { error: 'Du hast schon dreimal gewürfelt.' };
    if (this.rolls > 0 && this.held.every(Boolean)) return { error: 'Du hältst alle Würfel.' };
    this.dice = this.dice.map((d, i) => (this.rolls > 0 && this.held[i] ? d : die()));
    this.rolls++;
    this.rollSeq++;
    if (this.rolls >= ROLLS) this.held = Array(DICE).fill(false);
    return { ok: true };
  }

  hold(index, value) {
    if (this.phase !== 'turn' || this.rolls === 0 || this.rolls >= ROLLS) return { error: 'Halten geht nur zwischen den Würfen.' };
    const i = Number(index);
    if (!Number.isInteger(i) || i < 0 || i >= DICE) return { error: 'Diesen Würfel gibt es nicht.' };
    this.held[i] = value === undefined ? !this.held[i] : Boolean(value);
    return { ok: true };
  }

  score(category) {
    if (this.phase !== 'turn') return { error: 'Gerade wird nichts eingetragen.' };
    if (this.rolls === 0) return { error: 'Erst würfeln.' };
    const sheet = this.sheet(this.activeId);
    if (!CATEGORIES.includes(category)) return { error: 'Dieses Feld gibt es nicht.' };
    if (sheet[category] !== null) return { error: 'Dieses Feld ist schon ausgefüllt.' };
    sheet[category] = scoreFor(category, this.dice);
    this.last = { playerId: this.activeId, category, points: sheet[category], dice: [...this.dice] };
    this.nextTurn();
    return { ok: true };
  }

  // Zeit abgelaufen oder Host drängt: würfeln, falls noch nicht geschehen, dann das beste freie Feld eintragen
  autoPlay() {
    if (this.phase !== 'turn') return;
    if (this.rolls === 0) this.roll();
    const sheet = this.sheet(this.activeId);
    const free = CATEGORIES.filter((c) => sheet[c] === null);
    const best = free.reduce((a, c) => (scoreFor(c, this.dice) > scoreFor(a, this.dice) ? c : a), free[0]);
    this.score(best);
  }

  // Host: Spieler am Zug überspringen, er ist in der nächsten Runde wieder dran
  skip() {
    if (this.phase !== 'turn') return;
    this.nextTurn();
  }

  scores() {
    return Object.fromEntries([...this.sheets.entries()].map(([id, s]) => [id, sheetScore(s)]));
  }

  endGame() {
    this.clearTimer();
    this.activeId = null;
    const scores = this.scores();
    for (const [id, s] of Object.entries(scores)) this.totals[id] = (this.totals[id] || 0) + s.total;
    this.results.push({ scores });
    this.phase = this.gameNo >= this.settings.games ? 'final' : 'result';
  }

  // Host: nächste Partie starten
  next() {
    if (this.phase !== 'result') return;
    this.startGame();
  }

  action(player, { type, ...data }) {
    const hostOnly = ['force', 'skip'];
    if (hostOnly.includes(type) && !player.isHost) return { error: 'Nur der Host darf das.' };
    if (!hostOnly.includes(type) && !(this.phase === 'turn' && this.controls(player, this.activeId))) {
      return { error: 'Du bist nicht dran.' };
    }
    switch (type) {
      case 'roll': return this.roll();
      case 'hold': return this.hold(data.index, data.value);
      case 'score': return this.score(data.category);
      case 'force': this.autoPlay(); return { ok: true };
      case 'skip': this.skip(); return { ok: true };
      default: return { error: 'Unbekannte Aktion.' };
    }
  }

  playersChanged() {
    if (this.phase !== 'turn') return;
    // Neue Mitspieler kommen hinten in die Reihe und bekommen einen leeren Block.
    // Wer kurz die Verbindung verliert, bleibt am Zug; der Host kann ihn überspringen.
    for (const p of this.players()) {
      if (!this.order.includes(p.id)) this.order.push(p.id);
      this.sheet(p.id);
    }
  }

  view(viewer) {
    const scores = this.scores();
    const playing = this.phase === 'turn';
    const players = this.order.filter((id) => this.sheets.has(id)).map((id) => ({
      id,
      sheet: this.sheets.get(id),
      score: scores[id],
      total: (this.totals[id] || 0) + (playing ? scores[id].total : 0),
    }));
    const view = {
      phase: this.phase,
      gameNo: this.gameNo,
      games: this.settings.games,
      hints: this.settings.hints,
      categories: { upper: UPPER, lower: LOWER },
      bonus: { needed: BONUS_NEEDED, points: BONUS_POINTS },
      activeId: this.activeId,
      isActive: playing && this.controls(viewer, this.activeId),
      dice: this.dice,
      held: this.held,
      rolls: this.rolls,
      maxRolls: ROLLS,
      rollSeq: this.rollSeq,
      // Mögliche Punkte mit den aktuellen Würfeln für den Spieler am Zug
      options: playing && this.rolls > 0
        ? Object.fromEntries(CATEGORIES.filter((c) => this.sheet(this.activeId)[c] === null).map((c) => [c, scoreFor(c, this.dice)]))
        : null,
      last: this.last,
      players,
      deadline: this.deadline,
      paused: false,
      serverNow: Date.now(),
    };
    if (!playing) {
      view.totals = this.totals;
      view.lastScores = this.results[this.results.length - 1].scores;
    }
    return view;
  }

  dispose() {
    this.clearTimer();
  }
}

Wuerfelbecher.scoreFor = scoreFor;
Wuerfelbecher.sheetScore = sheetScore;
Wuerfelbecher.CATEGORIES = CATEGORIES;
module.exports = Wuerfelbecher;
