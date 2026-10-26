// Stoppuhr: Die Uhr läuft los und verschwindet nach drei Sekunden. Wer am nächsten an 10,00 Sekunden stoppt, gewinnt.
// Gemessen wird auf dem Handy, ab dem Moment, in dem dort die Uhr losläuft.

const { groupsOf, withMissing, seconds } = require('../helpers');

const TARGET = 10000;
const VISIBLE = 3000;
const DURATION = 25000;

module.exports = {
  id: 'stoppuhr',
  name: 'Stoppuhr',
  icon: '⏱️',
  short: 'Stoppe die unsichtbare Uhr genau bei 10,00 Sekunden.',
  howto: 'Die Uhr läuft los und ist nach drei Sekunden nicht mehr zu sehen. Zähl im Kopf weiter und tippe auf „Stopp!“, wenn du glaubst, dass genau 10 Sekunden um sind. Wer am nächsten dran ist, gewinnt.',
  TARGET,
  VISIBLE,
  create(ctx) {
    const stops = new Map(); // id -> ms
    const endAt = ctx.startAt + DURATION;

    const check = () => {
      if (ctx.ids.every((id) => stops.has(id) || !ctx.connected(id))) ctx.finish();
    };
    ctx.timer(endAt, () => ctx.finish());

    return {
      view(viewer) {
        return { target: TARGET, visible: VISIBLE, endAt, stopped: [...stops.keys()], mine: stops.get(viewer.id) ?? null };
      },
      action(player, { type, ms }) {
        if (type !== 'stop') return { error: 'Unbekannte Aktion.' };
        if (!ctx.ids.includes(player.id)) return { error: 'Du spielst hier nicht mit.' };
        if (stops.has(player.id)) return { ok: true };
        const value = Math.round(Number(ms));
        if (!Number.isFinite(value) || value < 0 || value > DURATION) return { error: 'Ungültige Zeit.' };
        stops.set(player.id, value);
        check();
        return { ok: true };
      },
      playersChanged: check,
      ranking() {
        const entries = [...stops].map(([id, ms]) => ({ id, ms, diff: Math.round(Math.abs(ms - TARGET) / 10) })).sort((a, b) => a.diff - b.diff);
        const groups = groupsOf(entries, (e) => e.diff, (e) => `${seconds(e.ms)}${e.diff ? '' : ' 🎯'}`);
        return { groups: withMissing(groups, ctx.ids, 'nicht gestoppt') };
      },
    };
  },
};
