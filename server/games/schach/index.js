// Schach für zwei bis vier: zu zweit klassisch auf 8 × 8, zu dritt und zu viert auf dem Kreuzbrett
// (jeder gegen jeden, zu viert auch zwei gegen zwei mit dem Partner gegenüber). Alles liegt offen,
// darum geht auch ein einziges Gerät, das reihum weitergegeben wird.

const crypto = require('crypto');
const Rules = require('./rules');

const GAMES = [1, 3, 5, 0]; // 0 = ohne Ende, der Host beendet die Serie
const CLOCKS = [0, 3, 5, 10, 15, 30]; // Bedenkzeit pro Spieler und Partie in Minuten, 0 = ohne Uhr
const AWAY_MS = 60 * 1000;

const REASONS = {
  mate: 'schachmatt',
  stalemate: 'patt',
  king: 'König geschlagen',
  resign: 'aufgegeben',
  time: 'Zeit abgelaufen',
  timeMaterial: 'Zeit abgelaufen, aber der Gegner kann nicht mehr mattsetzen',
  left: 'nicht zurückgekommen',
  repetition: 'dreimal dieselbe Stellung',
  material: 'zu wenig Figuren zum Mattsetzen',
  fifty: `${Rules.DRAW_MOVES} Züge ohne Schlagen und ohne Bauernzug`,
  agreed: 'Remis gewertet',
};

class Schach {
  constructor(lobby) {
    this.lobby = lobby;
    this.ids = [];
    this.score = {};
    this.stats = {};
    this.results = [];
    this.gameNo = 0;
    this.moveSeq = 0;
    this.timer = null;
    this.away = new Map(); // Spieler-ID -> { until, timer }
  }

  static meta() {
    return {
      id: 'schach',
      name: 'Schach',
      icon: '♟️',
      description: 'Zu zweit klassisch, zu dritt und zu viert auf dem Kreuzbrett. Auch an einem Gerät.',
      players: '2–4 Spieler',
      minPlayers: 2,
      maxPlayers: 4,
      available: true,
      teams: false,
      sharedDevice: true, // alles liegt offen, das Gerät kann reihum weitergegeben werden
    };
  }

  static defaultSettings() {
    return { games: 1, clock: 0, fourMode: 'ffa', preview: true };
  }

  static sanitizeSettings(current, patch) {
    const next = { ...current };
    if (patch.games !== undefined && GAMES.includes(Number(patch.games))) next.games = Number(patch.games);
    if (patch.clock !== undefined && CLOCKS.includes(Number(patch.clock))) next.clock = Number(patch.clock);
    if (patch.fourMode !== undefined && ['ffa', 'teams'].includes(patch.fourMode)) next.fourMode = patch.fourMode;
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
    const players = this.lobby.activePlayers();
    if (players.length < 2) throw new Error('Schach braucht mindestens 2 Spieler.');
    if (players.length > 4) throw new Error(`Schach geht mit höchstens 4 Spielern, gerade sind es ${players.length}.`);
    // Die Sitzordnung wird gelost und rückt jede Partie einen Platz weiter
    this.ids = players.map((p) => p.id);
    for (let i = this.ids.length - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [this.ids[i], this.ids[j]] = [this.ids[j], this.ids[i]];
    }
    this.mode = this.ids.length === 2 ? 'classic' : this.ids.length === 4 && this.settings.fourMode === 'teams' ? 'teams' : 'ffa';
    for (const id of this.ids) {
      this.score[id] = 0;
      this.stats[id] = { wins: 0, draws: 0, material: 0, mates: 0, fastestWin: null };
    }
    this.startGame();
  }

  seatList() {
    if (this.mode === 'classic') return [0, 2];
    return this.ids.length === 3 ? [0, 1, 2] : [0, 1, 2, 3];
  }

  // Wer auf welchem Platz sitzt: jede Partie rückt jeder einen Platz weiter (im Team bleiben Partner gegenüber)
  assignSeats() {
    const seats = this.seatList();
    const k = this.ids.length;
    this.seatOf = {};
    this.idAt = {};
    seats.forEach((seat, i) => {
      const id = this.ids[(i + k - ((this.gameNo - 1) % k)) % k];
      this.seatOf[id] = seat;
      this.idAt[seat] = id;
    });
  }

  startGame() {
    this.gameNo++;
    this.assignSeats();
    this.state = Rules.create({ seats: this.seatList(), mode: this.mode });
    this.phase = 'play';
    this.lastMove = null;
    this.history = [];
    this.result = null;
    this.legal = Rules.legalMoves(this.state);
    const ms = this.settings.clock * 60 * 1000;
    this.clocks = ms ? Object.fromEntries(this.state.seats.map((seat) => [seat, ms])) : null;
    this.turnStart = Date.now();
    this.startClock();
    this.checkAway();
  }

  turnId() {
    return this.phase === 'play' && this.state.turn !== null ? this.idAt[this.state.turn] : null;
  }

  controls(player, id) {
    return !!id && (id === player.id || this.lobby.players.get(id)?.guestOf === player.id);
  }

  // ---------- Uhr ----------

  // Bucht die verbrauchte Zeit auf die Uhr dessen, der gerade dran ist
  charge() {
    const now = Date.now();
    if (this.clocks && this.phase === 'play' && this.state.turn !== null) {
      this.clocks[this.state.turn] = Math.max(0, this.clocks[this.state.turn] - (now - this.turnStart));
    }
    this.turnStart = now;
  }

  clearClock() {
    clearTimeout(this.timer);
    this.timer = null;
  }

  startClock() {
    this.clearClock();
    if (!this.clocks || this.phase !== 'play' || this.state.turn === null) return;
    const seat = this.state.turn;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.charge();
      this.flag(seat);
      this.lobby.broadcast();
    }, this.clocks[seat] + 50);
  }

  flag(seat) {
    if (this.phase !== 'play' || !this.state.alive[seat]) return;
    const s = this.state;
    if (s.mode === 'classic' && !Rules.canMate(s, Rules.enemies(s, seat)[0])) {
      Rules.finish(s, { winners: [], draw: true, reason: 'timeMaterial' });
    } else {
      this.out(seat, 'time');
    }
    this.afterChange();
  }

  // ---------- Züge ----------

  // Nimmt einen Platz aus der Partie (aufgegeben, Zeit, weg) und meldet es im Verlauf
  out(seat, reason) {
    Rules.eliminate(this.state, seat, reason);
    this.history.push({ seat, note: REASONS[reason] || reason, event: true });
  }

  afterChange() {
    if (this.state.result) this.finishGame();
    else {
      this.legal = Rules.legalMoves(this.state);
      this.startClock();
    }
  }

  play(move) {
    this.charge();
    const info = Rules.apply(this.state, move);
    this.lastMove = { ...info, seq: ++this.moveSeq };
    this.history.push({ seat: info.seat, note: info.note });
    for (const o of info.out) {
      if (o.reason === 'mate') this.stats[this.idAt[info.seat]].mates++;
      this.history.push({ seat: o.seat, note: REASONS[o.reason], event: true });
    }
    if (info.captured) this.stats[this.idAt[info.seat]].material += Rules.VALUE[info.captured.t];
    this.afterChange();
  }

  randomMove() {
    const moves = this.legal.filter((m) => !m.promo || m.promo === 'q');
    return moves[crypto.randomInt(moves.length)];
  }

  finishGame() {
    this.clearClock();
    const s = this.state;
    const r = s.result;
    const total = s.seats.length;
    const points = {};
    for (const seat of s.seats) {
      const id = this.idAt[seat];
      const place = r.places[seat];
      points[id] = this.mode === 'teams' ? 2 - place : total - place;
      this.score[id] += points[id];
    }
    const moves = Math.ceil(s.plies / s.seats.length);
    for (const seat of r.winners) {
      const st = this.stats[this.idAt[seat]];
      st.wins++;
      if (['mate', 'stalemate', 'king'].includes(r.reason) && (st.fastestWin === null || moves < st.fastestWin)) st.fastestWin = moves;
    }
    if (r.draw) for (const seat of Rules.aliveSeats(s)) this.stats[this.idAt[seat]].draws++;
    this.result = {
      gameNo: this.gameNo,
      mode: this.mode,
      winnerIds: r.winners.map((seat) => this.idAt[seat]),
      draw: r.draw,
      reason: r.reason,
      reasonText: REASONS[r.reason] || r.reason,
      places: Object.fromEntries(s.seats.map((seat) => [this.idAt[seat], r.places[seat]])),
      points,
      out: s.out.map((o) => ({ id: this.idAt[o.seat], reason: REASONS[o.reason] || o.reason })),
      moves,
      seats: { ...this.idAt },
    };
    this.results.push(this.result);
    const gone = this.ids.some((id) => !this.present().has(id) && this.away.get(id)?.expired);
    this.phase = gone || this.seriesOver() ? 'final' : 'gameEnd';
    if (this.phase === 'final') this.clearAway();
  }

  seriesOver() {
    const n = this.settings.games;
    return !!n && this.gameNo >= n;
  }

  next() {
    if (this.phase !== 'gameEnd') return;
    const present = this.present();
    if (this.ids.some((id) => !present.has(id))) {
      this.phase = 'final';
      this.clearAway();
      return;
    }
    this.startGame();
  }

  // ---------- Abwesende ----------

  // Wer während der Partie wegbleibt, bekommt eine Minute, dann gilt die Partie für ihn als aufgegeben
  checkAway() {
    if (this.phase === 'final') return;
    const present = this.present();
    for (const id of this.ids) {
      const entry = this.away.get(id);
      if (present.has(id)) {
        if (entry) {
          clearTimeout(entry.timer);
          this.away.delete(id);
        }
        continue;
      }
      if (entry) continue;
      const until = Date.now() + AWAY_MS;
      const timer = setTimeout(() => {
        const e = this.away.get(id);
        if (e) e.expired = true;
        if (this.phase === 'play') {
          const seat = this.seatOf[id];
          if (this.state.alive[seat]) {
            this.charge();
            this.out(seat, 'left');
            this.afterChange();
          }
        } else if (this.phase === 'gameEnd') {
          this.phase = 'final';
          this.clearAway();
        }
        this.lobby.broadcast();
      }, AWAY_MS);
      this.away.set(id, { until, timer, expired: false });
    }
  }

  clearAway() {
    for (const e of this.away.values()) clearTimeout(e.timer);
    this.away.clear();
  }

  // ---------- Aktionen ----------

  action(player, data) {
    const { type } = data;
    if (type === 'force' || type === 'draw' || type === 'finish') {
      if (!player.isHost) return { error: 'Nur der Host darf das.' };
      if (type === 'finish') {
        if (this.phase === 'final') return { ok: true };
        this.clearClock();
        this.clearAway();
        this.phase = 'final';
        return { ok: true };
      }
      if (this.phase !== 'play') return { error: 'Gerade läuft keine Partie.' };
      if (type === 'draw') {
        this.charge();
        Rules.finish(this.state, { winners: [], draw: true, reason: 'agreed' });
        this.afterChange();
        return { ok: true };
      }
      this.play(this.randomMove());
      return { ok: true };
    }
    if (this.phase !== 'play') return { error: 'Gerade läuft keine Partie.' };
    const s = this.state;
    if (type === 'resign') {
      const own = this.ids.filter((id) => this.controls(player, id) && s.alive[this.seatOf[id]]);
      if (!own.length) return { error: 'Du spielst nicht mit.' };
      // Spielen mehrere am selben Gerät, gibt auf, wer gerade am Zug ist
      const target = own.includes(this.turnId()) ? this.turnId() : own[0];
      this.charge();
      this.out(this.seatOf[target], 'resign');
      this.afterChange();
      return { ok: true };
    }
    if (type !== 'move') return { error: 'Unbekannte Aktion.' };
    if (!this.controls(player, this.turnId())) return { error: 'Du bist nicht dran.' };
    const move = { from: Number(data.from), to: Number(data.to), promo: data.promo || null };
    const legal = this.legal.filter((m) => m.from === move.from && m.to === move.to);
    if (!legal.length) return { error: 'Dieser Zug geht nicht.' };
    if (legal.some((m) => m.promo) && !Rules.PROMOS.includes(move.promo)) return { error: 'In welche Figur soll der Bauer sich verwandeln?' };
    if (!legal.some((m) => m.promo)) move.promo = null;
    this.play(move);
    return { ok: true };
  }

  playersChanged() {
    this.checkAway();
  }

  // ---------- Ansicht ----------

  view(viewer) {
    const s = this.state;
    const turnId = this.turnId();
    const mine = this.phase === 'play' && this.controls(viewer, turnId);
    const now = Date.now();
    return {
      phase: this.phase,
      gameNo: this.gameNo,
      games: this.settings.games,
      preview: this.settings.preview,
      mode: this.mode,
      n: s.n,
      cross: s.cross,
      board: s.board.map((p) => (p ? [p.o, p.t] : null)),
      seats: s.seats.map((seat) => {
        const id = this.idAt[seat];
        const out = s.out.find((o) => o.seat === seat);
        return {
          seat,
          id,
          alive: s.alive[seat],
          out: out ? REASONS[out.reason] || out.reason : null,
          check: s.alive[seat] && Rules.inCheck(s, seat),
          team: this.mode === 'teams' ? Rules.teamOf(seat) : null,
          clock: this.clocks ? this.clocks[seat] - (this.phase === 'play' && s.turn === seat ? now - this.turnStart : 0) : null,
          captured: s.captured[seat],
          score: this.score[id],
          mine: this.controls(viewer, id),
        };
      }),
      turn: this.phase === 'play' ? s.turn : null,
      turnId,
      mine,
      legal: mine ? this.legal.map((m) => [m.from, m.to, m.promo || 0]) : [],
      lastMove: this.lastMove,
      history: this.history,
      plies: s.plies,
      result: this.result,
      results: this.results,
      score: this.score,
      stats: this.phase === 'final' ? this.stats : null,
      away: [...this.away.entries()].filter(([, e]) => !e.expired).map(([id, e]) => ({ id, until: e.until })),
      clockRunning: !!this.clocks && this.phase === 'play',
      serverNow: now,
    };
  }

  dispose() {
    this.clearClock();
    this.clearAway();
  }
}

Schach.Rules = Rules;
module.exports = Schach;
