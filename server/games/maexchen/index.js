// Mäxchen: Reihum verdeckt mit zwei Würfeln würfeln und ansagen, ehrlich oder geblufft. Jede Ansage muss
// höher sein als die vorige. Der Nächste glaubt und würfelt selbst, oder er deckt auf. Wer verliert, verliert ein Leben.

const crypto = require('crypto');
const { shuffle } = require('../../util');

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;
const MAEXCHEN = 21;
const LIVES = [1, 2, 3, 5, 7];
const TIME_LIMITS = [0, 15, 30, 60];
const LOG_SIZE = 8;

// Wert aus zwei Würfeln: höherer Würfel zuerst, 1 und 2 ist das Mäxchen
function valueOf(dice) {
  const hi = Math.max(...dice);
  const lo = Math.min(...dice);
  return hi * 10 + lo;
}

// Reihenfolge: 31 < 32 < … < 65 < Einerpasch < … < Sechserpasch < Mäxchen
function rank(value) {
  if (value === MAEXCHEN) return 100;
  const hi = Math.floor(value / 10);
  const lo = value % 10;
  if (hi === lo) return 70 + hi;
  return value;
}

// Alle 21 möglichen Ansagen, von der kleinsten zur größten
const VALUES = (() => {
  const all = [];
  for (let hi = 1; hi <= 6; hi++) for (let lo = 1; lo <= hi; lo++) all.push(hi * 10 + lo);
  return all.sort((a, b) => rank(a) - rank(b));
})();

function rollDie() {
  return crypto.randomInt(6) + 1;
}

class Maexchen {
  constructor(lobby) {
    this.lobby = lobby;
    this.order = [];
    this.lives = {};
    this.outOrder = []; // ausgeschiedene Spieler, zuerst der Erste
    this.stats = {};
    this.roundNo = 0;
    this.log = [];
    this.logSeq = 0;
    this.rollSeq = 0;
    this.timer = null;
    this.deadline = null;
  }

  static meta() {
    return {
      id: 'maexchen',
      name: 'Mäxchen',
      icon: '🎲',
      description: 'Verdeckt würfeln, ansagen, bluffen. Glaubst du das oder deckst du auf?',
      players: `${MIN_PLAYERS}–${MAX_PLAYERS} Spieler`,
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      available: true,
      teams: false,
    };
  }

  static defaultSettings() {
    return { lives: 3, timeLimit: 0, maexDouble: true };
  }

  static sanitizeSettings(current, patch) {
    const next = { ...current };
    if (patch.lives !== undefined && LIVES.includes(Number(patch.lives))) next.lives = Number(patch.lives);
    if (patch.timeLimit !== undefined && TIME_LIMITS.includes(Number(patch.timeLimit))) next.timeLimit = Number(patch.timeLimit);
    if (patch.maexDouble !== undefined) next.maexDouble = Boolean(patch.maexDouble);
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

  start() {
    const players = this.lobby.activePlayers().filter((p) => !p.guestOf);
    if (players.length < MIN_PLAYERS) throw new Error(`Mäxchen braucht mindestens ${MIN_PLAYERS} Mitspieler.`);
    if (players.length > MAX_PLAYERS) throw new Error(`Mäxchen geht mit höchstens ${MAX_PLAYERS} Mitspielern.`);
    this.order = shuffle(players.map((p) => p.id));
    for (const id of this.order) this.addPlayer(id, this.settings.lives);
    this.startRound(this.order[0]);
  }

  addPlayer(id, lives) {
    if (!this.order.includes(id)) this.order.push(id);
    if (this.lives[id] === undefined) this.lives[id] = lives;
    if (!this.stats[id]) this.stats[id] = { lies: 0, caught: 0, rightCalls: 0, wrongCalls: 0, maexchen: 0 };
  }

  alive(id) {
    return this.lives[id] > 0;
  }

  aliveIds() {
    return this.order.filter((id) => this.alive(id));
  }

  // Der nächste lebende Spieler nach `id`, wer nicht verbunden ist, wird übersprungen
  nextAfter(id) {
    const present = this.present();
    const i = this.order.indexOf(id);
    let fallback = null;
    for (let k = 1; k <= this.order.length; k++) {
      const other = this.order[(i + k) % this.order.length];
      if (other === id || !this.alive(other)) continue;
      if (present.has(other)) return other;
      fallback = fallback || other;
    }
    return fallback;
  }

  startRound(starterId) {
    this.roundNo++;
    this.phase = 'roll';
    this.turnId = starterId;
    this.deciderId = null;
    this.dice = null;
    this.claim = null;
    this.history = [];
    this.startTimer();
  }

  controls(player, id) {
    return !!id && id === player.id;
  }

  // Wer gerade etwas tun muss
  actorId() {
    if (this.phase === 'roll' || this.phase === 'announce') return this.turnId;
    if (this.phase === 'decide') return this.deciderId;
    if (this.phase === 'reveal') return this.nextStarter;
    return null;
  }

  roll() {
    if (this.phase === 'reveal') this.startRound(this.nextStarter);
    this.clearTimer();
    this.dice = [rollDie(), rollDie()];
    this.rollSeq++;
    this.phase = 'announce';
    if (valueOf(this.dice) === MAEXCHEN) this.stats[this.turnId].maexchen++;
    this.startTimer();
    return { ok: true };
  }

  allowed(value) {
    return VALUES.includes(value) && (!this.claim || rank(value) > rank(this.claim.value));
  }

  announce(value) {
    if (!this.allowed(value)) return { error: this.claim ? 'Die Ansage muss höher sein als die vorige.' : 'Diese Ansage gibt es nicht.' };
    this.clearTimer();
    const actual = valueOf(this.dice);
    const truth = rank(actual) >= rank(value);
    if (actual !== value) this.stats[this.turnId].lies++;
    this.claim = { value, by: this.turnId, truth };
    this.history.push({ by: this.turnId, value });
    this.deciderId = this.nextAfter(this.turnId);
    this.phase = 'decide';
    this.startTimer();
    return { ok: true };
  }

  believe() {
    this.clearTimer();
    const { claim } = this;
    if (claim.value === MAEXCHEN) {
      // Gegen ein Mäxchen kommt keiner an: wer es glaubt, gibt auf
      this.addLog(`🏳️ ${this.name(this.deciderId)} glaubt ${this.name(claim.by)} das Mäxchen und gibt auf.`);
      this.finish({ loserId: this.deciderId, lost: 1, gaveUp: true });
      return { ok: true };
    }
    this.history[this.history.length - 1].believedBy = this.deciderId;
    this.turnId = this.deciderId;
    this.deciderId = null;
    this.dice = null;
    this.phase = 'roll';
    this.startTimer();
    return { ok: true };
  }

  challenge() {
    this.clearTimer();
    const { claim } = this;
    const challenger = this.deciderId;
    const lost = this.settings.maexDouble && claim.value === MAEXCHEN ? 2 : 1;
    if (claim.truth) {
      this.stats[challenger].wrongCalls++;
      this.addLog(`✅ ${this.name(claim.by)} hat nicht gelogen, ${this.name(challenger)} verliert ${lost === 2 ? 'zwei Leben' : 'ein Leben'}.`);
    } else {
      this.stats[challenger].rightCalls++;
      this.stats[claim.by].caught++;
      this.addLog(`🤥 ${this.name(challenger)} erwischt ${this.name(claim.by)} beim Bluffen!`);
    }
    this.finish({ loserId: claim.truth ? challenger : claim.by, lost, challenger });
    return { ok: true };
  }

  finish({ loserId, lost, gaveUp = false, challenger = null }) {
    this.lives[loserId] = Math.max(0, this.lives[loserId] - lost);
    const out = !this.alive(loserId);
    if (out) {
      this.outOrder.push(loserId);
      this.addLog(`💀 ${this.name(loserId)} ist ausgeschieden.`);
    }
    this.reveal = {
      claim: this.claim,
      dice: gaveUp ? null : this.dice,
      actual: gaveUp ? null : valueOf(this.dice),
      challenger,
      gaveUp,
      loserId,
      lost,
      out,
    };
    this.turnId = null;
    this.deciderId = null;
    // Die neue Runde beginnt, wer verloren hat, oder wenn er raus ist, der Nächste
    this.nextStarter = out ? this.nextAfter(loserId) : loserId;
    if (this.aliveIds().length <= 1) {
      this.phase = 'final';
      this.clearTimer();
      return;
    }
    this.phase = 'reveal';
    this.startTimer();
  }

  // Zeit abgelaufen, Spieler weg oder Host drängt
  autoPlay() {
    switch (this.phase) {
      case 'roll':
      case 'reveal':
        return this.roll();
      case 'announce': {
        // Ehrlich, wenn es reicht, sonst die kleinste erlaubte Ansage
        const actual = valueOf(this.dice);
        return this.announce(this.allowed(actual) ? actual : VALUES.find((v) => this.allowed(v)));
      }
      case 'decide':
        return this.believe();
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
      this.autoPlay();
      this.settle();
      this.lobby.broadcast();
    }, limit * 1000);
  }

  // Ist der Spieler am Zug nicht verbunden, spielt das Spiel für ihn weiter
  settle() {
    const present = this.present();
    for (let guard = 0; guard < 50; guard++) {
      const id = this.actorId();
      if (!id || present.has(id) || !this.aliveIds().some((a) => present.has(a))) return;
      this.autoPlay();
    }
  }

  action(player, { type, value }) {
    if (type === 'force') {
      if (!player.isHost) return { error: 'Nur der Host darf das.' };
      const result = this.autoPlay();
      this.settle();
      return result;
    }
    if (this.phase === 'final') return { error: 'Das Spiel ist vorbei.' };
    if (!this.controls(player, this.actorId())) return { error: 'Du bist nicht dran.' };
    let result;
    switch (type) {
      case 'roll':
        if (this.phase !== 'roll' && this.phase !== 'reveal') return { error: 'Du hast schon gewürfelt.' };
        result = this.roll();
        break;
      case 'announce':
        if (this.phase !== 'announce') return { error: 'Erst würfeln.' };
        result = this.announce(Number(value));
        break;
      case 'believe':
        if (this.phase !== 'decide') return { error: 'Gerade gibt es nichts zu glauben.' };
        result = this.believe();
        break;
      case 'challenge':
        if (this.phase !== 'decide') return { error: 'Gerade gibt es nichts aufzudecken.' };
        result = this.challenge();
        break;
      default:
        return { error: 'Unbekannte Aktion.' };
    }
    this.settle();
    return result;
  }

  playersChanged() {
    // Wer neu dazukommt, steigt mit so vielen Leben ein, wie der Schwächste noch hat
    const alive = this.aliveIds();
    const fewest = alive.length ? Math.min(...alive.map((id) => this.lives[id])) : this.settings.lives;
    for (const p of this.lobby.activePlayers()) {
      if (!p.guestOf && !this.order.includes(p.id)) {
        this.addPlayer(p.id, fewest);
        this.addLog(`👋 ${p.name} steigt mit ${fewest} Leben ein.`);
      }
    }
    if (this.phase !== 'final') this.settle();
  }

  view(viewer) {
    const actor = this.actorId();
    const mine = this.phase !== 'final' && this.controls(viewer, actor);
    const ranking = this.phase === 'final'
      ? [...this.aliveIds(), ...[...this.outOrder].reverse()]
      : null;
    return {
      phase: this.phase,
      roundNo: this.roundNo,
      values: VALUES,
      maexchen: MAEXCHEN,
      maxLives: this.settings.lives,
      maexDouble: this.settings.maexDouble,
      turnId: this.turnId,
      deciderId: this.deciderId,
      nextStarter: this.phase === 'reveal' ? this.nextStarter : null,
      actorId: actor,
      mine,
      // Die Würfel sieht nur, wer gerade gewürfelt hat
      myDice: this.phase === 'announce' && mine ? this.dice : null,
      claim: this.claim ? { value: this.claim.value, by: this.claim.by } : null,
      history: this.history,
      reveal: this.phase === 'reveal' || this.phase === 'final' ? this.reveal : null,
      players: this.order.map((id) => ({ id, lives: this.lives[id], out: !this.alive(id) })),
      ranking,
      stats: this.phase === 'final' ? this.stats : null,
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

Maexchen.valueOf = valueOf;
Maexchen.rank = rank;
Maexchen.VALUES = VALUES;
module.exports = Maexchen;
