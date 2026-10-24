// Tests für die Song-Vorschau im Pub Quiz: node --test

const test = require('node:test');
const assert = require('node:assert');
const lobbies = require('../server/lobbies');

lobbies.init({ to: () => ({ emit() {} }) });

function quizWithTypes(types) {
  const lobby = lobbies.create('pubquiz', 'Lukas');
  lobby.players.get(lobby.hostId).connected = true;
  const guest = lobby.addPlayer({ name: 'Gast', teamId: 'random' });
  guest.connected = true;
  Object.assign(lobby.settings.game, { types, questionCount: 3, timeLimit: 0, musicTimeLimit: 0 });
  const quiz = new lobby.Game(lobby);
  quiz.start();
  return { lobby, quiz, host: lobby.players.get(lobby.hostId), guest };
}

test('Musikfragen bekommen für den Host eine Vorschau-Adresse', () => {
  const { lobby, quiz, host, guest } = quizWithTypes(['music-title', 'music-year']);
  assert.strictEqual(quiz.view(host).question.previewUrl, `/api/song-preview/${lobby.code}?n=0`);
  assert.strictEqual(quiz.view(guest).question.previewUrl, undefined);
  assert.strictEqual(quiz.currentSong(), quiz.question);
  quiz.clearTimers();
});

test('andere Fragen haben keinen Song', () => {
  const { quiz } = quizWithTypes(['choice']);
  assert.strictEqual(quiz.currentSong(), null);
  quiz.clearTimers();
});
