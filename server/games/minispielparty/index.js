// Minispiel Party (nach dem Vorbild von Mario Party): viele kurze Minispiele hintereinander.
// Alle spielen gleichzeitig auf dem Handy, der Fernseher ist die Bühne. Nach jedem Minispiel gibt es Punkte.
// Die Minispiele liegen einzeln in ./minigames, dieser Teil steuert Ablauf, Punkte und Sonderpreise.

const { shuffle } = require('../../util');
const minigames = require('./minigames');

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 12;
const COUNTS = [3, 5, 8, 12, 16];
const SCORINGS = ['behind', 'top3'];
const COUNTDOWN = 3500; // 3, 2, 1 vor jedem Minispiel
const READY_TIME = 30000; // so lange wird höchstens auf „Bereit!“ gewartet
const MAX_PLAY = 5 * 60 * 1000; // Notbremse, falls ein Minispiel nicht endet

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
  }

  static meta() {
    return {
      id: 'minispielparty',
      name: 'Minispiel Party',
      icon: '🎪',
      description: 'Viele kurze Minispiele hintereinander: tippen, merken, zählen, schütteln. Wer sammelt die meisten Punkte?',
      players: `${MIN_PLAYERS}–${MAX_PLAYERS} Spieler, jeder für sich`,
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      available: true,
      teams: false,
      minigames: minigames.list.map((m) => ({ id: m.id, name: m.name, icon: m.icon, short: m.short, motion: Boolean(m.motion) })),
      countOptions: COUNTS,
    };
  }

  static defaultSettings() {
    return { count: 8, scoring: 'behind', games: minigames.list.map((m) => m.id), doubleLast: false, tv: true };
  }

  static sanitizeSettings(current, patch) {
    const next = { ...current };
    if (patch.count !== undefined && COUNTS.includes(Number(patch.count))) next.count = Number(patch.count);
    if (patch.scoring !== undefined && SCORINGS.includes(patch.scoring)) next.scoring = patch.scoring;
    if (Array.isArray(patch.games)) next.games = minigames.list.map((m) => m.id).filter((id) => patch.games.includes(id));
    for (const k of ['doubleLast', 'tv']) if (patch[k] !== undefined) next[k] = Boolean(patch[k]);
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
    if (!this.settings.games.length) throw new Error('Bitte wähle mindestens ein Minispiel.');
    this.playlist = this.buildPlaylist();
    this.index = 0;
    this.totals = new Map(this.players().map((p) => [p.id, 0]));
    this.history = [];
    this.toIntro();
  }

  // Zufällige Reihenfolge, jedes Minispiel erst wieder, wenn alle dran waren, nie zweimal hintereinander
  buildPlaylist() {
    const ids = this.settings.games;
    const list = [];
    while (list.length < this.settings.count) {
      let round = shuffle(ids);
      if (round.length > 1 && round[0] === list[list.length - 1]) round = [...round.slice(1), round[0]];
      list.push(...round);
    }
    return list.slice(0, this.settings.count);
  }

  get current() {
    return minigames.byId[this.playlist[this.index]];
  }

  get isDouble() {
    return this.settings.doubleLast && this.index === this.playlist.length - 1 && this.playlist.length > 1;
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
    this.phase = 'intro';
    this.ready = new Set();
    this.deadline = Date.now() + READY_TIME;
    this.setTimer(READY_TIME, () => this.toPlay());
  }

  setReady(player) {
    if (this.phase !== 'intro') return { error: 'Es geht schon los.' };
    if (!this.isPlaying(player)) return { error: 'Du spielst nicht mit.' };
    this.ready.add(player.id);
    this.checkReady();
    return { ok: true };
  }

  checkReady() {
    if (this.phase !== 'intro') return;
    const waiting = this.players().filter((p) => !this.ready.has(p.id));
    if (!waiting.length && this.ready.size) this.toPlay();
  }

  isPlaying(player) {
    return Boolean(player) && this.players().includes(player);
  }

  toPlay() {
    if (this.phase !== 'intro') return;
    this.clearTimer();
    for (const p of this.players()) if (!this.totals.has(p.id)) this.totals.set(p.id, 0);
    this.participants = this.players().map((p) => p.id);
    if (!this.participants.length) {
      this.skip();
      return;
    }
    this.phase = 'play';
    this.deadline = null;
    this.startAt = Date.now() + COUNTDOWN;
    const seq = ++this.playSeq;
    const live = (fn) => (...args) => (seq === this.playSeq && this.phase === 'play' ? fn(...args) : undefined);
    const ctx = {
      ids: [...this.participants],
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
    const { groups, info = null, extra = null } = this.instance.ranking();
    this.stopInstance();
    const total = this.participants.length;
    const mult = this.isDouble ? 2 : 1;
    let before = 0;
    const scored = groups.map((g) => {
      const place = before + 1;
      before += g.ids.length;
      const points = g.none ? 0 : pointsFor(this.settings.scoring, place, g.ids.length, total) * mult;
      for (const id of g.ids) this.totals.set(id, (this.totals.get(id) || 0) + points);
      return { ...g, place, points };
    });
    this.history.push({ id: this.current.id, groups: scored, info, extra, double: mult > 1, skipped: false });
    this.phase = 'result';
  }

  // Host: Minispiel auslassen, keine Punkte
  skip() {
    if (!['intro', 'play'].includes(this.phase)) return;
    this.clearTimer();
    this.stopInstance();
    this.history.push({ id: this.current.id, groups: [], info: null, extra: null, double: false, skipped: true });
    this.phase = 'result';
    this.next();
  }

  next() {
    if (this.phase === 'intro') this.toPlay();
    else if (this.phase === 'play') this.toResult();
    else if (this.phase === 'result') {
      if (this.index + 1 >= this.playlist.length) {
        this.phase = 'final';
        return;
      }
      this.index++;
      this.toIntro();
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
  }

  // ---------- Wertung ----------

  standings() {
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
      if (h.skipped || h.groups.length < 2) continue;
      for (const id of h.groups[0].ids) wins.set(id, (wins.get(id) || 0) + 1);
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
      standings: this.standings(),
      playing: this.isPlaying(viewer),
      serverNow: Date.now(),
      deadline: this.phase === 'intro' ? this.deadline : null,
    };
    if (this.phase === 'intro') view.ready = [...this.ready];
    if (this.phase === 'play') {
      view.playId = this.playSeq;
      view.startAt = this.startAt;
      view.participants = this.participants;
      view.inGame = this.participants.includes(viewer.id);
      view.game = this.instance ? this.instance.view(viewer) : null;
    }
    if (['result', 'final'].includes(this.phase)) {
      const h = this.history[this.history.length - 1];
      view.last = h && { ...h, game: this.publicGame(minigames.byId[h.id]) };
      view.lastOne = this.index + 1 >= this.playlist.length;
    }
    if (this.phase === 'final') {
      view.history = this.history.map((h) => ({ id: h.id, skipped: h.skipped, winners: h.groups[0]?.ids || [], double: h.double }));
      view.awards = this.awards();
    }
    return view;
  }

  dispose() {
    this.clearTimer();
    this.stopInstance();
  }
}

MinispielParty.pointsFor = pointsFor;

module.exports = MinispielParty;
