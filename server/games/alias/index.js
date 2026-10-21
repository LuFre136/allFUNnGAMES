// Alias: Zwei Teams, 25 Wortkarten. Die Hinweisgeber kennen die geheime Schlüsselkarte und geben ein Wort und eine Zahl,
// ihre Teams decken passende Karten auf. Wer den Attentäter erwischt, verliert sofort.

const path = require('path');
const fs = require('fs');
const { shuffle, pick, stems, sameFamily } = require('../../util');

const WORDS = JSON.parse(fs.readFileSync(path.join(__dirname, 'words.json'), 'utf8')).words;
const BOARD_SIZE = 25;
const NEUTRAL = 7;
const TIME_LIMITS = [0, 30, 45, 60, 90, 120, 180, 240, 300];
const UNLIMITED = 99; // Hinweiszahl „∞“

function cleanWord(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 30);
}

// Zwei Wörter, die zu nah beieinander liegen (gleicher Stamm oder eins steckt im anderen)
function related(a, b) {
  return sameFamily({ text: a, stems: stems(a) }, b) || sameFamily({ text: b, stems: stems(b) }, a);
}

// Wörter, die eine Lobby schon hatte, kommen erst wieder, wenn die Liste fast aufgebraucht ist
const usedWords = new WeakMap();

class Alias {
  constructor(lobby) {
    this.lobby = lobby;
    this.wins = {}; // teamId -> gewonnene Partien
    this.gameNo = 0;
    this.timer = null;
    this.deadline = null;
  }

  static meta() {
    return {
      id: 'alias',
      name: 'Alias',
      icon: '🕵️',
      description: 'Zwei Teams, ein geheimer Plan: Mit einem Wort als Hinweis die eigenen Agenten finden.',
      players: '4–20 Spieler in zwei Teams',
      minPlayers: 4,
      maxPlayers: 20,
      available: true,
      maxTeams: 2,
    };
  }

  static defaultSettings() {
    return {
      winsNeeded: 2,
      spymasterMode: 'rotate', // rotate | random | manual
      spymasters: {}, // teamId -> playerId, bei „manual“
      revealMode: 'majority', // majority | first
      clueTimeLimit: 0,
      guessTimeLimit: 0,
      firstTurnFree: true,
    };
  }

  static sanitizeSettings(current, patch) {
    const next = { ...current };
    if (patch.winsNeeded !== undefined) {
      const n = Math.round(Number(patch.winsNeeded));
      if (Number.isFinite(n)) next.winsNeeded = Math.min(Math.max(n, 1), 5);
    }
    if (patch.spymasterMode !== undefined) next.spymasterMode = ['random', 'manual'].includes(patch.spymasterMode) ? patch.spymasterMode : 'rotate';
    if (patch.spymasters && typeof patch.spymasters === 'object') {
      const spymasters = { ...next.spymasters };
      for (const [teamId, playerId] of Object.entries(patch.spymasters).slice(0, 4)) {
        if (typeof playerId === 'string') spymasters[String(teamId).slice(0, 10)] = playerId.slice(0, 40);
      }
      next.spymasters = spymasters;
    }
    if (patch.revealMode !== undefined) next.revealMode = patch.revealMode === 'first' ? 'first' : 'majority';
    for (const key of ['clueTimeLimit', 'guessTimeLimit']) {
      if (patch[key] !== undefined && TIME_LIMITS.includes(Number(patch[key]))) next[key] = Number(patch[key]);
    }
    if (patch.firstTurnFree !== undefined) next.firstTurnFree = Boolean(patch.firstTurnFree);
    return next;
  }

  static availableCount() {
    return WORDS.length;
  }

  get settings() {
    return this.lobby.settings.game;
  }

  get teams() {
    return this.lobby.teams.slice(0, 2);
  }

  otherTeamId(teamId) {
    return this.teams.find((t) => t.id !== teamId)?.id ?? null;
  }

  // Verbundene Mitglieder eines Teams (der Host nur, wenn er mitspielt)
  members(teamId) {
    return this.lobby.playersInTeam(teamId).filter((p) => p.connected);
  }

  // Der Host-Bildschirm ist der Fernseher und darf die Schlüsselkarte nie zeigen
  canLead(player) {
    return Boolean(player) && !player.isHost && !player.guestOf;
  }

  guessers(teamId) {
    return this.members(teamId).filter((p) => p.id !== this.spymasters[teamId]);
  }

  roleOf(player) {
    const teamId = player.teamId;
    if (!this.teams.some((t) => t.id === teamId)) return 'spectator';
    if (player.isHost && !this.lobby.settings.hostPlays) return 'spectator';
    return this.spymasters[teamId] === player.id ? 'spymaster' : 'guesser';
  }

  start() {
    const teams = this.teams;
    if (this.lobby.teams.length !== 2) throw new Error('Alias braucht genau zwei Teams.');
    for (const t of teams) {
      const members = this.members(t.id);
      if (members.length < 2) throw new Error(`„${t.name}“ braucht mindestens zwei Spieler: einen Hinweisgeber und einen Ermittler.`);
      if (!members.some((p) => this.canLead(p))) throw new Error(`In „${t.name}“ muss jemand außer dem Host mit eigenem Handy spielen, um Hinweise zu geben.`);
    }
    this.wins = Object.fromEntries(teams.map((t) => [t.id, 0]));
    this.gameNo = 0;
    this.startingTeamId = pick(teams).id;
    this.newGame();
  }

  // Hinweisgeber für die neue Partie wählen
  chooseSpymasters() {
    const { spymasterMode, spymasters } = this.settings;
    this.spymasters = {};
    for (const t of this.teams) {
      const candidates = this.members(t.id).filter((p) => this.canLead(p));
      let chosen = null;
      if (spymasterMode === 'manual') chosen = candidates.find((p) => p.id === spymasters[t.id]) || null;
      else if (spymasterMode === 'random') chosen = candidates.length ? pick(candidates) : null;
      else chosen = candidates[(this.gameNo - 1) % Math.max(candidates.length, 1)] || null;
      this.spymasters[t.id] = (chosen || candidates[0])?.id ?? null;
    }
  }

  drawWords() {
    let used = usedWords.get(this.lobby);
    if (!used) usedWords.set(this.lobby, (used = new Set()));
    let pool = WORDS.filter((w) => !used.has(w));
    if (pool.length < BOARD_SIZE * 2) {
      used.clear();
      pool = WORDS;
    }
    const words = [];
    for (const w of shuffle(pool)) {
      if (words.some((o) => related(o, w))) continue;
      words.push(w);
      if (words.length === BOARD_SIZE) break;
    }
    for (const w of words) used.add(w);
    return words;
  }

  newGame() {
    this.clearTimer();
    this.gameNo++;
    const [first, second] = [this.startingTeamId, this.otherTeamId(this.startingTeamId)];
    const counts = { [first]: 9, [second]: 8 };
    const key = shuffle([
      ...Array(counts[first]).fill(first),
      ...Array(counts[second]).fill(second),
      ...Array(NEUTRAL).fill('neutral'),
      'assassin',
    ]);
    this.words = this.drawWords();
    this.key = key;
    this.revealed = Array(BOARD_SIZE).fill(null); // teamId, das die Karte aufgedeckt hat (oder 'host')
    this.revealOrder = [];
    this.turnTeamId = first;
    this.turnNo = 0;
    this.history = [];
    this.winnerId = null;
    this.endReason = null;
    this.chooseSpymasters();
    this.startTurn();
  }

  startTurn() {
    this.clearTimer();
    this.turnNo++;
    this.phase = 'clue';
    this.clue = null;
    this.guessesLeft = null;
    this.picks = new Map(); // playerId -> Kartenindex oder 'end'
    this.notice = null;
    this.startTimer(this.settings.clueTimeLimit, () => {
      this.notice = 'Die Zeit für den Hinweis ist abgelaufen. Das andere Team ist dran.';
      this.endTurn(true);
    });
  }

  startTimer(seconds, onTimeout) {
    this.clearTimer();
    // Im ersten Zug jeder Partie dürfen sich beide Teams in Ruhe orientieren
    if (!seconds || (this.settings.firstTurnFree && this.turnNo <= 2)) return;
    this.deadline = Date.now() + seconds * 1000;
    this.timer = setTimeout(() => {
      this.timer = null;
      onTimeout();
      this.lobby.broadcast();
    }, seconds * 1000);
  }

  clearTimer() {
    clearTimeout(this.timer);
    this.timer = null;
    this.deadline = null;
  }

  remaining(teamId) {
    return this.key.filter((k, i) => k === teamId && !this.revealed[i]).length;
  }

  giveClue(player, rawWord, rawCount) {
    if (this.phase !== 'clue') return { error: 'Gerade wird kein Hinweis gegeben.' };
    if (this.spymasters[this.turnTeamId] !== player.id) return { error: 'Nur der Hinweisgeber des Teams am Zug gibt den Hinweis.' };
    const word = cleanWord(rawWord);
    if (!word) return { error: 'Bitte gib ein Wort ein.' };
    if (!/^[\p{L}\p{N}]+$/u.test(word)) return { error: 'Bitte nur ein einzelnes Wort ohne Leer- oder Satzzeichen.' };
    const hidden = this.words.filter((w, i) => !this.revealed[i]);
    const clash = hidden.find((w) => related(word, w));
    if (clash) return { error: `„${word}“ ist zu nah an „${clash}“, das noch auf dem Tisch liegt.` };
    let count = Math.round(Number(rawCount));
    if (!Number.isFinite(count) || count < 0) return { error: 'Bitte wähle eine Zahl.' };
    if (count > 9) count = UNLIMITED;
    this.clue = { word, count };
    this.guessesLeft = count === 0 || count === UNLIMITED ? null : count + 1;
    this.history.push({ teamId: this.turnTeamId, word, count, reveals: [] });
    this.phase = 'guess';
    this.startTimer(this.settings.guessTimeLimit, () => {
      this.notice = 'Die Ratezeit ist abgelaufen.';
      this.endTurn(true);
    });
    return { ok: true };
  }

  // Ermittler schlagen eine Karte (oder „Zug beenden“) vor, bei Mehrheit passiert es
  propose(player, choice) {
    if (this.phase !== 'guess') return { error: 'Gerade wird nicht geraten.' };
    if (player.teamId !== this.turnTeamId || this.roleOf(player) !== 'guesser') return { error: 'Dein Team ist gerade nicht dran.' };
    if (choice !== 'end') {
      const i = Number(choice);
      if (!Number.isInteger(i) || i < 0 || i >= BOARD_SIZE || this.revealed[i]) return { error: 'Diese Karte geht nicht.' };
      choice = i;
    }
    if (this.picks.get(player.id) === choice) this.picks.delete(player.id);
    else this.picks.set(player.id, choice);
    this.settle();
    return { ok: true };
  }

  // Prüft, ob ein Vorschlag genug Stimmen hat
  settle() {
    if (this.phase !== 'guess') return;
    const guessers = this.guessers(this.turnTeamId);
    const ids = new Set(guessers.map((p) => p.id));
    for (const id of this.picks.keys()) if (!ids.has(id)) this.picks.delete(id);
    const needed = this.settings.revealMode === 'first' ? 1 : Math.floor(guessers.length / 2) + 1;
    const votes = new Map();
    for (const choice of this.picks.values()) votes.set(choice, (votes.get(choice) || 0) + 1);
    for (const [choice, n] of votes) {
      if (n < needed) continue;
      if (choice === 'end') this.endTurn();
      else this.reveal(choice);
      return;
    }
  }

  reveal(index, byHost = false) {
    if (this.phase !== 'guess' || this.revealed[index]) return;
    const teamId = this.turnTeamId;
    const color = this.key[index];
    this.revealed[index] = teamId;
    this.revealOrder.push(index);
    this.picks.clear();
    this.history[this.history.length - 1]?.reveals.push({ index, byHost });
    if (color === 'assassin') return this.finish(this.otherTeamId(teamId), 'assassin');
    for (const t of this.teams) if (this.remaining(t.id) === 0) return this.finish(t.id, 'cards');
    if (color !== teamId) {
      this.notice = color === 'neutral' ? `„${this.words[index]}“ war ein Passant.` : `„${this.words[index]}“ gehört dem anderen Team.`;
      return this.endTurn(false, true);
    }
    if (this.guessesLeft !== null) {
      this.guessesLeft--;
      if (this.guessesLeft <= 0) {
        this.notice = 'Alle Versuche verbraucht.';
        this.endTurn(false, true);
      }
    }
  }

  endTurn(timeout = false, keepNotice = false) {
    if (!['clue', 'guess'].includes(this.phase)) return;
    const notice = this.notice;
    this.turnTeamId = this.otherTeamId(this.turnTeamId);
    this.startTurn();
    if (timeout || keepNotice) this.notice = notice;
  }

  finish(winnerId, reason) {
    this.clearTimer();
    this.phase = 'over';
    this.winnerId = winnerId;
    this.endReason = reason;
    this.wins[winnerId] = (this.wins[winnerId] || 0) + 1;
    this.picks = new Map();
  }

  get matchWinnerId() {
    return this.teams.find((t) => (this.wins[t.id] || 0) >= this.settings.winsNeeded)?.id ?? null;
  }

  next() {
    if (this.phase !== 'over') return;
    if (this.matchWinnerId) {
      this.phase = 'final';
      return;
    }
    // Das Startteam wechselt mit jeder Partie
    this.startingTeamId = this.otherTeamId(this.startingTeamId);
    this.newGame();
  }

  setSpymaster(teamId, playerId) {
    const player = this.lobby.players.get(playerId);
    if (!this.teams.some((t) => t.id === teamId) || player?.teamId !== teamId) return { error: 'Dieser Spieler ist nicht in dem Team.' };
    if (!this.canLead(player)) return { error: 'Der Host-Bildschirm kann keine Hinweise geben, sonst sähen alle die Schlüsselkarte.' };
    this.spymasters[teamId] = playerId;
    this.picks.delete(playerId);
    this.settle();
    return { ok: true };
  }

  action(player, { type, ...data }) {
    const host = player.isHost;
    switch (type) {
      case 'clue': return this.giveClue(player, data.word, data.count);
      case 'pick': return this.propose(player, data.index === 'end' ? 'end' : data.index);
      case 'reveal': {
        if (!host) return { error: 'Nur der Host darf das.' };
        const i = Number(data.index);
        if (this.phase !== 'guess' || !Number.isInteger(i) || i < 0 || i >= BOARD_SIZE || this.revealed[i]) return { error: 'Diese Karte geht gerade nicht.' };
        this.reveal(i, true);
        return { ok: true };
      }
      case 'skip':
        if (!host) return { error: 'Nur der Host darf das.' };
        this.notice = 'Der Host hat den Zug beendet.';
        this.endTurn(false, true);
        return { ok: true };
      case 'rejectClue':
        if (!host) return { error: 'Nur der Host darf das.' };
        if (this.phase !== 'guess') return { error: 'Gerade gibt es keinen Hinweis.' };
        if (this.history.at(-1)?.reveals.length) return { error: 'Es wurde schon eine Karte aufgedeckt.' };
        this.history.pop();
        this.turnNo--;
        this.startTurn();
        this.notice = 'Der Host hat den Hinweis zurückgewiesen. Bitte einen neuen geben.';
        return { ok: true };
      case 'setSpymaster':
        if (!host) return { error: 'Nur der Host darf das.' };
        return this.setSpymaster(data.teamId, data.playerId);
      case 'next':
        if (!host) return { error: 'Nur der Host darf das.' };
        this.next();
        return { ok: true };
      default: return { error: 'Unbekannte Aktion.' };
    }
  }

  playersChanged() {
    if (!['clue', 'guess'].includes(this.phase)) return;
    // Wer das Team verlassen hat oder entfernt wurde, ist kein Hinweisgeber mehr.
    // Kurz getrennte Hinweisgeber behalten ihre Rolle, der Host kann sie neu vergeben.
    for (const t of this.teams) {
      const current = this.lobby.players.get(this.spymasters[t.id]);
      if (current && current.teamId === t.id) continue;
      this.spymasters[t.id] = this.members(t.id).find((p) => this.canLead(p))?.id ?? null;
    }
    this.settle();
  }

  view(viewer) {
    const role = this.roleOf(viewer);
    const done = this.phase === 'over' || this.phase === 'final';
    const seesKey = done || role === 'spymaster';
    const picksByCard = new Map();
    for (const [playerId, choice] of this.picks) {
      if (!picksByCard.has(choice)) picksByCard.set(choice, []);
      picksByCard.get(choice).push(playerId);
    }
    const lastIndex = this.revealOrder.at(-1);
    return {
      phase: this.phase,
      gameNo: this.gameNo,
      role,
      myTeamId: role === 'spectator' ? null : viewer.teamId,
      turnTeamId: this.turnTeamId,
      board: this.words.map((word, i) => ({
        word,
        revealed: Boolean(this.revealed[i]),
        color: this.revealed[i] || seesKey ? this.key[i] : null,
        picks: picksByCard.get(i) || [],
        last: i === lastIndex,
      })),
      endPicks: picksByCard.get('end') || [],
      teams: this.teams.map((t) => ({
        id: t.id,
        remaining: this.remaining(t.id),
        total: this.key.filter((k) => k === t.id).length,
        spymasterId: this.spymasters[t.id],
        spymasterOnline: Boolean(this.lobby.players.get(this.spymasters[t.id])?.connected),
        guessers: this.guessers(t.id).map((p) => p.id),
        wins: this.wins[t.id] || 0,
      })),
      clue: this.clue,
      guessesLeft: this.guessesLeft,
      needed: this.phase === 'guess' && this.settings.revealMode === 'majority' ? Math.floor(this.guessers(this.turnTeamId).length / 2) + 1 : 1,
      history: this.history,
      notice: this.notice,
      winnerId: this.winnerId,
      endReason: this.endReason,
      winsNeeded: this.settings.winsNeeded,
      matchWinnerId: done ? this.matchWinnerId : null,
      deadline: this.deadline,
      paused: false,
      serverNow: Date.now(),
    };
  }

  dispose() {
    this.clearTimer();
  }
}

Alias.words = WORDS;
module.exports = Alias;
