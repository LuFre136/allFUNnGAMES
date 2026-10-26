// Seilhüpfer: Das Seil schwingt immer schneller. Wer tippt, wenn es unten ist, springt drüber.
// Wer daneben tippt oder einen Sprung verpasst, fliegt raus. Das Handy prüft selbst und meldet nur das Aus.

const { groupsOf } = require('../helpers');

const FIRST = 1800; // erster Sprung nach dem Start
const START_INTERVAL = 1300;
const FACTOR = 0.965;
const MIN_INTERVAL = 430;
const MAX_JUMPS = 80;
const SETTLE = 1200; // so lange auf gleichzeitige Ausfälle warten, bevor es endet

function jumpTimes(startAt) {
  const times = [];
  let t = startAt + FIRST;
  let interval = START_INTERVAL;
  for (let k = 0; k < MAX_JUMPS; k++) {
    times.push(Math.round(t));
    interval = Math.max(MIN_INTERVAL, interval * FACTOR);
    t += interval;
  }
  return times;
}

// Toleranz rund um den Moment, in dem das Seil unten ist
function windowFor(k) {
  return Math.max(110, 210 - 2 * k);
}

module.exports = {
  id: 'seilhuepfer',
  name: 'Seilhüpfer',
  icon: '🪢',
  short: 'Tippe genau dann, wenn das Seil unten ist. Es wird immer schneller!',
  howto: 'Das Seil schwingt über dich hinweg. Tippe aufs Handy, wenn es unten bei den Füßen ist, dann springst du. Zu früh, zu spät oder zu oft getippt: raus! Wer am längsten durchhält, gewinnt.',
  jumpTimes,
  windowFor,
  create(ctx) {
    const times = jumpTimes(ctx.startAt);
    const out = new Map(); // id -> geschaffte Sprünge
    let ending = false;

    const alive = () => ctx.ids.filter((id) => !out.has(id));
    const clearedNow = () => times.filter((t) => t + windowFor(0) < Date.now()).length;

    function check() {
      if (ending) return;
      if (alive().length <= (ctx.ids.length > 1 ? 1 : 0)) {
        ending = true;
        ctx.timer(Date.now() + SETTLE, () => ctx.finish());
      }
    }

    ctx.timer(times[times.length - 1] + 1000, () => ctx.finish());

    return {
      view() {
        return { times, out: Object.fromEntries(out) };
      },
      action(player, { type, jumps }) {
        if (type !== 'out') return { error: 'Unbekannte Aktion.' };
        if (!ctx.ids.includes(player.id)) return { error: 'Du spielst hier nicht mit.' };
        if (out.has(player.id)) return { ok: true };
        const n = Math.max(0, Math.min(Math.round(Number(jumps) || 0), clearedNow(), MAX_JUMPS));
        out.set(player.id, n);
        check();
        return { ok: true };
      },
      playersChanged() {
        for (const id of alive()) if (!ctx.connected(id)) out.set(id, clearedNow());
        check();
      },
      ranking() {
        const done = clearedNow();
        const entries = ctx.ids.map((id) => ({ id, jumps: out.has(id) ? out.get(id) : done, alive: !out.has(id) }))
          .sort((a, b) => b.jumps - a.jumps || b.alive - a.alive);
        return { groups: groupsOf(entries, (e) => `${e.jumps}:${e.alive}`, (e) => `${e.jumps} ${e.jumps === 1 ? 'Sprung' : 'Sprünge'}${e.alive ? ' 🏅' : ''}`) };
      },
    };
  },
};
