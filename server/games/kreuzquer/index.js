// Kreuz & Quer: Würfelspiel nach Qwixx. Gewürfelt wird reihum, angekreuzt wird von allen gleichzeitig.

const crypto = require('crypto');
const { shuffle } = require('../../util');

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;
const MAX_PENALTIES = 4;
const PENALTY_POINTS = 5;
const MIN_MARKS_TO_LOCK = 5;
const ROWS_TO_END = 2;

const COLORS = ['red', 'yellow', 'green', 'blue'];
const UP = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const ROWS = { red: UP, yellow: UP, green: [...UP].reverse(), blue: [...UP].reverse() };

function die() {
  return crypto.randomInt(1, 7);
}

// 1, 3, 6, 10, … Punkte für 1, 2, 3, 4, … Kreuze
function rowPoints(count) {
  return (count * (count + 1)) / 2;
}

function emptySheet() {
  return {
    rows: Object.fromEntries(COLORS.map((c) => [c, []])), // angekreuzte Zahlen in Reihenfolge
    locks: Object.fromEntries(COLORS.map((c) => [c, false])),
    penalties: 0,
  };
}

// Darf die Zahl in dieser Reihe angekreuzt werden? Nur rechts vom letzten Kreuz,
// das letzte Feld erst ab fünf Kreuzen.
function canMark(sheet, color, number, closed) {
  if (!COLORS.includes(color) || closed.has(color)) return false;
  const row = ROWS[color];
  const index = row.indexOf(number);
  if (index < 0) return false;
  const marks = sheet.rows[color];
  const last = marks.length ? row.indexOf(marks[marks.length - 1]) : -1;
  if (index <= last) return false;
  if (index === row.length - 1 && marks.length < MIN_MARKS_TO_LOCK) return false;
  return true;
}

function isLastField(color, number) {
  const row = ROWS[color];
  return row[row.length - 1] === number;
}

function applyMark(sheet, { color, number }) {
  sheet.rows[color].push(number);
  if (isLastField(color, number)) {
    sheet.locks[color] = true;
    return true;
  }
  return false;
}

function sheetScore(sheet) {
  const rows = Object.fromEntries(COLORS.map((c) => [c, rowPoints(sheet.rows[c].length + (sheet.locks[c] ? 1 : 0))]));
  const penalty = sheet.penalties * PENALTY_POINTS;
  return { rows, penalty, total: Object.values(rows).reduce((a, b) => a + b, 0) - penalty };
}

class KreuzQuer {
  constructor(lobby) {
    this.lobby = lobby;
    this.order = [];
    this.turn = 0;
    this.gameNo = 0;
    this.totals = {}; // Punkte aus abgeschlossenen Partien
    this.results = []; // Ergebnis pro Partie
    this.timer = null;
    this.deadline = null;
    this.rollSeq = 0;
  }

  static meta() {
    return {
      id: 'kreuzquer',
      name: 'Kreuz & Quer',
      icon: '🎲',
      description: 'Würfeln und ankreuzen: Wer füllt die Farbreihen am geschicktesten?',
      players: '2–8 Spieler',
      available: true,
      teams: false,
    };
  }

  static defaultSettings() {
    return { timeLimit: 30, starter: 'random', hints: true, games: 1 };
  }

  static sanitizeSettings(current, patch) {
    const next = { ...current };
    if (patch.timeLimit !== undefined) {
      const t = Math.round(Number(patch.timeLimit));
      if (Number.isFinite(t)) next.timeLimit = t <= 0 ? 0 : Math.min(Math.max(t, 15), 120);
    }
    if (patch.starter !== undefined) next.starter = patch.starter === 'host' ? 'host' : 'random';
    if (patch.hints !== undefined) next.hints = Boolean(patch.hints);
    if (patch.games !== undefined) {
      const n = Math.round(Number(patch.games));
      if (Number.isFinite(n)) next.games = Math.min(Math.max(n, 1), 5);
    }
    return next;
  }

  static availableCount() {
    return 0;
  }

  get settings() {
    return this.lobby.settings.game;
  }

  // Verbundene Mitspieler (ohne reinen Gamemaster)
  players() {
    return this.lobby.activePlayers();
  }

  start() {
    const players = this.players();
    if (players.length < MIN_PLAYERS) throw new Error(`Kreuz & Quer braucht mindestens ${MIN_PLAYERS} Mitspieler.`);
    if (players.length > MAX_PLAYERS) throw new Error(`Kreuz & Quer geht mit höchstens ${MAX_PLAYERS} Mitspielern.`);
    let order = shuffle(players.map((p) => p.id));
    if (this.settings.starter === 'host' && order.includes(this.lobby.hostId)) {
      order = [this.lobby.hostId, ...order.filter((id) => id !== this.lobby.hostId)];
    }
    this.order = order;
    this.gameNo = 0;
    this.totals = {};
    this.results = [];
    this.startGame();
  }

  startGame() {
    this.gameNo++;
    this.sheets = new Map(this.order.map((id) => [id, emptySheet()]));
    this.closed = new Set();
    this.events = [];
    this.dice = null;
    // Jede Partie beginnt der Nächste in der Reihe
    this.turn = (this.gameNo - 1) % this.order.length;
    this.activeId = null;
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

  startTimer(onTimeout) {
    this.clearTimer();
    const limit = this.settings.timeLimit;
    if (!limit) return;
    this.deadline = Date.now() + limit * 1000;
    this.timer = setTimeout(() => {
      this.timer = null;
      onTimeout();
      this.lobby.broadcast();
    }, limit * 1000);
  }

  // Nächster verbundener Spieler in der Reihe würfelt
  nextTurn(first = false) {
    const present = new Set(this.players().map((p) => p.id));
    const start = first ? this.turn : this.turn + 1;
    let id = this.order[start % this.order.length];
    for (let i = 0; i < this.order.length; i++) {
      const candidate = this.order[(start + i) % this.order.length];
      if (present.has(candidate)) {
        this.turn = (start + i) % this.order.length;
        id = candidate;
        break;
      }
    }
    this.activeId = id;
    this.phase = 'roll';
    this.pending = new Map(); // playerId -> { color, number } im laufenden Schritt
    this.done = new Set();
    this.usedThisTurn = false;
    this.startTimer(() => this.roll());
  }

  roll() {
    if (this.phase !== 'roll') return { error: 'Es wurde schon gewürfelt.' };
    this.rollSeq++;
    this.dice = { white1: die(), white2: die() };
    for (const c of COLORS) this.dice[c] = this.closed.has(c) ? null : die();
    this.events = [];
    this.phase = 'white';
    this.pending = new Map();
    this.done = new Set();
    this.startTimer(() => this.endWhite());
    return { ok: true };
  }

  // Mögliche Felder für einen Spieler im laufenden Schritt
  options(playerId) {
    if (!this.dice || !this.sheets.has(playerId)) return [];
    const sheet = this.sheet(playerId);
    const result = [];
    if (this.phase === 'white') {
      if (this.done.has(playerId)) return [];
      const sum = this.dice.white1 + this.dice.white2;
      for (const color of COLORS) {
        if (canMark(sheet, color, sum, this.closed)) result.push({ color, number: sum, dice: ['white1', 'white2'] });
      }
    } else if (this.phase === 'color' && playerId === this.activeId) {
      for (const color of COLORS) {
        if (this.dice[color] === null) continue;
        for (const w of ['white1', 'white2']) {
          const number = this.dice[w] + this.dice[color];
          if (canMark(sheet, color, number, this.closed) && !result.some((o) => o.color === color && o.number === number)) {
            result.push({ color, number, dice: [w, color] });
          }
        }
      }
    }
    return result;
  }

  canAct(player) {
    if (this.phase === 'white') return this.sheets.has(player.id) && !this.done.has(player.id);
    if (this.phase === 'color') return player.id === this.activeId;
    return false;
  }

  mark(player, color, number) {
    if (!this.canAct(player)) return { error: 'Du kannst gerade nichts ankreuzen.' };
    const n = Number(number);
    if (!this.options(player.id).some((o) => o.color === color && o.number === n)) {
      return { error: 'Dieses Feld darfst du gerade nicht ankreuzen.' };
    }
    this.pending.set(player.id, { color, number: n });
    return { ok: true };
  }

  unmark(player) {
    if (!this.canAct(player)) return { error: 'Du kannst gerade nichts ändern.' };
    this.pending.delete(player.id);
    return { ok: true };
  }

  finish(player) {
    if (!this.canAct(player)) return { error: 'Du bist gerade nicht dran.' };
    this.done.add(player.id);
    if (this.phase === 'white') this.checkWhiteDone();
    else this.endColor();
    return { ok: true };
  }

  checkWhiteDone() {
    if (this.phase !== 'white') return;
    const waiting = this.players().filter((p) => this.sheets.has(p.id) && !this.done.has(p.id));
    if (!waiting.length) this.endWhite();
  }

  // Kreuze eines Schritts gelten gleichzeitig: Schließen zwei Spieler dieselbe Reihe, bekommen beide das Schloss
  applyPending() {
    const locked = new Set();
    for (const [id, m] of this.pending) {
      if (applyMark(this.sheet(id), m)) {
        locked.add(m.color);
        this.events.push({ type: 'lock', playerId: id, color: m.color });
      }
      if (id === this.activeId) this.usedThisTurn = true;
    }
    for (const c of locked) this.closed.add(c);
    this.pending = new Map();
  }

  endWhite() {
    if (this.phase !== 'white') return;
    this.applyPending();
    if (this.isOver()) return this.endGame();
    this.phase = 'color';
    this.done = new Set();
    const active = this.lobby.players.get(this.activeId);
    if (!active?.connected) return this.endColor({ absent: true });
    this.startTimer(() => this.endColor());
  }

  // Wer gar nichts ankreuzt, bekommt einen Fehlwurf. Nicht, wer beim Würfeln die Verbindung verloren hat.
  endColor({ absent = false } = {}) {
    if (this.phase !== 'color') return;
    this.applyPending();
    if (!this.usedThisTurn && !absent) {
      this.sheet(this.activeId).penalties++;
      this.events.push({ type: 'penalty', playerId: this.activeId });
    }
    if (this.isOver()) return this.endGame();
    this.nextTurn();
  }

  isOver() {
    return this.closed.size >= ROWS_TO_END || [...this.sheets.values()].some((s) => s.penalties >= MAX_PENALTIES);
  }

  scores() {
    return Object.fromEntries([...this.sheets.entries()].map(([id, s]) => [id, sheetScore(s)]));
  }

  endGame() {
    this.clearTimer();
    const scores = this.scores();
    for (const [id, s] of Object.entries(scores)) this.totals[id] = (this.totals[id] || 0) + s.total;
    this.results.push({ scores, sheets: Object.fromEntries(this.sheets) });
    this.phase = this.gameNo >= this.settings.games ? 'final' : 'result';
  }

  // Host: nächste Partie starten
  next() {
    if (this.phase !== 'result') return;
    this.startGame();
  }

  // Host: wenn jemand nicht reagiert, den laufenden Schritt beenden
  force() {
    if (this.phase === 'roll') this.roll();
    else if (this.phase === 'white') this.endWhite();
    else if (this.phase === 'color') this.endColor();
  }

  action(player, { type, ...data }) {
    switch (type) {
      case 'roll':
        if (player.id !== this.activeId) return { error: 'Du bist nicht mit Würfeln dran.' };
        return this.roll();
      case 'mark': return this.mark(player, data.color, data.number);
      case 'unmark': return this.unmark(player);
      case 'done': return this.finish(player);
      case 'force':
        if (!player.isHost) return { error: 'Nur der Host darf das.' };
        this.force();
        return { ok: true };
      case 'next':
        if (!player.isHost) return { error: 'Nur der Host darf das.' };
        this.next();
        return { ok: true };
      default: return { error: 'Unbekannte Aktion.' };
    }
  }

  playersChanged() {
    if (this.phase === 'final' || this.phase === 'result') return;
    // Neue Mitspieler kommen hinten in die Würfelreihe und bekommen ein leeres Blatt
    for (const p of this.players()) {
      if (!this.order.includes(p.id)) this.order.push(p.id);
      this.sheet(p.id);
    }
    // Ist der Würfelnde weg, ist der Nächste dran
    const present = new Set(this.players().map((p) => p.id));
    if (this.phase === 'roll' && !present.has(this.activeId) && present.size) this.nextTurn();
    if (this.phase === 'color' && !present.has(this.activeId)) this.endColor({ absent: true });
    this.checkWhiteDone();
  }

  view(viewer) {
    const scores = this.scores();
    const ids = this.order.filter((id) => this.sheets.has(id));
    const players = ids.map((id) => {
      const s = this.sheets.get(id);
      const pending = this.pending.get(id) || null;
      return {
        id,
        rows: s.rows,
        locks: s.locks,
        penalties: s.penalties,
        score: scores[id],
        total: (this.totals[id] || 0) + (this.phase === 'result' || this.phase === 'final' ? 0 : scores[id].total),
        pending,
        done: this.phase === 'white' ? this.done.has(id) : null,
      };
    });
    const view = {
      phase: this.phase,
      gameNo: this.gameNo,
      games: this.settings.games,
      hints: this.settings.hints,
      activeId: this.activeId,
      isActive: viewer.id === this.activeId,
      playing: this.sheets.has(viewer.id),
      dice: this.dice,
      rollSeq: this.rollSeq,
      closed: [...this.closed],
      rows: ROWS,
      players,
      options: this.options(viewer.id),
      canAct: this.canAct(viewer),
      usedThisTurn: this.usedThisTurn,
      events: this.events,
      deadline: this.deadline,
      paused: false,
      serverNow: Date.now(),
    };
    if (this.phase === 'result' || this.phase === 'final') {
      view.totals = this.totals;
      view.lastScores = this.results[this.results.length - 1].scores;
    }
    return view;
  }

  dispose() {
    this.clearTimer();
  }
}

KreuzQuer.canMark = canMark;
KreuzQuer.rowPoints = rowPoints;
KreuzQuer.sheetScore = sheetScore;
module.exports = KreuzQuer;
