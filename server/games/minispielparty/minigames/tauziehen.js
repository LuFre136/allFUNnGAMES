// Tauziehen (Team gegen Team): Alle tippen so schnell sie können. Gezählt wird der Durchschnitt pro Teammitglied,
// so ist es auch bei ungleich großen Teams fair. Wer das Seil zuerst weit genug zu sich zieht, gewinnt.

const DURATION = 20000;
const WIN = 25; // so viele Tipper pro Kopf Vorsprung beenden das Spiel
const MIN_GAP = 70; // höchstens ein Zug alle 70 ms

module.exports = {
  id: 'tauziehen',
  name: 'Tauziehen',
  icon: '🪢',
  formats: ['teams'],
  short: 'Tippen, tippen, tippen: Welches Team zieht stärker?',
  howto: 'Tippe so schnell du kannst auf „Ziehen!“. Jeder Tipper zieht das Seil ein Stück zu deinem Team. Gezählt wird der Durchschnitt pro Teammitglied. Wer das Seil weit genug zu sich zieht oder nach 20 Sekunden vorne liegt, gewinnt.',
  WIN,
  create(ctx) {
    const teams = ctx.teams;
    const pulls = new Map(ctx.ids.map((id) => [id, 0]));
    const endAt = ctx.startAt + DURATION;
    let liveTimer = null;
    let decided = null;

    const avg = (i) => {
      const ids = teams[i].filter((id) => ctx.connected(id) || pulls.get(id) > 0);
      return ids.length ? ids.reduce((s, id) => s + pulls.get(id), 0) / ids.length : 0;
    };
    // Positiv: Seil bei Team 0, negativ: bei Team 1
    const rope = () => avg(0) - avg(1);
    const pushLive = () => {
      if (liveTimer) return;
      liveTimer = setTimeout(() => {
        liveTimer = null;
        ctx.live({ rope: rope(), pulls: Object.fromEntries(pulls) });
      }, 120);
    };

    ctx.timer(endAt, () => ctx.finish());
    ctx.onDispose(() => clearTimeout(liveTimer));

    return {
      view() {
        return { endAt, win: WIN, teams, rope: rope(), pulls: Object.fromEntries(pulls), decided };
      },
      draw(player, { op, n }) {
        if (op !== 'pull' || !pulls.has(player.id) || decided !== null) return { ok: true };
        const now = Date.now();
        if (now < ctx.startAt || now > endAt + 300) return { ok: true };
        const cap = Math.floor((now - ctx.startAt) / MIN_GAP) + 3;
        const value = Math.min(Math.round(Number(n) || 0), cap);
        if (value <= pulls.get(player.id)) return { ok: true };
        pulls.set(player.id, value);
        const r = rope();
        if (Math.abs(r) >= WIN) {
          decided = r > 0 ? 0 : 1;
          ctx.finish();
        } else pushLive();
        return { ok: true };
      },
      playersChanged() {},
      ranking() {
        const r = rope();
        const winner = decided ?? (Math.abs(r) < 0.5 ? null : r > 0 ? 0 : 1);
        const a = avg(0).toFixed(1).replace('.', ',');
        const b = avg(1).toFixed(1).replace('.', ',');
        return { winner, info: `Pro Kopf ${a} gegen ${b} Züge.` };
      },
    };
  },
};
