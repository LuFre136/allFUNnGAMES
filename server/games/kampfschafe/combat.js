// Kampfschafe: Schüsse ausrechnen. Rein, ohne Zustand und Zeitgeber, damit es sich testen lässt.
// Ergebnis ist eine Zeitleiste (Geschosse, Explosionen, Treffer, Flugzeuge), die alle Geräte gleich abspielen.

const World = require('../../../public/js/kampfschafe-world');

const WEAPONS = {
  rocket: { speed: 650, blast: 40, damage: 25 },
  shell: { speed: 480, blast: 50, damage: 50 },
  mg: { bullets: 21, interval: 0.06, speed: 1100, damage: 1, spread: 0.03, spreadGrow: 0.12 },
  air: { planes: 3, bombs: 2, planeSpeed: 650, gap: 60, along: 48, jitter: 18, fall: 0.35, blast: 40, damage: 20 },
  salvo: { rockets: 8, interval: 0.09, speed: 700, scatter: 38, blast: 26, damage: 7 },
};
const TAIL = 0.7; // Sekunden nach dem letzten Ereignis, bevor der nächste dran ist
const LAKE_SHELL = { ...WEAPONS.shell, damage: 40 };

const ms = (v) => Math.round(v * 1000) / 1000;

// units: [{ id, side, type, x, y, hp, r }]; rand: () => 0..1
function fire(map, units, shooterId, target, rand = Math.random) {
  const shooter = units.find((u) => u.id === shooterId);
  const type = World.typeFor(map, shooter.type);
  const live = units.map((u) => ({ ...u }));
  const byId = new Map(live.map((u) => [u.id, u]));
  const out = { projectiles: [], explosions: [], hits: [], planes: [] };
  let end = 0;

  let dx = target.x - shooter.x;
  let dy = target.y - shooter.y;
  let dist = Math.hypot(dx, dy);
  if (dist < 1) {
    dx = Math.cos(shooter.f || 0);
    dy = Math.sin(shooter.f || 0);
    dist = 1;
  }
  const angle = Math.atan2(dy, dx);
  const ux = dx / dist;
  const uy = dy / dist;

  function damage(u, amount, t) {
    if (u.hp <= 0 || amount <= 0) return;
    const dealt = Math.min(u.hp, amount);
    u.hp -= dealt;
    out.hits.push({ id: u.id, dmg: dealt, t: ms(t), kill: u.hp === 0 });
  }

  function explode(x, y, t, blast, max, exclude = null) {
    out.explosions.push({ x: Math.round(x), y: Math.round(y), r: blast, t: ms(t) });
    end = Math.max(end, t + 0.5);
    for (const u of live) {
      if (u.hp <= 0 || u.id === exclude) continue;
      const d = Math.max(0, Math.hypot(u.x - x, u.y - y) - u.r);
      if (d > blast) continue;
      damage(u, Math.round(max * (1 - (0.6 * d) / blast)), t);
    }
  }

  const sx = shooter.x + ux * (shooter.r + 2);
  const sy = shooter.y + uy * (shooter.r + 2);

  if (type.weapon === 'rocket' || type.weapon === 'shell') {
    const w = type.weapon === 'shell' && map.army === 'heli' ? LAKE_SHELL : WEAPONS[type.weapon];
    const reach = Math.max(shooter.r + 4, Math.min(type.range, dist));
    const ex = shooter.x + ux * reach;
    const ey = shooter.y + uy * reach;
    const hit = World.cast(map, live, sx, sy, ex, ey, { ignore: shooter.id });
    const t = Math.hypot(hit.x - sx, hit.y - sy) / w.speed;
    out.projectiles.push({ k: type.weapon, x0: Math.round(sx), y0: Math.round(sy), x1: Math.round(hit.x), y1: Math.round(hit.y), t0: 0, t1: t });
    explode(hit.x, hit.y, t, w.blast, w.damage);
  } else if (type.weapon === 'mg') {
    const w = WEAPONS.mg;
    const bullets = type.bullets || w.bullets;
    for (let i = 0; i < bullets; i++) {
      const spread = w.spread + (w.spreadGrow * i) / bullets;
      const a = angle + (rand() * 2 - 1) * spread;
      const t0 = i * w.interval;
      const ex = shooter.x + Math.cos(a) * type.range;
      const ey = shooter.y + Math.sin(a) * type.range;
      const hit = World.cast(map, live, sx, sy, ex, ey, { ignore: shooter.id });
      const t1 = t0 + Math.hypot(hit.x - sx, hit.y - sy) / w.speed;
      out.projectiles.push({ k: 'bullet', x0: Math.round(sx), y0: Math.round(sy), x1: Math.round(hit.x), y1: Math.round(hit.y), t0, t1 });
      if (hit.unit) damage(byId.get(hit.unit), w.damage, t1);
      end = Math.max(end, t1);
    }
  } else if (type.weapon === 'air') {
    // Drei Flugzeuge fliegen über das Ziel, in Blickrichtung des Funkers, und werfen je zwei Bomben
    const w = WEAPONS.air;
    const tx = target.x;
    const ty = target.y;
    const px = -uy;
    const py = ux;
    const bombs = [];
    for (let p = 0; p < w.planes; p++) {
      const off = (p - (w.planes - 1) / 2) * w.gap;
      const delay = p * 0.15;
      const cx = tx + px * off;
      const cy = ty + py * off;
      const reach = 1300;
      const toTarget = reach / 2 / w.planeSpeed;
      out.planes.push({
        x0: Math.round(cx - ux * (reach / 2)), y0: Math.round(cy - uy * (reach / 2)),
        x1: Math.round(cx + ux * (reach / 2)), y1: Math.round(cy + uy * (reach / 2)),
        t0: delay, t1: delay + reach / w.planeSpeed,
      });
      for (let b = 0; b < w.bombs; b++) {
        const along = (b - (w.bombs - 1) / 2) * w.along * 2;
        const jx = (rand() * 2 - 1) * w.jitter;
        const jy = (rand() * 2 - 1) * w.jitter;
        const t = delay + toTarget + along / w.planeSpeed + w.fall;
        bombs.push({ x: cx + ux * along + jx, y: cy + uy * along + jy, t });
      }
    }
    bombs.sort((a, b) => a.t - b.t);
    for (const b of bombs) explode(b.x, b.y, b.t, w.blast, w.damage, shooter.id);
    end = Math.max(end, ...out.planes.map((p) => p.t1 * 0.75));
  } else if (type.weapon === 'salvo') {
    const w = WEAPONS.salvo;
    const reach = Math.min(type.range, dist);
    const tx = shooter.x + ux * reach;
    const ty = shooter.y + uy * reach;
    for (let i = 0; i < w.rockets; i++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * w.scatter;
      const ex = Math.max(0, Math.min(World.W, tx + Math.cos(a) * r));
      const ey = Math.max(0, Math.min(World.H, ty + Math.sin(a) * r));
      const t0 = i * w.interval;
      const t1 = t0 + Math.hypot(ex - sx, ey - sy) / w.speed;
      out.projectiles.push({ k: 'salvo', x0: Math.round(sx), y0: Math.round(sy), x1: Math.round(ex), y1: Math.round(ey), t0, t1 });
      explode(ex, ey, t1, w.blast, w.damage, shooter.id);
    }
  }

  for (const p of out.projectiles) {
    p.t0 = ms(p.t0);
    p.t1 = ms(p.t1);
  }
  out.hits.sort((a, b) => a.t - b.t);
  return {
    angle,
    ...out,
    duration: Math.round((end + TAIL) * 1000),
    hp: Object.fromEntries(live.map((u) => [u.id, u.hp])),
  };
}

module.exports = { fire, WEAPONS };
