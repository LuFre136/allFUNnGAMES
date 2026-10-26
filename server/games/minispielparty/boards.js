// Spielbretter für den Brettmodus der Minispiel Party. Jedes Feld hat eine Position (Brett 1000 × 600),
// eine Art und seine Nachfolger. Zwei Nachfolger heißt Abzweig: Der Spieler entscheidet.

// Rundkurs als abgerundetes Rechteck, Punkte gleichmäßig verteilt, Start unten in der Mitte, gegen den Uhrzeigersinn
function loop(n, { x0, y0, x1, y1, r }) {
  const w = x1 - x0 - 2 * r;
  const h = y1 - y0 - 2 * r;
  const arc = (Math.PI / 2) * r;
  const segs = [
    { len: w / 2, at: (d) => [x0 + r + w / 2 - d, y1] }, // unten nach links
    { len: arc, at: (d) => { const a = Math.PI / 2 + d / r; return [x0 + r + r * Math.cos(a), y1 - r + r * Math.sin(a)]; } },
    { len: h, at: (d) => [x0, y1 - r - d] }, // links nach oben
    { len: arc, at: (d) => { const a = Math.PI + d / r; return [x0 + r + r * Math.cos(a), y0 + r + r * Math.sin(a)]; } },
    { len: w, at: (d) => [x0 + r + d, y0] }, // oben nach rechts
    { len: arc, at: (d) => { const a = -Math.PI / 2 + d / r; return [x1 - r + r * Math.cos(a), y0 + r + r * Math.sin(a)]; } },
    { len: h, at: (d) => [x1, y0 + r + d] }, // rechts nach unten
    { len: arc, at: (d) => { const a = d / r; return [x1 - r + r * Math.cos(a), y1 - r + r * Math.sin(a)]; } },
    { len: w / 2, at: (d) => [x1 - r - d, y1] }, // unten zurück zur Mitte
  ];
  const total = segs.reduce((s, g) => s + g.len, 0);
  const points = [];
  for (let i = 0; i < n; i++) {
    let d = (i / n) * total;
    for (const g of segs) {
      if (d <= g.len) {
        points.push(g.at(d).map(Math.round));
        break;
      }
      d -= g.len;
    }
  }
  return points;
}

function rummelplatz() {
  const kinds = ['start', 'blue', 'blue', 'red', 'event', 'blue', 'luck', 'blue', 'shop', 'blue', 'red', 'duel', 'blue', 'event', 'blue', 'bad',
    'blue', 'blue', 'luck', 'red', 'blue', 'event', 'blue', 'blue', 'blue', 'shop', 'red', 'blue', 'duel', 'event', 'blue', 'luck'];
  const pts = loop(kinds.length, { x0: 70, y0: 70, x1: 930, y1: 530, r: 120 });
  const fields = kinds.map((kind, i) => ({ id: i, x: pts[i][0], y: pts[i][1], kind, next: [(i + 1) % kinds.length] }));
  // Abkürzung von oben quer durch die Mitte nach rechts: spart drei Felder, ist aber gefährlich
  const from = fields.find((f) => f.id === 16);
  const to = fields.find((f) => f.id === 24);
  const shortKinds = ['red', 'bad', 'duel', 'event'];
  shortKinds.forEach((kind, j) => {
    const q = (j + 1) / (shortKinds.length + 1);
    fields.push({
      id: 32 + j,
      x: Math.round(from.x + (to.x - from.x) * q - 60 * Math.sin(q * Math.PI)),
      y: Math.round(from.y + (to.y - from.y) * q + 70 * Math.sin(q * Math.PI)),
      kind,
      next: [j + 1 < shortKinds.length ? 33 + j : 24],
      shortcut: true,
    });
  });
  from.next = [17, 32];
  return {
    id: 'rummelplatz',
    name: 'Rummelplatz',
    icon: '🎡',
    start: 0,
    fields,
    // Hier kann der Stern stehen: blaue Felder auf dem Rundkurs, nicht direkt am Start
    starSpots: fields.filter((f) => f.kind === 'blue' && !f.shortcut && f.id > 2).map((f) => f.id),
    forks: { 16: { 17: 'Außen herum', 32: 'Abkürzung (gefährlich!)' } },
  };
}

module.exports = { rummelplatz: rummelplatz() };
