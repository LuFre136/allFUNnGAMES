// Lobbys: Spieler, Teams, Einstellungen und Zustandsverteilung an alle Geräte

const { randomToken, randomCode, pick } = require('./util');
const { games } = require('./games');

const TEAM_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#06b6d4', '#e11d48'];
const MAX_TEAMS = 12;
const LOBBY_TTL_MS = 12 * 60 * 60 * 1000;

const lobbies = new Map();
let io = null;

function cleanName(name, fallback) {
  const text = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 24);
  return text || fallback;
}

class Lobby {
  constructor(gameId, hostName, hostAvatar) {
    const Game = games[gameId];
    this.Game = Game;
    this.gameId = gameId;
    do this.code = randomCode(); while (lobbies.has(this.code));
    this.players = new Map(); // id -> Spieler
    this.tokens = new Map(); // token -> id
    this.teams = [];
    this.teamSeq = 0;
    this.phase = 'lobby'; // lobby | playing
    this.game = null;
    this.touched = Date.now();
    // Spiele ohne Teams (z. B. Just One) spielen alle zusammen, bei „optional“ entscheidet der Host
    this.teamSupport = Game.meta().teams;
    if (this.teamSupport !== false) {
      this.addTeam();
      this.addTeam();
    }
    const host = this.addPlayer({ name: cleanName(hostName, 'Host'), avatar: hostAvatar, isHost: true });
    this.hostId = host.id;
    this.settings = {
      lobbyName: `${/[sßxz]$/i.test(host.name) ? `${host.name}’` : `${host.name}s`} ${Game.meta().name}`,
      hostPlays: true,
      game: Game.defaultSettings(),
    };
  }

  // Ob gerade in Teams gespielt wird (bei optionalen Teams über die Einstellung teamMode)
  get usesTeams() {
    if (this.teamSupport === 'optional') return Boolean(this.settings?.game.teamMode);
    return this.teamSupport !== false;
  }

  addTeam(name) {
    if (this.teams.length >= MAX_TEAMS || this.teamSupport === false) return null;
    this.teamSeq++;
    const used = new Set(this.teams.map((t) => t.color));
    const color = TEAM_COLORS.find((c) => !used.has(c)) || TEAM_COLORS[this.teamSeq % TEAM_COLORS.length];
    const team = { id: `t${this.teamSeq}`, name: cleanName(name, `Team ${this.teamSeq}`), color };
    this.teams.push(team);
    return team;
  }

  removeTeam(teamId) {
    if (this.teams.length <= 1) return;
    this.teams = this.teams.filter((t) => t.id !== teamId);
    for (const p of this.players.values()) if (p.teamId === teamId) p.teamId = null;
    this.game?.playersChanged();
  }

  renameTeam(teamId, name) {
    const team = this.teamById(teamId);
    if (team) team.name = cleanName(name, team.name);
  }

  teamById(id) {
    return this.teams.find((t) => t.id === id) || null;
  }

  // „random“ wählt ein Team mit den wenigsten Spielern, damit die Teams gleich groß bleiben
  resolveTeamId(teamId, player = null) {
    if (teamId !== 'random') return this.teamById(teamId) ? teamId : null;
    if (!this.teams.length) return null;
    const sizes = this.teams.map((t) => ({ id: t.id, size: this.playersInTeam(t.id).filter((p) => p !== player).length }));
    const min = Math.min(...sizes.map((t) => t.size));
    return pick(sizes.filter((t) => t.size === min)).id;
  }

  addPlayer({ name, avatar = null, teamId = null, isHost = false }) {
    const player = {
      id: `p${this.players.size + 1}_${randomCode(3)}`,
      token: randomToken(),
      name: cleanName(name, 'Spieler'),
      avatar: typeof avatar === 'string' ? avatar.slice(0, 200) : null,
      teamId: this.resolveTeamId(teamId),
      isHost,
      connected: false,
      socketId: null,
    };
    this.players.set(player.id, player);
    this.tokens.set(player.token, player.id);
    return player;
  }

  updatePlayer(player, { name, avatar, teamId }) {
    if (name !== undefined) player.name = cleanName(name, player.name);
    if (avatar !== undefined) player.avatar = typeof avatar === 'string' ? avatar.slice(0, 200) : null;
    if (teamId !== undefined) {
      player.teamId = this.resolveTeamId(teamId, player);
      this.game?.playersChanged();
    }
  }

  removePlayer(playerId) {
    const p = this.players.get(playerId);
    if (!p || p.isHost) return;
    this.players.delete(playerId);
    this.tokens.delete(p.token);
    if (p.socketId) io.to(p.socketId).emit('kicked');
    this.game?.playersChanged();
  }

  playerByToken(token) {
    return this.players.get(this.tokens.get(token)) || null;
  }

  playersInTeam(teamId) {
    return [...this.players.values()].filter((p) => p.teamId === teamId && (!p.isHost || this.settings.hostPlays));
  }

  // Verbundene Spieler, die mitspielen (ohne reinen Gamemaster)
  activePlayers() {
    return [...this.players.values()].filter((p) => p.connected && (!p.isHost || this.settings.hostPlays));
  }

  setSettings(patch) {
    if (patch.lobbyName !== undefined) this.settings.lobbyName = cleanName(patch.lobbyName, this.settings.lobbyName).slice(0, 40);
    if (patch.hostPlays !== undefined) {
      this.settings.hostPlays = Boolean(patch.hostPlays);
      this.game?.playersChanged();
    }
    if (patch.game) this.settings.game = this.Game.sanitizeSettings(this.settings.game, patch.game);
  }

  start() {
    if (this.usesTeams) {
      const playing = [...this.players.values()].filter((p) => p.teamId && (!p.isHost || this.settings.hostPlays));
      if (!playing.length) return 'Mindestens ein Spieler muss einem Team beitreten.';
    }
    if (this.settings.game.categories && !this.settings.game.categories.length) return 'Bitte wähle mindestens eine Kategorie.';
    this.game?.dispose();
    this.game = new this.Game(this);
    try {
      this.game.start();
    } catch (err) {
      this.game = null;
      return err.message;
    }
    this.phase = 'playing';
    return null;
  }

  backToLobby() {
    this.game?.dispose();
    this.game = null;
    this.phase = 'lobby';
  }

  publicPlayer(p) {
    return { id: p.id, name: p.name, avatar: p.avatar, teamId: p.teamId, isHost: p.isHost, connected: p.connected };
  }

  view(viewer) {
    return {
      code: this.code,
      game: this.Game.meta(),
      phase: this.phase,
      usesTeams: this.usesTeams,
      settings: this.settings,
      availableQuestions: this.Game.availableCount(this.settings.game),
      teams: this.teams,
      players: [...this.players.values()].map((p) => this.publicPlayer(p)),
      me: { ...this.publicPlayer(viewer) },
      round: this.game ? this.game.view(viewer) : null,
    };
  }

  broadcast() {
    this.touched = Date.now();
    for (const p of this.players.values()) {
      if (p.socketId) io.to(p.socketId).emit('state', this.view(p));
    }
  }

  dispose() {
    this.game?.dispose();
  }
}

function create(gameId, hostName, hostAvatar) {
  if (!games[gameId]) return null;
  const lobby = new Lobby(gameId, hostName, hostAvatar);
  lobbies.set(lobby.code, lobby);
  return lobby;
}

function get(code) {
  return lobbies.get(String(code || '').toUpperCase()) || null;
}

function init(socketServer) {
  io = socketServer;
  setInterval(() => {
    const now = Date.now();
    for (const [code, lobby] of lobbies) {
      const anyoneOnline = [...lobby.players.values()].some((p) => p.connected);
      if (!anyoneOnline && now - lobby.touched > LOBBY_TTL_MS) {
        lobby.dispose();
        lobbies.delete(code);
      }
    }
  }, 10 * 60 * 1000).unref();
}

module.exports = { init, create, get };
