// Durak: Kartenspiel mit 36 (oder 52) Karten. Der Angreifer legt aus, der linke Nachbar verteidigt und schlägt
// jede Karte mit einer höheren derselben Farbe oder mit Trumpf. Alle anderen dürfen Karten mit Werten nachlegen,
// die schon auf dem Tisch liegen. Wer nicht mehr schlagen kann, nimmt alles auf. Wer zuletzt Karten hat, ist der Durak.

const { shuffle } = require('../../util');

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;
const HAND = 6;
const SUITS = ['C', 'S', 'H', 'D']; // Kreuz, Pik, Herz, Karo
const SUIT_SIGN = { C: '♣', S: '♠', H: '♥', D: '♦' };
const SUIT_NAME = { C: 'Kreuz', S: 'Pik', H: 'Herz', D: 'Karo' };
const RANK_NAME = { 11: 'B', 12: 'D', 13: 'K', 14: 'A' };
const DECKS = [36, 52];
const PARTIEN = [1, 3, 5, 10];
const TIME_LIMITS = [0, 20, 30, 60];
const LOG_SIZE = 8;

// Karten sind Texte aus Farbe und Wert, z. B. „H10“ (Herz 10) oder „S14“ (Pik Ass)
const suitOf = (card) => card[0];
const rankOf = (card) => Number(card.slice(1));
const cardName = (card) => `${SUIT_SIGN[suitOf(card)]}${RANK_NAME[rankOf(card)] || rankOf(card)}`;

function makeDeck(size) {
  const low = size === 52 ? 2 : 6;
  const deck = [];
  for (const s of SUITS) for (let r = low; r <= 14; r++) deck.push(`${s}${r}`);
  return deck;
}

// Schlägt `def` die Karte `att`? Höher in derselben Farbe, oder Trumpf gegen Nicht-Trumpf
function beats(def, att, trump) {
  if (suitOf(def) === suitOf(att)) return rankOf(def) > rankOf(att);
  return suitOf(def) === trump;
}

// Nach Farben sortiert, Trumpf ganz rechts, innerhalb der Farbe aufsteigend
function sortHand(hand, trump) {
  const order = (c) => (suitOf(c) === trump ? 4 : SUITS.indexOf(suitOf(c))) * 100 + rankOf(c);
  return [...hand].sort((a, b) => order(a) - order(b));
}

// Billigste Karte: kein Trumpf vor Trumpf, dann der niedrigste Wert
function cheapest(cards, trump) {
  const cost = (c) => (suitOf(c) === trump ? 100 : 0) + rankOf(c);
  return [...cards].sort((a, b) => cost(a) - cost(b))[0] || null;
}

class Durak {
  constructor(lobby) {
    this.lobby = lobby;
    this.order = []; // Sitzordnung, im Uhrzeigersinn
    this.scores = {}; // wie oft jemand Durak war
    this.results = []; // pro Partie: wer war Durak
    this.partieNo = 0;
    this.lastDurak = null;
    this.seats = [];
    this.hands = {};
    this.log = [];
    this.logSeq = 0;
    this.moveSeq = 0;
    this.timer = null;
    this.deadline = null;
  }

  static meta() {
    return {
      id: 'durak',
      name: 'Durak',
      icon: '🃏',
      description: 'Angreifen, schlagen, nachlegen. Wer am Ende noch Karten hat, ist der Durak.',
      players: `${MIN_PLAYERS}–${MAX_PLAYERS} Spieler`,
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      available: true,
      teams: false,
      sharedDevice: false, // jeder hält seine Karten verdeckt auf dem eigenen Handy
    };
  }

  static defaultSettings() {
    return { deckSize: 36, transfer: false, partien: 3, timeLimit: 0 };
  }

  static sanitizeSettings(current, patch) {
    const next = { ...current };
    if (patch.deckSize !== undefined && DECKS.includes(Number(patch.deckSize))) next.deckSize = Number(patch.deckSize);
    if (patch.transfer !== undefined) next.transfer = Boolean(patch.transfer);
    if (patch.partien !== undefined && PARTIEN.includes(Number(patch.partien))) next.partien = Number(patch.partien);
    if (patch.timeLimit !== undefined && TIME_LIMITS.includes(Number(patch.timeLimit))) next.timeLimit = Number(patch.timeLimit);
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

  name(id) {
    return this.lobby.players.get(id)?.name || 'Jemand';
  }

  addLog(text) {
    this.log.push({ seq: ++this.logSeq, text });
    if (this.log.length > LOG_SIZE) this.log.shift();
  }

  maxSeats() {
    return Math.floor(this.settings.deckSize / HAND);
  }

  start() {
    const players = this.lobby.activePlayers();
    if (players.length < MIN_PLAYERS) throw new Error(`Durak braucht mindestens ${MIN_PLAYERS} Mitspieler.`);
    if (players.length > this.maxSeats()) {
      throw new Error(this.settings.deckSize === 36
        ? 'Mit 36 Karten geht Durak mit höchstens 6 Spielern. Stell in den Einstellungen auf 52 Karten um.'
        : `Durak geht mit höchstens ${this.maxSeats()} Spielern.`);
    }
    this.order = shuffle(players.map((p) => p.id));
    for (const id of this.order) this.scores[id] = 0;
    this.startPartie();
  }

  startPartie() {
    const present = this.present();
    const ids = this.order.filter((id) => present.has(id)).slice(0, this.maxSeats());
    if (ids.length < MIN_PLAYERS) return { error: `Für eine Partie braucht es mindestens ${MIN_PLAYERS} Mitspieler.` };
    this.partieNo++;
    this.seats = ids;
    const deck = shuffle(makeDeck(this.settings.deckSize));
    this.hands = {};
    for (const id of ids) this.hands[id] = deck.splice(0, HAND);
    if (deck.length) {
      // Die nächste Karte wird aufgedeckt und kommt quer unter den Stapel: sie wird als Letzte gezogen
      this.trumpCard = deck.shift();
      deck.push(this.trumpCard);
    } else {
      // Alle Karten sind verteilt: die letzte ausgeteilte Karte bestimmt den Trumpf
      const last = this.hands[ids[ids.length - 1]];
      this.trumpCard = last[last.length - 1];
    }
    this.trump = suitOf(this.trumpCard);
    this.talon = deck;
    this.discard = 0;
    this.out = []; // wer keine Karten mehr hat, in der Reihenfolge des Ausscheidens
    this.durakId = null;
    this.durakHand = null;
    this.firstBout = true;
    this.lastBout = null;
    this.phase = 'play';
    this.addLog(`🃏 Partie ${this.partieNo}: Trumpf ist ${SUIT_NAME[this.trump]} (${cardName(this.trumpCard)}).`);

    // Wer anfängt: der rechte Nachbar des letzten Durak, damit der Durak zuerst verteidigen muss.
    // In der ersten Partie wer den niedrigsten Trumpf hat.
    let attacker = null;
    if (this.lastDurak && ids.includes(this.lastDurak)) {
      attacker = this.prevIn(this.lastDurak);
      this.addLog(`🤡 ${this.name(this.lastDurak)} war Durak und muss zuerst verteidigen.`);
    } else {
      let low = null;
      for (const id of ids) {
        for (const c of this.hands[id]) {
          if (suitOf(c) === this.trump && (!low || rankOf(c) < rankOf(low.card))) low = { id, card: c };
        }
      }
      attacker = low ? low.id : ids[0];
      if (low) this.addLog(`🔑 ${this.name(low.id)} hat den niedrigsten Trumpf (${cardName(low.card)}) und greift zuerst an.`);
    }
    this.startBout(attacker);
    return { ok: true };
  }

  // Noch im Spiel: hat Karten oder kann noch welche ziehen
  isIn(id) {
    return !!this.hands[id] && !this.out.includes(id);
  }

  inIds() {
    return this.seats.filter((id) => this.isIn(id));
  }

  // Nächster bzw. vorheriger Spieler im Uhrzeigersinn, der noch im Spiel ist
  nextIn(id, step = 1) {
    const n = this.seats.length;
    const i = this.seats.indexOf(id);
    for (let k = 1; k < n; k++) {
      const other = this.seats[(((i + step * k) % n) + n) % n];
      if (other !== id && this.isIn(other)) return other;
    }
    return null;
  }

  prevIn(id) {
    return this.nextIn(id, -1);
  }

  startBout(attackerId) {
    this.attackerId = attackerId;
    this.defenderId = this.nextIn(attackerId);
    this.table = []; // Paare aus Angriffs- und Verteidigungskarte: { a, d, by }
    this.taking = false;
    this.passed = new Set();
    this.startTimer();
  }

  // Im ersten Angriff einer Partie höchstens fünf Karten, danach sechs
  cap() {
    return this.firstBout ? 5 : 6;
  }

  undefended() {
    return this.table.filter((p) => !p.d).length;
  }

  ranksOnTable() {
    const ranks = new Set();
    for (const p of this.table) {
      ranks.add(rankOf(p.a));
      if (p.d) ranks.add(rankOf(p.d));
    }
    return ranks;
  }

  // Warum `id` die Karte gerade nicht legen darf, oder null wenn es geht
  attackError(id, card) {
    if (id === this.defenderId) return 'Du verteidigst gerade.';
    if (!this.table.length && id !== this.attackerId) return `${this.name(this.attackerId)} spielt die erste Karte aus.`;
    if (this.table.length >= this.cap()) return `Mehr als ${this.cap()} Karten gehen in einem Angriff nicht.`;
    if (this.undefended() >= this.hands[this.defenderId].length) return `${this.name(this.defenderId)} hat nicht mehr Karten zum Schlagen.`;
    if (this.table.length && !this.ranksOnTable().has(rankOf(card))) return 'Nachlegen darf man nur Werte, die schon auf dem Tisch liegen.';
    return null;
  }

  canTransfer(card) {
    if (!this.settings.transfer || this.taking || !this.table.length) return false;
    if (this.table.some((p) => p.d) || this.table.some((p) => rankOf(p.a) !== rankOf(card))) return false;
    const next = this.nextIn(this.defenderId);
    return !!next && this.table.length + 1 <= this.cap() && this.hands[next].length >= this.table.length + 1;
  }

  // Angreifer, die noch nachlegen könnten und nicht „Fertig“ gesagt haben
  waitingAttackers() {
    if (!this.table.length) return [];
    return this.seats.filter((id) => id !== this.defenderId && this.isIn(id) && !this.passed.has(id)
      && this.hands[id].some((c) => !this.attackError(id, c)));
  }

  take(card, id) {
    const hand = this.hands[id];
    hand.splice(hand.indexOf(card), 1);
    this.moveSeq++;
  }

  attack(id, card) {
    this.take(card, id);
    this.table.push({ a: card, d: null, by: id });
    this.passed.clear();
    this.resolve();
  }

  defend(card, index) {
    this.take(card, this.defenderId);
    this.table[index].d = card;
    this.passed.clear();
    this.resolve();
  }

  transfer(card) {
    const from = this.defenderId;
    this.take(card, from);
    this.table.push({ a: card, d: null, by: from });
    this.attackerId = from;
    this.defenderId = this.nextIn(from);
    this.passed.clear();
    this.addLog(`↪️ ${this.name(from)} schiebt weiter an ${this.name(this.defenderId)}.`);
    this.resolve();
  }

  pickUp() {
    this.taking = true;
    this.passed.clear();
    this.moveSeq++;
    this.resolve();
  }

  pass(id) {
    this.passed.add(id);
    this.resolve();
  }

  // Ist der Angriff vorbei? Alles geschlagen oder Verteidiger nimmt, und keiner will mehr nachlegen
  resolve() {
    if (this.phase !== 'play') return;
    const allBeaten = this.table.length > 0 && this.undefended() === 0;
    if ((this.taking || allBeaten) && !this.waitingAttackers().length) {
      this.endBout();
      return;
    }
    this.startTimer();
  }

  endBout() {
    const took = this.taking;
    const defender = this.defenderId;
    const cards = this.table.flatMap((p) => (p.d ? [p.a, p.d] : [p.a]));
    if (took) {
      this.hands[defender].push(...cards);
      this.addLog(`📥 ${this.name(defender)} nimmt ${cards.length === 1 ? 'eine Karte' : `${cards.length} Karten`} auf.`);
    } else {
      this.discard += cards.length;
      this.addLog(`🛡️ ${this.name(defender)} hat alles geschlagen.`);
    }
    this.lastBout = { took, defenderId: defender, cards: cards.length, seq: this.moveSeq };
    this.refill();
    this.firstBout = false;

    for (const id of this.seats) {
      if (this.isIn(id) && !this.hands[id].length && !this.talon.length) {
        this.out.push(id);
        this.addLog(`🎉 ${this.name(id)} hat keine Karten mehr.`);
      }
    }
    const left = this.inIds();
    if (left.length <= 1) {
      this.endPartie(left[0] || null);
      return;
    }
    // Wer alles geschlagen hat, greift als Nächster an. Wer aufnimmt, wird übersprungen.
    const next = !took && this.isIn(defender) ? defender : this.nextIn(defender);
    this.startBout(next);
  }

  // Nachziehen auf sechs: erst der Angreifer, dann die anderen im Uhrzeigersinn, der Verteidiger zuletzt
  refill() {
    const n = this.seats.length;
    const i = this.seats.indexOf(this.attackerId);
    const ring = this.seats.map((_, k) => this.seats[(i + k) % n]).filter((id) => id !== this.defenderId);
    ring.push(this.defenderId);
    for (const id of ring) {
      if (!this.isIn(id)) continue;
      while (this.hands[id].length < HAND && this.talon.length) this.hands[id].push(this.talon.shift());
    }
  }

  endPartie(durakId) {
    this.clearTimer();
    this.table = [];
    this.durakId = durakId;
    this.durakHand = durakId ? sortHand(this.hands[durakId], this.trump) : null;
    if (durakId) {
      this.scores[durakId] = (this.scores[durakId] || 0) + 1;
      this.lastDurak = durakId;
      this.addLog(`🤡 ${this.name(durakId)} ist der Durak!`);
    } else {
      this.addLog('🤝 Alle sind gleichzeitig fertig: kein Durak in dieser Partie.');
    }
    this.results.push({ partie: this.partieNo, durakId, ranking: [...this.out, ...(durakId ? [durakId] : [])] });
    this.phase = this.partieNo >= this.settings.partien ? 'final' : 'over';
  }

  // Zeit abgelaufen, Spieler weg oder Host drängt: das Spiel macht den Zug, auf den gewartet wird
  autoPlay() {
    if (this.phase !== 'play') return { ok: true };
    if (!this.table.length) {
      this.attack(this.attackerId, cheapest(this.hands[this.attackerId], this.trump));
    } else if (!this.taking && this.undefended()) {
      this.addLog(`⏱️ ${this.name(this.defenderId)} nimmt auf.`);
      this.pickUp();
    } else {
      for (const id of this.waitingAttackers()) this.passed.add(id);
      this.resolve();
    }
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
    if (!limit || this.phase !== 'play') return;
    this.deadline = Date.now() + limit * 1000;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.autoPlay();
      this.settle();
      this.lobby.broadcast();
    }, limit * 1000);
  }

  // Wer nicht verbunden ist, hält das Spiel nicht auf
  settle() {
    for (let guard = 0; guard < 100; guard++) {
      if (this.phase !== 'play') return;
      const present = this.present();
      if (!this.inIds().some((id) => present.has(id))) return;
      if (!this.table.length) {
        if (present.has(this.attackerId)) return;
        this.autoPlay();
      } else if (!this.taking && this.undefended()) {
        if (present.has(this.defenderId)) return;
        this.autoPlay();
      } else {
        const away = this.waitingAttackers().filter((id) => !present.has(id));
        if (!away.length) return;
        for (const id of away) this.passed.add(id);
        this.resolve();
      }
    }
  }

  action(player, { type, card, index }) {
    if (type === 'force') {
      if (!player.isHost) return { error: 'Nur der Host darf das.' };
      const result = this.autoPlay();
      this.settle();
      return result;
    }
    if (type === 'nextPartie') {
      if (!player.isHost) return { error: 'Nur der Host darf das.' };
      if (this.phase !== 'over') return { error: 'Die Partie läuft noch.' };
      const result = this.startPartie();
      this.settle();
      return result;
    }
    if (this.phase !== 'play') return { error: 'Die Partie ist vorbei.' };
    const id = player.id;
    if (!this.isIn(id)) return { error: 'Du spielst in dieser Partie nicht (mehr) mit.' };
    const hand = this.hands[id];
    card = String(card ?? '');
    switch (type) {
      case 'attack': {
        if (!hand.includes(card)) return { error: 'Diese Karte hast du nicht.' };
        const err = this.attackError(id, card);
        if (err) return { error: err };
        this.attack(id, card);
        break;
      }
      case 'defend': {
        if (id !== this.defenderId) return { error: 'Du verteidigst gerade nicht.' };
        if (this.taking) return { error: 'Du nimmst schon auf.' };
        if (!hand.includes(card)) return { error: 'Diese Karte hast du nicht.' };
        const pair = this.table[Number(index)];
        if (!pair || pair.d) return { error: 'Diese Karte ist schon geschlagen.' };
        if (!beats(card, pair.a, this.trump)) return { error: `${cardName(card)} schlägt ${cardName(pair.a)} nicht.` };
        this.defend(card, Number(index));
        break;
      }
      case 'transfer':
        if (id !== this.defenderId) return { error: 'Weiterschieben kann nur, wer verteidigt.' };
        if (!hand.includes(card)) return { error: 'Diese Karte hast du nicht.' };
        if (!this.canTransfer(card)) return { error: 'Weiterschieben geht gerade nicht.' };
        this.transfer(card);
        break;
      case 'take':
        if (id !== this.defenderId) return { error: 'Aufnehmen kann nur, wer verteidigt.' };
        if (this.taking) return { error: 'Du nimmst schon auf.' };
        if (!this.undefended()) return { error: 'Es liegt nichts Ungeschlagenes auf dem Tisch.' };
        this.addLog(`🙈 ${this.name(id)} nimmt.`);
        this.pickUp();
        break;
      case 'pass':
        if (id === this.defenderId) return { error: 'Als Verteidiger kannst du nur schlagen oder aufnehmen.' };
        if (!this.table.length) return { error: 'Erst muss jemand ausspielen.' };
        this.pass(id);
        break;
      default:
        return { error: 'Unbekannte Aktion.' };
    }
    this.settle();
    return { ok: true };
  }

  playersChanged() {
    for (const p of this.lobby.activePlayers()) {
      if (!this.order.includes(p.id)) {
        this.order.push(p.id);
        this.scores[p.id] = 0;
        this.addLog(`👋 ${p.name} spielt ab der nächsten Partie mit.`);
      }
    }
    this.settle();
  }

  // Was der Spieler mit jeder Handkarte gerade tun darf
  movesFor(id) {
    if (this.phase !== 'play' || !this.isIn(id)) return [];
    const defending = id === this.defenderId && !this.taking;
    return sortHand(this.hands[id], this.trump).map((card) => ({
      card,
      attack: id !== this.defenderId && !this.attackError(id, card),
      defend: defending ? this.table.map((p, i) => (!p.d && beats(card, p.a, this.trump) ? i : -1)).filter((i) => i >= 0) : [],
      transfer: defending && this.canTransfer(card),
    }));
  }

  view(viewer) {
    const playing = this.phase === 'play';
    const mine = playing && this.isIn(viewer.id);
    const waiting = playing ? this.waitingAttackers() : [];
    const scoreboard = this.order
      .filter((id) => this.seats.includes(id) || this.scores[id])
      .map((id) => ({ id, durak: this.scores[id] || 0 }))
      .sort((a, b) => a.durak - b.durak);
    return {
      phase: this.phase,
      partieNo: this.partieNo,
      partien: this.settings.partien,
      transferRule: this.settings.transfer,
      trump: this.trump,
      trumpCard: this.trumpCard,
      talon: this.talon.length,
      discard: this.discard,
      attackerId: playing ? this.attackerId : null,
      defenderId: playing ? this.defenderId : null,
      table: playing ? this.table : [],
      cap: this.cap(),
      taking: playing && this.taking,
      passed: playing ? [...this.passed] : [],
      waiting,
      players: this.seats.map((id) => ({
        id,
        cards: this.hands[id].length,
        out: this.out.includes(id),
        place: this.out.includes(id) ? this.out.indexOf(id) + 1 : null,
      })),
      inGame: this.seats.includes(viewer.id),
      mine,
      moves: mine ? this.movesFor(viewer.id) : [],
      canTake: mine && viewer.id === this.defenderId && !this.taking && this.undefended() > 0,
      canPass: mine && viewer.id !== this.defenderId && waiting.includes(viewer.id),
      durakId: this.durakId,
      durakHand: this.phase === 'play' ? null : this.durakHand,
      ranking: this.results.length ? this.results[this.results.length - 1].ranking : null,
      scoreboard,
      results: this.results,
      lastBout: this.lastBout,
      moveSeq: this.moveSeq,
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

Durak.beats = beats;
Durak.makeDeck = makeDeck;
Durak.sortHand = sortHand;
module.exports = Durak;
