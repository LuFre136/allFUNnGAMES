// Sumo Zoo: Physik eines Stoßes. Tiere sind gleich große Kreise, stoßen sich elastisch an und werden
// durch Reibung gleichmäßig langsamer. Gerechnet wird nur auf dem Server, die Geräte spielen die Bahn ab.

const World = require('../../../public/js/sumozoo-world');

const DT = 1 / 120;
const FPS = 20; // so oft wird die Bahn aufgezeichnet, die Geräte rechnen dazwischen
const STEPS_PER_FRAME = Math.round(1 / (DT * FPS));
const MAX_SPEED = 1350; // Weltpunkte pro Sekunde bei voller Stärke
const DECEL = 320; // Reibung (wenig, die Tiere gleiten weit)
const RESTITUTION = 0.9;
const WALL_RESTITUTION = 0.75; // Mauern schlucken etwas Schwung
const MIN_SPEED = 4;
const FALL_TAIL = 0.5; // so lange fliegt ein Tier nach dem Absturz noch weiter (für die Animation)
const MAX_TIME = 15;

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

// animals: [{ id, x, y, alive }], shot: { id, angle, power (0..1) }
// Ergebnis: Endstand, Abstürze (in Sekunden) und die Bahnen der bewegten Tiere
function simulate(map, animals, shot) {
  const R = World.RADIUS;
  const bodies = animals.filter((a) => a.alive).map((a) => ({ id: a.id, x: a.x, y: a.y, vx: 0, vy: 0, fallen: false, fallT: null, moved: false, pts: [] }));
  const start = bodies.find((b) => b.id === shot.id);
  if (!start) throw new Error('Dieses Tier gibt es nicht.');
  const speed = MAX_SPEED * clamp(shot.power, 0, 1);
  start.vx = Math.cos(shot.angle) * speed;
  start.vy = Math.sin(shot.angle) * speed;
  start.moved = true;

  const record = () => {
    for (const b of bodies) b.pts.push(Math.round(b.x), Math.round(b.y));
  };
  record();

  let t = 0;
  let step = 0;
  for (;;) {
    step++;
    t = step * DT;
    // Bewegen und bremsen
    for (const b of bodies) {
      if (!b.vx && !b.vy) continue;
      b.x += b.vx * DT;
      b.y += b.vy * DT;
      if (b.fallen) continue; // im Fallen bremst nichts mehr
      const s = Math.hypot(b.vx, b.vy);
      const next = s - DECEL * DT;
      if (next < MIN_SPEED) {
        b.vx = 0;
        b.vy = 0;
      } else {
        b.vx *= next / s;
        b.vy *= next / s;
      }
    }
    // Zusammenstöße der Tiere, die noch oben sind
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      if (a.fallen) continue;
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j];
        if (b.fallen) continue;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= 2 * R) continue;
        if (d === 0) {
          dx = 1;
          dy = 0;
          d = 1;
        }
        const nx = dx / d;
        const ny = dy / d;
        const approach = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (approach > 0) {
          const j2 = ((1 + RESTITUTION) / 2) * approach;
          a.vx -= j2 * nx;
          a.vy -= j2 * ny;
          b.vx += j2 * nx;
          b.vy += j2 * ny;
          a.moved = true;
          b.moved = true;
        }
        // Überlappung auflösen
        const push = (2 * R - d) / 2;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
      }
    }
    // Mauern: abprallen wie an einer Bande
    for (const b of bodies) {
      if (b.fallen) continue;
      for (const w of map.walls) {
        const dx = w.x2 - w.x1;
        const dy = w.y2 - w.y1;
        const t = Math.max(0, Math.min(1, ((b.x - w.x1) * dx + (b.y - w.y1) * dy) / (dx * dx + dy * dy || 1)));
        const px = w.x1 + t * dx;
        const py = w.y1 + t * dy;
        let nx = b.x - px;
        let ny = b.y - py;
        const d = Math.hypot(nx, ny);
        const min = R + World.WALL;
        if (d >= min) continue;
        if (d === 0) {
          nx = 0;
          ny = 1;
        } else {
          nx /= d;
          ny /= d;
        }
        const vn = b.vx * nx + b.vy * ny;
        if (vn < 0) {
          b.vx -= (1 + WALL_RESTITUTION) * vn * nx;
          b.vy -= (1 + WALL_RESTITUTION) * vn * ny;
        }
        b.x += nx * (min - d);
        b.y += ny * (min - d);
      }
    }
    // Abstürze: Die Mitte ist nicht mehr auf dem Felsen
    for (const b of bodies) {
      if (b.fallen || World.onGround(map, b.x, b.y)) continue;
      b.fallen = true;
      b.fallT = t;
      b.moved = true;
      // Wer fast steht, kippt trotzdem sichtbar über die Kante
      const s = Math.hypot(b.vx, b.vy);
      if (s < 120) {
        const ax = b.x - World.CENTER.x;
        const ay = b.y - World.CENTER.y;
        const len = Math.hypot(ax, ay) || 1;
        b.vx = s ? (b.vx / s) * 120 : (ax / len) * 120;
        b.vy = s ? (b.vy / s) * 120 : (ay / len) * 120;
      }
    }
    if (step % STEPS_PER_FRAME === 0) record();
    const busy = bodies.some((b) => (b.fallen ? t - b.fallT < FALL_TAIL : b.vx || b.vy));
    if (!busy || t >= MAX_TIME) break;
  }
  if (step % STEPS_PER_FRAME !== 0) record();

  const frames = bodies[0].pts.length / 2;
  return {
    final: animals.map((a) => {
      const b = bodies.find((x) => x.id === a.id);
      if (!b) return { ...a };
      return { ...a, x: Math.round(b.x), y: Math.round(b.y), alive: !b.fallen };
    }),
    falls: bodies.filter((b) => b.fallen).map((b) => ({ id: b.id, t: b.fallT })),
    fps: FPS,
    frames,
    duration: Math.round(t * 1000),
    tracks: bodies.filter((b) => b.moved).map((b) => ({ id: b.id, pts: b.pts, fall: b.fallen ? Math.round(b.fallT * FPS * 10) / 10 : null })),
  };
}

module.exports = { simulate, MAX_SPEED, DECEL, FPS, FALL_TAIL };
