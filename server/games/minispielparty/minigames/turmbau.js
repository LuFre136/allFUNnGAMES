// Turmbau (Team gegen Team): Ein Block schwingt über dem Turm hin und her. Wer im Team dran ist, lässt ihn fallen.
// Was übersteht, fällt herunter, der Turm wird schmaler. Der höhere Turm nach 45 Sekunden gewinnt.

const DURATION = 45000;
const TURN_MS = 6000; // wer so lange nicht tippt, lässt den Block automatisch fallen
const NEXT_MS = 500; // Pause bis zum nächsten Block
const BASE_W = 80; // Breite des untersten Blocks, das Feld ist 200 breit
const CENTER = 100;
const SWING = 70;

// Wo der schwingende Block nach `ms` steht; mit der Höhe wird er schneller
function swingX(ms, height) {
  const period = Math.max(1100, 2200 - 90 * height);
  return CENTER + SWING * Math.sin((2 * Math.PI * Math.max(0, ms)) / period);
}

module.exports = {
  id: 'turmbau',
  name: 'Turmbau',
  icon: '🗼',
  formats: ['teams'],
  short: 'Blöcke stapeln im Team: Wer baut höher?',
  howto: 'Über eurem Turm schwingt ein Block hin und her. Wer dran ist, tippt, um ihn fallen zu lassen. Was über den Rand ragt, fällt herunter, der Turm wird schmaler. Danach ist der Nächste im Team dran. Nach 45 Sekunden gewinnt der höhere Turm.',
  swingX,
  BASE_W,
  create(ctx) {
    const endAt = ctx.startAt + DURATION;
    const teams = ctx.teams.map((ids) => ({
      ids,
      blocks: [{ x: CENTER, w: BASE_W }],
      turn: 0,
      spawnAt: ctx.startAt,
      timer: null,
      last: null, // { x, w, miss, at }
    }));

    const order = (t) => {
      const live = t.ids.filter((id) => ctx.connected(id));
      return live.length ? live : t.ids;
    };
    const whose = (t) => {
      const o = order(t);
      return o[t.turn % o.length];
    };
    const height = (t) => t.blocks.length - 1;

    function arm(t) {
      if (t.timer) ctx.clear(t.timer);
      t.timer = ctx.timer(t.spawnAt + TURN_MS, () => drop(t, TURN_MS));
    }

    function drop(t, ms) {
      const now = Date.now();
      if (now < t.spawnAt || now > endAt) return;
      const top = t.blocks[t.blocks.length - 1];
      const x = swingX(ms, height(t));
      const left = Math.max(x - top.w / 2, top.x - top.w / 2);
      const right = Math.min(x + top.w / 2, top.x + top.w / 2);
      if (right - left < 1) t.last = { x, w: top.w, miss: true, at: now };
      else {
        t.blocks.push({ x: (left + right) / 2, w: right - left });
        t.last = { x, w: top.w, miss: false, at: now };
      }
      t.turn++;
      t.spawnAt = now + NEXT_MS;
      arm(t);
      ctx.broadcast();
    }

    teams.forEach(arm);
    ctx.timer(endAt, () => ctx.finish());

    return {
      view() {
        return {
          endAt,
          turnMs: TURN_MS,
          teams: teams.map((t) => ({ ids: t.ids, blocks: t.blocks, spawnAt: t.spawnAt, whose: whose(t), last: t.last, height: height(t) })),
        };
      },
      action(player, { type, ms }) {
        if (type !== 'drop') return { error: 'Unbekannte Aktion.' };
        const t = teams.find((x) => x.ids.includes(player.id));
        if (!t) return { error: 'Du spielst hier nicht mit.' };
        if (whose(t) !== player.id) return { error: 'Gerade ist jemand anderes dran.' };
        const now = Date.now();
        if (now < t.spawnAt) return { error: 'Der Block kommt gleich.' };
        // Das Handy misst selbst, wann getippt wurde; mehr als bis jetzt geht nicht
        const elapsed = Math.min(Math.max(0, Number(ms) || 0), now - t.spawnAt + 300);
        drop(t, elapsed);
        return { ok: true };
      },
      playersChanged() {},
      ranking() {
        const [a, b] = teams;
        const ha = height(a);
        const hb = height(b);
        let winner = null;
        if (ha !== hb) winner = ha > hb ? 0 : 1;
        else if (ha > 0) {
          const wa = a.blocks[a.blocks.length - 1].w;
          const wb = b.blocks[b.blocks.length - 1].w;
          if (Math.abs(wa - wb) >= 0.5) winner = wa > wb ? 0 : 1;
        }
        const fl = (n) => `${n} ${n === 1 ? 'Stockwerk' : 'Stockwerke'}`;
        return { winner, info: `${fl(ha)} gegen ${fl(hb)}${ha === hb && winner !== null ? ', der breitere Turm gewinnt' : ''}.` };
      },
    };
  },
};
