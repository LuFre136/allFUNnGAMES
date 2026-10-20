// all Fun n Games – Webserver mit Echtzeit-Lobbys

const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');

const lobbies = require('./lobbies');
const gameRegistry = require('./games');
const spotify = require('./spotify');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const AVATAR_DIR = path.join(PUBLIC_DIR, 'avatars');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
lobbies.init(io);

app.use(express.static(PUBLIC_DIR));

app.get(['/lobby/:code', '/join/:code'], (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'lobby.html'));
});

app.get('/api/games', (req, res) => res.json(gameRegistry.list()));

// Alle Bilder im Ordner public/avatars stehen als Profilbild zur Auswahl
app.get('/api/avatars', (req, res) => {
  const files = fs.existsSync(AVATAR_DIR) ? fs.readdirSync(AVATAR_DIR) : [];
  res.json(files.filter((f) => /\.(png|jpe?g|gif|webp|svg)$/i.test(f)).sort().map((f) => `/avatars/${encodeURIComponent(f)}`));
});

app.get('/api/qr', async (req, res) => {
  const text = String(req.query.text || '').slice(0, 500);
  if (!text) return res.status(400).end();
  const svg = await QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  res.type('image/svg+xml').send(svg);
});

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

// Liefert die Adresse für Einladungslinks. Wird die Seite über localhost geöffnet,
// nutzen wir die Netzwerkadresse, damit Handys im gleichen WLAN beitreten können.
app.get('/api/server-info', (req, res) => {
  const ip = lanAddresses()[0];
  res.json({
    publicUrl: process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || null,
    lanUrl: ip ? `http://${ip}:${PORT}` : null,
    spotify: spotify.state,
  });
});

io.on('connection', (socket) => {
  const ctx = () => {
    const lobby = lobbies.get(socket.data.code);
    const player = lobby?.players.get(socket.data.playerId);
    return { lobby, player };
  };

  const attach = (lobby, player) => {
    if (player.socketId && player.socketId !== socket.id) {
      io.to(player.socketId).emit('replaced');
    }
    socket.data.code = lobby.code;
    socket.data.playerId = player.id;
    player.socketId = socket.id;
    player.connected = true;
    lobby.game?.playersChanged();
    lobby.broadcast();
  };

  socket.on('lobby:create', ({ gameId, hostName } = {}, ack) => {
    const lobby = lobbies.create(gameId, hostName);
    if (!lobby) return ack?.({ error: 'Unbekanntes Spiel.' });
    const host = lobby.players.get(lobby.hostId);
    ack?.({ code: lobby.code, token: host.token });
  });

  // Erneut verbinden (Token bekannt) oder Lobby-Infos für das Beitrittsformular holen
  socket.on('lobby:join', ({ code, token } = {}, ack) => {
    const lobby = lobbies.get(code);
    if (!lobby) return ack?.({ error: 'Diese Lobby gibt es nicht (mehr).' });
    const player = token ? lobby.playerByToken(token) : null;
    if (player) {
      attach(lobby, player);
      return ack?.({ ok: true });
    }
    ack?.({
      needsProfile: true,
      lobby: {
        code: lobby.code,
        name: lobby.settings.lobbyName,
        game: lobby.Game.meta().name,
        teams: lobby.teams.map((t) => ({ ...t, members: lobby.playersInTeam(t.id).map((p) => lobby.publicPlayer(p)) })),
      },
    });
  });

  socket.on('player:register', ({ code, name, avatar, teamId } = {}, ack) => {
    const lobby = lobbies.get(code);
    if (!lobby) return ack?.({ error: 'Diese Lobby gibt es nicht (mehr).' });
    if (lobby.players.size >= 60) return ack?.({ error: 'Die Lobby ist voll.' });
    const player = lobby.addPlayer({ name, avatar, teamId });
    attach(lobby, player);
    ack?.({ ok: true, token: player.token });
  });

  socket.on('player:update', (patch = {}) => {
    const { lobby, player } = ctx();
    if (!player) return;
    lobby.updatePlayer(player, patch);
    lobby.broadcast();
  });

  socket.on('vote', (value, ack) => {
    const { lobby, player } = ctx();
    if (!player || !lobby.game) return ack?.({ error: 'Kein laufendes Spiel.' });
    const result = lobby.game.vote(player, value);
    lobby.broadcast();
    ack?.(result);
  });

  // Alle Host-Aktionen laufen über ein Ereignis
  socket.on('host', ({ action, ...data } = {}, ack) => {
    const { lobby, player } = ctx();
    if (!player?.isHost) return ack?.({ error: 'Nur der Host darf das.' });
    let error = null;
    switch (action) {
      case 'settings': lobby.setSettings(data); break;
      case 'team:add': lobby.addTeam(data.name); break;
      case 'team:remove': lobby.removeTeam(data.teamId); break;
      case 'team:rename': lobby.renameTeam(data.teamId, data.name); break;
      case 'player:move': {
        const target = lobby.players.get(data.playerId);
        if (target) lobby.updatePlayer(target, { teamId: data.teamId });
        break;
      }
      case 'player:kick': lobby.removePlayer(data.playerId); break;
      case 'start': error = lobby.start(); break;
      case 'reveal': lobby.game?.reveal(); break;
      case 'judge': lobby.game?.judge(data.teamId, data.part, data.value); break;
      case 'next': lobby.game?.next(); break;
      case 'lobby': lobby.backToLobby(); break;
      default: error = 'Unbekannte Aktion.';
    }
    lobby.broadcast();
    ack?.(error ? { error } : { ok: true });
  });

  socket.on('disconnect', () => {
    const { lobby, player } = ctx();
    if (!player || player.socketId !== socket.id) return;
    player.connected = false;
    player.socketId = null;
    lobby.game?.playersChanged();
    lobby.broadcast();
  });
});

server.listen(PORT, () => {
  console.log(`all Fun n Games läuft auf http://localhost:${PORT}`);
  for (const ip of lanAddresses()) console.log(`  im Netzwerk: http://${ip}:${PORT}`);
  const questions = JSON.parse(fs.readFileSync(path.join(__dirname, 'games', 'pubquiz', 'questions.json'), 'utf8')).questions;
  spotify.resolveAll(questions).then((s) => {
    if (s.enabled) console.log(`Spotify: ${s.resolved} Songs gefunden${s.error ? `, Fehler: ${s.error}` : ''}`);
  });
});
