// Sieben auf einen Streich (nach Flip 7): Reihum eine Karte ziehen oder stoppen. Eine doppelte Zahl wirft
// dich aus der Runde, sieben verschiedene Zahlen beenden die Runde mit Bonus.

const { shuffle, pick } = require('../../util');

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 12;
const SEVEN = 7;
const SEVEN_BONUS = 15;
const FLIP_COUNT = 3;
const TARGETS = [100, 150, 200, 300];
const TIME_LIMITS = [0, 15, 30, 60];
const LOG_SIZE = 8;

// 94 Karten: jede Zahl so oft, wie sie zählt (die 0 einmal), sechs Bonuskarten und je drei Aktionskarten
function buildDeck() {
  const cards = [];
  const add = (kind, value = null) => cards.push({ id: `k${cards.length}`, kind, value });
  add('number', 0);
  for (let v = 1; v <= 12; v++) for (let i = 0; i < v; i++) add('number', v);
  for (const v of [2, 4, 6, 8, 10]) add('plus', v);
  add('times', 2);
  for (const kind of ['freeze', 'flip3', 'chance']) for (let i = 0; i < 3; i++) add(kind);
  return cards;
}

function newHand(status) {
  return { status, numbers: [], mods: [], actions: [], chance: null, bustCard: null };
}

// Zahlen zusammen, ×2 verdoppelt nur die Zahlen, dann die Plus-Karten, dann der Bonus für sieben Zahlen
function handScore(hand) {
  if (hand.status === 'bust' || hand.status === 'out') return 0;
  let sum = hand.numbers.reduce((a, c) => a + c.value, 0);
  if (hand.mods.some((c) => c.kind === 'times')) sum *= 2;
  sum += hand.mods.filter((c) => c.kind === 'plus').reduce((a, c) => a + c.value, 0);
  if (hand.status === 'seven') sum += SEVEN_BONUS;
  return sum;
}

function handCards(hand) {
  return [...hand.numbers, ...hand.mods, ...hand.actions, hand.chance, hand.bustCard].filter(Boolean);
}

class Sieben {
  constructor(lobby) {
    this.lobby = lobby;
    this.order = [];
    this.totals = {};
    this.stats = {};
    this.roundNo = 0;
    this.hands = new Map();
    this.tasks = [];
    this.pending = null;
    this.log = [];
    this.logSeq = 0;
    this.seq = 0; // zählt gezogene Karten, damit die Geräte neue Karten animieren können
    this.timer = null;
    this.deadline = null;
  }

  static meta() {
    return {
      id: 'sieben',
      name: 'Sieben auf einen Streich',
      icon: '🃏',
      description: 'Zieh noch eine Karte … oder lieber nicht? Sieben verschiedene Zahlen gewinnen.',
      players: `${MIN_PLAYERS}–${MAX_PLAYERS} Spieler`,
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      available: true,
      teams: false,
      sharedDevice: true, // alle Karten liegen offen, ein Handy kann reihum gehen
    };
  }

  static defaultSettings() {
    return { target: 200, timeLimit: 0, risk: false, orderMode: 'random', order: [] };
  }

  static sanitizeSettings(current, patch) {
    const next = { ...current };
    if (patch.target !== undefined && TARGETS.includes(Number(patch.target))) next.target = Number(patch.target);
    if (patch.timeLimit !== undefined && TIME_LIMITS.includes(Number(patch.timeLimit))) next.timeLimit = Number(patch.timeLimit);
    if (patch.risk !== undefined) next.risk = Boolean(patch.risk);
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

  present() {
    return new Set(this.players().map((p) => p.id));
  }

  name(id) {
    return this.lobby.players.get(id)?.name || 'Jemand';
  }

  addLog(text) {
    this.log.push({ seq: ++this.logSeq, text });
    if (this.log.length > LOG_SIZE) this.log.shift();
  }

  start() {
    const players = this.players();
    if (players.length < MIN_PLAYERS) throw new Error(`Sieben auf einen Streich braucht mindestens ${MIN_PLAYERS} Mitspieler.`);
    if (players.length > MAX_PLAYERS) throw new Error(`Sieben auf einen Streich geht mit höchstens ${MAX_PLAYERS} Mitspielern.`);
    const ids = players.map((p) => p.id);
    if (this.settings.orderMode === 'manual') {
      // Reihenfolge des Hosts, wer darin fehlt, kommt hinten dran
      const listed = this.settings.order.filter((id) => ids.includes(id));
      this.order = [...listed, ...ids.filter((id) => !listed.includes(id))];
    } else {
      this.order = shuffle(ids);
    }
    for (const id of this.order) this.addPlayer(id);
    this.deck = shuffle(buildDeck());
    this.discard = [];
    this.roundNo = 0;
    this.startRound();
  }

  addPlayer(id) {
    if (!this.order.includes(id)) this.order.push(id);
    if (this.totals[id] === undefined) this.totals[id] = 0;
    if (!this.stats[id]) this.stats[id] = { busts: 0, sevens: 0, mostNumbers: 0, bestRound: 0 };
  }

  startRound() {
    this.clearTimer();
    // Karten der letzten Runde kommen auf die Ablage, der Stapel wird nicht neu gemischt
    for (const hand of this.hands.values()) this.discard.push(...handCards(hand));
    this.roundNo++;
    const present = this.present();
    this.seats = this.order.filter((id) => present.has(id));
    if (!this.seats.length) this.seats = [...this.order];
    this.hands = new Map(this.order.map((id) => [id, newHand(this.seats.includes(id) ? 'active' : 'out')]));
    // Der Geber wechselt jede Runde, ausgeteilt und gespielt wird ab dem Spieler nach ihm
    const dealer = (this.roundNo - 1) % this.seats.length;
    this.dealerId = this.seats[dealer];
    this.dealOrder = [...this.seats.slice(dealer + 1), ...this.seats.slice(0, dealer + 1)];
    this.phase = 'play';
    this.turnId = null;
    this.pending = null;
    this.roundOver = false;
    this.lastScores = null;
    this.addLog(`Runde ${this.roundNo}: ${this.name(this.dealerId)} gibt.`);
    this.tasks = [{ t: 'deal', i: 0 }];
    this.run();
  }

  hand(id) {
    return this.hands.get(id);
  }

  isActive(id) {
    return this.hand(id)?.status === 'active';
  }

  // Aktive Spieler in Sitzreihenfolge
  activeIds() {
    return this.seats.filter((id) => this.isActive(id));
  }

  drawCard() {
    if (!this.deck.length) {
      if (!this.discard.length) return null;
      this.deck = shuffle(this.discard);
      this.discard = [];
      this.addLog('Der Stapel ist leer, die Ablage wird neu gemischt.');
    }
    return this.deck.pop();
  }

  // Arbeitet die Aufgaben ab (Austeilen, Ziehen, Aktionen), bis jemand ein Ziel wählen muss
  // oder nichts mehr zu tun ist. Danach ist der Nächste dran oder die Runde vorbei.
  run() {
    while (!this.pending && !this.roundOver && this.tasks.length) this.step(this.tasks.shift());
    if (this.pending) {
      this.startTimer();
      return;
    }
    if (this.roundOver || !this.activeIds().length) {
      this.endRound();
      return;
    }
    this.advanceTurn();
  }

  step(task) {
    switch (task.t) {
      case 'deal': {
        if (task.i >= this.dealOrder.length) return;
        this.tasks.unshift({ t: 'deal', i: task.i + 1 });
        const id = this.dealOrder[task.i];
        if (this.isActive(id)) this.tasks.unshift({ t: 'draw', pid: id });
        return;
      }
      case 'draw': {
        if (!this.isActive(task.pid)) return;
        const card = this.drawCard();
        if (!card) return this.outOfCards();
        const action = this.receive(task.pid, card);
        if (action) this.tasks.unshift({ t: 'choose', pid: task.pid, card: action });
        return;
      }
      case 'flip': {
        // Drei auf einmal: Aktionskarten werden beiseitegelegt und erst danach gespielt
        if (!this.isActive(task.pid)) {
          this.discard.push(...task.aside);
          return;
        }
        if (task.left === 0) {
          this.tasks.unshift(...task.aside.map((card) => ({ t: 'choose', pid: task.pid, card })));
          return;
        }
        const card = this.drawCard();
        if (!card) {
          this.discard.push(...task.aside);
          return this.outOfCards();
        }
        const action = this.receive(task.pid, card);
        this.tasks.unshift({ t: 'flip', pid: task.pid, left: task.left - 1, aside: action ? [...task.aside, action] : task.aside });
        return;
      }
      case 'choose': return this.choose(task);
      default: return undefined;
    }
  }

  outOfCards() {
    this.addLog('Alle Karten sind im Spiel, die Runde endet.');
    this.roundOver = true;
  }

  // Legt eine gezogene Karte vor den Spieler. Gibt Aktionskarten zurück, für die ein Ziel gewählt werden muss.
  receive(id, card) {
    const hand = this.hand(id);
    const stats = this.stats[id];
    card.n = ++this.seq;
    switch (card.kind) {
      case 'number': {
        if (hand.numbers.some((c) => c.value === card.value)) {
          if (hand.chance) {
            this.discard.push(card, hand.chance);
            hand.chance = null;
            this.addLog(`🍀 Zweite Chance rettet ${this.name(id)} vor der doppelten ${card.value}!`);
            return null;
          }
          hand.bustCard = card;
          hand.status = 'bust';
          stats.busts++;
          this.addLog(`💥 ${this.name(id)} zieht die zweite ${card.value} und ist raus!`);
          return null;
        }
        hand.numbers.push(card);
        hand.numbers.sort((a, b) => a.value - b.value);
        stats.mostNumbers = Math.max(stats.mostNumbers, hand.numbers.length);
        if (hand.numbers.length >= SEVEN) {
          hand.status = 'seven';
          stats.sevens++;
          this.roundOver = true;
          this.addLog(`🎉 ${this.name(id)} schafft sieben auf einen Streich! +${SEVEN_BONUS}`);
        }
        return null;
      }
      case 'plus':
      case 'times':
        hand.mods.push(card);
        return null;
      case 'chance':
        if (!hand.chance) {
          hand.chance = card;
          return null;
        }
        return card; // eine zweite muss weitergegeben werden
      default:
        return card; // Einfrieren und Drei auf einmal
    }
  }

  targetsFor(task) {
    const active = this.activeIds();
    if (task.card.kind === 'chance') return active.filter((id) => id !== task.pid && !this.hand(id).chance);
    return active;
  }

  choose(task) {
    const targets = this.targetsFor(task);
    if (!targets.length) {
      this.discard.push(task.card);
      if (task.card.kind === 'chance') this.addLog(`${this.name(task.pid)} zieht noch eine Zweite Chance, aber alle haben schon eine.`);
      return;
    }
    // Bleibt nur ein Ziel (oft man selbst), gibt es nichts zu wählen
    if (targets.length === 1 || !this.present().has(task.pid)) {
      this.resolve(task, targets.length === 1 ? targets[0] : pick(targets));
      return;
    }
    this.pending = { ...task, targets };
  }

  resolve(task, targetId) {
    this.pending = null;
    const by = this.name(task.pid);
    const target = targetId === task.pid ? 'sich selbst' : this.name(targetId);
    const hand = this.hand(targetId);
    switch (task.card.kind) {
      case 'freeze':
        hand.actions.push(task.card);
        hand.status = 'frozen';
        this.addLog(`❄️ ${by} friert ${target} ein: ${handScore(hand)} Punkte gesichert.`);
        break;
      case 'flip3':
        hand.actions.push(task.card);
        this.tasks.unshift({ t: 'flip', pid: targetId, left: FLIP_COUNT, aside: [] });
        this.addLog(`🎯 ${by} lässt ${target} drei Karten ziehen.`);
        break;
      case 'chance':
        hand.chance = task.card;
        this.addLog(`🍀 ${by} schenkt ${target} eine Zweite Chance.`);
        break;
      default:
        this.discard.push(task.card);
    }
  }

  advanceTurn() {
    const active = this.activeIds();
    let next = null;
    if (this.turnId === null) {
      next = this.dealOrder.find((id) => active.includes(id));
    } else {
      const i = this.seats.indexOf(this.turnId);
      for (let k = 1; k <= this.seats.length && !next; k++) {
        const id = this.seats[(i + k) % this.seats.length];
        if (active.includes(id)) next = id;
      }
    }
    this.turnId = next;
    // Wer nicht mehr verbunden ist, stoppt automatisch
    if (!this.present().has(next)) {
      this.stay(next, ' (nicht verbunden)');
      return;
    }
    this.startTimer();
  }

  // Ein Gerät spielt für seinen Spieler und dessen Mitspieler am selben Gerät
  controls(player, id) {
    return id === player.id || this.lobby.players.get(id)?.guestOf === player.id;
  }

  hit() {
    this.clearTimer();
    this.tasks.push({ t: 'draw', pid: this.turnId });
    this.run();
    return { ok: true };
  }

  stay(id = this.turnId, note = '') {
    this.clearTimer();
    const hand = this.hand(id);
    hand.status = 'stayed';
    this.addLog(`✋ ${this.name(id)} stoppt bei ${handScore(hand)} Punkten${note}.`);
    this.run();
    return { ok: true };
  }

  target(targetId) {
    if (!this.pending.targets.includes(targetId)) return { error: 'Diesen Spieler kannst du nicht wählen.' };
    this.clearTimer();
    this.resolve(this.pending, targetId);
    this.run();
    return { ok: true };
  }

  // Zeit abgelaufen oder Host drängt: Ziel auslosen bzw. stoppen
  autoPlay(note) {
    if (this.phase !== 'play') return;
    if (this.pending) {
      this.target(pick(this.pending.targets));
      return;
    }
    if (this.turnId) this.stay(this.turnId, note);
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
      this.autoPlay(' (Zeit abgelaufen)');
      this.lobby.broadcast();
    }, limit * 1000);
  }

  endRound() {
    this.clearTimer();
    this.turnId = null;
    this.pending = null;
    // Beiseitegelegte oder noch nicht gespielte Aktionskarten kommen auf die Ablage
    for (const t of this.tasks) {
      if (t.card) this.discard.push(t.card);
      if (t.aside) this.discard.push(...t.aside);
    }
    this.tasks = [];
    this.lastScores = {};
    for (const [id, hand] of this.hands) {
      if (hand.status === 'out') continue;
      const points = handScore(hand);
      this.lastScores[id] = points;
      this.totals[id] += points;
      this.stats[id].bestRound = Math.max(this.stats[id].bestRound, points);
    }
    // Bei Gleichstand an der Spitze wird weitergespielt
    const best = Math.max(...Object.values(this.totals));
    const leaders = Object.keys(this.totals).filter((id) => this.totals[id] === best);
    this.phase = best >= this.settings.target && leaders.length === 1 ? 'final' : 'roundEnd';
    if (this.phase === 'roundEnd' && best >= this.settings.target) this.addLog('Gleichstand an der Spitze, es gibt noch eine Runde!');
  }

  // Host: nächste Runde
  next() {
    if (this.phase === 'roundEnd') this.startRound();
  }

  action(player, { type, ...data }) {
    if (type === 'force') {
      if (!player.isHost) return { error: 'Nur der Host darf das.' };
      this.autoPlay(' (vom Host)');
      return { ok: true };
    }
    if (this.phase !== 'play') return { error: 'Die Runde ist vorbei.' };
    if (type === 'target') {
      if (!this.pending || !this.controls(player, this.pending.pid)) return { error: 'Du wählst gerade kein Ziel.' };
      return this.target(data.playerId);
    }
    if (this.pending || !this.turnId || !this.controls(player, this.turnId)) return { error: 'Du bist nicht dran.' };
    switch (type) {
      case 'hit': return this.hit();
      case 'stay': return this.stay();
      default: return { error: 'Unbekannte Aktion.' };
    }
  }

  playersChanged() {
    // Neue Mitspieler setzen bis zur nächsten Runde aus
    for (const p of this.players()) {
      if (this.order.includes(p.id)) continue;
      this.addPlayer(p.id);
      this.hands.set(p.id, newHand('out'));
    }
    if (this.phase !== 'play') return;
    const present = this.present();
    if (this.pending && !present.has(this.pending.pid)) this.target(pick(this.pending.targets));
    else if (!this.pending && this.turnId && !present.has(this.turnId)) this.stay(this.turnId, ' (nicht verbunden)');
  }

  // Wie wahrscheinlich die nächste Karte eine doppelte Zahl ist (aus den Karten, die noch im Stapel liegen)
  risk(id) {
    const pile = this.deck.length ? this.deck : this.discard;
    if (!pile.length) return 0;
    const have = new Set(this.hand(id).numbers.map((c) => c.value));
    return Math.round((pile.filter((c) => c.kind === 'number' && have.has(c.value)).length / pile.length) * 100);
  }

  view(viewer) {
    const playing = this.phase === 'play';
    const players = this.order.map((id) => {
      const h = this.hand(id);
      return {
        id,
        status: h.status,
        numbers: h.numbers,
        mods: h.mods,
        actions: h.actions,
        chance: h.chance,
        bustCard: h.bustCard,
        points: handScore(h),
        total: this.totals[id] || 0,
      };
    });
    return {
      phase: this.phase,
      roundNo: this.roundNo,
      target: this.settings.target,
      seven: SEVEN,
      sevenBonus: SEVEN_BONUS,
      dealerId: this.dealerId,
      turnId: playing && !this.pending ? this.turnId : null,
      myTurn: playing && !this.pending && !!this.turnId && this.controls(viewer, this.turnId),
      pending: playing && this.pending
        ? { pid: this.pending.pid, kind: this.pending.card.kind, targets: this.pending.targets, mine: this.controls(viewer, this.pending.pid) }
        : null,
      risk: playing && this.settings.risk && this.turnId && !this.pending ? this.risk(this.turnId) : null,
      deck: this.deck.length,
      discard: this.discard.length,
      players,
      log: this.log,
      seq: this.seq,
      lastScores: this.lastScores,
      stats: this.phase === 'final' ? this.stats : null,
      deadline: this.deadline,
      paused: false,
      serverNow: Date.now(),
    };
  }

  dispose() {
    this.clearTimer();
  }
}

Sieben.buildDeck = buildDeck;
Sieben.handScore = handScore;
Sieben.handCards = handCards;
module.exports = Sieben;
