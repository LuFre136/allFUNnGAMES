// Balancierer: Eine Kugel liegt auf einem Teller, der Wind schiebt sie weg. Mit dem Finger lenkt man sie zurück.
// Gezählt wird, wie lange die Kugel im goldenen Kreis in der Mitte bleibt. Gerechnet wird auf dem Handy.

const { rand, groupsOf, withMissing, seconds } = require('../helpers');

const DURATION = 25000;
const GUST = 1800; // alle 1,8 s dreht der Wind

module.exports = {
  id: 'balancierer',
  name: 'Balancierer',
  icon: '🤹',
  short: 'Halte die Kugel gegen den Wind in der Mitte.',
  howto: 'Der Wind schiebt die Kugel über den Teller. Leg den Finger aufs Feld: Die Kugel rollt zu deinem Finger hin. Halte sie möglichst lange im goldenen Kreis in der Mitte. Wer am längsten drin bleibt, gewinnt.',
  DURATION,
  create(ctx) {
    // Alle bekommen denselben Wind
    const wind = Array.from({ length: Math.ceil(DURATION / GUST) + 1 }, (_, i) => {
      const a = rand(0, Math.PI * 2);
      const f = rand(0.5, 1) * (1 + i / 14);
      return { x: Math.cos(a) * f, y: Math.sin(a) * f };
    });
    const endAt = ctx.startAt + DURATION;
    const scores = new Map(); // id -> ms im Kreis
    const done = new Set();

    const check = () => {
      if (ctx.ids.every((id) => done.has(id) || !ctx.connected(id))) ctx.finish();
    };
    ctx.timer(endAt + 1500, () => ctx.finish());

    return {
      view() {
        return { wind, gust: GUST, endAt, done: [...done], scores: Object.fromEntries(scores) };
      },
      action(player, { type, ms, final }) {
        if (type !== 'score') return { error: 'Unbekannte Aktion.' };
        if (!ctx.ids.includes(player.id) || done.has(player.id)) return { ok: true };
        const elapsed = Math.min(Date.now(), endAt) - ctx.startAt + 300;
        const value = Math.max(0, Math.min(Math.round(Number(ms) || 0), elapsed, DURATION));
        scores.set(player.id, Math.max(scores.get(player.id) || 0, value));
        if (final) {
          done.add(player.id);
          check();
        }
        return { ok: true };
      },
      playersChanged: check,
      ranking() {
        const entries = [...scores].map(([id, ms]) => ({ id, ms })).sort((a, b) => b.ms - a.ms);
        const groups = groupsOf(entries, (e) => Math.round(e.ms / 100), (e) => `${seconds(e.ms, 1)} in der Mitte (${Math.round((e.ms / DURATION) * 100)} %)`);
        return { groups: withMissing(groups, ctx.ids, 'kein Ergebnis') };
      },
    };
  },
};
