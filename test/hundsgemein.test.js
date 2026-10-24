// Regeltests für Hundsgemein: node --test

const test = require('node:test');
const assert = require('node:assert');
const Rules = require('../public/js/hundsgemein-rules');
const Hundsgemein = require('../server/games/hundsgemein');

// Brett mit 4 Plätzen; place setzt Murmeln: { m00: 5 } auf Feld 5, { m01: 'g2' } ins Ziel, { m02: '*0' } frisch aufs Startfeld
function board(place = {}, seats = 4, teams = 2) {
  const state = Rules.newBoard(seats, teams);
  for (const [id, where] of Object.entries(place)) {
    const m = Rules.marble(state, id);
    if (typeof where === 'number') Object.assign(m, { area: 'track', pos: where, fresh: false });
    else if (where[0] === 'g') Object.assign(m, { area: 'goal', pos: Number(where.slice(1)) });
    else Object.assign(m, { area: 'track', pos: Number(where.slice(1)), fresh: true });
  }
  return state;
}

const keys = (moves) => moves.map((m) => `${m.type}:${m.marble}:${m.steps ?? ''}:${m.goal ? 'Z' : ''}:${m.target ?? ''}`).sort();

test('Kartenstapel: 110 Karten, je 8 von Ass bis König und 6 Joker', () => {
  const deck = Rules.buildDeck();
  assert.strictEqual(deck.length, 110);
  for (const rank of Rules.RANKS) assert.strictEqual(deck.filter((c) => c.rank === rank).length, 8);
  assert.strictEqual(deck.filter((c) => c.rank === 'JK').length, 6);
  assert.strictEqual(new Set(deck.map((c) => c.id)).size, 110);
});

test('Ass und König holen eine Murmel aus dem Zwinger, sonst geht am Anfang nichts', () => {
  const s = board();
  assert.deepStrictEqual(keys(Rules.legalMoves(s, 0, 'A')), ['exit:m00:::']);
  assert.deepStrictEqual(keys(Rules.legalMoves(s, 0, 'K')), ['exit:m00:::']);
  for (const rank of ['2', '3', '4', '5', '6', '8', '9', '10', 'Q', 'J']) assert.strictEqual(Rules.legalMoves(s, 0, rank).length, 0, rank);
  assert.strictEqual(Rules.playable(s, 0, '7'), false);
  assert.strictEqual(Rules.playable(s, 0, 'JK'), true);
  Rules.applyMove(s, Rules.legalMoves(s, 0, 'A')[0]);
  const m = Rules.marble(s, 'm00');
  assert.deepStrictEqual([m.area, m.pos, m.fresh], ['track', 0, true]);
  assert.strictEqual(Rules.legalMoves(s, 0, 'A').filter((x) => x.type === 'exit').length, 0, 'eigenes Startfeld ist gesperrt');
});

test('Frische Murmel auf dem Startfeld sperrt für alle, auch für den Buben', () => {
  const s = board({ m10: '*16', m00: 13 });
  assert.strictEqual(Rules.legalMoves(s, 0, '2').length, 1, 'bis vor das Startfeld geht');
  assert.strictEqual(Rules.legalMoves(s, 0, '3').length, 0, 'darauf landen geht nicht');
  assert.strictEqual(Rules.legalMoves(s, 0, '5').length, 0, 'überholen geht nicht');
  assert.strictEqual(Rules.legalMoves(s, 0, 'J').length, 0, 'tauschen geht nicht');
  // Nach dem Weiterziehen ist sie nicht mehr geschützt
  Rules.applyMove(s, Rules.legalMoves(s, 1, '2')[0]);
  assert.strictEqual(Rules.marble(s, 'm10').fresh, false);
  assert.strictEqual(Rules.legalMoves(s, 0, '5').length, 1);
});

test('Wer landet, schlägt; die geschlagene Murmel kommt in ihren Zwinger', () => {
  const s = board({ m00: 4, m10: 9 });
  const res = Rules.applyMove(s, Rules.legalMoves(s, 0, '5')[0]);
  assert.deepStrictEqual(res.beaten, ['m10']);
  assert.strictEqual(Rules.marble(s, 'm10').area, 'kennel');
  assert.strictEqual(Rules.marble(s, 'm00').pos, 9);
});

test('Ins Ziel nur vorwärts über das eigene Startfeld, genau passend und ohne Überspringen', () => {
  const s = board({ m00: 62 });
  // 62 → 63 → 0 (Start) → Ziel 0..3: mit 3 auf Ziel 0 oder weiter auf der Bahn
  assert.deepStrictEqual(keys(Rules.legalMoves(s, 0, '3')), ['move:m00:3::', 'move:m00:3:Z:']);
  Rules.applyMove(s, Rules.legalMoves(s, 0, '6').find((m) => m.goal));
  assert.deepStrictEqual([Rules.marble(s, 'm00').area, Rules.marble(s, 'm00').pos], ['goal', 3]);
  // Eine Murmel im Ziel blockiert die dahinter
  const t = board({ m00: 'g1', m01: 63 });
  assert.ok(Rules.legalMoves(t, 0, '2').some((m) => m.marble === 'm01' && m.goal), 'Ziel 0 ist frei');
  assert.ok(!Rules.legalMoves(t, 0, '3').some((m) => m.marble === 'm01' && m.goal), 'über Ziel 1 springen geht nicht');
  assert.ok(Rules.legalMoves(t, 0, '2').some((m) => m.marble === 'm00'), 'im Ziel weiterziehen geht');
  assert.ok(!Rules.legalMoves(t, 0, '3').some((m) => m.marble === 'm00'), 'nicht über das Ziel hinaus');
});

test('Frisch aus dem Zwinger geht es nicht direkt ins Ziel, mit der 4 rückwärts aber schon bald', () => {
  const s = board({ m00: '*0' });
  assert.ok(!Rules.legalMoves(s, 0, '2').some((m) => m.goal));
  Rules.applyMove(s, Rules.legalMoves(s, 0, '4').find((m) => m.steps === -4));
  assert.strictEqual(Rules.marble(s, 'm00').pos, 60);
  assert.ok(Rules.legalMoves(s, 0, '5').some((m) => m.goal), 'von 60 mit 5 ins Ziel');
  assert.ok(!Rules.legalMoves(s, 0, '4').some((m) => m.steps === -4 && m.goal), 'rückwärts nie ins Ziel');
});

test('Bube tauscht nur Murmeln auf der Bahn mit fremden Murmeln', () => {
  const s = board({ m00: 5, m01: 7, m10: 20, m20: 'g0' });
  assert.deepStrictEqual(keys(Rules.legalMoves(s, 0, 'J')), ['swap:m00:::m10', 'swap:m01:::m10']);
  const res = Rules.applyMove(s, { rank: 'J', type: 'swap', marble: 'm00', target: 'm10' });
  assert.deepStrictEqual(res.beaten, []);
  assert.strictEqual(Rules.marble(s, 'm00').pos, 20);
  assert.strictEqual(Rules.marble(s, 'm10').pos, 5);
});

test('Die 7 lässt sich aufteilen und schlägt jede überholte Murmel', () => {
  const s = board({ m00: 2, m01: 30, m10: 4, m20: 6 });
  const steps = [...Array(5)].map(() => ({ marble: 'm00' })).concat([{ marble: 'm01' }, { marble: 'm01' }]);
  const res = Rules.applySeven(s, 0, steps);
  assert.ok(res);
  assert.deepStrictEqual(res.beaten.sort(), ['m10', 'm20']);
  assert.strictEqual(Rules.marble(s, 'm00').pos, 7);
  assert.strictEqual(Rules.marble(s, 'm01').pos, 32);
  // Weniger als 7 Schritte oder versperrte Wege sind nicht erlaubt
  assert.strictEqual(Rules.applySeven(board({ m00: 2 }), 0, steps.slice(0, 6)), null);
  const blocked = board({ m00: 12, m10: '*16' });
  assert.strictEqual(Rules.playable(blocked, 0, '7'), false);
});

test('Wer fertig ist, spielt für den Partner, auch mitten in der 7', () => {
  const s = board({ m00: 'g3', m01: 'g2', m02: 'g1', m03: 63, m20: 40 });
  const steps = [{ marble: 'm03' }, { marble: 'm03', goal: true }, ...[...Array(5)].map(() => ({ marble: 'm20' }))];
  assert.ok(Rules.applySeven(s, 0, steps));
  assert.strictEqual(Rules.marble(s, 'm20').pos, 45);
  assert.deepStrictEqual(Rules.moverSeats(s, 0), [2]);
  assert.ok(Rules.legalMoves(s, 0, 'A').some((m) => m.type === 'exit' && m.marble === 'm21'));
});

// ---------- Spielablauf ----------

function fakeLobby(n, teams, game = {}) {
  const players = new Map();
  const lobbyTeams = [...Array(teams)].map((_, i) => ({ id: `t${i + 1}`, name: `Team ${i + 1}`, color: '#fff' }));
  for (let i = 1; i <= n; i++) players.set(`p${i}`, { id: `p${i}`, name: `Spieler ${i}`, connected: true, isHost: false, teamId: lobbyTeams[(i - 1) % teams].id });
  return {
    players,
    teams: lobbyTeams,
    settings: { hostPlays: false, game: { ...Hundsgemein.defaultSettings(), ...game } },
    activePlayers: () => [...players.values()].filter((p) => p.connected),
    broadcast() {},
  };
}

test('Start nur mit 4 oder 6 Spielern in gleich großen Teams; Teams wechseln sich am Brett ab', () => {
  assert.throws(() => new Hundsgemein(fakeLobby(5, 2)).start(), /4 oder 6/);
  assert.throws(() => new Hundsgemein(fakeLobby(4, 3)).start(), /gleich großen/);
  for (const [n, t] of [[4, 2], [6, 3], [6, 2]]) {
    const lobby = fakeLobby(n, t);
    const g = new Hundsgemein(lobby);
    g.start();
    assert.strictEqual(g.board.teams, t);
    g.seats.forEach((s, i) => assert.strictEqual(s.teamId, `t${(i % t) + 1}`, `${n}/${t} Platz ${i}`));
    assert.ok(g.hands.every((h) => h.length === 6));
    assert.strictEqual(g.phase, 'exchange');
  }
});

test('Kartentausch geht an den nächsten Partner im Uhrzeigersinn', () => {
  const lobby = fakeLobby(6, 2);
  const g = new Hundsgemein(lobby);
  g.start();
  const gift = g.hands.map((h) => h[0]);
  g.seats.forEach((s, i) => assert.deepStrictEqual(g.action(lobby.players.get(s.playerId), { type: 'give', cardId: gift[i].id }), { ok: true }));
  assert.strictEqual(g.phase, 'play');
  for (let i = 0; i < 6; i++) {
    assert.ok(g.hands[(i + 2) % 6].includes(gift[i]), `Platz ${i} gibt an ${(i + 2) % 6}`);
    assert.strictEqual(g.hands[i].length, 6);
  }
});

test('Zufallspartien enden mit einem Siegerteam, ohne dass Karten oder Murmeln verloren gehen', () => {
  for (const [n, t] of [[4, 2], [6, 3], [6, 2], [4, 2], [6, 3]]) {
    const lobby = fakeLobby(n, t);
    const g = new Hundsgemein(lobby);
    g.start();
    let guard = 0;
    while (g.phase !== 'final' && guard++ < 20000) {
      g.autoPlay();
      const cards = g.deck.length + g.discard.length + g.hands.reduce((a, h) => a + h.length, 0);
      assert.strictEqual(cards, 110);
      assert.strictEqual(g.board.marbles.length, n * 4);
      const fields = g.board.marbles.filter((m) => m.area !== 'kennel').map((m) => `${m.area}${m.area === 'goal' ? m.seat : ''}:${m.pos}`);
      assert.strictEqual(new Set(fields).size, fields.length, 'nie zwei Murmeln auf einem Feld');
    }
    assert.strictEqual(g.phase, 'final', `${n}/${t} endet`);
    assert.ok(Rules.teamFinished(g.board, g.winnerTeam));
  }
});

test('Nur wer dran ist, spielt; abwerfen nur ohne spielbare Karte', () => {
  const lobby = fakeLobby(4, 2, { exchange: false });
  const g = new Hundsgemein(lobby);
  g.start();
  const seat = g.turnSeat;
  const player = lobby.players.get(g.seats[seat].playerId);
  const other = lobby.players.get(g.seats[(seat + 1) % 4].playerId);
  assert.ok(g.action(other, { type: 'discard' }).error);
  g.hands[seat] = [{ id: 'x1', rank: '5' }, { id: 'x2', rank: 'A' }];
  assert.ok(g.action(player, { type: 'discard' }).error, 'Ass ist spielbar');
  assert.ok(g.action(player, { type: 'play', cardId: 'x1', move: { type: 'move', marble: `m${seat}0`, steps: 5 } }).error);
  assert.deepStrictEqual(g.action(player, { type: 'play', cardId: 'x2', move: { type: 'exit', marble: `m${seat}0` } }), { ok: true });
  assert.strictEqual(g.turnSeat, (seat + 1) % 4);
  g.hands[g.turnSeat] = [{ id: 'x3', rank: '5' }];
  assert.deepStrictEqual(g.action(other, { type: 'discard' }), { ok: true });
  assert.ok(g.out.has((seat + 1) % 4));
});
