// Croco Doc: Reihum drückt jeder einen Zahn. Ein zufälliger Zahn lässt das Maul zuschnappen.

const crypto = require('crypto');
const { shuffle } = require('../../util');

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 20;
const TIME_LIMITS = [0, 5, 10, 15, 20, 30, 60];

class CrocoDoc {
  constructor(lobby) {
    this.lobby = lobby;
    this.order = []; // Reihenfolge (Spieler-IDs)
    this.bites = {}; // playerId -> Anzahl Bisse
    this.out = []; // ausgeschiedene Spieler (K.-o.-Modus), in der Reihenfolge des Ausscheidens
    this.history = []; // pro Runde: wer gebissen wurde
    this.roundNo = 0;
    this.timer = null;
    this.deadline = null;
  }

  static meta() {
    return {
      id: 'crocodoc',
      name: 'Croco Doc',
      icon: '🐊',
      description: 'Reihum Zähne drücken. Bei einem schnappt das Krokodil zu!',
      players: `${MIN_PLAYERS}–${MAX_PLAYERS} Spieler`,
      available: true,
      teams: false,
    };
  }

  static defaultSettings() {
    return { teeth: 13, mode: 'rounds', rounds: 3, timeLimit: 0, orderMode: 'random', order: [] };
  }

  static sanitizeSettings(current, patch) {
    const next = { ...current };
    const int = (v, min, max) => {
      const n = Math.round(Number(v));
      return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : null;
    };
    if (patch.teeth !== undefined) next.teeth = int(patch.teeth, 5, 24) ?? next.teeth;
    if (patch.rounds !== undefined) next.rounds = int(patch.rounds, 1, 20) ?? next.rounds;
    if (patch.mode !== undefined) next.mode = patch.mode === 'ko' ? 'ko' : 'rounds';
    if (patch.timeLimit !== undefined) {
      const t = Number(patch.timeLimit);
      if (TIME_LIMITS.includes(t)) next.timeLimit = t;
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
    if (players.length < MIN_PLAYERS) throw new Error(`Croco Doc braucht mindestens ${MIN_PLAYERS} Mitspieler.`);
    if (players.length > MAX_PLAYERS) throw new Error(`Croco Doc geht mit höchstens ${MAX_PLAYERS} Mitspielern.`);
    const ids = players.map((p) => p.id);
    if (this.settings.orderMode === 'manual') {
      // Reihenfolge des Hosts, wer darin fehlt, kommt hinten dran
      const listed = this.settings.order.filter((id) => ids.includes(id));
      this.order = [...listed, ...ids.filter((id) => !listed.includes(id))];
    } else {
      this.order = shuffle(ids);
    }
    this.bites = Object.fromEntries(this.order.map((id) => [id, 0]));
    this.out = [];
    this.history = [];
    this.roundNo = 0;
    this.activeId = this.order[0];
    this.startRound();
  }

  startRound() {
    this.roundNo++;
    this.phase = 'turn';
    this.pressed = Array(this.settings.teeth).fill(null); // playerId, der den Zahn gedrückt hat
    this.badTooth = crypto.randomInt(this.settings.teeth);
    this.bittenId = null;
    this.startTurn();
  }

  clearTimer() {
    clearTimeout(this.timer);
    this.timer = null;
    this.deadline = null;
  }

  startTurn() {
    this.clearTimer();
    const limit = this.settings.timeLimit;
    if (limit > 0) {
      this.deadline = Date.now() + limit * 1000;
      // Zeit abgelaufen: Es wird ein zufälliger Zahn für den Spieler gedrückt
      this.timer = setTimeout(() => {
        this.timer = null;
        this.pressRandom();
        this.lobby.broadcast();
      }, limit * 1000);
    }
  }

  // Wer noch im Spiel ist (im K.-o.-Modus ohne Ausgeschiedene)
  inGame() {
    return this.order.filter((id) => !this.out.includes(id));
  }

  // Nächster Spieler nach `id`, Spieler ohne Verbindung werden übersprungen, solange jemand anderes da ist
  nextAfter(id) {
    const candidates = this.inGame();
    const present = new Set(this.players().map((p) => p.id));
    const start = this.order.indexOf(id);
    for (let i = 1; i <= this.order.length; i++) {
      const next = this.order[(start + i) % this.order.length];
      if (candidates.includes(next) && present.has(next)) return next;
    }
    return candidates.find((c) => c !== id) || candidates[0];
  }

  press(player, index) {
    if (this.phase !== 'turn') return { error: 'Gerade wird nicht gedrückt.' };
    if (player.id !== this.activeId) return { error: 'Du bist nicht dran.' };
    return this.pressTooth(Number(index));
  }

  pressTooth(i) {
    if (!Number.isInteger(i) || i < 0 || i >= this.pressed.length) return { error: 'Diesen Zahn gibt es nicht.' };
    if (this.pressed[i]) return { error: 'Dieser Zahn ist schon gedrückt.' };
    this.pressed[i] = this.activeId;
    if (i === this.badTooth) this.snap();
    else this.activeId = this.nextAfter(this.activeId);
    if (this.phase === 'turn') this.startTurn();
    return { ok: true };
  }

  pressRandom() {
    if (this.phase !== 'turn') return;
    const free = this.pressed.map((p, i) => (p ? null : i)).filter((i) => i !== null);
    this.pressTooth(free[crypto.randomInt(free.length)]);
  }

  snap() {
    this.clearTimer();
    this.bittenId = this.activeId;
    this.bites[this.bittenId] = (this.bites[this.bittenId] || 0) + 1;
    if (this.settings.mode === 'ko') this.out.push(this.bittenId);
    this.history.push({ bittenId: this.bittenId, presses: this.pressed.filter(Boolean).length });
    const done = this.settings.mode === 'ko' ? this.inGame().length <= 1 : this.roundNo >= this.settings.rounds;
    this.phase = done ? 'final' : 'bitten';
  }

  // Host: nächste Runde. Es beginnt, wer nach dem Gebissenen dran ist.
  next() {
    if (this.phase !== 'bitten') return;
    this.activeId = this.nextAfter(this.bittenId);
    this.startRound();
  }

  // Host: aktuellen Spieler überspringen (z. B. wenn er weg ist)
  skip() {
    if (this.phase !== 'turn') return;
    this.activeId = this.nextAfter(this.activeId);
    this.startTurn();
  }

  action(player, { type, ...data }) {
    switch (type) {
      case 'press': return this.press(player, data.index);
      case 'force':
        if (!player.isHost) return { error: 'Nur der Host darf das.' };
        this.pressRandom();
        return { ok: true };
      case 'skip':
        if (!player.isHost) return { error: 'Nur der Host darf das.' };
        this.skip();
        return { ok: true };
      default: return { error: 'Unbekannte Aktion.' };
    }
  }

  playersChanged() {
    if (this.phase === 'final') return;
    // Neue Mitspieler kommen hinten in die Reihe
    for (const p of this.players()) {
      if (!this.order.includes(p.id)) {
        this.order.push(p.id);
        this.bites[p.id] = 0;
      }
    }
  }

  // Platzierung: im Rundenmodus nach wenigsten Bissen, im K.-o.-Modus wer zuletzt rausflog, landet weiter oben
  ranking() {
    if (this.settings.mode === 'ko') {
      const remaining = this.inGame();
      return [...remaining, ...[...this.out].reverse()].map((id, i) => ({ id, bites: this.bites[id] || 0, place: i < remaining.length ? 1 : i + 1 }));
    }
    const sorted = [...this.order].sort((a, b) => this.bites[a] - this.bites[b]);
    return sorted.map((id) => ({ id, bites: this.bites[id], place: sorted.filter((o) => this.bites[o] < this.bites[id]).length + 1 }));
  }

  view(viewer) {
    const done = this.phase !== 'turn';
    const view = {
      phase: this.phase,
      mode: this.settings.mode,
      roundNo: this.roundNo,
      rounds: this.settings.rounds,
      order: this.order,
      out: this.out,
      bites: this.bites,
      activeId: this.phase === 'turn' ? this.activeId : null,
      isActive: this.phase === 'turn' && viewer.id === this.activeId,
      teeth: this.pressed.map((by, i) => ({ pressed: Boolean(by), by, bad: done && i === this.badTooth })),
      bittenId: this.bittenId,
      deadline: this.deadline,
      paused: false,
      serverNow: Date.now(),
    };
    if (this.phase === 'final') view.ranking = this.ranking();
    return view;
  }

  dispose() {
    this.clearTimer();
  }
}

module.exports = CrocoDoc;
