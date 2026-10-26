// Phantombild: Augen, Nase und Mund so auf das Gesicht ziehen, dass es der Vorlage gleicht.
// Bewertet wird, wie nah jedes Teil an seinem Platz liegt.

const { rand, groupsOf, withMissing } = require('../helpers');

const DURATION = 30000;
const PARTS = ['eyeL', 'eyeR', 'nose', 'mouth'];
const RANGES = {
  eyeL: { x: [22, 42], y: [34, 54] },
  eyeR: { x: [58, 78], y: [34, 54] },
  nose: { x: [40, 60], y: [54, 72] },
  mouth: { x: [34, 66], y: [80, 98] },
};
const PER_PART = 25;
const FALLOFF = 28; // ab diesem Abstand gibt ein Teil keine Punkte mehr

function score(target, parts) {
  let total = 0;
  for (const k of PARTS) {
    const p = parts?.[k];
    if (!p) continue;
    const d = Math.hypot(p.x - target[k].x, p.y - target[k].y);
    total += PER_PART * Math.max(0, 1 - d / FALLOFF);
  }
  return Math.round(total);
}

function clean(parts) {
  const out = {};
  for (const k of PARTS) {
    const p = parts?.[k];
    const x = Number(p?.x);
    const y = Number(p?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    out[k] = { x: Math.max(0, Math.min(100, Math.round(x * 10) / 10)), y: Math.max(0, Math.min(150, Math.round(y * 10) / 10)) };
  }
  return out;
}

module.exports = {
  id: 'phantombild',
  name: 'Phantombild',
  icon: '🙂',
  short: 'Schieb Augen, Nase und Mund so hin, dass das Gesicht der Vorlage gleicht.',
  howto: 'Oben siehst du ein Gesicht als Vorlage. Zieh Augen, Nase und Mund mit dem Finger an dieselben Stellen auf dein leeres Gesicht. Je genauer, desto mehr Prozent. Fertig? Tippe auf „Fertig“, sonst zählt der Stand, wenn die Zeit um ist.',
  PARTS,
  score,
  create(ctx) {
    const target = {};
    for (const k of PARTS) target[k] = { x: Math.round(rand(...RANGES[k].x)), y: Math.round(rand(...RANGES[k].y)) };
    // Gesichtsform und Farbe für alle gleich, damit man nur auf die Teile achtet
    const look = { skin: ['#f5c9a0', '#e0a878', '#c68a5a', '#8d5a3b', '#f2d6b8'][Math.floor(rand(0, 4.99))], hair: ['#3b2a1a', '#e3b04b', '#a0522d', '#222', '#c0c0c0'][Math.floor(rand(0, 4.99))] };
    const faces = new Map(); // id -> Teile
    const done = new Set();
    const endAt = ctx.startAt + DURATION;

    const check = () => {
      if (ctx.ids.every((id) => done.has(id) || !ctx.connected(id))) ctx.finish();
    };
    ctx.timer(endAt, () => ctx.finish());

    return {
      view(viewer) {
        return { target, look, endAt, done: [...done], mine: faces.get(viewer.id) || null };
      },
      // Zwischenstand nach jedem Verschieben, ohne alle Geräte neu zu zeichnen
      draw(player, { op, parts }) {
        if (op !== 'face' || !ctx.ids.includes(player.id) || done.has(player.id)) return { ok: true };
        const p = clean(parts);
        if (p) faces.set(player.id, p);
        return { ok: true };
      },
      action(player, { type, parts }) {
        if (type !== 'done') return { error: 'Unbekannte Aktion.' };
        if (!ctx.ids.includes(player.id)) return { error: 'Du spielst hier nicht mit.' };
        const p = clean(parts);
        if (p) faces.set(player.id, p);
        done.add(player.id);
        check();
        return { ok: true };
      },
      playersChanged: check,
      ranking() {
        const entries = [...faces].map(([id, parts]) => ({ id, s: score(target, parts) })).sort((a, b) => b.s - a.s);
        const groups = groupsOf(entries, (e) => e.s, (e) => `${e.s} %`);
        return { groups: withMissing(groups, ctx.ids, 'nichts verschoben'), extra: { target, look, faces: Object.fromEntries(faces) } };
      },
    };
  },
};
