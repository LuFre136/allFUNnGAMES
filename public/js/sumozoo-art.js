// Sumo Zoo: Spielsteine als SVG – jedes Tier sitzt in einem Schwimmreifen, die Streifen haben die Farbe der Seite.
// Alles selbst gezeichnet, ohne Bilddateien. Läuft im Browser und in Node (für Vorschaubilder).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SzArt = factory();
}(typeof self !== 'undefined' ? self : this, () => {
  const SKIN = '#f1c79b';

  // Farbe abdunkeln (für den Rand des Reifens)
  function darker(hex, k = 0.65) {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * k));
    return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  }

  // Reifen, Wasser und Schatten
  function frame(color, uid) {
    const edge = darker(color);
    return `<defs>
      <radialGradient id="sh${uid}" cx="50%" cy="40%" r="60%"><stop offset="60%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.25"/></radialGradient>
      <radialGradient id="wa${uid}" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#0284c7"/></radialGradient>
    </defs>
    <ellipse cx="100" cy="110" rx="90" ry="86" fill="#000" opacity="0.22"/>
    <circle cx="100" cy="100" r="70" fill="none" stroke="#fff7ed" stroke-width="38"/>
    <circle cx="100" cy="100" r="70" fill="none" stroke="${color}" stroke-width="38" stroke-dasharray="54.98 54.98" transform="rotate(-22 100 100)"/>
    <circle cx="100" cy="100" r="89" fill="none" stroke="${edge}" stroke-width="2"/>
    <circle cx="100" cy="100" r="51" fill="none" stroke="${edge}" stroke-width="2"/>
    <circle cx="100" cy="100" r="70" fill="none" stroke="url(#sh${uid})" stroke-width="38"/>
    <path d="M 42 70 A 64 64 0 0 1 86 38" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity="0.8"/>
    <circle cx="100" cy="100" r="50" fill="url(#wa${uid})"/>`;
  }

  // Körper und Arme, die auf dem Reifen liegen
  function body(fur, hand = SKIN) {
    return `<ellipse cx="100" cy="124" rx="30" ry="22" fill="${fur}"/>
    <path d="M 76 118 Q 52 128 40 146" fill="none" stroke="${fur}" stroke-width="14" stroke-linecap="round"/>
    <path d="M 124 118 Q 148 128 160 146" fill="none" stroke="${fur}" stroke-width="14" stroke-linecap="round"/>
    <circle cx="38" cy="149" r="9" fill="${hand}"/><circle cx="162" cy="149" r="9" fill="${hand}"/>`;
  }

  function eyes(y = 85, dx = 12, r = 6, white = true) {
    const one = (x) => `${white ? `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 1.25}" fill="#fff"/>` : ''}
      <circle cx="${x + 1}" cy="${y + 1}" r="${r * 0.6}" fill="#1c1917"/><circle cx="${x + 2}" cy="${y - 0.5}" r="${r * 0.2}" fill="#fff"/>`;
    return one(100 - dx) + one(100 + dx);
  }

  function cheeks(y = 102, dx = 20) {
    return `<circle cx="${100 - dx}" cy="${y}" r="4" fill="#fb7185" opacity="0.45"/><circle cx="${100 + dx}" cy="${y}" r="4" fill="#fb7185" opacity="0.45"/>`;
  }

  function smile(y = 106, w = 12, color = '#5b3413') {
    return `<path d="M ${100 - w} ${y} Q 100 ${y + 11} ${100 + w} ${y}" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round"/>`;
  }

  const ANIMALS = {
    affe() {
      return `${body('#7c4a1e')}
      <circle cx="62" cy="86" r="14" fill="#7c4a1e"/><circle cx="138" cy="86" r="14" fill="#7c4a1e"/>
      <circle cx="62" cy="86" r="8" fill="${SKIN}"/><circle cx="138" cy="86" r="8" fill="${SKIN}"/>
      <circle cx="100" cy="88" r="38" fill="#8b5a2b"/>
      <path d="M 92 52 Q 96 42 102 50 Q 106 40 110 52" fill="#8b5a2b"/>
      <circle cx="87" cy="86" r="15" fill="${SKIN}"/><circle cx="113" cy="86" r="15" fill="${SKIN}"/>
      <ellipse cx="100" cy="104" rx="25" ry="17" fill="${SKIN}"/>
      ${eyes()}
      <circle cx="96" cy="98" r="1.8" fill="#5b3413"/><circle cx="104" cy="98" r="1.8" fill="#5b3413"/>
      ${smile()}${cheeks()}`;
    },
    elefant() {
      const g = '#94a3b8';
      return `${body(g, '#cbd5e1')}
      <ellipse cx="58" cy="88" rx="24" ry="30" fill="${g}"/><ellipse cx="142" cy="88" rx="24" ry="30" fill="${g}"/>
      <ellipse cx="60" cy="88" rx="15" ry="20" fill="#f9a8d4" opacity="0.7"/><ellipse cx="140" cy="88" rx="15" ry="20" fill="#f9a8d4" opacity="0.7"/>
      <circle cx="100" cy="86" r="36" fill="${g}"/>
      <path d="M 100 92 C 92 108 94 124 104 130 C 112 134 118 126 112 122 C 106 120 104 112 108 96 Z" fill="${g}" stroke="#64748b" stroke-width="2"/>
      <path d="M 86 108 Q 82 118 88 122" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
      <path d="M 116 108 Q 120 118 114 122" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
      ${eyes(80, 14, 5.5)}${cheeks(96, 24)}`;
    },
    nilpferd() {
      const c = '#a79ab4';
      return `${body(c, '#c4b5d0')}
      <circle cx="74" cy="56" r="9" fill="${c}"/><circle cx="126" cy="56" r="9" fill="${c}"/>
      <circle cx="74" cy="56" r="4.5" fill="#f9a8d4"/><circle cx="126" cy="56" r="4.5" fill="#f9a8d4"/>
      <ellipse cx="100" cy="80" rx="34" ry="28" fill="${c}"/>
      <ellipse cx="100" cy="106" rx="38" ry="24" fill="#c4b5d0"/>
      <ellipse cx="88" cy="100" rx="4" ry="5" fill="#5b4a66"/><ellipse cx="112" cy="100" rx="4" ry="5" fill="#5b4a66"/>
      <path d="M 82 114 Q 100 124 118 114" fill="none" stroke="#5b4a66" stroke-width="2.6" stroke-linecap="round"/>
      <rect x="90" y="115" width="6" height="7" rx="2" fill="#fff"/><rect x="104" y="115" width="6" height="7" rx="2" fill="#fff"/>
      ${eyes(72, 13, 5.5)}${cheeks(108, 30)}`;
    },
    zebra() {
      return `${body('#f5f5f4', '#1c1917')}
      <path d="M 64 128 L 70 120 M 136 128 L 130 120" stroke="#1c1917" stroke-width="4"/>
      <path d="M 72 62 L 66 40 L 84 56 Z" fill="#f5f5f4" stroke="#1c1917" stroke-width="2"/>
      <path d="M 128 62 L 134 40 L 116 56 Z" fill="#f5f5f4" stroke="#1c1917" stroke-width="2"/>
      <ellipse cx="100" cy="88" rx="32" ry="38" fill="#f5f5f4"/>
      <path d="M 70 76 Q 80 74 84 80 M 68 90 Q 78 88 82 94 M 130 76 Q 120 74 116 80 M 132 90 Q 122 88 118 94 M 92 54 Q 100 60 108 54 M 90 64 Q 100 70 110 64" fill="none" stroke="#1c1917" stroke-width="4" stroke-linecap="round"/>
      <path d="M 92 50 Q 96 40 100 48 Q 104 38 108 50" fill="#1c1917"/>
      <ellipse cx="100" cy="112" rx="22" ry="15" fill="#44403c"/>
      <ellipse cx="92" cy="110" rx="3" ry="4" fill="#1c1917"/><ellipse cx="108" cy="110" rx="3" ry="4" fill="#1c1917"/>
      ${smile(117, 8, '#e7e5e4')}${eyes(84, 13, 5.5)}`;
    },
    loewe() {
      const mane = Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 2;
        return `<circle cx="${(100 + Math.cos(a) * 36).toFixed(1)}" cy="${(88 + Math.sin(a) * 36).toFixed(1)}" r="14" fill="#b45309"/>`;
      }).join('');
      return `${body('#f59e0b', '#fcd34d')}${mane}
      <circle cx="72" cy="62" r="9" fill="#f59e0b"/><circle cx="128" cy="62" r="9" fill="#f59e0b"/>
      <circle cx="100" cy="90" r="32" fill="#fbbf24"/>
      <ellipse cx="100" cy="104" rx="18" ry="13" fill="#fde68a"/>
      <path d="M 93 97 L 107 97 L 100 105 Z" fill="#7c2d12"/>
      <path d="M 100 105 L 100 109" stroke="#7c2d12" stroke-width="2"/>
      ${smile(108, 9, '#7c2d12')}
      <path d="M 80 104 L 66 101 M 80 108 L 66 110 M 120 104 L 134 101 M 120 108 L 134 110" stroke="#92400e" stroke-width="1.5" stroke-linecap="round"/>
      ${eyes(86, 12, 5.5)}${cheeks(100, 22)}`;
    },
    panda() {
      return `${body('#1c1917', '#1c1917')}
      <circle cx="68" cy="60" r="13" fill="#1c1917"/><circle cx="132" cy="60" r="13" fill="#1c1917"/>
      <circle cx="100" cy="88" r="37" fill="#fafaf9"/>
      <ellipse cx="86" cy="86" rx="10" ry="13" fill="#1c1917" transform="rotate(25 86 86)"/>
      <ellipse cx="114" cy="86" rx="10" ry="13" fill="#1c1917" transform="rotate(-25 114 86)"/>
      <circle cx="88" cy="86" r="4.5" fill="#fff"/><circle cx="112" cy="86" r="4.5" fill="#fff"/>
      <circle cx="88.5" cy="86.5" r="2.6" fill="#1c1917"/><circle cx="112.5" cy="86.5" r="2.6" fill="#1c1917"/>
      <ellipse cx="100" cy="102" rx="6" ry="4.5" fill="#1c1917"/>
      ${smile(108, 8, '#1c1917')}${cheeks(102, 24)}`;
    },
    pinguin() {
      return `<ellipse cx="100" cy="124" rx="30" ry="22" fill="#1e293b"/>
      <path d="M 74 116 Q 50 124 38 144 Q 52 146 72 128 Z" fill="#1e293b"/>
      <path d="M 126 116 Q 150 124 162 144 Q 148 146 128 128 Z" fill="#1e293b"/>
      <circle cx="100" cy="88" r="36" fill="#1e293b"/>
      <path d="M 100 64 C 86 54 66 66 70 88 C 72 106 86 118 100 120 C 114 118 128 106 130 88 C 134 66 114 54 100 64 Z" fill="#f8fafc"/>
      <path d="M 90 98 L 110 98 L 100 110 Z" fill="#f97316"/>
      ${eyes(84, 12, 5.5)}${cheeks(102, 20)}`;
    },
    frosch() {
      const g = '#4ade80';
      return `${body('#22c55e', '#86efac')}
      <ellipse cx="100" cy="96" rx="42" ry="30" fill="${g}"/>
      <circle cx="78" cy="68" r="15" fill="${g}"/><circle cx="122" cy="68" r="15" fill="${g}"/>
      <circle cx="78" cy="68" r="10" fill="#fff"/><circle cx="122" cy="68" r="10" fill="#fff"/>
      <circle cx="79" cy="69" r="5.5" fill="#1c1917"/><circle cx="123" cy="69" r="5.5" fill="#1c1917"/>
      <circle cx="81" cy="67" r="1.8" fill="#fff"/><circle cx="125" cy="67" r="1.8" fill="#fff"/>
      <circle cx="94" cy="90" r="1.8" fill="#166534"/><circle cx="106" cy="90" r="1.8" fill="#166534"/>
      <path d="M 74 100 Q 100 122 126 100" fill="none" stroke="#166534" stroke-width="3" stroke-linecap="round"/>
      ${cheeks(102, 32)}`;
    },
  };
  const KEYS = Object.keys(ANIMALS);

  let seq = 0;
  // Ganze SVG-Datei eines Spielsteins
  function svg(species, color, size = 200) {
    const draw = ANIMALS[species] || ANIMALS.affe;
    const uid = `${species}${++seq}`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="${size}" height="${size}">${frame(color, uid)}${draw()}</svg>`;
  }

  // Nur der Schwimmreifen (für Spielsteine mit Profilbild)
  function ring(color, size = 200) {
    const uid = `ring${++seq}`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="${size}" height="${size}">${frame(color, uid)}</svg>`;
  }

  return { svg, ring, KEYS, HOLE: 51 };
}));
