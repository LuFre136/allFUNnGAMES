// Pub Quiz: Fragen, Team-Abstimmung, Auflösung und Punkte

const path = require('path');
const fs = require('fs');
const { shuffle, pick, normalize, fuzzyMatch } = require('../../util');
const spotify = require('../../spotify');
const exclusions = require('../../exclusions');

const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8'));

const REVEAL_COUNTDOWN_MS = 3000;
const YEAR_TOLERANCE = 3;

const TYPE_LABELS = {
  choice: 'Multiple Choice',
  open: 'Offene Frage',
  estimate: 'Schätzfrage',
  'music-title': 'Musik: Interpret & Titel',
  'music-year': 'Musik: Interpret & Jahr',
  image: 'Wer ist das?',
};

// Welche Teile einer Antwort einzeln bewertet werden
const PARTS = {
  choice: ['main'],
  open: ['main'],
  estimate: ['main'],
  image: ['main'],
  'music-title': ['artist', 'title'],
  'music-year': ['artist', 'year'],
};

// Alle Fragen, die nicht dauerhaft ausgeschlossen wurden
function activeQuestions() {
  return DATA.questions.filter((q) => !exclusions.isExcluded(q.id));
}

function categoryStats() {
  const active = activeQuestions();
  return DATA.categories.map((name) => ({
    name,
    count: active.filter((q) => q.category === name).length,
  }));
}

function cleanText(value, max = 80) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

// Prüft und bereinigt eine abgegebene Stimme. Liefert null für leere/ungültige Eingaben.
function sanitizeVote(question, raw) {
  switch (question.type) {
    case 'choice': {
      const idx = Number(raw);
      return Number.isInteger(idx) && idx >= 0 && idx < question.options.length ? idx : null;
    }
    case 'open':
    case 'image': {
      const text = cleanText(raw);
      return normalize(text) ? text : null;
    }
    case 'estimate': {
      const num = Number(String(raw).replace(',', '.'));
      return Number.isFinite(num) ? Math.round(num * 100) / 100 : null;
    }
    case 'music-title': {
      const artist = cleanText(raw?.artist);
      const title = cleanText(raw?.title);
      return normalize(artist) || normalize(title) ? { artist, title } : null;
    }
    case 'music-year': {
      const artist = cleanText(raw?.artist);
      const yearNum = Number(raw?.year);
      const year = Number.isInteger(yearNum) && yearNum >= 1800 && yearNum <= 2100 ? yearNum : null;
      return normalize(artist) || year !== null ? { artist, year } : null;
    }
    default:
      return null;
  }
}

// Gleiche Antworten werden über diesen Schlüssel zusammengezählt
function voteKey(question, value) {
  switch (question.type) {
    case 'choice':
    case 'estimate':
      return String(value);
    case 'open':
    case 'image':
      return normalize(value);
    case 'music-title':
      return `${normalize(value.artist)}|${normalize(value.title)}`;
    case 'music-year':
      return `${normalize(value.artist)}|${value.year ?? ''}`;
    default:
      return JSON.stringify(value);
  }
}

function autoJudge(question, value) {
  if (value === null || value === undefined) {
    return Object.fromEntries(PARTS[question.type].map((p) => [p, false]));
  }
  const artists = [question.artist, ...(question.artistAccepted || [])];
  switch (question.type) {
    case 'choice':
      return { main: value === question.answer };
    case 'open':
    case 'image':
      return { main: fuzzyMatch(value, question.accepted || [question.answer]) };
    case 'estimate':
      return { main: Math.abs(value - question.answer) <= question.tolerance };
    case 'music-title':
      return {
        artist: fuzzyMatch(value.artist, artists),
        title: fuzzyMatch(value.title, [question.title, question.title.replace(/\s*\(.*\)\s*/g, '')]),
      };
    case 'music-year':
      return {
        artist: fuzzyMatch(value.artist, artists),
        year: value.year !== null && Math.abs(value.year - question.year) <= YEAR_TOLERANCE,
      };
    default:
      return {};
  }
}

function pointsFor(judgement) {
  return Object.values(judgement).filter(Boolean).length;
}

function maxPoints(question) {
  return PARTS[question.type].length;
}

class PubQuiz {
  constructor(lobby) {
    this.lobby = lobby;
    this.phase = 'question';
    this.index = 0;
    this.questions = [];
    this.votes = new Map(); // playerId -> Wert
    this.history = []; // pro Frage: { teamId: Ergebnis }
    this.deadline = null;
    this.countdownEnd = null;
    this.timer = null;
    this.countdownTimer = null;
    this.excludeVotes = new Set(); // Spieler, die die aktuelle Frage ausschließen wollen
    this.notice = null; // Hinweis für alle, z. B. nach einem Ausschluss
  }

  static meta() {
    return {
      id: 'pubquiz',
      name: 'Pub Quiz',
      icon: '🍻',
      description: 'Rate im Team: Multiple Choice, Schätzfragen, offene Fragen, Musik und berühmte Gesichter.',
      players: '2–40 Spieler in Teams',
      available: true,
      categories: categoryStats(),
      totalQuestions: activeQuestions().length,
      typeLabels: TYPE_LABELS,
    };
  }

  static questionById(id) {
    return DATA.questions.find((q) => q.id === id) || null;
  }

  static defaultSettings() {
    return {
      questionCount: 15,
      categories: DATA.categories.slice(),
      timeLimit: 60,
    };
  }

  static sanitizeSettings(current, patch) {
    const next = { ...current };
    if (patch.questionCount !== undefined) {
      const n = Math.round(Number(patch.questionCount));
      if (Number.isFinite(n)) next.questionCount = Math.min(Math.max(n, 1), DATA.questions.length);
    }
    if (Array.isArray(patch.categories)) {
      next.categories = patch.categories.filter((c) => DATA.categories.includes(c));
    }
    if (patch.timeLimit !== undefined) {
      const t = Math.round(Number(patch.timeLimit));
      if (Number.isFinite(t)) next.timeLimit = Math.min(Math.max(t, 0), 600);
    }
    return next;
  }

  static availableCount(settings) {
    return activeQuestions().filter((q) => settings.categories.includes(q.category)).length;
  }

  start() {
    const { categories, questionCount } = this.lobby.settings.game;
    const pool = activeQuestions().filter((q) => categories.includes(q.category));
    this.questions = shuffle(pool).slice(0, questionCount);
    if (!this.questions.length) throw new Error('Keine Fragen in den gewählten Kategorien.');
    this.index = 0;
    this.history = [];
    this.startQuestion();
  }

  get question() {
    return this.questions[this.index];
  }

  clearTimers() {
    clearTimeout(this.timer);
    clearTimeout(this.countdownTimer);
    this.timer = null;
    this.countdownTimer = null;
  }

  startQuestion() {
    this.clearTimers();
    this.phase = 'question';
    this.votes = new Map();
    this.excludeVotes = new Set();
    this.notice = null;
    this.countdownEnd = null;
    const limit = this.lobby.settings.game.timeLimit;
    this.deadline = limit > 0 ? Date.now() + limit * 1000 : null;
    if (this.deadline) {
      this.timer = setTimeout(() => this.reveal(), limit * 1000);
    }
  }

  // Spieler, die in dieser Runde abstimmen dürfen
  voters() {
    return this.lobby.activePlayers().filter((p) => p.teamId && this.lobby.teamById(p.teamId));
  }

  vote(player, raw) {
    if (this.phase !== 'question') return { error: 'Gerade wird nicht abgestimmt.' };
    if (!player.teamId || !this.lobby.teamById(player.teamId)) return { error: 'Bitte wähle zuerst ein Team.' };
    if (player.isHost && !this.lobby.settings.hostPlays) return { error: 'Als Gamemaster stimmst du nicht ab.' };
    const value = sanitizeVote(this.question, raw);
    if (value === null) this.votes.delete(player.id);
    else this.votes.set(player.id, value);
    this.checkAllVoted();
    return { ok: true };
  }

  // Stimmen alle Mitspieler dafür, wird die Frage dauerhaft ausgeschlossen
  voteExclude(player, wanted) {
    if (this.phase !== 'question') return { error: 'Gerade läuft keine Frage.' };
    if (!this.voters().includes(player)) return { error: 'Nur Mitspieler können eine Frage ausschließen.' };
    if (wanted) this.excludeVotes.add(player.id);
    else this.excludeVotes.delete(player.id);
    this.checkExclude();
    return { ok: true };
  }

  checkExclude() {
    if (this.phase !== 'question' || !this.excludeVotes.size) return;
    const voters = this.voters();
    if (voters.length && voters.every((p) => this.excludeVotes.has(p.id))) this.excludeCurrent();
  }

  // Ersetzt die Frage durch eine unbenutzte mit demselben Format, bevorzugt aus den gewählten Kategorien
  excludeCurrent() {
    const old = this.question;
    exclusions.add(old);
    const used = new Set(this.questions.map((q) => q.id));
    const candidates = activeQuestions().filter((q) => q.type === old.type && !used.has(q.id));
    const preferred = candidates.filter((q) => this.lobby.settings.game.categories.includes(q.category));
    const replacement = preferred.length ? pick(preferred) : candidates.length ? pick(candidates) : null;
    if (replacement) {
      this.questions[this.index] = replacement;
    } else {
      this.questions.splice(this.index, 1);
    }
    if (this.index >= this.questions.length) {
      this.clearTimers();
      this.phase = 'final';
    } else {
      this.startQuestion();
    }
    this.notice = replacement
      ? `Die Frage „${exclusions.describe(old)}“ wurde ausgeschlossen und durch eine neue ersetzt.`
      : `Die Frage „${exclusions.describe(old)}“ wurde ausgeschlossen. Es gab keine Ersatzfrage im selben Format.`;
  }

  // Haben alle abgestimmt, startet der 3-Sekunden-Countdown bis zur Auflösung
  checkAllVoted() {
    if (this.phase !== 'question') return;
    const voters = this.voters();
    const allVoted = voters.length > 0 && voters.every((p) => this.votes.has(p.id));
    if (allVoted && !this.countdownEnd) {
      this.countdownEnd = Date.now() + REVEAL_COUNTDOWN_MS;
      this.countdownTimer = setTimeout(() => this.reveal(), REVEAL_COUNTDOWN_MS);
    } else if (!allVoted && this.countdownEnd) {
      // Jemand Neues ist dazugekommen oder hat seine Stimme zurückgezogen
      clearTimeout(this.countdownTimer);
      this.countdownTimer = null;
      this.countdownEnd = null;
    }
  }

  // Ermittelt die Teamantwort: meiste Stimmen gewinnen, bei Gleichstand wird gelost
  teamDecision(teamId) {
    const groups = new Map();
    for (const p of this.lobby.playersInTeam(teamId)) {
      if (!this.votes.has(p.id)) continue;
      const value = this.votes.get(p.id);
      const key = voteKey(this.question, value);
      if (!groups.has(key)) groups.set(key, { key, value, voters: [] });
      groups.get(key).voters.push(p.id);
    }
    const list = [...groups.values()];
    if (!list.length) return { value: null, votes: 0, lottery: false, tied: [] };
    const max = Math.max(...list.map((g) => g.voters.length));
    const top = list.filter((g) => g.voters.length === max);
    const winner = top.length > 1 ? pick(top) : top[0];
    return {
      value: winner.value,
      votes: max,
      lottery: top.length > 1,
      tied: top.length > 1 ? top.map((g) => g.value) : [],
    };
  }

  reveal() {
    if (this.phase !== 'question') return;
    this.clearTimers();
    this.phase = 'reveal';
    this.countdownEnd = null;
    const results = {};
    for (const team of this.lobby.teams) {
      if (!this.lobby.playersInTeam(team.id).length) continue;
      const decision = this.teamDecision(team.id);
      const judgement = autoJudge(this.question, decision.value);
      results[team.id] = { ...decision, judgement, auto: { ...judgement } };
    }
    this.history[this.index] = results;
    this.lobby.broadcast();
  }

  judge(teamId, part, value) {
    if (this.phase !== 'reveal') return;
    const result = this.history[this.index]?.[teamId];
    if (!result || !(part in result.judgement)) return;
    result.judgement[part] = Boolean(value);
  }

  next() {
    if (this.phase === 'question') return;
    if (this.index + 1 >= this.questions.length) {
      this.clearTimers();
      this.phase = 'final';
      return;
    }
    this.index++;
    this.startQuestion();
  }

  // Ein Spieler hat die Lobby verlassen oder das Team gewechselt
  playersChanged() {
    this.checkAllVoted();
    this.checkExclude();
  }

  totals() {
    const totals = Object.fromEntries(this.lobby.teams.map((t) => [t.id, 0]));
    for (const results of this.history) {
      if (!results) continue;
      for (const [teamId, r] of Object.entries(results)) {
        if (teamId in totals) totals[teamId] += pointsFor(r.judgement);
      }
    }
    return totals;
  }

  publicQuestion(q, { withSpotify }) {
    const out = {
      id: q.id,
      type: q.type,
      typeLabel: TYPE_LABELS[q.type],
      category: q.category,
      question: q.question,
      maxPoints: maxPoints(q),
    };
    if (q.type === 'choice') out.options = q.options;
    if (q.type === 'estimate') out.unit = q.unit;
    if (q.type === 'image') out.image = q.image || `/api/quiz-image/${encodeURIComponent(q.id)}`;
    if (q.type.startsWith('music') && withSpotify) out.spotifyId = spotify.trackIdFor(q);
    return out;
  }

  solution(q) {
    switch (q.type) {
      case 'choice':
        return { index: q.answer, text: q.options[q.answer] };
      case 'estimate':
        return { value: q.answer, tolerance: q.tolerance, unit: q.unit };
      case 'open':
      case 'image':
        return { text: q.answer };
      default:
        return { artist: q.artist, title: q.title, year: q.year, spotifyId: spotify.trackIdFor(q) };
    }
  }

  view(viewer) {
    const q = this.question;
    const isGamemaster = viewer.isHost && !this.lobby.settings.hostPlays;
    const showSolution = this.phase !== 'question' || isGamemaster;
    const voteValue = (id) => (this.votes.has(id) ? this.votes.get(id) : null);

    const teamStatus = this.lobby.teams.map((team) => {
      const members = this.lobby.playersInTeam(team.id);
      const status = {
        teamId: team.id,
        members: members.map((p) => ({ id: p.id, voted: this.votes.has(p.id), connected: p.connected })),
      };
      // Eigene Teamstimmen sind sichtbar, fremde nur für den Gamemaster
      if (isGamemaster || viewer.teamId === team.id || this.phase !== 'question') {
        status.votes = members
          .filter((p) => this.votes.has(p.id))
          .map((p) => ({ playerId: p.id, value: voteValue(p.id), key: voteKey(q, voteValue(p.id)) }));
      }
      return status;
    });

    const view = {
      phase: this.phase,
      index: this.index,
      total: this.questions.length,
      question: this.publicQuestion(q, { withSpotify: viewer.isHost }),
      solution: showSolution ? this.solution(q) : null,
      myVote: voteValue(viewer.id),
      canVote: this.phase === 'question' && !!viewer.teamId && !isGamemaster,
      teamStatus,
      exclude: { ids: [...this.excludeVotes], needed: this.voters().length },
      notice: this.notice,
      deadline: this.deadline,
      countdownEnd: this.countdownEnd,
      serverNow: Date.now(),
      totals: this.totals(),
      results: this.phase === 'question' ? null : this.history[this.index] || {},
      parts: PARTS[q.type],
    };
    if (this.phase === 'final') {
      view.recap = this.questions.map((question, i) => ({
        question: question.question,
        type: question.type,
        solution: this.solution(question),
        results: this.history[i] || {},
      }));
    }
    return view;
  }

  dispose() {
    this.clearTimers();
  }
}

module.exports = PubQuiz;
