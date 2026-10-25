// Kampfschafe: Spielansicht für Host und Handys (nutzt die Helfer aus lobby.js und KsWorld)

(() => {
  const W = KsWorld;
  const ARMY = [[0, 'Automatisch (10, bei 3–4 Armeen 6)'], [6, '6 Schafe'], [10, '10 Schafe']];
  const TIMES = [10, 15, 20, 30];
  const SETS = [1, 2, 3];
  const KILL_LINES = ['Mäh!', 'Määäh!', 'Wolle weg!', 'Bäääh!'];
  const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",serif';
  const THEMES = {
    grass: { ground: '#6aa632', speck: 'rgba(40, 90, 20, 0.25)', water: '#38bdf8', waterEdge: '#0284c7' },
    sand: { ground: '#e6c88c', speck: 'rgba(160, 110, 50, 0.25)', water: '#22d3ee', waterEdge: '#0891b2' },
    snow: { ground: '#eef2f7', speck: 'rgba(148, 163, 184, 0.35)', water: '#bae6fd', waterEdge: '#60a5fa' },
    lake: { ground: '#5f9e3a', speck: 'rgba(30, 80, 20, 0.25)', water: '#3b82f6', waterEdge: '#1d4ed8' },
  };

  const canvas = document.createElement('canvas');
  canvas.className = 'ks-canvas';
  const ctx = canvas.getContext('2d');
  const ks = {
    view: null,
    rotKey: null,
    rot: 0,
    live: null, // letzte Live-Position der Einheit am Zug
    disp: new Map(), // geglättete Anzeigepositionen
    target: null, // eigenes Ziel (nur wer dran ist)
    targetTurn: null,
    aimPointer: null,
    joy: null, // { pointerId, x, y } Stick in Bildschirmrichtung, Länge bis 1
    keys: new Set(),
    sentInput: { x: 0, y: 0 },
    lastInputAt: 0,
    inputTimer: null,
    lastAimAt: 0,
    aimTimer: null,
    frame: null,
    mapCache: null,
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

  function typeOf(R, u) {
    return W.typeFor(W.MAPS[R.mapId], u.type);
  }

  // Großer Bildschirm: Fernseher bzw. Host-Gerät
  function bigScreen(R) {
    return S.me.isHost && (isGamemaster() || R.tv);
  }

  function playing(R) {
    const shot = R.shot;
    return Boolean(shot && R.phase === 'firing' && now() < shot.startAt + shot.duration + 300);
  }

  function myTurn(R) {
    return R.canAct && (R.phase === 'ready' || R.phase === 'turn');
  }

  // ---------- Lobby ----------

  function lobbyExtra() {
    if (S.me.isHost && !S.settings.hostPlays) return '';
    if (S.settings.game.teamMode) return '';
    const guests = S.players.filter((p) => p.guestOf === S.me.id);
    return `<div class="card stack">
      <h3 style="margin:0">Mitspieler an diesem Gerät</h3>
      <div class="small muted">Nur ein Handy für zwei? Trag hier die zweite Person ein und gebt das Gerät reihum weiter. Vor jedem Zug steht da, wer dran ist.</div>
      ${guests.map((p) => `<div class="member">${avatarHtml(p, 'sm')}<span class="name">${esc(p.name)}</span>
        <button class="btn small icon ghost" data-action="ksRemoveGuest" data-player="${p.id}" title="Entfernen">✕</button></div>`).join('')}
      <form id="ks-guest-form" class="row" style="flex-wrap:nowrap">
        <input id="ks-guest-name" type="text" maxlength="24" placeholder="Name" autocomplete="off" style="flex:1;min-width:0">
        <button class="btn primary small" type="submit">+ Hinzufügen</button>
      </form>
    </div>`;
  }

  function seg(key, value, options) {
    return `<div class="segmented" style="grid-template-columns:repeat(${options.length},1fr)">${options.map(([v, text]) => `<button data-action="ksSetting" data-key="${key}" data-value="${v ? 1 : 0}" class="${value === v ? 'on' : ''}">${text}</button>`).join('')}</div>`;
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
          ? 'Dieses Gerät zeigt das Schlachtfeld groß. Spielst du mit, steuerst du direkt hier (Maus und Pfeiltasten), sonst bist du nur Gamemaster.'
          : 'Kein Fernseher: Jedes Handy zeigt das Schlachtfeld, auch dieses Gerät spielt mit. Zu zweit reicht sogar ein Handy (oben Mitspieler an diesem Gerät eintragen).'}</div>
      </div>
      ${g.tv ? `<div>${label('Deine Rolle')}
        <div class="segmented">
          <button data-action="hostPlays" data-value="1" class="${s.hostPlays ? 'on' : ''}">🎮 Spielt mit</button>
          <button data-action="hostPlays" data-value="0" class="${!s.hostPlays ? 'on' : ''}">🎩 Nur Gamemaster</button>
        </div>
      </div>` : ''}
      <div>${label('Modus')}${seg('teamMode', g.teamMode, [[false, '🐑 Jeder für sich'], [true, '👥 Teams']])}
        <div class="small muted" style="margin-top:6px">${g.teamMode
          ? 'Jedes Team (bis zu vier) bekommt eine Armee. Im Team wird reihum gesteuert.'
          : 'Jeder Spieler bekommt eine Armee, 2 bis 4 Spieler. Mehr? Dann Teams einschalten.'}</div>
      </div>
      <div>${label('Karte')}
        <div class="ks-maps">${maps.map((m) => `<button class="ks-map ${g.map === m.id ? 'on' : ''}" data-action="ksMap" data-map="${m.id}">
          <span class="ks-map-icon">${m.icon}</span><b>${esc(m.name)}</b><span class="small muted">${esc(m.description)}</span></button>`).join('')}</div>
      </div>
      <div class="grid-2" style="gap:12px">
        <label class="field"><span>Armeegröße</span>
          <select id="ks-army">${ARMY.map(([n, t]) => `<option value="${n}" ${n === g.army ? 'selected' : ''}>${t}</option>`).join('')}</select>
        </label>
        <label class="field"><span>Zeit pro Zug</span>
          <select id="ks-time">${TIMES.map((t) => `<option value="${t}" ${t === g.turnTime ? 'selected' : ''}>${t} Sekunden${t === 10 ? ' (wie im Original)' : ''}</option>`).join('')}</select>
        </label>
        <label class="field"><span>Gewinnsätze</span>
          <select id="ks-sets">${SETS.map((n) => `<option value="${n}" ${n === g.sets ? 'selected' : ''}>${n === 1 ? 'Eine Schlacht' : `${n} Gewinnsätze`}</option>`).join('')}</select>
        </label>
      </div>
      <div class="grid-2" style="gap:12px">
        <div>${label('Medipacks')}${seg('medkits', g.medkits, [[true, 'An'], [false, 'Aus']])}</div>
        <div>${label('Einheit am Zug')}${seg('freeChoice', g.freeChoice, [[false, '🎲 Gelost'], [true, '👆 Frei wählen']])}</div>
      </div>
      <div class="small muted">So geht's: Reihum ist eine Einheit dran. Mit dem Stick fahren, aufs Schlachtfeld tippen, um zu zielen, dann „Feuer!“. In den letzten Sekunden kann man nur noch zielen und schießen. Funker rufen einen Luftangriff (Vorsicht, eigene Schafe!), Bazookas feuern Raketen, MG-Schafe einen Feuerstoß auf kurze Distanz, Panzer Granaten${g.map === 'seen' ? ', Hubschrauber fliegen über alles' : ''}. ${g.medkits ? 'Ein Medipack macht die ganze Armee wieder gesund. ' : ''}Wer zuletzt noch Schafe hat, gewinnt.</div>
    </div>`;
  }

  // ---------- Größe und Drehung ----------

  function chooseRotation(R, w, maxH) {
    const key = `${R.setNo}:${Math.round(w)}:${Math.round(maxH)}:${R.mySides.join(',')}:${bigScreen(R)}`;
    if (ks.rotKey === key) return ks.rot;
    ks.rotKey = key;
    const scaleFor = (rot) => (rot % 180 === 0 ? Math.min(w / W.W, maxH / W.H) : Math.min(w / W.H, maxH / W.W));
    if (bigScreen(R) || !R.mySides.length) {
      ks.rot = scaleFor(90) > scaleFor(0) * 1.15 && !bigScreen(R) ? 90 : 0;
      return ks.rot;
    }
    const mine = R.units.filter((u) => R.mySides.includes(u.side));
    const cx = mine.reduce((s, u) => s + u.x, 0) / (mine.length || 1) - W.CENTER.x;
    const cy = mine.reduce((s, u) => s + u.y, 0) / (mine.length || 1) - W.CENTER.y;
    const best = Math.max(...[0, 90, 180, 270].map(scaleFor));
    const options = [0, 90, 180, 270].filter((r) => scaleFor(r) >= best * 0.97);
    // Die eigene Armee soll unten stehen
    const down = (rot) => {
      const a = (rot * Math.PI) / 180;
      return cx * Math.sin(a) + cy * Math.cos(a);
    };
    ks.rot = options.sort((a, b) => down(b) - down(a))[0];
    return ks.rot;
  }

  function layoutCanvas() {
    const R = S?.round;
    const board = document.getElementById('ks-board');
    if (!R || !board) return;
    const w = board.clientWidth;
    const big = bigScreen(R);
    const reserve = myTurn(R) && !big ? 250 : 0;
    const maxH = Math.max(240, big ? window.innerHeight * 0.8 - 110 - (myTurn(R) ? 120 : 0) : Math.min(window.innerHeight * 0.66, window.innerHeight - 140 - reserve));
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
    ks.view = { rot, scale, dpr, cssW, cssH };
  }

  function applyTransform(c = ctx) {
    const v = ks.view;
    c.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    c.translate(v.cssW / 2, v.cssH / 2);
    c.rotate((v.rot * Math.PI) / 180);
    c.scale(v.scale, v.scale);
    c.translate(-W.CENTER.x, -W.CENTER.y);
  }

  function toWorld(px, py) {
    const v = ks.view;
    const x = (px - v.cssW / 2) / v.scale;
    const y = (py - v.cssH / 2) / v.scale;
    const a = (-v.rot * Math.PI) / 180;
    return { x: x * Math.cos(a) - y * Math.sin(a) + W.CENTER.x, y: x * Math.sin(a) + y * Math.cos(a) + W.CENTER.y };
  }

  // Richtung auf dem Bildschirm → Richtung in der Welt
  function screenDirToWorld(x, y) {
    const a = (-ks.view.rot * Math.PI) / 180;
    return { x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) };
  }

  // ---------- Zeichnen: Karte ----------

  function emoji(c, text, x, y, size, alpha = 1) {
    c.save();
    c.globalAlpha = alpha;
    c.translate(x, y);
    c.rotate((-ks.view.rot * Math.PI) / 180);
    c.font = `${Math.round(size)}px ${EMOJI_FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, 0, size * 0.06);
    c.restore();
  }

  function uprightText(text, x, y, size, color, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.translate(x, y);
    ctx.rotate((-ks.view.rot * Math.PI) / 180);
    ctx.font = `700 ${size}px Fredoka, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.strokeText(text, 0, 0);
    ctx.fillStyle = color;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  function obstaclePath(c, o, grow = 0) {
    c.beginPath();
    if (o.t === 'circle') c.arc(o.x, o.y, o.r + grow, 0, Math.PI * 2);
    else if (c.roundRect) c.roundRect(o.x - grow, o.y - grow, o.w + grow * 2, o.h + grow * 2, 6);
    else c.rect(o.x - grow, o.y - grow, o.w + grow * 2, o.h + grow * 2);
  }

  function drawMapTo(c, map) {
    const th = THEMES[map.theme];
    c.fillStyle = th.ground;
    c.fillRect(0, 0, W.W, W.H);
    c.fillStyle = th.speck;
    for (let i = 0; i < 140; i++) {
      const x = (i * 157 + 31) % W.W;
      const y = (i * 263 + 17) % W.H;
      c.beginPath();
      c.arc(x, y, 2 + (i % 4), 0, Math.PI * 2);
      c.fill();
    }
    for (const o of map.obstacles.filter((x) => x.k === 'water')) {
      obstaclePath(c, o, 5);
      c.fillStyle = th.waterEdge;
      c.fill();
      obstaclePath(c, o);
      c.fillStyle = th.water;
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.45)';
      c.lineWidth = 2;
      for (let k = -1; k <= 1; k++) {
        c.beginPath();
        c.arc(o.x + k * 14, o.y + k * 8, 6, Math.PI * 1.1, Math.PI * 1.9);
        c.stroke();
      }
    }
    for (const o of map.obstacles) {
      if (o.k === 'water') continue;
      // Schatten
      c.save();
      c.translate(4, 5);
      obstaclePath(c, o);
      c.fillStyle = 'rgba(0,0,0,0.22)';
      c.fill();
      c.restore();
      if (o.k === 'rock') {
        obstaclePath(c, o);
        c.fillStyle = '#78716c';
        c.fill();
        c.beginPath();
        c.arc(o.x - o.r * 0.3, o.y - o.r * 0.3, o.r * 0.45, 0, Math.PI * 2);
        c.fillStyle = '#a8a29e';
        c.fill();
      } else if (o.k === 'house') {
        obstaclePath(c, o);
        c.fillStyle = '#b45309';
        c.fill();
        c.lineWidth = 3;
        c.strokeStyle = '#78350f';
        c.stroke();
        c.beginPath();
        if (o.w >= o.h) {
          c.moveTo(o.x + 4, o.y + o.h / 2);
          c.lineTo(o.x + o.w - 4, o.y + o.h / 2);
        } else {
          c.moveTo(o.x + o.w / 2, o.y + 4);
          c.lineTo(o.x + o.w / 2, o.y + o.h - 4);
        }
        c.stroke();
      } else if (o.k === 'igloo') {
        obstaclePath(c, o);
        c.fillStyle = '#ffffff';
        c.fill();
        c.lineWidth = 2;
        c.strokeStyle = '#93c5fd';
        c.stroke();
        for (const f of [0.4, 0.7]) {
          c.beginPath();
          c.arc(o.x, o.y, o.r * f, 0, Math.PI * 2);
          c.stroke();
        }
      } else {
        obstaclePath(c, o);
        c.fillStyle = o.k === 'cactus' ? '#4d7c0f' : o.k === 'pine' ? '#14532d' : '#166534';
        c.fill();
        emoji(c, o.k === 'cactus' ? '🌵' : o.k === 'pine' ? '🌲' : '🌳', o.x, o.y, o.r * 2);
      }
    }
  }

  function mapImage(R) {
    const v = ks.view;
    const key = `${R.mapId}:${v.cssW}:${v.cssH}:${v.rot}:${v.dpr}`;
    if (ks.mapCache?.key === key) return ks.mapCache.canvas;
    const c = document.createElement('canvas');
    c.width = canvas.width;
    c.height = canvas.height;
    const cx = c.getContext('2d');
    applyTransform(cx);
    drawMapTo(cx, W.MAPS[R.mapId]);
    ks.mapCache = { key, canvas: c };
    return c;
  }

  function drawMedkit(m) {
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate((-ks.view.rot * Math.PI) / 180);
    const s = W.MEDKIT_R;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-s + 3, -s + 4, s * 2, s * 2);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#b91c1c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-s, -s, s * 2, s * 2, 4);
    else ctx.rect(-s, -s, s * 2, s * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(-3.5, -s + 4, 7, s * 2 - 8);
    ctx.fillRect(-s + 4, -3.5, s * 2 - 8, 7);
    ctx.restore();
  }

  // ---------- Zeichnen: Einheiten ----------

  function drawUnit(R, u, pos, hp, { active = false, alpha = 1 } = {}) {
    const side = sideById(R, u.side);
    const type = typeOf(R, u);
    const r = u.r;
    const f = pos.f ?? u.f;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (active) {
      const pulse = 0.5 + 0.5 * Math.sin(now() / 160);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r + 8 + pulse * 4, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(253, 224, 71, ${0.35 + pulse * 0.25})`;
      ctx.fill();
    }
    // Schatten
    ctx.beginPath();
    ctx.arc(pos.x + 3, pos.y + (type.flies ? 12 : 4), r, 0, Math.PI * 2);
    ctx.fillStyle = type.flies ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.28)';
    ctx.fill();

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(f);
    if (type.key === 'panzer') {
      ctx.fillStyle = side.color;
      ctx.strokeStyle = '#1f2937';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-r, -r * 0.8, r * 2, r * 1.6, 5);
      else ctx.rect(-r, -r * 0.8, r * 2, r * 1.6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#374151';
      ctx.fillRect(-r, -r * 0.8, r * 2, 4);
      ctx.fillRect(-r, r * 0.8 - 4, r * 2, 4);
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(0, -3, r + 14, 6);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
      ctx.fillStyle = '#f8fafc';
      ctx.fill();
      ctx.stroke();
    } else if (type.key === 'heli') {
      ctx.strokeStyle = '#1f2937';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, 0);
      ctx.lineTo(-r * 1.9, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = side.color;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
      ctx.fillStyle = '#f8fafc';
      ctx.fill();
    } else {
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(r * 0.4, -2.5, r + 8, 5);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = side.color;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.74, 0, Math.PI * 2);
      ctx.fillStyle = '#f8fafc';
      ctx.fill();
    }
    ctx.restore();

    emoji(ctx, '🐑', pos.x, pos.y, r * (type.key === 'panzer' ? 0.95 : 1.25));
    if (type.key === 'heli') {
      // Rotor dreht sich
      const a = now() / 60;
      ctx.strokeStyle = 'rgba(31, 41, 55, 0.75)';
      ctx.lineWidth = 3;
      for (const k of [0, Math.PI / 2]) {
        ctx.beginPath();
        ctx.moveTo(pos.x + Math.cos(a + k) * r * 1.4, pos.y + Math.sin(a + k) * r * 1.4);
        ctx.lineTo(pos.x - Math.cos(a + k) * r * 1.4, pos.y - Math.sin(a + k) * r * 1.4);
        ctx.stroke();
      }
    }
    // Abzeichen und Lebensbalken bleiben aufrecht
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate((-ks.view.rot * Math.PI) / 180);
    if (type.key !== 'panzer' && type.key !== 'heli') {
      ctx.beginPath();
      ctx.arc(r * 0.78, r * 0.7, r * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = side.color;
      ctx.stroke();
      ctx.font = `${Math.round(r * 0.62)}px ${EMOJI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(type.badge, r * 0.78, r * 0.74);
    }
    const bw = 34;
    const frac = Math.max(0, Math.min(1, hp / u.maxHp));
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(-bw / 2 - 1, -r - 13, bw + 2, 7);
    ctx.fillStyle = frac > 0.5 ? '#22c55e' : frac > 0.25 ? '#eab308' : '#ef4444';
    ctx.fillRect(-bw / 2, -r - 12, bw * frac, 5);
    ctx.restore();
    ctx.restore();
  }

  // Ziel der Einheit am Zug: eigenes auf diesem Gerät, sonst das live übertragene
  function currentTarget(R) {
    if (myTurn(R) && ks.targetTurn === R.turn.seq && ks.target) return ks.target;
    if (ks.live?.turn === R.turn?.seq && ks.live.target) return ks.live.target;
    return R.turn?.target || null;
  }

  function drawAim(R, u, pos) {
    const type = typeOf(R, u);
    const target = currentTarget(R);
    const mine = myTurn(R);
    ctx.save();
    if (type.range && (mine || bigScreen(R))) {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, type.range, 0, Math.PI * 2);
      ctx.setLineDash([8, 10]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (!target) {
      ctx.restore();
      return;
    }
    let tx = target.x;
    let ty = target.y;
    const d = Math.hypot(tx - pos.x, ty - pos.y);
    if (type.range && d > type.range && type.weapon !== 'mg') {
      tx = pos.x + ((tx - pos.x) / d) * type.range;
      ty = pos.y + ((ty - pos.y) / d) * type.range;
    }
    const a = Math.atan2(ty - pos.y, tx - pos.x);
    if (type.weapon === 'mg') {
      // Streukegel bis zur Reichweite
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.arc(pos.x, pos.y, type.range, a - 0.15, a + 0.15);
      ctx.closePath();
      ctx.fillStyle = 'rgba(250, 204, 21, 0.22)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.lineTo(tx, ty);
      ctx.setLineDash([6, 8]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.stroke();
      ctx.setLineDash([]);
      const rr = type.weapon === 'air' ? 26 : 16;
      ctx.strokeStyle = type.weapon === 'air' ? '#f97316' : '#ef4444';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(tx, ty, rr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(tx - rr - 6, ty);
      ctx.lineTo(tx + rr + 6, ty);
      ctx.moveTo(tx, ty - rr - 6);
      ctx.lineTo(tx, ty + rr + 6);
      ctx.stroke();
      if (type.weapon === 'air') {
        // Die Flugzeuge kommen in Blickrichtung des Funkers
        ctx.beginPath();
        ctx.moveTo(tx - Math.cos(a) * 90, ty - Math.sin(a) * 90);
        ctx.lineTo(tx + Math.cos(a) * 90, ty + Math.sin(a) * 90);
        ctx.setLineDash([4, 6]);
        ctx.strokeStyle = 'rgba(249, 115, 22, 0.8)';
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function hpAt(shot, id, t) {
    let hp = shot.before[id] ?? 0;
    for (const h of shot.hits) if (h.id === id && h.t <= t) hp -= h.dmg;
    return hp;
  }

  function livePos(R, u) {
    if (R.turn && ks.live && ks.live.turn === R.turn.seq && ks.live.id === u.id) return ks.live;
    return u;
  }

  function smoothPos(u, p) {
    const d = ks.disp.get(u.id);
    if (!d || Math.hypot(d.x - p.x, d.y - p.y) > 80) {
      const fresh = { x: p.x, y: p.y, f: p.f ?? u.f };
      ks.disp.set(u.id, fresh);
      return fresh;
    }
    d.x = lerp(d.x, p.x, 0.45);
    d.y = lerp(d.y, p.y, 0.45);
    d.f = p.f ?? u.f;
    return d;
  }

  function draw() {
    ks.frame = null;
    const R = S?.round;
    if (!R || S.game.id !== 'kampfschafe' || S.phase !== 'playing' || !ks.view || !canvas.isConnected) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(mapImage(R), 0, 0);
    applyTransform();
    for (const m of R.medkits) if (!m.used) drawMedkit(m);

    const shot = R.shot;
    const anim = playing(R);
    const t = anim ? (now() - shot.startAt) / 1000 : 0;
    const activeId = R.turn?.unitId;
    // Bodentruppen zuerst, Hubschrauber obendrauf
    const order = [...R.units].sort((a, b) => (typeOf(R, a).flies ? 1 : 0) - (typeOf(R, b).flies ? 1 : 0));
    for (const u of order) {
      if (anim) {
        const before = shot.before[u.id] ?? 0;
        if (before <= 0) continue;
        const hp = hpAt(shot, u.id, t);
        let alpha = 1;
        if (hp <= 0) {
          const kill = shot.hits.find((h) => h.id === u.id && h.kill);
          const k = (t - kill.t) / 0.6;
          alpha = Math.max(0, 1 - k);
          if (k < 2.2) uprightText(KILL_LINES[(u.id.length + u.id.charCodeAt(u.id.length - 1)) % KILL_LINES.length], u.x, u.y - 34 - k * 14, 24, '#fde047', 1 - k / 2.2);
          if (alpha <= 0) continue;
        }
        const pos = u.id === shot.unitId ? { x: u.x, y: u.y, f: shot.angle } : u;
        drawUnit(R, u, pos, Math.max(0, hp), { alpha });
      } else {
        if (u.hp <= 0) continue;
        const pos = smoothPos(u, livePos(R, u));
        drawUnit(R, u, pos, u.hp, { active: u.id === activeId && R.turn });
      }
    }
    if (!anim && R.turn) {
      const u = R.units.find((x) => x.id === activeId);
      if (u && u.hp > 0) drawAim(R, u, ks.disp.get(u.id) || u);
    }
    if (anim) drawShot(R, shot, t);
    updateHud(R);
    if (shot && R.phase === 'firing' && !anim && ks.shotEndRendered !== shot.seq) {
      ks.shotEndRendered = shot.seq;
      setTimeout(render, 0);
    }
    ks.frame = requestAnimationFrame(draw);
  }

  function drawShot(R, shot, t) {
    for (const p of shot.projectiles) {
      if (t < p.t0 || t > p.t1) continue;
      const k = p.t1 > p.t0 ? (t - p.t0) / (p.t1 - p.t0) : 1;
      const x = lerp(p.x0, p.x1, k);
      const y = lerp(p.y0, p.y1, k);
      const a = Math.atan2(p.y1 - p.y0, p.x1 - p.x0);
      if (p.k === 'bullet') {
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x - Math.cos(a) * 10, y - Math.sin(a) * 10);
        ctx.lineTo(x, y);
        ctx.stroke();
      } else {
        const len = p.k === 'salvo' ? 14 : 26;
        ctx.strokeStyle = 'rgba(226, 232, 240, 0.85)';
        ctx.lineWidth = p.k === 'salvo' ? 3 : 5;
        ctx.beginPath();
        ctx.moveTo(x - Math.cos(a) * len, y - Math.sin(a) * len);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, p.k === 'shell' ? 6 : 4, 0, Math.PI * 2);
        ctx.fillStyle = p.k === 'shell' ? '#1f2937' : '#f97316';
        ctx.fill();
      }
    }
    for (const p of shot.planes) {
      if (t < p.t0 || t > p.t1) continue;
      const k = (t - p.t0) / (p.t1 - p.t0);
      const x = lerp(p.x0, p.x1, k);
      const y = lerp(p.y0, p.y1, k);
      const a = Math.atan2(p.y1 - p.y0, p.x1 - p.x0);
      ctx.beginPath();
      ctx.arc(x + 14, y + 22, 16, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fill();
      // ✈️ zeigt nach rechts oben, deshalb 45° zurückdrehen
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a + Math.PI / 4);
      ctx.font = `44px ${EMOJI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✈️', 0, 0);
      ctx.restore();
    }
    for (const e of shot.explosions) {
      const k = (t - e.t) / 0.5;
      if (k < 0 || k > 1) continue;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * (0.35 + 0.75 * k), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(251, 146, 60, ${0.85 * (1 - k)})`;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * 0.5 * (1 - k * 0.5), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(254, 240, 138, ${0.9 * (1 - k)})`;
      ctx.fill();
    }
    for (const h of shot.hits) {
      const k = (t - h.t) / 1.1;
      if (k < 0 || k > 1) continue;
      const u = R.units.find((x) => x.id === h.id);
      if (u) uprightText(`-${h.dmg}`, u.x + 14, u.y - 20 - k * 26, 20, '#f87171', 1 - k);
    }
  }

  function requestDraw() {
    if (!ks.frame) ks.frame = requestAnimationFrame(draw);
  }

  // Zeitleiste und Stick-Anzeige ohne Neuaufbau der Seite
  function updateHud(R) {
    const bar = document.getElementById('ks-time');
    if (bar) {
      let html = '';
      const n = now();
      if (R.phase === 'ready' && R.turn) {
        html = R.turn.needsGo ? '<span>Bereit?</span>' : `<span>Gleich geht's los … ${Math.max(1, Math.ceil((R.turn.readyEnd - n) / 1000))}</span>`;
      } else if (R.phase === 'turn' && R.turn?.end) {
        const total = R.turn.end - R.turn.start;
        const left = Math.max(0, R.turn.end - n);
        const moveLeft = Math.max(0, R.turn.moveEnd - n);
        const frac = total > 0 ? left / total : 0;
        const label = moveLeft > 0 ? `🚶 Fahren: ${Math.ceil(moveLeft / 1000)} s` : `🎯 Nur noch zielen: ${Math.ceil(left / 1000)} s`;
        html = `<div class="ks-time-fill ${moveLeft > 0 ? '' : 'aim'}" style="width:${(frac * 100).toFixed(1)}%"></div><span>${label}</span>`;
      }
      if (bar.dataset.html !== html) {
        bar.dataset.html = html;
        bar.innerHTML = html;
      }
    }
    const thumb = document.getElementById('ks-joy-thumb');
    if (thumb) {
      const j = ks.joy || { x: 0, y: 0 };
      thumb.style.transform = `translate(${(j.x * 38).toFixed(1)}px, ${(j.y * 38).toFixed(1)}px)`;
    }
  }

  // ---------- Spielansicht ----------

  function aliveShown(R, s) {
    return playing(R) ? R.shot.aliveBefore?.[s.id] ?? s.alive : s.alive;
  }

  function sideRow(R, s) {
    const active = R.turn?.side === s.id;
    const units = R.units.filter((u) => u.side === s.id);
    const anim = playing(R);
    const icons = units.map((u) => {
      const hp = anim ? R.shot.before[u.id] : u.hp;
      const type = typeOf(R, u);
      return `<span class="${hp > 0 ? '' : 'gone'} ${R.turn?.unitId === u.id ? 'now' : ''}" title="${esc(type.name)}: ${Math.max(0, hp)}/${u.maxHp}">${type.badge}</span>`;
    }).join('');
    const who = s.teamId
      ? `<span class="team-dot" style="--team:${s.color}"></span><b>${esc(s.name)}</b>`
      : `${avatarHtml(playerById(s.members[0]), 'sm')}<b>${esc(s.name)}</b>`;
    return `<div class="ks-side ${active ? 'active' : ''} ${aliveShown(R, s) === 0 ? 'out' : ''}" style="--side:${s.color}">
      <div class="row" style="gap:6px;flex-wrap:nowrap;min-width:0">${who}${R.sets > 1 ? `<span class="ks-wins" title="Gewonnene Sätze">${'🏆'.repeat(s.wins) || '–'}</span>` : ''}</div>
      <div class="ks-icons">${icons}</div>
      ${s.teamId && active && R.turn ? `<div class="small muted">steuert: ${esc(playerName(R.turn.shooterId))}</div>` : ''}
      ${!s.present ? '<div class="small" style="color:var(--pink)">nicht da</div>' : ''}
    </div>`;
  }

  function unitLabel(R) {
    const u = R.units.find((x) => x.id === R.turn?.unitId);
    if (!u) return '';
    const type = typeOf(R, u);
    return `${type.badge} ${esc(type.name)}`;
  }

  function viewStatus(R) {
    let text = '';
    let mine = false;
    const name = R.turn ? esc(playerName(R.turn.shooterId)) : '';
    if (R.phase === 'ready' && R.turn) {
      mine = R.canAct;
      if (mine && R.turn.needsGo) text = `📱 ${name} ist dran mit ${unitLabel(R)}!`;
      else if (mine) text = `${sharedHere() ? `${name} ist` : 'Gleich bist du'} dran: ${unitLabel(R)}`;
      else text = `Gleich: ${name} mit ${unitLabel(R)}`;
    } else if (R.phase === 'turn' && R.turn) {
      mine = R.canAct;
      if (mine) text = `${sharedHere() ? `${name}: ` : ''}${unitLabel(R)} fahren, Ziel antippen, Feuer!`;
      else if (!sideById(R, R.turn.side).present) text = `⏳ Warte auf ${name} …`;
      else text = `${name} steuert ${unitLabel(R)} …`;
    } else if (R.phase === 'firing') {
      text = '💥 Feuer!';
    } else if (R.phase === 'setEnd' || R.phase === 'final') {
      const w = sideById(R, R.result?.winner);
      text = w ? `🏆 ${esc(w.name)} gewinnt${R.sets > 1 ? (R.phase === 'final' ? ' die Partie' : ` Satz ${R.setNo}`) : ''}!` : '';
    }
    return `<div class="ks-status ${mine ? 'mine' : ''}">${text}</div>`;
  }

  function viewControls(R) {
    if (!myTurn(R)) return '';
    if (R.phase === 'ready' && R.turn.needsGo) {
      return `<div class="ks-controls go"><button class="btn primary ks-go" data-action="ksGo">Los geht's, ${esc(playerName(R.turn.shooterId))}!</button></div>`;
    }
    const u = R.units.find((x) => x.id === R.turn.unitId);
    const type = u ? typeOf(R, u) : null;
    return `<div class="ks-controls">
      <div class="ks-joy" id="ks-joy" title="Fahren"><div class="ks-joy-thumb" id="ks-joy-thumb"></div></div>
      <div class="ks-unitinfo">
        <b>${type ? `${type.badge} ${esc(type.name)}` : ''}</b>
        <span class="small muted">${u ? `❤️ ${u.hp}/${u.maxHp}` : ''}${type ? ` · ${esc(type.info)}` : ''}</span>
        ${R.freeChoice && !R.turn.moved ? '<span class="small muted">Tipp ein anderes eigenes Schaf an, um es zu nehmen.</span>' : ''}
        ${bigScreen(R) ? '<span class="small muted">Tastatur: Pfeile/WASD fahren, Leertaste feuert.</span>' : ''}
      </div>
      <button class="btn primary ks-fire" data-action="ksFire">🔥 Feuer!</button>
    </div>`;
  }

  function viewLog(R) {
    const hide = playing(R) ? R.shot.logBefore : Infinity;
    const lines = R.log.filter((l) => l.seq <= hide);
    if (!lines.length) return '';
    return `<div class="ks-log">${[...lines].reverse().slice(0, 4).map((l) => `<div>${esc(l.text)}</div>`).join('')}</div>`;
  }

  function viewSetEnd(R) {
    if (R.phase !== 'setEnd' || !R.result) return '';
    const w = sideById(R, R.result.winner);
    return `<div class="card stack center">
      <div style="font-size:2.4rem">🐑🏆</div>
      <h2 style="margin:0">${esc(w.name)} gewinnt Satz ${R.setNo}!</h2>
      ${R.result.left === 1 ? '<div class="small">Mit dem allerletzten Schaf!</div>' : ''}
      <div class="ks-score">${R.sides.map((s) => `<span style="color:${s.color}">${esc(s.name)} <b>${s.wins}</b></span>`).join('')}</div>
      <div class="small muted">${S.me.isHost ? 'Starte den nächsten Satz unten in der Leiste.' : 'Gleich startet der Host den nächsten Satz.'}</div>
    </div>`;
  }

  function viewPlaying(R) {
    const map = W.MAPS[R.mapId];
    const big = bigScreen(R);
    return `<div class="stack ks">
      <div class="q-head">
        <div class="small muted"><b>Kampfschafe</b> · ${map.icon} ${esc(map.name)}${R.sets > 1 ? ` · Satz ${R.setNo}, ${R.sets} Gewinnsätze` : ''}</div>
      </div>
      ${big ? '' : viewStatus(R)}
      <div class="ks-layout ${big ? 'big' : ''}">
        <div class="stack" style="gap:8px;min-width:0">
          <div class="ks-board" id="ks-board"></div>
          <div class="ks-time" id="ks-time"></div>
          ${viewControls(R)}
        </div>
        <div class="ks-panel stack">
          ${big ? viewStatus(R) : ''}
          <div class="ks-sides">${R.sides.map((s) => sideRow(R, s)).join('')}</div>
          ${viewLog(R)}
        </div>
      </div>
      ${viewSetEnd(R)}
    </div>`;
  }

  function viewFinal(R) {
    const winner = sideById(R, R.standings[0].id);
    const a = R.awards;
    const names = (ids) => ids.map((id) => esc(playerName(id))).join(', ');
    const awards = [
      a.sniper && ['🎯', 'Scharfschaf', `${names(a.sniper.ids)} (${a.sniper.value} erledigt)`],
      a.friendly && ['🙈', 'Eigenbeschuss', `${names(a.friendly.ids)} (${a.friendly.value} Schaden an den eigenen)`],
      a.medic && ['🩹', 'Sanitäter', `${names(a.medic.ids)} (${a.medic.value} Medipack${a.medic.value === 1 ? '' : 's'})`],
    ].filter(Boolean);
    return `<div class="stack ks">
      <div class="center"><div style="font-size:3rem">🏆</div>
        <h1>${esc(winner.name)} gewinnt!</h1></div>
      <div class="ks-layout"><div class="ks-board" id="ks-board"></div>
        <div class="ks-panel stack">
          <div class="card stack">
            <h3 style="margin:0">Ergebnis</h3>
            ${R.standings.map((st, i) => {
              const s = sideById(R, st.id);
              return `<div class="score-row" style="--team:${s.color}"><span class="rank">${i + 1}.</span><span class="name">${esc(s.name)}</span>
                <span class="small muted">${st.damage} Schaden</span>${R.sets > 1 ? `<b>${st.wins}</b>` : ''}</div>`;
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
    if (R.turn?.seq !== ks.live?.turn) ks.live = null;
    if (!myTurn(R)) {
      releaseJoy();
      ks.keys.clear();
    }
    if (ks.targetTurn !== R.turn?.seq) {
      ks.target = null;
      ks.targetTurn = R.turn?.seq ?? null;
    }
    return R.phase === 'final' ? viewFinal(R) : viewPlaying(R);
  }

  function hostbar() {
    const R = S.round;
    if (R.phase === 'final') return '<button class="btn primary" data-action="toLobby">Neue Partie (zur Lobby)</button>';
    if (R.phase === 'setEnd') return '<button class="btn primary" data-action="next">Nächster Satz ▶︎</button>';
    if ((R.phase === 'turn' || R.phase === 'ready') && R.turn) return `<button class="btn" data-action="ksForce">⏭ ${esc(playerName(R.turn.shooterId))} überspringen</button>`;
    return '';
  }

  function afterRender() {
    if (S?.game.id !== 'kampfschafe' || S.phase !== 'playing') return;
    const board = document.getElementById('ks-board');
    if (!board) return;
    board.appendChild(canvas);
    board.classList.toggle('aiming', myTurn(S.round));
    layoutCanvas();
    requestDraw();
  }

  // Bildschirmposition eines Weltpunkts (für die Browser-Tests)
  function screenPoint(x, y) {
    if (!ks.view) return null;
    const v = ks.view;
    const r = (v.rot * Math.PI) / 180;
    const dx = (x - W.CENTER.x) * v.scale;
    const dy = (y - W.CENTER.y) * v.scale;
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + v.cssW / 2 + dx * Math.cos(r) - dy * Math.sin(r), y: rect.top + v.cssH / 2 + dx * Math.sin(r) + dy * Math.cos(r), rot: v.rot, scale: v.scale };
  }

  gameViews.kampfschafe = { settings: viewSettings, lobbyExtra, view, hostbar, afterRender, screenPoint, live: () => ks.live };

  // ---------- Steuerung ----------

  function currentInput() {
    if (ks.joy) return { x: ks.joy.x, y: ks.joy.y };
    let x = 0;
    let y = 0;
    if (ks.keys.has('left')) x -= 1;
    if (ks.keys.has('right')) x += 1;
    if (ks.keys.has('up')) y -= 1;
    if (ks.keys.has('down')) y += 1;
    const len = Math.hypot(x, y);
    return len ? { x: x / len, y: y / len } : { x: 0, y: 0 };
  }

  // Fahrbefehl schicken, höchstens alle 50 ms (Stillstand sofort)
  function sendInput(force = false) {
    const R = S?.round;
    if (!R || !ks.view) return;
    const screen = currentInput();
    const w = screenDirToWorld(screen.x, screen.y);
    const x = Math.round(w.x * 100) / 100;
    const y = Math.round(w.y * 100) / 100;
    if (x === ks.sentInput.x && y === ks.sentInput.y) return;
    const t = Date.now();
    clearTimeout(ks.inputTimer);
    const stop = !x && !y;
    if (!force && !stop && t - ks.lastInputAt < 50) {
      ks.inputTimer = setTimeout(() => sendInput(true), 50 - (t - ks.lastInputAt));
      return;
    }
    ks.lastInputAt = t;
    ks.sentInput = { x, y };
    if (!myTurn(R)) return;
    // Mit Rückruf schicken: Ohne ihn wertet der Server den Befehl gar nicht aus
    socket.emit('game:draw', { op: 'input', x, y }, () => {});
  }

  function sendAim(force = false) {
    const t = Date.now();
    clearTimeout(ks.aimTimer);
    if (!force && t - ks.lastAimAt < 60) {
      ks.aimTimer = setTimeout(() => sendAim(true), 60 - (t - ks.lastAimAt));
      return;
    }
    ks.lastAimAt = t;
    if (!ks.target || !myTurn(S.round)) return;
    socket.emit('game:draw', { op: 'aim', x: Math.round(ks.target.x), y: Math.round(ks.target.y) }, () => {});
  }

  function releaseJoy() {
    if (!ks.joy) return;
    ks.joy = null;
    sendInput(true);
  }

  function fireNow() {
    const R = S?.round;
    if (!R || !myTurn(R)) return;
    if (R.phase === 'ready' && R.turn.needsGo) return act('go');
    let target = ks.targetTurn === R.turn.seq ? ks.target : null;
    target = target || R.turn.target;
    if (!target) {
      // Ohne Ziel geradeaus in Blickrichtung
      const u = R.units.find((x) => x.id === R.turn.unitId);
      const p = ks.disp.get(u.id) || u;
      const range = typeOf(R, u).range || 250;
      target = { x: p.x + Math.cos(p.f ?? u.f) * range, y: p.y + Math.sin(p.f ?? u.f) * range };
    }
    clearTimeout(ks.aimTimer);
    releaseJoy();
    act('fire', { x: Math.round(target.x), y: Math.round(target.y) });
  }

  function pointerWorld(e) {
    const rect = canvas.getBoundingClientRect();
    return toWorld(e.clientX - rect.left, e.clientY - rect.top);
  }

  canvas.addEventListener('pointerdown', (e) => {
    const R = S?.round;
    if (!R || !myTurn(R) || !ks.view) return;
    if (R.phase === 'ready' && R.turn.needsGo) return;
    e.preventDefault();
    const p = pointerWorld(e);
    if (R.freeChoice && !R.turn.moved) {
      const own = R.units.find((u) => u.hp > 0 && u.side === R.turn.side && u.id !== R.turn.unitId && Math.hypot(u.x - p.x, u.y - p.y) < u.r + 10);
      if (own) {
        act('select', { unitId: own.id });
        return;
      }
    }
    canvas.setPointerCapture?.(e.pointerId);
    ks.aimPointer = e.pointerId;
    ks.target = p;
    ks.targetTurn = R.turn.seq;
    sendAim(true);
    requestDraw();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (ks.aimPointer !== e.pointerId || !myTurn(S.round)) return;
    ks.target = pointerWorld(e);
    sendAim();
  });

  const endAim = (e) => {
    if (ks.aimPointer !== e.pointerId) return;
    ks.aimPointer = null;
    sendAim(true);
  };
  canvas.addEventListener('pointerup', endAim);
  canvas.addEventListener('pointercancel', endAim);

  // Der Stick wird bei jedem Neuaufbau neu gezeichnet, deshalb hören wir am Fenster zu
  function joyFrom(e) {
    const el = document.getElementById('ks-joy');
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const rad = rect.width / 2;
    let x = (e.clientX - (rect.left + rad)) / (rad * 0.8);
    let y = (e.clientY - (rect.top + rad)) / (rad * 0.8);
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  app.addEventListener('pointerdown', (e) => {
    if (!e.target.closest?.('#ks-joy') || !myTurn(S?.round || {})) return;
    e.preventDefault();
    ks.joy = { pointerId: e.pointerId, ...joyFrom(e) };
    sendInput(true);
  });
  window.addEventListener('pointermove', (e) => {
    if (!ks.joy || ks.joy.pointerId !== e.pointerId) return;
    Object.assign(ks.joy, joyFrom(e));
    sendInput();
  });
  const endJoy = (e) => {
    if (ks.joy && ks.joy.pointerId === e.pointerId) releaseJoy();
  };
  window.addEventListener('pointerup', endJoy);
  window.addEventListener('pointercancel', endJoy);

  const KEYS = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down' };
  window.addEventListener('keydown', (e) => {
    const R = S?.round;
    if (S?.game.id !== 'kampfschafe' || S.phase !== 'playing' || !R || !myTurn(R)) return;
    if (e.target.closest?.('input, textarea, select')) return;
    if (e.key === ' ') {
      e.preventDefault();
      if (!e.repeat) fireNow();
      return;
    }
    const k = KEYS[e.key];
    if (!k) return;
    e.preventDefault();
    ks.keys.add(k);
    sendInput();
  });
  window.addEventListener('keyup', (e) => {
    const k = KEYS[e.key];
    if (!k || !ks.keys.delete(k)) return;
    sendInput(true);
  });
  window.addEventListener('blur', () => {
    ks.keys.clear();
    releaseJoy();
  });

  socket.on('ks-pos', (pos) => {
    if (S?.game.id !== 'kampfschafe' || S.phase !== 'playing') return;
    ks.live = pos;
    requestDraw();
  });

  window.addEventListener('resize', () => {
    if (S?.game.id !== 'kampfschafe' || S.phase !== 'playing') return;
    layoutCanvas();
    requestDraw();
  });

  Object.assign(actions, {
    ksSetting: (el) => sendHost('settings', { game: { [el.dataset.key]: el.dataset.value === '1' } }),
    ksMap: (el) => sendHost('settings', { game: { map: el.dataset.map } }),
    ksFire: () => fireNow(),
    ksGo: () => act('go'),
    ksForce: () => {
      const R = S.round;
      if (R.turn && confirm(`${playerName(R.turn.shooterId)} überspringen?`)) act('force');
    },
    ksRemoveGuest: (el) => socket.emit('guest:remove', { playerId: el.dataset.player }, (res) => { if (res?.error) toast(res.error); }),
  });

  app.addEventListener('submit', (e) => {
    if (e.target.id !== 'ks-guest-form') return;
    e.preventDefault();
    const input = document.getElementById('ks-guest-name');
    const name = input.value.trim();
    if (!name) return toast('Bitte gib einen Namen ein.');
    const avatar = avatars.length ? avatars[Math.floor(Math.random() * avatars.length)] : null;
    socket.emit('guest:add', { name, avatar }, (res) => {
      if (res?.error) return toast(res.error);
      const field = document.getElementById('ks-guest-name');
      if (field) field.value = '';
    });
  });

  app.addEventListener('change', (e) => {
    if (S?.game.id !== 'kampfschafe') return;
    const id = e.target.id;
    if (id === 'ks-army') sendHost('settings', { game: { army: Number(e.target.value) } });
    else if (id === 'ks-time') sendHost('settings', { game: { turnTime: Number(e.target.value) } });
    else if (id === 'ks-sets') sendHost('settings', { game: { sets: Number(e.target.value) } });
  });
})();
