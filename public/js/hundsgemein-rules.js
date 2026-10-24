// Hundsgemein (nach Brändi Dog): Brett und Zugregeln. Läuft auf dem Server (Prüfung der Züge) und im Browser
// (Zugauswahl und Vorschau auf dem Handy), deshalb ohne Abhängigkeiten.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HgRules = factory();
}(typeof self !== 'undefined' ? self : this, () => {
  const FIELDS = 16; // Felder pro Spieler auf der Rundbahn
  const GOAL = 4;
  const MARBLES = 4;
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const JOKER = 'JK';
  const JOKER_AS = ['A', 'K', 'Q', 'J', '7', '4', '2', '3', '5', '6', '8', '9', '10'];

  // Was eine Karte kann: Zahlen sind Schritte vorwärts, „exit“ holt eine Murmel aus dem Zwinger
  const VALUES = {
    A: [1, 11, 'exit'],
    K: [13, 'exit'],
    Q: [12],
    J: ['swap'],
    4: [4, -4],
  };

  function cardValues(rank) {
    return VALUES[rank] || [Number(rank)];
  }

  // 110 Karten: je 8 × Ass bis König und 6 Joker
  function buildDeck() {
    const cards = [];
    for (const rank of RANKS) for (let i = 0; i < 8; i++) cards.push({ id: `c${cards.length}`, rank });
    for (let i = 0; i < 6; i++) cards.push({ id: `c${cards.length}`, rank: JOKER });
    return cards;
  }

  // seats: Anzahl Plätze am Brett (4 oder 6), teams: Anzahl Teams (Platz s gehört zu Team s % teams)
  function newBoard(seats, teams) {
    const marbles = [];
    for (let s = 0; s < seats; s++) {
      for (let k = 0; k < MARBLES; k++) marbles.push({ id: `m${s}${k}`, seat: s, area: 'kennel', pos: k, fresh: false });
    }
    return { seats, teams, marbles };
  }

  function clone(state) {
    return { ...state, marbles: state.marbles.map((m) => ({ ...m })) };
  }

  const trackLength = (state) => state.seats * FIELDS;
  const startOf = (seat) => seat * FIELDS;
  const marble = (state, id) => state.marbles.find((m) => m.id === id) || null;
  const onTrack = (state, pos) => state.marbles.find((m) => m.area === 'track' && m.pos === pos) || null;
  const inGoal = (state, seat, pos) => state.marbles.find((m) => m.area === 'goal' && m.seat === seat && m.pos === pos) || null;
  const finished = (state, seat) => state.marbles.every((m) => m.seat !== seat || m.area === 'goal');

  function teammates(state, seat) {
    const list = [];
    for (let s = 0; s < state.seats; s++) if (s % state.teams === seat % state.teams) list.push(s);
    return list;
  }

  // Wer alle Murmeln im Ziel hat, zieht mit den Murmeln seiner Partner
  function moverSeats(state, seat) {
    if (!finished(state, seat)) return [seat];
    return teammates(state, seat).filter((s) => s !== seat && !finished(state, s));
  }

  function movers(state, seat) {
    const seats = moverSeats(state, seat);
    return state.marbles.filter((m) => seats.includes(m.seat));
  }

  function teamFinished(state, seat) {
    return teammates(state, seat).every((s) => finished(state, s));
  }

  // Ein Schritt vorwärts (dir 1) oder rückwärts (dir -1). goal: auf dem eigenen Startfeld ins Ziel abbiegen.
  // Murmeln, die frisch aus dem Zwinger auf ihrem Startfeld stehen, sperren das Feld für alle.
  function step(state, m, dir, goal) {
    const L = trackLength(state);
    if (m.area === 'goal') {
      if (dir < 0 || m.pos + 1 >= GOAL || inGoal(state, m.seat, m.pos + 1)) return null;
      return { area: 'goal', pos: m.pos + 1 };
    }
    if (m.area !== 'track') return null;
    if (dir > 0 && goal && m.pos === startOf(m.seat) && !m.fresh) {
      return inGoal(state, m.seat, 0) ? null : { area: 'goal', pos: 0 };
    }
    const next = (m.pos + dir + L) % L;
    const there = onTrack(state, next);
    if (there && there.fresh) return null;
    return { area: 'track', pos: next };
  }

  // Weg einer Murmel über mehrere Schritte (ohne zu schlagen), null wenn er versperrt ist
  function walk(state, m, steps, goal) {
    const cur = { ...m };
    const path = [];
    for (let i = 0; i < Math.abs(steps); i++) {
      const next = step(state, cur, Math.sign(steps), goal);
      if (!next) return null;
      Object.assign(cur, next, { fresh: false });
      path.push(next);
    }
    return path;
  }

  function moveKey(move) {
    return [move.rank, move.type, move.marble, move.steps ?? '', move.goal ? 1 : 0, move.target ?? ''].join('|');
  }

  // Alle erlaubten Züge mit einer Karte (rank) außer der 7. Für den Joker wird rank gewählt.
  function legalMoves(state, seat, rank) {
    if (rank === '7' || rank === JOKER) return [];
    const own = movers(state, seat);
    const moves = [];
    const add = (move) => moves.push({ rank, ...move });
    for (const value of cardValues(rank)) {
      if (value === 'exit') {
        // Pro Platz reicht eine Murmel aus dem Zwinger, sie sind gleichwertig
        for (const s of moverSeats(state, seat)) {
          const m = own.find((x) => x.seat === s && x.area === 'kennel');
          const there = onTrack(state, startOf(s));
          if (m && !(there && there.fresh)) add({ type: 'exit', marble: m.id });
        }
      } else if (value === 'swap') {
        for (const m of own) {
          if (m.area !== 'track' || m.fresh) continue;
          for (const o of state.marbles) {
            if (o.area === 'track' && !o.fresh && o.seat !== m.seat) add({ type: 'swap', marble: m.id, target: o.id });
          }
        }
      } else {
        for (const m of own) {
          if (m.area === 'kennel') continue;
          for (const goal of m.area === 'track' && value > 0 ? [false, true] : [false]) {
            const path = walk(state, m, value, goal);
            if (!path) continue;
            const end = path[path.length - 1];
            if (goal && end.area !== 'goal') continue;
            if (!goal && m.area === 'track' && end.area !== 'track') continue;
            add({ type: 'move', marble: m.id, steps: value, goal });
          }
        }
      }
    }
    return moves;
  }

  // Führt einen Zug aus (state wird verändert). Gibt die Wege für die Animation und die geschlagenen Murmeln zurück.
  function applyMove(state, move) {
    const m = marble(state, move.marble);
    const paths = { [m.id]: [{ area: m.area, pos: m.pos }] };
    const beaten = [];
    const beat = (pos) => {
      const victim = onTrack(state, pos);
      if (victim && victim !== m) {
        paths[victim.id] = [{ area: victim.area, pos: victim.pos }];
        sendHome(state, victim);
        paths[victim.id].push({ area: 'kennel', pos: victim.pos });
        beaten.push(victim.id);
      }
    };
    if (move.type === 'exit') {
      beat(startOf(m.seat));
      Object.assign(m, { area: 'track', pos: startOf(m.seat), fresh: true });
      paths[m.id].push({ area: 'track', pos: m.pos });
    } else if (move.type === 'swap') {
      const o = marble(state, move.target);
      paths[o.id] = [{ area: o.area, pos: o.pos }];
      [m.pos, o.pos] = [o.pos, m.pos];
      m.fresh = false;
      o.fresh = false;
      paths[m.id].push({ area: 'track', pos: m.pos });
      paths[o.id].push({ area: 'track', pos: o.pos });
    } else {
      const path = walk(state, m, move.steps, move.goal);
      const end = path[path.length - 1];
      if (end.area === 'track') beat(end.pos);
      Object.assign(m, end, { fresh: false });
      paths[m.id].push(...path);
    }
    return { paths, beaten };
  }

  // Zwinger-Platz: der erste freie der vier Plätze
  function sendHome(state, m) {
    const used = new Set(state.marbles.filter((x) => x.seat === m.seat && x.area === 'kennel').map((x) => x.pos));
    let pos = 0;
    while (used.has(pos)) pos++;
    Object.assign(m, { area: 'kennel', pos, fresh: false });
  }

  // ---------- Die 7 ----------
  // Die 7 wird Schritt für Schritt gespielt: jeder Schritt bewegt eine Murmel um ein Feld. Jede Murmel,
  // über die man zieht oder auf der man landet, fliegt raus. Alle 7 Schritte müssen gegangen werden.

  function sevenOptions(state, seat) {
    const options = [];
    for (const m of movers(state, seat)) {
      const seen = new Set();
      for (const goal of [false, true]) {
        const next = step(state, m, 1, goal);
        if (!next) continue;
        const key = `${next.area}${next.pos}`;
        if (seen.has(key)) continue;
        seen.add(key);
        options.push({ marble: m.id, goal: next.area === 'goal' && m.area === 'track' });
      }
    }
    return options;
  }

  function applyStep(state, s) {
    const m = marble(state, s.marble);
    const next = step(state, m, 1, s.goal);
    const beaten = [];
    if (next.area === 'track') {
      const victim = onTrack(state, next.pos);
      if (victim) {
        sendHome(state, victim);
        beaten.push(victim.id);
      }
    }
    Object.assign(m, next, { fresh: false });
    return beaten;
  }

  function stateKey(state, remaining) {
    return `${remaining}:${state.marbles.map((m) => `${m.area[0]}${m.pos}${m.fresh ? '*' : ''}`).join(',')}`;
  }

  // Lassen sich von hier aus noch `remaining` Schritte gehen?
  function canComplete(state, seat, remaining, memo = new Map()) {
    if (remaining === 0) return true;
    const key = stateKey(state, remaining);
    if (memo.has(key)) return memo.get(key);
    let ok = false;
    for (const s of sevenOptions(state, seat)) {
      const next = clone(state);
      applyStep(next, s);
      if (canComplete(next, seat, remaining - 1, memo)) {
        ok = true;
        break;
      }
    }
    memo.set(key, ok);
    return ok;
  }

  // Schritte, mit denen die 7 noch vollständig gespielt werden kann
  function sevenNext(state, seat, remaining) {
    return sevenOptions(state, seat).filter((s) => {
      const next = clone(state);
      applyStep(next, s);
      return canComplete(next, seat, remaining - 1);
    });
  }

  // Prüft und spielt eine ganze 7 (state wird verändert). Gibt null zurück, wenn sie nicht erlaubt ist.
  function applySeven(state, seat, steps) {
    if (!Array.isArray(steps) || steps.length !== 7) return null;
    const work = clone(state);
    const paths = {};
    const beaten = [];
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i] || {};
      const option = sevenOptions(work, seat).find((o) => o.marble === s.marble && o.goal === Boolean(s.goal));
      if (!option) return null;
      const m = marble(work, option.marble);
      if (!paths[m.id]) paths[m.id] = [{ area: m.area, pos: m.pos }];
      for (const id of applyStep(work, option)) {
        // Die geschlagene Murmel stand dort, wo m jetzt steht
        const victim = marble(work, id);
        if (!paths[id]) paths[id] = [];
        paths[id].push({ area: 'track', pos: m.pos }, { area: 'kennel', pos: victim.pos });
        beaten.push(id);
      }
      paths[m.id].push({ area: m.area, pos: m.pos });
    }
    state.marbles = work.marbles;
    return { paths, beaten };
  }

  // Zufällige vollständige 7, z. B. wenn die Zeit abläuft
  function randomSeven(state, seat, rand = Math.random) {
    const work = clone(state);
    const steps = [];
    for (let left = 7; left > 0; left--) {
      const options = sevenNext(work, seat, left);
      if (!options.length) return null;
      const s = options[Math.floor(rand() * options.length)];
      applyStep(work, s);
      steps.push(s);
    }
    return steps;
  }

  // Kann diese Karte gespielt werden? Beim Joker: als irgendeine Karte.
  function playable(state, seat, rank) {
    if (rank === JOKER) return JOKER_AS.some((r) => playable(state, seat, r));
    if (rank === '7') return canComplete(clone(state), seat, 7);
    return legalMoves(state, seat, rank).length > 0;
  }

  return {
    FIELDS,
    GOAL,
    MARBLES,
    RANKS,
    JOKER,
    JOKER_AS,
    cardValues,
    buildDeck,
    newBoard,
    clone,
    trackLength,
    startOf,
    marble,
    onTrack,
    finished,
    teammates,
    moverSeats,
    movers,
    teamFinished,
    step,
    walk,
    moveKey,
    legalMoves,
    applyMove,
    sevenOptions,
    applyStep,
    canComplete,
    sevenNext,
    applySeven,
    randomSeven,
    playable,
  };
}));
