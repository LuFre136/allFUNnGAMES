// Staffel-Farbfolge (Team gegen Team): Wie die Farbfolge, aber als Staffel. Die Folge leuchtet auf,
// danach tippt jedes Teammitglied der Reihe nach eine Farbe. Ein Fehler beendet das Spiel fürs Team.

const { randInt } = require('../helpers');

const LENGTH = 25;
const DURATION = 100000;
const TURN_MS = 7000; // so lange hat jeder für seine Farbe
const PAUSE = 900; // vor dem Vorspielen

// Vorspielen: wie lange eine Farbe leuchtet und die Pause dazwischen (wird mit der Länge schneller)
function speed(level) {
  return { d: Math.max(280, 520 - 14 * level), gap: Math.max(120, 200 - 5 * level) };
}

module.exports = {
  id: 'staffel',
  name: 'Staffel-Farbfolge',
  icon: '🎨',
  formats: ['teams'],
  short: 'Farben merken als Staffel: jeder im Team tippt eine.',
  howto: 'Die Farben leuchten nacheinander auf, alle im Team merken mit. Danach tippt ihr die Folge der Reihe nach ein: Jeder ist für eine Farbe dran, dann der Nächste. Ein Fehler oder zu langes Zögern, und euer Team ist raus. Jede Runde kommt eine Farbe dazu. Das Team mit der längeren Folge gewinnt.',
  speed,
  create(ctx) {
    const sequence = Array.from({ length: LENGTH }, () => randInt(0, 3));
    const endAt = ctx.startAt + DURATION;
    const teams = ctx.teams.map((ids) => ({
      ids,
      level: 1, // Länge, die gerade dran ist
      pos: 0, // nächste Stelle in der Folge
      turn: 0, // zählt alle Tipper, bestimmt wer dran ist
      best: 0, // geschaffte Länge
      bestAt: 0,
      showAt: ctx.startAt + 300,
      inputAt: 0,
      out: false,
      why: null,
      timer: null,
      lastPress: null, // { color, ok, at }
    }));

    const order = (t) => {
      const live = t.ids.filter((id) => ctx.connected(id));
      return live.length ? live : t.ids;
    };
    const whose = (t) => {
      const o = order(t);
      return o[t.turn % o.length];
    };

    function schedule(t) {
      const { d, gap } = speed(t.level);
      t.inputAt = t.showAt + t.level * (d + gap);
      if (t.timer) ctx.clear(t.timer);
      t.timer = ctx.timer(t.inputAt + TURN_MS, () => knockOut(t, 'zu langsam'));
    }

    function knockOut(t, why) {
      if (t.out) return;
      t.out = true;
      t.why = why;
      if (t.timer) ctx.clear(t.timer);
      check();
    }

    const check = () => {
      if (teams.every((t) => t.out)) ctx.finish();
    };

    teams.forEach(schedule);
    ctx.timer(endAt, () => ctx.finish());

    return {
      view() {
        return {
          sequence,
          endAt,
          turnMs: TURN_MS,
          teams: teams.map((t) => ({
            ids: t.ids, level: t.level, pos: t.pos, best: t.best, showAt: t.showAt, inputAt: t.inputAt, out: t.out, why: t.why,
            whose: t.out ? null : whose(t), lastPress: t.lastPress,
          })),
        };
      },
      action(player, { type, color }) {
        if (type !== 'press') return { error: 'Unbekannte Aktion.' };
        const t = teams.find((x) => x.ids.includes(player.id));
        if (!t || t.out) return { error: 'Dein Team ist schon raus.' };
        const now = Date.now();
        if (now < t.inputAt) return { error: 'Erst gut hinschauen!' };
        if (whose(t) !== player.id) return { error: 'Gerade ist jemand anderes dran.' };
        const c = Number(color);
        t.turn++;
        t.lastPress = { color: c, ok: c === sequence[t.pos], at: now, by: player.id };
        if (c !== sequence[t.pos]) {
          knockOut(t, 'falsche Farbe');
          return { ok: true, wrong: true };
        }
        t.pos++;
        if (t.pos >= t.level) {
          t.best = t.level;
          t.bestAt = now - ctx.startAt;
          if (t.level >= LENGTH) {
            knockOut(t, 'alles geschafft');
            return { ok: true };
          }
          t.level++;
          t.pos = 0;
          t.showAt = now + PAUSE;
          schedule(t);
        } else {
          if (t.timer) ctx.clear(t.timer);
          t.timer = ctx.timer(now + TURN_MS, () => knockOut(t, 'zu langsam'));
        }
        return { ok: true };
      },
      playersChanged: check,
      ranking() {
        const [a, b] = teams;
        let winner = null;
        if (a.best !== b.best) winner = a.best > b.best ? 0 : 1;
        else if (a.best > 0 && a.bestAt !== b.bestAt) winner = a.bestAt < b.bestAt ? 0 : 1;
        const len = (n) => `${n} ${n === 1 ? 'Farbe' : 'Farben'}`;
        return { winner, info: `${len(a.best)} gegen ${len(b.best)}.` };
      },
    };
  },
};
