// Tests für den Spielwechsel in derselben Lobby: node --test

const test = require('node:test');
const assert = require('node:assert');
const lobbies = require('../server/lobbies');

lobbies.init({ to: () => ({ emit() {} }) });

function lobbyWith(gameId, extra) {
  const lobby = lobbies.create(gameId, 'Lukas');
  lobby.players.get(lobby.hostId).connected = true;
  const players = [];
  for (let i = 0; i < extra; i++) {
    const p = lobby.addPlayer({ name: `Spieler ${i + 1}`, teamId: lobby.teams.length ? 'random' : null });
    p.connected = true;
    players.push(p);
  }
  return { lobby, players };
}

const option = (lobby, id) => lobby.gameOptions().find((o) => o.id === id);

test('zu volle Spiele sind gesperrt, der Code bleibt beim Wechsel gleich', () => {
  const { lobby } = lobbyWith('pubquiz', 10); // 11 Spieler mit Host
  assert.equal(option(lobby, 'kreuzquer').fits, false);
  assert.equal(option(lobby, 'kreuzquer').reason, 'Höchstens 8 Spieler, ihr seid 11.');
  assert.match(lobby.switchGame('kreuzquer'), /Höchstens 8/);
  assert.equal(lobby.gameId, 'pubquiz');

  const code = lobby.code;
  assert.equal(lobby.switchGame('wuerfelbecher'), 'Höchstens 10 Spieler, ihr seid 11.');
  assert.equal(lobby.switchGame('justone'), null);
  assert.equal(lobby.code, code);
  assert.equal(lobby.gameId, 'justone');
  assert.equal(lobby.phase, 'lobby');
  assert.equal(lobby.players.size, 11);
  assert.equal(lobby.settings.lobbyName, 'Lukas’ Just One');
  assert.deepEqual(lobby.settings.game, lobby.Game.defaultSettings());
});

test('zu wenige Spieler sperren nicht', () => {
  const { lobby } = lobbyWith('karaoke', 0);
  assert.equal(option(lobby, 'alias').fits, true);
  assert.equal(lobby.switchGame('alias'), null);
});

test('getrennte Spieler und ein zuschauender Host zählen nicht', () => {
  const { lobby, players } = lobbyWith('pubquiz', 9); // 10 mit Host
  assert.equal(option(lobby, 'wuerfelbecher').fits, true);
  players[0].connected = false;
  lobby.settings.hostPlays = false;
  assert.equal(lobby.playerCountFor(lobby.Game), 8);
  assert.equal(option(lobby, 'kreuzquer').fits, true);
});

test('eigener Lobbyname bleibt erhalten', () => {
  const { lobby } = lobbyWith('pubquiz', 2);
  lobby.setSettings({ lobbyName: 'Spieleabend' });
  lobby.switchGame('justone');
  assert.equal(lobby.settings.lobbyName, 'Spieleabend');
});

test('Wechsel zu einem Teamspiel legt Teams an und verteilt alle', () => {
  const { lobby } = lobbyWith('justone', 5);
  assert.equal(lobby.teams.length, 0);
  lobby.switchGame('pubquiz');
  assert.equal(lobby.teams.length, 2);
  const sizes = lobby.teams.map((t) => lobby.playersInTeam(t.id).length).sort();
  assert.deepEqual(sizes, [3, 3]);
  assert.equal(lobby.start(), null);
  lobby.backToLobby();
});

test('Alias löst überzählige Teams auf und verteilt deren Spieler', () => {
  const { lobby } = lobbyWith('pubquiz', 8);
  lobby.addTeam();
  for (const p of [...lobby.players.values()].slice(0, 3)) lobby.updatePlayer(p, { teamId: lobby.teams[2].id });
  lobby.switchGame('alias');
  assert.equal(lobby.teams.length, 2);
  assert.ok([...lobby.players.values()].every((p) => lobby.teamById(p.teamId)));
});

test('Gäste am selben Gerät bleiben nur bei Spielen mit geteiltem Gerät', () => {
  const { lobby, players } = lobbyWith('drkroko', 2);
  lobby.addGuest(players[0], { name: 'Oma' });
  lobby.addGuest(players[0], { name: 'Opa' });
  assert.equal(option(lobby, 'kreuzquer').fits, true); // Gäste zählen dort nicht mit
  lobby.switchGame('wuerfelbecher');
  assert.equal(lobby.players.size, 5);
  lobby.switchGame('justone');
  assert.equal(lobby.players.size, 3);
  assert.equal(lobby.guestsOf(players[0].id).length, 0);
});

test('Wechsel nach Spielende beendet das alte Spiel', () => {
  const { lobby } = lobbyWith('kreuzquer', 2);
  assert.equal(lobby.start(), null);
  assert.equal(lobby.phase, 'playing');
  lobby.switchGame('wuerfelbecher');
  assert.equal(lobby.phase, 'lobby');
  assert.equal(lobby.game, null);
  assert.equal(lobby.start(), null);
  lobby.backToLobby();
});
