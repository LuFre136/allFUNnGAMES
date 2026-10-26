// Minispiel Party, Brettmodus: das Spielbrett mit laufenden Figuren, Würfel und Glücksrad.
// Wie die Minispiele bleibt das Element beim Neuzeichnen erhalten; mount(el, c) gibt update/frame zurück.

const MinispielBoard = (() => {
  const KIND = {
    start: { color: '#f5f3ff', icon: '🏁' },
    blue: { color: '#3b82f6', icon: '' },
    red: { color: '#ef4444', icon: '' },
    event: { color: '#22c55e', icon: '❓' },
    luck: { color: '#14b8a6', icon: '🍀' },
    bad: { color: '#4b5563', icon: '💀' },
    duel: { color: '#f97316', icon: '⚔️' },
    shop: { color: '#a855f7', icon: '🛒' },
  };
  const W = 1000;
  const H = 600;

  function boardSvg(def) {
    const byId = new Map(def.fields.map((f) => [f.id, f]));
    const lines = def.fields.flatMap((f) => f.next.map((n) => {
      const g = byId.get(n);
      return `<line x1="${f.x}" y1="${f.y}" x2="${g.x}" y2="${g.y}" class="${f.shortcut || g.shortcut ? 'short' : ''}"/>`;
    })).join('');
    const fields = def.fields.map((f) => {
      const k = KIND[f.kind] || KIND.blue;
      return `<g class="mp-bd-field ${f.kind}" transform="translate(${f.x} ${f.y})"><circle r="25" fill="${k.color}"/>${k.icon ? `<text y="9" text-anchor="middle" font-size="26">${k.icon}</text>` : ''}</g>`;
    }).join('');
    return `<svg class="mp-bd-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <text x="500" y="330" text-anchor="middle" font-size="150" opacity="0.18">${def.icon}</text>
      <g class="mp-bd-lines">${lines}</g>${fields}
    </svg>`;
  }

  function mount(el, c) {
    const B0 = c.board();
    el.innerHTML = `<div class="mp-bd ${c.big ? 'big' : 'small'}">
      <div class="mp-bd-zoom"><div class="mp-bd-inner">${boardSvg(B0.def)}<div class="mp-bd-star">⭐</div><div class="mp-bd-figs"></div></div></div>
      <div class="mp-bd-dice hidden"></div>
      <div class="mp-bd-wheel hidden"></div>
      <div class="mp-bd-msg hidden"></div>
      ${c.big ? '' : '<button class="btn small mp-bd-zoombtn" type="button"></button>'}
    </div>`;
    const zoomBox = el.querySelector('.mp-bd-zoom');
    const inner = el.querySelector('.mp-bd-inner');
    const figsEl = el.querySelector('.mp-bd-figs');
    const starEl = el.querySelector('.mp-bd-star');
    const diceEl = el.querySelector('.mp-bd-dice');
    const wheelEl = el.querySelector('.mp-bd-wheel');
    const msgEl = el.querySelector('.mp-bd-msg');
    const zoomBtn = el.querySelector('.mp-bd-zoombtn');
    const fieldById = new Map(B0.def.fields.map((f) => [f.id, f]));
    let zoom = !c.big; // Handys zoomen auf die Figur, die gerade läuft
    let figs = new Map();
    let shownMsg = null;
    let diceFace = 1;
    let lastDiceSwap = 0;

    function buildFigs() {
      const B = c.board();
      figsEl.innerHTML = B.order.map((id) => `<div class="mp-bd-fig" data-id="${esc(id)}">${avatarHtml(playerById(id))}</div>`).join('');
      figs = new Map([...figsEl.querySelectorAll('.mp-bd-fig')].map((d) => [d.dataset.id, d]));
    }

    function setZoomLabel() {
      if (zoomBtn) zoomBtn.textContent = zoom ? '🗺️ Ganzes Brett' : '🔍 Näher ran';
    }

    if (zoomBtn) {
      zoomBtn.addEventListener('click', () => {
        zoom = !zoom;
        setZoomLabel();
      });
    }
    setZoomLabel();
    buildFigs();

    // Position einer Figur zum Zeitpunkt t, mit Hüpfer zwischen den Feldern
    function figPos(B, id, t) {
      const pl = B.players[id];
      const f = fieldById.get(pl.field);
      let pos = { x: f.x, y: f.y, hop: 0, fade: 1 };
      const tn = B.turn;
      const a = tn?.anim;
      if (!a) return pos;
      const step = B.timing.step;
      if (a.swap && (id === a.swap.id) && t < a.startAt + 600) {
        const q = Math.max(0, (t - a.startAt) / 600);
        return { ...pos, fade: Math.abs(1 - 2 * q) };
      }
      if (id !== tn.id) return pos;
      if (a.teleport) {
        if (t < a.startAt + 600) {
          const q = Math.max(0, (t - a.startAt) / 600);
          const from = fieldById.get(a.from);
          const src = q < 0.5 ? from : f;
          return { x: src.x, y: src.y, hop: 0, fade: Math.abs(1 - 2 * q) };
        }
        return pos;
      }
      const pts = [a.from, ...a.path].map((fid) => fieldById.get(fid));
      const e = t - a.startAt;
      if (e >= a.path.length * step) return pos;
      const k = Math.max(0, Math.floor(e / step));
      const q = Math.max(0, (e - k * step) / step);
      const p0 = pts[k];
      const p1 = pts[k + 1] || p0;
      return { x: p0.x + (p1.x - p0.x) * q, y: p0.y + (p1.y - p0.y) * q, hop: Math.sin(q * Math.PI), fade: 1 };
    }

    function frame(t) {
      const B = c.board();
      if (!B) return;
      if (figs.size !== B.order.length) buildFigs();
      // Mehrere Figuren auf einem Feld leicht versetzen
      const groups = new Map();
      const pos = new Map();
      for (const id of B.order) {
        const p = figPos(B, id, t);
        pos.set(id, p);
        const key = `${Math.round(p.x)}:${Math.round(p.y)}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(id);
      }
      for (const [id, node] of figs) {
        const p = pos.get(id);
        if (!p) continue;
        const g = groups.get(`${Math.round(p.x)}:${Math.round(p.y)}`);
        const i = g.indexOf(id);
        const n = g.length;
        const ox = n > 1 ? Math.cos((i / n) * Math.PI * 2) * 18 : 0;
        const oy = n > 1 ? Math.sin((i / n) * Math.PI * 2) * 12 : 0;
        node.style.left = `${((p.x + ox) / W) * 100}%`;
        node.style.top = `${((p.y + oy) / H) * 100}%`;
        node.style.transform = `translate(-50%, calc(-78% - ${p.hop * 28}%))`;
        node.style.opacity = p.fade;
        node.classList.toggle('active', B.turn?.id === id);
        node.style.zIndex = B.turn?.id === id ? 5 : 2;
      }
      // Stern
      const sf = fieldById.get(B.star);
      const sm = B.turn?.starMoved;
      const moving = sm && t < sm.at + 900;
      starEl.style.left = `${(sf.x / W) * 100}%`;
      starEl.style.top = `${(sf.y / H) * 100}%`;
      starEl.classList.toggle('moving', Boolean(moving));
      // Zoom auf die laufende Figur (oder die eigene)
      const focusId = B.turn?.id || c.mine();
      const fp = pos.get(focusId) || pos.get(c.mine());
      const bw = zoomBox.clientWidth;
      const bh = zoomBox.clientHeight;
      const iw = inner.offsetWidth;
      const ih = inner.offsetHeight;
      if (zoom && fp && bw) {
        const s = Math.max(1.8, bh / ih);
        const px = (fp.x / W) * iw * s;
        const py = (fp.y / H) * ih * s;
        const tx = Math.min(0, Math.max(bw - iw * s, bw / 2 - px));
        const ty = Math.min(0, Math.max(bh - ih * s, bh / 2 - py));
        inner.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
      } else if (bh > ih + 2) inner.style.transform = `translateY(${(bh - ih) / 2}px)`;
      else inner.style.transform = '';
      // Würfel
      const tn = B.turn;
      if (tn && tn.dice && ['dice', 'moving'].includes(tn.step)) {
        diceEl.classList.remove('hidden');
        const rolling = t < tn.rolledAt + B.timing.dice - 350;
        if (rolling) {
          if (performance.now() - lastDiceSwap > 70) {
            lastDiceSwap = performance.now();
            diceFace = tn.dice.map(() => 1 + Math.floor(Math.random() * 10)).join(' + ');
          }
          diceEl.textContent = diceFace;
        } else diceEl.textContent = tn.dice.length > 1 ? `${tn.dice.join(' + ')} = ${tn.dice[0] + tn.dice[1]}` : String(tn.dice[0]);
        diceEl.classList.toggle('rolling', rolling);
      } else diceEl.classList.add('hidden');
      // Glücksrad
      if (tn?.wheel && tn.step === 'wheel') {
        const w = tn.wheel;
        const total = w.options.length * 3 + w.index;
        const q = Math.min(1, Math.max(0, (t - w.at) / (B.timing.wheel - 400)));
        const cur = Math.floor((1 - (1 - q) ** 3) * total) % w.options.length;
        wheelEl.classList.remove('hidden');
        wheelEl.innerHTML = `<div class="mp-bd-wheel-title">🍀 Glücksrad</div><div class="mp-bd-wheel-row">${w.options.map((o, i) => `<span class="${i === cur ? 'on' : ''}">${o.icon}<small>${esc(o.label)}</small></span>`).join('')}</div>`;
      } else if (!wheelEl.classList.contains('hidden')) wheelEl.classList.add('hidden');
      // Meldung
      const msg = tn && ['effect', 'choice', 'wheel', 'moving', 'start'].includes(tn.step) ? tn.message : null;
      if (msg !== shownMsg) {
        shownMsg = msg;
        msgEl.textContent = msg || '';
        msgEl.classList.toggle('hidden', !msg);
      }
    }

    return { update() {}, frame };
  }

  return { mount, KIND };
})();
