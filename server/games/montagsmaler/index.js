// Montagsmaler: Einer zeichnet auf dem Handy, alle anderen sehen die Zeichnung live und raten

const path = require('path');
const fs = require('fs');
const { shuffle, pick, normalize, stripFiller, levenshtein, plain, fuzzyMatch, stems, sameStem } = require('../../util');

// Einträge wie „Fahrrad|Rad“: der erste Begriff wird gezeichnet, die übrigen gelten auch als richtig
function parseEntry(raw, level) {
  const [word, ...also] = String(raw).split('|').map((s) => s.trim()).filter(Boolean);
  return { word, also, level };
}

const LIST = JSON.parse(fs.readFileSync(path.join(__dirname, 'words.json'), 'utf8'));
const LEVELS = ['leicht', 'mittel', 'schwer'];
const WORDS = LEVELS.flatMap((level) => LIST[level].map((raw) => parseEntry(raw, level)));

const DRAW_TIMES = [30, 45, 60, 80, 100, 120, 150, 180];
const DIFFICULTIES = ['mixed', ...LEVELS];
const CHOOSE_MS = 15000;
const REVEAL_MS = 8000;
const STEAL_MS = 15000;
const DROP_MS = 15000; // so lange darf der Zeichner weg sein, bevor er übersprungen wird
const GUESS_GAP_MS = 700;
const MAX_CUSTOM = 200;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 20;

// Zeichenfläche: feste Auflösung, damit Füllen auf allen Geräten gleich aussieht
const CANVAS = { width: 1200, height: 900 };
const COLORS = ['#111111', '#7a7a7a', '#ffffff', '#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#ec407a', '#6d4c41', '#80deea'];
const SIZES = [6, 16, 36];
const MAX_STROKES = 600;
const MAX_POINTS = 30000;
const MAX_OPS_PER_SEC = 60;

const GUESSER_POINTS = [10, 8, 7, 6, 5];
const LATE_POINTS = 4;
const TIME_BONUS = 5;
const DRAWER_PER_GUESS = 3;
const DRAWER_MAX = 15;
const TEAM_POINTS = 10;
const STEAL_POINTS = 5;

function cleanWord(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 30);
}

// Eigene Begriffe: einer pro Zeile oder Liste, doppelte (auch anders geschrieben) fliegen raus
function cleanCustom(input) {
  const list = Array.isArray(input) ? input : String(input ?? '').split(/\r?\n|,/);
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const word = cleanWord(raw);
    const key = normalize(word);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(word);
    if (out.length >= MAX_CUSTOM) break;
  }
  return out;
}

function inRange(n, max) {
  return Number.isInteger(n) && n >= 0 && n < max;
}

// Buchstaben, die als Lücke gezeigt werden; Leerzeichen, Bindestriche usw. bleiben sichtbar
function isLetter(ch) {
  return /[\p{L}\p{N}]/u.test(ch);
}

class Montagsmaler {
  constructor(lobby) {
    this.lobby = lobby;
    this.phase = 'choose';
    this.order = []; // Reihenfolge der Zeichner (Spieler-IDs, ohne Teams)
    this.pass = 0; // aktueller Durchgang (ohne Teams)
    this.pos = 0; // nächster Platz in der Reihenfolge
    this.teamOrder = []; // Reihenfolge der Teams
    this.teamTurns = 0; // gespielte Zeichnungen im Team-Modus
    this.memberIndex = {}; // Team -> wer als Nächstes zeichnet
    this.used = new Set(); // schon gezogene Begriffe
    this.turn = null;
    this.turnSeq = 0;
    this.totals = {}; // Spieler- oder Team-ID -> Punkte
    this.gallery = []; // fertige Zeichnungen der Partie
    this.timer = null;
    this.hintTimers = [];
    this.dropTimer = null;
    this.lastGuess = new Map(); // Spieler -> Zeitpunkt des letzten Tipps
  }

  static meta() {
    return {
      id: 'montagsmaler',
      name: 'Montagsmaler',
      icon: '🎨',
      description: 'Einer zeichnet auf dem Handy, alle anderen raten live.',
      players: `${MIN_PLAYERS}–${MAX_PLAYERS} Spieler, einzeln oder in Teams`,
      available: true,
      teams: 'optional',
      drawTimes: DRAW_TIMES,
      canvas: CANVAS,
      colors: COLORS,
      sizes: SIZES,
      wordCounts: Object.fromEntries(LEVELS.map((l) => [l, WORDS.filter((w) => w.level === l).length])),
      maxCustom: MAX_CUSTOM,
    };
  }

  static defaultSettings() {
    return {
      teamMode: false,
      rounds: 2,
      drawTime: 80,
      difficulty: 'mixed',
      choices: 3,
      hints: true,
      customWords: [],
      onlyCustom: false,
      orderMode: 'random',
      order: [],
    };
  }

  static sanitizeSettings(current, patch) {
    const next = { ...current };
    if (patch.teamMode !== undefined) next.teamMode = Boolean(patch.teamMode);
    if (patch.rounds !== undefined) {
      const n = Math.round(Number(patch.rounds));
      if (Number.isFinite(n)) next.rounds = Math.min(Math.max(n, 1), 10);
    }
    if (patch.drawTime !== undefined && DRAW_TIMES.includes(Number(patch.drawTime))) next.drawTime = Number(patch.drawTime);
    if (patch.difficulty !== undefined && DIFFICULTIES.includes(patch.difficulty)) next.difficulty = patch.difficulty;
    if (patch.choices !== undefined && [1, 2, 3].includes(Number(patch.choices))) next.choices = Number(patch.choices);
    if (patch.hints !== undefined) next.hints = Boolean(patch.hints);
    if (patch.customWords !== undefined) next.customWords = cleanCustom(patch.customWords);
    if (patch.onlyCustom !== undefined) next.onlyCustom = Boolean(patch.onlyCustom);
    if (patch.orderMode !== undefined) next.orderMode = patch.orderMode === 'manual' ? 'manual' : 'random';
    if (Array.isArray(patch.order)) {
      next.order = [...new Set(patch.order.filter((id) => typeof id === 'string').map((id) => id.slice(0, 40)))].slice(0, 60);
    }
    return next;
  }

  // Begriffe, aus denen mit diesen Einstellungen gezogen wird
  static pool(settings) {
    const custom = (settings.customWords || []).map((w) => parseEntry(w, 'eigene'));
    if (settings.onlyCustom) return custom;
    const builtIn = settings.difficulty === 'mixed' ? WORDS : WORDS.filter((w) => w.level === settings.difficulty);
    return [...builtIn, ...custom];
  }

  static availableCount(settings) {
    return Montagsmaler.pool(settings).length;
  }

  get settings() {
    return this.lobby.settings.game;
  }

  get teamMode() {
    return Boolean(this.settings.teamMode);
  }

  // Wer mitspielt (ohne reinen Gamemaster)
  plays(player) {
    return Boolean(player) && (!player.isHost || this.lobby.settings.hostPlays);
  }

  // Punkte gehen an den Spieler oder im Team-Modus an sein Team
  scoreKey(player) {
    if (!this.plays(player)) return null;
    if (!this.teamMode) return player.id;
    return this.lobby.teamById(player.teamId) ? player.teamId : null;
  }

  activeIds() {
    return this.lobby.activePlayers().map((p) => p.id);
  }

  teamMembers(teamId) {
    return this.lobby.activePlayers().filter((p) => p.teamId === teamId);
  }

  start() {
    const players = this.lobby.activePlayers();
    if (players.length < MIN_PLAYERS) throw new Error(`Montagsmaler braucht mindestens ${MIN_PLAYERS} Mitspieler.`);
    if (players.length > MAX_PLAYERS) throw new Error(`Montagsmaler geht mit höchstens ${MAX_PLAYERS} Mitspielern.`);
    if (!Montagsmaler.pool(this.settings).length) throw new Error('Bitte gib eigene Begriffe ein oder nimm die mitgelieferten dazu.');
    if (this.teamMode) {
      const teams = this.lobby.teams.filter((t) => this.teamMembers(t.id).length);
      if (teams.length < 2) throw new Error('Es braucht mindestens zwei Teams mit Spielern.');
      const small = teams.find((t) => this.teamMembers(t.id).length < 2);
      if (small) throw new Error(`${small.name} braucht mindestens 2 Spieler: einer zeichnet, die anderen raten.`);
      this.teamOrder = shuffle(teams.map((t) => t.id));
      this.memberIndex = Object.fromEntries(this.teamOrder.map((id) => [id, 0]));
      for (const id of this.teamOrder) this.totals[id] = 0;
    } else {
      const ids = players.map((p) => p.id);
      if (this.settings.orderMode === 'manual') {
        // Reihenfolge des Hosts, wer darin fehlt, kommt hinten dran
        const listed = this.settings.order.filter((id) => ids.includes(id));
        this.order = [...listed, ...ids.filter((id) => !listed.includes(id))];
      } else {
        this.order = shuffle(ids);
      }
      for (const id of this.order) this.totals[id] = 0;
    }
    this.nextTurn();
  }

  // ---------- Timer ----------

  clearTimers() {
    clearTimeout(this.timer);
    this.timer = null;
    for (const t of this.hintTimers) clearTimeout(t);
    this.hintTimers = [];
  }

  setTimer(ms, fn) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      fn();
      this.lobby.broadcast();
    }, ms);
  }

  // ---------- Reihenfolge ----------

  get turnsPerPass() {
    return this.teamMode ? this.teamOrder.length : this.order.length;
  }

  // Nächster Zeichner, oder null, wenn alle Durchgänge gespielt sind
  nextDrawer() {
    const active = new Set(this.activeIds());
    if (this.teamMode) {
      const total = this.settings.rounds * this.teamOrder.length;
      while (this.teamTurns < total) {
        const teamId = this.teamOrder[this.teamTurns % this.teamOrder.length];
        this.teamTurns++;
        const members = this.teamMembers(teamId);
        if (members.length < 2) continue;
        const drawer = members[this.memberIndex[teamId]++ % members.length];
        return { drawerId: drawer.id, teamId };
      }
      return null;
    }
    while (this.pass < this.settings.rounds) {
      if (this.pos >= this.order.length) {
        this.pass++;
        this.pos = 0;
        continue;
      }
      const id = this.order[this.pos++];
      if (active.has(id)) return { drawerId: id, teamId: null };
    }
    return null;
  }

  // ---------- Begriffe ----------

  drawChoices(count) {
    const pool = Montagsmaler.pool(this.settings);
    let fresh = pool.filter((w) => !this.used.has(normalize(w.word)));
    if (fresh.length < count) {
      // Alle Begriffe verbraucht: von vorn anfangen
      this.used.clear();
      fresh = pool.slice();
    }
    const picked = [];
    // Gemischt mit drei Vorschlägen: je einer pro Stufe, solange es geht
    if (this.settings.difficulty === 'mixed' && count === 3 && !this.settings.onlyCustom) {
      for (const level of LEVELS) {
        const options = fresh.filter((w) => w.level === level && !picked.includes(w));
        if (options.length) picked.push(pick(options));
      }
    }
    for (const w of shuffle(fresh)) {
      if (picked.length >= count) break;
      if (!picked.includes(w)) picked.push(w);
    }
    // Falls der Host mitten im Spiel alle eigenen Begriffe gelöscht hat
    if (!picked.length) picked.push(pick(WORDS));
    return picked.slice(0, count);
  }

  // ---------- Ablauf ----------

  nextTurn() {
    this.clearTimers();
    clearTimeout(this.dropTimer);
    this.dropTimer = null;
    const next = this.nextDrawer();
    if (!next) {
      this.phase = 'final';
      this.turn = null;
      return;
    }
    this.turnSeq++;
    this.turn = {
      id: this.turnSeq,
      drawerId: next.drawerId,
      teamId: next.teamId,
      pass: this.teamMode ? Math.ceil(this.teamTurns / this.teamOrder.length) : this.pass + 1,
      choices: this.drawChoices(this.settings.choices),
      entry: null,
      strokes: [],
      points: 0,
      guesses: [], // { playerId, text, kind: wrong | close | correct, steal }
      solved: [], // { playerId, points }
      revealed: new Set(),
      steals: {}, // Team -> { playerId, text, correct }
      scores: {}, // Punkte dieser Zeichnung pro Spieler oder Team
      startedAt: null,
      endsAt: null,
      reason: null,
      opWindow: { start: 0, count: 0 },
    };
    this.phase = 'choose';
    this.deadline = Date.now() + CHOOSE_MS;
    if (this.turn.choices.length === 1) this.choose(0);
    else this.setTimer(CHOOSE_MS, () => this.choose(Math.floor(Math.random() * this.turn.choices.length)));
    this.playersChanged();
  }

  choose(index) {
    const t = this.turn;
    if (this.phase !== 'choose' || !t || !inRange(index, t.choices.length)) return;
    t.entry = t.choices[index];
    this.used.add(normalize(t.entry.word));
    this.phase = 'draw';
    const ms = this.settings.drawTime * 1000;
    t.startedAt = Date.now();
    t.endsAt = t.startedAt + ms;
    this.deadline = t.endsAt;
    this.setTimer(ms, () => this.timeUp());
    // Buchstaben-Hinweise nach der Hälfte und nach drei Vierteln der Zeit
    if (this.settings.hints) {
      const letters = [...t.entry.word].filter(isLetter).length;
      const marks = letters <= 4 ? [0.5] : [0.5, 0.75];
      this.hintTimers = marks.map((m) => setTimeout(() => {
        this.revealLetter();
        this.lobby.broadcast();
      }, ms * m));
    }
  }

  revealLetter() {
    const t = this.turn;
    if (this.phase !== 'draw' || !t?.entry) return;
    const chars = [...t.entry.word];
    const hidden = chars.map((ch, i) => i).filter((i) => isLetter(chars[i]) && !t.revealed.has(i));
    if (hidden.length > 1) t.revealed.add(pick(hidden));
  }

  timeUp() {
    if (this.phase !== 'draw') return;
    // Im Team-Modus dürfen die anderen Teams noch einmal raten
    if (this.teamMode && !this.turn.solved.length && this.stealTeams().length) {
      for (const t of this.hintTimers) clearTimeout(t);
      this.hintTimers = [];
      this.phase = 'steal';
      this.deadline = Date.now() + STEAL_MS;
      this.setTimer(STEAL_MS, () => this.endTurn('time'));
      return;
    }
    this.endTurn('time');
  }

  stealTeams() {
    return this.teamOrder.filter((id) => id !== this.turn?.teamId && this.teamMembers(id).length);
  }

  endTurn(reason) {
    const t = this.turn;
    if (!t || !['choose', 'draw', 'steal'].includes(this.phase)) return;
    this.clearTimers();
    clearTimeout(this.dropTimer);
    this.dropTimer = null;
    t.reason = reason;
    if (!t.entry) t.entry = t.choices[0];
    this.phase = 'reveal';
    this.deadline = Date.now() + REVEAL_MS;
    if (t.strokes.length) {
      this.gallery.push({ turn: t.id, word: t.entry.word, drawerId: t.drawerId, teamId: t.teamId, strokes: t.strokes });
    }
    this.setTimer(REVEAL_MS, () => this.nextTurn());
  }

  addPoints(key, pts) {
    if (!key || !pts) return;
    this.totals[key] = (this.totals[key] || 0) + pts;
    this.turn.scores[key] = (this.turn.scores[key] || 0) + pts;
  }

  // ---------- Raten ----------

  accepted() {
    const e = this.turn.entry;
    return [e.word, ...e.also];
  }

  check(text) {
    const words = this.accepted();
    if (fuzzyMatch(text, words)) return 'correct';
    // Einzelne Wörter eines längeren Tipps zählen auch („großer Leuchtturm“), ebenso andere Formen („Katzen“)
    const tokens = String(text).split(/[\s-]+/).filter((w) => plain(w).length >= 2);
    const full = plain(text);
    for (const w of words) {
      const p = plain(w);
      const wordStems = stems(w);
      if (fuzzyMatch(text, [w]) || tokens.some((tok) => fuzzyMatch(tok, [w]) || sameStem(stems(tok), wordStems))) return 'correct';
      // Zusammensetzungen wie „Leuchtturmwärter“ verraten den Begriff sonst in der Liste
      if (p.length >= 5 && full.includes(p)) return 'correct';
    }
    const close = words.some((w) => {
      const target = stripFiller(w);
      const allowed = target.length <= 4 ? 0 : target.length <= 8 ? 1 : 2;
      return levenshtein(stripFiller(text), target) === allowed + 1;
    });
    return close ? 'close' : 'wrong';
  }

  // Wer gerade raten darf
  canGuess(player) {
    const t = this.turn;
    if (!t || !this.plays(player) || player.id === t.drawerId) return false;
    if (t.solved.some((s) => s.playerId === player.id)) return false;
    if (this.phase === 'draw') return !this.teamMode || player.teamId === t.teamId;
    if (this.phase === 'steal') return this.stealTeams().includes(player.teamId) && !t.steals[player.teamId];
    return false;
  }

  guessers() {
    return this.lobby.activePlayers().filter((p) => {
      const t = this.turn;
      if (!this.plays(p) || p.id === t.drawerId) return false;
      return !this.teamMode || p.teamId === t.teamId;
    });
  }

  guess(player, raw) {
    const t = this.turn;
    if (!['draw', 'steal'].includes(this.phase)) return { error: 'Gerade wird nicht geraten.' };
    if (!this.canGuess(player)) {
      if (player.id === t.drawerId) return { error: 'Du zeichnest gerade.' };
      if (this.phase === 'steal' && t.steals[player.teamId]) return { error: 'Euer Team hat schon getippt.' };
      if (this.teamMode && this.phase === 'draw') return { error: 'Gerade rät das andere Team.' };
      return { error: 'Du darfst gerade nicht raten.' };
    }
    const text = cleanWord(raw);
    if (!plain(text)) return { error: 'Bitte gib einen Tipp ein.' };
    const now = Date.now();
    if (now - (this.lastGuess.get(player.id) || 0) < GUESS_GAP_MS) return { error: 'Nicht so schnell!' };
    this.lastGuess.set(player.id, now);
    const kind = this.check(text);

    if (this.phase === 'steal') {
      t.steals[player.teamId] = { playerId: player.id, text, correct: kind === 'correct' };
      if (kind === 'correct') this.addPoints(player.teamId, STEAL_POINTS);
      if (this.stealTeams().every((id) => t.steals[id])) this.endTurn('steal');
      return { ok: true, result: kind === 'correct' ? 'correct' : 'wrong' };
    }

    t.guesses.push({ playerId: player.id, text, kind });
    if (t.guesses.length > 300) t.guesses.shift();
    if (kind !== 'correct') return { ok: true, result: kind };

    const left = Math.max(0, t.endsAt - now) / (t.endsAt - t.startedAt);
    const bonus = Math.round(TIME_BONUS * left);
    if (this.teamMode) {
      const pts = TEAM_POINTS + bonus;
      t.solved.push({ playerId: player.id, points: pts });
      this.addPoints(t.teamId, pts);
      this.endTurn('solved');
      return { ok: true, result: 'correct' };
    }
    const base = GUESSER_POINTS[t.solved.length] ?? LATE_POINTS;
    t.solved.push({ playerId: player.id, points: base + bonus });
    this.addPoints(player.id, base + bonus);
    if (t.solved.length * DRAWER_PER_GUESS <= DRAWER_MAX) this.addPoints(t.drawerId, DRAWER_PER_GUESS);
    this.checkAllSolved();
    return { ok: true, result: 'correct' };
  }

  checkAllSolved() {
    if (this.phase !== 'draw') return;
    const open = this.guessers().filter((p) => !this.turn.solved.some((s) => s.playerId === p.id));
    if (!open.length && this.turn.solved.length) this.endTurn('solved');
  }

  // ---------- Zeichnen ----------

  // Zeichenbefehle laufen über ein eigenes Socket-Ereignis und werden direkt an alle anderen weitergereicht,
  // ohne den ganzen Spielstand neu zu verschicken
  draw(player, data = {}) {
    const t = this.turn;
    if (data.op === 'strokes') return { ok: true, turn: t?.id ?? null, strokes: t?.strokes || [] };
    if (data.op === 'gallery') return { ok: true, gallery: this.gallery };
    if (!t || this.phase !== 'draw' || player.id !== t.drawerId) return { error: 'Du zeichnest gerade nicht.' };
    if (Number(data.turn) !== t.id) return { error: 'Diese Zeichnung ist schon vorbei.' };
    const now = Date.now();
    if (now - t.opWindow.start > 1000) t.opWindow = { start: now, count: 0 };
    if (++t.opWindow.count > MAX_OPS_PER_SEC) return { error: 'Zu viele Striche auf einmal.' };

    let op = null;
    if (data.op === 'add') op = this.addStroke(t, data);
    else if (data.op === 'fill') op = this.addFill(t, data);
    else if (data.op === 'undo') {
      if (!t.strokes.length) return { ok: true };
      const last = t.strokes.pop();
      if (last.pts) t.points -= last.pts.length / 2;
      op = { op: 'undo' };
    } else if (data.op === 'clear') {
      t.strokes = [];
      t.points = 0;
      op = { op: 'clear' };
    }
    if (!op) return { error: 'Ungültiger Strich.' };
    this.relay(player, { turn: t.id, ...op });
    return { ok: true };
  }

  coords(list) {
    if (!Array.isArray(list) || list.length < 2 || list.length % 2) return null;
    const out = [];
    for (let i = 0; i < list.length; i += 2) {
      const x = Math.round(Number(list[i]));
      const y = Math.round(Number(list[i + 1]));
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      out.push(Math.min(Math.max(x, 0), CANVAS.width), Math.min(Math.max(y, 0), CANVAS.height));
    }
    return out;
  }

  // Ein neuer Strich oder weitere Punkte für den letzten Strich
  addStroke(t, { id, color, size, pts }) {
    const sid = String(id ?? '').slice(0, 20);
    const points = this.coords(pts);
    if (!sid || !points) return null;
    if (t.points + points.length / 2 > MAX_POINTS) return null;
    const last = t.strokes[t.strokes.length - 1];
    if (last && last.id === sid && last.pts) {
      last.pts.push(...points);
      t.points += points.length / 2;
      return { op: 'add', id: sid, color: last.color, size: last.size, pts: points };
    }
    if (t.strokes.length >= MAX_STROKES || t.strokes.some((s) => s.id === sid)) return null;
    if (!COLORS.includes(color) || !SIZES.includes(Number(size))) return null;
    const stroke = { id: sid, color, size: Number(size), pts: points };
    t.strokes.push(stroke);
    t.points += points.length / 2;
    return { op: 'add', ...stroke, pts: points.slice() };
  }

  addFill(t, { id, color, x, y }) {
    const sid = String(id ?? '').slice(0, 20);
    const point = this.coords([x, y]);
    if (!sid || !point || !COLORS.includes(color) || t.strokes.length >= MAX_STROKES) return null;
    if (t.strokes.some((s) => s.id === sid)) return null;
    const fill = { id: sid, fill: true, color, x: point[0], y: point[1] };
    t.strokes.push(fill);
    return { op: 'fill', ...fill };
  }

  relay(sender, payload) {
    for (const p of this.lobby.players.values()) {
      if (p.id !== sender.id) this.lobby.send(p, 'draw', payload);
    }
  }

  // ---------- Aktionen ----------

  action(player, { type, ...data }) {
    const t = this.turn;
    switch (type) {
      case 'choose':
        if (this.phase !== 'choose' || player.id !== t?.drawerId) return { error: 'Du suchst gerade keinen Begriff aus.' };
        this.choose(Number(data.index));
        return { ok: true };
      case 'guess': return this.guess(player, data.text);
      case 'skip':
        if (!player.isHost && player.id !== t?.drawerId) return { error: 'Nur der Host oder der Zeichner darf das.' };
        if (this.phase === 'draw' && this.teamMode && player.isHost) this.timeUp();
        else this.endTurn(player.id === t?.drawerId ? 'gaveUp' : 'skipped');
        return { ok: true };
      case 'next':
        if (!player.isHost) return { error: 'Nur der Host darf das.' };
        if (this.phase === 'reveal') this.nextTurn();
        return { ok: true };
      default: return { error: 'Unbekannte Aktion.' };
    }
  }

  playersChanged() {
    if (this.phase === 'final' || !this.turn) return;
    // Neue Mitspieler zeichnen im laufenden Durchgang hinten mit
    if (!this.teamMode) {
      for (const id of this.activeIds()) {
        if (!this.order.includes(id)) {
          this.order.push(id);
          this.totals[id] = this.totals[id] || 0;
        }
      }
    }
    if (!['choose', 'draw', 'steal'].includes(this.phase)) return;
    const drawer = this.lobby.players.get(this.turn.drawerId);
    if (!drawer) {
      this.endTurn('left');
      return;
    }
    if (!drawer.connected && !this.dropTimer) {
      this.dropTimer = setTimeout(() => {
        this.dropTimer = null;
        if (!this.lobby.players.get(this.turn?.drawerId)?.connected) {
          this.endTurn('left');
          this.lobby.broadcast();
        }
      }, DROP_MS);
    } else if (drawer.connected && this.dropTimer) {
      clearTimeout(this.dropTimer);
      this.dropTimer = null;
    }
    this.checkAllSolved();
  }

  // ---------- Ansicht ----------

  // Der Begriff als Lücken, mit aufgedeckten Buchstaben
  mask() {
    const t = this.turn;
    if (!t?.entry) return null;
    return [...t.entry.word].map((ch, i) => (!isLetter(ch) || t.revealed.has(i) ? ch : null));
  }

  publicGuesses(viewer) {
    const t = this.turn;
    const reveal = this.phase === 'reveal';
    // Der Bildschirm eines reinen Gamemasters ist der Fernseher, der den Begriff erst bei der Auflösung zeigt
    const knows = viewer.id === t.drawerId || t.solved.some((s) => s.playerId === viewer.id) || reveal;
    return t.guesses.slice(-40).flatMap((g) => {
      const own = g.playerId === viewer.id;
      if (g.kind === 'close' && !own && !knows) return [];
      return [{ playerId: g.playerId, kind: g.kind, text: g.kind === 'correct' && !knows && !own ? null : g.text }];
    });
  }

  view(viewer) {
    const view = {
      phase: this.phase,
      teamMode: this.teamMode,
      rounds: this.settings.rounds,
      totals: this.totals,
      deadline: ['choose', 'draw', 'steal', 'reveal'].includes(this.phase) ? this.deadline : null,
      serverNow: Date.now(),
      galleryCount: this.gallery.length,
    };
    const t = this.turn;
    if (!t) return view;
    const isDrawer = viewer.id === t.drawerId;
    const solved = t.solved.some((s) => s.playerId === viewer.id);
    const knows = isDrawer || solved || this.phase === 'reveal';
    Object.assign(view, {
      turnId: t.id,
      pass: t.pass,
      drawerId: t.drawerId,
      drawerTeam: t.teamId,
      isDrawer,
      choices: isDrawer && this.phase === 'choose' ? t.choices.map((c) => ({ word: c.word, level: c.level })) : null,
      word: knows && t.entry ? t.entry.word : null,
      level: knows && t.entry ? t.entry.level : null,
      mask: this.mask(),
      guesses: this.publicGuesses(viewer),
      solved: t.solved.map((s) => ({ playerId: s.playerId, points: knows || s.playerId === viewer.id ? s.points : null })),
      canGuess: this.canGuess(viewer),
      guessers: this.phase === 'steal' ? [] : this.guessers().map((p) => p.id),
      stealTeams: this.phase === 'steal' || this.phase === 'reveal' ? (this.teamMode ? this.stealTeams() : []) : [],
      steals: Object.fromEntries(Object.entries(t.steals).map(([team, s]) => [team, {
        playerId: s.playerId,
        correct: this.phase === 'reveal' ? s.correct : null,
        text: this.phase === 'reveal' || viewer.teamId === team ? s.text : null,
      }])),
      scores: this.phase === 'reveal' ? t.scores : null,
      reason: t.reason,
    });
    return view;
  }

  dispose() {
    this.clearTimers();
    clearTimeout(this.dropTimer);
  }
}

Montagsmaler.words = WORDS;

module.exports = Montagsmaler;
