// Farbfolge: Vier Farbfelder leuchten nacheinander auf, man tippt sie nach. Jede Runde kommt eine Farbe dazu.
// Alle bekommen dieselbe Folge, jeder spielt in seinem Tempo. Bei Gleichstand zählt, wer schneller war.

const { randInt, groupsOf, withMissing } = require('../helpers');

const LENGTH = 30;
const DURATION = 75000;

module.exports = {
  id: 'farbfolge',
  name: 'Farbfolge',
  icon: '🎨',
  short: 'Merk dir die Reihenfolge der Farben und tippe sie nach.',
  howto: 'Die Farbfelder leuchten nacheinander auf. Danach tippst du sie in derselben Reihenfolge an. Jede Runde kommt eine Farbe dazu. Ein Fehler und du bist raus. Wer die längste Folge schafft, gewinnt.',
  create(ctx) {
    const sequence = Array.from({ length: LENGTH }, () => randInt(0, 3));
    const best = new Map(); // id -> { level, at }
    const out = new Set();
    const endAt = ctx.startAt + DURATION;

    const check = () => {
      if (ctx.ids.every((id) => out.has(id) || !ctx.connected(id))) ctx.finish();
    };

    ctx.timer(endAt, () => ctx.finish());

    return {
      view() {
        return { sequence, endAt, levels: Object.fromEntries([...best].map(([id, b]) => [id, b.level])), out: [...out] };
      },
      action(player, { type, level }) {
        if (!ctx.ids.includes(player.id)) return { error: 'Du spielst hier nicht mit.' };
        if (out.has(player.id)) return { ok: true };
        if (type === 'level') {
          const n = Math.round(Number(level));
          const before = best.get(player.id)?.level || 0;
          if (n !== before + 1 || n > LENGTH) return { error: 'Ungültige Runde.' };
          best.set(player.id, { level: n, at: Date.now() - ctx.startAt });
          if (n >= LENGTH) out.add(player.id);
        } else if (type === 'out') {
          out.add(player.id);
        } else return { error: 'Unbekannte Aktion.' };
        check();
        return { ok: true };
      },
      playersChanged: check,
      ranking() {
        const entries = [...best].map(([id, b]) => ({ id, ...b })).sort((a, b) => b.level - a.level || a.at - b.at);
        const groups = groupsOf(entries, (e) => `${e.level}:${e.at}`, (e) => `${e.level} ${e.level === 1 ? 'Farbe' : 'Farben'}`);
        return { groups: withMissing(groups, ctx.ids, '0 Farben') };
      },
    };
  },
};
