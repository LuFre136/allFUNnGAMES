// Hundsgemein (nach Brändi Dog): Teamspiel mit Murmeln und Karten. Das Brett liegt offen auf dem Fernseher
// (oder auf allen Handys), die Handkarten sind geheim. Partner tauschen vor jeder Runde eine Karte.
// Die Zugregeln stehen in public/js/hundsgemein-rules.js, damit das Handy dieselben Züge anbieten kann.

const Rules = require('../../../public/js/hundsgemein-rules');
const { shuffle, pick } = require('../../util');

const DEAL_SIZES = [6, 5, 4, 3, 2];
const TIME_LIMITS = [0, 30, 60, 90];
const LOG_SIZE = 8;
const RANK_NAMES = { A: 'Ass', J: 'Bube', Q: 'Dame', K: 'König', JK: 'Joker' };

function rankName(rank) {
  return RANK_NAMES[rank] || rank;
}

class Hundsgemein {
  constructor(lobby) {
    this.lobby = lobby;
    this.seats = []; // pro Platz { playerId, teamId }
    this.hands = [];
    this.out = new Set(); // Plätze, die in dieser Runde abwerfen mussten
    this.given = new Map(); // Platz -> Karte für den Partner (Kartentausch)
    this.received = new Map(); // Platz -> Id der Karte vom Partner
    this.log = [];
    this.logSeq = 0;
    this.seq = 0;
    this.lastPlay = null;
    this.timer = null;
    this.deadline = null;
    this.winnerTeam = null;
  }

  static meta() {
    return {
      id: 'hundsgemein',
      name: 'Hundsgemein',
      icon: '🐕',
      description: 'Karten statt Würfel: Bring mit deinem Partner alle Murmeln ins Ziel und schick die anderen zurück in den Zwinger.',
      players: '4 oder 6 Spieler in Teams',
      minPlayers: 4,
      maxPlayers: 6,
      available: true,
      maxTeams: 3,
      sharedDevice: false, // die Handkarten sind geheim
    };
  }

  static defaultSettings() {
    return { tv: true, timeLimit: 0, exchange: true, hints: true };
  }

  static sanitizeSettings(current, patch) {
    const next = { ...current };
    for (const key of ['tv', 'exchange', 'hints']) if (patch[key] !== undefined) next[key] = Boolean(patch[key]);
    if (patch.timeLimit !== undefined && TIME_LIMITS.includes(Number(patch.timeLimit))) next.timeLimit = Number(patch.timeLimit);
    return next;
  }

  // Mit Fernseher zeigt das Host-Gerät nur das Brett und spielt nicht mit (sonst sähen alle seine Karten).
  // Ohne Fernseher ist das Host-Gerät ein normales Handy und spielt mit.
  static syncSettings(settings) {
    settings.hostPlays = !settings.game.tv;
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

  name(seat) {
    return this.lobby.players.get(this.seats[seat]?.playerId)?.name || 'Jemand';
  }

  seatOf(player) {
    const i = this.seats.findIndex((s) => s.playerId === player.id);
    return i < 0 ? null : i;
  }

  addLog(text) {
    this.log.push({ seq: ++this.logSeq, text });
    if (this.log.length > LOG_SIZE) this.log.shift();
  }

  start() {
    const players = this.lobby.activePlayers().filter((p) => !p.guestOf);
    if (players.some((p) => !p.teamId)) throw new Error('Alle Mitspieler müssen einem Team beitreten.');
    const teams = this.lobby.teams.map((t) => players.filter((p) => p.teamId === t.id)).filter((list) => list.length);
    const n = players.length;
    const sizes = teams.map((list) => list.length);
    const ok = (n === 4 || n === 6) && sizes.every((s) => s === sizes[0]) && sizes[0] >= 2;
    if (!ok) throw new Error('Hundsgemein braucht 4 oder 6 Spieler in gleich großen Teams: zwei Teams zu zweit, drei Teams zu zweit oder zwei Teams zu dritt.');
    // Die Teams wechseln sich am Brett ab, Partner sitzen sich gegenüber (bzw. jeder Zweite bei Teams zu dritt)
    const T = teams.length;
    const members = teams.map((list) => shuffle(list));
    this.seats = Array.from({ length: n }, (_, s) => {
      const p = members[s % T][Math.floor(s / T)];
      return { playerId: p.id, teamId: p.teamId };
    });
    this.board = Rules.newBoard(n, T);
    this.hands = this.seats.map(() => []);
    this.deck = shuffle(Rules.buildDeck());
    this.discard = [];
    this.stats = this.seats.map(() => ({ beats: 0, beaten: 0, steps: 0 }));
    this.roundNo = 0;
    this.dealerSeat = Math.floor(Math.random() * n);
    this.startRound();
  }

  get dealSize() {
    return DEAL_SIZES[(this.roundNo - 1) % DEAL_SIZES.length];
  }

  drawCard() {
    if (!this.deck.length) {
      this.deck = shuffle(this.discard);
      this.discard = [];
    }
    return this.deck.pop();
  }

  startRound() {
    this.clearTimer();
    this.roundNo++;
    if (this.roundNo > 1) this.dealerSeat = (this.dealerSeat + 1) % this.seats.length;
    this.out = new Set();
    this.given = new Map();
    this.received = new Map();
    for (let i = 0; i < this.dealSize; i++) {
      for (let k = 1; k <= this.seats.length; k++) this.hands[(this.dealerSeat + k) % this.seats.length].push(this.drawCard());
    }
    this.addLog(`Runde ${this.roundNo}: ${this.name(this.dealerSeat)} gibt je ${this.dealSize} Karten.`);
    this.turnSeat = (this.dealerSeat + 1) % this.seats.length;
    if (this.settings.exchange) {
      this.phase = 'exchange';
      this.startTimer();
    } else {
      this.phase = 'play';
      this.startTurn();
    }
  }

  // Der nächste Teampartner im Uhrzeigersinn bekommt die getauschte Karte
  partnerSeat(seat) {
    return (seat + this.board.teams) % this.seats.length;
  }

  give(seat, cardId) {
    if (this.given.has(seat)) return { error: 'Du hast schon eine Karte gegeben.' };
    const card = this.hands[seat].find((c) => c.id === cardId);
    if (!card) return { error: 'Diese Karte hast du nicht.' };
    this.given.set(seat, card);
    if (this.given.size === this.seats.length) this.finishExchange();
    return { ok: true };
  }

  // Zeit abgelaufen oder Host drängt: Wer noch nicht getauscht hat, gibt eine zufällige Karte
  exchangeRandom() {
    for (let seat = 0; seat < this.seats.length && this.phase === 'exchange'; seat++) {
      if (!this.given.has(seat)) this.give(seat, pick(this.hands[seat]).id);
    }
  }

  finishExchange() {
    this.clearTimer();
    for (const [seat, card] of this.given) {
      this.hands[seat] = this.hands[seat].filter((c) => c !== card);
      this.hands[this.partnerSeat(seat)].push(card);
      this.received.set(this.partnerSeat(seat), card.id);
    }
    this.given = new Map();
    this.phase = 'play';
    this.addLog('Karten getauscht, los geht’s!');
    this.startTurn();
  }

  // Der Nächste mit Karten ist dran. Haben alle ihre Karten gespielt, beginnt die nächste Runde.
  startTurn() {
    this.clearTimer();
    const n = this.seats.length;
    let seat = null;
    for (let k = 0; k < n; k++) {
      const s = (this.turnSeat + k) % n;
      if (this.hands[s].length) {
        seat = s;
        break;
      }
    }
    if (seat === null) {
      this.startRound();
      return;
    }
    // Wer nicht verbunden ist (z. B. Handy gesperrt), wird nicht übersprungen: Der Host kann für ihn spielen.
    this.turnSeat = seat;
    this.startTimer();
  }

  playableIds(seat) {
    const ranks = new Map();
    return this.hands[seat].filter((c) => {
      if (!ranks.has(c.rank)) ranks.set(c.rank, Rules.playable(this.board, seat, c.rank));
      return ranks.get(c.rank);
    }).map((c) => c.id);
  }

  play(seat, { cardId, as, move, steps }) {
    const card = this.hands[seat].find((c) => c.id === cardId);
    if (!card) return { error: 'Diese Karte hast du nicht.' };
    let rank = card.rank;
    if (rank === Rules.JOKER) {
      if (!Rules.JOKER_AS.includes(as)) return { error: 'Als welche Karte spielst du den Joker?' };
      rank = as;
    }
    let result;
    let text;
    if (rank === '7') {
      result = Rules.applySeven(this.board, seat, steps);
      if (!result) return { error: 'So geht die 7 nicht.' };
      text = 'teilt auf';
    } else {
      const wanted = Rules.moveKey({ rank, ...move });
      const legal = Rules.legalMoves(this.board, seat, rank).find((m) => Rules.moveKey(m) === wanted);
      if (!legal) return { error: 'Dieser Zug ist nicht erlaubt.' };
      result = Rules.applyMove(this.board, legal);
      text = legal.type === 'exit' ? 'kommt raus' : legal.type === 'swap' ? `tauscht mit ${this.name(Rules.marble(this.board, legal.target).seat)}` : `zieht ${legal.steps > 0 ? legal.steps : `${-legal.steps} zurück`}`;
    }
    this.hands[seat] = this.hands[seat].filter((c) => c !== card);
    this.discard.push(card);
    this.recordPlay(seat, card, rank, result, text);
    if (Rules.teamFinished(this.board, seat)) {
      this.finish(seat % this.board.teams);
      return { ok: true };
    }
    this.turnSeat = (seat + 1) % this.seats.length;
    this.startTurn();
    return { ok: true };
  }

  recordPlay(seat, card, rank, result, text) {
    const st = this.stats[seat];
    for (const [id, path] of Object.entries(result.paths)) {
      if (!result.beaten.includes(id)) st.steps += path.length - 1;
    }
    st.beats += result.beaten.length;
    for (const id of result.beaten) this.stats[Rules.marble(this.board, id).seat].beaten++;
    const joker = card.rank === Rules.JOKER ? ` (Joker als ${rankName(rank)})` : '';
    const victims = result.beaten.map((id) => this.name(Rules.marble(this.board, id).seat));
    this.addLog(`${this.name(seat)} spielt ${rankName(card.rank)}${joker} und ${text}${victims.length ? `. 💥 ${victims.join(' und ')} ${victims.length > 1 ? 'müssen' : 'muss'} zurück in den Zwinger!` : '.'}`);
    this.lastPlay = { seq: ++this.seq, seat, rank: card.rank, as: card.rank === Rules.JOKER ? rank : null, paths: result.paths, beaten: result.beaten };
  }

  // Keine Karte spielbar: alle Karten abwerfen und bis zum Rundenende aussetzen
  throwAway(seat, note = '') {
    this.discard.push(...this.hands[seat]);
    this.hands[seat] = [];
    this.out.add(seat);
    this.addLog(`${this.name(seat)} kann nicht spielen und wirft ab${note}.`);
    this.turnSeat = (seat + 1) % this.seats.length;
    this.startTurn();
  }

  // Zeit abgelaufen oder Host drängt: zufällige Karte tauschen bzw. zufälligen erlaubten Zug spielen
  autoPlay() {
    if (this.phase === 'exchange') {
      this.exchangeRandom();
      return;
    }
    if (this.phase !== 'play') return;
    const seat = this.turnSeat;
    const ids = this.playableIds(seat);
    if (!ids.length) {
      this.throwAway(seat, ' (automatisch)');
      return;
    }
    const chosen = pick(ids);
    const card = this.hands[seat].find((c) => c.id === chosen);
    let rank = card.rank;
    if (rank === Rules.JOKER) rank = pick(Rules.JOKER_AS.filter((r) => Rules.playable(this.board, seat, r)));
    if (rank === '7') {
      this.play(seat, { cardId: card.id, as: rank, steps: Rules.randomSeven(this.board, seat) });
    } else {
      const { rank: _, ...move } = pick(Rules.legalMoves(this.board, seat, rank));
      this.play(seat, { cardId: card.id, as: rank, move });
    }
  }

  finish(team) {
    this.clearTimer();
    this.phase = 'final';
    this.winnerTeam = team;
    const names = this.seats.map((s, i) => i).filter((i) => i % this.board.teams === team).map((i) => this.name(i));
    this.addLog(`🏆 ${names.join(' & ')} haben alle Murmeln im Ziel!`);
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

  next() {}

  action(player, { type, ...data }) {
    if (type === 'force') {
      if (!player.isHost) return { error: 'Nur der Host darf das.' };
      this.autoPlay();
      return { ok: true };
    }
    const seat = this.seatOf(player);
    if (seat === null) return { error: 'Du spielst nicht mit.' };
    if (type === 'give') {
      if (this.phase !== 'exchange') return { error: 'Gerade wird nicht getauscht.' };
      return this.give(seat, data.cardId);
    }
    if (this.phase !== 'play') return { error: 'Gerade ist kein Zug möglich.' };
    if (seat !== this.turnSeat) return { error: 'Du bist nicht dran.' };
    if (type === 'play') return this.play(seat, data);
    if (type === 'discard') {
      if (this.playableIds(seat).length) return { error: 'Du kannst noch eine Karte spielen.' };
      this.throwAway(seat);
      return { ok: true };
    }
    return { error: 'Unbekannte Aktion.' };
  }

  playersChanged() {
    if (!this.board || this.phase === 'final') return;
    // Wer neu ins Team kommt, übernimmt den Platz eines Mitspielers, der nicht mehr verbunden ist
    const present = this.present();
    for (const p of this.lobby.activePlayers()) {
      if (p.guestOf || this.seats.some((s) => s.playerId === p.id)) continue;
      const free = this.seats.find((s) => s.teamId === p.teamId && !present.has(s.playerId));
      if (free) {
        this.addLog(`${p.name} übernimmt den Platz von ${this.lobby.players.get(free.playerId)?.name || 'jemandem'}.`);
        free.playerId = p.id;
      }
    }
  }

  view(viewer) {
    const mySeat = this.seatOf(viewer);
    const playing = this.phase === 'play';
    const mine = mySeat !== null && this.hands[mySeat];
    return {
      phase: this.phase,
      roundNo: this.roundNo,
      dealSize: this.dealSize,
      dealerSeat: this.dealerSeat,
      turnSeat: playing ? this.turnSeat : null,
      teams: this.board.teams,
      seats: this.seats.map((s, i) => ({
        playerId: s.playerId,
        teamId: s.teamId,
        cards: this.hands[i].length,
        out: this.out.has(i),
        gave: this.given.has(i),
      })),
      marbles: this.board.marbles,
      mySeat,
      hand: mine || null,
      playable: playing && mySeat === this.turnSeat ? this.playableIds(mySeat) : null,
      received: mySeat !== null ? this.received.get(mySeat) || null : null,
      gave: mySeat !== null ? this.given.get(mySeat)?.id || null : null,
      lastPlay: this.lastPlay,
      log: this.log,
      deck: this.deck.length,
      discard: this.discard.length,
      hints: this.settings.hints,
      tv: this.settings.tv,
      winnerTeam: this.winnerTeam,
      stats: this.phase === 'final' ? this.stats : null,
      deadline: this.deadline,
      serverNow: Date.now(),
    };
  }

  dispose() {
    this.clearTimer();
  }
}

module.exports = Hundsgemein;
