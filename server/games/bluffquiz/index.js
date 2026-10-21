// Bluff-Quiz: Alle erfinden falsche Antworten, dann wird die echte gesucht

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { shuffle, normalize, fuzzyMatch } = require('../../util');
const exclusions = require('../../exclusions');

const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8'));
const WRITE_TIMES = [30, 45, 60, 90, 120];
const PICK_TIMES = [15, 20, 30, 45, 60];
const MIN_OPTIONS = 4;
const REVEAL_STEP_MS = 4500;
const POINTS = { truth: 1000, fooled: 500, like: 100 };
const MAX_SOLO = 12; // mehr Spieler nur im Team-Modus

// Alle Fragen, die nicht dauerhaft ausgeschlossen wurden
function activeQuestions() {
  return DATA.questions.filter((q) => !exclusions.isExcluded(q.id));
}

function categoryStats() {
  const active = activeQuestions();
  return DATA.categories.map((name) => ({ name, count: active.filter((q) => q.category === name).length }));
}

function matchingQuestions(settings) {
  return activeQuestions().filter((q) => settings.categories.includes(q.category));
}

// Kürzen, Leerzeichen zusammenfassen und groß anfangen, damit sich Lügen nicht an der Schreibweise verraten
function cleanAnswer(raw) {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Zahlen müssen genau stimmen, sonst wäre „12000“ wegen eines Tippfehlers schon „30000“ nahe
function isTruth(q, text) {
  const accepted = [q.answer, ...(q.alternatives || [])];
  if (/\d/.test(text)) return accepted.some((a) => normalize(a) === normalize(text));
  return fuzzyMatch(text, accepted);
}

function pickOne(options) {
  return options[crypto.randomInt(options.length)];
}

function optionId() {
  return crypto.randomBytes(4).toString('hex');
}

class BluffQuiz {
  constructor(lobby) {
    this.lobby = lobby;
    this.phase = 'write';
    this.index = 0;
    this.questions = [];
    this.lies = new Map(); // Blatt -> { text, suggested, by }
    this.given = new Map(); // Blatt -> Set der angebotenen Vorschläge (normalisiert)
    this.options = []; // { id, text, authors: [Blatt], suggested: { Blatt: true }, truth, filler }
    this.picks = new Map(); // Spieler-ID -> Antwort-ID
    this.sheetPicks = new Map(); // Blatt -> Antwort-ID (bei Teams per Mehrheit)
    this.likes = new Map(); // Antwort-ID -> Set von Spieler-IDs
    this.steps = []; // Reihenfolge der Auflösung (Antwort-IDs)
    this.revealIndex = -1;
    this.excludeVotes = new Set();
    this.notice = null;
    this.totals = {};
    this.history = []; // pro Frage: { question, answer, points: { Blatt: { truth, fooled, likes, total } }, bestLie }
    this.deadline = null;
    this.timer = null;
  }

  static meta() {
    return {
      id: 'bluffquiz',
      name: 'Bluff-Quiz',
      icon: '🤥',
      description: 'Erfinde eine glaubwürdige falsche Antwort und finde die echte unter allen Lügen.',
      players: '3–12 Spieler, einzeln oder in Teams',
      minPlayers: 3,
      maxPlayers: 40, // in Teams, einzeln höchstens MAX_SOLO
      available: true,
      teams: 'optional',
      categories: categoryStats(),
      totalQuestions: activeQuestions().length,
      writeTimes: WRITE_TIMES,
      pickTimes: PICK_TIMES,
      points: POINTS,
    };
  }

  static defaultSettings() {
    return {
      questionCount: 8,
      categories: DATA.categories.slice(),
      writeTime: 60,
      pickTime: 30,
      doubleLast: true,
      teamMode: false,
    };
  }

  static sanitizeSettings(current, patch) {
    const next = { ...current };
    if (patch.questionCount !== undefined) {
      const n = Math.round(Number(patch.questionCount));
      if (Number.isFinite(n)) next.questionCount = Math.min(Math.max(n, 3), 20);
    }
    if (Array.isArray(patch.categories)) next.categories = patch.categories.filter((c) => DATA.categories.includes(c));
    if (WRITE_TIMES.includes(Number(patch.writeTime))) next.writeTime = Number(patch.writeTime);
    if (PICK_TIMES.includes(Number(patch.pickTime))) next.pickTime = Number(patch.pickTime);
    if (patch.doubleLast !== undefined) next.doubleLast = Boolean(patch.doubleLast);
    if (patch.teamMode !== undefined) next.teamMode = Boolean(patch.teamMode);
    return next;
  }

  static availableCount(settings) {
    return matchingQuestions(settings).length;
  }

  get settings() {
    return this.lobby.settings.game;
  }

  get teamMode() {
    return Boolean(this.settings.teamMode);
  }

  get question() {
    return this.questions[this.index];
  }

  // Die letzte Frage zählt doppelt, wenn eingestellt
  get multiplier() {
    return this.settings.doubleLast && this.index === this.questions.length - 1 && this.questions.length > 1 ? 2 : 1;
  }

  // Wer zusammen eine Lüge schreibt: der Spieler selbst oder sein Team
  sheetKey(player) {
    if (!player || (player.isHost && !this.lobby.settings.hostPlays)) return null;
    if (!this.teamMode) return player.id;
    return this.lobby.teamById(player.teamId) ? player.teamId : null;
  }

  // Verbundene Spieler, die gerade mitspielen
  voters() {
    return this.lobby.activePlayers().filter((p) => this.sheetKey(p));
  }

  activeSheetKeys() {
    return [...new Set(this.voters().map((p) => this.sheetKey(p)))];
  }

  start() {
    const s = this.settings;
    const sheets = this.activeSheetKeys();
    if (this.teamMode && sheets.length < 2) throw new Error('Es braucht mindestens zwei Teams mit Spielern.');
    if (!this.teamMode && sheets.length < 3) throw new Error('Das Bluff-Quiz braucht mindestens 3 Mitspieler.');
    if (!this.teamMode && sheets.length > MAX_SOLO) throw new Error(`Einzeln geht das Bluff-Quiz mit höchstens ${MAX_SOLO} Spielern. Schalte den Team-Modus ein.`);
    // Fragen, die in dieser Lobby schon dran waren, kommen erst wieder, wenn die neuen ausgehen
    if (!this.lobby.bluffPlayed) this.lobby.bluffPlayed = new Set();
    const played = this.lobby.bluffPlayed;
    const pool = matchingQuestions(s);
    const fresh = shuffle(pool.filter((q) => !played.has(q.id)));
    const old = shuffle(pool.filter((q) => played.has(q.id)));
    this.questions = [...fresh, ...old].slice(0, s.questionCount);
    if (!this.questions.length) throw new Error('Keine Fragen für die gewählten Kategorien.');
    for (const q of this.questions) played.add(q.id);
    this.totals = {};
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
    this.phase = 'write';
    this.lies = new Map();
    this.given = new Map();
    this.options = [];
    this.picks = new Map();
    this.sheetPicks = new Map();
    this.likes = new Map();
    this.steps = [];
    this.revealIndex = -1;
    this.excludeVotes = new Set();
    this.deadline = Date.now() + this.settings.writeTime * 1000;
    this.setTimer(this.settings.writeTime * 1000, () => this.toPick());
  }

  // ---------- Lügen schreiben ----------

  // Ein Vorschlag, den noch niemand als Lüge hat und den dieses Blatt noch nicht bekommen hat
  suggestion(key) {
    const q = this.question;
    const taken = new Set([...this.lies.values()].map((l) => normalize(l.text)));
    const given = this.given.get(key) || new Set();
    const free = (q.suggestions || []).filter((s) => !taken.has(normalize(s)));
    const unseen = free.filter((s) => !given.has(normalize(s)));
    return unseen.length ? pickOne(unseen) : free.length ? pickOne(free) : null;
  }

  suggest(player) {
    if (this.phase !== 'write') return { error: 'Gerade wird nicht geschrieben.' };
    const key = this.sheetKey(player);
    if (!key) return { error: 'Du spielst nicht mit.' };
    const text = this.suggestion(key);
    if (!text) return { error: 'Leider sind alle Vorschläge schon vergeben.' };
    if (!this.given.has(key)) this.given.set(key, new Set());
    this.given.get(key).add(normalize(text));
    return { ok: true, text: cleanAnswer(text) };
  }

  lie(player, raw) {
    if (this.phase !== 'write') return { error: 'Gerade wird nicht geschrieben.' };
    const key = this.sheetKey(player);
    if (!key) return { error: this.teamMode ? 'Bitte tritt zuerst einem Team bei.' : 'Du spielst nicht mit.' };
    const text = cleanAnswer(raw);
    if (!text) return { error: 'Bitte gib eine Antwort ein.' };
    if (isTruth(this.question, text)) {
      return { error: 'Das ist zu nah an der Wahrheit, denk dir etwas anderes aus.', truth: true };
    }
    const suggested = Boolean(this.given.get(key)?.has(normalize(text)));
    this.lies.set(key, { text, suggested, by: player.id });
    this.checkAllWritten();
    return { ok: true };
  }

  checkAllWritten() {
    if (this.phase !== 'write') return;
    const keys = this.activeSheetKeys();
    if (keys.length && keys.every((k) => this.lies.has(k))) this.toPick();
  }

  // Lügen zusammenfassen, Wahrheit dazu, bei Bedarf mit Vorschlägen auffüllen und mischen
  toPick() {
    if (this.phase !== 'write') return;
    this.clearTimer();
    // Wer nichts geschrieben hat, bekommt automatisch einen Vorschlag
    for (const key of this.activeSheetKeys()) {
      if (this.lies.has(key)) continue;
      const text = this.suggestion(key);
      if (text) this.lies.set(key, { text: cleanAnswer(text), suggested: true, by: null });
    }
    const q = this.question;
    const byText = new Map();
    for (const [key, lie] of this.lies) {
      const norm = normalize(lie.text);
      if (!byText.has(norm)) byText.set(norm, { id: optionId(), text: lie.text, authors: [], suggested: {}, truth: false, filler: false });
      const option = byText.get(norm);
      option.authors.push(key);
      if (lie.suggested) option.suggested[key] = true;
    }
    const options = [...byText.values()];
    options.push({ id: optionId(), text: cleanAnswer(q.answer), authors: [], suggested: {}, truth: true, filler: false });
    const used = new Set(options.map((o) => normalize(o.text)));
    for (const s of shuffle(q.suggestions || [])) {
      if (options.length >= MIN_OPTIONS) break;
      if (used.has(normalize(s))) continue;
      used.add(normalize(s));
      options.push({ id: optionId(), text: cleanAnswer(s), authors: [], suggested: {}, truth: false, filler: true });
    }
    this.options = shuffle(options);
    this.phase = 'pick';
    this.deadline = Date.now() + this.settings.pickTime * 1000;
    this.setTimer(this.settings.pickTime * 1000, () => this.toReveal());
  }

  // ---------- Auswählen ----------

  option(id) {
    return this.options.find((o) => o.id === id) || null;
  }

  pick(player, id) {
    if (this.phase !== 'pick') return { error: 'Gerade wird nicht gewählt.' };
    const key = this.sheetKey(player);
    if (!key) return { error: 'Du spielst nicht mit.' };
    const option = this.option(id);
    if (!option) return { error: 'Diese Antwort gibt es nicht.' };
    if (option.authors.includes(key)) return { error: 'Auf die eigene Lüge kannst du nicht tippen.' };
    this.picks.set(player.id, id);
    this.checkAllPicked();
    return { ok: true };
  }

  checkAllPicked() {
    if (this.phase !== 'pick') return;
    const voters = this.voters();
    if (voters.length && voters.every((p) => this.picks.has(p.id))) this.toReveal();
  }

  // Im Team-Modus gewinnt die Antwort mit den meisten Stimmen, bei Gleichstand wird gelost
  decide() {
    const groups = new Map(); // Blatt -> Map(Antwort -> Stimmen)
    for (const [playerId, id] of this.picks) {
      const key = this.sheetKey(this.lobby.players.get(playerId));
      if (!key || !this.option(id) || this.option(id).authors.includes(key)) continue;
      if (!groups.has(key)) groups.set(key, new Map());
      const counts = groups.get(key);
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    this.sheetPicks = new Map();
    for (const [key, counts] of groups) {
      const max = Math.max(...counts.values());
      this.sheetPicks.set(key, pickOne([...counts].filter(([, n]) => n === max).map(([id]) => id)));
    }
  }

  pickersOf(id) {
    return [...this.sheetPicks].filter(([, pick]) => pick === id).map(([key]) => key);
  }

  // ---------- Auflösung ----------

  toReveal() {
    if (this.phase !== 'pick') return;
    this.clearTimer();
    this.deadline = null;
    this.decide();
    // Erst die Lügen, auf die jemand hereingefallen ist (wenigste Opfer zuerst), die Wahrheit zuletzt
    const lies = this.options.filter((o) => !o.truth && this.pickersOf(o.id).length);
    lies.sort((a, b) => this.pickersOf(a.id).length - this.pickersOf(b.id).length);
    this.steps = [...lies.map((o) => o.id), this.options.find((o) => o.truth).id];
    this.revealIndex = 0;
    this.phase = 'reveal';
    this.scheduleStep();
  }

  get revealDone() {
    return this.revealIndex >= this.steps.length - 1;
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

  like(player, id, wanted) {
    if (this.phase !== 'reveal') return { error: 'Liken geht nur während der Auflösung.' };
    const key = this.sheetKey(player);
    const option = this.option(id);
    if (!option || option.truth || !option.authors.length) return { error: 'Diese Antwort kann man nicht liken.' };
    if (key && option.authors.includes(key)) return { error: 'Die eigene Lüge kannst du nicht liken.' };
    if (!this.likes.has(id)) this.likes.set(id, new Set());
    if (wanted) this.likes.get(id).add(player.id);
    else this.likes.get(id).delete(player.id);
    return { ok: true };
  }

  likeCount(id) {
    return this.likes.get(id)?.size || 0;
  }

  // Punkte der Frage: Wahrheit gefunden, andere reingelegt (halb bei Vorschlägen), Likes
  roundPoints() {
    const m = this.multiplier;
    const points = {};
    const add = (key, field, value) => {
      if (!points[key]) points[key] = { truth: 0, fooled: 0, likes: 0, total: 0, fooledCount: 0, likeCount: 0 };
      points[key][field] += value;
      if (['truth', 'fooled', 'likes'].includes(field)) points[key].total += value;
    };
    for (const key of new Set([...this.lies.keys(), ...this.sheetPicks.keys()])) add(key, 'total', 0);
    for (const [key, id] of this.sheetPicks) {
      if (this.option(id)?.truth) add(key, 'truth', POINTS.truth * m);
    }
    for (const o of this.options) {
      if (o.truth || !o.authors.length) continue;
      const fooled = this.pickersOf(o.id).length;
      const likes = this.likeCount(o.id);
      for (const key of o.authors) {
        const share = o.suggested[key] ? 0.5 : 1;
        add(key, 'fooled', Math.round(fooled * POINTS.fooled * share) * m);
        add(key, 'fooledCount', fooled);
        add(key, 'likes', likes * POINTS.like * m);
        add(key, 'likeCount', likes);
      }
    }
    return points;
  }

  finishQuestion() {
    if (this.phase !== 'reveal') return;
    this.clearTimer();
    const points = this.roundPoints();
    for (const [key, p] of Object.entries(points)) this.totals[key] = (this.totals[key] || 0) + p.total;
    const liked = this.options.filter((o) => this.likeCount(o.id)).sort((a, b) => this.likeCount(b.id) - this.likeCount(a.id))[0];
    this.history[this.index] = {
      question: this.question.question,
      answer: cleanAnswer(this.question.answer),
      points,
      found: [...this.sheetPicks].filter(([, id]) => this.option(id)?.truth).map(([key]) => key),
      bestLie: liked ? { text: liked.text, authors: liked.authors, likes: this.likeCount(liked.id) } : null,
    };
    this.phase = 'scores';
  }

  next() {
    if (this.phase === 'write') this.toPick();
    else if (this.phase === 'pick') this.toReveal();
    else if (this.phase === 'reveal') {
      if (this.revealDone) this.finishQuestion();
      else this.step();
    } else if (this.phase === 'scores') {
      if (this.index + 1 >= this.questions.length) {
        this.phase = 'final';
        return;
      }
      this.index++;
      this.startQuestion();
    }
  }

  // ---------- Frage ausschließen ----------

  voteExclude(player, wanted) {
    if (this.phase !== 'write') return { error: 'Ausschließen geht nur, solange geschrieben wird.' };
    if (!this.sheetKey(player)) return { error: 'Nur Mitspieler können eine Frage ausschließen.' };
    if (wanted) this.excludeVotes.add(player.id);
    else this.excludeVotes.delete(player.id);
    this.checkExclude();
    return { ok: true };
  }

  checkExclude() {
    if (this.phase !== 'write' || !this.excludeVotes.size) return;
    const voters = this.voters();
    if (voters.length && voters.every((p) => this.excludeVotes.has(p.id))) this.excludeCurrent();
  }

  // Ersetzt die Frage durch eine unbenutzte, bevorzugt aus den gewählten Kategorien
  excludeCurrent() {
    const old = this.question;
    exclusions.add({ ...old, type: 'bluff' });
    const used = new Set([...this.questions.map((q) => q.id), ...(this.lobby.bluffPlayed || [])]);
    const candidates = activeQuestions().filter((q) => !used.has(q.id));
    const preferred = candidates.filter((q) => this.settings.categories.includes(q.category));
    const replacement = preferred.length ? pickOne(preferred) : candidates.length ? pickOne(candidates) : null;
    if (replacement) {
      this.questions[this.index] = replacement;
      this.lobby.bluffPlayed?.add(replacement.id);
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
    if (type === 'next' && !player.isHost) return { error: 'Nur der Host darf das.' };
    switch (type) {
      case 'lie': return this.lie(player, data.text);
      case 'suggest': return this.suggest(player);
      case 'pick': return this.pick(player, data.option);
      case 'like': return this.like(player, data.option, Boolean(data.wanted));
      case 'exclude': return this.voteExclude(player, Boolean(data.wanted));
      case 'next': this.next(); return { ok: true };
      default: return { error: 'Unbekannte Aktion.' };
    }
  }

  // Jemand ist gegangen oder hat das Team gewechselt: vielleicht haben jetzt alle abgegeben
  playersChanged() {
    this.checkAllWritten();
    this.checkAllPicked();
    this.checkExclude();
  }

  // ---------- Ansicht ----------

  publicOption(o, viewer, myKey) {
    const out = { id: o.id, text: o.text, own: Boolean(myKey && o.authors.includes(myKey)) };
    if (this.phase === 'pick') return out;
    const step = this.steps.indexOf(o.id);
    const shown = this.phase !== 'reveal' || (step !== -1 && step <= this.revealIndex) || this.revealDone;
    out.likes = this.likeCount(o.id);
    out.liked = Boolean(this.likes.get(o.id)?.has(viewer.id));
    out.likeable = !o.truth && o.authors.length > 0 && !out.own;
    out.step = step;
    if (shown) {
      out.revealed = true;
      out.truth = o.truth;
      out.filler = o.filler;
      out.authors = o.authors;
      out.pickers = this.pickersOf(o.id);
    }
    return out;
  }

  view(viewer) {
    const myKey = this.sheetKey(viewer);
    const q = this.question;
    const view = {
      phase: this.phase,
      index: this.index,
      total: this.questions.length,
      double: this.multiplier > 1,
      teamMode: this.teamMode,
      mySheet: myKey,
      question: q ? { id: q.id, type: 'bluff', category: q.category, text: q.question } : null,
      sheets: this.activeSheetKeys().map((key) => ({
        key,
        written: this.lies.has(key),
        members: this.voters().filter((p) => this.sheetKey(p) === key).map((p) => p.id),
      })),
      totals: this.totals,
      notice: this.notice,
      deadline: ['write', 'pick'].includes(this.phase) ? this.deadline : null,
      paused: false,
      serverNow: Date.now(),
    };
    if (this.phase === 'write') {
      const mine = myKey ? this.lies.get(myKey) : null;
      view.myLie = mine ? { text: mine.text, suggested: mine.suggested, by: mine.by } : null;
      view.exclude = { ids: [...this.excludeVotes], needed: this.voters().length };
    }
    if (['pick', 'reveal'].includes(this.phase)) {
      view.options = this.options.map((o) => this.publicOption(o, viewer, myKey));
      view.myPick = this.picks.get(viewer.id) || null;
      view.picked = [...this.picks.keys()];
      // Im Team-Modus sieht man, wofür die eigenen Teammitglieder gestimmt haben
      if (this.teamMode && myKey) {
        view.teamPicks = [...this.picks].filter(([id]) => this.sheetKey(this.lobby.players.get(id)) === myKey)
          .map(([playerId, option]) => ({ playerId, option }));
      }
    }
    if (this.phase === 'reveal') {
      view.revealIndex = this.revealIndex;
      view.steps = this.steps;
      view.revealDone = this.revealDone;
    }
    if (['scores', 'final'].includes(this.phase)) {
      const h = this.history[this.index] || this.history[this.history.length - 1];
      view.last = h || null;
    }
    if (this.phase === 'final') view.awards = this.awards();
    return view;
  }

  // Sonderpreise: meiste Reingelegte, meiste gefundene Wahrheiten, meiste Likes
  awards() {
    const sum = (field) => {
      const out = {};
      for (const h of this.history) {
        if (!h) continue;
        for (const [key, p] of Object.entries(h.points)) out[key] = (out[key] || 0) + p[field];
      }
      return out;
    };
    const found = {};
    for (const h of this.history) for (const key of h?.found || []) found[key] = (found[key] || 0) + 1;
    const best = (counts) => {
      const max = Math.max(0, ...Object.values(counts));
      return max ? { keys: Object.keys(counts).filter((k) => counts[k] === max), count: max } : null;
    };
    const lies = this.history.filter((h) => h?.bestLie).map((h) => ({ ...h.bestLie, question: h.question }));
    lies.sort((a, b) => b.likes - a.likes);
    return { liar: best(sum('fooledCount')), finder: best(found), favorite: best(sum('likeCount')), bestLie: lies[0] || null };
  }

  dispose() {
    this.clearTimer();
  }
}

module.exports = BluffQuiz;
