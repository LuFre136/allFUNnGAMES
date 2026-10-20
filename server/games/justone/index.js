// Just One: Einer rät, alle anderen geben je einen Hinweis. Doppelte Hinweise fliegen raus.

const path = require('path');
const fs = require('fs');
const { shuffle, fuzzyMatch, stems, sameStem, sameFamily } = require('../../util');

const WORDS = JSON.parse(fs.readFileSync(path.join(__dirname, 'words.json'), 'utf8')).words;
const WORDS_PER_CARD = 4;
const MIN_PLAYERS = 3;

function cleanClue(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 30);
}

function verdict(score, total) {
  const ratio = total ? score / total : 0;
  if (ratio >= 1) return 'Perfekt! Schafft ihr das noch mal?';
  if (ratio >= 0.85) return 'Unglaublich! Ihr seid ein eingespieltes Team.';
  if (ratio >= 0.65) return 'Großartig! Da ist nicht mehr viel Luft nach oben.';
  if (ratio >= 0.45) return 'Gut gemacht! Mit etwas Übung wird das noch besser.';
  if (ratio >= 0.25) return 'Ein guter Anfang. Beim nächsten Mal klappt mehr.';
  return 'Probiert es gleich noch einmal!';
}

class JustOne {
  constructor(lobby) {
    this.lobby = lobby;
    this.order = []; // Reihenfolge der Ratenden (Spieler-IDs)
    this.deck = []; // Karten mit je vier Begriffen
    this.cardIndex = 0; // verbrauchte Karten
    this.history = []; // Ergebnis pro gespielter Karte
    this.timer = null;
    this.deadline = null;
  }

  static meta() {
    return {
      id: 'justone',
      name: 'Just One',
      icon: '💡',
      description: 'Gemeinsam raten: Alle geben einen Hinweis, doppelte Hinweise fliegen raus.',
      players: '3–20 Spieler, alle zusammen',
      available: true,
      teams: false,
      totalWords: WORDS.length,
    };
  }

  static defaultSettings() {
    return { cardCount: 13, clueTimeLimit: 0 };
  }

  static sanitizeSettings(current, patch) {
    const next = { ...current };
    if (patch.cardCount !== undefined) {
      const n = Math.round(Number(patch.cardCount));
      if (Number.isFinite(n)) next.cardCount = Math.min(Math.max(n, 3), Math.floor(WORDS.length / WORDS_PER_CARD));
    }
    if (patch.clueTimeLimit !== undefined) {
      const t = Math.round(Number(patch.clueTimeLimit));
      if (Number.isFinite(t)) next.clueTimeLimit = Math.min(Math.max(t, 0), 600);
    }
    return next;
  }

  static availableCount() {
    return Math.floor(WORDS.length / WORDS_PER_CARD);
  }

  // Spieler, die mitspielen (verbunden, kein reiner Gamemaster)
  players() {
    return this.lobby.activePlayers();
  }

  start() {
    const players = this.players();
    if (players.length < MIN_PLAYERS) throw new Error(`Just One braucht mindestens ${MIN_PLAYERS} Mitspieler.`);
    const { cardCount } = this.lobby.settings.game;
    const words = shuffle(WORDS);
    this.deck = Array.from({ length: cardCount }, (_, i) => words.slice(i * WORDS_PER_CARD, (i + 1) * WORDS_PER_CARD));
    this.order = shuffle(players.map((p) => p.id));
    this.cardIndex = 0;
    this.history = [];
    this.guesserTurn = 0;
    this.startCard();
  }

  get guesser() {
    return this.lobby.players.get(this.guesserId) || null;
  }

  // Alle verbundenen Mitspieler außer dem Ratenden
  givers() {
    return this.players().filter((p) => p.id !== this.guesserId);
  }

  clearTimer() {
    clearTimeout(this.timer);
    this.timer = null;
    this.deadline = null;
  }

  nextGuesserId() {
    const present = new Set(this.players().map((p) => p.id));
    for (let i = 0; i < this.order.length; i++) {
      const id = this.order[(this.guesserTurn + i) % this.order.length];
      if (present.has(id)) {
        this.guesserTurn = (this.guesserTurn + i + 1) % this.order.length;
        return id;
      }
    }
    return this.order[0];
  }

  startCard() {
    this.clearTimer();
    this.phase = 'pick';
    this.guesserId = this.nextGuesserId();
    this.words = this.deck[this.cardIndex];
    this.choice = null;
    this.clues = new Map(); // playerId -> { text, stem, invalid, reason, manual }
    this.guess = null;
    this.outcome = null; // correct | wrong | pass | skipped
    this.notice = null;
  }

  get word() {
    return this.choice === null ? null : this.words[this.choice];
  }

  pick(player, index) {
    if (this.phase !== 'pick') return { error: 'Der Begriff ist schon gewählt.' };
    if (player.id !== this.guesserId) return { error: 'Nur der Ratende wählt eine Karte.' };
    const i = Number(index);
    if (!Number.isInteger(i) || i < 0 || i >= this.words.length) return { error: 'Ungültige Auswahl.' };
    this.choice = i;
    this.phase = 'clues';
    const limit = this.lobby.settings.game.clueTimeLimit;
    if (limit > 0) {
      this.deadline = Date.now() + limit * 1000;
      this.timer = setTimeout(() => {
        this.toCheck();
        this.lobby.broadcast();
      }, limit * 1000);
    }
    return { ok: true };
  }

  clue(player, raw) {
    if (this.phase !== 'clues') return { error: 'Gerade werden keine Hinweise gesammelt.' };
    if (!this.givers().includes(player)) return { error: 'Du rätst in dieser Runde.' };
    const text = cleanClue(raw);
    if (!text) {
      this.clues.delete(player.id);
    } else {
      if (/\s/.test(text)) return { error: 'Bitte nur ein einziges Wort.' };
      this.clues.set(player.id, { text, stems: stems(text) });
    }
    this.checkAllClues();
    return { ok: true };
  }

  checkAllClues() {
    if (this.phase !== 'clues') return;
    const givers = this.givers();
    if (givers.length && givers.every((p) => this.clues.has(p.id))) this.toCheck();
  }

  // Doppelte Hinweise und Hinweise aus der Wortfamilie des Begriffs werden automatisch aussortiert
  toCheck() {
    if (this.phase !== 'clues') return;
    this.clearTimer();
    this.phase = 'check';
    const all = [...this.clues.values()];
    for (const c of all) {
      c.manual = false;
      if (sameFamily(c, this.word)) {
        c.invalid = true;
        c.reason = 'Zu nah am Begriff';
      } else if (all.some((o) => o !== c && sameStem(o.stems, c.stems))) {
        c.invalid = true;
        c.reason = 'Doppelt';
      } else {
        c.invalid = false;
        c.reason = null;
      }
    }
  }

  // Die Hinweisgeber können Hinweise zusätzlich streichen oder eine automatische Streichung aufheben
  toggleClue(player, playerId) {
    if (this.phase !== 'check') return { error: 'Gerade werden keine Hinweise geprüft.' };
    if (player.id === this.guesserId) return { error: 'Der Ratende darf die Hinweise nicht sehen.' };
    const c = this.clues.get(playerId);
    if (!c) return { error: 'Diesen Hinweis gibt es nicht.' };
    c.invalid = !c.invalid;
    c.manual = true;
    if (c.invalid && !c.reason) c.reason = 'Gestrichen';
    return { ok: true };
  }

  release(player) {
    if (this.phase !== 'check') return { error: 'Gerade werden keine Hinweise geprüft.' };
    if (player.id === this.guesserId) return { error: 'Der Ratende darf die Hinweise nicht freigeben.' };
    this.phase = 'guess';
    return { ok: true };
  }

  makeGuess(player, raw) {
    if (this.phase !== 'guess') return { error: 'Gerade wird nicht geraten.' };
    if (player.id !== this.guesserId) return { error: 'Nur der Ratende darf raten.' };
    if (raw === null) {
      this.guess = null;
      this.outcome = 'pass';
    } else {
      const text = cleanClue(raw);
      if (!text) return { error: 'Bitte gib einen Begriff ein.' };
      this.guess = text;
      const correct = sameStem(stems(text), stems(this.word)) || fuzzyMatch(text, [this.word]);
      this.outcome = correct ? 'correct' : 'wrong';
    }
    this.finishCard();
    return { ok: true };
  }

  finishCard() {
    this.clearTimer();
    this.phase = 'result';
    this.history[this.cardIndex] = this.result();
  }

  result() {
    return {
      word: this.word,
      guesserId: this.guesserId,
      guess: this.guess,
      outcome: this.outcome,
      validClues: [...this.clues.values()].filter((c) => !c.invalid).length,
    };
  }

  // Der Host kann die automatische Bewertung des Rateversuchs korrigieren
  judge(correct) {
    if (this.phase !== 'result' || !['correct', 'wrong'].includes(this.outcome)) return;
    this.outcome = correct ? 'correct' : 'wrong';
    this.history[this.cardIndex] = this.result();
  }

  // Host: aktuelle Karte überspringen (z. B. wenn der Ratende weg ist)
  skip() {
    if (this.phase === 'result' || this.phase === 'final') return;
    if (this.choice === null) this.choice = 0;
    this.outcome = 'skipped';
    this.finishCard();
  }

  // Wie im Original: Ein falscher Rateversuch kostet zusätzlich die nächste Karte
  next() {
    if (this.phase !== 'result') return;
    const losesNext = this.outcome === 'wrong' && this.cardIndex + 1 < this.deck.length;
    if (losesNext) this.history[this.cardIndex + 1] = { word: null, outcome: 'lost' };
    this.cardIndex += losesNext ? 2 : 1;
    if (this.cardIndex >= this.deck.length) {
      this.clearTimer();
      this.phase = 'final';
      return;
    }
    this.startCard();
    if (losesNext) this.notice = 'Falsch geraten: Eine zusätzliche Karte ist abgelegt worden.';
  }

  action(player, { type, ...data }) {
    switch (type) {
      case 'pick': return this.pick(player, data.index);
      case 'clue': return this.clue(player, data.text);
      case 'toggle': return this.toggleClue(player, data.playerId);
      case 'release': return this.release(player);
      case 'guess': return this.makeGuess(player, data.pass ? null : data.text);
      case 'judge':
        if (!player.isHost) return { error: 'Nur der Host darf das.' };
        this.judge(Boolean(data.correct));
        return { ok: true };
      case 'skip':
        if (!player.isHost) return { error: 'Nur der Host darf das.' };
        this.skip();
        return { ok: true };
      default: return { error: 'Unbekannte Aktion.' };
    }
  }

  playersChanged() {
    if (this.phase === 'final') return;
    // Neue Mitspieler kommen hinten in die Reihe der Ratenden
    for (const p of this.players()) if (!this.order.includes(p.id)) this.order.push(p.id);
    this.checkAllClues();
  }

  score() {
    return this.history.filter((r) => r?.outcome === 'correct').length;
  }

  view(viewer) {
    const isGuesser = viewer.id === this.guesserId;
    const done = this.phase === 'result' || this.phase === 'final';
    // Der Ratende sieht Begriffe und Hinweise erst, wenn er dran ist bzw. die Karte vorbei ist
    const showWord = !isGuesser || done;
    const showAllClues = (!isGuesser && this.phase !== 'clues') || done;
    const clues = [...this.clues.entries()].map(([playerId, c]) => {
      const visible = showAllClues || (this.phase === 'guess' && isGuesser && !c.invalid) || (playerId === viewer.id);
      if (!visible) return { playerId, hidden: true };
      return { playerId, text: c.text, invalid: !!c.invalid, reason: c.reason || null, manual: !!c.manual };
    });
    const view = {
      phase: this.phase,
      card: Math.min(this.cardIndex + 1, this.deck.length),
      totalCards: this.deck.length,
      score: this.score(),
      guesserId: this.guesserId,
      isGuesser,
      choice: this.choice,
      wordCount: this.words.length,
      words: showWord ? this.words : null,
      word: showWord ? this.word : null,
      givers: this.givers().map((p) => ({ id: p.id, done: this.clues.has(p.id) })),
      clues: this.phase === 'pick' ? [] : clues,
      myClue: this.clues.get(viewer.id)?.text ?? null,
      guess: done ? this.guess : null,
      outcome: done ? this.outcome : null,
      notice: this.notice,
      deadline: this.phase === 'clues' ? this.deadline : null,
      paused: false,
      serverNow: Date.now(),
    };
    if (this.phase === 'final') {
      view.history = this.history.map((r) => r || { outcome: 'lost' });
      view.verdict = verdict(view.score, this.deck.length);
    }
    return view;
  }

  dispose() {
    this.clearTimer();
  }
}

JustOne.stems = stems;
module.exports = JustOne;
