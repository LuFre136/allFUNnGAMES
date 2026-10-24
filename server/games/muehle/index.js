// Mühle: das klassische Brettspiel für genau zwei Spieler, gespielt als Serie (Standard: Best of 3).
// Setzen, Ziehen, Springen; wer eine Mühle schließt, nimmt einen gegnerischen Stein.

const crypto = require('crypto');
const Rules = require('./rules');

const PLAYERS = 2;
const BEST_OF = [1, 3, 5, 0]; // 0 = ohne Ende, der Host beendet die Serie
const TIME_LIMITS = [0, 15, 30, 60];
const MAX_TIMEOUTS = 3; // so oft hintereinander die Zeit verstreichen lassen, dann ist die Partie verloren
const AWAY_MS = 60 * 1000;

const REASONS = {
  stones: 'nur noch zwei Steine',
  blocked: 'eingesperrt',
  resign: 'aufgegeben',
  time: 'dreimal die Zeit verstreichen lassen',
  left: 'nicht zurückgekommen',
  repetition: 'dreimal dieselbe Stellung',
  noCapture: `${Rules.DRAW_MOVES} Züge ohne Schlagen`,
  agreed: 'Remis vereinbart',
};

class Muehle {
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
      id: 'muehle',
      name: 'Mühle',
      icon: '⚪',
      description: 'Drei in einer Reihe, und weg ist der Stein. Der Klassiker für zwei.',
      players: '2 Spieler',
      minPlayers: PLAYERS,
      maxPlayers: PLAYERS,
      available: true,
      teams: false,
      sharedDevice: true, // alles liegt offen, das Handy kann zwischen den beiden hin- und hergehen
    };
  }

  static defaultSettings() {
    return { bestOf: 3, flying: true, doubleMill: 1, timeLimit: 0, preview: true };
  }

  static sanitizeSettings(current, patch) {
    const next = { ...current };
    if (patch.bestOf !== undefined && BEST_OF.includes(Number(patch.bestOf))) next.bestOf = Number(patch.bestOf);
    if (patch.flying !== undefined) next.flying = Boolean(patch.flying);
    if (patch.doubleMill !== undefined && [1, 2].includes(Number(patch.doubleMill))) next.doubleMill = Number(patch.doubleMill);
    if (patch.timeLimit !== undefined && TIME_LIMITS.includes(Number(patch.timeLimit))) next.timeLimit = Number(patch.timeLimit);
    if (patch.preview !== undefined) next.preview = Boolean(patch.preview);
    return next;
  }

  static availableCount() {
    return 0;
  }

  get settings() {
    return this.lobby.settings.game;
  }

  name(id) {
    return this.lobby.players.get(id)?.name || 'Jemand';
  }

  present() {
    return new Set(this.lobby.activePlayers().map((p) => p.id));
  }

  start() {
    const players = this.lobby.activePlayers();
    if (players.length !== PLAYERS) {
      throw new Error(`Mühle spielt man zu zweit. Gerade ${players.length === 1 ? 'ist nur 1 Spieler' : `sind es ${players.length} Spieler`} da.`);
    }
    // Wer in der ersten Partie Weiß ist, wird gelost
    this.ids = players.map((p) => p.id);
    if (crypto.randomInt(2)) this.ids.reverse();
    for (const id of this.ids) {
      this.score[id] = 0;
      this.stats[id] = { wins: 0, draws: 0, mills: 0, fastestWin: null };
    }
    this.startGame();
  }

  // Weiß und Schwarz wechseln jede Partie
  colorOf(id) {
    const white = this.ids[(this.gameNo - 1) % 2];
    if (!this.ids.includes(id)) return null;
    return id === white ? 'w' : 'b';
  }

  idOf(color) {
    return this.ids.find((id) => this.colorOf(id) === color);
  }

  startGame() {
    this.gameNo++;
    this.state = Rules.create({ flying: this.settings.flying, doubleMill: this.settings.doubleMill });
    this.phase = 'play';
    this.lastMove = null;
    this.result = null;
    this.timeouts = { w: 0, b: 0 };
    this.drawOffer = null;
    this.startTimer();
    this.checkAway();
  }

  turnId() {
    return this.phase === 'play' ? this.idOf(this.state.turn) : null;
  }

  controls(player, id) {
    return !!id && (id === player.id || this.lobby.players.get(id)?.guestOf === player.id);
  }

  // Führt einen Zug aus; `auto` heißt: vom Zeitgeber oder vom Host ausgelöst
  play(move, auto = false) {
    const color = this.state.turn;
    const { formed } = Rules.apply(this.state, move);
    if (!auto) this.timeouts[color] = 0;
    this.drawOffer = null;
    const seq = ++this.moveSeq;
    if (move.type === 'remove') {
      // Das Wegnehmen gehört zum Zug davor, beides wird zusammen angezeigt
      const last = this.lastMove && this.lastMove.color === color ? this.lastMove : { color, mills: [] };
      this.lastMove = { ...last, seq, removed: [...(last.removed || []), move.at] };
    } else {
      this.lastMove = { seq, color, type: move.type, from: move.from ?? null, to: move.to, mills: formed, removed: [] };
    }
    if (this.state.result) this.finishGame(this.state.result);
    else this.startTimer();
  }

  randomMove() {
    const moves = Rules.legalMoves(this.state);
    return moves[crypto.randomInt(moves.length)];
  }

  finishGame({ winner, reason }) {
    this.clearTimer();
    const winnerId = winner ? this.idOf(winner) : null;
    const loserId = winner ? this.idOf(Rules.other(winner)) : null;
    for (const id of this.ids) this.stats[id].mills += this.state.mills[this.colorOf(id)];
    if (winnerId) {
      this.score[winnerId] += 1;
      const s = this.stats[winnerId];
      s.wins++;
      // Schnellster Sieg zählt nur auf dem Brett, nicht durch Aufgeben oder Zeit
      const moves = Math.ceil(this.state.plies / 2);
      if ((reason === 'stones' || reason === 'blocked') && (s.fastestWin === null || moves < s.fastestWin)) s.fastestWin = moves;
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
      plies: this.state.plies,
      mills: Object.fromEntries(this.ids.map((id) => [id, this.state.mills[this.colorOf(id)]])),
      white: this.idOf('w'),
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

  startTimer() {
    this.clearTimer();
    const limit = this.settings.timeLimit;
    if (!limit || this.phase !== 'play') return;
    this.deadline = Date.now() + limit * 1000;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.timeout();
      this.lobby.broadcast();
    }, limit * 1000);
  }

  timeout() {
    if (this.phase !== 'play') return;
    const color = this.state.turn;
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
      const color = this.colorOf(away);
      if (this.phase === 'play') {
        this.finishGame({ winner: Rules.other(color), reason: 'left' });
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

  action(player, data) {
    const { type } = data;
    if (type === 'force' || type === 'draw' || type === 'finish') {
      if (!player.isHost) return { error: 'Nur der Host darf das.' };
      if (type === 'finish') {
        if (this.phase === 'final') return { ok: true };
        this.clearTimer();
        this.clearAway();
        this.phase = 'final';
        return { ok: true };
      }
      if (this.phase !== 'play') return { error: 'Gerade läuft keine Partie.' };
      if (type === 'draw') {
        this.finishGame({ winner: null, reason: 'agreed' });
        return { ok: true };
      }
      this.play(this.randomMove(), true);
      return { ok: true };
    }
    if (this.phase !== 'play') return { error: 'Gerade läuft keine Partie.' };
    if (type === 'resign') {
      const own = this.ids.filter((i) => this.controls(player, i));
      if (!own.length) return { error: 'Du spielst nicht mit.' };
      // Spielen beide am selben Gerät, gibt auf, wer gerade am Zug ist
      const target = own.length > 1 ? this.turnId() : own[0];
      this.finishGame({ winner: Rules.other(this.colorOf(target)), reason: 'resign' });
      return { ok: true };
    }
    if (!this.controls(player, this.turnId())) return { error: 'Du bist nicht dran.' };
    const move = { type };
    if (type === 'place') move.to = Number(data.to);
    else if (type === 'move') {
      move.from = Number(data.from);
      move.to = Number(data.to);
    } else if (type === 'remove') move.at = Number(data.at);
    else return { error: 'Unbekannte Aktion.' };
    if (!Rules.isLegal(this.state, move)) {
      if (this.state.pendingRemove) return { error: 'Erst einen gegnerischen Stein nehmen.' };
      return { error: 'Dieser Zug geht nicht.' };
    }
    this.play(move);
    return { ok: true };
  }

  playersChanged() {
    this.checkAway();
  }

  view(viewer) {
    const s = this.state;
    const turnId = this.turnId();
    const mine = this.phase === 'play' && this.controls(viewer, turnId);
    return {
      phase: this.phase,
      gameNo: this.gameNo,
      bestOf: this.settings.bestOf,
      preview: this.settings.preview,
      coords: Rules.COORDS,
      board: s.board,
      players: this.ids.map((id) => {
        const color = this.colorOf(id);
        return {
          id,
          color,
          hand: s.hand[color],
          onBoard: Rules.onBoard(s, color),
          lost: Rules.STONES - s.hand[color] - Rules.onBoard(s, color),
          stage: Rules.phaseOf(s, color),
          score: this.score[id],
          mine: this.controls(viewer, id),
        };
      }),
      turn: this.phase === 'play' ? s.turn : null,
      turnId,
      pendingRemove: this.phase === 'play' ? s.pendingRemove : 0,
      mine,
      legal: mine ? Rules.legalMoves(s) : [],
      lastMove: this.lastMove,
      plies: s.plies,
      noCapture: s.noCapture,
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

Muehle.Rules = Rules;
module.exports = Muehle;
