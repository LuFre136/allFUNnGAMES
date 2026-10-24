// Backgammon: Zwei Seiten ziehen ihre 15 Steine mit zwei Würfeln einmal ums Brett und würfeln sie hinaus.
// Gespielt wird eine Partie auf Punkte. Im Duell spielen zwei, die anderen schauen zu und tippen auf den
// Sieger. Im Teammodus spielen zwei Teams, pro Spiel zieht ein anderes Teammitglied, die anderen dürfen
// Züge vorschlagen.

const crypto = require('crypto');
const R = require('./rules');

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 16;
const MATCH_TO = [1, 3, 5, 7, 11];
const TIME_LIMITS = [0, 30, 60, 120];
const MAX_CUBE = 64;
const LOG_SIZE = 8;
const COLOR_NAMES = { w: 'Weiß', b: 'Schwarz' };

function rollDie() {
  return crypto.randomInt(6) + 1;
}

function cleanId(id) {
  return typeof id === 'string' && id ? id.slice(0, 40) : null;
}

class Backgammon {
  constructor(lobby) {
    this.lobby = lobby;
    this.seats = { w: null, b: null }; // Duell: Spieler pro Farbe
    this.teamOf = { w: null, b: null }; // Teammodus: Team pro Farbe
    this.movers = { w: null, b: null }; // Teammodus: wer in diesem Spiel zieht
    this.score = { w: 0, b: 0 };
    this.gameNo = 0;
    this.crawfordDone = false;
    this.tipScore = {};
    this.results = [];
    this.stats = { w: { hits: 0, doubles: 0, rolls: 0 }, b: { hits: 0, doubles: 0, rolls: 0 } };
    this.log = [];
    this.logSeq = 0;
    this.rollSeq = 0;
    this.timer = null;
    this.deadline = null;
  }

  static meta() {
    return {
      id: 'backgammon',
      name: 'Backgammon',
      icon: '⚫',
      description: 'Würfeln, ziehen, schlagen. Der Klassiker fürs Duell auf dem Fernseher.',
      players: '2 Spieler (+ Zuschauer)',
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      available: true,
      teams: 'optional',
      maxTeams: 2,
      sharedDevice: true, // alles liegt offen, zwei können sich ein Gerät teilen
    };
  }

  static defaultSettings() {
    return {
      teamMode: false,
      seats: { w: null, b: null },
      matchTo: 3,
      cube: false,
      gammons: true,
      pips: true,
      hints: false,
      timeLimit: 0,
    };
  }

  static sanitizeSettings(current, patch) {
    const next = { ...current, seats: { ...current.seats } };
    if (patch.teamMode !== undefined) next.teamMode = Boolean(patch.teamMode);
    if (patch.matchTo !== undefined && MATCH_TO.includes(Number(patch.matchTo))) next.matchTo = Number(patch.matchTo);
    if (patch.timeLimit !== undefined && TIME_LIMITS.includes(Number(patch.timeLimit))) next.timeLimit = Number(patch.timeLimit);
    for (const k of ['cube', 'gammons', 'pips', 'hints']) if (patch[k] !== undefined) next[k] = Boolean(patch[k]);
    if (patch.seats && typeof patch.seats === 'object') {
      for (const c of R.COLORS) {
        if (patch.seats[c] === undefined) continue;
        next.seats[c] = cleanId(patch.seats[c]);
        // Ein Spieler kann nicht beide Farben haben
        if (next.seats[c] && next.seats[R.other(c)] === next.seats[c]) next.seats[R.other(c)] = null;
      }
    }
    return next;
  }

  static availableCount() {
    return 0;
  }

  get settings() {
    return this.lobby.settings.game;
  }

  get teamMode() {
    return Boolean(this.settings.teamMode);
  }

  addLog(text) {
    this.log.push({ seq: ++this.logSeq, text });
    if (this.log.length > LOG_SIZE) this.log.shift();
  }

  // ---------- Seiten ----------

  start() {
    if (this.teamMode) {
      const teams = this.lobby.teams.slice(0, 2).filter((t) => this.teamMembers(t.id).length);
      if (teams.length < 2) throw new Error('Beide Teams brauchen mindestens einen Spieler.');
      const [first, second] = crypto.randomInt(2) ? [teams[0], teams[1]] : [teams[1], teams[0]];
      this.teamOf = { w: first.id, b: second.id };
    } else {
      const active = this.lobby.activePlayers();
      if (active.length < MIN_PLAYERS) throw new Error('Backgammon braucht zwei Spieler.');
      const ids = active.map((p) => p.id);
      const wanted = this.settings.seats || {};
      const seats = { w: null, b: null };
      for (const c of R.COLORS) if (ids.includes(wanted[c])) seats[c] = wanted[c];
      if (seats.w === seats.b) seats.b = null;
      const rest = ids.filter((id) => id !== seats.w && id !== seats.b);
      if (!seats.w && !seats.b && crypto.randomInt(2)) rest.splice(0, 2, rest[1], rest[0]);
      for (const c of R.COLORS) if (!seats[c]) seats[c] = rest.shift();
      this.seats = seats;
    }
    this.startGame();
  }

  teamMembers(teamId) {
    return this.lobby.playersInTeam(teamId).filter((p) => p.connected);
  }

  // Im Teammodus zieht pro Spiel ein anderes Teammitglied
  pickMover(color) {
    const members = this.teamMembers(this.teamOf[color]);
    if (!members.length) return null;
    return members[(this.gameNo - 1) % members.length].id;
  }

  refreshMovers() {
    if (!this.teamMode) return;
    for (const c of R.COLORS) {
      const current = this.lobby.players.get(this.movers[c]);
      if (!current || !current.connected || current.teamId !== this.teamOf[c]) this.movers[c] = this.pickMover(c);
    }
  }

  // Wer für eine Farbe ziehen darf
  sideIds(color) {
    const id = this.teamMode ? this.movers[color] : this.seats[color];
    return id ? [id] : [];
  }

  controls(player, color) {
    return this.sideIds(color).some((id) => id === player.id || this.lobby.players.get(id)?.guestOf === player.id);
  }

  // Ob jemand, der die Farbe spielen darf, gerade verbunden ist
  sidePresent(color) {
    return this.sideIds(color).some((id) => this.lobby.players.get(id)?.connected);
  }

  sideName(color) {
    if (this.teamMode) return this.lobby.teamById(this.teamOf[color])?.name || COLOR_NAMES[color];
    return this.lobby.players.get(this.seats[color])?.name || COLOR_NAMES[color];
  }

  // Wer auf einer Seite mitspielt (für die Zuschauer-Tipps und die Teamvorschläge)
  onSide(player) {
    if (this.teamMode) return R.COLORS.find((c) => player.teamId && player.teamId === this.teamOf[c]) || null;
    return R.COLORS.find((c) => this.controls(player, c)) || null;
  }

  // ---------- Ablauf ----------

  startGame() {
    this.gameNo++;
    this.board = R.initialBoard();
    this.cube = { value: 1, owner: null };
    // Crawford: Im ersten Spiel, nachdem jemand nur noch einen Punkt vom Ziel entfernt ist, wird nicht verdoppelt
    const target = this.settings.matchTo;
    this.crawford = false;
    if (this.settings.cube && !this.crawfordDone && target > 1 && R.COLORS.some((c) => this.score[c] === target - 1)) {
      this.crawford = true;
      this.crawfordDone = true;
    }
    this.phase = 'opening';
    this.openDice = { w: null, b: null };
    this.openTie = null;
    this.turn = null;
    this.dice = null;
    this.pending = [];
    this.sequences = null;
    this.turnStart = null;
    this.lastTurn = null;
    this.result = null;
    this.tips = {};
    this.tipsOpen = true;
    this.suggestions = {};
    if (this.teamMode) this.movers = { w: this.pickMover('w'), b: this.pickMover('b') };
    this.startTimer();
  }

  actorColor() {
    if (this.phase === 'roll' || this.phase === 'move') return this.turn;
    if (this.phase === 'doubled') return R.other(this.turn);
    return null;
  }

  rollOpening(color) {
    this.openDice[color] = rollDie();
    this.rollSeq++;
    const { w, b } = this.openDice;
    if (w === null || b === null) return { ok: true };
    if (w === b) {
      this.openTie = [w, b];
      this.openDice = { w: null, b: null };
      this.addLog(`🎲 Beide würfeln eine ${w}, noch einmal!`);
      this.startTimer();
      return { ok: true };
    }
    this.openTie = null;
    this.tipsOpen = false;
    this.turn = w > b ? 'w' : 'b';
    this.dice = this.turn === 'w' ? [w, b] : [b, w];
    this.addLog(`🎲 ${this.sideName(this.turn)} beginnt mit ${this.dice[0]} und ${this.dice[1]}.`);
    this.stats[this.turn].rolls++;
    this.beginMove();
    return { ok: true };
  }

  roll() {
    this.dice = [rollDie(), rollDie()];
    this.rollSeq++;
    this.stats[this.turn].rolls++;
    if (this.dice[0] === this.dice[1]) this.stats[this.turn].doubles++;
    this.beginMove();
    return { ok: true };
  }

  beginMove() {
    this.phase = 'move';
    this.turnStart = R.clone(this.board);
    this.pending = [];
    this.suggestions = {};
    this.sequences = R.legalSequences(this.board, this.turn, this.dice);
    if (!this.sequences[0].length) {
      this.addLog(`🚫 ${this.sideName(this.turn)} kann mit ${this.dice[0]} und ${this.dice[1]} nicht ziehen.`);
      this.lastTurn = { color: this.turn, dice: this.dice, moves: [], noMove: true };
      this.endTurn();
      return;
    }
    this.startTimer();
  }

  publicMove(move) {
    return { from: R.toPublic(this.turn, move.from), to: R.toPublic(this.turn, move.to), die: move.die, hit: !!move.hit };
  }

  move(from, to) {
    const f = R.fromPublic(this.turn, from);
    const t = R.fromPublic(this.turn, to);
    const options = R.nextMoves(this.sequences, this.pending).filter((m) => m.from === f && m.to === t);
    if (!options.length) return { error: 'Dieser Zug geht nicht.' };
    // Beim Hinauswürfeln passen manchmal zwei Augenzahlen: lieber die genaue, sonst die kleinere
    const exact = options.find((m) => m.from - m.die === m.to);
    const move = exact || options.sort((a, b) => a.die - b.die)[0];
    const { board, hit } = R.applyMove(this.board, this.turn, move);
    this.board = board;
    this.pending.push({ ...move, hit });
    if (hit) {
      this.stats[this.turn].hits++;
      this.addLog(`💥 ${this.sideName(this.turn)} schlägt einen Stein von ${this.sideName(R.other(this.turn))}.`);
    }
    if (this.board.off[this.turn] === R.CHECKERS) {
      this.lastTurn = { color: this.turn, dice: this.dice, moves: this.pending.map((m) => this.publicMove(m)) };
      this.finishGame(this.turn, R.winType(this.board, this.turn), false);
      return { ok: true };
    }
    this.suggestions = {};
    return { ok: true };
  }

  undo() {
    if (!this.pending.length) return { error: 'Es gibt nichts zurückzunehmen.' };
    const undone = this.pending.pop();
    // Zurückgenommene Treffer zählen nicht
    if (undone.hit) this.stats[this.turn].hits--;
    this.board = R.clone(this.turnStart);
    for (const m of this.pending) this.board = R.applyMove(this.board, this.turn, m).board;
    this.suggestions = {};
    return { ok: true };
  }

  commit() {
    if (!R.isComplete(this.sequences, this.pending)) {
      return { error: this.pending.length < this.sequences[0].length ? 'Du musst noch weiterziehen.' : 'Dieser Zug geht so nicht.' };
    }
    this.lastTurn = { color: this.turn, dice: this.dice, moves: this.pending.map((m) => this.publicMove(m)) };
    this.endTurn();
    return { ok: true };
  }

  endTurn() {
    this.turn = R.other(this.turn);
    this.phase = 'roll';
    this.dice = null;
    this.pending = [];
    this.sequences = null;
    this.turnStart = null;
    this.suggestions = {};
    this.startTimer();
  }

  canDouble(color) {
    return this.settings.cube && !this.crawford && this.phase === 'roll' && this.turn === color
      && this.cube.value < MAX_CUBE && (this.cube.owner === null || this.cube.owner === color);
  }

  double() {
    this.phase = 'doubled';
    this.addLog(`✖️2 ${this.sideName(this.turn)} verdoppelt auf ${this.cube.value * 2}.`);
    this.startTimer();
    return { ok: true };
  }

  take() {
    const taker = R.other(this.turn);
    this.cube = { value: this.cube.value * 2, owner: taker };
    this.addLog(`👍 ${this.sideName(taker)} nimmt an, es geht um ${this.cube.value}.`);
    this.phase = 'roll';
    this.startTimer();
    return { ok: true };
  }

  drop() {
    this.addLog(`🏳️ ${this.sideName(R.other(this.turn))} gibt auf.`);
    this.finishGame(this.turn, 1, true);
    return { ok: true };
  }

  finishGame(winner, type, dropped) {
    this.clearTimer();
    const kind = this.settings.gammons && !dropped ? type : 1;
    const points = kind * this.cube.value;
    this.score[winner] += points;
    for (const [id, color] of Object.entries(this.tips)) {
      if (color === winner) this.tipScore[id] = (this.tipScore[id] || 0) + 1;
    }
    this.result = { winner, type: dropped ? 1 : type, counted: kind, dropped, cube: this.cube.value, points, tips: { ...this.tips } };
    this.results.push({ gameNo: this.gameNo, ...this.result });
    const word = kind === 3 ? 'Backgammon' : kind === 2 ? 'Gammon' : 'Sieg';
    this.addLog(`🏁 ${this.sideName(winner)}: ${dropped ? 'Aufgabe angenommen' : word}, ${points} ${points === 1 ? 'Punkt' : 'Punkte'}.`);
    this.turn = null;
    this.dice = null;
    this.pending = [];
    this.sequences = null;
    this.phase = this.score[winner] >= this.settings.matchTo ? 'final' : 'gameEnd';
  }

  next() {
    if (this.phase !== 'gameEnd') return;
    this.startGame();
  }

  // ---------- Zeit und Host ----------

  // Zeit abgelaufen oder Host drängt: würfeln, einen zufälligen erlaubten Zug ziehen bzw. annehmen
  autoPlay() {
    switch (this.phase) {
      case 'opening':
        for (const c of R.COLORS) if (this.phase === 'opening' && this.openDice[c] === null) this.rollOpening(c);
        return { ok: true };
      case 'roll':
        return this.roll();
      case 'move': {
        const prefix = this.pending.map(R.key).join('|');
        const options = this.sequences.filter((s) => s.slice(0, this.pending.length).map(R.key).join('|') === prefix);
        const seq = options[crypto.randomInt(options.length)];
        for (const m of seq.slice(this.pending.length)) {
          this.move(R.toPublic(this.turn, m.from), R.toPublic(this.turn, m.to));
          if (this.phase !== 'move') return { ok: true };
        }
        return this.commit();
      }
      case 'doubled':
        return this.take();
      default:
        return { ok: true };
    }
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
      // Ein angefangener Zug wird zufällig zu Ende gezogen, ein neuer Wurf aber nicht mehr gezogen
      this.autoPlay();
      this.lobby.broadcast();
    }, limit * 1000);
  }

  action(player, data) {
    const { type } = data;
    if (type === 'force') {
      if (!player.isHost) return { error: 'Nur der Host darf das.' };
      if (this.phase === 'gameEnd' || this.phase === 'final') return { error: 'Gerade gibt es nichts zu tun.' };
      return this.autoPlay();
    }
    if (type === 'seat') return this.seat(player, data);
    if (this.phase === 'final') return { error: 'Die Partie ist vorbei.' };
    if (type === 'tip') return this.tip(player, data.color);
    if (type === 'suggest') return this.suggest(player, data);
    if (this.phase === 'opening') {
      if (type !== 'roll') return { error: 'Erst würfeln beide einen Würfel.' };
      const color = R.COLORS.find((c) => this.openDice[c] === null && this.controls(player, c));
      if (!color) return { error: R.COLORS.some((c) => this.controls(player, c)) ? 'Du hast schon gewürfelt.' : 'Du spielst nicht mit.' };
      return this.rollOpening(color);
    }
    const actor = this.actorColor();
    if (!actor || !this.controls(player, actor)) return { error: 'Du bist nicht dran.' };
    switch (type) {
      case 'roll':
        if (this.phase !== 'roll') return { error: 'Du hast schon gewürfelt.' };
        return this.roll();
      case 'double':
        if (!this.canDouble(actor)) return { error: 'Verdoppeln geht gerade nicht.' };
        return this.double();
      case 'take':
        if (this.phase !== 'doubled') return { error: 'Gerade wurde nicht verdoppelt.' };
        return this.take();
      case 'drop':
        if (this.phase !== 'doubled') return { error: 'Gerade wurde nicht verdoppelt.' };
        return this.drop();
      case 'move':
        if (this.phase !== 'move') return { error: 'Erst würfeln.' };
        return this.move(data.from, data.to);
      case 'undo':
        if (this.phase !== 'move') return { error: 'Gerade gibt es nichts zurückzunehmen.' };
        return this.undo();
      case 'commit':
        if (this.phase !== 'move') return { error: 'Erst würfeln.' };
        return this.commit();
      default:
        return { error: 'Unbekannte Aktion.' };
    }
  }

  // Zuschauer tippen vor jedem Spiel auf den Sieger
  tip(player, color) {
    if (!R.COLORS.includes(color)) return { error: 'Unbekannte Farbe.' };
    if (!this.tipsOpen) return { error: 'Getippt wird vor dem ersten Zug.' };
    if (this.onSide(player)) return { error: 'Wer mitspielt, tippt nicht.' };
    this.tips[player.id] = color;
    return { ok: true };
  }

  // Teammodus: Teammitglieder zeigen dem Ziehenden einen Zug
  suggest(player, { from, to }) {
    if (!this.teamMode || this.phase !== 'move') return { error: 'Gerade gibt es nichts vorzuschlagen.' };
    if (this.onSide(player) !== this.turn || this.controls(player, this.turn)) return { error: 'Nur dein Team kann Vorschläge machen.' };
    if (from === null || from === undefined) {
      delete this.suggestions[player.id];
      return { ok: true };
    }
    const f = R.fromPublic(this.turn, from);
    const t = R.fromPublic(this.turn, to);
    if (!R.nextMoves(this.sequences, this.pending).some((m) => m.from === f && m.to === t)) return { error: 'Dieser Zug geht nicht.' };
    this.suggestions[player.id] = { from, to };
    return { ok: true };
  }

  // Duell: Der Host setzt einen anderen Spieler auf eine Farbe, z. B. wenn jemand gehen musste
  seat(player, { color, playerId }) {
    if (!player.isHost) return { error: 'Nur der Host darf das.' };
    if (this.teamMode || !R.COLORS.includes(color)) return { error: 'Das geht nur im Duell.' };
    const target = this.lobby.players.get(playerId);
    if (!target || !this.lobby.activePlayers().includes(target)) return { error: 'Diesen Spieler gibt es nicht.' };
    if (this.seats[R.other(color)] === playerId) return { error: 'Der spielt schon die andere Farbe.' };
    this.seats[color] = playerId;
    delete this.tips[playerId];
    this.addLog(`🔁 ${target.name} spielt jetzt ${COLOR_NAMES[color]}.`);
    return { ok: true };
  }

  playersChanged() {
    this.refreshMovers();
  }

  // ---------- Ansicht ----------

  diceView() {
    if (!this.dice) return null;
    const all = this.dice[0] === this.dice[1] ? [this.dice[0], this.dice[0], this.dice[0], this.dice[0]] : [...this.dice];
    const used = all.map(() => false);
    for (const m of this.pending) {
      const i = all.findIndex((d, k) => d === m.die && !used[k]);
      if (i >= 0) used[i] = true;
    }
    return all.map((value, i) => ({ value, used: used[i] }));
  }

  view(viewer) {
    const actor = this.actorColor();
    const moving = this.phase === 'move';
    const myColors = R.COLORS.filter((c) => this.controls(viewer, c));
    const sides = {};
    for (const c of R.COLORS) {
      sides[c] = {
        name: this.sideName(c),
        ids: this.sideIds(c),
        teamId: this.teamMode ? this.teamOf[c] : null,
        members: this.teamMode ? this.teamMembers(this.teamOf[c]).map((p) => p.id) : this.sideIds(c),
        present: this.sidePresent(c),
        pips: R.pipCount(this.board, c),
      };
    }
    const tipCounts = { w: 0, b: 0 };
    for (const c of Object.values(this.tips)) tipCounts[c]++;
    return {
      phase: this.phase,
      gameNo: this.gameNo,
      teamMode: this.teamMode,
      matchTo: this.settings.matchTo,
      score: this.score,
      sides,
      board: this.board,
      turn: this.turn,
      actor,
      myColors,
      mySide: this.onSide(viewer),
      dice: this.diceView(),
      openDice: this.openDice,
      openTie: this.openTie,
      pending: moving ? this.pending.map((m) => this.publicMove(m)) : [],
      legal: moving ? R.nextMoves(this.sequences, this.pending).map((m) => this.publicMove(m)) : [],
      canCommit: moving && R.isComplete(this.sequences, this.pending),
      cube: { enabled: this.settings.cube, value: this.cube.value, owner: this.cube.owner, crawford: this.crawford },
      canDouble: actor ? this.canDouble(actor) : false,
      showPips: this.settings.pips,
      hints: this.settings.hints,
      gammons: this.settings.gammons,
      tipsOpen: this.tipsOpen,
      myTip: this.tips[viewer.id] || null,
      tipCounts,
      tips: this.tipsOpen ? null : this.tips,
      tipScore: this.tipScore,
      suggestions: Object.entries(this.suggestions).map(([playerId, s]) => ({ playerId, ...s })),
      lastTurn: this.lastTurn,
      result: this.result,
      results: this.results,
      stats: this.stats,
      waiting: actor && !this.sidePresent(actor) ? actor : null,
      rollSeq: this.rollSeq,
      log: this.log,
      deadline: this.deadline,
      paused: false,
      serverNow: Date.now(),
    };
  }

  dispose() {
    this.clearTimer();
  }
}

Backgammon.rules = R;
module.exports = Backgammon;
