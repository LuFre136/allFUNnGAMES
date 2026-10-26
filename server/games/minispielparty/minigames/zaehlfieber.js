// Zählfieber: Über den Bildschirm wuseln Tiere. Danach gibt jeder an, wie viele es von einer Sorte waren.
// Wer am nächsten dran ist, gewinnt. Mit Fernseher laufen die Tiere dort, sonst auf jedem Handy.

const { randInt, rand, groupsOf, withMissing } = require('../helpers');
const { shuffle } = require('../../../util');

const KINDS = [
  { emoji: '🐞', name: 'Marienkäfer' },
  { emoji: '🐸', name: 'Frösche' },
  { emoji: '🐭', name: 'Mäuse' },
  { emoji: '🐌', name: 'Schnecken' },
  { emoji: '🦔', name: 'Igel' },
];
const SHOW = 13000; // so lange laufen die Tiere
const ANSWER = 12000; // Zeit zum Abgeben danach

module.exports = {
  id: 'zaehlfieber',
  name: 'Zählfieber',
  icon: '🐞',
  short: 'Zähle die Tiere einer Sorte, die über den Bildschirm wuseln.',
  howto: 'Gleich wuseln Tiere über den Bildschirm. Zähle die Sorte, die oben angesagt wird. Tippe beim Zählen auf „+1“, das hilft. Danach kannst du die Zahl noch anpassen und abschicken. Wer am nächsten dran ist, gewinnt.',
  create(ctx) {
    const kinds = shuffle(KINDS).slice(0, 3);
    const target = kinds[0];
    const counts = [randInt(9, 22), randInt(5, 16), randInt(5, 16)];
    const critters = [];
    kinds.forEach((kind, k) => {
      for (let i = 0; i < counts[k]; i++) {
        const duration = Math.round(rand(1700, 3200));
        critters.push({
          e: kind.emoji,
          at: Math.round(rand(300, SHOW - duration - 200)),
          d: duration,
          y: Math.round(rand(6, 90)),
          dir: rand(0, 1) < 0.5 ? 1 : -1,
          hop: rand(0, 1) < 0.4,
        });
      }
    });
    critters.sort((a, b) => a.at - b.at);
    const showEnd = ctx.startAt + SHOW;
    const endAt = showEnd + ANSWER;
    const answers = new Map(); // id -> { value, at }

    ctx.timer(showEnd, () => {});
    ctx.timer(endAt, () => ctx.finish());

    const check = () => {
      if (Date.now() >= showEnd - 100 && ctx.ids.every((id) => answers.has(id) || !ctx.connected(id))) ctx.finish();
    };

    return {
      view(viewer) {
        return {
          target: { emoji: target.emoji, name: target.name },
          critters,
          showEnd,
          endAt,
          answered: [...answers.keys()],
          mine: answers.get(viewer.id)?.value ?? null,
        };
      },
      action(player, { type, value }) {
        if (type !== 'answer') return { error: 'Unbekannte Aktion.' };
        if (!ctx.ids.includes(player.id)) return { error: 'Du spielst hier nicht mit.' };
        if (Date.now() < showEnd - 1500) return { error: 'Erst zählen, dann abgeben!' };
        if (answers.has(player.id)) return { error: 'Du hast schon abgegeben.' };
        const n = Math.round(Number(value));
        if (!Number.isFinite(n) || n < 0 || n > 99) return { error: 'Bitte eine Zahl von 0 bis 99.' };
        answers.set(player.id, { value: n, at: Date.now() });
        check();
        return { ok: true };
      },
      playersChanged: check,
      ranking() {
        const right = counts[0];
        const entries = [...answers].map(([id, a]) => ({ id, ...a, diff: Math.abs(a.value - right) })).sort((a, b) => a.diff - b.diff || a.at - b.at);
        const groups = groupsOf(entries, (e) => e.diff, (e) => `${e.value} ${e.diff ? `(${e.value > right ? '+' : '−'}${e.diff})` : '🎯'}`);
        return { groups: withMissing(groups, ctx.ids, 'nichts abgegeben'), info: `Es waren ${right} ${target.emoji} ${target.name}.` };
      },
    };
  },
};
