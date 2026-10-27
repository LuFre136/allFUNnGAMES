// Team-Memory (Team gegen Team): Jedes Team hat ein eigenes Memory mit denselben Bildern, anders gemischt. Der Reihe nach deckt jeder
// im Team zwei Karten auf. Ein Paar bleibt offen. Das Team, das zuerst alle Paare hat, gewinnt.

const { shuffle } = require('../../../util');

const POOL = ['🍎', '🍌', '🍇', '🍓', '🍒', '🍍', '🥝', '🍉', '🥕', '🌽', '🍄', '🥨', '🍩', '🍪', '🧀', '🍕'];
const PAIRS = 8;
const DURATION = 90000;
const TURN_MS = 8000; // so lange hat jeder für seine zwei Karten
const SHOW_MS = 1100; // so lange bleiben zwei falsche Karten offen

module.exports = {
  id: 'teammemory',
  name: 'Team-Memory',
  icon: '🃏',
  formats: ['teams'],
  short: 'Memory im Team: Wer findet zuerst alle Paare?',
  howto: 'Jedes Team hat ein eigenes Memory. Der Reihe nach deckt jeder in eurem Team zwei Karten auf, alle im Team schauen mit und merken sich die Karten. Ein Paar bleibt offen. Das Team, das zuerst alle 8 Paare findet, gewinnt. Nach 90 Sekunden zählen die gefundenen Paare.',
  PAIRS,
  create(ctx) {
    const faces = shuffle(POOL).slice(0, PAIRS).flatMap((x) => [x, x]);
    const endAt = ctx.startAt + DURATION;
    // Jedes Team mischt eigen, sonst hilft es, beim anderen Team zuzuschauen
    const teams = ctx.teams.map((ids) => ({
      ids,
      cards: shuffle(faces),
      turn: 0,
      open: [], // aufgedeckte Karten im laufenden Zug
      hideAt: 0, // wann zwei falsche Karten wieder zugehen
      matched: new Set(),
      pairsAt: 0, // wann das letzte Paar gefunden wurde
      timer: null,
      flips: 0,
    }));

    const order = (t) => {
      const live = t.ids.filter((id) => ctx.connected(id));
      return live.length ? live : t.ids;
    };
    const whose = (t) => {
      const o = order(t);
      return o[t.turn % o.length];
    };

    function arm(t, from = Date.now()) {
      if (t.timer) ctx.clear(t.timer);
      t.timer = ctx.timer(from + TURN_MS, () => nextTurn(t));
    }

    function nextTurn(t) {
      t.open = [];
      t.hideAt = 0;
      t.turn++;
      arm(t);
    }

    const check = () => {
      if (teams.some((t) => t.matched.size >= PAIRS * 2)) ctx.finish();
    };

    teams.forEach((t) => arm(t, ctx.startAt));
    ctx.timer(endAt, () => ctx.finish());

    return {
      view() {
        const now = Date.now();
        return {
          endAt,
          pairs: PAIRS,
          size: faces.length,
          turnMs: TURN_MS,
          teams: teams.map((t) => ({
            ids: t.ids,
            whose: whose(t),
            // Offene Karten: gefundene Paare und der laufende Zug
            faces: Object.fromEntries([...t.matched, ...t.open].map((i) => [i, t.cards[i]])),
            open: t.open,
            matched: [...t.matched],
            found: t.matched.size / 2,
            hideAt: t.hideAt > now ? t.hideAt : 0,
          })),
        };
      },
      action(player, { type, card }) {
        if (type !== 'flip') return { error: 'Unbekannte Aktion.' };
        const t = teams.find((x) => x.ids.includes(player.id));
        if (!t) return { error: 'Du spielst hier nicht mit.' };
        const now = Date.now();
        if (now < ctx.startAt) return { error: 'Gleich geht es los.' };
        if (whose(t) !== player.id) return { error: 'Gerade ist jemand anderes aus deinem Team dran.' };
        if (t.open.length >= 2) return { error: 'Kurz warten, die Karten gehen gleich zu.' };
        const i = Number(card);
        if (!Number.isInteger(i) || i < 0 || i >= t.cards.length || t.matched.has(i) || t.open.includes(i)) return { error: 'Diese Karte geht nicht.' };
        t.open.push(i);
        t.flips++;
        if (t.open.length === 2) {
          const [a, b] = t.open;
          if (t.cards[a] === t.cards[b]) {
            t.matched.add(a);
            t.matched.add(b);
            t.pairsAt = now - ctx.startAt;
            t.open = [];
            check();
            // Ein Paar: der Nächste ist dran
            t.turn++;
            arm(t);
          } else {
            t.hideAt = now + SHOW_MS;
            if (t.timer) ctx.clear(t.timer);
            t.timer = ctx.timer(t.hideAt, () => nextTurn(t));
          }
        }
        return { ok: true };
      },
      playersChanged() {},
      ranking() {
        const [a, b] = teams;
        const fa = a.matched.size / 2;
        const fb = b.matched.size / 2;
        let winner = null;
        if (fa !== fb) winner = fa > fb ? 0 : 1;
        else if (fa > 0 && a.pairsAt !== b.pairsAt) winner = a.pairsAt < b.pairsAt ? 0 : 1;
        const p = (n) => `${n} ${n === 1 ? 'Paar' : 'Paare'}`;
        return { winner, info: `${p(fa)} gegen ${p(fb)}.` };
      },
    };
  },
};
