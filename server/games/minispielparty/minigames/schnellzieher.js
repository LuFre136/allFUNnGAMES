// Schnellzieher: Auf „JETZT!“ warten und als Erster tippen. Drei Durchgänge, die Zeiten werden addiert.
// Das Handy misst die Reaktionszeit selbst, so spielt die Verzögerung im WLAN keine Rolle.

const { randInt, groupsOf, withMissing } = require('../helpers');

const ROUNDS = 3;
const SLOT = 7000; // ein Durchgang
const WINDOW = 2000; // so lange kann man nach dem Signal tippen
const SLOW = 2000; // nicht getippt
const EARLY = 2500; // zu früh getippt
const MIN_MS = 100; // schneller geht nicht, das war geraten

module.exports = {
  id: 'schnellzieher',
  name: 'Schnellzieher',
  icon: '⚡',
  short: 'Warte auf „JETZT!“ und tippe schneller als alle anderen.',
  howto: 'Das Feld ist rot: warten! Wird es grün und zeigt „JETZT!“, tippst du so schnell du kannst. Wer zu früh tippt, kassiert eine Strafe. Drei Durchgänge, die Zeiten werden zusammengezählt.',
  create(ctx) {
    const rounds = Array.from({ length: ROUNDS }, (_, r) => {
      const signalAt = ctx.startAt + r * SLOT + randInt(1800, 4500);
      return { signalAt, endAt: signalAt + WINDOW };
    });
    const results = new Map(ctx.ids.map((id) => [id, Array(ROUNDS).fill(null)])); // { ms } oder { early: true }

    const valueOf = (res) => (!res ? SLOW : res.early ? EARLY : res.ms);
    const allDone = () => ctx.ids.every((id) => !ctx.connected(id) || results.get(id).every(Boolean));

    for (const r of rounds) ctx.timer(r.endAt + 50, () => {});
    ctx.timer(rounds[ROUNDS - 1].endAt + 600, () => ctx.finish());

    return {
      view(viewer) {
        const now = Date.now();
        return {
          rounds,
          mine: results.get(viewer.id) || null,
          // Ergebnisse eines Durchgangs erst zeigen, wenn er vorbei ist
          shown: rounds.map((r, i) => (now >= r.endAt || ctx.ids.every((id) => results.get(id)[i]) ? Object.fromEntries(ctx.ids.map((id) => [id, results.get(id)[i]])) : null)),
          tapped: rounds.map((_, i) => ctx.ids.filter((id) => results.get(id)[i])),
        };
      },
      action(player, { type, round, ms, early }) {
        if (type !== 'react') return { error: 'Unbekannte Aktion.' };
        const list = results.get(player.id);
        const i = Number(round);
        if (!list) return { error: 'Du spielst hier nicht mit.' };
        if (!Number.isInteger(i) || i < 0 || i >= ROUNDS) return { error: 'Ungültiger Durchgang.' };
        if (list[i]) return { ok: true };
        if (Date.now() < rounds[i].signalAt - 4000) return { error: 'Dieser Durchgang hat noch nicht begonnen.' };
        const value = Number(ms);
        list[i] = early || !Number.isFinite(value) || value < MIN_MS ? { early: true } : { ms: Math.min(Math.round(value), SLOW) };
        if (list[i].ms !== undefined) ctx.stats.fastest(player.id, list[i].ms);
        if (allDone()) ctx.finish();
        return { ok: true };
      },
      ranking() {
        const entries = ctx.ids.filter((id) => results.get(id).some(Boolean)).map((id) => {
          const list = results.get(id);
          return { id, total: list.reduce((s, r) => s + valueOf(r), 0), early: list.filter((r) => r?.early).length };
        }).sort((a, b) => a.total - b.total);
        const groups = groupsOf(entries, (e) => e.total, (e) => `Ø ${Math.round(e.total / ROUNDS)} ms${e.early ? ` · ${e.early}× zu früh` : ''}`);
        return { groups: withMissing(groups, ctx.ids, 'nicht getippt') };
      },
    };
  },
};
