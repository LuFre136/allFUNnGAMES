// Eins bis Zehn (nach Top Ten): Ein Kapitän wählt ein Thema, alle anderen bekommen geheim eine Zahl von
// 1 bis 10 und antworten passend dazu. Der Kapitän deckt die Antworten von klein nach groß auf.
// Jede Antwort, deren Zahl kleiner ist als eine schon aufgedeckte, kostet die Gruppe ein Herz.

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { shuffle } = require('../../util');
const exclusions = require('../../exclusions');

const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, 'themes.json'), 'utf8'));
const ANSWER_TIMES = [0, 45, 60, 90, 120, 180];
const ROUND_OPTIONS = [0, 3, 4, 5, 6, 8, 10, 12, 15]; // 0 = jeder einmal Kapitän
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 11; // Kapitän plus zehn Zahlen
const MAX_ANSWER = 80;

function activeThemes() {
  return DATA.themes.filter((t) => !exclusions.isExcluded(t.id));
}

function categoryStats() {
  const active = activeThemes();
  return DATA.categories.map((name) => ({ name, count: active.filter((t) => t.category === name).length }));
}

function matchingThemes(settings) {
  return activeThemes().filter((t) => settings.categories.includes(t.category));
}

function verdict(won, hearts, max) {
  if (!won) return 'Alle Herzen weg! Gleich noch mal, diesmal mit mehr Gefühl für die Zahlen.';
  const ratio = max ? hearts / max : 0;
  if (ratio >= 1) return 'Makellos! Ihr versteht euch ohne Worte.';
  if (ratio >= 0.75) return 'Großartig! Eure Kapitäne lesen euch wie ein offenes Buch.';
  if (ratio >= 0.5) return 'Gut gemacht! Ein paar Missverständnisse, aber ihr habt es geschafft.';
  if (ratio >= 0.25) return 'Knapp geschafft! Da war viel Interpretationsspielraum.';
  return 'Mit dem letzten Herz ins Ziel! Das war Nervenkitzel pur.';
}

class EinsBisZehn {
  constructor(lobby) {
    this.lobby = lobby;
    this.phase = 'choose';
    this.round = 0;
    this.totalRounds = 0;
    this.hearts = 0;
    this.rotation = []; // Reihenfolge der Kapitäne
    this.rotationIndex = 0;
    this.captain = null;
    this.options = []; // zwei Themen zur Wahl
    this.theme = null;
    this.numbers = new Map(); // Spieler-ID -> geheime Zahl
    this.answers = new Map(); // Spieler-ID -> Antwort
    this.remaining = []; // noch verdeckte Antworten
    this.revealed = []; // [{ id, number, mistake }] in der Reihenfolge des Aufdeckens
    this.excludeVotes = new Set();
    this.notice = null;
    this.history = []; // pro Runde: { captain, theme, revealed, answers, mistakes, perfect } oder null
    this.lost = false;
    this.deadline = null;
    this.timer = null;
  }

  static meta() {
    return {
      id: 'einsbiszehn',
      name: 'Eins bis Zehn',
      icon: '🔟',
      description: 'Jeder bekommt geheim eine Zahl und antwortet passend, der Kapitän ordnet von 1 bis 10.',
      players: '3–11 Spieler, alle zusammen',
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      available: true,
      teams: false,
      categories: categoryStats(),
      totalQuestions: activeThemes().length,
      answerTimes: ANSWER_TIMES,
      roundOptions: ROUND_OPTIONS,
    };
  }

  static defaultSettings() {
    return { rounds: 0, hearts: 8, answerTime: 90, categories: DATA.categories.slice() };
  }

  static sanitizeSettings(current, patch) {
    const next = { ...current };
    if (patch.rounds !== undefined && ROUND_OPTIONS.includes(Number(patch.rounds))) next.rounds = Number(patch.rounds);
    if (patch.hearts !== undefined) {
      const n = Math.round(Number(patch.hearts));
      if (Number.isFinite(n)) next.hearts = Math.min(Math.max(n, 3), 15);
    }
    if (patch.answerTime !== undefined && ANSWER_TIMES.includes(Number(patch.answerTime))) next.answerTime = Number(patch.answerTime);
    if (Array.isArray(patch.categories)) next.categories = patch.categories.filter((c) => DATA.categories.includes(c));
    return next;
  }

  static availableCount(settings) {
    return matchingThemes(settings).length;
  }

  get settings() {
    return this.lobby.settings.game;
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
    const players = this.players();
    if (players.length < MIN_PLAYERS) throw new Error(`Eins bis Zehn braucht mindestens ${MIN_PLAYERS} Mitspieler.`);
    if (players.length > MAX_PLAYERS) throw new Error(`Eins bis Zehn geht mit höchstens ${MAX_PLAYERS} Spielern.`);
    if (matchingThemes(this.settings).length < 2) throw new Error('Für die gewählten Kategorien gibt es zu wenige Themen.');
    if (!this.lobby.einsbiszehnPlayed) this.lobby.einsbiszehnPlayed = new Set();
    this.rotation = shuffle(players.map((p) => p.id));
    this.rotationIndex = 0;
    this.totalRounds = this.settings.rounds || players.length;
    this.hearts = this.settings.hearts;
    this.history = [];
    this.lost = false;
    this.round = 0;
    this.startRound();
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

  // Nächster verbundener Spieler in der Kapitänsreihe; Neue kommen hinten dazu
  nextCaptain() {
    const active = this.players();
    for (const p of active) if (!this.rotation.includes(p.id)) this.rotation.push(p.id);
    for (let i = 0; i < this.rotation.length; i++) {
      const id = this.rotation[(this.rotationIndex + i) % this.rotation.length];
      if (active.some((p) => p.id === id)) {
        this.rotationIndex = (this.rotationIndex + i + 1) % this.rotation.length;
        return id;
      }
    }
    return active[0]?.id || null;
  }

  // Zwei Themen, bevorzugt solche, die in dieser Lobby noch nicht dran waren
  drawOptions() {
    const played = this.lobby.einsbiszehnPlayed;
    const pool = matchingThemes(this.settings);
    const fresh = shuffle(pool.filter((t) => !played.has(t.id)));
    const old = shuffle(pool.filter((t) => played.has(t.id)));
    return [...fresh, ...old].slice(0, 2);
  }

  startRound(captain = this.nextCaptain()) {
    this.clearTimer();
    this.phase = 'choose';
    this.captain = captain;
    this.options = this.drawOptions();
    this.theme = null;
    this.answers = new Map();
    this.remaining = [];
    this.revealed = [];
    this.excludeVotes = new Set();
    this.deadline = null;
    // Jeder außer dem Kapitän bekommt eine andere Zahl von 1 bis 10
    const others = shuffle(this.players().filter((p) => p.id !== captain)).slice(0, 10);
    const numbers = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    this.numbers = new Map(others.map((p, i) => [p.id, numbers[i]]));
    if (!this.connected(captain)) this.choose(crypto.randomInt(this.options.length));
  }

  // ---------- Thema wählen ----------

  choose(index) {
    if (this.phase !== 'choose') return { error: 'Das Thema steht schon fest.' };
    const theme = this.options[Number(index)];
    if (!theme) return { error: 'Ungültiges Thema.' };
    this.theme = theme;
    this.lobby.einsbiszehnPlayed.add(theme.id);
    this.phase = 'answer';
    const t = this.settings.answerTime;
    this.deadline = t ? Date.now() + t * 1000 : null;
    if (t) this.setTimer(t * 1000, () => this.toOrder());
    return { ok: true };
  }

  // ---------- Antworten ----------

  answer(player, raw) {
    if (this.phase !== 'answer') return { error: 'Gerade wird nicht geantwortet.' };
    if (!this.numbers.has(player.id)) return { error: player.id === this.captain ? 'Als Kapitän antwortest du nicht.' : 'Du spielst diese Runde nicht mit.' };
    const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
    if (!text) return { error: 'Bitte schreib eine Antwort.' };
    if (text.length > MAX_ANSWER) return { error: `Höchstens ${MAX_ANSWER} Zeichen, bitte.` };
    this.answers.set(player.id, text);
    this.checkAllAnswered();
    return { ok: true };
  }

  checkAllAnswered() {
    if (this.phase !== 'answer') return;
    const waiting = [...this.numbers.keys()].filter((id) => this.connected(id) && !this.answers.has(id));
    if (!waiting.length && this.answers.size) this.toOrder();
  }

  toOrder() {
    if (this.phase !== 'answer') return;
    this.clearTimer();
    this.deadline = null;
    // Wer nichts abgegeben hat, macht diese Runde nicht mit
    for (const id of [...this.numbers.keys()]) if (!this.answers.has(id)) this.numbers.delete(id);
    if (this.answers.size < 2) {
      this.notice = 'Zu wenige Antworten, diese Runde wird übersprungen.';
      this.history[this.round] = null;
      this.phase = 'scores';
      return;
    }
    this.notice = null;
    this.remaining = shuffle([...this.answers.keys()]);
    this.phase = 'order';
  }

  // ---------- Aufdecken ----------

  get top() {
    return Math.max(0, ...this.revealed.map((r) => r.number));
  }

  pick(player, id) {
    if (this.phase !== 'order') return { error: 'Gerade wird nicht aufgedeckt.' };
    if (player.id !== this.captain && !player.isHost) return { error: 'Nur der Kapitän deckt auf.' };
    if (!this.remaining.includes(id)) return { error: 'Diese Antwort liegt schon.' };
    const number = this.numbers.get(id);
    const top = this.top;
    const mistake = number < top;
    this.revealed.push({ id, number, mistake, gap: mistake ? top - number : 0 });
    this.remaining = this.remaining.filter((r) => r !== id);
    if (mistake) this.hearts--;
    if (this.hearts <= 0) {
      this.hearts = 0;
      this.lost = true;
      this.finishRound();
    } else if (!this.remaining.length) {
      this.finishRound();
    }
    return { ok: true };
  }

  finishRound() {
    const mistakes = this.revealed.filter((r) => r.mistake).length;
    const perfect = !mistakes && !this.remaining.length;
    // Eine fehlerfreie Runde bringt ein Herz zurück
    if (perfect) this.hearts = Math.min(this.settings.hearts, this.hearts + 1);
    this.history[this.round] = {
      captain: this.captain,
      theme: this.theme,
      revealed: this.revealed,
      hidden: this.remaining.map((id) => ({ id, number: this.numbers.get(id) })),
      answers: Object.fromEntries(this.answers),
      mistakes,
      perfect,
    };
    this.phase = 'scores';
  }

  next() {
    if (this.phase === 'choose') this.choose(crypto.randomInt(this.options.length));
    else if (this.phase === 'answer') this.toOrder();
    else if (this.phase === 'scores') {
      if (this.lost || this.round + 1 >= this.totalRounds) {
        this.clearTimer();
        this.phase = 'final';
        return;
      }
      this.round++;
      this.notice = null;
      this.startRound();
    }
  }

  // Host: Kapitän ist weg, ein anderer übernimmt die Runde
  skip() {
    if (this.phase !== 'choose') return;
    this.startRound();
  }

  // ---------- Thema ausschließen ----------

  voteExclude(player, wanted) {
    if (this.phase !== 'answer') return { error: 'Ausschließen geht nur, solange geantwortet wird.' };
    if (!this.isPlaying(player)) return { error: 'Nur Mitspieler können ein Thema ausschließen.' };
    if (wanted) this.excludeVotes.add(player.id);
    else this.excludeVotes.delete(player.id);
    this.checkExclude();
    return { ok: true };
  }

  checkExclude() {
    if (this.phase !== 'answer' || !this.excludeVotes.size) return;
    const players = this.players();
    if (!players.length || !players.every((p) => this.excludeVotes.has(p.id))) return;
    const old = this.theme;
    exclusions.add({ id: old.id, type: 'einsbiszehn', question: old.text });
    this.notice = `Das Thema „${old.text}“ wurde ausgeschlossen. ${this.lobby.players.get(this.captain)?.name || 'Der Kapitän'} wählt ein neues.`;
    // Gleicher Kapitän, neue Themen und neue Zahlen
    this.startRound(this.captain);
  }

  action(player, { type, ...data }) {
    if (['next', 'skip'].includes(type) && !player.isHost) return { error: 'Nur der Host darf das.' };
    switch (type) {
      case 'choose':
        if (player.id !== this.captain && !player.isHost) return { error: 'Nur der Kapitän wählt das Thema.' };
        return this.choose(data.index);
      case 'answer': return this.answer(player, data.text);
      case 'pick': return this.pick(player, data.id);
      case 'exclude': return this.voteExclude(player, Boolean(data.wanted));
      case 'skip': this.skip(); return { ok: true };
      case 'next': this.next(); return { ok: true };
      default: return { error: 'Unbekannte Aktion.' };
    }
  }

  playersChanged() {
    // Ist der Kapitän bei der Themenwahl weg, wird gelost
    if (this.phase === 'choose' && !this.connected(this.captain)) this.choose(crypto.randomInt(this.options.length));
    this.checkAllAnswered();
    this.checkExclude();
  }

  // ---------- Wertung ----------

  // Bester Kapitän: wenigste Fehler pro Runde als Kapitän; schwerste Antwort: größter Fehler
  awards() {
    const captains = {};
    let hardest = null;
    for (const h of this.history) {
      if (!h) continue;
      const c = (captains[h.captain] ||= { rounds: 0, mistakes: 0 });
      c.rounds++;
      c.mistakes += h.mistakes;
      for (const r of h.revealed) {
        if (r.mistake && (!hardest || r.gap > hardest.gap)) hardest = { id: r.id, number: r.number, gap: r.gap, text: h.answers[r.id], theme: h.theme.text };
      }
    }
    const entries = Object.entries(captains);
    let captain = null;
    if (entries.length) {
      const best = Math.min(...entries.map(([, c]) => c.mistakes / c.rounds));
      const ids = entries.filter(([, c]) => c.mistakes / c.rounds === best).map(([id]) => id);
      captain = { ids, mistakes: entries.find(([id]) => id === ids[0])[1].mistakes };
    }
    return { captain, hardest };
  }

  // ---------- Ansicht ----------

  publicTheme(t) {
    return t ? { id: t.id, category: t.category, text: t.text, low: t.low, high: t.high } : null;
  }

  view(viewer) {
    const view = {
      phase: this.phase,
      round: this.round,
      totalRounds: this.totalRounds,
      hearts: this.hearts,
      maxHearts: this.settings.hearts,
      captain: this.captain,
      theme: this.publicTheme(this.theme),
      numbered: [...this.numbers.keys()],
      answered: [...this.answers.keys()],
      myNumber: this.numbers.has(viewer.id) ? this.numbers.get(viewer.id) : null,
      myAnswer: this.answers.get(viewer.id) ?? null,
      playing: this.isPlaying(viewer),
      notice: this.notice,
      deadline: this.phase === 'answer' ? this.deadline : null,
      paused: false,
      serverNow: Date.now(),
    };
    if (this.phase === 'choose') view.options = this.options.map((t) => this.publicTheme(t));
    if (this.phase === 'answer') view.exclude = { ids: [...this.excludeVotes], needed: this.players().length };
    if (this.phase === 'order') {
      view.cards = this.remaining.map((id) => ({ id, text: this.answers.get(id) }));
      view.revealed = this.revealed.map((r) => ({ ...r, text: this.answers.get(r.id) }));
    }
    if (['scores', 'final'].includes(this.phase)) {
      const h = this.history[this.round] ?? null;
      view.last = h && {
        captain: h.captain,
        theme: this.publicTheme(h.theme),
        revealed: h.revealed.map((r) => ({ ...r, text: h.answers[r.id] })),
        hidden: h.hidden.map((r) => ({ ...r, text: h.answers[r.id] })),
        mistakes: h.mistakes,
        perfect: h.perfect,
      };
      view.lost = this.lost;
      view.lastRound = this.lost || this.round + 1 >= this.totalRounds;
    }
    if (this.phase === 'final') {
      const played = this.history.filter(Boolean);
      view.history = this.history.map((h) => (h ? { captain: h.captain, theme: h.theme.text, mistakes: h.mistakes, perfect: h.perfect } : null));
      view.won = !this.lost;
      view.perfectRounds = played.filter((h) => h.perfect).length;
      view.verdict = verdict(!this.lost, this.hearts, this.settings.hearts);
      view.awards = this.awards();
    }
    return view;
  }

  dispose() {
    this.clearTimer();
  }
}

module.exports = EinsBisZehn;
