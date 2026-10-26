// Ballonpumpe: Schütteln (oder ohne Bewegungssensor schnell tippen), bis der Ballon platzt.
// Wer zuerst platzen lässt, gewinnt. Beide Wege sind gleich schnell gedeckelt.

const { groupsOf, withMissing, seconds } = require('../helpers');

const GOAL = 50;
const DURATION = 15000;
const MIN_GAP = 80; // höchstens ein Pumpstoß alle 80 ms

module.exports = {
  id: 'ballonpumpe',
  name: 'Ballonpumpe',
  icon: '🎈',
  short: 'Schüttel dein Handy (oder tippe wie wild), bis dein Ballon platzt.',
  howto: 'Schüttel dein Handy kräftig, jeder Stoß pumpt deinen Ballon auf. Geht das Schütteln nicht, tippst du so schnell du kannst auf die Pumpe. Wer den Ballon zuerst zum Platzen bringt, gewinnt.',
  motion: true,
  GOAL,
  create(ctx) {
    const pumps = new Map(ctx.ids.map((id) => [id, 0]));
    const popped = new Map(); // id -> ms nach dem Start
    const endAt = ctx.startAt + DURATION;
    let liveTimer = null;

    const check = () => {
      if (ctx.ids.every((id) => popped.has(id) || !ctx.connected(id))) ctx.finish();
    };
    // Zwischenstände an alle, höchstens alle 150 ms
    const pushLive = () => {
      if (liveTimer) return;
      liveTimer = setTimeout(() => {
        liveTimer = null;
        ctx.live({ pumps: Object.fromEntries(pumps) });
      }, 150);
    };

    ctx.timer(endAt, () => ctx.finish());
    ctx.onDispose(() => clearTimeout(liveTimer));

    return {
      view() {
        return { goal: GOAL, endAt, pumps: Object.fromEntries(pumps), popped: Object.fromEntries(popped) };
      },
      draw(player, { op, n }) {
        if (op !== 'pump' || !pumps.has(player.id) || popped.has(player.id)) return { ok: true };
        const now = Date.now();
        if (now < ctx.startAt || now > endAt + 500) return { ok: true };
        const cap = Math.floor((now - ctx.startAt) / MIN_GAP) + 3;
        const value = Math.min(Math.round(Number(n) || 0), cap, GOAL);
        if (value <= pumps.get(player.id)) return { ok: true };
        pumps.set(player.id, value);
        if (value >= GOAL) {
          popped.set(player.id, Math.min(now, endAt) - ctx.startAt);
          check();
          ctx.broadcast();
        } else pushLive();
        return { ok: true };
      },
      playersChanged: check,
      ranking() {
        const pop = [...popped].map(([id, ms]) => ({ id, ms })).sort((a, b) => a.ms - b.ms);
        const rest = ctx.ids.filter((id) => !popped.has(id) && pumps.get(id) > 0).map((id) => ({ id, n: pumps.get(id) })).sort((a, b) => b.n - a.n);
        const groups = [
          ...groupsOf(pop, (e) => Math.round(e.ms / 10), (e) => `💥 nach ${seconds(e.ms, 1)}`),
          ...groupsOf(rest, (e) => e.n, (e) => `${Math.round((e.n / GOAL) * 100)} % aufgepumpt`),
        ];
        return { groups: withMissing(groups, ctx.ids, 'nicht gepumpt') };
      },
    };
  },
};
