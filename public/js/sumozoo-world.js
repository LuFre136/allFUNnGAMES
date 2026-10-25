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
  const WALL = 9; // halbe Dicke einer Mauer

  // Mauer als Strecke
  const seg = (x1, y1, x2, y2) => ({ x1, y1, x2, y2 });

  // Mauerstücke auf einem Kreisbogen (Grad), als kurze Strecken
  function arcWalls(cx, cy, r, from, to, parts = 3) {
    const out = [];
    for (let i = 0; i < parts; i++) {
      const a = ((from + ((to - from) * i) / parts) * Math.PI) / 180;
      const b = ((from + ((to - from) * (i + 1)) / parts) * Math.PI) / 180;
      out.push(seg(cx + r * Math.cos(a), cy + r * Math.sin(a), cx + r * Math.cos(b), cy + r * Math.sin(b)));
    }
    return out;
  }

  // Felsplateau: Mauern an allen Seiten, offen sind die Ecken und je eine Lücke in der Mitte jeder Seite
  const PLATEAU_WALLS = [
    seg(150, 71, 430, 71), seg(570, 71, 850, 71),
    seg(150, 569, 430, 569), seg(570, 569, 850, 569),
    seg(71, 150, 71, 270), seg(71, 370, 71, 490),
    seg(929, 150, 929, 270), seg(929, 370, 929, 490),
  ];

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
      walls: PLATEAU_WALLS,
      circle: { r: 175 },
      anchors: PLATEAU_ANCHORS,
    },
    ring: {
      id: 'ring',
      name: 'Sumo-Ring',
      icon: '⭕',
      description: 'Rund und gleich fair für alle Seiten.',
      shapes: [{ t: 'circle', x: CENTER.x, y: CENTER.y, r: 295 }],
      holes: [],
      // Acht Mauerbögen, dazwischen acht Lücken
      walls: Array.from({ length: 8 }, (_, k) => arcWalls(CENTER.x, CENTER.y, 284, k * 45 + 8, k * 45 + 37)).flat(),
      circle: { r: 170, pair: 70 },
      anchors: { 2: ringAnchors([180, 0]), 3: ringAnchors([180, 300, 60]), 4: ringAnchors([225, 315, 45, 135]) },
    },
    wasserloch: {
      id: 'wasserloch',
      name: 'Wasserloch',
      icon: '💧',
      description: 'Ein Loch in der Mitte. Wer durch die Mitte schießt, riskiert ein Eigentor.',
      shapes: [{ t: 'rect', x: 60, y: 60, w: 880, h: 520, r: 70 }],
      holes: [{ t: 'circle', x: CENTER.x, y: CENTER.y, r: 85 }],
      walls: PLATEAU_WALLS,
      circle: { r: 180 },
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
      // Außen Mauern mit Lücken, zum Wasser in der Mitte hin offen
      walls: [
        seg(71, 150, 71, 280), seg(71, 360, 71, 490), seg(110, 101, 350, 101), seg(110, 539, 350, 539),
        seg(929, 150, 929, 280), seg(929, 360, 929, 490), seg(650, 101, 890, 101), seg(650, 539, 890, 539),
      ],
      circle: null,
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

  // Abstand eines Punkts zu einer Mauer
  function wallDist(w, x, y) {
    const dx = w.x2 - w.x1;
    const dy = w.y2 - w.y1;
    const t = Math.max(0, Math.min(1, ((x - w.x1) * dx + (y - w.y1) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x - (w.x1 + t * dx), y - (w.y1 + t * dy));
  }

  function clearOfWalls(map, x, y, margin) {
    return map.walls.every((w) => wallDist(w, x, y) >= margin);
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

  // Passt eine Aufstellung? Alle auf dem Felsen, weg von Kanten und Mauern, keine Überlappung
  function valid(map, groups) {
    const all = groups.flat();
    for (const p of all) if (!safe(map, p.x, p.y, RADIUS + 12) || !clearOfWalls(map, p.x, p.y, RADIUS + WALL + 4)) return false;
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        if (Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y) < 2 * RADIUS + 4) return false;
      }
    }
    return true;
  }

  // Wie im Original: Die Tiere stehen abwechselnd im Kreis in der Mitte, je zwei stehen draußen auf der eigenen Seite
  function circleLayout(map, sides, count) {
    if (!map.circle) return null;
    const anchors = map.anchors[sides];
    const extra = count >= 4 ? 2 : 0;
    const total = sides * (count - extra);
    const r = map.circle.r; // groß wie im Original
    const groups = Array.from({ length: sides }, () => []);
    for (let i = 0; i < total; i++) {
      const a = Math.PI + ((i + 0.5) / total) * Math.PI * 2;
      groups[i % sides].push({ x: Math.round(CENTER.x + r * Math.cos(a)), y: Math.round(CENTER.y + r * Math.sin(a)) });
    }
    anchors.forEach((anchor, s) => {
      const len = Math.hypot(anchor.x - CENTER.x, anchor.y - CENTER.y) || 1;
      const fx = (anchor.x - CENTER.x) / len;
      const fy = (anchor.y - CENTER.y) / len;
      const d = r + (map.circle.pair || 85);
      for (let k = 0; k < extra; k++) {
        const off = (k === 0 ? -1 : 1) * GAP * 0.85;
        groups[s].push({ x: Math.round(CENTER.x + fx * d - fy * off), y: Math.round(CENTER.y + fy * d + fx * off) });
      }
    });
    return valid(map, groups) ? groups : null;
  }

  // Positionen aller Tiere: eine Liste pro Seite, oder null, wenn die Aufstellung nicht passt
  function layout(mapId, sides, count, pattern) {
    const map = MAPS[mapId];
    if (pattern === 'kreis') return map ? circleLayout(map, sides, count) : null;
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
    return valid(map, groups) ? groups : null;
  }

  // Alle Aufstellungen, die auf diese Karte passen (der Block passt immer)
  function patternsFor(mapId, sides, count) {
    return PATTERN_IDS.filter((p) => layout(mapId, sides, count, p));
  }

  // Zielhilfe: Wie weit kommt ein Tier in Richtung angle, bis es ein anderes trifft? (höchstens maxLen)
  function aimLine(animals, from, angle, maxLen, walls = null) {
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
    // Mauern: in kleinen Schritten prüfen, wo das Tier anstößt
    for (let t = RADIUS; t < best; t += 4) {
      const x = from.x + dx * t;
      const y = from.y + dy * t;
      if (walls && !clearOfWalls({ walls }, x, y, RADIUS + WALL)) return { length: t, hit: null, wall: true };
    }
    return { length: best, hit };
  }

  return { W, H, RADIUS, WALL, CENTER, MAPS, MAP_IDS, PATTERN_IDS, onGround, wallDist, layout, patternsFor, aimLine };
}));
