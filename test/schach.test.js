// Regeltests für Schach: node --test

const test = require('node:test');
const assert = require('node:assert');
const Schach = require('../server/games/schach');

const { Rules } = Schach;

function setup(game = {}, n = 2) {
  const players = new Map();
  for (let i = 1; i <= n; i++) players.set(`p${i}`, { id: `p${i}`, name: `Spieler ${i}`, connected: true, isHost: i === 1 });
  const lobby = {
    hostId: 'p1',
    players,
    settings: { hostPlays: true, game: { ...Schach.defaultSettings(), ...game } },
    activePlayers: () => [...players.values()].filter((p) => p.connected),
    broadcast() {},
  };
  const g = new Schach(lobby);
  return { lobby, g, p: (i) => players.get(`p${i}`) };
}

// Feste Sitzordnung: p1 sitzt in der ersten Partie auf dem ersten Platz (Weiß bzw. Rot)
function started(game = {}, n = 2) {
  const ctx = setup(game, n);
  ctx.g.start();
  ctx.g.ids = [...ctx.lobby.players.keys()];
  ctx.g.gameNo = 0;
  ctx.g.startGame();
  ctx.sq = (name) => sq(ctx.g.state, name);
  ctx.go = (i, from, to, promo) => assert.deepStrictEqual(ctx.g.action(ctx.p(i), { type: 'move', from: ctx.sq(from), to: ctx.sq(to), promo }), { ok: true });
  return ctx;
}

function sq(s, name) {
  return (Number(name.slice(1)) - 1) * s.n + Rules.FILES.indexOf(name[0]);
}

function clone(s) {
  return structuredClone(s);
}

function perft(s, depth) {
  const moves = Rules.legalMoves(s);
  if (depth === 1) return moves.length;
  let total = 0;
  for (const m of moves) {
    const c = clone(s);
    Rules.apply(c, m);
    c.result = null;
    if (c.turn !== null) total += perft(c, depth - 1);
  }
  return total;
}

// Stellung aus FEN (nur klassisch)
function fen(text) {
  const s = Rules.create();
  s.board.fill(null);
  const [pos, turn, castle, ep] = text.split(' ');
  pos.split('/').forEach((row, i) => {
    let x = 0;
    for (const c of row) {
      if (/\d/.test(c)) { x += Number(c); continue; }
      s.board[(7 - i) * 8 + x] = { o: c === c.toUpperCase() ? 0 : 2, t: c.toLowerCase(), m: true };
      x++;
    }
  });
  const fresh = (i) => { if (s.board[i]) s.board[i].m = false; };
  if (castle.includes('K')) { fresh(4); fresh(7); }
  if (castle.includes('Q')) { fresh(4); fresh(0); }
  if (castle.includes('k')) { fresh(60); fresh(63); }
  if (castle.includes('q')) { fresh(60); fresh(56); }
  s.board.forEach((p, i) => { if (p?.t === 'p' && ((p.o === 0 && i >> 3 === 1) || (p.o === 2 && i >> 3 === 6))) p.m = false; });
  s.turn = turn === 'w' ? 0 : 2;
  if (ep && ep !== '-') {
    const at = sq(s, ep);
    s.ep = { at, cap: at + (s.turn === 0 ? -8 : 8) };
  }
  s.positions = new Map();
  return s;
}

test('Zugzahlen (Perft) stimmen mit bekannten Werten überein', () => {
  assert.strictEqual(perft(Rules.create(), 3), 8902);
  // „Kiwipete“: Rochaden, en passant, Fesselungen
  assert.strictEqual(perft(fen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq -'), 2), 2039);
  assert.strictEqual(perft(fen('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - -'), 3), 2812);
  // Umwandlungen und Rochade unter Druck
  assert.strictEqual(perft(fen('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq -'), 2), 264);
});

test('Spieleranzahl: 2 bis 4', () => {
  assert.throws(() => setup({}, 1).g.start(), /mindestens 2/);
  assert.throws(() => setup({}, 5).g.start(), /höchstens 4/);
  for (const n of [2, 3, 4]) assert.doesNotThrow(() => setup({}, n).g.start());
  const { g } = setup({}, 3);
  g.start();
  assert.strictEqual(g.mode, 'ffa');
  assert.strictEqual(g.state.n, 14);
  assert.deepStrictEqual(g.state.seats, [0, 1, 2]);
  const four = setup({ fourMode: 'teams' }, 4);
  four.g.start();
  assert.strictEqual(four.g.mode, 'teams');
  const three = setup({ fourMode: 'teams' }, 3);
  three.g.start();
  assert.strictEqual(three.g.mode, 'ffa', 'Teams gibt es nur zu viert');
});

test('Schäfermatt beendet die Partie, Weiß bekommt den Punkt', () => {
  const { g, go, p } = started();
  assert.ok(g.action(p(2), { type: 'move', from: 52, to: 36 }).error, 'Schwarz ist nicht dran');
  go(1, 'e2', 'e4');
  go(2, 'e7', 'e5');
  go(1, 'f1', 'c4');
  go(2, 'b8', 'c6');
  go(1, 'd1', 'h5');
  go(2, 'g8', 'f6');
  go(1, 'h5', 'f7');
  assert.strictEqual(g.phase, 'final', 'eine Partie ist die ganze Serie');
  assert.strictEqual(g.result.reason, 'mate');
  assert.deepStrictEqual(g.result.winnerIds, ['p1']);
  assert.strictEqual(g.score.p1, 1);
  assert.strictEqual(g.score.p2, 0);
  assert.strictEqual(g.history.at(-2).note, 'Dh5×f7#');
  assert.strictEqual(g.stats.p1.mates, 1);
});

test('Rochade, en passant und Umwandlung mit Auswahl', () => {
  const s = fen('r3k2r/1P6/8/3pP3/8/8/8/R3K2R w KQkq d6');
  const moves = Rules.legalMoves(s);
  assert.ok(moves.some((m) => m.castle === 'short' && m.to === sq(s, 'g1')));
  assert.ok(moves.some((m) => m.castle === 'long' && m.to === sq(s, 'c1')));
  assert.ok(moves.some((m) => m.ep && m.to === sq(s, 'd6')));
  const ep = clone(s);
  Rules.apply(ep, { from: sq(s, 'e5'), to: sq(s, 'd6') });
  assert.strictEqual(ep.board[sq(s, 'd5')], null, 'der geschlagene Bauer ist weg');
  const castle = clone(s);
  Rules.apply(castle, { from: sq(s, 'e1'), to: sq(s, 'g1') });
  assert.strictEqual(castle.board[sq(s, 'f1')].t, 'r');
  assert.strictEqual(castle.board[sq(s, 'h1')], null);
  // Die Rochade geht nicht durch ein angegriffenes Feld
  const blocked = fen('4k3/8/8/8/8/8/5r2/R3K2R w KQ -');
  assert.ok(!Rules.legalMoves(blocked).some((m) => m.castle === 'short'));
  const promo = Rules.legalMoves(s).filter((m) => m.from === sq(s, 'b7') && m.to === sq(s, 'b8'));
  assert.deepStrictEqual(promo.map((m) => m.promo).sort(), ['b', 'n', 'q', 'r']);

  // Über die Spielaktion muss die Figur gewählt werden
  const { g, p } = started();
  g.state = clone(s);
  g.legal = Rules.legalMoves(g.state);
  assert.match(g.action(p(1), { type: 'move', from: sq(s, 'b7'), to: sq(s, 'a8') }).error, /verwandeln/);
  assert.deepStrictEqual(g.action(p(1), { type: 'move', from: sq(s, 'b7'), to: sq(s, 'a8'), promo: 'n' }), { ok: true });
  assert.strictEqual(g.state.board[sq(s, 'a8')].t, 'n');
});

test('Remis: Patt, zu wenig Material, dreimal dieselbe Stellung', () => {
  const patt = fen('k7/8/2Q5/8/8/8/8/7K w - -');
  Rules.apply(patt, { from: sq(patt, 'c6'), to: sq(patt, 'b6') });
  assert.deepStrictEqual([patt.result.draw, patt.result.reason], [true, 'stalemate']);
  assert.deepStrictEqual(patt.result.places, { 0: 1.5, 2: 1.5 });

  const bare = fen('k7/8/8/8/8/8/1q6/K7 w - -');
  Rules.apply(bare, { from: sq(bare, 'a1'), to: sq(bare, 'b2') });
  assert.strictEqual(bare.result.reason, 'material');

  const { g, go } = started({ games: 3 });
  for (let i = 0; i < 2; i++) {
    go(1, 'g1', 'f3');
    go(2, 'g8', 'f6');
    go(1, 'f3', 'g1');
    go(2, 'f6', 'g8');
  }
  assert.strictEqual(g.result.reason, 'repetition');
  assert.strictEqual(g.phase, 'gameEnd');
  assert.strictEqual(g.score.p1, 0.5);
  // Nächste Partie: die Farben wechseln
  g.next();
  assert.strictEqual(g.idAt[0], 'p2');
  assert.strictEqual(g.idAt[2], 'p1');
});

test('Kreuzbrett: Aufstellung, Zugfolge im Uhrzeigersinn, Bauern wandeln auf der 8. Reihe', () => {
  const s = Rules.create({ mode: 'ffa' });
  assert.strictEqual(s.board.filter(Boolean).length, 64);
  // Ecken gibt es nicht
  assert.ok(!Rules.valid(s, 0, 0) && !Rules.valid(s, 2, 2) && !Rules.valid(s, 13, 11));
  assert.ok(Rules.valid(s, 3, 0) && Rules.valid(s, 0, 3));
  // Könige: Rot h1, Blau a7, Gelb g14, Grün n8
  const kings = [0, 1, 2, 3].map((seat) => Rules.label(s, Rules.kingOf(s, seat)));
  assert.deepStrictEqual(kings, ['h1', 'a7', 'g14', 'n8']);
  for (const seat of [0, 1, 2, 3]) {
    assert.strictEqual(Rules.legalMoves(s, seat).length, 20, `Platz ${seat}`);
  }
  assert.strictEqual(s.turn, 0);
  Rules.apply(s, { from: sq(s, 'e2'), to: sq(s, 'e4') });
  assert.strictEqual(s.turn, 1);
  Rules.apply(s, { from: sq(s, 'b5'), to: sq(s, 'd5') });
  assert.strictEqual(s.turn, 2);
  // Rotbauer auf der 7. Reihe zieht auf die 8. und wird umgewandelt
  const t = Rules.create({ mode: 'ffa' });
  t.board[sq(t, 'e2')] = null;
  t.board[sq(t, 'e7')] = { o: 0, t: 'p', m: true };
  const promo = Rules.legalMoves(t).filter((m) => m.from === sq(t, 'e7'));
  assert.deepStrictEqual(promo.map((m) => m.promo).sort(), ['b', 'n', 'q', 'r']);
});

test('Kreuzbrett: Rochade für jede Farbe', () => {
  for (const seat of [0, 1, 2, 3]) {
    const s = Rules.create({ mode: 'ffa' });
    // Alles zwischen König und Türmen räumen
    for (let i = 0; i < s.board.length; i++) {
      const p = s.board[i];
      if (p && p.o === seat && !['k', 'r', 'p'].includes(p.t)) s.board[i] = null;
    }
    s.turn = seat;
    const castles = Rules.legalMoves(s).filter((m) => m.castle).map((m) => m.castle).sort();
    assert.deepStrictEqual(castles, ['long', 'short'], `Platz ${seat}`);
    const short = Rules.legalMoves(s).find((m) => m.castle === 'short');
    Rules.apply(s, short);
    const k = Rules.kingOf(s, seat);
    assert.strictEqual(s.board[short.rookTo].t, 'r');
    assert.ok(Math.abs((k % 14) - (short.from % 14)) + Math.abs(Math.floor(k / 14) - Math.floor(short.from / 14)) === 2);
  }
});

test('Jeder gegen jeden: Aufgeben lässt graue Figuren zurück, der Letzte gewinnt, Punkte nach Platz', () => {
  const { g, p } = started({}, 4);
  assert.strictEqual(g.mode, 'ffa');
  assert.strictEqual(g.idAt[0], 'p1');
  assert.strictEqual(g.idAt[1], 'p2');
  // Blau gibt außer der Reihe auf: Rot bleibt dran
  assert.deepStrictEqual(g.action(p(2), { type: 'resign' }), { ok: true });
  assert.strictEqual(g.state.turn, 0);
  assert.strictEqual(g.state.alive[1], false);
  // Graue Figuren geben kein Schach und dürfen geschlagen werden
  assert.ok(!Rules.enemies(g.state, 0).includes(1));
  const s = g.state;
  s.board[sq(s, 'd2')] = null;
  const own = Rules.legalMoves(s).filter((m) => m.from === sq(s, 'd1'));
  assert.ok(own.length > 0);
  // Gelb ist dran nach Rot (Blau wird übersprungen)
  g.action(p(1), { type: 'move', from: sq(s, 'e2'), to: sq(s, 'e3') });
  assert.strictEqual(g.state.turn, 2);
  assert.deepStrictEqual(g.action(p(3), { type: 'resign' }), { ok: true });
  assert.strictEqual(g.state.turn, 3, 'Grün ist dran');
  assert.deepStrictEqual(g.action(p(4), { type: 'resign' }), { ok: true });
  assert.strictEqual(g.phase, 'final');
  assert.deepStrictEqual(g.result.winnerIds, ['p1']);
  assert.deepStrictEqual(g.result.points, { p1: 3, p2: 0, p3: 1, p4: 2 });
});

test('Jeder gegen jeden: Matt scheidet aus, die anderen spielen weiter', () => {
  const s = Rules.create({ mode: 'ffa' });
  s.board.fill(null);
  const put = (name, o, t) => { s.board[sq(s, name)] = { o, t, m: true }; };
  // Blau (König a7) wird von Rot mattgesetzt: Türme auf b- und c-Linie
  put('a7', 1, 'k');
  put('h1', 0, 'k');
  put('g14', 2, 'k');
  put('n8', 3, 'k');
  put('b4', 0, 'r');
  put('c11', 0, 'r');
  s.turn = 0;
  s.positions = new Map();
  Rules.apply(s, { from: sq(s, 'c11'), to: sq(s, 'a11') });
  // a-Linie von a4 bis a11 deckt der Turm, b-Linie der andere: Blau hat keinen Zug
  assert.strictEqual(s.alive[1], false);
  assert.deepStrictEqual(s.out, [{ seat: 1, reason: 'mate' }]);
  assert.strictEqual(s.turn, 2, 'Gelb ist dran');
  assert.strictEqual(s.result, null);
});

test('Zwei gegen zwei: Partner schlagen sich nicht, das erste Matt entscheidet', () => {
  const s = Rules.create({ mode: 'teams' });
  assert.ok(Rules.partner(s, 0, 2) && Rules.partner(s, 1, 3) && !Rules.partner(s, 0, 1));
  s.board.fill(null);
  const put = (name, o, t) => { s.board[sq(s, name)] = { o, t, m: true }; };
  put('h1', 0, 'k');
  put('h3', 2, 'p'); // Gelber Bauer vor dem roten König: Rot darf ihn nicht schlagen
  put('g2', 0, 'r');
  s.turn = 0;
  put('a7', 1, 'k');
  put('g14', 2, 'k');
  put('n8', 3, 'k');
  assert.ok(!Rules.legalMoves(s).some((m) => m.to === sq(s, 'h3')));
  // Rot setzt Blau matt: damit gewinnen Rot und Gelb zusammen
  put('b4', 0, 'r');
  put('c11', 0, 'r');
  s.board[sq(s, 'h3')] = null;
  s.positions = new Map();
  Rules.apply(s, { from: sq(s, 'c11'), to: sq(s, 'a11') });
  assert.deepStrictEqual(s.result.winners, [0, 2]);
  assert.strictEqual(s.result.reason, 'mate');

  const { g, p } = started({ fourMode: 'teams' }, 4);
  assert.strictEqual(g.mode, 'teams');
  // Partner sitzen gegenüber und bleiben es in jeder Partie
  const team = (id) => g.seatOf[id] % 2;
  const before = [team('p1') === team('p3'), team('p2') === team('p4')];
  g.action(p(1), { type: 'resign' });
  assert.strictEqual(g.phase, 'final');
  assert.deepStrictEqual(g.result.winnerIds.sort(), ['p2', 'p4']);
  assert.deepStrictEqual(g.result.points, { p1: 0, p2: 1, p3: 0, p4: 1 });
  assert.deepStrictEqual(before, [true, true]);
});

test('Bedenkzeit: wer die Uhr ablaufen lässt, verliert', () => {
  const { g, p } = started({ clock: 3 });
  assert.strictEqual(g.clocks[0], 3 * 60 * 1000);
  g.turnStart -= 3 * 60 * 1000 + 10;
  g.charge();
  g.flag(0);
  assert.strictEqual(g.result.reason, 'time');
  assert.deepStrictEqual(g.result.winnerIds, ['p2']);
  g.dispose();
  // Kann der Gegner nicht mehr mattsetzen, ist es Remis
  const ctx = started({ clock: 3 });
  const s = ctx.g.state;
  for (let i = 0; i < s.board.length; i++) if (s.board[i]?.o === 2 && s.board[i].t !== 'k') s.board[i] = null;
  ctx.g.flag(0);
  assert.strictEqual(ctx.g.result.reason, 'timeMaterial');
  assert.ok(ctx.g.result.draw);
  ctx.g.dispose();
  assert.ok(p(1));
});

test('Geteiltes Gerät: der Gastgeber zieht für seine Gäste, Ansicht nennt den Spieler', () => {
  const { g, lobby, p } = started({}, 2);
  lobby.players.get('p2').guestOf = 'p1';
  assert.deepStrictEqual(g.action(p(1), { type: 'move', from: 12, to: 28 }), { ok: true });
  assert.deepStrictEqual(g.action(p(1), { type: 'move', from: 52, to: 36 }), { ok: true });
  const v = g.view(p(1));
  assert.ok(v.mine);
  assert.strictEqual(v.turnId, 'p1');
  assert.ok(v.seats.every((s) => s.mine));
  assert.ok(v.legal.length > 0);
  assert.strictEqual(g.view(p(2)).legal.length > 0, false, 'der Gast selbst hat kein Gerät');
});

test('Host kann einen Zufallszug auslösen und Remis werten', () => {
  const { g, p } = started({ games: 0 }, 3);
  assert.ok(g.action(p(2), { type: 'force' }).error);
  assert.deepStrictEqual(g.action(p(1), { type: 'force' }), { ok: true });
  assert.strictEqual(g.state.turn, 1);
  assert.deepStrictEqual(g.action(p(1), { type: 'draw' }), { ok: true });
  assert.strictEqual(g.phase, 'gameEnd');
  assert.deepStrictEqual(g.result.points, { p1: 1, p2: 1, p3: 1 });
  g.next();
  assert.strictEqual(g.gameNo, 2);
  assert.strictEqual(g.idAt[0], 'p3', 'jeder rückt einen Platz weiter');
  assert.deepStrictEqual(g.action(p(1), { type: 'finish' }), { ok: true });
  assert.strictEqual(g.phase, 'final');
});
