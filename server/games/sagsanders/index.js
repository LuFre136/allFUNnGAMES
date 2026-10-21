// Sag's anders!: Erklärspiel nach Tabu. Reihum erklärt ein Spieler seinem Team Begriffe, ohne die verbotenen
// Wörter zu sagen. Die anderen Teams sehen die Karte mit und drücken „Buzz!“, wenn eines fällt.

const path = require('path');
const fs = require('fs');
const { shuffle } = require('../../util');

const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, 'cards.json'), 'utf8'));
const CARDS = DATA.cards.map((c, id) => ({ id, ...c }));
const CATEGORIES = DATA.categories;
const TURN_TIMES = [30, 45, 60, 75, 90, 120, 150, 180];
const SKIP_LIMITS = [99, 5, 3, 1, 0]; // 99 = beliebig oft
const TARGETS = [10, 15, 20, 25, 30, 40, 50];
const LEVELS = { all: [1, 2, 3], easy: [1], hard: [2, 3] };
const MIN_CARDS = 10;
const BUZZ_GRACE_MS = 1500; // so lange nach einem Buzz zählt kein weiterer, damit gleichzeitiges Drücken nicht die nächste Karte trifft

function pool(settings) {
  const levels = LEVELS[settings.level] || LEVELS.all;
  return CARDS.filter((c) => settings.categories.includes(c.category) && levels.includes(c.level));
}

// Karten, die eine Lobby schon hatte, kommen erst wieder, wenn der Stapel fast durch ist
const usedCards = new WeakMap();

class SagsAnders {
  constructor(lobby) {
    this.lobby = lobby;
    this.timer = null;
    this.deadline = null;
    this.paused = false;
    this.remainingMs = null;
    this.event = null; // letztes Ereignis für Töne und Aufblinken auf den Geräten
    this.eventSeq = 0;
  }

  static meta() {
    return {
      id: 'sagsanders',
      name: "Sag's anders!",
      icon: '🤐',
      description: 'Begriffe erklären, ohne die verbotenen Wörter zu sagen. Die Gegner passen auf und buzzern.',
      players: '4–20 Spieler in Teams',
      available: true,
      categories: CATEGORIES.map((name) => ({ name, count: CARDS.filter((c) => c.category === name).length })),
    };
  }

  static defaultSettings() {
    return {
      turnTime: 60,
      endMode: 'rounds', // rounds | score
      rounds: 3,
      target: 30,
      skipLimit: 99,
      skipPenalty: false,
      buzzPenalty: true,
      tabooCount: 5,
      categories: CATEGORIES.slice(),
      level: 'all', // all | easy | hard
      orderMode: 'random', // random | lobby
    };
  }

  static sanitizeSettings(current, patch) {
    const next = { ...current };
    const num = (v) => Math.round(Number(v));
    if (patch.turnTime !== undefined && TURN_TIMES.includes(num(patch.turnTime))) next.turnTime = num(patch.turnTime);
    if (patch.endMode !== undefined) next.endMode = patch.endMode === 'score' ? 'score' : 'rounds';
    if (patch.rounds !== undefined && Number.isFinite(num(patch.rounds))) next.rounds = Math.min(Math.max(num(patch.rounds), 1), 10);
    if (patch.target !== undefined && TARGETS.includes(num(patch.target))) next.target = num(patch.target);
    if (patch.skipLimit !== undefined && SKIP_LIMITS.includes(num(patch.skipLimit))) next.skipLimit = num(patch.skipLimit);
    if (patch.skipPenalty !== undefined) next.skipPenalty = Boolean(patch.skipPenalty);
    if (patch.buzzPenalty !== undefined) next.buzzPenalty = Boolean(patch.buzzPenalty);
    if (patch.tabooCount !== undefined && Number.isFinite(num(patch.tabooCount))) next.tabooCount = Math.min(Math.max(num(patch.tabooCount), 3), 5);
    if (Array.isArray(patch.categories)) next.categories = CATEGORIES.filter((c) => patch.categories.includes(c));
    if (patch.level !== undefined) next.level = LEVELS[patch.level] ? patch.level : 'all';
    if (patch.orderMode !== undefined) next.orderMode = patch.orderMode === 'lobby' ? 'lobby' : 'random';
    return next;
  }

  static availableCount(settings) {
    return pool(settings).length;
  }

  get settings() {
    return this.lobby.settings.game;
  }

  // Mitglieder eines Teams (der Host nur, wenn er mitspielt)
  members(teamId) {
    return this.lobby.playersInTeam(teamId);
  }

  // Der Host-Bildschirm ist der Fernseher, dort schaut das ratende Team hin. Er zeigt die Karte deshalb nie.
  canExplain(player) {
    return Boolean(player) && !player.isHost && !player.guestOf;
  }

  roleOf(player) {
    if (!this.teamIds.includes(player.teamId)) return 'spectator';
    if (player.isHost && !this.lobby.settings.hostPlays) return 'spectator';
    if (player.teamId === this.turn?.teamId) return this.turn.explainerId === player.id ? 'explainer' : 'guesser';
    return this.canExplain(player) ? 'guard' : 'spectator';
  }

  start() {
    const teams = this.lobby.teams.filter((t) => this.members(t.id).length);
    for (const t of teams) {
      const members = this.members(t.id);
      if (members.length < 2) throw new Error(`„${t.name}“ braucht mindestens zwei Spieler: einen, der erklärt, und einen, der rät.`);
      if (!members.some((p) => this.canExplain(p))) throw new Error(`In „${t.name}“ muss jemand außer dem Host mit eigenem Handy spielen, um zu erklären.`);
    }
    if (teams.length < 2) throw new Error("Sag's anders! braucht mindestens zwei Teams mit Spielern.");
    if (pool(this.settings).length < MIN_CARDS) throw new Error('Für die gewählten Kategorien gibt es zu wenige Karten. Bitte wähle mehr aus.');

    const random = this.settings.orderMode === 'random';
    this.teamIds = (random ? shuffle(teams) : teams).map((t) => t.id);
    this.orders = {};
    this.counters = {};
    for (const id of this.teamIds) {
      const ids = this.members(id).filter((p) => this.canExplain(p)).map((p) => p.id);
      this.orders[id] = random ? shuffle(ids) : ids;
      this.counters[id] = 0;
    }
    // Bei Runden erklärt jeder so oft, wie eingestellt. Kleinere Teams erklären dafür öfter.
    const biggest = Math.max(...this.teamIds.map((id) => this.orders[id].length));
    this.turnsPerTeam = this.settings.rounds * biggest;
    this.turns = [];
    this.turnIndex = -1;
    this.cardNo = 0;
    this.deck = this.buildDeck();
    this.startTurn();
  }

  buildDeck() {
    let used = usedCards.get(this.lobby);
    if (!used) usedCards.set(this.lobby, (used = new Set()));
    const cards = pool(this.settings);
    const fresh = cards.filter((c) => !used.has(c.id));
    if (fresh.length < Math.max(MIN_CARDS, cards.length * 0.25)) {
      used.clear();
      return shuffle(cards);
    }
    return [...shuffle(fresh), ...shuffle(cards.filter((c) => used.has(c.id)))];
  }

  drawCard() {
    if (!this.deck.length) {
      // Alle Karten sind durch: neu mischen, nur die schon erratenen dieser Partie bleiben draußen
      const solved = new Set(this.turns.flatMap((t) => t.results.filter((r) => r.result === 'correct').map((r) => r.card.id)));
      const rest = pool(this.settings).filter((c) => !solved.has(c.id) && c.id !== this.card?.id);
      this.deck = shuffle(rest.length ? rest : pool(this.settings));
    }
    this.card = this.deck.shift();
    this.cardNo++;
    usedCards.get(this.lobby)?.add(this.card.id);
  }

  // Neue Spieler kommen hinten in die Reihenfolge ihres Teams
  syncOrders() {
    for (const id of this.teamIds) {
      const ids = this.members(id).filter((p) => this.canExplain(p)).map((p) => p.id);
      this.orders[id] = [...this.orders[id].filter((pid) => ids.includes(pid)), ...ids.filter((pid) => !this.orders[id].includes(pid))];
    }
  }

  explainerCandidates(teamId) {
    return this.orders[teamId].filter((id) => this.lobby.players.get(id)?.connected);
  }

  startTurn() {
    this.clearTimer();
    this.syncOrders();
    this.turnIndex++;
    const teamId = this.teamIds[this.turnIndex % this.teamIds.length];
    const order = this.orders[teamId];
    // Reihum weiter, wer gerade nicht verbunden ist, wird übersprungen
    let explainerId = null;
    for (let i = 0; i < order.length; i++) {
      const id = order[(this.counters[teamId] + i) % order.length];
      if (this.lobby.players.get(id)?.connected) {
        explainerId = id;
        this.counters[teamId] += i + 1;
        break;
      }
    }
    this.turn = { teamId, explainerId, results: [], skips: 0 };
    this.turns.push(this.turn);
    this.card = null;
    this.phase = 'ready';
    this.paused = false;
    this.notice = null;
  }

  go() {
    if (this.phase !== 'ready') return { error: 'Der Zug läuft schon.' };
    if (!this.turn.explainerId) return { error: 'Es gibt noch niemanden, der erklärt.' };
    this.phase = 'explain';
    this.drawCard();
    this.runTimer(this.settings.turnTime * 1000);
    this.emit('start');
    return { ok: true };
  }

  runTimer(ms) {
    clearTimeout(this.timer);
    this.paused = false;
    this.remainingMs = null;
    this.deadline = Date.now() + ms;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.timeUp();
      this.lobby.broadcast();
    }, ms);
  }

  clearTimer() {
    clearTimeout(this.timer);
    this.timer = null;
    this.deadline = null;
    this.paused = false;
    this.remainingMs = null;
  }

  emit(type, by = null) {
    this.event = { seq: ++this.eventSeq, type, by };
  }

  // Zeit um (oder der Host beendet den Zug): Die laufende Karte zählt nicht, der Host kann sie in der Auflösung werten
  timeUp(byHost = false) {
    if (this.phase !== 'explain' && this.phase !== 'ready') return;
    if (this.card) this.turn.results.push({ card: this.card, result: 'timeout' });
    this.card = null;
    this.clearTimer();
    this.phase = 'review';
    this.notice = byHost ? 'Der Host hat den Zug beendet.' : null;
    this.emit('time');
  }

  canPlay() {
    if (this.phase !== 'explain') return { error: 'Gerade läuft kein Zug.' };
    if (this.paused) return { error: 'Das Spiel ist pausiert.' };
    return null;
  }

  correct(player) {
    if (player.id !== this.turn.explainerId) return { error: 'Nur wer erklärt, wertet die Karten.' };
    const blocked = this.canPlay();
    if (blocked) return blocked;
    this.turn.results.push({ card: this.card, result: 'correct' });
    this.emit('correct', player.id);
    this.drawCard();
    return { ok: true };
  }

  skip(player) {
    if (player.id !== this.turn.explainerId) return { error: 'Nur wer erklärt, darf überspringen.' };
    const blocked = this.canPlay();
    if (blocked) return blocked;
    if (this.turn.skips >= this.settings.skipLimit) {
      return { error: this.settings.skipLimit ? 'Du hast in diesem Zug schon so oft übersprungen, wie erlaubt ist.' : 'Überspringen ist ausgeschaltet.' };
    }
    this.turn.skips++;
    this.turn.results.push({ card: this.card, result: 'skip' });
    this.emit('skip', player.id);
    this.drawCard();
    return { ok: true };
  }

  // Die letzte eigene Wertung zurücknehmen, z. B. nach einem Vertipper
  undo(player) {
    if (player.id !== this.turn.explainerId) return { error: 'Nur wer erklärt, darf das.' };
    const blocked = this.canPlay();
    if (blocked) return blocked;
    const last = this.turn.results.at(-1);
    if (!last || !['correct', 'skip'].includes(last.result)) return { error: 'Es gibt nichts zum Zurücknehmen.' };
    this.turn.results.pop();
    if (last.result === 'skip') this.turn.skips--;
    this.deck.unshift(this.card);
    this.card = last.card;
    this.cardNo++; // ein verspäteter Buzz auf die andere Karte zählt nicht
    this.emit('undo', player.id);
    return { ok: true };
  }

  buzz(player, cardNo) {
    if (this.roleOf(player) !== 'guard') return { error: 'Buzzern dürfen nur die anderen Teams.' };
    const blocked = this.canPlay();
    if (blocked) return blocked;
    // Nur der erste Buzz pro Karte zählt, ein später auf die nächste Karte geht ins Leere
    if (Number(cardNo) !== this.cardNo || Date.now() - (this.lastBuzzAt || 0) < BUZZ_GRACE_MS) return { ok: true, late: true };
    this.lastBuzzAt = Date.now();
    this.turn.results.push({ card: this.card, result: 'buzz', by: player.id });
    this.emit('buzz', player.id);
    this.drawCard();
    return { ok: true };
  }

  pause() {
    if (this.phase !== 'explain' || this.paused) return;
    clearTimeout(this.timer);
    this.timer = null;
    this.remainingMs = Math.max(0, this.deadline - Date.now());
    this.paused = true;
  }

  resume() {
    if (this.phase !== 'explain' || !this.paused) return { error: 'Das Spiel ist nicht pausiert.' };
    if (!this.lobby.players.get(this.turn.explainerId)?.connected) return { error: 'Wer erklärt, ist gerade nicht verbunden. Der Host kann jemand anderen wählen.' };
    this.notice = null;
    this.runTimer(this.remainingMs);
    return { ok: true };
  }

  setExplainer(playerId) {
    const player = this.lobby.players.get(playerId);
    if (this.phase !== 'ready' && !(this.phase === 'explain' && this.paused)) return { error: 'Das geht nur vor dem Zug oder in der Pause.' };
    if (player?.teamId !== this.turn.teamId) return { error: 'Dieser Spieler ist nicht im Team, das dran ist.' };
    if (!this.canExplain(player)) return { error: 'Der Host-Bildschirm kann nicht erklären, sonst sähen alle die Karte.' };
    this.turn.explainerId = playerId;
    return { ok: true };
  }

  setResult(index, result) {
    if (this.phase !== 'review') return { error: 'Ergebnisse lassen sich nur in der Auflösung ändern.' };
    const entry = this.turn.results[Number(index)];
    if (!entry || !['correct', 'skip', 'buzz', 'timeout'].includes(result)) return { error: 'Das geht nicht.' };
    entry.result = result;
    return { ok: true };
  }

  turnScore(turn) {
    let score = 0;
    for (const r of turn.results) {
      if (r.result === 'correct') score++;
      else if (r.result === 'skip' && this.settings.skipPenalty) score--;
      else if (r.result === 'buzz' && this.settings.buzzPenalty) score--;
    }
    return score;
  }

  // Punkte pro Team. Abzüge können den Stand nie unter 0 drücken.
  scores() {
    const totals = Object.fromEntries(this.teamIds.map((id) => [id, 0]));
    for (const turn of this.turns) totals[turn.teamId] = Math.max(0, totals[turn.teamId] + this.turnScore(turn));
    return totals;
  }

  get totalTurns() {
    return this.settings.endMode === 'rounds' ? this.turnsPerTeam * this.teamIds.length : null;
  }

  isOver() {
    const done = this.turnIndex + 1;
    if (this.settings.endMode === 'rounds') return done >= this.totalTurns;
    // Bei der Zielpunktzahl wird die Runde zu Ende gespielt, damit jedes Team gleich oft dran war
    if (done % this.teamIds.length !== 0) return false;
    return Object.values(this.scores()).some((s) => s >= this.settings.target);
  }

  next() {
    if (this.phase !== 'review') return { error: 'Gerade gibt es nichts zum Weiterschalten.' };
    // Übersprungene und nicht fertige Karten kommen ans Ende des Stapels
    for (const r of this.turn.results) {
      if (r.result === 'skip' || r.result === 'timeout') this.deck.push(r.card);
    }
    if (this.isOver()) {
      this.phase = 'final';
      this.emit('final');
    } else {
      this.startTurn();
    }
    return { ok: true };
  }

  awards() {
    const stats = new Map();
    const stat = (id) => {
      if (!stats.has(id)) stats.set(id, { id, correct: 0, best: 0, buzzes: 0 });
      return stats.get(id);
    };
    for (const turn of this.turns) {
      if (!turn.explainerId) continue;
      const n = turn.results.filter((r) => r.result === 'correct').length;
      const s = stat(turn.explainerId);
      s.correct += n;
      s.best = Math.max(s.best, n);
      for (const r of turn.results) if (r.result === 'buzz' && r.by) stat(r.by).buzzes++;
    }
    const top = (key) => {
      const list = [...stats.values()].filter((s) => s[key] > 0).sort((a, b) => b[key] - a[key]);
      return list.length ? { playerId: list[0].id, value: list[0][key] } : null;
    };
    return { bestTurn: top('best'), mostCorrect: top('correct'), topGuard: top('buzzes') };
  }

  action(player, { type, ...data }) {
    const host = player.isHost;
    switch (type) {
      case 'go':
        if (!host && player.id !== this.turn.explainerId) return { error: 'Nur wer erklärt, startet den Zug.' };
        return this.go();
      case 'correct': return this.correct(player);
      case 'skip': return this.skip(player);
      case 'undo': return this.undo(player);
      case 'buzz': return this.buzz(player, data.cardNo);
      case 'pause':
        if (!host) return { error: 'Nur der Host darf das.' };
        this.pause();
        return { ok: true };
      case 'resume':
        if (!host && player.id !== this.turn.explainerId) return { error: 'Nur der Host darf das.' };
        return this.resume();
      case 'endTurn':
        if (!host) return { error: 'Nur der Host darf das.' };
        if (this.phase !== 'explain' && this.phase !== 'ready') return { error: 'Gerade läuft kein Zug.' };
        this.timeUp(true);
        return { ok: true };
      case 'setExplainer':
        if (!host) return { error: 'Nur der Host darf das.' };
        return this.setExplainer(data.playerId);
      case 'setResult':
        if (!host) return { error: 'Nur der Host darf das.' };
        return this.setResult(data.index, data.result);
      case 'next':
        if (!host) return { error: 'Nur der Host darf das.' };
        return this.next();
      default: return { error: 'Unbekannte Aktion.' };
    }
  }

  playersChanged() {
    if (!this.turn || this.phase === 'final') return;
    this.syncOrders();
    const explainer = this.lobby.players.get(this.turn.explainerId);
    const gone = !explainer || explainer.teamId !== this.turn.teamId;
    if (this.phase === 'ready' && (gone || !explainer.connected)) {
      this.turn.explainerId = this.explainerCandidates(this.turn.teamId)[0] ?? (gone ? null : this.turn.explainerId);
    } else if (this.phase === 'explain' && (gone || !explainer.connected) && !this.paused) {
      // Ohne Erklärer bleibt die Sanduhr stehen, bis er zurück ist oder der Host jemand anderen wählt
      this.pause();
      this.notice = `${explainer?.name || 'Wer erklärt'} ist nicht mehr verbunden. Die Zeit ist angehalten.`;
    }
  }

  publicResult(r) {
    return { word: r.card.word, taboo: r.card.taboo.slice(0, this.settings.tabooCount), category: r.card.category, result: r.result, by: r.by || null };
  }

  view(viewer) {
    const role = this.roleOf(viewer);
    const seesCard = this.phase === 'explain' && (role === 'explainer' || role === 'guard');
    const showList = seesCard || this.phase === 'review';
    const scores = this.scores();
    const results = this.turn.results;
    const count = (type) => results.filter((r) => r.result === type).length;
    const explainer = this.lobby.players.get(this.turn.explainerId);
    return {
      phase: this.phase,
      role,
      myTeamId: this.teamIds.includes(viewer.teamId) ? viewer.teamId : null,
      teams: this.teamIds.map((id) => ({ id, score: scores[id], explainers: this.orders[id] })),
      turnTeamId: this.turn.teamId,
      explainerId: this.turn.explainerId,
      explainerOnline: Boolean(explainer?.connected),
      candidates: this.orders[this.turn.teamId],
      turnNo: this.turnIndex + 1,
      totalTurns: this.totalTurns,
      endMode: this.settings.endMode,
      target: this.settings.target,
      card: seesCard ? { word: this.card.word, taboo: this.card.taboo.slice(0, this.settings.tabooCount), category: this.card.category } : null,
      cardNo: this.cardNo,
      counts: { correct: count('correct'), skip: count('skip'), buzz: count('buzz') },
      turnScore: this.turnScore(this.turn),
      results: showList ? results.map((r) => this.publicResult(r)) : null,
      canUndo: ['correct', 'skip'].includes(results.at(-1)?.result),
      skipsLeft: this.settings.skipLimit >= 99 ? null : Math.max(0, this.settings.skipLimit - this.turn.skips),
      skipPenalty: this.settings.skipPenalty,
      buzzPenalty: this.settings.buzzPenalty,
      turnTime: this.settings.turnTime,
      awards: this.phase === 'final' ? this.awards() : null,
      event: this.event,
      notice: this.notice,
      deadline: this.deadline,
      paused: this.paused,
      remainingMs: this.remainingMs,
      serverNow: Date.now(),
    };
  }

  dispose() {
    this.clearTimer();
  }
}

SagsAnders.cards = CARDS;
SagsAnders.categories = CATEGORIES;
module.exports = SagsAnders;
