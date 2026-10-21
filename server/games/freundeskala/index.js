// Freundeskala (nach Fun Facts): Alle beantworten eine Frage mit einer Zahl, dann legt die Gruppe
// die Profilbilder der Reihe nach von wenig nach viel. Ein Punkt pro Bild am richtigen Platz.

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { shuffle } = require('../../util');
const exclusions = require('../../exclusions');

const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8'));
const ANSWER_TIMES = [0, 30, 45, 60, 90, 120];
const KINDS = ['both', 'count', 'scale'];
const REVEAL_STEP_MS = 1800;
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 12;
const SCALE_MAX = 100;
const LABELS = { count: ['wenig', 'viel'], scale: ['gar nicht', 'total'] };

function activeQuestions() {
  return DATA.questions.filter((q) => !exclusions.isExcluded(q.id));
}

function categoryStats() {
  const active = activeQuestions();
  return DATA.categories.map((name) => ({ name, count: active.filter((q) => q.category === name).length }));
}

function matchingQuestions(settings) {
  return activeQuestions().filter((q) => settings.categories.includes(q.category) && (settings.kinds === 'both' || q.kind === settings.kinds));
}

function maxOf(q) {
  return q.kind === 'scale' ? SCALE_MAX : q.max;
}

function pickOne(options) {
  return options[crypto.randomInt(options.length)];
}

function verdict(score, total) {
  const ratio = total ? score / total : 0;
  if (ratio >= 1) return 'Perfekt! Ihr kennt euch in- und auswendig.';
  if (ratio >= 0.8) return 'Unglaublich! Ihr seid echte Gedankenleser.';
  if (ratio >= 0.6) return 'Stark! Ihr wisst ziemlich genau, wie die anderen ticken.';
  if (ratio >= 0.4) return 'Nicht schlecht! Ein paar Überraschungen waren dabei.';
  if (ratio >= 0.2) return 'Da gibt es noch einiges übereinander zu lernen.';
  return 'Kennt ihr euch überhaupt? Gleich noch eine Runde!';
}

class Freundeskala {
  constructor(lobby) {
    this.lobby = lobby;
    this.phase = 'answer';
    this.index = 0;
    this.questions = [];
    this.answers = new Map(); // Spieler-ID -> Zahl
    this.turnOrder = []; // Wer noch legen muss, der Erste ist dran
    this.line = []; // gelegte Spieler-IDs von wenig nach viel
    this.result = null; // nach dem Legen: [{ id, value, correct }]
    this.revealIndex = -1;
    this.excludeVotes = new Set();
    this.notice = null;
    this.history = []; // pro Frage: { question, unit, result, sorted, points, max }
    this.deadline = null;
    this.timer = null;
  }

  static meta() {
    return {
      id: 'freundeskala',
      name: 'Freundeskala',
      icon: '📏',
      description: 'Jeder antwortet geheim mit einer Zahl, die Gruppe legt alle der Größe nach.',
      players: '3–12 Spieler, alle zusammen',
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      available: true,
      teams: false,
      categories: categoryStats(),
      totalQuestions: activeQuestions().length,
      answerTimes: ANSWER_TIMES,
    };
  }

  static defaultSettings() {
    return { questionCount: 8, categories: DATA.categories.slice(), kinds: 'both', answerTime: 60 };
  }

  static sanitizeSettings(current, patch) {
    const next = { ...current };
    if (patch.questionCount !== undefined) {
      const n = Math.round(Number(patch.questionCount));
      if (Number.isFinite(n)) next.questionCount = Math.min(Math.max(n, 3), 20);
    }
    if (Array.isArray(patch.categories)) next.categories = patch.categories.filter((c) => DATA.categories.includes(c));
    if (KINDS.includes(patch.kinds)) next.kinds = patch.kinds;
    if (patch.answerTime !== undefined && ANSWER_TIMES.includes(Number(patch.answerTime))) next.answerTime = Number(patch.answerTime);
    return next;
  }

  static availableCount(settings) {
    return matchingQuestions(settings).length;
  }

  get settings() {
    return this.lobby.settings.game;
  }

  get question() {
    return this.questions[this.index];
  }

  // Verbundene Mitspieler ohne reinen Gamemaster
  players() {
    return this.lobby.activePlayers();
  }

  isPlaying(player) {
    return Boolean(player) && this.players().includes(player);
  }

  connected(id) {
    return Boolean(this.lobby.players.get(id)?.connected);
  }

  start() {
    const count = this.players().length;
    if (count < MIN_PLAYERS) throw new Error(`Die Freundeskala braucht mindestens ${MIN_PLAYERS} Mitspieler.`);
    if (count > MAX_PLAYERS) throw new Error(`Die Freundeskala geht mit höchstens ${MAX_PLAYERS} Spielern.`);
    // Fragen, die in dieser Lobby schon dran waren, kommen erst wieder, wenn die neuen ausgehen
    if (!this.lobby.freundeskalaPlayed) this.lobby.freundeskalaPlayed = new Set();
    const played = this.lobby.freundeskalaPlayed;
    const pool = matchingQuestions(this.settings);
    const fresh = shuffle(pool.filter((q) => !played.has(q.id)));
    const old = shuffle(pool.filter((q) => played.has(q.id)));
    this.questions = [...fresh, ...old].slice(0, this.settings.questionCount);
    if (!this.questions.length) throw new Error('Keine Fragen für die gewählten Kategorien und Fragearten.');
    for (const q of this.questions) played.add(q.id);
    this.history = [];
    this.index = 0;
    this.startQuestion();
  }

  clearTimer() {
    clearTimeout(this.timer);
    this.timer = null;
  }

  setTimer(ms, fn) {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      fn();
      this.lobby.broadcast();
    }, ms);
  }

  startQuestion() {
    this.phase = 'answer';
    this.answers = new Map();
    this.turnOrder = [];
    this.line = [];
    this.result = null;
    this.revealIndex = -1;
    this.excludeVotes = new Set();
    const t = this.settings.answerTime;
    this.deadline = t ? Date.now() + t * 1000 : null;
    if (t) this.setTimer(t * 1000, () => this.toPlace());
    else this.clearTimer();
  }

  // ---------- Zahl eingeben ----------

  answer(player, raw) {
    if (this.phase !== 'answer') return { error: 'Gerade wird nicht geantwortet.' };
    if (!this.isPlaying(player)) return { error: 'Du spielst nicht mit.' };
    const value = Number(raw);
    const max = maxOf(this.question);
    if (raw === '' || raw === null || !Number.isFinite(value)) return { error: 'Bitte gib eine Zahl ein.' };
    if (!Number.isInteger(value) || value < 0) return { error: 'Bitte gib eine ganze Zahl ab 0 ein.' };
    if (value > max) return { error: `Höchstens ${max.toLocaleString('de-DE')}, bitte.` };
    this.answers.set(player.id, value);
    this.checkAllAnswered();
    return { ok: true };
  }

  checkAllAnswered() {
    if (this.phase !== 'answer') return;
    const players = this.players();
    if (players.length && players.every((p) => this.answers.has(p.id))) this.toPlace();
  }

  toPlace() {
    if (this.phase !== 'answer') return;
    this.clearTimer();
    this.deadline = null;
    // Wer nichts abgegeben hat oder gegangen ist, macht diese Runde nicht mit
    for (const id of [...this.answers.keys()]) if (!this.connected(id)) this.answers.delete(id);
    if (this.answers.size < 2) {
      this.notice = 'Zu wenige Antworten, diese Frage wird übersprungen.';
      this.history[this.index] = null;
      this.phase = 'scores';
      return;
    }
    this.notice = null;
    const order = shuffle([...this.answers.keys()]);
    // Das Bild des Ersten liegt sofort, eine leere Linie hat nur einen Platz
    this.line = [order.shift()];
    this.turnOrder = order;
    this.phase = 'place';
  }

  // ---------- Legen ----------

  get turn() {
    return this.phase === 'place' ? this.turnOrder[0] || null : null;
  }

  place(player, index) {
    if (this.phase !== 'place') return { error: 'Gerade wird nicht gelegt.' };
    if (player.id !== this.turn) return { error: 'Du bist gerade nicht dran.' };
    const i = Number(index);
    if (!Number.isInteger(i) || i < 0 || i > this.line.length) return { error: 'Ungültiger Platz.' };
    this.line.splice(i, 0, player.id);
    this.turnOrder.shift();
    this.afterTurn();
    return { ok: true };
  }

  // Getrennte Spieler rücken ans Ende; sind nur noch Getrennte übrig, fallen sie aus der Runde
  afterTurn() {
    if (this.phase !== 'place') return;
    const waiting = this.turnOrder.filter((id) => this.connected(id));
    if (!waiting.length) {
      for (const id of this.turnOrder) this.answers.delete(id);
      this.turnOrder = [];
      this.toReveal();
      return;
    }
    while (!this.connected(this.turnOrder[0])) this.turnOrder.push(this.turnOrder.shift());
  }

  // Host: wer gerade dran ist, fällt aus der Runde (z. B. weil er weg ist)
  skip() {
    if (this.phase !== 'place' || !this.turn) return;
    this.answers.delete(this.turnOrder.shift());
    this.afterTurn();
  }

  // ---------- Auflösung ----------

  toReveal() {
    this.clearTimer();
    const sorted = [...this.answers.values()].sort((a, b) => a - b);
    // Platz i ist richtig, wenn dort die i-kleinste Zahl liegt; gleiche Zahlen sind austauschbar
    this.result = this.line.map((id, i) => ({ id, value: this.answers.get(id), correct: this.answers.get(id) === sorted[i] }));
    this.revealIndex = 0;
    this.phase = 'reveal';
    this.scheduleStep();
  }

  get revealDone() {
    return this.revealIndex >= this.result.length - 1;
  }

  scheduleStep() {
    if (this.revealDone) this.clearTimer();
    else this.setTimer(REVEAL_STEP_MS, () => this.step());
  }

  step() {
    if (this.phase !== 'reveal' || this.revealDone) return;
    this.revealIndex++;
    this.scheduleStep();
  }

  // Die richtige Reihenfolge; bei Gleichstand bleibt die gelegte Reihenfolge
  sortedLine() {
    return this.result.map((r, i) => ({ ...r, i })).sort((a, b) => a.value - b.value || a.i - b.i).map(({ id, value }) => ({ id, value }));
  }

  finishQuestion() {
    if (this.phase !== 'reveal') return;
    this.clearTimer();
    const q = this.question;
    this.history[this.index] = {
      question: q.question,
      unit: q.unit || null,
      result: this.result,
      sorted: this.sortedLine(),
      points: this.result.filter((r) => r.correct).length,
      max: this.result.length,
    };
    this.phase = 'scores';
  }

  next() {
    if (this.phase === 'answer') this.toPlace();
    else if (this.phase === 'place') return;
    else if (this.phase === 'reveal') {
      if (this.revealDone) this.finishQuestion();
      else {
        this.revealIndex = this.result.length - 1;
        this.scheduleStep();
      }
    } else if (this.phase === 'scores') {
      if (this.index + 1 >= this.questions.length) {
        this.clearTimer();
        this.phase = 'final';
        return;
      }
      this.index++;
      this.notice = null;
      this.startQuestion();
    }
  }

  // ---------- Frage ausschließen ----------

  voteExclude(player, wanted) {
    if (this.phase !== 'answer') return { error: 'Ausschließen geht nur, solange geantwortet wird.' };
    if (!this.isPlaying(player)) return { error: 'Nur Mitspieler können eine Frage ausschließen.' };
    if (wanted) this.excludeVotes.add(player.id);
    else this.excludeVotes.delete(player.id);
    this.checkExclude();
    return { ok: true };
  }

  checkExclude() {
    if (this.phase !== 'answer' || !this.excludeVotes.size) return;
    const players = this.players();
    if (players.length && players.every((p) => this.excludeVotes.has(p.id))) this.excludeCurrent();
  }

  // Ersetzt die Frage durch eine unbenutzte, bevorzugt passend zu den Einstellungen
  excludeCurrent() {
    const old = this.question;
    exclusions.add({ ...old, type: 'freundeskala' });
    const used = new Set([...this.questions.map((q) => q.id), ...(this.lobby.freundeskalaPlayed || [])]);
    const candidates = activeQuestions().filter((q) => !used.has(q.id));
    const preferred = matchingQuestions(this.settings).filter((q) => !used.has(q.id));
    const replacement = preferred.length ? pickOne(preferred) : candidates.length ? pickOne(candidates) : null;
    if (replacement) {
      this.questions[this.index] = replacement;
      this.lobby.freundeskalaPlayed?.add(replacement.id);
    } else {
      this.questions.splice(this.index, 1);
    }
    this.notice = replacement
      ? `Die Frage „${old.question}“ wurde ausgeschlossen und durch eine neue ersetzt.`
      : `Die Frage „${old.question}“ wurde ausgeschlossen. Es gab keine Ersatzfrage mehr.`;
    if (this.index >= this.questions.length) {
      this.clearTimer();
      this.phase = 'final';
    } else {
      this.startQuestion();
    }
  }

  action(player, { type, ...data }) {
    if (['next', 'skip'].includes(type) && !player.isHost) return { error: 'Nur der Host darf das.' };
    switch (type) {
      case 'answer': return this.answer(player, data.value);
      case 'place': return this.place(player, data.index);
      case 'exclude': return this.voteExclude(player, Boolean(data.wanted));
      case 'skip': this.skip(); return { ok: true };
      case 'next': this.next(); return { ok: true };
      default: return { error: 'Unbekannte Aktion.' };
    }
  }

  playersChanged() {
    this.checkAllAnswered();
    this.checkExclude();
    // Wer dran ist und gegangen ist, rückt ans Ende
    if (this.phase === 'place' && this.turn && !this.connected(this.turn)) this.afterTurn();
  }

  // ---------- Wertung ----------

  score() {
    return this.history.reduce((sum, h) => sum + (h?.points || 0), 0);
  }

  maxScore() {
    return this.history.reduce((sum, h) => sum + (h?.max || 0), 0);
  }

  // Sonderpreise: eigenes Bild oft richtig, weit daneben, oft ganz außen
  awards() {
    const right = {};
    const off = {};
    const extreme = {};
    for (const h of this.history) {
      if (!h) continue;
      const values = h.result.map((r) => r.value);
      const min = Math.min(...values);
      const max = Math.max(...values);
      h.result.forEach((r, i) => {
        if (r.correct) right[r.id] = (right[r.id] || 0) + 1;
        // Abstand zum nächsten Platz, an dem die Zahl richtig gewesen wäre
        const spots = h.sorted.map((s, j) => (s.value === r.value ? j : null)).filter((j) => j !== null);
        const dist = Math.min(...spots.map((j) => Math.abs(j - i)));
        if (dist) off[r.id] = (off[r.id] || 0) + dist;
        if (min !== max && (r.value === min || r.value === max)) extreme[r.id] = (extreme[r.id] || 0) + 1;
      });
    }
    const best = (counts) => {
      const top = Math.max(0, ...Object.values(counts));
      return top ? { ids: Object.keys(counts).filter((k) => counts[k] === top), count: top } : null;
    };
    return { reader: best(right), surprise: best(off), extremist: best(extreme) };
  }

  // ---------- Ansicht ----------

  publicQuestion(q) {
    const [low, high] = LABELS[q.kind];
    return { id: q.id, type: 'freundeskala', category: q.category, text: q.question, kind: q.kind, max: maxOf(q), unit: q.unit || null, low: q.low || low, high: q.high || high };
  }

  view(viewer) {
    const q = this.question;
    const view = {
      phase: this.phase,
      index: this.index,
      total: this.questions.length,
      question: q ? this.publicQuestion(q) : null,
      players: this.players().map((p) => p.id),
      answered: [...this.answers.keys()],
      myAnswer: this.answers.has(viewer.id) ? this.answers.get(viewer.id) : null,
      playing: this.isPlaying(viewer),
      score: this.score(),
      maxScore: this.maxScore(),
      notice: this.notice,
      deadline: this.phase === 'answer' ? this.deadline : null,
      paused: false,
      serverNow: Date.now(),
    };
    if (this.phase === 'answer') view.exclude = { ids: [...this.excludeVotes], needed: this.players().length };
    if (this.phase === 'place') {
      view.line = this.line.map((id) => ({ id }));
      view.turn = this.turn;
      view.waiting = this.turnOrder.slice();
    }
    if (this.phase === 'reveal') {
      view.line = this.result.map((r, i) => (i <= this.revealIndex ? r : { id: r.id }));
      view.revealIndex = this.revealIndex;
      view.revealDone = this.revealDone;
      if (this.revealDone) view.sorted = this.sortedLine();
    }
    if (['scores', 'final'].includes(this.phase)) view.last = this.history[this.index] ?? null;
    if (this.phase === 'final') {
      view.history = this.history.map((h) => (h ? { question: h.question, points: h.points, max: h.max } : null));
      view.verdict = verdict(view.score, view.maxScore);
      view.awards = this.awards();
    }
    return view;
  }

  dispose() {
    this.clearTimer();
  }
}

module.exports = Freundeskala;
