// Minispiel Party: die Darstellung der einzelnen Minispiele auf Fernseher und Handy.
// Jedes Minispiel hat mount(el, c) und gibt ein Objekt mit update(R), frame(t) und optional tap(), live(data),
// unmount() zurück. Das Element bleibt beim Neuzeichnen der Seite erhalten, damit Animationen weiterlaufen.
// c: { round(), game(), big, play, now(), move(m, done), draw(data), mine(id) }

const MinispielGames = (() => {
  const $ = (el, sel) => el.querySelector(sel);

  function pl(id) {
    return playerById(id);
  }

  function pname(id) {
    return esc(pl(id)?.name || 'Jemand');
  }

  function who(id, cls = 'sm') {
    return avatarHtml(pl(id), cls);
  }

  function fmtSec(ms, digits = 2) {
    return (Math.max(0, ms) / 1000).toFixed(digits).replace('.', ',');
  }

  // Leiste mit Restzeit
  function timeLeft(t, endAt) {
    return Math.max(0, Math.ceil((endAt - t) / 1000));
  }

  // Ein Feld, das auf Fingertipp (pointerdown) reagiert, ohne Verzögerung durch Klick-Erkennung
  function onPress(target, fn) {
    target.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || S?.round?.phase !== 'play') return;
      e.preventDefault();
      fn(e);
    });
  }

  // ---------- Schnellzieher ----------

  const SZ_SLOT = 7000;

  const schnellzieher = {
    mount(el, c) {
      const G0 = c.game();
      const mine = (G0.mine || []).map((r) => r && (r.early ? { early: true } : { ms: r.ms }));
      let shownAt = null; // wann das Signal für den laufenden Durchgang auf diesem Gerät erschien
      let shownRound = -1;
      el.innerHTML = `<div class="mp-sz">
        <div class="mp-sz-round small muted"></div>
        ${c.play ? '<button class="mp-sz-pad wait" type="button"><span class="mp-sz-text"></span><span class="mp-sz-sub small"></span></button>' : ''}
        ${c.big && !c.play ? '<div class="mp-sz-light wait"><span class="mp-sz-text"></span></div>' : ''}
        ${c.big ? '<div class="mp-sz-table"></div>' : ''}
      </div>`;
      const pad = $(el, '.mp-sz-pad');
      const light = $(el, '.mp-sz-light');
      const roundLabel = $(el, '.mp-sz-round');

      function current(t) {
        const { rounds } = c.game();
        for (let r = 0; r < rounds.length; r++) if (t < rounds[r].endAt + 300) return r;
        return rounds.length - 1;
      }

      function stateAt(t) {
        const R = c.round();
        const { rounds } = c.game();
        const r = current(t);
        const slotStart = R.startAt + r * SZ_SLOT;
        if (t < R.startAt) return { r, s: 'idle' };
        if (t < slotStart) return { r, s: 'between' };
        if (t < rounds[r].signalAt) return { r, s: 'wait' };
        if (t < rounds[r].endAt) return { r, s: 'go' };
        return { r, s: 'over' };
      }

      function tap() {
        if (!c.play) return;
        const t = c.now();
        const { r, s } = stateAt(t);
        if (mine[r] || !['wait', 'go'].includes(s)) return;
        if (s === 'wait' || shownRound !== r || shownAt === null) {
          mine[r] = { early: true };
          c.move({ type: 'react', round: r, early: true });
        } else {
          const ms = Math.round(performance.now() - shownAt);
          mine[r] = ms < 100 ? { early: true } : { ms };
          c.move({ type: 'react', round: r, ms });
        }
        paint(t);
      }

      if (pad) onPress(pad, tap);

      function paint(t) {
        const { r, s } = stateAt(t);
        const { rounds } = c.game();
        if (s === 'go' && shownRound !== r) {
          shownRound = r;
          shownAt = performance.now();
        }
        roundLabel.textContent = `Durchgang ${r + 1} von ${rounds.length}`;
        const look = s === 'go' ? 'go' : s === 'wait' ? 'wait' : 'idle';
        const text = { idle: '…', between: 'Gleich geht’s weiter …', wait: 'Warten …', go: 'JETZT!', over: '…' }[s];
        if (pad) {
          const res = mine[r];
          let cls = look;
          let main = text;
          let sub = s === 'wait' ? 'Nicht tippen, bis es grün wird!' : s === 'go' ? 'Tippen!' : '';
          if (res) {
            cls = res.early ? 'early' : 'done';
            main = res.early ? 'Zu früh! ⛔' : `${res.ms} ms`;
            sub = r + 1 < rounds.length ? 'Gleich kommt der nächste Durchgang.' : 'Fertig!';
          } else if (s === 'over' || (s === 'between' && r > 0 && !mine[r - 1])) {
            main = s === 'over' ? 'Zu langsam! 🐢' : main;
          }
          pad.className = `mp-sz-pad ${cls}`;
          $(pad, '.mp-sz-text').textContent = main;
          $(pad, '.mp-sz-sub').textContent = sub;
        }
        if (light) {
          light.className = `mp-sz-light ${look}`;
          $(light, '.mp-sz-text').textContent = s === 'between' || s === 'idle' || s === 'over' ? `Durchgang ${Math.min(r + (s === 'over' ? 2 : 1), rounds.length)}` : text;
        }
      }

      function table() {
        if (!c.big) return;
        const R = c.round();
        const G = c.game();
        const rows = R.participants.map((id) => `<tr><td>${who(id)} ${pname(id)}</td>${G.rounds.map((_, i) => {
          const shown = G.shown[i];
          if (!shown) return `<td>${G.tapped[i].includes(id) ? '✋' : ''}</td>`;
          const res = shown[id];
          return `<td class="${res?.early ? 'bad' : ''}">${!res ? '🐢' : res.early ? '⛔' : `${res.ms}`}</td>`;
        }).join('')}</tr>`).join('');
        $(el, '.mp-sz-table').innerHTML = `<table class="mp-table"><thead><tr><th></th>${G.rounds.map((_, i) => `<th>${i + 1}.</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
      }

      table();
      return {
        update() {
          const G = c.game();
          (G.mine || []).forEach((res, i) => { if (res && !mine[i]) mine[i] = res; });
          table();
        },
        frame: paint,
        tap,
      };
    },
  };

  // ---------- Seilhüpfer ----------

  const seilhuepfer = {
    mount(el, c) {
      const windowFor = (k) => Math.max(110, 210 - 2 * k);
      const hit = new Set();
      let out = c.game().out?.[c.mine()] !== undefined;
      let jumpUntil = 0;
      const ids = c.round().participants;
      const shown = c.big || !c.round().tv ? ids : ids.filter((id) => id === c.mine());
      el.innerHTML = `<div class="mp-sh">
        <div class="mp-sh-info"></div>
        <div class="mp-sh-scene ${shown.length > 1 ? 'many' : 'one'}">
          <svg class="mp-sh-rope" viewBox="0 0 100 60" preserveAspectRatio="none"><path d="" /></svg>
          <div class="mp-sh-row">${shown.map((id) => `<div class="mp-sh-kid" data-id="${esc(id)}">${who(id, shown.length > 1 ? '' : 'lg')}<span class="mp-sh-name">${pname(id)}</span></div>`).join('')}</div>
        </div>
        ${c.play ? '<button class="mp-sh-btn" type="button">Hüpf! ⬆️</button>' : ''}
      </div>`;
      const path = $(el, '.mp-sh-rope path');
      const info = $(el, '.mp-sh-info');
      const kids = new Map([...el.querySelectorAll('.mp-sh-kid')].map((k) => [k.dataset.id, k]));
      const btn = $(el, '.mp-sh-btn');

      function times() {
        return c.game().times;
      }

      function report() {
        out = true;
        c.move({ type: 'out', jumps: hit.size });
      }

      function tap() {
        if (!c.play || out) return;
        const t = c.now();
        if (t < c.round().startAt) return;
        jumpUntil = performance.now() + 380;
        const ts = times();
        for (let k = 0; k < ts.length; k++) {
          if (Math.abs(t - ts[k]) <= windowFor(k)) {
            if (!hit.has(k)) hit.add(k);
            return;
          }
          if (ts[k] > t + 1000) break;
        }
        report();
      }

      if (btn) onPress(btn, tap);
      if (c.play) onPress($(el, '.mp-sh-scene'), tap);

      function frame(t) {
        const ts = times();
        let k = ts.findIndex((x) => x > t - 60);
        if (k < 0) k = ts.length - 1;
        const prev = k === 0 ? ts[0] - 1300 : ts[k - 1];
        const p = Math.min(1, Math.max(0, (t - prev) / (ts[k] - prev)));
        const started = t >= ts[0] - 1300;
        const phase = started ? p : 0;
        // Seil: unten beim Sprung, oben in der Mitte zwischen zwei Sprüngen
        const y = 6 + 50 * (1 - Math.cos(2 * Math.PI * (phase + 0.5))) / 2;
        path.setAttribute('d', `M2 18 Q50 ${y * 2 - 18} 98 18`);
        path.parentNode.classList.toggle('back', phase > 0.25 && phase < 0.75);
        // Verpasst?
        if (c.play && !out && started) {
          for (let j = 0; j < ts.length && ts[j] + windowFor(j) < t; j++) {
            if (!hit.has(j)) {
              report();
              break;
            }
          }
        }
        const G = c.game();
        const gone = G.out || {};
        for (const [id, node] of kids) {
          const isOut = gone[id] !== undefined || (id === c.mine() && out);
          node.classList.toggle('out', isOut);
          let up;
          if (id === c.mine() && c.play) up = performance.now() < jumpUntil;
          else up = !isOut && started && Math.abs(t - ts[k]) < 190;
          node.classList.toggle('up', up && !isOut);
        }
        const alive = ids.filter((id) => gone[id] === undefined).length;
        const jumps = `${hit.size} ${hit.size === 1 ? 'Sprung' : 'Sprünge'}`;
        if (c.play) info.innerHTML = out ? `<b>Raus!</b> ${jumps} geschafft. Noch ${alive} im Spiel.` : `<b>${jumps}</b> · noch ${alive} im Spiel`;
        else info.innerHTML = `Noch <b>${alive}</b> im Spiel`;
      }

      return { update() {}, frame, tap };
    },
  };

  // ---------- Farbfolge ----------

  const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#facc15'];

  const farbfolge = {
    mount(el, c) {
      let level = (c.game().levels?.[c.mine()] || 0) + 1;
      let mode = c.game().out?.includes(c.mine()) ? 'out' : 'start'; // start | show | input | wait | out | end
      let showStart = 0;
      let idx = 0;
      let waitUntil = 0;
      let flash = null; // { color, until }
      el.innerHTML = `<div class="mp-ff">
        ${c.play ? `<div class="mp-ff-status"></div><div class="mp-ff-pads">${COLORS.map((col, i) => `<button type="button" class="mp-ff-pad" data-c="${i}" style="--c:${col}"></button>`).join('')}</div>` : ''}
        ${c.big ? '<div class="mp-ff-board"></div>' : ''}
        <div class="small muted center mp-ff-time"></div>
      </div>`;
      const status = $(el, '.mp-ff-status');
      const pads = [...el.querySelectorAll('.mp-ff-pad')];
      const timeEl = $(el, '.mp-ff-time');

      const speed = () => ({ d: Math.max(260, 520 - 14 * level), gap: Math.max(110, 200 - 5 * level) });

      function startShow(t) {
        mode = 'show';
        showStart = t + 500;
        idx = 0;
      }

      pads.forEach((pad) => onPress(pad, () => {
        if (mode !== 'input') return;
        const color = Number(pad.dataset.c);
        flash = { color, until: performance.now() + 180 };
        const seq = c.game().sequence;
        if (color !== seq[idx]) {
          mode = 'out';
          c.move({ type: 'out' });
          return;
        }
        idx++;
        if (idx >= level) {
          c.move({ type: 'level', level });
          if (level >= seq.length) {
            mode = 'end';
            return;
          }
          level++;
          mode = 'wait';
          waitUntil = c.now() + 700;
        }
      }));

      function frame(t) {
        const G = c.game();
        timeEl.textContent = t < G.endAt ? `Noch ${timeLeft(t, G.endAt)} s` : 'Zeit um!';
        if (!c.play) return;
        if (t >= G.endAt && !['out', 'end'].includes(mode)) mode = 'end';
        if (mode === 'start' && t >= c.round().startAt) startShow(t);
        if (mode === 'wait' && t >= waitUntil) startShow(t);
        let lit = null;
        if (mode === 'show') {
          const { d, gap } = speed();
          const e = t - showStart;
          const i = Math.floor(e / (d + gap));
          if (e >= 0 && i < level && e % (d + gap) < d) lit = G.sequence[i];
          if (i >= level) {
            mode = 'input';
            idx = 0;
          }
        }
        if (flash && performance.now() < flash.until) lit = flash.color;
        pads.forEach((pad, i) => {
          pad.classList.toggle('lit', lit === i);
          pad.disabled = mode !== 'input';
        });
        status.innerHTML = {
          start: 'Gleich geht’s los …',
          show: `👀 Pass auf! <b>${level}</b> ${level === 1 ? 'Farbe' : 'Farben'}`,
          input: `👉 Du bist dran: <b>${idx}/${level}</b>`,
          wait: '✅ Richtig!',
          out: `❌ Raus! Geschafft: <b>${Math.max(0, level - 1)}</b>`,
          end: `🏁 Fertig! Geschafft: <b>${mode === 'end' && idx >= level ? level : Math.max(0, level - 1)}</b>`,
        }[mode];
      }

      function board() {
        if (!c.big) return;
        const G = c.game();
        const R = c.round();
        const list = [...R.participants].sort((a, b) => (G.levels[b] || 0) - (G.levels[a] || 0));
        $(el, '.mp-ff-board').innerHTML = list.map((id) => `<div class="mp-bar ${G.out.includes(id) ? 'out' : ''}">${who(id)}<span class="name">${pname(id)}</span>
          <span class="mp-bar-track"><span style="width:${Math.min(100, ((G.levels[id] || 0) / 12) * 100)}%"></span></span><b>${G.levels[id] || 0}</b>${G.out.includes(id) ? ' ❌' : ''}</div>`).join('');
      }

      board();
      return { update: board, frame };
    },
  };

  // ---------- Zählfieber ----------

  const zaehlfieber = {
    mount(el, c) {
      const G0 = c.game();
      const R0 = c.round();
      const showField = c.big || !R0.tv;
      let count = 0;
      let sent = G0.mine;
      el.innerHTML = `<div class="mp-zf">
        <div class="mp-zf-head">${G0.teamMode && !c.play ? `Jeder im Team zählt eine Sorte: <span class="mp-zf-target">${[...new Set(Object.values(G0.kinds))].join(' ')}</span>`
          : `Zähle: <span class="mp-zf-target">${G0.target.emoji}</span> <b>${esc(G0.target.name)}</b>${G0.teamMode ? '<div class="small muted">Die anderen in deinem Team zählen andere Sorten.</div>' : ''}`}</div>
        ${showField ? `<div class="mp-zf-field">${G0.critters.map((cr, i) => `<span class="mp-zf-critter" data-i="${i}">${cr.e}</span>`).join('')}<div class="mp-zf-over hidden">Zeit zum Abgeben!</div></div>`
          : '<div class="notice center">👀 Schau auf den Fernseher und zähle mit!</div>'}
        ${c.play ? `<div class="mp-zf-ctl">
          <button class="btn mp-zf-minus" type="button">−1</button>
          <button class="mp-zf-plus" type="button"><span class="mp-zf-count">0</span><span class="small">+1 antippen beim Zählen</span></button>
          <button class="btn primary mp-zf-send" type="button" disabled>Abschicken</button>
        </div><div class="mp-zf-sent notice center hidden"></div>` : ''}
        <div class="mp-zf-status small muted center"></div>
      </div>`;
      const critters = [...el.querySelectorAll('.mp-zf-critter')];
      const over = $(el, '.mp-zf-over');
      const countEl = $(el, '.mp-zf-count');
      const sendBtn = $(el, '.mp-zf-send');
      const statusEl = $(el, '.mp-zf-status');

      function showSent() {
        const box = $(el, '.mp-zf-sent');
        if (!box || sent === null || sent === undefined) return;
        box.classList.remove('hidden');
        box.innerHTML = `✅ Abgegeben: <b>${sent}</b>`;
        $(el, '.mp-zf-ctl').classList.add('hidden');
      }

      if (c.play) {
        onPress($(el, '.mp-zf-plus'), () => {
          if (sent !== null && sent !== undefined) return;
          count = Math.min(99, count + 1);
          countEl.textContent = count;
        });
        onPress($(el, '.mp-zf-minus'), () => {
          if (sent !== null && sent !== undefined) return;
          count = Math.max(0, count - 1);
          countEl.textContent = count;
        });
        sendBtn.addEventListener('click', () => {
          c.move({ type: 'answer', value: count }, (res) => {
            if (res.ok) {
              sent = count;
              showSent();
            }
          });
        });
        showSent();
      }

      function frame(t) {
        const G = c.game();
        const R = c.round();
        if (critters.length) {
          G.critters.forEach((cr, i) => {
            const q = (t - (R.startAt + cr.at)) / cr.d;
            const node = critters[i];
            if (q < 0 || q > 1) {
              node.style.opacity = '0';
              return;
            }
            const x = cr.dir > 0 ? -8 + 116 * q : 108 - 116 * q;
            const hop = cr.hop ? -Math.abs(Math.sin(q * Math.PI * 6)) * 14 : 0;
            node.style.opacity = '1';
            node.style.left = `${x}%`;
            node.style.top = `${cr.y}%`;
            node.style.transform = `translate(-50%, calc(-50% + ${hop}px)) scaleX(${cr.dir > 0 ? -1 : 1})`;
          });
          over?.classList.toggle('hidden', t < G.showEnd);
        }
        if (sendBtn) sendBtn.disabled = t < G.showEnd - 1500;
        statusEl.textContent = t < R.startAt ? '' : t < G.showEnd ? 'Zählen …' : `Noch ${timeLeft(t, G.endAt)} s zum Abgeben · ${G.answered.length}/${R.participants.length} abgegeben`;
      }

      return {
        update() {
          const G = c.game();
          if (G.mine !== null && G.mine !== undefined && (sent === null || sent === undefined)) {
            sent = G.mine;
            showSent();
          }
        },
        frame,
        tap: () => {
          if (!c.play || (sent !== null && sent !== undefined)) return;
          count = Math.min(99, count + 1);
          countEl.textContent = count;
        },
      };
    },
  };

  // ---------- Ballonpumpe ----------

  const ballonpumpe = {
    mount(el, c) {
      const G0 = c.game();
      const goal = G0.goal;
      let n = G0.pumps?.[c.mine()] || 0;
      let last = 0;
      let sendTimer = null;
      let lastSent = 0;
      let armed = true;
      const pumps = { ...G0.pumps };
      const popped = { ...G0.popped };
      const ids = c.round().participants;
      const showAll = c.big || !c.round().tv;
      el.innerHTML = `<div class="mp-bp">
        ${showAll ? `<div class="mp-bp-row">${ids.map((id) => `<div class="mp-bp-one" data-id="${esc(id)}"><div class="mp-bp-balloon">🎈</div>${who(id)}<span class="small">${pname(id)}</span></div>`).join('')}</div>` : ''}
        ${c.play ? `<div class="mp-bp-me"><div class="mp-bp-big">🎈</div><div class="mp-bp-pct"></div></div>
          <button class="mp-bp-pump" type="button">Pumpen! 💨</button>
          <div class="mp-bp-motion small muted center"></div>` : ''}
        <div class="mp-bp-time small muted center"></div>
      </div>`;
      const big = $(el, '.mp-bp-big');
      const pct = $(el, '.mp-bp-pct');
      const motionEl = $(el, '.mp-bp-motion');
      const timeEl = $(el, '.mp-bp-time');
      const others = new Map([...el.querySelectorAll('.mp-bp-one')].map((d) => [d.dataset.id, d]));

      function flush() {
        clearTimeout(sendTimer);
        sendTimer = null;
        lastSent = performance.now();
        c.draw({ op: 'pump', n });
      }

      function pump() {
        const t = c.now();
        const G = c.game();
        if (!c.play || n >= goal || t < c.round().startAt || t > G.endAt) return;
        const p = performance.now();
        if (p - last < 85) return;
        last = p;
        n++;
        pumps[c.mine()] = n;
        big.classList.remove('puff');
        void big.offsetWidth;
        big.classList.add('puff');
        if (n >= goal) flush();
        else if (!sendTimer) sendTimer = setTimeout(flush, Math.max(0, 150 - (p - lastSent)));
      }

      function onMotion(e) {
        const a = e.acceleration;
        let m;
        if (a && a.x !== null) m = Math.hypot(a.x || 0, a.y || 0, a.z || 0);
        else {
          const g = e.accelerationIncludingGravity;
          if (!g) return;
          m = Math.abs(Math.hypot(g.x || 0, g.y || 0, g.z || 0) - 9.81);
        }
        if (m > 13 && armed) {
          armed = false;
          pump();
          if (motionEl) motionEl.textContent = '📳 Schütteln klappt!';
        } else if (m < 5) armed = true;
      }

      if (c.play) {
        onPress($(el, '.mp-bp-pump'), pump);
        MinispielGames.motion.listen(onMotion);
        if (MinispielGames.motion.needsButton()) {
          motionEl.innerHTML = '<button class="btn small" type="button">📳 Schütteln erlauben</button>';
          motionEl.querySelector('button').addEventListener('click', async () => {
            await MinispielGames.motion.request();
            motionEl.textContent = MinispielGames.motion.state === 'granted' ? '📳 Jetzt schütteln!' : 'Schütteln geht nicht, dann tippen!';
          });
        } else motionEl.textContent = MinispielGames.motion.available() ? '📳 Schüttel dein Handy oder tippe auf „Pumpen!“' : 'Tippe so schnell du kannst auf „Pumpen!“';
      }

      function size(k) {
        return 1 + (Math.min(k, goal) / goal) * 1.6;
      }

      function frame(t) {
        const G = c.game();
        timeEl.textContent = t < c.round().startAt ? '' : t < G.endAt ? `Noch ${timeLeft(t, G.endAt)} s` : 'Zeit um!';
        if (big) {
          const done = n >= goal;
          big.textContent = done ? '💥' : '🎈';
          big.style.setProperty('--s', done ? 2.2 : size(n));
          pct.textContent = done ? 'Geplatzt! 🎉' : `${Math.round((n / goal) * 100)} %`;
        }
        for (const [id, node] of others) {
          const k = id === c.mine() ? n : pumps[id] || 0;
          const isPopped = popped[id] !== undefined || k >= goal;
          const b = node.firstElementChild;
          b.textContent = isPopped ? '💥' : '🎈';
          b.style.setProperty('--s', isPopped ? 1.6 : size(k) * 0.8);
        }
      }

      return {
        update() {
          const G = c.game();
          Object.assign(popped, G.popped);
          for (const [id, k] of Object.entries(G.pumps)) if (id !== c.mine()) pumps[id] = Math.max(pumps[id] || 0, k);
        },
        live(data) {
          if (!data.pumps) return;
          for (const [id, k] of Object.entries(data.pumps)) if (id !== c.mine()) pumps[id] = Math.max(pumps[id] || 0, k);
        },
        frame,
        tap: pump,
        unmount() {
          clearTimeout(sendTimer);
          MinispielGames.motion.unlisten(onMotion);
        },
      };
    },
  };

  // ---------- Heiße Kartoffel ----------

  const kartoffel = {
    mount(el, c) {
      el.innerHTML = '<div class="mp-hk"></div>';
      const box = $(el, '.mp-hk');

      function circle(G, R) {
        const ids = R.participants;
        const n = ids.length;
        return `<div class="mp-hk-circle">${ids.map((id, i) => {
          const a = (i / n) * Math.PI * 2 - Math.PI / 2;
          const alive = G.alive.includes(id);
          const has = G.holder === id && G.state === 'live';
          return `<div class="mp-hk-seat ${alive ? '' : 'out'} ${has ? 'has' : ''} ${G.boom?.id === id && G.state === 'boom' ? 'boom' : ''}" style="left:${50 + 40 * Math.cos(a)}%;top:${50 + 40 * Math.sin(a)}%">
            ${who(id)}<span class="small">${pname(id)}</span>${has ? '<span class="mp-hk-bomb">💣</span>' : ''}${G.boom?.id === id && G.state === 'boom' ? '<span class="mp-hk-bomb">💥</span>' : ''}
          </div>`;
        }).join('')}<div class="mp-hk-mid">${G.state === 'boom' ? `💥<div class="small"><b>${pname(G.boom.id)}</b> ist raus!</div>` : G.state === 'live' ? `<div class="small">Bombe ${G.bomb}</div><div>🔥</div>` : '…'}</div></div>`;
      }

      function controller(G) {
        const me = c.mine();
        if (!G.alive.includes(me)) return `<div class="notice center">💥 Du bist raus. Schau zu, wer übrig bleibt!</div>`;
        if (G.state === 'live' && G.holder === me) {
          return `<div class="mp-hk-mine">
            <div class="mp-hk-big">💣</div>
            <div class="mp-hk-hot">Du hast die Bombe! Schnell weiter an …</div>
            <div class="mp-hk-targets">${G.targets.map((id) => `<button type="button" class="mp-hk-target" data-to="${esc(id)}">${who(id)}<span>${pname(id)}</span></button>`).join('')}</div>
          </div>`;
        }
        if (G.state === 'live') return `<div class="mp-hk-wait">${who(G.holder)} <b>${pname(G.holder)}</b> hat die Bombe …<div class="small muted">Gleich bist vielleicht du dran!</div></div>`;
        if (G.state === 'boom') return `<div class="mp-hk-wait">💥 <b>${pname(G.boom.id)}</b> hat’s erwischt!<div class="small muted">Gleich kommt eine neue Bombe.</div></div>`;
        return '<div class="mp-hk-wait">Gleich kommt die Bombe …</div>';
      }

      function update() {
        const G = c.game();
        const R = c.round();
        // Wer die Bombe hat, sieht nur noch die Knöpfe zum Weitergeben
        const holding = c.play && G.state === 'live' && G.holder === c.mine();
        box.innerHTML = `${(c.big || !R.tv) && !(holding && !c.big) ? circle(G, R) : ''}${c.play ? controller(G) : ''}`;
        box.querySelectorAll('.mp-hk-target').forEach((b) => onPress(b, () => c.move({ type: 'pass', to: b.dataset.to })));
      }

      update();
      return { update, frame() {} };
    },
  };

  // ---------- Stoppuhr ----------

  const stoppuhr = {
    mount(el, c) {
      const G0 = c.game();
      let mine = G0.mine;
      el.innerHTML = `<div class="mp-su">
        <div class="mp-su-clock">0,00</div>
        <div class="mp-su-goal small muted">Ziel: genau <b>10,00</b> Sekunden</div>
        ${c.play ? '<button class="mp-su-stop" type="button">Stopp! ✋</button>' : ''}
        ${c.big ? '<div class="mp-su-who"></div>' : ''}
      </div>`;
      const clock = $(el, '.mp-su-clock');
      const btn = $(el, '.mp-su-stop');

      function stop() {
        if (!c.play || mine !== null && mine !== undefined) return;
        const t = c.now();
        const R = c.round();
        if (t < R.startAt) return;
        mine = Math.round(t - R.startAt);
        c.move({ type: 'stop', ms: mine });
      }

      if (btn) onPress(btn, stop);

      function frame(t) {
        const G = c.game();
        const R = c.round();
        const e = t - R.startAt;
        const stopped = mine !== null && mine !== undefined;
        if (e < 0) clock.textContent = '0,00';
        else if (stopped && c.play && !c.big) clock.textContent = '✋';
        else if (e < G.visible) clock.textContent = fmtSec(e);
        else clock.textContent = '?,??';
        clock.classList.toggle('hidden-time', e >= G.visible);
        if (btn) {
          btn.disabled = stopped || e < 0;
          btn.textContent = stopped ? 'Gestoppt! Gleich kommt die Auflösung.' : 'Stopp! ✋';
        }
      }

      function who2() {
        if (!c.big) return;
        const G = c.game();
        $(el, '.mp-su-who').innerHTML = c.round().participants.map((id) => `<span class="mp-chip ${G.stopped.includes(id) ? 'done' : ''}">${who(id)} ${G.stopped.includes(id) ? '✋' : '⏳'}</span>`).join('');
      }

      who2();
      return {
        update() {
          const G = c.game();
          if (G.mine !== null && G.mine !== undefined) mine = G.mine;
          who2();
        },
        frame,
        tap: stop,
      };
    },
  };

  // ---------- Glückstür ----------

  const glueckstuer = {
    mount(el, c) {
      el.innerHTML = '<div class="mp-gt"><div class="mp-gt-head"></div><div class="mp-gt-doors"></div><div class="mp-gt-foot small muted center"></div></div>';
      const head = $(el, '.mp-gt-head');
      const doorsEl = $(el, '.mp-gt-doors');
      const foot = $(el, '.mp-gt-foot');
      let pending = null;

      function update() {
        const G = c.game();
        const me = c.mine();
        const alive = G.alive.includes(me);
        const canPick = c.play && alive && G.state === 'choose';
        const mine = pending ?? G.mine;
        head.innerHTML = `<b>Runde ${G.round}</b> · ${G.trapCount === 1 ? 'Hinter einer Tür' : `Hinter ${G.trapCount} Türen`} lauert ein Gespenst 👻 · noch ${G.alive.length} im Spiel`;
        const last = G.last;
        doorsEl.innerHTML = Array.from({ length: G.state === 'reveal' ? last.doors : G.doors }, (_, d) => {
          const isTrap = G.state === 'reveal' && last.traps.includes(d);
          const pickers = G.state === 'reveal' ? Object.entries(last.choices).filter(([, x]) => x === d).map(([id]) => id) : [];
          const tag = canPick ? 'button' : 'div';
          return `<${tag} class="mp-door ${mine === d ? 'mine' : ''} ${G.state === 'reveal' ? (isTrap ? 'trap' : 'safe') : ''}" ${canPick ? `data-door="${d}" type="button"` : ''}>
            <span class="mp-door-face">${G.state === 'reveal' ? (isTrap ? '👻' : '🎉') : '🚪'}</span>
            <span class="mp-door-no">${d + 1}</span>
            <span class="mp-door-who">${pickers.map((id) => who(id)).join('')}</span>
          </${tag}>`;
        }).join('');
        doorsEl.querySelectorAll('button.mp-door').forEach((b) => onPress(b, () => {
          pending = Number(b.dataset.door);
          c.move({ type: 'choose', door: pending }, () => { pending = null; });
          update();
        }));
        if (G.state === 'reveal') {
          foot.innerHTML = last.saved ? '😮 Alle haben das Gespenst erwischt, also passiert nichts. Noch mal!'
            : last.out.length ? `👻 Erwischt: ${last.out.map((id) => `<b>${pname(id)}</b>`).join(', ')}` : '🎉 Niemand erwischt!';
        } else if (c.play && !alive) foot.textContent = 'Du bist raus. Drück den anderen die Daumen!';
      }

      update();
      return {
        update,
        frame(t) {
          const G = c.game();
          if (G.state !== 'choose' || t < c.round().startAt) return;
          const left = timeLeft(t, G.deadline);
          const base = c.play && G.alive.includes(c.mine()) ? (G.mine !== null || pending !== null ? 'Tür gewählt. Du kannst noch wechseln.' : 'Wähle eine Tür!') : 'Alle wählen …';
          foot.textContent = `${base} Noch ${left} s · ${G.chosen.length}/${G.alive.length} haben gewählt`;
        },
      };
    },
  };

  // ---------- Phantombild ----------

  const PARTS = ['eyeL', 'eyeR', 'nose', 'mouth'];
  const TRAY = { eyeL: { x: 14, y: 138 }, eyeR: { x: 38, y: 138 }, nose: { x: 62, y: 138 }, mouth: { x: 86, y: 138 } };

  function partSvg(k, p) {
    if (!p) return '';
    const g = (inner) => `<g class="mp-part" data-part="${k}" transform="translate(${p.x} ${p.y})"><circle r="11" fill="transparent"/>${inner}</g>`;
    if (k === 'eyeL' || k === 'eyeR') return g('<ellipse rx="7" ry="5" fill="#fff" stroke="#222" stroke-width="1"/><circle r="2.8" fill="#222"/>');
    if (k === 'nose') return g('<path d="M0 -7 L-4.5 4 Q0 6.5 4.5 4 Z" fill="rgba(0,0,0,0.18)" stroke="#5a3a2a" stroke-width="1.2" stroke-linejoin="round"/>');
    return g('<path d="M-11 -2 Q0 9 11 -2" fill="#b33" stroke="#5a1a1a" stroke-width="1.4"/>');
  }

  function faceSvg(parts, look, { tray = false, cls = '' } = {}) {
    return `<svg class="mp-face ${cls}" viewBox="0 0 100 ${tray ? 150 : 124}" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="50" cy="66" rx="40" ry="52" fill="${look.skin}" stroke="rgba(0,0,0,0.35)" stroke-width="1.2"/>
      <path d="M12 52 Q14 6 50 8 Q86 6 88 52 Q78 24 50 22 Q22 24 12 52 Z" fill="${look.hair}"/>
      ${tray ? '<rect x="1" y="126" width="98" height="23" rx="6" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.25)" stroke-dasharray="2 2"/>' : ''}
      ${PARTS.map((k) => partSvg(k, parts?.[k])).join('')}
    </svg>`;
  }

  const phantombild = {
    mount(el, c) {
      const G0 = c.game();
      const parts = JSON.parse(JSON.stringify(G0.mine || TRAY));
      let done = G0.done.includes(c.mine());
      let drag = null;
      el.innerHTML = `<div class="mp-pb">
        <div class="mp-pb-target"><div class="small muted">Vorlage</div>${faceSvg(G0.target, G0.look, { cls: 'target' })}</div>
        ${c.play ? `<div class="mp-pb-edit"><div class="small muted">Dein Gesicht: Teile hinziehen</div><div class="mp-pb-mine"></div>
          <button class="btn primary mp-pb-done" type="button">Fertig ✅</button></div>` : ''}
        ${c.big ? '<div class="mp-pb-who"></div>' : ''}
        <div class="mp-pb-time small muted center"></div>
      </div>`;
      const mineBox = $(el, '.mp-pb-mine');
      const doneBtn = $(el, '.mp-pb-done');
      const timeEl = $(el, '.mp-pb-time');

      function paint() {
        if (!mineBox) return;
        mineBox.innerHTML = faceSvg(parts, G0.look, { tray: true, cls: done ? 'locked' : 'edit' });
        doneBtn.disabled = done;
        doneBtn.textContent = done ? 'Abgegeben ✅' : 'Fertig ✅';
      }

      function toSvg(svg, e) {
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const p = pt.matrixTransform(svg.getScreenCTM().inverse());
        return { x: Math.max(4, Math.min(96, p.x)), y: Math.max(4, Math.min(146, p.y)) };
      }

      if (mineBox) {
        mineBox.addEventListener('pointerdown', (e) => {
          if (done || c.now() < c.round().startAt) return;
          const g = e.target.closest('.mp-part');
          if (!g) return;
          e.preventDefault();
          const svg = mineBox.querySelector('svg');
          const p = toSvg(svg, e);
          const k = g.dataset.part;
          drag = { k, dx: parts[k].x - p.x, dy: parts[k].y - p.y, id: e.pointerId, g };
          svg.setPointerCapture?.(e.pointerId);
          svg.appendChild(g);
        });
        mineBox.addEventListener('pointermove', (e) => {
          if (!drag || e.pointerId !== drag.id) return;
          const svg = mineBox.querySelector('svg');
          const p = toSvg(svg, e);
          parts[drag.k] = { x: Math.round((p.x + drag.dx) * 10) / 10, y: Math.round((p.y + drag.dy) * 10) / 10 };
          drag.g.setAttribute('transform', `translate(${parts[drag.k].x} ${parts[drag.k].y})`);
        });
        const end = (e) => {
          if (!drag || e.pointerId !== drag.id) return;
          drag = null;
          c.draw({ op: 'face', parts });
        };
        mineBox.addEventListener('pointerup', end);
        mineBox.addEventListener('pointercancel', end);
        doneBtn.addEventListener('click', () => {
          if (done) return;
          c.move({ type: 'done', parts }, (res) => {
            if (res.ok) {
              done = true;
              paint();
            }
          });
        });
        paint();
      }

      function who2() {
        if (!c.big) return;
        const G = c.game();
        $(el, '.mp-pb-who').innerHTML = c.round().participants.map((id) => `<span class="mp-chip ${G.done.includes(id) ? 'done' : ''}">${who(id)} ${G.done.includes(id) ? '✅' : '✏️'}</span>`).join('');
      }

      who2();
      return {
        update() {
          const G = c.game();
          if (!done && G.done.includes(c.mine())) {
            done = true;
            paint();
          }
          who2();
        },
        frame(t) {
          const G = c.game();
          timeEl.textContent = t < c.round().startAt ? '' : t < G.endAt ? `Noch ${timeLeft(t, G.endAt)} s` : 'Zeit um!';
        },
      };
    },
    // Galerie aller Gesichter im Ergebnis
    result(last) {
      const x = last.extra;
      if (!x) return '';
      const order = last.groups.flatMap((g) => g.ids.map((id) => ({ id, label: g.label })));
      return `<div class="mp-pb-gallery">
        <div class="mp-pb-card target">${faceSvg(x.target, x.look)}<b>Vorlage</b></div>
        ${order.filter((o) => x.faces[o.id]).map((o) => `<div class="mp-pb-card">${faceSvg(x.faces[o.id], x.look)}<span>${who(o.id)} ${pname(o.id)}</span><b>${esc(o.label)}</b></div>`).join('')}
      </div>`;
    },
  };

  // ---------- Bewegungssensor ----------

  // iPhones fragen beim ersten Mal um Erlaubnis, und zwar nur nach einem Tippen
  const motion = {
    state: 'unknown', // unknown | granted | denied
    handlers: new Set(),
    available() {
      return typeof window.DeviceMotionEvent !== 'undefined';
    },
    needsButton() {
      return this.available() && typeof DeviceMotionEvent.requestPermission === 'function' && this.state !== 'granted';
    },
    async request() {
      if (!this.available()) return;
      if (typeof DeviceMotionEvent.requestPermission !== 'function') {
        this.state = 'granted';
        return;
      }
      try {
        this.state = (await DeviceMotionEvent.requestPermission()) === 'granted' ? 'granted' : 'denied';
      } catch {
        this.state = 'denied';
      }
    },
    listen(fn) {
      this.handlers.add(fn);
    },
    unlisten(fn) {
      this.handlers.delete(fn);
    },
  };
  window.addEventListener('devicemotion', (e) => {
    for (const fn of motion.handlers) fn(e);
  });

  // Helfer auch für die Team-Minispiele (minispielparty-teams.js)
  const util = { $, onPress, who, pname, timeLeft, fmtSec, COLORS };

  return { schnellzieher, seilhuepfer, farbfolge, zaehlfieber, ballonpumpe, kartoffel, stoppuhr, glueckstuer, phantombild, motion, util };
})();
