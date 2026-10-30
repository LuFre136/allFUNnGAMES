// Minispiel Party: Darstellung der zweiten Runde Minispiele. Jeder gegen jeden: Einzelgänger, Kopfrechner, Balancierer.
// Einer gegen alle: Minenfeld, Hütchenspiel. Team gegen Team: Team-Memory. Gleiche Schnittstelle wie minispielparty-games.js.

(() => {
  const { $, onPress, who, pname, timeLeft, fmtSec } = MinispielGames.util;

  function teamInfo(c, i) {
    return c.round().setup?.teams?.[i] || { name: `Team ${i + 1}`, icon: '', color: 'var(--accent)', ids: [] };
  }

  function myTeam(c) {
    return (c.round().setup?.teams || []).findIndex((t) => t.ids.includes(c.mine()));
  }

  function teamTag(c, i) {
    const t = teamInfo(c, i);
    return `<span class="mp-team-tag" style="--tc:${t.color}">${t.icon} ${esc(t.name)}</span>`;
  }

  // ---------- Einzelgänger ----------

  const einzelgaenger = {
    mount(el, c) {
      el.innerHTML = '<div class="mp-eg"><div class="mp-eg-head"></div><div class="mp-eg-grid"></div><div class="mp-eg-foot small muted center"></div></div>';
      const head = $(el, '.mp-eg-head');
      const grid = $(el, '.mp-eg-grid');
      const foot = $(el, '.mp-eg-foot');
      let shown = -1;
      let flash = null; // { cell, until }
      let penalty = 0;

      function round() {
        const G = c.game();
        return G.list[G.list.length - 1];
      }

      function build() {
        const rd = round();
        shown = rd.index;
        grid.innerHTML = rd.cells.map((e, i) => (c.play ? `<button type="button" class="mp-eg-cell" data-i="${i}">${e}</button>` : `<div class="mp-eg-cell">${e}</div>`)).join('');
        grid.querySelectorAll('button.mp-eg-cell').forEach((b) => onPress(b, () => {
          const r = round();
          const t = c.now();
          if (r.closed || r.mine !== null || t < r.startAt) return;
          const cell = Number(b.dataset.i);
          c.move({ type: 'tap', round: r.index, cell }, (res) => {
            if (res.right === false) {
              flash = { cell, until: performance.now() + 500 };
              penalty = performance.now() + 1200;
            }
          });
        }));
      }

      function update() {
        if (round().index !== shown) build();
      }

      function frame(t) {
        const G = c.game();
        const rd = round();
        if (rd.index !== shown) build();
        const before = t < rd.startAt;
        const cells = grid.children;
        for (let i = 0; i < cells.length; i++) {
          const node = cells[i];
          node.classList.toggle('hide', before);
          node.classList.toggle('single', rd.closed && rd.single === i);
          node.classList.toggle('wrong', Boolean(flash && flash.cell === i && performance.now() < flash.until));
          if (node.tagName === 'BUTTON') node.disabled = before || rd.closed || rd.mine !== null;
        }
        grid.classList.toggle('done', rd.mine !== null || rd.closed);
        head.innerHTML = `<b>Runde ${rd.index + 1}/${G.rounds}</b> · Welche Figur gibt es nur einmal?`;
        if (before) foot.textContent = rd.index ? 'Gleich kommt die nächste Runde …' : '';
        else if (rd.closed) foot.textContent = '👆 Das war der Einzelgänger.';
        else if (rd.mine !== null) foot.innerHTML = `✅ Gefunden nach <b>${fmtSec(rd.mine, 1)} s</b> · ${rd.found.length}/${c.round().participants.length} haben ihn`;
        else foot.innerHTML = `${performance.now() < penalty ? '❌ Falsch! +3 Sekunden · ' : ''}Noch ${timeLeft(t, rd.endAt)} s · ${rd.found.length}/${c.round().participants.length} haben ihn gefunden`;
      }

      build();
      return { update, frame };
    },
  };

  // ---------- Kopfrechner ----------

  const kopfrechner = {
    mount(el, c) {
      const ids = c.round().participants;
      const showAll = c.big || !c.round().tv;
      el.innerHTML = `<div class="mp-kr">
        ${c.play ? '<div class="mp-kr-task"></div><div class="mp-kr-opts"></div><div class="mp-kr-me small center"></div>' : ''}
        ${showAll ? `<div class="mp-kr-board">${ids.map((id) => `<div class="mp-kr-row" data-id="${esc(id)}">${who(id)}<span class="name">${pname(id)}</span><div class="mp-kr-bar"><span></span></div><b class="n"></b></div>`).join('')}</div>` : ''}
        <div class="mp-kr-time small muted center"></div>
      </div>`;
      const taskEl = $(el, '.mp-kr-task');
      const opts = $(el, '.mp-kr-opts');
      const meEl = $(el, '.mp-kr-me');
      const timeEl = $(el, '.mp-kr-time');
      const rows = new Map([...el.querySelectorAll('.mp-kr-row')].map((d) => [d.dataset.id, d]));
      let shownI = -1;
      let busy = false;
      let flash = null; // 'right' | 'wrong'
      let flashUntil = 0;

      function render() {
        const G = c.game();
        if (c.play && G.task && G.task.i !== shownI) {
          shownI = G.task.i;
          busy = false;
          taskEl.textContent = `${G.task.text} = ?`;
          opts.innerHTML = G.task.options.map((v) => `<button type="button" class="mp-kr-opt" data-v="${v}">${v}</button>`).join('');
          opts.querySelectorAll('.mp-kr-opt').forEach((b) => onPress(b, () => {
            const t = c.now();
            const me = c.game().me;
            if (busy || t < c.round().startAt || me.done || t < me.lockUntil) return;
            busy = true;
            c.move({ type: 'answer', i: shownI, value: Number(b.dataset.v) }, (res) => {
              flash = res.right ? 'right' : 'wrong';
              flashUntil = performance.now() + 500;
              if (res.locked) busy = false;
            });
          }));
        }
        for (const [id, node] of rows) {
          const n = G.progress[id] || 0;
          node.querySelector('.mp-kr-bar span').style.width = `${(n / G.goal) * 100}%`;
          node.querySelector('.n').textContent = `${n}/${G.goal}`;
          node.classList.toggle('done', n >= G.goal);
        }
      }

      function frame(t) {
        const G = c.game();
        timeEl.textContent = t < c.round().startAt ? '' : t < G.endAt ? `Noch ${timeLeft(t, G.endAt)} s` : 'Zeit um!';
        if (!c.play || !G.me) return;
        const locked = t < G.me.lockUntil;
        const before = t < c.round().startAt;
        el.querySelector('.mp-kr').classList.toggle('locked', locked);
        if (taskEl) taskEl.classList.toggle('hide', before);
        opts.querySelectorAll('.mp-kr-opt').forEach((b) => { b.disabled = before || locked || G.me.done; });
        const f = performance.now() < flashUntil ? flash : null;
        meEl.innerHTML = G.me.done ? `🏁 Fertig! <b>${G.me.right}</b> richtig` : locked ? '❌ Falsch! Kurz gesperrt …' : f === 'right' ? '✅ Richtig!' : `<b>${G.me.right}</b> von ${G.goal} richtig${G.me.wrong ? ` · ${G.me.wrong} falsch` : ''}`;
        meEl.className = `mp-kr-me small center ${locked ? 'bad' : f === 'right' ? 'good' : ''}`;
      }

      render();
      return { update: render, frame };
    },
  };

  // ---------- Balancierer ----------

  const BL_CENTER = 0.34; // Radius des goldenen Kreises (Teller = 1)

  const balancierer = {
    mount(el, c) {
      const ids = c.round().participants;
      const showAll = c.big || !c.round().tv;
      el.innerHTML = `<div class="mp-bl">
        ${c.play ? `<div class="mp-bl-plate"><div class="mp-bl-ring"></div><div class="mp-bl-ball"></div><div class="mp-bl-finger hidden"></div><div class="mp-bl-wind"></div></div>
          <div class="mp-bl-me center"></div>` : ''}
        ${showAll && (!c.play || c.big) ? `<div class="mp-kr-board">${ids.map((id) => `<div class="mp-kr-row" data-id="${esc(id)}">${who(id)}<span class="name">${pname(id)}</span><div class="mp-kr-bar"><span></span></div><b class="n"></b></div>`).join('')}</div>` : ''}
        <div class="mp-bl-time small muted center"></div>
      </div>`;
      const plate = $(el, '.mp-bl-plate');
      const ball = $(el, '.mp-bl-ball');
      const fingerEl = $(el, '.mp-bl-finger');
      const windEl = $(el, '.mp-bl-wind');
      const meEl = $(el, '.mp-bl-me');
      const timeEl = $(el, '.mp-bl-time');
      const rows = new Map([...el.querySelectorAll('.mp-kr-row')].map((d) => [d.dataset.id, d]));
      const p = { x: 0, y: 0, vx: 0, vy: 0 };
      let finger = null;
      let lastT = null;
      let inside = 0;
      let lastSent = 0;
      let finalSent = false;

      function toPlate(e) {
        const r = plate.getBoundingClientRect();
        return { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: ((e.clientY - r.top) / r.height) * 2 - 1 };
      }

      if (plate) {
        plate.addEventListener('pointerdown', (e) => {
          if (S?.round?.phase !== 'play') return;
          e.preventDefault();
          try {
            plate.setPointerCapture(e.pointerId);
          } catch {
            // ohne Zeiger-Fang geht es auch
          }
          finger = toPlate(e);
        });
        plate.addEventListener('pointermove', (e) => {
          if (finger) finger = toPlate(e);
        });
        for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) plate.addEventListener(ev, () => { finger = null; });
      }

      function send(final) {
        if (finalSent) return;
        if (final) finalSent = true;
        c.move({ type: 'score', ms: Math.round(inside), final });
      }

      function frame(t) {
        const G = c.game();
        const R = c.round();
        timeEl.textContent = t < R.startAt ? '' : t < G.endAt ? `Noch ${timeLeft(t, G.endAt)} s` : 'Zeit um!';
        for (const [id, node] of rows) {
          const ms = G.scores[id] || 0;
          node.querySelector('.mp-kr-bar span').style.width = `${(ms / (G.endAt - R.startAt)) * 100}%`;
          node.querySelector('.n').textContent = `${fmtSec(ms, 1)} s`;
        }
        if (!plate) return;
        const running = t >= R.startAt && t < G.endAt;
        if (running && lastT !== null) {
          const dt = Math.min(0.05, (t - lastT) / 1000);
          const w = G.wind[Math.min(G.wind.length - 1, Math.floor((t - R.startAt) / G.gust))];
          let ax = w.x * 1.1 - p.vx * 1.6;
          let ay = w.y * 1.1 - p.vy * 1.6;
          if (finger) {
            ax += (finger.x - p.x) * 5;
            ay += (finger.y - p.y) * 5;
          }
          p.vx += ax * dt;
          p.vy += ay * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          // Am Tellerrand bleibt die Kugel hängen
          const d = Math.hypot(p.x, p.y);
          if (d > 0.92) {
            p.x *= 0.92 / d;
            p.y *= 0.92 / d;
            p.vx *= 0.3;
            p.vy *= 0.3;
          }
          if (Math.hypot(p.x, p.y) < BL_CENTER) inside += t - lastT;
          windEl.style.transform = `translate(-50%, -50%) rotate(${Math.atan2(w.y, w.x)}rad)`;
          if (t - lastSent > 2500) {
            lastSent = t;
            send(false);
          }
        }
        if (t >= G.endAt && !finalSent && lastT !== null) send(true);
        lastT = t;
        ball.style.left = `${(p.x + 1) * 50}%`;
        ball.style.top = `${(p.y + 1) * 50}%`;
        ball.classList.toggle('in', Math.hypot(p.x, p.y) < BL_CENTER);
        fingerEl.classList.toggle('hidden', !finger);
        if (finger) {
          fingerEl.style.left = `${(finger.x + 1) * 50}%`;
          fingerEl.style.top = `${(finger.y + 1) * 50}%`;
        }
        meEl.innerHTML = `⭐ <b>${fmtSec(inside, 1)} s</b> in der Mitte${running ? '' : t >= G.endAt ? ' · fertig!' : ''}`;
      }

      return {
        update() {},
        frame,
        unmount() {
          if (!finalSent && lastT !== null) send(true);
        },
      };
    },
  };

  // ---------- Minenfeld ----------

  const minenfeld = {
    mount(el, c) {
      el.innerHTML = '<div class="mp-mf"><div class="mp-mf-head"></div><div class="mp-mf-end small muted center">🏁 Ziel</div><div class="mp-mf-grid"></div><div class="mp-mf-end small muted center">👣 Start</div><div class="mp-mf-ctl"></div><div class="mp-mf-foot small muted center"></div></div>';
      const head = $(el, '.mp-mf-head');
      const grid = $(el, '.mp-mf-grid');
      const ctl = $(el, '.mp-mf-ctl');
      const foot = $(el, '.mp-mf-foot');

      function update() {
        const G = c.game();
        const me = c.mine();
        const isLayer = me === G.layer;
        const isRunner = c.play && G.runners.includes(me);
        const path = G.paths[me] || [];
        const out = G.boom[me] !== undefined;
        const safe = G.safe.includes(me);
        const mines = new Set(G.mines);
        const boomCells = new Set(Object.values(G.boom));
        // Wo die Läufer gerade stehen
        const at = new Map();
        for (const [id, p] of Object.entries(G.paths)) {
          if (!p.length) continue;
          const k = (p.length - 1) * G.cols + p[p.length - 1];
          if (!at.has(k)) at.set(k, []);
          at.get(k).push(id);
        }
        const canMine = isLayer && G.phase === 'hide' && c.play;
        const nextRow = path.length;
        const canStep = isRunner && G.phase === 'run' && !out && !safe;
        let html = '';
        for (let r = G.rows - 1; r >= 0; r--) {
          for (let col = 0; col < G.cols; col++) {
            const k = r * G.cols + col;
            const mine = path[r] === col;
            const allowed = canStep && r === nextRow && (!path.length || Math.abs(col - path[path.length - 1]) <= 1);
            const tappable = canMine || allowed;
            const cls = [mines.has(k) ? (boomCells.has(k) ? 'boom' : 'mine') : '', mine ? 'trail' : '', allowed ? 'allowed' : ''].join(' ');
            const face = boomCells.has(k) ? '💥' : mines.has(k) ? '💣' : '';
            const people = (at.get(k) || []).map((id) => who(id)).join('');
            html += `<${tappable ? 'button type="button"' : 'div'} class="mp-mf-cell ${cls}" data-r="${r}" data-c="${col}"><span>${face}</span>${people}</${tappable ? 'button' : 'div'}>`;
          }
        }
        grid.style.gridTemplateColumns = `repeat(${G.cols}, 1fr)`;
        grid.innerHTML = html;
        grid.querySelectorAll('button.mp-mf-cell').forEach((b) => onPress(b, () => {
          c.move({ type: canMine ? 'mine' : 'step', row: Number(b.dataset.r), col: Number(b.dataset.c) });
        }));
        ctl.innerHTML = canMine ? `<button class="btn primary" type="button" ${G.mines.length < G.mineCount ? 'disabled' : ''}>Fertig, los geht’s! (${G.mines.length}/${G.mineCount} Minen)</button>` : '';
        ctl.querySelector('button')?.addEventListener('click', () => c.move({ type: 'done' }));
        let role = '';
        if (c.play && isLayer) role = G.phase === 'hide' ? `💣 Versteck ${G.mineCount} Minen! Tippe Felder an.` : '👀 Schau zu, wer auf deine Minen tritt.';
        else if (isRunner) role = G.phase === 'hide' ? `⏳ ${pname(G.layer)} versteckt gerade Minen …` : out ? '💥 Erwischt! Du bist raus.' : safe ? '🏁 Geschafft, du bist sicher!' : '👣 Tippe ein Feld in der nächsten Reihe an (gerade oder schräg).';
        head.innerHTML = `<div>🚩 ${who(G.layer)} ${pname(G.layer)} legt die Minen · 🏁 ${G.safe.length}/${G.runners.length} sicher (nötig: ${G.need})</div>${role ? `<div class="mp-mf-role">${role}</div>` : ''}`;
      }

      update();
      return {
        update,
        frame(t) {
          const G = c.game();
          if (t < c.round().startAt) return;
          foot.textContent = G.phase === 'hide' ? `Minen verstecken: noch ${timeLeft(t, G.hideEnd)} s` : `Noch ${timeLeft(t, G.runEnd)} s · ${Object.keys(G.boom).length} erwischt`;
        },
      };
    },
  };

  // ---------- Hütchenspiel ----------

  const HS_X = [18, 50, 82];

  const huetchenspiel = {
    mount(el, c) {
      el.innerHTML = `<div class="mp-hs"><div class="mp-hs-head"></div>
        <div class="mp-hs-table">${[0, 1, 2].map((i) => `<div class="mp-hs-cup" data-cup="${i}"><span class="mp-hs-hat">🎩</span></div>`).join('')}<div class="mp-hs-ball">🔴</div>
          ${[0, 1, 2].map((s) => `<button type="button" class="mp-hs-slot" data-s="${s}" style="left:${HS_X[s]}%"></button>`).join('')}</div>
        <div class="mp-hs-who"></div><div class="mp-hs-ctl"></div><div class="mp-hs-foot small muted center"></div></div>`;
      const head = $(el, '.mp-hs-head');
      const cups = [...el.querySelectorAll('.mp-hs-cup')];
      const ballEl = $(el, '.mp-hs-ball');
      const slots = [...el.querySelectorAll('.mp-hs-slot')];
      const whoEl = $(el, '.mp-hs-who');
      const ctl = $(el, '.mp-hs-ctl');
      const foot = $(el, '.mp-hs-foot');
      let pick = null; // erstes angetipptes Hütchen beim Tauschen
      let pending = null;
      let key = '';

      function role() {
        const G = c.game();
        if (!c.play) return 'watch';
        if (c.mine() === G.dealer) return 'dealer';
        return G.guessers.includes(c.mine()) ? 'guess' : 'watch';
      }

      slots.forEach((b) => onPress(b, () => {
        const G = c.game();
        const s = Number(b.dataset.s);
        const r = role();
        const t = c.now();
        if (r === 'dealer' && G.state === 'shuffle' && t >= G.showUntil && t < G.shuffleEnd) {
          if (pick === null) pick = s;
          else if (pick === s) pick = null;
          else {
            c.move({ type: 'swap', a: pick, b: s });
            pick = null;
          }
        } else if (r === 'guess' && G.state === 'guess' && t >= G.guessFrom) {
          pending = s;
          c.move({ type: 'guess', slot: s }, () => { pending = null; });
        }
      }));

      // Plätze der Hütchen zum Zeitpunkt t: [x in %, Höhe] pro Hütchen
      function layout(G, t) {
        const slotOf = [0, 1, 2];
        const pos = slotOf.map((s) => ({ x: HS_X[s], y: 0 }));
        for (const sw of G.swaps) {
          const cupA = slotOf.indexOf(sw.a);
          const cupB = slotOf.indexOf(sw.b);
          if (t >= sw.at + G.swapMs) {
            slotOf[cupA] = sw.b;
            slotOf[cupB] = sw.a;
            continue;
          }
          if (t >= sw.at) {
            const q = (t - sw.at) / G.swapMs;
            const e = q < 0.5 ? 2 * q * q : 1 - (-2 * q + 2) ** 2 / 2;
            for (let k = 0; k < 3; k++) pos[k] = { x: HS_X[slotOf[k]], y: 0 };
            pos[cupA] = { x: HS_X[sw.a] + (HS_X[sw.b] - HS_X[sw.a]) * e, y: -Math.sin(q * Math.PI) * 45 };
            pos[cupB] = { x: HS_X[sw.b] + (HS_X[sw.a] - HS_X[sw.b]) * e, y: Math.sin(q * Math.PI) * 45 };
            return { pos, slotOf };
          }
          break;
        }
        return { pos: slotOf.map((s) => ({ x: HS_X[s], y: 0 })), slotOf };
      }

      function update() {
        const G = c.game();
        const k = `${G.round}:${G.state}`;
        if (k !== key) {
          key = k;
          pick = null;
          pending = null;
        }
        const r = role();
        head.innerHTML = `<div><b>Runde ${G.round}/${G.rounds}</b> · 🥜 ${who(G.dealer)} ${pname(G.dealer)} mischt · ${G.right}/${G.total} richtig getippt</div>
          <div class="mp-hs-role">${r === 'dealer' ? (G.state === 'shuffle' ? '🔀 Tippe zwei Hütchen an, um sie zu tauschen. So oft du kannst!' : '😏 Mal sehen, ob sie es gemerkt haben …')
            : r === 'guess' ? (G.state === 'guess' ? '🤔 Wo ist die Kugel? Tippe auf das Hütchen!' : G.state === 'shuffle' ? '👀 Behalte die Kugel im Auge!' : '')
              : ''}</div>`;
        ctl.innerHTML = r === 'dealer' && G.state === 'shuffle' && G.swaps.length ? '<button class="btn small" type="button">Fertig gemischt</button>' : '';
        ctl.querySelector('button')?.addEventListener('click', () => c.move({ type: 'done' }));
        if (G.state === 'reveal') {
          const g = G.result.guesses;
          whoEl.innerHTML = [0, 1, 2].map((s) => `<div class="mp-hs-guess" style="left:${HS_X[s]}%">${Object.entries(g).filter(([, x]) => x === s).map(([id]) => who(id)).join('')}</div>`).join('');
        } else whoEl.innerHTML = '';
      }

      function frame(t) {
        const G = c.game();
        const { pos, slotOf } = layout(G, t);
        const ballCup = G.ball; // die Hütchen starten auf ihrem eigenen Platz
        const reveal = G.state === 'reveal';
        const lifted = t < G.showUntil || reveal;
        cups.forEach((cup, i) => {
          const up = lifted && (t < G.showUntil ? i === ballCup : slotOf[i] === G.result.slot);
          cup.style.left = `${pos[i].x}%`;
          cup.style.transform = `translate(-50%, ${pos[i].y - (up ? 60 : 0)}%)`;
        });
        const bx = pos[ballCup].x;
        ballEl.style.left = `${bx}%`;
        ballEl.style.opacity = lifted || role() === 'dealer' ? '1' : '0';
        ballEl.classList.toggle('peek', !lifted && role() === 'dealer');
        const mine = pending ?? G.mine;
        slots.forEach((s, i) => {
          s.classList.toggle('picked', pick === i);
          s.classList.toggle('mine', mine === i && G.state !== 'shuffle');
          s.classList.toggle('right', reveal && G.result.slot === i);
        });
        if (t < c.round().startAt) return;
        if (G.state === 'shuffle') foot.textContent = t < G.showUntil ? 'Hier liegt die Kugel!' : `Mischen: noch ${timeLeft(t, G.shuffleEnd)} s · ${G.swaps.length} Mal getauscht`;
        else if (G.state === 'guess') foot.textContent = t < G.guessFrom ? 'Gleich wird geraten …' : `Raten: noch ${timeLeft(t, G.guessEnd)} s · ${G.guessed.length}/${G.guessers.length} haben getippt`;
        else foot.innerHTML = `${G.result.ok.length ? `✅ Richtig: ${G.result.ok.map((id) => `<b>${pname(id)}</b>`).join(', ')}` : '😈 Niemand hat richtig getippt!'}`;
      }

      update();
      return { update, frame };
    },
  };

  // ---------- Team-Memory ----------

  const teammemory = {
    mount(el, c) {
      const mine = myTeam(c);
      const playing = c.play && mine >= 0;
      // Auf dem Handy nur das eigene Brett, der Fernseher zeigt beide
      const order = c.big || mine < 0 ? [0, 1] : [mine];
      el.innerHTML = `<div class="mp-tm"><div class="mp-tm-boards">${order.map((i) => `<div class="mp-tm-board ${playing && i === mine ? 'mine' : ''}" data-t="${i}" style="--tc:${teamInfo(c, i).color}">
          <div class="mp-tm-head">${teamTag(c, i)} <b class="mp-tm-found"></b></div>
          <div class="mp-tm-cards"></div><div class="mp-tm-turn small center"></div></div>`).join('')}</div>
        <div class="mp-tm-time small muted center"></div></div>`;
      const boards = [...el.querySelectorAll('.mp-tm-board')].map((d) => ({ i: Number(d.dataset.t), cards: $(d, '.mp-tm-cards'), found: $(d, '.mp-tm-found'), turn: $(d, '.mp-tm-turn') }));
      const timeEl = $(el, '.mp-tm-time');

      function update() {
        const G = c.game();
        for (const b of boards) {
          const T = G.teams[b.i];
          const can = playing && b.i === mine && T.whose === c.mine() && T.open.length < 2;
          const matched = new Set(T.matched);
          b.cards.innerHTML = Array.from({ length: G.size }, (_, k) => {
            const face = T.faces[k];
            const cls = matched.has(k) ? 'matched' : face ? 'open' : '';
            const tap = can && !face;
            return `<${tap ? 'button type="button"' : 'div'} class="mp-tm-card ${cls}" data-k="${k}">${face || '❔'}</${tap ? 'button' : 'div'}>`;
          }).join('');
          b.cards.querySelectorAll('button.mp-tm-card').forEach((btn) => onPress(btn, () => c.move({ type: 'flip', card: Number(btn.dataset.k) })));
          b.found.textContent = `${T.found}/${G.pairs} Paare`;
          b.turn.innerHTML = playing && b.i === mine && T.whose === c.mine() ? '👉 <b>Du bist dran!</b> Deck zwei Karten auf.' : `${who(T.whose)} ${pname(T.whose)} ist dran`;
        }
      }

      update();
      return {
        update,
        frame(t) {
          const G = c.game();
          timeEl.textContent = t < c.round().startAt ? '' : t < G.endAt ? `Noch ${timeLeft(t, G.endAt)} s` : 'Zeit um!';
        },
      };
    },
  };

  Object.assign(MinispielGames, { einzelgaenger, kopfrechner, balancierer, minenfeld, huetchenspiel, teammemory });
})();
