// Sumo Zoo: Karten, Aufstellungen und Geometrie. Läuft auf dem Server (Physik, Aufstellung) und im Browser
// (Zeichnen, Zielhilfe), deshalb ohne Abhängigkeiten.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SzWorld = factory();
}(typeof self !== 'undefined' ? self : this, () => {
  const W = 1000; // Weltgröße, Querformat wie der Fernseher
  const H = 640;
  const RADIUS = 24; // alle Tiere gleich groß und gleich schwer
  const GAP = 2 * RADIUS + 8; // Abstand in der Aufstellung
  const CENTER = { x: W / 2, y: H / 2 };

  // Ankerpunkt pro Seite (im Uhrzeigersinn), von dort schaut die Gruppe zur Mitte
  function ringAnchors(angles, r = 175) {
    return angles.map((a) => ({ x: CENTER.x + r * Math.cos((a * Math.PI) / 180), y: CENTER.y + r * Math.sin((a * Math.PI) / 180) }));
  }

  const PLATEAU_ANCHORS = {
    2: [{ x: 240, y: 320 }, { x: 760, y: 320 }],
    3: [{ x: 230, y: 320 }, { x: 720, y: 195 }, { x: 720, y: 445 }],
    4: [{ x: 250, y: 200 }, { x: 750, y: 200 }, { x: 750, y: 440 }, { x: 250, y: 440 }],
  };

  const MAPS = {
    plateau: {
      id: 'plateau',
      name: 'Felsplateau',
      icon: '🪨',
      description: 'Eckig wie ein Billardtisch, ohne Bande.',
      shapes: [{ t: 'rect', x: 60, y: 60, w: 880, h: 520, r: 70 }],
      holes: [],
      anchors: PLATEAU_ANCHORS,
    },
    ring: {
      id: 'ring',
      name: 'Sumo-Ring',
      icon: '⭕',
      description: 'Rund und gleich fair für alle Seiten.',
      shapes: [{ t: 'circle', x: CENTER.x, y: CENTER.y, r: 295 }],
      holes: [],
      anchors: { 2: ringAnchors([180, 0]), 3: ringAnchors([180, 300, 60]), 4: ringAnchors([225, 315, 45, 135]) },
    },
    wasserloch: {
      id: 'wasserloch',
      name: 'Wasserloch',
      icon: '💧',
      description: 'Ein Loch in der Mitte. Wer durch die Mitte schießt, riskiert ein Eigentor.',
      shapes: [{ t: 'rect', x: 60, y: 60, w: 880, h: 520, r: 70 }],
      holes: [{ t: 'circle', x: CENTER.x, y: CENTER.y, r: 85 }],
      anchors: PLATEAU_ANCHORS,
    },
    bruecke: {
      id: 'bruecke',
      name: 'Brücke',
      icon: '🌉',
      description: 'Zwei Inseln mit einem schmalen Steg dazwischen.',
      shapes: [
        { t: 'rect', x: 60, y: 90, w: 340, h: 460, r: 40 },
        { t: 'rect', x: 600, y: 90, w: 340, h: 460, r: 40 },
        { t: 'rect', x: 380, y: 280, w: 240, h: 80, r: 0 },
      ],
      holes: [],
      anchors: {
        2: [{ x: 230, y: 320 }, { x: 770, y: 320 }],
        3: [{ x: 230, y: 320 }, { x: 770, y: 205 }, { x: 770, y: 435 }],
        4: [{ x: 230, y: 205 }, { x: 770, y: 205 }, { x: 770, y: 435 }, { x: 230, y: 435 }],
      },
    },
  };
  const MAP_IDS = Object.keys(MAPS);

  function inShape(s, x, y) {
    if (s.t === 'circle') return (x - s.x) ** 2 + (y - s.y) ** 2 <= s.r ** 2;
    // Rechteck mit abgerundeten Ecken
    const cx = Math.min(Math.max(x, s.x + s.r), s.x + s.w - s.r);
    const cy = Math.min(Math.max(y, s.y + s.r), s.y + s.h - s.r);
    if (s.r === 0) return x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h;
    return (x - cx) ** 2 + (y - cy) ** 2 <= s.r ** 2;
  }

  // Steht ein Tier mit seiner Mitte auf dem Felsen?
  function onGround(map, x, y) {
    return map.shapes.some((s) => inShape(s, x, y)) && !map.holes.some((s) => inShape(s, x, y));
  }

  // Mit Sicherheitsabstand zur Kante (für die Aufstellung)
  function safe(map, x, y, margin) {
    if (!onGround(map, x, y)) return false;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      if (!onGround(map, x + Math.cos(a) * margin, y + Math.sin(a) * margin)) return false;
    }
    return true;
  }

  // Aufstellungen einer Gruppe in eigenen Koordinaten: u zeigt zur Mitte, v quer dazu
  const PATTERNS = {
    block(n) {
      const cols = n <= 4 ? 2 : 3;
      const rows = Math.ceil(n / cols);
      const out = [];
      for (let i = 0; i < n; i++) {
        const row = Math.floor(i / cols);
        const inRow = Math.min(cols, n - row * cols);
        const col = i % cols;
        out.push({ u: ((rows - 1) / 2 - row) * GAP, v: (col - (inRow - 1) / 2) * GAP });
      }
      return out;
    },
    line(n) {
      return Array.from({ length: n }, (_, i) => ({ u: 0, v: (i - (n - 1) / 2) * GAP }));
    },
    // Dreieck wie beim Billard, Spitze zur Mitte
    wedge(n) {
      const out = [];
      let row = 0;
      while (out.length < n) {
        const inRow = Math.min(row + 1, n - out.length);
        for (let i = 0; i < inRow; i++) out.push({ u: -row * GAP * 0.87, v: (i - row / 2) * GAP });
        row++;
      }
      const shift = ((row - 1) * GAP * 0.87) / 2;
      return out.map((p) => ({ u: p.u + shift, v: p.v }));
    },
    circle(n) {
      if (n < 3) return PATTERNS.line(n);
      const r = GAP / (2 * Math.sin(Math.PI / n));
      return Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        return { u: Math.cos(a) * r, v: Math.sin(a) * r };
      });
    },
  };
  const PATTERN_IDS = Object.keys(PATTERNS);

  // Positionen aller Tiere: eine Liste pro Seite, oder null, wenn die Aufstellung nicht passt
  function layout(mapId, sides, count, pattern) {
    const map = MAPS[mapId];
    const anchors = map?.anchors[sides];
    if (!anchors || !PATTERNS[pattern]) return null;
    const groups = anchors.map((a) => {
      const len = Math.hypot(CENTER.x - a.x, CENTER.y - a.y) || 1;
      const fx = (CENTER.x - a.x) / len;
      const fy = (CENTER.y - a.y) / len;
      return PATTERNS[pattern](count).map(({ u, v }) => ({
        x: Math.round(a.x + u * fx - v * fy),
        y: Math.round(a.y + u * fy + v * fx),
      }));
    });
    const all = groups.flat();
    for (const p of all) if (!safe(map, p.x, p.y, RADIUS + 12)) return null;
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        if (Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y) < 2 * RADIUS + 4) return null;
      }
    }
    return groups;
  }

  // Alle Aufstellungen, die auf diese Karte passen (der Block passt immer)
  function patternsFor(mapId, sides, count) {
    return PATTERN_IDS.filter((p) => layout(mapId, sides, count, p));
  }

  // Zielhilfe: Wie weit kommt ein Tier in Richtung angle, bis es ein anderes trifft? (höchstens maxLen)
  function aimLine(animals, from, angle, maxLen) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let best = maxLen;
    let hit = null;
    for (const a of animals) {
      if (a.id === from.id || !a.alive) continue;
      const ox = a.x - from.x;
      const oy = a.y - from.y;
      const along = ox * dx + oy * dy;
      if (along <= 0) continue;
      const side2 = ox * ox + oy * oy - along * along;
      const r2 = (2 * RADIUS) ** 2;
      if (side2 > r2) continue;
      const t = along - Math.sqrt(r2 - side2);
      if (t < best) {
        best = Math.max(0, t);
        hit = a.id;
      }
    }
    return { length: best, hit };
  }

  return { W, H, RADIUS, CENTER, MAPS, MAP_IDS, PATTERN_IDS, onGround, layout, patternsFor, aimLine };
}));
