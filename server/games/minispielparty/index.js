// Minispiel Party (nach dem Vorbild von Mario Party): viele kurze Minispiele hintereinander.
// Alle spielen gleichzeitig auf dem Handy, der Fernseher ist die Bühne. Nach jedem Minispiel gibt es Punkte.
// Die Minispiele liegen einzeln in ./minigames, dieser Teil steuert Ablauf, Punkte und Sonderpreise.

const { shuffle, pick } = require('../../util');
const minigames = require('./minigames');
const Board = require('./board');

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 12;
const COUNTS = [3, 5, 8, 12, 16];
const SCORINGS = ['behind', 'top3'];
const MODES = ['serie', 'brett', 'team'];
const FORMAT_MIXES = ['ffa', 'mixed', 'many']; // nur jeder gegen jeden, gemischt, viel Team
const SOLO_MIN = 3; // Einer gegen alle ab 3 Spielern
const TEAM_MIN = 4; // Team gegen Team ab 4 Spielern
const TEAMS = [
  { key: 'blau', name: 'Team Blau', icon: '🔵', color: '#3b82f6' },
  { key: 'rot', name: 'Team Rot', icon: '🔴', color: '#ef4444' },
];
const ROUNDS = [5, 10, 15, 20];
const STAR_PRICES = [10, 20, 30];
const DUEL_GAMES = ['schnellzieher', 'stoppuhr', 'farbfolge'];
const DUEL_RESULT_MS = 6000;
const COUNTDOWN = 3500; // 3, 2, 1 vor jedem Minispiel
const READY_TIME = 30000; // so lange wird höchstens auf „Bereit!“ gewartet
const MAX_PLAY = 5 * 60 * 1000; // Notbremse, falls ein Minispiel nicht endet

// Was ein Minispiel kann: jeder gegen jeden (ffa), einer gegen alle (solo), Team gegen Team (teams)
function formatsOf(m) {
  return m.formats || ['ffa'];
}

// Zwei gleich große Teams (bei ungerader Zahl eins mit einem mehr), zufällig gemischt
function splitTeams(ids) {
  const mixed = shuffle(ids);
  return TEAMS.map((t, i) => ({ ...t, ids: mixed.filter((_, k) => k % 2 === i) }));
}

// Punkte für einen Platz (1 = Erster). behind: so viele, wie Spieler hinter einem liegen.
function pointsFor(scoring, place, groupSize, total) {
  if (scoring === 'top3') return [0, 3, 2, 1][place] || 0;
  return Math.max(0, total - (place - 1) - groupSize);
}

class MinispielParty {
  constructor(lobby) {
    this.lobby = lobby;
    this.phase = 'intro'; // intro | play | result | final
    this.playlist = [];
    this.index = 0;
    this.totals = new Map(); // id -> Punkte
    this.history = []; // pro Minispiel: { id, groups, info, extra, double, skipped }
    this.ready = new Set();
    this.deadline = null;
    this.timer = null;
    this.instance = null;
    this.instanceTimers = new Set();
    this.disposers = [];
    this.participants = [];
    this.startAt = 0;
    this.playSeq = 0;
    this.fastest = null; // { id, ms }
    this.bombs = new Map(); // id -> Explosionen
    this.board = null; // Brettmodus
    this.special = null; // { type: 'duel', ids, module } während eines Duells
    this.duelResult = null;
    this.bonus = [];
    this.formats = []; // Spielart pro Minispiel der Playlist
    this.setup = { format: 'ffa' }; // Spielart des laufenden Minispiels: { format, solo?, teams? }
    this.teams = null; // Team-Party: zwei feste Teams
    this.teamScore = [0, 0];
    this.soloWins = new Map();
    this.teamWins = new Map();
  }

  static meta() {
    return {
      id: 'minispielparty',
      name: 'Minispiel Party',
      icon: '🎪',
      description: 'Viele kurze Minispiele hintereinander: tippen, merken, zählen, schütteln. Wer sammelt die meisten Punkte?',
      players: `${MIN_PLAYERS}–${MAX_PLAYERS} Spieler, jeder für sich oder in Teams`,
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      available: true,
      teams: false,
      minigames: minigames.list.map((m) => ({ id: m.id, name: m.name, icon: m.icon, short: m.short, motion: Boolean(m.motion), formats: formatsOf(m) })),
      teamColors: TEAMS,
      countOptions: COUNTS,
      roundOptions: ROUNDS,
      starPrices: STAR_PRICES,
      items: Object.values(Board.ITEMS),
    };
  }

  static defaultSettings() {
    return {
      mode: 'serie',
      formatMix: 'mixed',
      count: 8,
      scoring: 'behind',
      games: minigames.list.map((m) => m.id),
      doubleLast: false,
      tv: true,
      // Brettmodus
      board: 'rummelplatz',
      rounds: 10,
      starPrice: 20,
      bonusStars: false,
      lastDouble: true,
    };
  }

  static sanitizeSettings(current, patch) {
    const next = { ...current };
    if (patch.count !== undefined && COUNTS.includes(Number(patch.count))) next.count = Number(patch.count);
    if (patch.scoring !== undefined && SCORINGS.includes(patch.scoring)) next.scoring = patch.scoring;
    if (Array.isArray(patch.games)) next.games = minigames.list.map((m) => m.id).filter((id) => patch.games.includes(id));
    for (const k of ['doubleLast', 'tv', 'bonusStars', 'lastDouble']) if (patch[k] !== undefined) next[k] = Boolean(patch[k]);
    if (patch.mode !== undefined && MODES.includes(patch.mode)) next.mode = patch.mode;
    if (patch.formatMix !== undefined && FORMAT_MIXES.includes(patch.formatMix)) next.formatMix = patch.formatMix;
    if (patch.rounds !== undefined && ROUNDS.includes(Number(patch.rounds))) next.rounds = Number(patch.rounds);
    if (patch.starPrice !== undefined && STAR_PRICES.includes(Number(patch.starPrice))) next.starPrice = Number(patch.starPrice);
    return next;
  }

  // Ohne Fernseher spielt das Host-Gerät immer mit
  static syncSettings(settings) {
    if (!settings.game.tv) settings.hostPlays = true;
  }

  static availableCount(settings) {
    return settings.games.length;
  }

  get settings() {
    return this.lobby.settings.game;
  }

  players() {
    return this.lobby.activePlayers();
  }

  connected(id) {
    return Boolean(this.lobby.players.get(id)?.connected);
  }

  start() {
    const n = this.players().length;
    if (n < MIN_PLAYERS) throw new Error(`Die Minispiel Party braucht mindestens ${MIN_PLAYERS} Mitspieler.`);
    if (n > MAX_PLAYERS) throw new Error(`Die Minispiel Party geht mit höchstens ${MAX_PLAYERS} Spielern.`);
    if (!this.pool('ffa').length) throw new Error('Bitte wähle mindestens ein Minispiel, bei dem jeder gegen jeden spielt.');
    if (this.teamParty && n < TEAM_MIN) throw new Error(`Die Team-Party braucht mindestens ${TEAM_MIN} Mitspieler.`);
    this.buildPlaylist(this.brett ? this.settings.rounds : this.settings.count, n);
    this.index = 0;
    this.totals = new Map(this.players().map((p) => [p.id, 0]));
    this.history = [];
    this.teamScore = [0, 0];
    this.teams = this.teamParty ? splitTeams(this.players().map((p) => p.id)) : null;
    if (this.brett) {
      this.board = new Board(this.boardHost(), this.settings, this.players().map((p) => p.id));
      this.phase = 'board';
      this.board.startRound();
    } else this.toIntro();
  }

  get brett() {
    return this.settings.mode === 'brett';
  }

  get teamParty() {
    return this.settings.mode === 'team';
  }

  // Schnittstelle für das Brett
  boardHost() {
    return {
      players: () => this.players().map((p) => p.id),
      connected: (id) => this.connected(id),
      name: (id) => this.lobby.players.get(id)?.name || 'Jemand',
      broadcast: () => this.lobby.broadcast(),
      roundDone: () => this.toIntro(),
      startDuel: (a, b) => this.startDuel(a, b),
    };
  }

  // Duell auf dem Brett: kurzes Minispiel nur für zwei
  startDuel(a, b) {
    const pool = DUEL_GAMES.filter((id) => this.settings.games.includes(id));
    const module = minigames.byId[pick(pool.length ? pool : DUEL_GAMES)];
    this.special = { type: 'duel', ids: [a, b], module };
    this.toIntro();
  }

  endDuel(winner = null, loser = null) {
    this.clearTimer();
    this.stopInstance();
    this.special = null;
    this.duelResult = null;
    this.phase = 'board';
    this.board.duelDone(winner, loser);
  }

  // Eingeschaltete Minispiele, die eine Spielart können
  pool(format) {
    return this.settings.games.filter((id) => formatsOf(minigames.byId[id]).includes(format));
  }

  // Spielart pro Platz in der Playlist: gemischt etwa jedes dritte, viel Team jedes zweite Minispiel.
  // Team-Party: jedes zweite ist ein Team-Minispiel, die anderen werden als Team gewertet.
  slotFormat(i, n) {
    if (this.teamParty) return i % 2 === 1 && this.pool('teams').length ? 'teams' : 'ffa';
    const mix = this.settings.formatMix;
    const special = mix === 'many' ? i % 2 === 1 : mix === 'mixed' ? i % 3 === 2 : false;
    if (!special) return 'ffa';
    const options = [];
    if (n >= SOLO_MIN && this.pool('solo').length) options.push('solo');
    if (n >= TEAM_MIN && this.pool('teams').length) options.push('teams');
    return options.length ? pick(options) : 'ffa';
  }

  // Zufällige Reihenfolge, jedes Minispiel erst wieder, wenn alle dran waren, nie zweimal hintereinander
  buildPlaylist(count, n = this.players().length) {
    this.formats = Array.from({ length: count }, (_, i) => this.slotFormat(i, n));
    const bags = {};
    const draw = (format) => {
      if (!bags[format]?.length) bags[format] = shuffle(this.pool(format));
      return bags[format].shift();
    };
    const list = [];
    for (const format of this.formats) {
      let id = draw(format);
      if (id === list[list.length - 1] && bags[format].length) {
        bags[format].push(id);
        id = bags[format].shift();
      }
      list.push(id);
    }
    this.playlist = list;
    return list;
  }

  get current() {
    return this.special?.module || minigames.byId[this.playlist[this.index]];
  }

  get format() {
    return this.special ? 'ffa' : this.setup.format;
  }

  // Spielart für das nächste Minispiel festlegen: wer allein spielt, wer in welchem Team.
  // Reichen die Spieler nicht mehr, wird daraus ein Minispiel für jeden gegen jeden.
  prepareSetup() {
    const ids = this.players().map((p) => p.id);
    let format = this.formats[this.index] || 'ffa';
    if ((format === 'solo' && ids.length < SOLO_MIN) || (format === 'teams' && ids.length < (this.teamParty ? 2 : TEAM_MIN))) {
      format = 'ffa';
      const pool = this.pool('ffa');
      this.playlist[this.index] = pick(pool);
      this.formats[this.index] = 'ffa';
    }
    if (format === 'solo') this.setup = { format, solo: pick(ids) };
    else if (format === 'teams') this.setup = { format, teams: this.teamParty ? this.teamsNow() : splitTeams(ids) };
    else this.setup = { format: 'ffa' };
    if (this.teamParty && format === 'ffa') this.setup.teams = this.teamsNow();
  }

  // Team-Party: feste Teams, wer neu dazukommt, geht ins kleinere Team
  teamsNow() {
    const ids = this.players().map((p) => p.id);
    for (const id of ids) {
      if (this.teams.some((t) => t.ids.includes(id))) continue;
      const small = this.teams[0].ids.filter((x) => this.connected(x)).length <= this.teams[1].ids.filter((x) => this.connected(x)).length ? 0 : 1;
      this.teams[small].ids.push(id);
    }
    return this.teams.map((t) => ({ ...t, ids: t.ids.filter((id) => ids.includes(id)) }));
  }

  // Kurz vor dem Start: Weggegangene raus, Neue rein
  finalizeSetup() {
    const ids = this.participants;
    const s = this.setup;
    if (s.format === 'solo' && !ids.includes(s.solo)) s.solo = pick(ids);
    if (s.teams) {
      s.teams = s.teams.map((t) => ({ ...t, ids: t.ids.filter((id) => ids.includes(id)) }));
      for (const id of ids) {
        if (s.teams.some((t) => t.ids.includes(id))) continue;
        const small = s.teams[0].ids.length <= s.teams[1].ids.length ? 0 : 1;
        s.teams[small].ids.push(id);
        if (this.teams) this.teams[small].ids.push(id);
      }
    }
    if (s.format === 'teams' && s.teams.some((t) => !t.ids.length)) {
      const moved = s.teams.find((t) => t.ids.length > 1);
      const empty = s.teams.find((t) => !t.ids.length);
      if (moved && empty) empty.ids.push(moved.ids.pop());
    }
  }

  get isDouble() {
    return !this.brett && this.settings.doubleLast && this.index === this.playlist.length - 1 && this.playlist.length > 1;
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

  // ---------- Ablauf ----------

  toIntro() {
    this.stopInstance();
    if (!this.special) this.prepareSetup();
    this.phase = 'intro';
    this.ready = new Set();
    this.deadline = Date.now() + READY_TIME;
    this.setTimer(READY_TIME, () => this.toPlay());
  }

  setReady(player) {
    if (this.phase !== 'intro') return { error: 'Es geht schon los.' };
    if (!this.isPlaying(player)) return { error: 'Du spielst nicht mit.' };
    if (this.special && !this.special.ids.includes(player.id)) return { error: 'Bei diesem Duell schaust du zu.' };
    this.ready.add(player.id);
    this.checkReady();
    return { ok: true };
  }

  checkReady() {
    if (this.phase !== 'intro') return;
    const waiting = this.players().filter((p) => !this.ready.has(p.id) && (!this.special || this.special.ids.includes(p.id)));
    if (!waiting.length && this.ready.size) this.toPlay();
  }

  isPlaying(player) {
    return Boolean(player) && this.players().includes(player);
  }

  toPlay() {
    if (this.phase !== 'intro') return;
    this.clearTimer();
    for (const p of this.players()) if (!this.totals.has(p.id)) this.totals.set(p.id, 0);
    this.participants = this.special ? this.special.ids.filter((id) => this.connected(id)) : this.players().map((p) => p.id);
    if (this.special && this.participants.length < 2) {
      this.endDuel();
      return;
    }
    if (!this.participants.length) {
      this.skip();
      return;
    }
    if (!this.special) this.finalizeSetup();
    this.phase = 'play';
    this.deadline = null;
    this.startAt = Date.now() + COUNTDOWN;
    const seq = ++this.playSeq;
    const live = (fn) => (...args) => (seq === this.playSeq && this.phase === 'play' ? fn(...args) : undefined);
    const setup = this.special ? { format: 'ffa' } : this.setup;
    const ctx = {
      ids: [...this.participants],
      format: setup.format === 'solo' || (setup.format === 'teams') ? setup.format : 'ffa',
      solo: setup.format === 'solo' ? setup.solo : null,
      group: setup.format === 'solo' ? this.participants.filter((id) => id !== setup.solo) : null,
      teams: setup.format === 'teams' ? setup.teams.map((t) => [...t.ids]) : null,
      startAt: this.startAt,
      connected: (id) => this.connected(id),
      timer: (at, fn) => {
        const handle = setTimeout(live(() => {
          this.instanceTimers.delete(handle);
          fn();
          this.lobby.broadcast();
        }), Math.max(0, at - Date.now()));
        this.instanceTimers.add(handle);
        return handle;
      },
      clear: (handle) => {
        clearTimeout(handle);
        this.instanceTimers.delete(handle);
      },
      finish: live(() => this.toResult()),
      broadcast: () => this.lobby.broadcast(),
      live: live((payload) => {
        for (const p of this.lobby.players.values()) this.lobby.send(p, 'mp-live', { seq, ...payload });
      }),
      onDispose: (fn) => this.disposers.push(fn),
      stats: {
        fastest: (id, ms) => {
          if (!this.fastest || ms < this.fastest.ms) this.fastest = { id, ms };
        },
        bombed: (id) => this.bombs.set(id, (this.bombs.get(id) || 0) + 1),
      },
    };
    this.instance = this.current.create(ctx);
    this.setTimer(COUNTDOWN + MAX_PLAY, () => this.toResult());
  }

  stopInstance() {
    for (const t of this.instanceTimers) clearTimeout(t);
    this.instanceTimers.clear();
    for (const fn of this.disposers.splice(0)) fn();
    this.instance = null;
  }

  toResult() {
    if (this.phase !== 'play') return;
    this.clearTimer();
    const { groups = [], winner = null, info = null, extra = null } = this.instance.ranking();
    this.stopInstance();
    if (this.special) {
      // Duell: Sieger nur, wenn einer klar vorne liegt
      const [a, b] = this.special.ids;
      const winner = groups.length > 1 && groups[0].ids.length === 1 && !groups[0].none ? groups[0].ids[0] : null;
      this.duelResult = { winner, loser: winner ? (winner === a ? b : a) : null, groups: groups.map((g, i) => ({ ...g, place: i + 1, points: 0 })), info, id: this.special.module.id, stake: Board.DUEL_STAKE };
      this.phase = 'result';
      this.setTimer(DUEL_RESULT_MS, () => this.endDuel(this.duelResult.winner, this.duelResult.loser));
      return;
    }
    const mult = this.isDouble ? 2 : 1;
    const format = this.setup.format;
    const result = format === 'ffa' ? this.scoreFfa(groups, mult) : this.scoreSpecial(format, winner, mult);
    for (const g of result.groups) for (const id of g.ids) this.totals.set(id, (this.totals.get(id) || 0) + g.points);
    let coins = null;
    if (this.board) coins = format === 'ffa' ? this.board.minigameCoins(result.groups) : this.board.specialCoins(result.coins, result.winners);
    let teamWin;
    if (this.teamParty) {
      teamWin = format === 'teams' ? (winner ?? null) : this.teamOfFfa(result.groups);
      if (teamWin !== null) this.teamScore[teamWin] += mult;
    }
    this.history.push({
      id: this.current.id, format, setup: this.setup, winner: result.winner, tie: result.tie, teamWin,
      groups: result.groups, info, extra, double: mult > 1, skipped: false, coins,
    });
    this.phase = 'result';
  }

  scoreFfa(groups, mult) {
    const total = this.participants.length;
    let before = 0;
    const scored = groups.map((g) => {
      const place = before + 1;
      before += g.ids.length;
      const points = g.none ? 0 : pointsFor(this.settings.scoring, place, g.ids.length, total) * mult;
      return { ...g, place, points };
    });
    return { groups: scored, winner: null, tie: false };
  }

  // Einer gegen alle und Team gegen Team: es gibt nur Sieger und Verlierer.
  // winner: 'solo' | 'group' | Teamnummer | null (unentschieden)
  scoreSpecial(format, winner, mult) {
    const top3 = this.settings.scoring === 'top3';
    const s = this.setup;
    let sides;
    if (format === 'solo') {
      const group = this.participants.filter((id) => id !== s.solo);
      sides = [
        { key: 'solo', ids: [s.solo], label: '🎯 allein', win: top3 ? 3 : group.length, coinsWin: 5 * group.length, coinsLose: 0 },
        { key: 'group', ids: group, label: '👥 die Gruppe', win: top3 ? 3 : 1, coinsWin: 5, coinsLose: -3 },
      ];
    } else {
      sides = s.teams.map((t, i) => ({ key: i, ids: t.ids, label: `${t.icon} ${t.name}`, team: i, win: top3 ? 3 : s.teams[1 - i].ids.length, coinsWin: 10, coinsLose: 0 }));
    }
    const won = sides.find((x) => x.key === winner);
    const order = won ? [won, ...sides.filter((x) => x !== won)] : sides;
    const groups = order.map((x) => ({
      ids: x.ids,
      label: x.label,
      team: x.team,
      place: !won || x === won ? 1 : 2,
      points: x === won ? x.win * mult : 0,
    }));
    const coins = order.flatMap((x) => x.ids.map((id) => ({ id, coins: won ? (x === won ? x.coinsWin : x.coinsLose) * mult : 0 })));
    if (won) {
      const map = format === 'solo' ? this.soloWins : this.teamWins;
      if (format === 'teams' || won.key === 'solo') for (const id of won.ids) map.set(id, (map.get(id) || 0) + 1);
    }
    return { groups, coins, winners: won ? won.ids : [], winner: won ? won.key : null, tie: !won };
  }

  // Team-Party bei jeder gegen jeden: das Team mit mehr Punkten pro Kopf gewinnt das Minispiel
  teamOfFfa(groups) {
    const teams = this.setup.teams;
    if (!teams) return null;
    const per = new Map(groups.flatMap((g) => g.ids.map((id) => [id, g.points])));
    const avg = teams.map((t) => {
      const ids = t.ids.filter((id) => per.has(id));
      return ids.length ? ids.reduce((sum, id) => sum + per.get(id), 0) / ids.length : 0;
    });
    if (Math.abs(avg[0] - avg[1]) < 1e-9) return null;
    return avg[0] > avg[1] ? 0 : 1;
  }

  // Host: Minispiel auslassen, keine Punkte
  skip() {
    if (this.special && ['intro', 'play', 'result'].includes(this.phase)) {
      this.endDuel();
      return;
    }
    if (!['intro', 'play'].includes(this.phase)) return;
    this.clearTimer();
    this.stopInstance();
    this.history.push({ id: this.current.id, format: this.setup.format, groups: [], info: null, extra: null, double: false, skipped: true });
    this.phase = 'result';
    this.next();
  }

  next() {
    if (this.phase === 'intro') this.toPlay();
    else if (this.phase === 'play') this.toResult();
    else if (this.phase === 'result') {
      if (this.special) {
        this.endDuel(this.duelResult?.winner, this.duelResult?.loser);
        return;
      }
      if (this.index + 1 >= this.playlist.length) {
        this.clearTimer();
        if (this.board) this.bonus = this.board.bonusStars();
        this.phase = 'final';
        return;
      }
      this.index++;
      if (this.board) {
        this.phase = 'board';
        this.board.nextRound();
      } else this.toIntro();
    }
  }

  action(player, { type, ...data }) {
    if (['next', 'skip'].includes(type)) {
      if (!player.isHost) return { error: 'Nur der Host darf das.' };
      if (type === 'next') this.next();
      else this.skip();
      return { ok: true };
    }
    if (type === 'ready') return this.setReady(player);
    if (['roll', 'useItem', 'choose', 'force'].includes(type)) {
      if (this.phase !== 'board' || !this.board) return { error: 'Gerade ist niemand am Brett dran.' };
      return this.board.action(player, { type, ...data });
    }
    if (this.phase !== 'play' || !this.instance) return { error: 'Gerade läuft kein Minispiel.' };
    return this.instance.action(player, data.move || {}) || { ok: true };
  }

  // Schnelle Eingaben (Pumpen, Verschieben) und Uhrabgleich, ohne alle Geräte neu zu zeichnen
  draw(player, data) {
    if (data.op === 'ping') return { t: Date.now() };
    if (this.phase !== 'play' || !this.instance?.draw) return { ok: true };
    return this.instance.draw(player, data) || { ok: true };
  }

  playersChanged() {
    if (this.phase === 'intro') this.checkReady();
    if (this.phase === 'play') this.instance?.playersChanged?.();
    if (this.phase === 'board') this.board?.playersChanged();
  }

  // ---------- Wertung ----------

  standings() {
    if (this.board) return this.board.standings();
    const list = [...this.totals].map(([id, points]) => ({ id, points })).sort((a, b) => b.points - a.points);
    let place = 0;
    return list.map((e, i) => {
      if (i === 0 || e.points !== list[i - 1].points) place = i + 1;
      return { ...e, place };
    });
  }

  awards() {
    const wins = new Map();
    const lasts = new Map();
    for (const h of this.history) {
      if (h.skipped || h.groups.length < 2 || h.tie) continue;
      for (const id of h.groups[0].ids) wins.set(id, (wins.get(id) || 0) + 1);
      if (h.format && h.format !== 'ffa') continue;
      const last = h.groups[h.groups.length - 1];
      for (const id of last.ids) lasts.set(id, (lasts.get(id) || 0) + 1);
    }
    const top = (map) => {
      const max = Math.max(0, ...map.values());
      return max ? { ids: [...map].filter(([, n]) => n === max).map(([id]) => id), n: max } : null;
    };
    const bombs = top(this.bombs);
    return {
      wins: top(wins),
      lasts: top(lasts),
      fastest: this.fastest,
      bombs,
      solo: top(this.soloWins),
      team: top(this.teamWins),
    };
  }

  // ---------- Ansicht ----------

  publicGame(m) {
    return m ? { id: m.id, name: m.name, icon: m.icon, short: m.short, howto: m.howto, motion: Boolean(m.motion) } : null;
  }

  view(viewer) {
    const view = {
      phase: this.phase,
      index: this.index,
      total: this.playlist.length,
      current: this.publicGame(this.current),
      next: this.publicGame(minigames.byId[this.playlist[this.index + 1]]),
      double: this.isDouble,
      scoring: this.settings.scoring,
      tv: this.settings.tv,
      mode: this.board ? 'brett' : this.teamParty ? 'team' : 'serie',
      format: this.format,
      nextFormat: this.formats[this.index + 1] || 'ffa',
      standings: this.standings(),
      playing: this.isPlaying(viewer),
      serverNow: Date.now(),
      deadline: this.phase === 'intro' ? this.deadline : null,
    };
    if (this.board) view.board = this.board.view(viewer);
    if (this.special) view.duel = { ids: this.special.ids, stake: Board.DUEL_STAKE };
    else if (['intro', 'play'].includes(this.phase)) view.setup = this.setup;
    if (this.teamParty) view.teamParty = { teams: this.teamsView(), score: this.teamScore };
    if (this.phase === 'intro') view.ready = [...this.ready];
    if (this.phase === 'play') {
      view.playId = this.playSeq;
      view.startAt = this.startAt;
      view.participants = this.participants;
      view.inGame = this.participants.includes(viewer.id);
      view.game = this.instance ? this.instance.view(viewer) : null;
    }
    if (this.phase === 'result' && this.special && this.duelResult) {
      const d = this.duelResult;
      view.last = { ...d, duel: true, game: this.publicGame(minigames.byId[d.id]) };
    } else if (['result', 'final'].includes(this.phase)) {
      const h = this.history[this.history.length - 1];
      view.last = h && { ...h, game: this.publicGame(minigames.byId[h.id]) };
      view.lastOne = this.index + 1 >= this.playlist.length;
    }
    if (this.phase === 'final') {
      view.history = this.history.map((h) => ({ id: h.id, format: h.format, skipped: h.skipped, tie: h.tie, teamWin: h.teamWin, winners: h.tie ? [] : h.groups[0]?.ids || [], double: h.double }));
      view.awards = this.awards();
      view.bonus = this.bonus;
    }
    return view;
  }

  teamsView() {
    return this.teams.map((t) => ({ ...t, ids: t.ids.filter((id) => this.lobby.players.has(id)) }));
  }

  dispose() {
    this.clearTimer();
    this.stopInstance();
    this.board?.dispose();
  }
}

MinispielParty.pointsFor = pointsFor;
MinispielParty.TEAMS = TEAMS;

module.exports = MinispielParty;
