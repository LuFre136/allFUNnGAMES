// Sumo Zoo: Spielansicht für Host und Handys (nutzt die Helfer aus lobby.js und SzWorld)

(() => {
  const W = SzWorld;
  const R0 = W.RADIUS;
  const MAX_PULL = 200; // so weit zieht man für volle Stärke (Weltpunkte)
  const MIN_POWER = 0.06;
  const FALL_TAIL = 0.5;
  const ANIMALS = [[0, 'Automatisch'], [3, '3'], [4, '4'], [5, '5'], [6, '6'], [7, '7'], [8, '8']];
  const SETS = [1, 2, 3];
  const TIMES = [0, 20, 40];
  const FALL_LINES = ['Platsch!', 'Tschüss!', 'Und weg!', 'Abgang!', 'Bye!'];

  const canvas = document.createElement('canvas');
  canvas.className = 'sz-canvas';
  const ctx = canvas.getContext('2d');
  const sz = {
    view: null, // Umrechnung Welt ↔ Bildschirm
    rotKey: null,
    rot: 0,
    drag: null, // { animalId, wx, wy } beim Zielen auf diesem Gerät
    remote: null, // Zielen eines anderen Geräts
    lastAimSent: 0,
    aimTimer: null,
    frame: null,
    shotEndRendered: 0,
  };

  function act(type, data = {}) {
    socket.emit('game:action', { type, ...data }, (res) => {
      if (res?.error) toast(res.error);
    });
  }

  function playerName(id) {
    return playerById(id)?.name || 'Jemand';
  }

  function sharedHere() {
    return S.players.some((p) => p.guestOf === S.me.id);
  }

  function now() {
    return Date.now() + clockOffset;
  }

  function sideById(R, id) {
    return R.sides.find((s) => s.id === id) || null;
  }

  // Großer Bildschirm: Fernseher bzw. Host-Gerät, das nicht selbst zielt
  function bigScreen(R) {
    return S.me.isHost && (isGamemaster() || R.tv);
  }

  // Läuft gerade ein Stoß auf dem Bildschirm?
  function playing(R) {
    const shot = R.shot;
    return Boolean(shot && R.phase === 'rolling' && now() < shot.startAt + shot.duration + 400);
  }

  // ---------- Lobby ----------

  function lobbyExtra() {
    if (S.me.isHost && !S.settings.hostPlays) return '';
    if (S.settings.game.teamMode) return '';
    const guests = S.players.filter((p) => p.guestOf === S.me.id);
    return `<div class="card stack">
      <h3 style="margin:0">Mitspieler an diesem Gerät</h3>
      <div class="small muted">Nur ein Handy für zwei? Trag hier die zweite Person ein und gebt das Gerät reihum weiter. Es steht immer da, wer gerade schubst.</div>
      ${guests.map((p) => `<div class="member">${avatarHtml(p, 'sm')}<span class="name">${esc(p.name)}</span>
        <button class="btn small icon ghost" data-action="szRemoveGuest" data-player="${p.id}" title="Entfernen">✕</button></div>`).join('')}
      <form id="sz-guest-form" class="row" style="flex-wrap:nowrap">
        <input id="sz-guest-name" type="text" maxlength="24" placeholder="Name" autocomplete="off" style="flex:1;min-width:0">
        <button class="btn primary small" type="submit">+ Hinzufügen</button>
      </form>
    </div>`;
  }

  function seg(key, value, options) {
    return `<div class="segmented" style="grid-template-columns:repeat(${options.length},1fr)">${options.map(([v, text]) => `<button data-action="szSetting" data-key="${key}" data-value="${v ? 1 : 0}" class="${value === v ? 'on' : ''}">${text}</button>`).join('')}</div>`;
  }

  function viewSettings() {
    const s = S.settings;
    const g = s.game;
    const label = (text) => `<div class="small muted" style="font-weight:700;margin-bottom:6px">${text}</div>`;
    const maps = [...W.MAP_IDS.map((id) => W.MAPS[id]), { id: 'random', icon: '🎲', name: 'Zufall', description: 'Jeder Satz auf einer anderen Karte.' }];
    return `<div class="card stack">
      <h3>Einstellungen</h3>
      <div class="grid-2" style="gap:12px">
        <label class="field"><span>Lobbyname</span><input id="set-lobbyName" type="text" maxlength="40" value="${esc(s.lobbyName)}"></label>
        <label class="field"><span>Dein Spielername</span><input id="set-myName" type="text" maxlength="24" value="${esc(S.me.name)}"></label>
      </div>
      <div>${label('Dein Profilbild')}${avatarPicker(S.me.avatar, 'hostAvatar')}</div>
      <div>${label('Fernseher')}${seg('tv', g.tv, [[true, '📺 Mit Fernseher'], [false, '📱 Nur Handys']])}
        <div class="small muted" style="margin-top:6px">${g.tv
          ? 'Dieses Gerät zeigt den Felsen groß. Spielst du mit, zielst du direkt auf dem Fernseher, sonst bist du nur Gamemaster.'
          : 'Kein Fernseher: Jedes Handy zeigt den Felsen groß, auch dieses Gerät spielt mit. Zu zweit reicht sogar ein Handy (oben Mitspieler an diesem Gerät eintragen).'}</div>
      </div>
      ${g.tv ? `<div>${label('Deine Rolle')}
        <div class="segmented">
          <button data-action="hostPlays" data-value="1" class="${s.hostPlays ? 'on' : ''}">🎮 Spielt mit</button>
          <button data-action="hostPlays" data-value="0" class="${!s.hostPlays ? 'on' : ''}">🎩 Nur Gamemaster</button>
        </div>
      </div>` : ''}
      <div>${label('Modus')}${seg('teamMode', g.teamMode, [[false, '🐾 Jeder für sich'], [true, '👥 Teams']])}
        <div class="small muted" style="margin-top:6px">${g.teamMode
          ? 'Jedes Team (bis zu vier) bekommt eine Tierart. Im Team wird reihum geschubst.'
          : 'Jeder Spieler bekommt eine Tierart, 2 bis 4 Spieler. Mehr? Dann Teams einschalten.'}</div>
      </div>
      <div>${label('Karte')}
        <div class="sz-maps">${maps.map((m) => `<button class="sz-map ${g.map === m.id ? 'on' : ''}" data-action="szMap" data-map="${m.id}">
          <span class="sz-map-icon">${m.icon}</span><b>${esc(m.name)}</b><span class="small muted">${esc(m.description)}</span></button>`).join('')}</div>
      </div>
      <div class="grid-2" style="gap:12px">
        <label class="field"><span>Tiere pro Seite</span>
          <select id="sz-animals">${ANIMALS.map(([n, t]) => `<option value="${n}" ${n === g.animals ? 'selected' : ''}>${n ? t : `${t} (6, bei 3–4 Seiten 5)`}</option>`).join('')}</select>
        </label>
        <label class="field"><span>Gewinnsätze</span>
          <select id="sz-sets">${SETS.map((n) => `<option value="${n}" ${n === g.sets ? 'selected' : ''}>${n === 1 ? 'Ein Satz' : `${n} Gewinnsätze`}</option>`).join('')}</select>
        </label>
        <label class="field"><span>Zeit pro Zug</span>
          <select id="sz-time">${TIMES.map((t) => `<option value="${t}" ${t === g.timeLimit ? 'selected' : ''}>${t ? `${t} Sekunden` : 'Kein Zeitlimit'}</option>`).join('')}</select>
        </label>
      </div>
      <div class="grid-2" style="gap:12px">
        <div>${label('Extrazug nach Treffer')}${seg('extraTurn', g.extraTurn, [[true, 'An'], [false, 'Aus']])}</div>
        <div>${label('Zielhilfe')}${seg('aimHelp', g.aimHelp, [[true, 'An'], [false, 'Aus']])}</div>
      </div>
      <div class="small muted">So geht's: Wer dran ist, tippt eines seiner Tiere an, zieht nach hinten wie bei einer Steinschleuder und lässt los. Je weiter gezogen, desto fester der Schubs. Wer über die Kante rutscht, ist raus, auch eigene Tiere. Wer als Letzter noch Tiere oben hat, gewinnt den Satz.${g.extraTurn ? ' Wer ein fremdes Tier runterschubst und keins der eigenen verliert, darf gleich noch einmal.' : ''}${g.timeLimit ? ' Läuft die Zeit ab, verfällt der Zug.' : ''}</div>
    </div>`;
  }

  // ---------- Zeichnen ----------

  // Passende Drehung: möglichst groß, und die eigene Seite unten (nur auf Handys)
  function chooseRotation(R, w, maxH) {
    const key = `${R.setNo}:${Math.round(w)}:${Math.round(maxH)}:${R.mySides.join(',')}:${bigScreen(R)}`;
    if (sz.rotKey === key) return sz.rot;
    sz.rotKey = key;
    const scaleFor = (rot) => (rot % 180 === 0 ? Math.min(w / W.W, maxH / W.H) : Math.min(w / W.H, maxH / W.W));
    if (bigScreen(R) || !R.mySides.length) {
      sz.rot = scaleFor(90) > scaleFor(0) * 1.15 && !bigScreen(R) ? 90 : 0;
      return sz.rot;
    }
    const mine = R.animals.filter((a) => R.mySides.includes(a.side));
    const cx = mine.reduce((s, a) => s + a.x, 0) / (mine.length || 1) - W.CENTER.x;
    const cy = mine.reduce((s, a) => s + a.y, 0) / (mine.length || 1) - W.CENTER.y;
    const best = Math.max(...[0, 90, 180, 270].map(scaleFor));
    const options = [0, 90, 180, 270].filter((r) => scaleFor(r) >= best * 0.97);
    // Wie weit unten liegt die eigene Gruppe nach der Drehung?
    const down = (rot) => {
      const a = (rot * Math.PI) / 180;
      return cx * Math.sin(a) + cy * Math.cos(a);
    };
    sz.rot = options.sort((a, b) => down(b) - down(a))[0];
    return sz.rot;
  }

  function layoutCanvas() {
    const R = S?.round;
    const board = document.getElementById('sz-board');
    if (!R || !board) return;
    const w = board.clientWidth;
    const big = bigScreen(R) || !R.tv;
    const maxH = Math.max(260, window.innerHeight * (big ? 0.78 : 0.62) - (big ? 120 : 0));
    const rot = chooseRotation(R, w, maxH);
    const bw = rot % 180 === 0 ? W.W : W.H;
    const bh = rot % 180 === 0 ? W.H : W.W;
    const scale = Math.min(w / bw, maxH / bh);
    const cssW = Math.floor(bw * scale);
    const cssH = Math.floor(bh * scale);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    sz.view = { rot, scale, dpr, cssW, cssH };
  }

  function applyTransform() {
    const v = sz.view;
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    ctx.translate(v.cssW / 2, v.cssH / 2);
    ctx.rotate((v.rot * Math.PI) / 180);
    ctx.scale(v.scale, v.scale);
    ctx.translate(-W.CENTER.x, -W.CENTER.y);
  }

  // Bildschirmpunkt (relativ zur Zeichenfläche) → Weltpunkt
  function toWorld(px, py) {
    const v = sz.view;
    const x = (px - v.cssW / 2) / v.scale;
    const y = (py - v.cssH / 2) / v.scale;
    const a = (-v.rot * Math.PI) / 180;
    return { x: x * Math.cos(a) - y * Math.sin(a) + W.CENTER.x, y: x * Math.sin(a) + y * Math.cos(a) + W.CENTER.y };
  }

  function shapePath(s) {
    ctx.beginPath();
    if (s.t === 'circle') ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    else if (ctx.roundRect) ctx.roundRect(s.x, s.y, s.w, s.h, s.r);
    else ctx.rect(s.x, s.y, s.w, s.h);
  }

  function drawMap(map) {
    // Abgrund
    const g = ctx.createRadialGradient(W.CENTER.x, W.CENTER.y, 100, W.CENTER.x, W.CENTER.y, 700);
    g.addColorStop(0, '#14532d');
    g.addColorStop(1, '#052e16');
    ctx.fillStyle = g;
    ctx.fillRect(-400, -400, W.W + 800, W.H + 800);
    // Erst alle Kanten dick, dann die Flächen darüber: so entsteht ein Rand um die ganze Form
    ctx.fillStyle = '#7c5a36';
    for (const s of map.shapes) {
      ctx.save();
      ctx.translate(0, 10);
      shapePath(s);
      ctx.fill();
      ctx.restore();
    }
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#a07a4c';
    for (const s of map.shapes) {
      shapePath(s);
      ctx.stroke();
    }
    ctx.fillStyle = '#d6c29a';
    for (const s of map.shapes) {
      shapePath(s);
      ctx.fill();
    }
    // Ein paar Steinchen als Muster (fest verteilt)
    ctx.fillStyle = 'rgba(120, 90, 55, 0.18)';
    for (let i = 0; i < 70; i++) {
      const x = (i * 157) % W.W;
      const y = (i * 263) % W.H;
      if (!W.onGround(map, x, y)) continue;
      ctx.beginPath();
      ctx.arc(x, y, 4 + (i % 5) * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const h of map.holes) {
      shapePath(h);
      ctx.fillStyle = '#0e7490';
      ctx.fill();
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#a07a4c';
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.font = '40px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🌊', h.x, h.y);
    }
  }

  function drawAnimal(a, side, scale = 1, glow = false, alpha = 1) {
    if (scale <= 0.02) return;
    const r = R0 * scale;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (glow) {
      ctx.beginPath();
      ctx.arc(a.x, a.y, r + 9, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(253, 224, 71, 0.45)';
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(a.x, a.y + 4 * scale, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#fffbeb';
    ctx.fill();
    ctx.lineWidth = 6 * scale;
    ctx.strokeStyle = side?.color || '#888';
    ctx.stroke();
    // Das Emoji bleibt aufrecht, egal wie der Felsen gedreht ist
    ctx.translate(a.x, a.y);
    ctx.rotate((-sz.view.rot * Math.PI) / 180);
    ctx.font = `${Math.round(r * 1.25)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(side?.emoji || '?', 0, 2 * scale);
    ctx.restore();
  }

  function uprightText(text, x, y, size, color, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate((-sz.view.rot * Math.PI) / 180);
    ctx.font = `700 ${size}px Fredoka, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.strokeText(text, 0, 0);
    ctx.fillStyle = color;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  // Pfeil in Schussrichtung, dazu die Zielhilfe
  function drawAim(R, animal, angle, power, pull) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    if (pull) {
      // Gummiband zum Finger
      ctx.beginPath();
      ctx.moveTo(animal.x, animal.y);
      ctx.lineTo(animal.x - dx * pull, animal.y - dy * pull);
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.setLineDash([]);
      ctx.stroke();
    }
    if (R.aimHelp) {
      const line = W.aimLine(R.animals, animal, angle, 1100);
      ctx.beginPath();
      ctx.moveTo(animal.x + dx * R0, animal.y + dy * R0);
      ctx.lineTo(animal.x + dx * line.length, animal.y + dy * line.length);
      ctx.setLineDash([10, 10]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.stroke();
      ctx.setLineDash([]);
      if (line.hit) {
        ctx.beginPath();
        ctx.arc(animal.x + dx * line.length, animal.y + dy * line.length, R0, 0, Math.PI * 2);
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.stroke();
      }
    }
    const len = R0 + 30 + power * 150;
    const hue = 120 - power * 120;
    const color = `hsl(${hue}, 90%, 50%)`;
    const ex = animal.x + dx * len;
    const ey = animal.y + dy * len;
    ctx.beginPath();
    ctx.moveTo(animal.x + dx * R0, animal.y + dy * R0);
    ctx.lineTo(ex, ey);
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ex + dx * 22, ey + dy * 22);
    ctx.lineTo(ex - dy * 18, ey + dx * 18);
    ctx.lineTo(ex + dy * 18, ey - dx * 18);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineCap = 'butt';
  }

  function dragAim(R) {
    const d = sz.drag;
    const animal = R.animals.find((a) => a.id === d?.animalId);
    if (!animal) return null;
    const vx = d.wx - animal.x;
    const vy = d.wy - animal.y;
    const pull = Math.min(MAX_PULL, Math.hypot(vx, vy));
    return { animal, angle: Math.atan2(-vy, -vx), power: pull / MAX_PULL, pull };
  }

  // Position eines Tiers in der laufenden Stoß-Animation
  function trackPos(track, f) {
    const n = track.pts.length / 2;
    const i = Math.min(n - 1, Math.max(0, Math.floor(f)));
    const j = Math.min(n - 1, i + 1);
    const t = Math.min(1, Math.max(0, f - i));
    return { x: track.pts[i * 2] + (track.pts[j * 2] - track.pts[i * 2]) * t, y: track.pts[i * 2 + 1] + (track.pts[j * 2 + 1] - track.pts[i * 2 + 1]) * t };
  }

  function draw() {
    sz.frame = null;
    const R = S?.round;
    if (!R || S.game.id !== 'sumozoo' || !sz.view || !canvas.isConnected) return;
    const map = W.MAPS[R.mapId];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    applyTransform();
    drawMap(map);

    const shot = R.shot;
    const animating = playing(R);
    const myTurn = R.canShoot && R.phase === 'aim';
    if (animating) {
      const f = ((now() - shot.startAt) / 1000) * shot.fps;
      const moving = new Map(shot.tracks.map((t) => [t.id, t]));
      for (const a of R.animals) {
        if (moving.has(a.id) || !a.alive) continue;
        drawAnimal(a, sideById(R, a.side));
      }
      for (const t of shot.tracks) {
        const side = sideById(R, t.id.split('-')[0]);
        const pos = trackPos(t, f);
        let scale = 1;
        if (t.fall !== null && f > t.fall) {
          const k = (f - t.fall) / (FALL_TAIL * shot.fps);
          scale = Math.max(0, 1 - k);
          if (k < 2) uprightText(FALL_LINES[(t.id.length + Math.round(t.fall)) % FALL_LINES.length], pos.x, pos.y - 30 - k * 30, 34, '#fde047', Math.max(0, 1 - k / 2));
        }
        drawAnimal(pos, side, scale);
      }
      sz.frame = requestAnimationFrame(draw);
    } else {
      for (const a of R.animals) {
        if (!a.alive) continue;
        const glow = myTurn && a.side === R.turn.side && (!sz.drag || sz.drag.animalId === a.id);
        drawAnimal(a, sideById(R, a.side), 1, glow);
      }
      if (R.phase === 'aim') {
        const aim = myTurn ? dragAim(R) : null;
        if (aim && aim.power >= 0.01) drawAim(R, aim.animal, aim.angle, aim.power, aim.pull);
        else if (!myTurn && sz.remote?.animalId && sz.remote.turn === R.turn?.seq) {
          const animal = R.animals.find((a) => a.id === sz.remote.animalId && a.alive);
          if (animal) drawAim(R, animal, sz.remote.angle, sz.remote.power, 0);
        }
      }
      // Nach dem Abspielen einmal die Seite neu aufbauen (Zähler und Meldungen)
      if (shot && R.phase === 'rolling' && sz.shotEndRendered !== shot.seq) {
        sz.shotEndRendered = shot.seq;
        setTimeout(render, 0);
      }
    }
  }

  function requestDraw() {
    if (!sz.frame) sz.frame = requestAnimationFrame(draw);
  }

  // ---------- Spielansicht ----------

  function aliveShown(R, s) {
    return playing(R) ? R.shot?.before?.[s.id] ?? s.alive : s.alive;
  }

  function sideRow(R, s) {
    const active = R.turn?.side === s.id;
    const total = R.animals.filter((a) => a.side === s.id).length;
    const alive = aliveShown(R, s);
    const icons = Array.from({ length: total }, (_, i) => `<span class="${i < alive ? '' : 'gone'}">${s.emoji}</span>`).join('');
    const who = s.teamId
      ? `<span class="team-dot" style="--team:${s.color}"></span><b>${esc(s.name)}</b>`
      : `${avatarHtml(playerById(s.members[0]), 'sm')}<b>${esc(s.name)}</b>`;
    return `<div class="sz-side ${active ? 'active' : ''} ${alive === 0 ? 'out' : ''}" style="--side:${s.color}">
      <div class="row" style="gap:6px;flex-wrap:nowrap;min-width:0">${who}${R.sets > 1 ? `<span class="sz-wins" title="Gewonnene Sätze">${'🏆'.repeat(s.wins) || '–'}</span>` : ''}</div>
      <div class="sz-icons">${icons}</div>
      ${s.teamId && active && R.turn ? `<div class="small muted">schubst: ${esc(playerName(R.turn.shooterId))}</div>` : ''}
      ${!s.present ? '<div class="small" style="color:var(--pink)">nicht da</div>' : ''}
    </div>`;
  }

  function viewStatus(R) {
    let text = '';
    let mine = false;
    if (R.phase === 'aim' && R.turn) {
      const side = sideById(R, R.turn.side);
      const name = esc(playerName(R.turn.shooterId));
      const extra = R.outcome?.extra && R.shot?.side === R.turn.side ? 'Extrazug! ' : '';
      mine = R.canShoot;
      if (mine) text = `${extra}${sharedHere() ? '📱 ' : ''}${name} ist dran! Tier antippen, nach hinten ziehen, loslassen.`;
      else if (!side.present) text = `⏳ Warte auf ${name} …`;
      else text = `${extra}${side.emoji} ${name} ist dran und zielt …`;
    } else if (R.phase === 'rolling') {
      text = '💨 Es rollt …';
    } else if (R.phase === 'setEnd' || R.phase === 'final') {
      const w = sideById(R, R.result?.winner);
      text = w ? `🏆 ${esc(w.name)} gewinnt ${R.phase === 'final' && R.sets > 1 ? 'die Partie' : `Satz ${R.setNo}`}!` : '🤝 Unentschieden!';
    }
    return `<div class="sz-status ${mine ? 'mine' : ''}">${text}</div>`;
  }

  function viewLog(R) {
    const hide = playing(R) ? R.shot.logBefore : Infinity;
    const lines = R.log.filter((l) => l.seq <= hide);
    if (!lines.length) return '';
    return `<div class="sz-log">${[...lines].reverse().slice(0, 4).map((l) => `<div>${esc(l.text)}</div>`).join('')}</div>`;
  }

  function viewSetEnd(R) {
    if (R.phase !== 'setEnd' || !R.result) return '';
    const w = sideById(R, R.result.winner);
    return `<div class="card stack center">
      <div style="font-size:2.4rem">${w ? w.emoji : '🤝'}</div>
      <h2 style="margin:0">${w ? `${esc(w.name)} gewinnt Satz ${R.setNo}!` : 'Unentschieden!'}</h2>
      ${w && R.result.left === 1 ? '<div class="small">Mit dem allerletzten Tier!</div>' : ''}
      <div class="sz-score">${R.sides.map((s) => `<span>${s.emoji} ${esc(s.name)} <b>${s.wins}</b></span>`).join('')}</div>
      <div class="small muted">${S.me.isHost ? 'Starte den nächsten Satz unten in der Leiste.' : 'Gleich startet der Host den nächsten Satz.'}</div>
    </div>`;
  }

  function viewPlaying(R) {
    const map = W.MAPS[R.mapId];
    const big = bigScreen(R);
    return `<div class="stack sz">
      <div class="q-head">
        <div class="small muted"><b>Sumo Zoo</b> · ${map.icon} ${esc(map.name)}${R.sets > 1 ? ` · Satz ${R.setNo}, ${R.sets} Gewinnsätze` : ''}</div>
        ${R.deadline && R.phase === 'aim' ? '<span class="timer" id="timer"></span>' : ''}
      </div>
      ${big ? '' : viewStatus(R)}
      <div class="sz-layout ${big ? 'big' : ''}">
        <div class="sz-board" id="sz-board"></div>
        <div class="sz-panel stack">
          ${big ? viewStatus(R) : ''}
          <div class="sz-sides">${R.sides.map((s) => sideRow(R, s)).join('')}</div>
          ${viewLog(R)}
        </div>
      </div>
      ${viewSetEnd(R)}
    </div>`;
  }

  function viewFinal(R) {
    const winner = sideById(R, R.standings[0].id);
    const draw = R.result && !R.result.winner && R.sets === 1;
    const a = R.awards;
    const names = (ids) => ids.map((id) => esc(playerName(id))).join(', ');
    const awards = [
      a.wreckingBall && ['💥', 'Abrissbirne', `${names(a.wreckingBall.ids)} (${a.wreckingBall.value} mit einem Stoß)`],
      a.ownGoal && ['🙈', 'Eigentor-König', `${names(a.ownGoal.ids)} (${a.ownGoal.value} eigene)`],
      a.lastOne && ['🦸', 'Letzter Mohikaner', a.lastOne.sides.map((id) => esc(sideById(R, id)?.name || '')).join(', ')],
    ].filter(Boolean);
    return `<div class="stack sz">
      <div class="center"><div style="font-size:3rem">${draw ? '🤝' : '🏆'}</div>
        <h1>${draw ? 'Unentschieden!' : `${winner.emoji} ${esc(winner.name)} gewinnt!`}</h1></div>
      <div class="sz-layout"><div class="sz-board" id="sz-board"></div>
        <div class="sz-panel stack">
          <div class="card stack">
            <h3 style="margin:0">Ergebnis</h3>
            ${R.standings.map((st, i) => {
              const s = sideById(R, st.id);
              return `<div class="score-row" style="--team:${s.color}"><span class="rank">${i + 1}.</span><span class="name">${s.emoji} ${esc(s.name)}</span>
                <span class="small muted">${st.knocked} runtergeschubst</span>${R.sets > 1 ? `<b>${st.wins}</b>` : ''}</div>`;
            }).join('')}
          </div>
          ${awards.length ? `<div class="card stack"><h3 style="margin:0">Sonderpreise</h3>${awards.map(([icon, title, who]) => `<div class="score-row" style="--team:var(--accent)"><span class="rank">${icon}</span><span class="name">${title}</span><span class="small">${who}</span></div>`).join('')}</div>` : ''}
        </div>
      </div>
      ${S.me.isHost ? '' : '<div class="muted center">Der Host kann eine neue Partie starten.</div>'}
    </div>`;
  }

  function view() {
    const R = S.round;
    if (R.turn?.seq !== sz.remote?.turn) sz.remote = null;
    if (!R.canShoot || R.phase !== 'aim') sz.drag = null;
    return R.phase === 'final' ? viewFinal(R) : viewPlaying(R);
  }

  function hostbar() {
    const R = S.round;
    if (R.phase === 'final') return '<button class="btn primary" data-action="toLobby">Neue Partie (zur Lobby)</button>';
    if (R.phase === 'setEnd') return '<button class="btn primary" data-action="next">Nächster Satz ▶︎</button>';
    if (R.phase === 'aim' && R.turn) return `<button class="btn" data-action="szForce">⏭ ${esc(playerName(R.turn.shooterId))} überspringen</button>`;
    return '';
  }

  // Nach jedem Neuzeichnen der Seite: Zeichenfläche wieder einhängen
  function afterRender() {
    if (S?.game.id !== 'sumozoo' || S.phase !== 'playing') return;
    const board = document.getElementById('sz-board');
    if (!board) return;
    board.appendChild(canvas);
    board.classList.toggle('aiming', S.round.canShoot && S.round.phase === 'aim');
    layoutCanvas();
    requestDraw();
  }

  // Bildschirmposition eines Tiers (für die Browser-Tests)
  function screenPos(animalId) {
    const a = S?.round?.animals.find((x) => x.id === animalId);
    if (!a || !sz.view) return null;
    const v = sz.view;
    const r = (v.rot * Math.PI) / 180;
    const x = (a.x - W.CENTER.x) * v.scale;
    const y = (a.y - W.CENTER.y) * v.scale;
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + v.cssW / 2 + x * Math.cos(r) - y * Math.sin(r), y: rect.top + v.cssH / 2 + x * Math.sin(r) + y * Math.cos(r), rot: v.rot, scale: v.scale };
  }

  gameViews.sumozoo = { settings: viewSettings, lobbyExtra, view, hostbar, afterRender, screenPos };

  // ---------- Zielen ----------

  function pointer(e) {
    const rect = canvas.getBoundingClientRect();
    return toWorld(e.clientX - rect.left, e.clientY - rect.top);
  }

  // Zielen an die anderen Geräte schicken, höchstens alle 60 ms (der letzte Stand kommt immer an)
  function sendAim(force = false) {
    const R = S.round;
    const t = Date.now();
    clearTimeout(sz.aimTimer);
    if (!force && t - sz.lastAimSent < 60) {
      sz.aimTimer = setTimeout(() => sendAim(true), 60 - (t - sz.lastAimSent));
      return;
    }
    sz.lastAimSent = t;
    const aim = sz.drag ? dragAim(R) : null;
    // Mit Rückruf schicken: Ohne ihn wertet der Server den Befehl gar nicht aus
    socket.emit('game:draw', aim ? { op: 'aim', animalId: aim.animal.id, angle: aim.angle, power: aim.power } : { op: 'aim', animalId: null }, () => {});
  }

  canvas.addEventListener('pointerdown', (e) => {
    const R = S?.round;
    if (!R || !R.canShoot || R.phase !== 'aim' || !sz.view) return;
    const p = pointer(e);
    const own = R.animals.filter((a) => a.alive && a.side === R.turn.side);
    let best = null;
    let bestD = R0 * 1.9;
    for (const a of own) {
      const d = Math.hypot(a.x - p.x, a.y - p.y);
      if (d < bestD) {
        best = a;
        bestD = d;
      }
    }
    if (!best) {
      toast(`Tippe eines deiner ${sideById(R, R.turn.side).emoji} an.`);
      return;
    }
    e.preventDefault();
    canvas.setPointerCapture?.(e.pointerId);
    sz.drag = { animalId: best.id, wx: p.x, wy: p.y, pointerId: e.pointerId };
    requestDraw();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!sz.drag || e.pointerId !== sz.drag.pointerId) return;
    const p = pointer(e);
    sz.drag.wx = p.x;
    sz.drag.wy = p.y;
    sendAim();
    requestDraw();
  });

  function endDrag(e, cancel) {
    if (!sz.drag || e.pointerId !== sz.drag.pointerId) return;
    const R = S.round;
    const aim = dragAim(R);
    sz.drag = null;
    if (!cancel && aim && aim.power >= MIN_POWER && R.canShoot && R.phase === 'aim') {
      clearTimeout(sz.aimTimer);
      act('shoot', { animalId: aim.animal.id, angle: aim.angle, power: aim.power });
    } else {
      sendAim(true);
    }
    requestDraw();
  }

  canvas.addEventListener('pointerup', (e) => endDrag(e, false));
  canvas.addEventListener('pointercancel', (e) => endDrag(e, true));

  socket.on('sz-aim', (aim) => {
    if (S?.game.id !== 'sumozoo' || S.phase !== 'playing') return;
    sz.remote = aim;
    requestDraw();
  });

  window.addEventListener('resize', () => {
    if (S?.game.id !== 'sumozoo' || S.phase !== 'playing') return;
    layoutCanvas();
    requestDraw();
  });

  Object.assign(actions, {
    szSetting: (el) => sendHost('settings', { game: { [el.dataset.key]: el.dataset.value === '1' } }),
    szMap: (el) => sendHost('settings', { game: { map: el.dataset.map } }),
    szForce: () => {
      const R = S.round;
      if (R.turn && confirm(`${playerName(R.turn.shooterId)} überspringen?`)) act('force');
    },
    szRemoveGuest: (el) => socket.emit('guest:remove', { playerId: el.dataset.player }, (res) => { if (res?.error) toast(res.error); }),
  });

  app.addEventListener('submit', (e) => {
    if (e.target.id !== 'sz-guest-form') return;
    e.preventDefault();
    const input = document.getElementById('sz-guest-name');
    const name = input.value.trim();
    if (!name) return toast('Bitte gib einen Namen ein.');
    const avatar = avatars.length ? avatars[Math.floor(Math.random() * avatars.length)] : null;
    socket.emit('guest:add', { name, avatar }, (res) => {
      if (res?.error) return toast(res.error);
      const field = document.getElementById('sz-guest-name');
      if (field) field.value = '';
    });
  });

  app.addEventListener('change', (e) => {
    if (S?.game.id !== 'sumozoo') return;
    const id = e.target.id;
    if (id === 'sz-animals') sendHost('settings', { game: { animals: Number(e.target.value) } });
    else if (id === 'sz-sets') sendHost('settings', { game: { sets: Number(e.target.value) } });
    else if (id === 'sz-time') sendHost('settings', { game: { timeLimit: Number(e.target.value) } });
  });
})();
