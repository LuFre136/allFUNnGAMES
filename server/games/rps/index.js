// RPS: Schach mit Schere, Stein, Papier nach dem alten ICQ-Spiel, für genau zwei Spieler.
// Jeder stellt verdeckt 14 Figuren auf (Fahne, Falle, je 4 Steine, Papiere, Scheren). Wer auf eine
// gegnerische Figur zieht, kämpft mit Schere, Stein, Papier; wer die Fahne erwischt, gewinnt.

const crypto = require('crypto');
const Rules = require('./rules');

const PLAYERS = 2;
const BEST_OF = [1, 3, 5, 0]; // 0 = ohne Ende, der Host beendet die Serie
const TIME_LIMITS = [0, 15, 30, 60];
const MAX_TIMEOUTS = 3; // so oft hintereinander die Zeit verstreichen lassen, dann ist die Partie verloren
const PICK_MS = 20 * 1000; // Zeit für die neue Waffe nach einem Gleichstand, wenn ein Zeitlimit läuft
const DRAW_PLIES = 100; // so viele Züge ohne Kampf, dann ist es Remis
const AWAY_MS = 60 * 1000;

const REASONS = {
  flag: 'Fahne erobert',
  pieces: 'keine Kämpfer mehr',
  blocked: 'kann nicht mehr ziehen',
  stuck: 'beide können nicht mehr ziehen',
  noClash: `${DRAW_PLIES} Züge ohne Kampf`,
  resign: 'aufgegeben',
  time: 'dreimal die Zeit verstreichen lassen',
  left: 'nicht zurückgekommen',
  agreed: 'Remis gewertet',
};

class Rps {
  constructor(lobby) {
    this.lobby = lobby;
    this.ids = [];
    this.score = {};
    this.stats = {};
    this.results = [];
    this.gameNo = 0;
    this.moveSeq = 0;
    this.timer = null;
    this.deadline = null;
    this.awayTimer = null;
    this.awayId = null;
    this.awayUntil = null;
  }

  static meta() {
    return {
      id: 'rps',
      name: 'RPS',
      icon: '✂️',
      description: 'Schach mit Schere, Stein, Papier wie früher bei ICQ. Finde die Fahne, meide die Falle.',
      players: '2 Spieler',
      minPlayers: PLAYERS,
      maxPlayers: PLAYERS,
      available: true,
      teams: false,
      sharedDevice: false, // die Figuren sind geheim, jeder braucht ein eigenes Gerät
    };
  }

  static defaultSettings() {
    return { bestOf: 3, timeLimit: 0, reveal: true, preview: true };
  }

  static sanitizeSettings(current, patch) {
    const next = { ...current };
    if (patch.bestOf !== undefined && BEST_OF.includes(Number(patch.bestOf))) next.bestOf = Number(patch.bestOf);
    if (patch.timeLimit !== undefined && TIME_LIMITS.includes(Number(patch.timeLimit))) next.timeLimit = Number(patch.timeLimit);
    if (patch.reveal !== undefined) next.reveal = Boolean(patch.reveal);
    if (patch.preview !== undefined) next.preview = Boolean(patch.preview);
    return next;
  }

  static availableCount() {
    return 0;
  }

  get settings() {
    return this.lobby.settings.game;
  }

  present() {
    return new Set(this.lobby.activePlayers().map((p) => p.id));
  }

  start() {
    const players = this.lobby.activePlayers().filter((p) => !p.guestOf);
    if (players.length !== PLAYERS) {
      throw new Error(`RPS spielt man zu zweit. Gerade ${players.length === 1 ? 'ist nur 1 Spieler' : `sind es ${players.length} Spieler`} da.`);
    }
    // Wer in der ersten Partie Rot ist (und anfängt), wird gelost
    this.ids = players.map((p) => p.id);
    if (crypto.randomInt(2)) this.ids.reverse();
    for (const id of this.ids) {
      this.score[id] = 0;
      this.stats[id] = { wins: 0, draws: 0, won: 0, lost: 0, trapped: 0, flags: 0 };
    }
    this.startGame();
  }

  // Rot und Blau wechseln jede Partie, Rot fängt an
  colorOf(id) {
    if (!this.ids.includes(id)) return null;
    return id === this.ids[(this.gameNo - 1) % 2] ? 'red' : 'blue';
  }

  idOf(color) {
    return this.ids.find((id) => this.colorOf(id) === color);
  }

  colorFor(player) {
    return this.colorOf(player.id);
  }

  startGame() {
    this.gameNo++;
    this.phase = 'setup';
    this.state = null;
    this.setup = {
      red: { arrangement: Rules.randomArrangement(), ready: false },
      blue: { arrangement: Rules.randomArrangement(), ready: false },
    };
    this.lastMove = null;
    this.result = null;
    this.timeouts = { red: 0, blue: 0 };
    this.clearTimer();
    this.checkAway();
  }

  beginPlay() {
    this.state = Rules.create({ red: this.setup.red.arrangement, blue: this.setup.blue.arrangement });
    this.phase = 'play';
    this.startTimer();
  }

  turnId() {
    if (this.phase !== 'play' || this.state.duel) return null;
    return this.idOf(this.state.turn);
  }

  record(event) {
    this.lastMove = { ...event, seq: ++this.moveSeq };
  }

  play(move, auto = false) {
    const color = this.state.turn;
    if (!auto) this.timeouts[color] = 0;
    const event = Rules.apply(this.state, move, { reveal: this.settings.reveal });
    this.record(event);
    this.afterEvent();
  }

  pickWeapon(color, weapon) {
    const event = Rules.pick(this.state, color, weapon, { reveal: this.settings.reveal });
    if (!event) {
      this.startTimer(true);
      return;
    }
    this.record(event);
    this.afterEvent();
  }

  afterEvent() {
    const s = this.state;
    if (!s.result && s.sinceClash >= DRAW_PLIES) s.result = { winner: null, reason: 'noClash' };
    if (s.result) this.finishGame(s.result);
    else this.startTimer();
  }

  randomMove() {
    const moves = Rules.legalMoves(this.state);
    return moves[crypto.randomInt(moves.length)];
  }

  // Nur für diesen Gleichstand; endet er wieder gleich, wählen beide neu
  autoPick() {
    const duel = this.state.duel;
    const missing = ['red', 'blue'].filter((c) => !duel.picks[c]);
    for (const color of missing) {
      if (this.state.duel === duel) this.pickWeapon(color, this.randomWeapon());
    }
  }

  randomWeapon() {
    return Rules.WEAPONS[crypto.randomInt(Rules.WEAPONS.length)];
  }

  finishGame({ winner, reason }) {
    this.clearTimer();
    const winnerId = winner ? this.idOf(winner) : null;
    const loserId = winner ? this.idOf(Rules.other(winner)) : null;
    if (this.state) {
      for (const id of this.ids) {
        const s = this.state.stats[this.colorOf(id)];
        this.stats[id].won += s.won;
        this.stats[id].lost += s.lost;
        this.stats[id].trapped += s.trapped;
      }
    }
    if (winnerId) {
      this.score[winnerId] += 1;
      this.stats[winnerId].wins++;
      if (reason === 'flag') this.stats[winnerId].flags++;
    } else {
      for (const id of this.ids) {
        this.score[id] += 0.5;
        this.stats[id].draws++;
      }
    }
    this.result = {
      gameNo: this.gameNo,
      winnerId,
      loserId,
      reason,
      reasonText: REASONS[reason] || reason,
      plies: this.state ? this.state.plies : 0,
      red: this.idOf('red'),
    };
    this.results.push(this.result);
    this.phase = reason === 'left' || this.seriesOver() ? 'final' : 'gameEnd';
    if (this.phase === 'final') this.clearAway();
  }

  // Best of n: vorbei, wenn einer uneinholbar vorn ist, oder nach n Partien ohne Gleichstand
  seriesOver() {
    const n = this.settings.bestOf;
    if (!n) return false;
    const [a, b] = this.ids.map((id) => this.score[id]);
    if (Math.max(a, b) >= (n + 1) / 2) return true;
    return this.gameNo >= n && a !== b;
  }

  next() {
    if (this.phase !== 'gameEnd') return;
    this.startGame();
  }

  clearTimer() {
    clearTimeout(this.timer);
    this.timer = null;
    this.deadline = null;
  }

  // keep = beim Gleichstand läuft die Frist weiter, wenn erst einer gewählt hat
  startTimer(keep = false) {
    if (keep && this.timer) return;
    this.clearTimer();
    const limit = this.settings.timeLimit;
    if (!limit || this.phase !== 'play') return;
    const ms = this.state.duel ? Math.max(PICK_MS, limit * 1000) : limit * 1000;
    this.deadline = Date.now() + ms;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.timeout();
      this.lobby.broadcast();
    }, ms);
  }

  timeout() {
    if (this.phase !== 'play') return;
    const s = this.state;
    if (s.duel) {
      // Wer nicht gewählt hat, bekommt eine zufällige Waffe
      this.clearTimer();
      this.autoPick();
      return;
    }
    const color = s.turn;
    this.timeouts[color]++;
    if (this.timeouts[color] >= MAX_TIMEOUTS) {
      this.finishGame({ winner: Rules.other(color), reason: 'time' });
      return;
    }
    this.play(this.randomMove(), true);
  }

  // Wer während der Partie wegbleibt, bekommt eine Minute, dann gilt die Partie als aufgegeben
  checkAway() {
    if (this.phase === 'final') return;
    const present = this.present();
    const away = this.ids.find((id) => !present.has(id)) || null;
    if (away === this.awayId) return;
    this.clearAway();
    if (!away) return;
    this.awayId = away;
    this.awayUntil = Date.now() + AWAY_MS;
    this.awayTimer = setTimeout(() => {
      this.awayTimer = null;
      if (this.phase === 'final') return;
      if (this.phase === 'play' || this.phase === 'setup') {
        this.finishGame({ winner: Rules.other(this.colorOf(away)), reason: 'left' });
      } else {
        this.result = { ...this.result, leftId: away };
        this.phase = 'final';
      }
      this.clearAway();
      this.lobby.broadcast();
    }, AWAY_MS);
  }

  clearAway() {
    clearTimeout(this.awayTimer);
    this.awayTimer = null;
    this.awayId = null;
    this.awayUntil = null;
  }

  hostAction(type) {
    if (type === 'finish') {
      if (this.phase !== 'final') {
        this.clearTimer();
        this.clearAway();
        this.phase = 'final';
      }
      return { ok: true };
    }
    if (this.phase === 'setup' && type === 'force') {
      this.beginPlay();
      return { ok: true };
    }
    if (this.phase !== 'play') return { error: 'Gerade läuft keine Partie.' };
    if (type === 'draw') {
      this.finishGame({ winner: null, reason: 'agreed' });
      return { ok: true };
    }
    // force: Zufallszug bzw. zufällige Waffe für alle, die beim Gleichstand noch nicht gewählt haben
    if (this.state.duel) {
      this.autoPick();
    } else {
      this.play(this.randomMove(), true);
    }
    return { ok: true };
  }

  setupAction(color, data) {
    const mine = this.setup[color];
    const { type } = data;
    if (type === 'ready') {
      mine.ready = true;
      if (this.setup.red.ready && this.setup.blue.ready) this.beginPlay();
      return { ok: true };
    }
    if (type === 'unready') {
      mine.ready = false;
      return { ok: true };
    }
    if (mine.ready) return { error: 'Du bist schon bereit. Tipp auf „Doch noch ändern“.' };
    if (type === 'shuffle') {
      mine.arrangement = Rules.reshuffle(mine.arrangement);
      return { ok: true };
    }
    if (type === 'swap') {
      const a = Number(data.a);
      const b = Number(data.b);
      const n = mine.arrangement.length;
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= n || b >= n) return { error: 'Dieses Feld gibt es nicht.' };
      [mine.arrangement[a], mine.arrangement[b]] = [mine.arrangement[b], mine.arrangement[a]];
      return { ok: true };
    }
    return { error: 'Unbekannte Aktion.' };
  }

  action(player, data) {
    const { type } = data;
    if (type === 'force' || type === 'draw' || type === 'finish') {
      if (!player.isHost) return { error: 'Nur der Host darf das.' };
      return this.hostAction(type);
    }
    const color = this.colorFor(player);
    if (!color) return { error: 'Du spielst nicht mit.' };
    if (this.phase === 'setup') return this.setupAction(color, data);
    if (this.phase !== 'play') return { error: 'Gerade läuft keine Partie.' };
    if (type === 'resign') {
      this.finishGame({ winner: Rules.other(color), reason: 'resign' });
      return { ok: true };
    }
    if (type === 'pick') {
      const duel = this.state.duel;
      if (!duel) return { error: 'Gerade gibt es keinen Gleichstand.' };
      if (duel.picks[color]) return { error: 'Du hast schon gewählt.' };
      if (!Rules.WEAPONS.includes(data.weapon)) return { error: 'Diese Waffe gibt es nicht.' };
      this.pickWeapon(color, data.weapon);
      return { ok: true };
    }
    if (type !== 'move') return { error: 'Unbekannte Aktion.' };
    if (this.state.duel) return { error: 'Erst den Gleichstand entscheiden.' };
    if (this.state.turn !== color) return { error: 'Du bist nicht dran.' };
    const move = { from: Number(data.from), to: Number(data.to) };
    if (!Rules.isLegal(this.state, move)) return { error: 'Dieser Zug geht nicht.' };
    this.timeouts[color] = 0;
    this.play(move);
    return { ok: true };
  }

  playersChanged() {
    this.checkAway();
  }

  // Was der Betrachter vom Brett sieht: eigene Figuren immer, fremde nur, wenn sie aufgedeckt sind
  boardFor(color) {
    const open = this.phase === 'gameEnd' || this.phase === 'final';
    if (this.phase === 'setup') {
      const board = Array(Rules.COLS * Rules.ROWS).fill(null);
      for (const c of ['red', 'blue']) {
        Rules.homeCells(c).forEach((cell, i) => {
          board[cell] = { id: `${c}${i}`, color: c, type: c === color ? this.setup[c].arrangement[i] : null, known: false, slot: i };
        });
      }
      return board;
    }
    return this.state.board.map((p) => p && {
      id: p.id,
      color: p.color,
      type: open || p.known || p.color === color ? p.type : null,
      known: p.known,
    });
  }

  view(viewer) {
    const color = this.colorFor(viewer);
    const s = this.state;
    const duel = this.phase === 'play' && s.duel ? s.duel : null;
    const turnId = this.turnId();
    const mine = !!color && this.phase === 'play' && !duel && s.turn === color;
    const counts = (c) => {
      const left = {};
      for (const t of ['rock', 'paper', 'scissors']) left[t] = s ? Rules.count(s, c, t) : Rules.PER_WEAPON;
      return left;
    };
    return {
      phase: this.phase,
      gameNo: this.gameNo,
      bestOf: this.settings.bestOf,
      reveal: this.settings.reveal,
      preview: this.settings.preview,
      cols: Rules.COLS,
      rows: Rules.ROWS,
      myColor: color,
      board: this.boardFor(color),
      players: this.ids.map((id) => {
        const c = this.colorOf(id);
        return {
          id,
          color: c,
          score: this.score[id],
          ready: this.phase === 'setup' ? this.setup[c].ready : null,
          // Wie viele Kämpfer noch stehen, ist offen (im Original sah man die geschlagenen Figuren)
          left: counts(c),
          mine: id === viewer.id,
        };
      }),
      turn: this.phase === 'play' ? s.turn : null,
      turnId,
      mine,
      legal: mine ? Rules.legalMoves(s) : [],
      duel: duel && {
        from: duel.from,
        to: duel.to,
        picked: { red: !!duel.picks.red, blue: !!duel.picks.blue },
        myPick: color ? duel.picks[color] : null,
        rounds: duel.clash.rounds,
      },
      lastMove: this.lastMove,
      plies: s ? s.plies : 0,
      sinceClash: s ? s.sinceClash : 0,
      drawPlies: DRAW_PLIES,
      result: this.result,
      results: this.results,
      stats: this.phase === 'final' ? this.stats : null,
      awayId: this.awayId,
      awayUntil: this.awayUntil,
      deadline: this.deadline,
      paused: false,
      serverNow: Date.now(),
    };
  }

  dispose() {
    this.clearTimer();
    this.clearAway();
  }
}

Rps.Rules = Rules;
module.exports = Rps;
