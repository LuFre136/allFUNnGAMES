// Stadt, Land, Fluss: Buchstabe ziehen, Kategorien ausfüllen, gemeinsam prüfen

const { shuffle, normalize } = require('../../util');

const DEFAULT_CATEGORIES = ['Stadt', 'Land', 'Fluss'];
const SUGGESTIONS = ['Stadt', 'Land', 'Fluss', 'Tier', 'Pflanze', 'Beruf', 'Vorname', 'Marke', 'Essen & Trinken', 'Sportart',
  'Film oder Serie', 'Musiker', 'Promi', 'Körperteil', 'Gegenstand im Haushalt', 'Kleidungsstück', 'Farbe', 'Krankheit',
  'Schimpfwort', 'Hobby', 'Fahrzeug', 'Spiel', 'Buch', 'Comicfigur'];
const ALL_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const DEFAULT_LETTERS = ALL_LETTERS.filter((l) => !'QXY'.includes(l));
const MAX_CATEGORIES = 12;
const STOP_GRACE = [0, 5, 10, 15, 20, 30];
const LETTER_MS = 3000;
const MIN_SHEETS = 2;

const POINTS = { alone: 20, unique: 10, shared: 5 };

function cleanCategory(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 24);
}

function cleanAnswer(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

// Doppelte Kategorien (auch in anderer Schreibweise) werden zusammengefasst
function cleanCategories(list) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const name = cleanCategory(raw);
    const key = normalize(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= MAX_CATEGORIES) break;
  }
  return out;
}

class StadtLandFluss {
  constructor(lobby) {
    this.lobby = lobby;
    this.phase = 'letter';
    this.round = 0;
    this.letters = []; // gezogene Buchstaben, einer pro Runde
    this.categories = [];
    this.sheets = new Map(); // Spieler- oder Team-ID -> Antworten (Index der Kategorie -> Text)
    this.challenges = new Map(); // `${Kategorie}:${Blatt}` -> Set von Spieler-IDs
    this.overrides = new Map(); // `${Kategorie}:${Blatt}` -> true/false (Entscheidung des Hosts)
    this.totals = {}; // Blatt -> Punkte
    this.history = []; // pro Runde: { letter, points: { Blatt: Punkte } }
    this.checkIndex = 0;
    this.stoppedBy = null;
    this.deadline = null;
    this.timer = null;
  }

  static meta() {
    return {
      id: 'stadtlandfluss',
      name: 'Stadt, Land, Fluss',
      icon: '🗺️',
      description: 'Der Klassiker mit eigenen Kategorien: Buchstabe ziehen, ausfüllen, Stopp rufen.',
      players: '2–20 Spieler, einzeln oder in Teams',
      available: true,
      teams: 'optional',
      suggestions: SUGGESTIONS,
      allLetters: ALL_LETTERS,
      maxCategories: MAX_CATEGORIES,
      stopGrace: STOP_GRACE,
      points: POINTS,
    };
  }

  static defaultSettings() {
    return {
      categories: DEFAULT_CATEGORIES.slice(),
      rounds: 5,
      timeLimit: 90,
      stopEnabled: true,
      stopGrace: 10,
      letters: DEFAULT_LETTERS.slice(),
      teamMode: false,
    };
  }

  static sanitizeSettings(current, patch) {
    const next = { ...current };
    if (patch.categories !== undefined) next.categories = cleanCategories(patch.categories);
    if (patch.letters !== undefined && Array.isArray(patch.letters)) {
      const wanted = new Set(patch.letters.map((l) => String(l).toUpperCase()));
      next.letters = ALL_LETTERS.filter((l) => wanted.has(l));
    }
    if (patch.rounds !== undefined) {
      const n = Math.round(Number(patch.rounds));
      if (Number.isFinite(n)) next.rounds = Math.min(Math.max(n, 1), ALL_LETTERS.length);
    }
    if (patch.timeLimit !== undefined) {
      const t = Math.round(Number(patch.timeLimit));
      if (Number.isFinite(t)) next.timeLimit = Math.min(Math.max(t, 0), 600);
    }
    if (patch.stopEnabled !== undefined) next.stopEnabled = Boolean(patch.stopEnabled);
    if (patch.stopGrace !== undefined) {
      const g = Number(patch.stopGrace);
      if (STOP_GRACE.includes(g)) next.stopGrace = g;
    }
    if (patch.teamMode !== undefined) next.teamMode = Boolean(patch.teamMode);
    return next;
  }

  // Wie viele Runden mit den gewählten Buchstaben möglich sind
  static availableCount(settings) {
    return settings.letters.length;
  }

  get settings() {
    return this.lobby.settings.game;
  }

  get teamMode() {
    return Boolean(this.settings.teamMode);
  }

  // Das Blatt eines Spielers: im Team-Modus teilt sich das Team ein Blatt
  sheetKey(player) {
    if (!player || (player.isHost && !this.lobby.settings.hostPlays)) return null;
    if (!this.teamMode) return player.id;
    return this.lobby.teamById(player.teamId) ? player.teamId : null;
  }

  // Mitspieler, die gerade ein Blatt haben
  members(key) {
    return this.lobby.activePlayers().filter((p) => this.sheetKey(p) === key);
  }

  activeSheetKeys() {
    return [...new Set(this.lobby.activePlayers().map((p) => this.sheetKey(p)).filter(Boolean))];
  }

  start() {
    const s = this.settings;
    if (!s.letters.length) throw new Error('Bitte wähle mindestens einen Buchstaben.');
    const sheets = this.activeSheetKeys();
    if (sheets.length < MIN_SHEETS) {
      throw new Error(this.teamMode ? 'Es braucht mindestens zwei Teams mit Spielern.' : 'Stadt, Land, Fluss braucht mindestens 2 Mitspieler.');
    }
    this.categories = s.categories.slice();
    this.letters = shuffle(s.letters).slice(0, Math.min(s.rounds, s.letters.length));
    this.totals = {};
    this.history = [];
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

  get letter() {
    return this.letters[this.round];
  }

  startRound() {
    this.phase = 'letter';
    this.sheets = new Map(this.activeSheetKeys().map((k) => [k, {}]));
    this.challenges = new Map();
    this.overrides = new Map();
    this.checkIndex = 0;
    this.stoppedBy = null;
    this.deadline = Date.now() + LETTER_MS;
    this.setTimer(LETTER_MS, () => this.startWriting());
  }

  startWriting() {
    this.phase = 'write';
    const limit = this.settings.timeLimit;
    this.deadline = limit > 0 ? Date.now() + limit * 1000 : null;
    if (this.deadline) this.setTimer(limit * 1000, () => this.toCheck());
    else this.clearTimer();
  }

  sheetFor(player) {
    const key = this.sheetKey(player);
    if (!key) return null;
    // Wer später dazukommt, bekommt ein leeres Blatt
    if (!this.sheets.has(key)) this.sheets.set(key, {});
    return this.sheets.get(key);
  }

  setAnswer(player, index, raw) {
    if (this.phase !== 'write') return { error: 'Gerade wird nicht geschrieben.' };
    const sheet = this.sheetFor(player);
    if (!sheet) return { error: this.teamMode ? 'Bitte tritt zuerst einem Team bei.' : 'Du spielst nicht mit.' };
    const i = Number(index);
    if (!Number.isInteger(i) || i < 0 || i >= this.categories.length) return { error: 'Unbekannte Kategorie.' };
    const text = cleanAnswer(raw);
    if (text) sheet[i] = text;
    else delete sheet[i];
    return { ok: true };
  }

  filled(sheet) {
    return this.categories.filter((_, i) => sheet?.[i]).length;
  }

  stop(player, answers) {
    if (this.phase !== 'write') return { error: 'Gerade wird nicht geschrieben.' };
    if (!this.settings.stopEnabled) return { error: 'Stopp ist in dieser Runde ausgeschaltet.' };
    if (this.stoppedBy) return { ok: true };
    if (Array.isArray(answers)) answers.forEach((text, i) => { if (text !== null && text !== undefined) this.setAnswer(player, i, text); });
    const sheet = this.sheetFor(player);
    if (!sheet) return { error: 'Du spielst nicht mit.' };
    if (this.filled(sheet) < this.categories.length) return { error: 'Erst alle Kategorien ausfüllen, dann Stopp rufen.' };
    this.stoppedBy = player.id;
    const grace = this.settings.stopGrace * 1000;
    if (!grace) {
      this.toCheck();
      return { ok: true };
    }
    const end = Date.now() + grace;
    if (!this.deadline || end < this.deadline) {
      this.deadline = end;
      this.setTimer(grace, () => this.toCheck());
    }
    return { ok: true };
  }

  toCheck() {
    if (this.phase !== 'write' && this.phase !== 'letter') return;
    this.clearTimer();
    this.deadline = null;
    this.phase = 'check';
    this.checkIndex = 0;
  }

  // Automatische Prüfung: leer oder falscher Anfangsbuchstabe (Ä zählt als A)
  autoReason(text) {
    if (!text) return 'empty';
    if (normalize(text)[0] !== this.letter.toLowerCase()) return 'letter';
    return null;
  }

  // Übrige Mitspieler, die über eine Antwort dieses Blatts abstimmen dürfen
  voters(key) {
    return this.lobby.activePlayers().filter((p) => {
      const own = this.sheetKey(p);
      return own && own !== key;
    });
  }

  entry(catIndex, key) {
    const text = this.sheets.get(key)?.[catIndex] || '';
    const id = `${catIndex}:${key}`;
    const auto = this.autoReason(text);
    const challengers = [...(this.challenges.get(id) || [])];
    const voters = this.voters(key).length;
    const override = this.overrides.has(id) ? this.overrides.get(id) : null;
    const rejected = challengers.length * 2 > voters;
    let valid = !auto && !rejected;
    if (override !== null && text) valid = override;
    return { key, text, auto, challengers, voters, override, rejected, valid };
  }

  // Bewertet eine Kategorie für alle Blätter: 20 allein, 10 einzigartig, 5 doppelt
  evaluate(catIndex) {
    const entries = [...this.sheets.keys()].map((key) => this.entry(catIndex, key));
    const valid = entries.filter((e) => e.valid);
    for (const e of entries) {
      if (!e.valid) {
        e.points = 0;
        continue;
      }
      const norm = normalize(e.text);
      e.duplicate = valid.some((o) => o !== e && normalize(o.text) === norm);
      e.points = valid.length === 1 ? POINTS.alone : e.duplicate ? POINTS.shared : POINTS.unique;
    }
    return entries;
  }

  roundPoints() {
    const points = Object.fromEntries([...this.sheets.keys()].map((k) => [k, 0]));
    this.categories.forEach((_, i) => {
      for (const e of this.evaluate(i)) points[e.key] += e.points;
    });
    return points;
  }

  challenge(player, catIndex, key) {
    if (this.phase !== 'check') return { error: 'Gerade wird nicht geprüft.' };
    if (Number(catIndex) !== this.checkIndex) return { error: 'Diese Kategorie wird gerade nicht geprüft.' };
    const own = this.sheetKey(player);
    if (!own) return { error: 'Du spielst nicht mit.' };
    if (own === key) return { error: 'Die eigene Antwort kannst du nicht anzweifeln.' };
    if (!this.sheets.has(key)) return { error: 'Diese Antwort gibt es nicht.' };
    const id = `${this.checkIndex}:${key}`;
    if (!this.challenges.has(id)) this.challenges.set(id, new Set());
    const set = this.challenges.get(id);
    if (set.has(player.id)) set.delete(player.id);
    else set.add(player.id);
    return { ok: true };
  }

  // Host: Antwort fest gültig/ungültig setzen; derselbe Wert noch einmal hebt die Entscheidung auf
  override(catIndex, key, value) {
    if (this.phase !== 'check' || Number(catIndex) !== this.checkIndex || !this.sheets.has(key)) return;
    const id = `${this.checkIndex}:${key}`;
    if (this.overrides.get(id) === value) this.overrides.delete(id);
    else this.overrides.set(id, value);
  }

  checkStep(delta) {
    if (this.phase !== 'check') return;
    const next = this.checkIndex + delta;
    if (next < 0) return;
    if (next < this.categories.length) {
      this.checkIndex = next;
      return;
    }
    this.finishRound();
  }

  finishRound() {
    const points = this.roundPoints();
    for (const [key, pts] of Object.entries(points)) this.totals[key] = (this.totals[key] || 0) + pts;
    this.history[this.round] = { letter: this.letter, points };
    this.phase = 'scores';
  }

  next() {
    if (this.phase !== 'scores') return;
    if (this.round + 1 >= this.letters.length) {
      this.phase = 'final';
      return;
    }
    this.round++;
    this.startRound();
  }

  action(player, { type, ...data }) {
    const hostOnly = ['endWrite', 'checkNext', 'checkPrev', 'override', 'next'];
    if (hostOnly.includes(type) && !player.isHost) return { error: 'Nur der Host darf das.' };
    switch (type) {
      case 'answer': return this.setAnswer(player, data.index, data.text);
      case 'stop': return this.stop(player, data.answers);
      case 'challenge': return this.challenge(player, data.category, data.sheet);
      case 'endWrite': this.toCheck(); return { ok: true };
      case 'checkNext': this.checkStep(1); return { ok: true };
      case 'checkPrev': this.checkStep(-1); return { ok: true };
      case 'override': this.override(data.category, data.sheet, Boolean(data.valid)); return { ok: true };
      case 'next': this.next(); return { ok: true };
      default: return { error: 'Unbekannte Aktion.' };
    }
  }

  playersChanged() {}

  publicEntry(e, viewer) {
    return {
      key: e.key,
      text: e.text,
      auto: e.auto,
      challengers: e.challengers,
      voters: e.voters,
      override: e.override,
      valid: e.valid,
      duplicate: Boolean(e.duplicate),
      points: e.points,
      challenged: e.challengers.includes(viewer.id),
    };
  }

  view(viewer) {
    const myKey = this.sheetKey(viewer);
    const reveal = ['check', 'scores', 'final'].includes(this.phase);
    const view = {
      phase: this.phase,
      round: this.round + 1,
      totalRounds: this.letters.length,
      // Den Buchstaben gibt es erst, wenn das Schreiben losgeht
      letter: this.phase === 'letter' ? null : this.letter,
      categories: this.categories,
      teamMode: this.teamMode,
      stopEnabled: this.settings.stopEnabled,
      stoppedBy: this.stoppedBy,
      mySheet: myKey,
      myAnswers: myKey ? this.categories.map((_, i) => this.sheets.get(myKey)?.[i] || '') : null,
      sheets: [...this.sheets.keys()].map((key) => ({
        key,
        filled: this.filled(this.sheets.get(key)),
        members: this.members(key).map((p) => p.id),
      })),
      totals: this.totals,
      deadline: ['letter', 'write'].includes(this.phase) ? this.deadline : null,
      paused: false,
      serverNow: Date.now(),
    };
    if (this.phase === 'check') {
      view.checkIndex = this.checkIndex;
      view.entries = this.evaluate(this.checkIndex).map((e) => this.publicEntry(e, viewer));
    }
    if (reveal && this.phase !== 'check') {
      view.table = this.categories.map((_, i) => this.evaluate(i).map((e) => this.publicEntry(e, viewer)));
      view.roundPoints = this.history[this.round]?.points || {};
    }
    if (this.phase === 'final') view.history = this.history;
    return view;
  }

  dispose() {
    this.clearTimer();
  }
}

module.exports = StadtLandFluss;
