// Kampfschafe: Karten, Einheiten und Geometrie. Läuft auf dem Server (Bewegung, Schüsse) und im Browser
// (Zeichnen, Reichweiten), deshalb ohne Abhängigkeiten.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KsWorld = factory();
}(typeof self !== 'undefined' ? self : this, () => {
  const W = 1000; // Weltgröße, Querformat wie der Fernseher
  const H = 640;
  const CENTER = { x: W / 2, y: H / 2 };
  const MEDKIT_R = 14;

  // Einheiten wie im Original (Werte grob nach Warsheep), Waffen siehe server/games/kampfschafe/combat.js
  const TYPES = {
    funker: { key: 'funker', name: 'Funker', badge: '📻', hp: 10, r: 15, speed: 115, weapon: 'air', range: 0, info: 'Ruft einen Luftangriff, Bomben treffen auch eigene Schafe' },
    bazooka: { key: 'bazooka', name: 'Bazooka', badge: '🚀', hp: 20, r: 15, speed: 105, weapon: 'rocket', range: 520, info: 'Präzise Rakete, explodiert am Ziel' },
    mg: { key: 'mg', name: 'MG-Schaf', badge: '🔫', hp: 40, r: 16, speed: 95, weapon: 'mg', range: 270, info: 'Feuerstoß aus 21 Schuss, kurze Reichweite' },
    panzer: { key: 'panzer', name: 'Panzer', badge: '🛡️', hp: 50, r: 20, speed: 60, weapon: 'shell', range: 430, info: 'Langsam, aber die Granate sitzt' },
    heli: { key: 'heli', name: 'Hubschrauber', badge: '🚁', hp: 35, r: 18, speed: 165, weapon: 'salvo', range: 380, flies: true, info: 'Fliegt über alles, feuert eine Raketensalve' },
  };

  // Auf der Seenplatte ist der Panzer etwas schneller und schwächer (wie im Original)
  const LAKE_PANZER = { ...TYPES.panzer, hp: 45, speed: 75 };

  function typeFor(map, key) {
    if (key === 'panzer' && map?.army === 'heli') return LAKE_PANZER;
    return TYPES[key];
  }

  const ARMIES = {
    normal: {
      10: ['funker', 'bazooka', 'bazooka', 'bazooka', 'bazooka', 'mg', 'mg', 'mg', 'panzer', 'panzer'],
      6: ['funker', 'bazooka', 'bazooka', 'mg', 'mg', 'panzer'],
    },
    heli: {
      10: ['funker', 'heli', 'heli', 'heli', 'mg', 'mg', 'mg', 'panzer', 'panzer', 'panzer'],
      6: ['funker', 'heli', 'heli', 'mg', 'mg', 'panzer'],
    },
  };

  // Hindernisse: fest (blockt Fahren und Schüsse) oder Wasser (blockt nur das Fahren)
  const SOLID = new Set(['tree', 'pine', 'cactus', 'rock', 'house', 'igloo']);

  // Punktsymmetrisch spiegeln, damit links und rechts gleich gut stehen
  function sym(list) {
    const out = [];
    for (const o of list) {
      out.push(o);
      if (o.t === 'circle') out.push({ ...o, x: W - o.x, y: H - o.y });
      else out.push({ ...o, x: W - o.x - o.w, y: H - o.y - o.h });
    }
    return out;
  }
  const c = (k, x, y, r) => ({ k, t: 'circle', x, y, r });
  const rect = (k, x, y, w, h) => ({ k, t: 'rect', x, y, w, h });

  const MAPS = {
    wiesen: {
      id: 'wiesen',
      name: 'Grüne Wiesen',
      icon: '🌳',
      description: 'Bäume, Felsen und ein Teich in der Mitte. Vier Medipacks.',
      theme: 'grass',
      army: 'normal',
      obstacles: [
        c('water', 500, 320, 55),
        ...sym([
          c('tree', 330, 110, 26), c('tree', 385, 160, 22), c('tree', 300, 470, 24), c('rock', 290, 320, 26),
          rect('house', 400, 215, 70, 45), c('tree', 560, 140, 24), c('rock', 400, 560, 22),
        ]),
      ],
      medkits: [{ x: 500, y: 105 }, { x: 500, y: 535 }, { x: 255, y: 420 }, { x: 745, y: 220 }],
    },
    wueste: {
      id: 'wueste',
      name: 'Wüstensturm',
      icon: '🌵',
      description: 'Felsen, Ruinen und zwei Oasen. Drei Medipacks.',
      theme: 'sand',
      army: 'normal',
      obstacles: sym([
        c('rock', 320, 140, 34), c('rock', 290, 400, 28), c('cactus', 400, 60, 14), c('cactus', 440, 280, 14),
        c('cactus', 360, 560, 14), rect('house', 470, 140, 80, 40), c('rock', 300, 250, 20), c('water', 380, 320, 35),
      ]),
      medkits: [{ x: 500, y: 75 }, { x: 500, y: 565 }, { x: 500, y: 320 }],
    },
    schnee: {
      id: 'schnee',
      name: 'Weiße Hölle',
      icon: '❄️',
      description: 'Tannen, Iglus und Eislöcher im Schnee. Drei Medipacks.',
      theme: 'snow',
      army: 'normal',
      obstacles: sym([
        c('pine', 320, 90, 20), c('pine', 350, 155, 18), c('pine', 300, 520, 20), c('igloo', 430, 230, 30),
        c('water', 420, 450, 45), c('rock', 290, 250, 20), c('pine', 560, 60, 18),
      ]),
      medkits: [{ x: 500, y: 140 }, { x: 500, y: 500 }, { x: 500, y: 320 }],
    },
    seen: {
      id: 'seen',
      name: 'Seenplatte',
      icon: '🚁',
      description: 'Viele Seen. Statt Bazookas gibt es Hubschrauber, die über alles fliegen.',
      theme: 'lake',
      army: 'heli',
      obstacles: sym([
        c('water', 330, 140, 50), c('water', 440, 280, 40), c('water', 330, 500, 45), c('tree', 400, 70, 18),
        c('tree', 280, 250, 18), c('tree', 520, 420, 18),
      ]),
      medkits: [{ x: 500, y: 320 }, { x: 500, y: 90 }, { x: 500, y: 550 }],
    },
  };
  const MAP_IDS = Object.keys(MAPS);

  // Startbereiche der Armeen: links/rechts im Duell, sonst in die Ecken
  const ZONES = {
    2: [{ x: 40, y: 110, w: 160, h: 420 }, { x: 800, y: 110, w: 160, h: 420 }],
    3: [{ x: 40, y: 150, w: 160, h: 340 }, { x: 720, y: 20, w: 250, h: 180 }, { x: 720, y: 440, w: 250, h: 180 }],
    4: [{ x: 30, y: 25, w: 240, h: 175 }, { x: 730, y: 25, w: 240, h: 175 }, { x: 730, y: 440, w: 240, h: 175 }, { x: 30, y: 440, w: 240, h: 175 }],
  };
  const SLOT = 56;

  function circleHits(o, x, y, r) {
    if (o.t === 'circle') return Math.hypot(x - o.x, y - o.y) < o.r + r;
    const cx = Math.max(o.x, Math.min(x, o.x + o.w));
    const cy = Math.max(o.y, Math.min(y, o.y + o.h));
    return Math.hypot(x - cx, y - cy) < r;
  }

  function inBounds(x, y, r) {
    return x >= r && y >= r && x <= W - r && y <= H - r;
  }

  // Steht hier ein Hindernis im Weg? (Hubschrauber fliegen drüber)
  function blockedByTerrain(map, x, y, r, flies = false) {
    if (!inBounds(x, y, r)) return true;
    if (flies) return false;
    return map.obstacles.some((o) => circleHits(o, x, y, r));
  }

  // Aufstellung: Raster im Startbereich, die Plätze nah an der Zonenmitte zuerst
  function layout(mapId, sides, count) {
    const map = MAPS[mapId];
    return ZONES[sides].map((z) => {
      const cols = Math.max(1, Math.floor(z.w / SLOT));
      const rows = Math.max(1, Math.floor(z.h / SLOT));
      const x0 = z.x + (z.w - (cols - 1) * SLOT) / 2;
      const y0 = z.y + (z.h - (rows - 1) * SLOT) / 2;
      const slots = [];
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const x = x0 + i * SLOT;
          const y = y0 + j * SLOT;
          if (!blockedByTerrain(map, x, y, 22)) slots.push({ x, y });
        }
      }
      const zc = { x: z.x + z.w / 2, y: z.y + z.h / 2 };
      slots.sort((a, b) => Math.hypot(a.x - zc.x, a.y - zc.y) - Math.hypot(b.x - zc.x, b.y - zc.y) || a.x - b.x || a.y - b.y);
      const chosen = slots.slice(0, count);
      // Der Funker steht ganz hinten, also am weitesten von der Mitte der Karte weg
      chosen.sort((a, b) => Math.hypot(b.x - CENTER.x, b.y - CENTER.y) - Math.hypot(a.x - CENTER.x, a.y - CENTER.y));
      return chosen;
    });
  }

  // Erster Schnittpunkt der Strecke p0→p1 mit einem Kreis (0..1) oder null
  function segCircle(x0, y0, x1, y1, cx, cy, r) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const fx = x0 - cx;
    const fy = y0 - cy;
    const a = dx * dx + dy * dy;
    const c0 = fx * fx + fy * fy - r * r;
    if (c0 <= 0) return 0;
    if (a === 0) return null;
    const b = 2 * (fx * dx + fy * dy);
    const disc = b * b - 4 * a * c0;
    if (disc < 0) return null;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    return t >= 0 && t <= 1 ? t : null;
  }

  function segRect(x0, y0, x1, y1, o) {
    let t0 = 0;
    let t1 = 1;
    const dx = x1 - x0;
    const dy = y1 - y0;
    for (const [p, q] of [[-dx, x0 - o.x], [dx, o.x + o.w - x0], [-dy, y0 - o.y], [dy, o.y + o.h - y0]]) {
      if (p === 0) {
        if (q < 0) return null;
      } else {
        const t = q / p;
        if (p < 0) t0 = Math.max(t0, t);
        else t1 = Math.min(t1, t);
        if (t0 > t1) return null;
      }
    }
    return t0;
  }

  // Wo bleibt ein Schuss hängen? Feste Hindernisse und gegnerische Einheiten halten ihn auf,
  // über die eigenen Schafe (friendly) schießt man hinweg.
  function cast(map, units, x0, y0, x1, y1, { ignore = null, friendly = null, walls = true } = {}) {
    let best = { t: 1, unit: null, wall: false };
    if (walls) {
      for (const o of map.obstacles) {
        if (!SOLID.has(o.k)) continue;
        const t = o.t === 'circle' ? segCircle(x0, y0, x1, y1, o.x, o.y, o.r) : segRect(x0, y0, x1, y1, o);
        if (t !== null && t < best.t) best = { t, unit: null, wall: true };
      }
    }
    for (const u of units) {
      if (u.id === ignore || u.hp <= 0 || (friendly && u.side === friendly)) continue;
      const t = segCircle(x0, y0, x1, y1, u.x, u.y, u.r);
      if (t !== null && t < best.t) best = { t, unit: u.id, wall: false };
    }
    return { ...best, x: x0 + (x1 - x0) * best.t, y: y0 + (y1 - y0) * best.t };
  }

  return { W, H, CENTER, TYPES, ARMIES, MAPS, MAP_IDS, ZONES, SOLID, MEDKIT_R, typeFor, layout, circleHits, blockedByTerrain, cast };
}));
