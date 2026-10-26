// Minispiel Party: Darstellung der Minispiele „Einer gegen alle“ (Torwart, Ochs am Berg, Gespensterhaus)
// und „Team gegen Team“ (Tauziehen, Staffel-Farbfolge, Turmbau). Gleiche Schnittstelle wie minispielparty-games.js.

(() => {
  const { $, onPress, who, pname, timeLeft, COLORS } = MinispielGames.util;

  function setup(c) {
    return c.round().setup || {};
  }

  // Nummer des eigenen Teams (0 oder 1) oder -1
  function myTeam(c) {
    return (setup(c).teams || []).findIndex((t) => t.ids.includes(c.mine()));
  }

  function teamInfo(c, i) {
    return setup(c).teams?.[i] || { name: `Team ${i + 1}`, icon: '', color: 'var(--accent)', ids: [] };
  }

  function teamTag(c, i) {
    const t = teamInfo(c, i);
    return `<span class="mp-team-tag" style="--tc:${t.color}">${t.icon} ${esc(t.name)}</span>`;
  }

  function names(ids) {
    return ids.map((id) => `<b>${pname(id)}</b>`).join(', ');
  }

  // ---------- Torwart ----------

  const CORNERS = ['↖ Links', '⬆ Mitte', '↗ Rechts'];

  const torwart = {
    mount(el, c) {
      el.innerHTML = '<div class="mp-tw"><div class="mp-tw-head"></div><div class="mp-tw-goal"></div><div class="mp-tw-foot small muted center"></div></div>';
      const head = $(el, '.mp-tw-head');
      const goal = $(el, '.mp-tw-goal');
      const foot = $(el, '.mp-tw-foot');
      let pending = null;
      let key = '';

      function update() {
        const G = c.game();
        const me = c.mine();
        const isKeeper = me === G.keeper;
        const canPick = c.play && G.state === 'choose' && (isKeeper || G.shooters.includes(me));
        const mine = pending ?? G.mine;
        head.innerHTML = `<div><b>Runde ${G.round}/${G.rounds}</b> · 🧤 ${who(G.keeper)} ${pname(G.keeper)} im Tor</div>
          <div class="mp-tw-score">🧤 ${G.saves} gehalten · ⚽ ${G.goals} ${G.goals === 1 ? 'Tor' : 'Tore'} · nötig für den Torwart: ${G.need}</div>
          ${c.play ? `<div class="mp-tw-role">${isKeeper ? '🧤 Du bist der Torwart: Wohin springst du?' : '⚽ Du schießt: In welche Ecke?'}</div>` : ''}`;
        const last = G.last;
        goal.innerHTML = CORNERS.map((label, i) => {
          let inner = '';
          if (G.state === 'reveal') {
            const shooters = Object.entries(last.shots).filter(([, x]) => x === i).map(([id]) => id);
            const dive = last.keeper === i;
            inner = `${dive ? `<div class="mp-tw-glove">🧤${who(G.keeper)}</div>` : ''}<div class="mp-tw-balls">${shooters.map((id) => `<span class="${last.saved.includes(id) ? 'saved' : 'goal'}">${who(id)}${last.saved.includes(id) ? '✋' : '⚽'}</span>`).join('')}</div>`;
          }
          const tag = canPick ? 'button' : 'div';
          return `<${tag} class="mp-tw-corner ${mine === i ? 'mine' : ''} ${G.state === 'reveal' && last.keeper === i ? 'dive' : ''}" ${canPick ? `type="button" data-c="${i}"` : ''}>
            <span class="mp-tw-label">${label}</span>${inner}</${tag}>`;
        }).join('');
        goal.querySelectorAll('button.mp-tw-corner').forEach((b) => onPress(b, () => {
          pending = Number(b.dataset.c);
          c.move({ type: 'pick', corner: pending }, () => { pending = null; });
          update();
        }));
        if (G.state === 'reveal') {
          const goals = Object.keys(last.shots).length - last.saved.length;
          foot.innerHTML = goals ? `⚽ ${goals} ${goals === 1 ? 'Tor' : 'Tore'}, 🧤 ${last.saved.length} gehalten` : '🧤 Alles gehalten!';
        }
        key = `${G.round}:${G.state}`;
      }

      update();
      return {
        update() {
          const G = c.game();
          if (`${G.round}:${G.state}` !== key) pending = null;
          update();
        },
        frame(t) {
          const G = c.game();
          if (G.state !== 'choose' || t < c.round().startAt) return;
          const total = G.shooters.length + 1;
          foot.textContent = `Noch ${timeLeft(t, G.deadline)} s · ${G.picked.length}/${total} haben gewählt`;
        },
      };
    },
  };

  // ---------- Ochs am Berg ----------

  const ochsamberg = {
    mount(el, c) {
      const G0 = c.game();
      const goal = G0.goal;
      const me = c.mine();
      const isLight = me === G0.lightId;
      const isRunner = c.play && G0.runners.includes(me);
      const st = { red: G0.red, changedAt: G0.changedAt, pos: { ...G0.pos }, finished: new Set(G0.finished), caught: { ...G0.caught } };
      let myPos = st.pos[me] || 0;
      let lastStep = 0;
      let holding = false;
      let flash = 0;
      const showTrack = c.big || !c.round().tv;
      el.innerHTML = `<div class="mp-oa">
        <div class="mp-oa-top"><div class="mp-oa-light"></div><div class="mp-oa-info"></div></div>
        ${showTrack ? `<div class="mp-oa-track">${G0.runners.map((id) => `<div class="mp-oa-lane" data-id="${esc(id)}"><span class="mp-oa-runner">${who(id)}</span><span class="mp-oa-flag">🏁</span></div>`).join('')}</div>` : ''}
        ${isRunner ? '<div class="mp-oa-mine"><div class="mp-oa-bar"><span></span></div><div class="mp-oa-msg"></div></div><button class="mp-oa-btn" type="button">Laufen! 👣</button>' : ''}
        ${isLight && c.play ? '<button class="mp-oa-hold" type="button"><span class="mp-oa-hold-text">Gedrückt halten = 🔴 Rot</span><span class="small"></span></button>' : ''}
        <div class="mp-oa-time small muted center"></div>
      </div>`;
      const lightEl = $(el, '.mp-oa-light');
      const infoEl = $(el, '.mp-oa-info');
      const timeEl = $(el, '.mp-oa-time');
      const lanes = new Map([...el.querySelectorAll('.mp-oa-lane')].map((d) => [d.dataset.id, d]));
      const bar = $(el, '.mp-oa-bar span');
      const msg = $(el, '.mp-oa-msg');
      const hold = $(el, '.mp-oa-hold');

      function step() {
        const t = c.now();
        const G = c.game();
        if (!isRunner || st.finished.has(me) || t < c.round().startAt || t > G.endAt) return;
        const p = performance.now();
        if (p - lastStep < 95) return;
        lastStep = p;
        myPos = Math.min(goal, myPos + 1);
        socket.emit('game:draw', { op: 'step' }, (res) => {
          if (res?.caught) {
            myPos = 0;
            flash = performance.now() + 1400;
          }
        });
      }

      function setHold(on) {
        if (!hold || holding === on) return;
        const t = c.now();
        if (on && (t < c.round().startAt || t > c.game().endAt)) return;
        holding = on;
        socket.emit('game:draw', { op: 'light', red: on }, () => {});
      }

      if (isRunner) onPress($(el, '.mp-oa-btn'), step);
      if (hold) {
        hold.addEventListener('pointerdown', (e) => {
          if (S?.round?.phase !== 'play') return;
          e.preventDefault();
          try {
            hold.setPointerCapture(e.pointerId);
          } catch {
            // ohne Zeiger-Fang klappt es auch, dann zählt nur das Loslassen auf dem Knopf
          }
          setHold(true);
        });
        for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) hold.addEventListener(ev, () => setHold(false));
      }

      function apply(data) {
        if (data.red !== undefined) {
          st.red = data.red;
          st.changedAt = data.changedAt;
          if (!data.red) holding = false;
        }
        if (data.pos) {
          for (const [id, k] of Object.entries(data.pos)) {
            if (id === me) {
              // Zurück an den Start: der Server hat erwischt
              if (k === 0 && myPos > 0 && (data.caught?.[me] || 0) > (st.caught[me] || 0)) {
                myPos = 0;
                flash = performance.now() + 1400;
              } else if (k > myPos) myPos = k;
            }
            st.pos[id] = k;
          }
        }
        if (data.finished) st.finished = new Set(data.finished);
        if (data.caught) st.caught = { ...data.caught };
      }

      function frame(t) {
        const G = c.game();
        timeEl.textContent = t < c.round().startAt ? '' : t < G.endAt ? `Noch ${timeLeft(t, G.endAt)} s` : 'Zeit um!';
        lightEl.className = `mp-oa-light ${st.red ? 'red' : 'green'}`;
        lightEl.textContent = st.red ? 'ROT' : 'GRÜN';
        infoEl.innerHTML = `🚦 ${who(G.lightId)} ${pname(G.lightId)} ist die Ampel · 🏁 ${st.finished.size}/${G.runners.length} im Ziel (nötig: ${G.need})`;
        for (const [id, node] of lanes) {
          const k = id === me ? myPos : st.pos[id] || 0;
          node.querySelector('.mp-oa-runner').style.left = `${(Math.min(k, goal) / goal) * 88}%`;
          node.classList.toggle('done', st.finished.has(id) || k >= goal);
        }
        if (bar) {
          bar.style.width = `${(myPos / goal) * 100}%`;
          const done = st.finished.has(me) || myPos >= goal;
          msg.textContent = performance.now() < flash ? '🚨 Erwischt! Zurück an den Start!' : done ? '🏁 Im Ziel!' : st.red ? '✋ Stehen bleiben!' : '👣 Lauf!';
          msg.className = `mp-oa-msg ${performance.now() < flash ? 'bad' : ''}`;
        }
        if (hold) {
          hold.classList.toggle('on', st.red);
          const left = st.red ? Math.max(0, 3000 - (t - st.changedAt)) : 0;
          hold.querySelector('.small').textContent = st.red ? `Rot! Noch ${(left / 1000).toFixed(1).replace('.', ',')} s` : 'Loslassen = 🟢 Grün';
        }
      }

      return {
        update() {
          apply(c.game());
        },
        live: apply,
        frame,
        tap: isRunner ? step : undefined,
      };
    },
  };

  // ---------- Gespensterhaus ----------

  const gespensterhaus = {
    mount(el, c) {
      el.innerHTML = '<div class="mp-gh"><div class="mp-gh-head"></div><div class="mp-gt-doors mp-gh-doors"></div><div class="mp-gh-foot small muted center"></div></div>';
      const head = $(el, '.mp-gh-head');
      const doorsEl = $(el, '.mp-gh-doors');
      const foot = $(el, '.mp-gh-foot');
      let pending = null;
      let key = '';

      function update() {
        const G = c.game();
        const me = c.mine();
        const isGhost = me === G.ghost;
        const alive = G.alive.includes(me);
        const canPick = c.play && G.state === 'choose' && (isGhost || alive);
        const mine = pending ?? G.mine;
        const picks = G.ghostPick || [];
        head.innerHTML = `<div><b>Runde ${G.round}/${G.rounds}</b> · 👻 ${who(G.ghost)} ${pname(G.ghost)} spukt · noch ${G.alive.length} versteckt</div>
          ${c.play ? `<div class="mp-gh-role">${isGhost ? `👻 Du bist das Gespenst: Wähle ${G.opens} Türen zum Öffnen (${picks.length}/${G.opens}).` : alive ? '🙈 Versteck dich hinter einer Tür!' : '😵 Du bist erwischt worden. Drück den anderen die Daumen!'}</div>` : ''}`;
        const last = G.last;
        doorsEl.innerHTML = Array.from({ length: G.doors }, (_, d) => {
          let face = '🚪';
          let cls = '';
          let whoHtml = '';
          if (G.state === 'reveal') {
            const opened = last.opened.includes(d);
            const behind = Object.entries(last.hides).filter(([, x]) => x === d).map(([id]) => id);
            face = opened ? '👻' : behind.length ? '🙈' : '🚪';
            cls = opened ? 'trap' : behind.length ? 'safe' : '';
            whoHtml = behind.map((id) => who(id)).join('');
          } else if (isGhost && picks.includes(d)) cls = 'mine ghost';
          else if (!isGhost && mine === d) cls = 'mine';
          const tag = canPick ? 'button' : 'div';
          return `<${tag} class="mp-door ${cls}" ${canPick ? `type="button" data-door="${d}"` : ''}>
            <span class="mp-door-face">${face}</span><span class="mp-door-no">${d + 1}</span><span class="mp-door-who">${whoHtml}</span></${tag}>`;
        }).join('');
        doorsEl.querySelectorAll('button.mp-door').forEach((b) => onPress(b, () => {
          const door = Number(b.dataset.door);
          if (isGhost) c.move({ type: 'open', door });
          else {
            pending = door;
            c.move({ type: 'hide', door }, () => { pending = null; });
            update();
          }
        }));
        if (G.state === 'reveal') foot.innerHTML = last.caught.length ? `👻 Erwischt: ${names(last.caught)}` : '🎉 Niemand erwischt!';
        key = `${G.round}:${G.state}`;
      }

      update();
      return {
        update() {
          const G = c.game();
          if (`${G.round}:${G.state}` !== key) pending = null;
          update();
        },
        frame(t) {
          const G = c.game();
          if (G.state !== 'choose' || t < c.round().startAt) return;
          foot.textContent = `Noch ${timeLeft(t, G.deadline)} s · ${G.hidden.length}/${G.alive.length} versteckt${G.ghostDone ? ' · das Gespenst ist bereit' : ''}`;
        },
      };
    },
  };

  // ---------- Tauziehen ----------

  const tauziehen = {
    mount(el, c) {
      const G0 = c.game();
      const mine = myTeam(c);
      const playing = c.play && mine >= 0;
      let n = G0.pulls?.[c.mine()] || 0;
      let rope = G0.rope;
      let last = 0;
      let sendTimer = null;
      let lastSent = 0;
      const t0 = teamInfo(c, 0);
      const t1 = teamInfo(c, 1);
      el.innerHTML = `<div class="mp-tz">
        <div class="mp-tz-sides">
          <div class="mp-tz-side" style="--tc:${t0.color}">${teamTag(c, 0)}<div class="mp-tz-who">${t0.ids.map((id) => who(id)).join('')}</div></div>
          <div class="mp-tz-side right" style="--tc:${t1.color}">${teamTag(c, 1)}<div class="mp-tz-who">${t1.ids.map((id) => who(id)).join('')}</div></div>
        </div>
        <div class="mp-tz-field" style="--c0:${t0.color};--c1:${t1.color}"><div class="mp-tz-line"></div><div class="mp-tz-rope"><span class="mp-tz-knot">🎀</span></div></div>
        ${playing ? `<button class="mp-tz-btn" type="button" style="--tc:${teamInfo(c, mine).color}">Ziehen! 💪</button><div class="mp-tz-count small muted center"></div>` : ''}
        <div class="mp-tz-time small muted center"></div>
      </div>`;
      const ropeEl = $(el, '.mp-tz-rope');
      const timeEl = $(el, '.mp-tz-time');
      const countEl = $(el, '.mp-tz-count');

      function flush() {
        clearTimeout(sendTimer);
        sendTimer = null;
        lastSent = performance.now();
        c.draw({ op: 'pull', n });
      }

      function pull() {
        const t = c.now();
        if (!playing || t < c.round().startAt || t > c.game().endAt) return;
        const p = performance.now();
        if (p - last < 75) return;
        last = p;
        n++;
        if (!sendTimer) sendTimer = setTimeout(flush, Math.max(0, 120 - (p - lastSent)));
      }

      if (playing) onPress($(el, '.mp-tz-btn'), pull);

      function frame(t) {
        const G = c.game();
        timeEl.textContent = t < c.round().startAt ? '' : t < G.endAt ? `Noch ${timeLeft(t, G.endAt)} s` : 'Zeit um!';
        // Seil wandert zum Team, das vorne liegt: Team 0 links
        const x = Math.max(-1, Math.min(1, rope / G.win));
        ropeEl.style.transform = `translateX(${-x * 40}%)`;
        if (countEl) countEl.textContent = `Deine Züge: ${n}`;
      }

      return {
        update() {
          rope = c.game().rope;
        },
        live(data) {
          if (data.rope !== undefined) rope = data.rope;
        },
        frame,
        tap: playing ? pull : undefined,
        unmount() {
          clearTimeout(sendTimer);
        },
      };
    },
  };

  // ---------- Staffel-Farbfolge ----------

  function staffelSpeed(level) {
    return { d: Math.max(280, 520 - 14 * level), gap: Math.max(120, 200 - 5 * level) };
  }

  const staffel = {
    mount(el, c) {
      const mine = myTeam(c);
      const playing = c.play && mine >= 0;
      const showTeams = c.big || !c.round().tv ? [0, 1] : [];
      el.innerHTML = `<div class="mp-st">
        ${playing ? `<div class="mp-st-me" style="--tc:${teamInfo(c, mine).color}">
          <div class="mp-st-status"></div>
          <div class="mp-ff-pads">${COLORS.map((col, i) => `<button type="button" class="mp-ff-pad" data-c="${i}" style="--c:${col}"></button>`).join('')}</div>
        </div>` : ''}
        <div class="mp-st-teams">${showTeams.filter((i) => !playing || i !== mine || c.big).map((i) => `<div class="mp-st-team" data-t="${i}" style="--tc:${teamInfo(c, i).color}">
          <div class="mp-st-team-head">${teamTag(c, i)}<span class="mp-st-team-state"></span></div>
          <div class="mp-st-mini">${COLORS.map((col, k) => `<span style="--c:${col}" data-c="${k}"></span>`).join('')}</div>
        </div>`).join('')}</div>
        <div class="mp-st-time small muted center"></div>
      </div>`;
      const pads = [...el.querySelectorAll('.mp-st-me .mp-ff-pad')];
      const status = $(el, '.mp-st-status');
      const timeEl = $(el, '.mp-st-time');
      const teamEls = [...el.querySelectorAll('.mp-st-team')].map((d) => ({ i: Number(d.dataset.t), d, state: $(d, '.mp-st-team-state'), cells: [...d.querySelectorAll('.mp-st-mini span')] }));
      let localFlash = null;

      // Welche Farbe gerade aufleuchtet (Vorspielen oder letzter Tipper)
      function litOf(T, G, t) {
        if (T.out) return null;
        if (t >= T.showAt && t < T.inputAt) {
          const { d, gap } = staffelSpeed(T.level);
          const e = t - T.showAt;
          const k = Math.floor(e / (d + gap));
          if (k < T.level && e % (d + gap) < d) return G.sequence[k];
          return null;
        }
        if (T.lastPress && t - T.lastPress.at < 250) return T.lastPress.color;
        return null;
      }

      pads.forEach((pad) => onPress(pad, () => {
        const G = c.game();
        const T = G.teams[mine];
        if (T.out || T.whose !== c.mine() || c.now() < T.inputAt) return;
        const color = Number(pad.dataset.c);
        localFlash = { color, until: performance.now() + 200 };
        c.move({ type: 'press', color });
      }));

      function stateText(T, G, t, me) {
        if (T.out) return T.why === 'alles geschafft' ? `🏁 Alles geschafft: ${T.best}` : `❌ Raus (${esc(T.why || '')}) · geschafft: ${T.best}`;
        if (t < T.inputAt) return `👀 Pass auf! <b>${T.level}</b> ${T.level === 1 ? 'Farbe' : 'Farben'}`;
        const which = `Farbe ${T.pos + 1} von ${T.level}`;
        if (me && T.whose === c.mine()) return `👉 <b>Du bist dran!</b> ${which}`;
        return `${who(T.whose)} <b>${pname(T.whose)}</b> ist dran · ${which}`;
      }

      function frame(t) {
        const G = c.game();
        timeEl.textContent = t < c.round().startAt ? '' : t < G.endAt ? `Noch ${timeLeft(t, G.endAt)} s` : 'Zeit um!';
        if (playing) {
          const T = G.teams[mine];
          let lit = litOf(T, G, t);
          if (localFlash && performance.now() < localFlash.until) lit = localFlash.color;
          const active = !T.out && T.whose === c.mine() && t >= T.inputAt;
          pads.forEach((pad, i) => {
            pad.classList.toggle('lit', lit === i);
            pad.disabled = !active;
          });
          status.innerHTML = stateText(T, G, t, true);
        }
        for (const x of teamEls) {
          const T = G.teams[x.i];
          const lit = litOf(T, G, t);
          x.cells.forEach((cell, k) => cell.classList.toggle('lit', lit === k));
          x.state.innerHTML = `${stateText(T, G, t, false)} · beste Länge: <b>${T.best}</b>`;
          x.d.classList.toggle('out', T.out);
        }
      }

      return { update() {}, frame };
    },
  };

  // ---------- Turmbau ----------

  const TB_CENTER = 100;
  const TB_SWING = 70;
  const TB_BLOCK = 7; // Blockhöhe in Prozent des Turmfelds
  const TB_SHOW = 10; // so viele Stockwerke passen ins Bild

  function swingX(ms, height) {
    const period = Math.max(1100, 2200 - 90 * height);
    return TB_CENTER + TB_SWING * Math.sin((2 * Math.PI * Math.max(0, ms)) / period);
  }

  const turmbau = {
    mount(el, c) {
      const mine = myTeam(c);
      const playing = c.play && mine >= 0;
      const order = c.big || !c.round().tv ? [0, 1] : [mine];
      el.innerHTML = `<div class="mp-tb">
        <div class="mp-tb-towers">${order.filter((i) => i >= 0).map((i) => `<div class="mp-tb-tower ${playing && i === mine ? 'mine' : ''}" data-t="${i}" style="--tc:${teamInfo(c, i).color}">
          <div class="mp-tb-head">${teamTag(c, i)} <b class="mp-tb-h"></b></div>
          <div class="mp-tb-field"><div class="mp-tb-stack"></div><div class="mp-tb-swing"></div><div class="mp-tb-msg"></div></div>
          <div class="mp-tb-turn small"></div>
        </div>`).join('')}</div>
        ${playing ? '<button class="mp-tb-btn" type="button">Fallen lassen! ⬇️</button>' : ''}
        <div class="mp-tb-time small muted center"></div>
      </div>`;
      const towers = [...el.querySelectorAll('.mp-tb-tower')].map((d) => ({
        i: Number(d.dataset.t), stack: $(d, '.mp-tb-stack'), swing: $(d, '.mp-tb-swing'), msg: $(d, '.mp-tb-msg'), h: $(d, '.mp-tb-h'), turn: $(d, '.mp-tb-turn'), drawn: -1, lastAt: 0,
      }));
      const btn = $(el, '.mp-tb-btn');
      const timeEl = $(el, '.mp-tb-time');
      let sentFor = 0; // spawnAt, für den schon getippt wurde

      function drop() {
        if (!playing) return;
        const T = c.game().teams[mine];
        const t = c.now();
        if (T.whose !== c.mine() || t < T.spawnAt || sentFor === T.spawnAt) return;
        sentFor = T.spawnAt;
        c.move({ type: 'drop', ms: Math.round(t - T.spawnAt) });
      }

      if (btn) onPress(btn, drop);
      towers.forEach((tw) => {
        if (playing && tw.i === mine) onPress(tw.stack.parentElement, drop);
      });

      function base(T) {
        return Math.max(0, T.blocks.length - TB_SHOW);
      }

      function frame(t) {
        const G = c.game();
        timeEl.textContent = t < c.round().startAt ? '' : t < G.endAt ? `Noch ${timeLeft(t, G.endAt)} s` : 'Zeit um!';
        for (const tw of towers) {
          const T = G.teams[tw.i];
          const b0 = base(T);
          if (tw.drawn !== T.blocks.length) {
            tw.drawn = T.blocks.length;
            tw.stack.innerHTML = T.blocks.slice(b0).map((bl, k) => `<div class="mp-tb-block ${k + b0 === 0 ? 'base' : ''}" style="left:${((bl.x - bl.w / 2) / 200) * 100}%;width:${(bl.w / 200) * 100}%;bottom:${k * TB_BLOCK}%"></div>`).join('');
            tw.h.textContent = `${T.height} ${T.height === 1 ? 'Stockwerk' : 'Stockwerke'}`;
          }
          const top = T.blocks[T.blocks.length - 1];
          const live = t >= T.spawnAt && t < G.endAt;
          tw.swing.style.display = live ? '' : 'none';
          if (live) {
            const x = swingX(t - T.spawnAt, T.height);
            tw.swing.style.left = `${((x - top.w / 2) / 200) * 100}%`;
            tw.swing.style.width = `${(top.w / 200) * 100}%`;
            tw.swing.style.bottom = `${(T.blocks.length - b0 + 1.5) * TB_BLOCK}%`;
          }
          if (T.last && T.last.at !== tw.lastAt) {
            tw.lastAt = T.last.at;
            tw.msgUntil = T.last.miss ? performance.now() + 1500 : 0;
          }
          tw.msg.textContent = performance.now() < (tw.msgUntil || 0) ? 'Daneben! 💥' : '';
          const meTurn = playing && tw.i === mine && T.whose === c.mine();
          tw.turn.innerHTML = meTurn ? '👉 <b>Du bist dran!</b> Tippe, um den Block fallen zu lassen.' : `${who(T.whose)} ${pname(T.whose)} ist dran`;
          if (btn && tw.i === mine) btn.disabled = !meTurn;
        }
      }

      return { update() {}, frame, tap: playing ? drop : undefined };
    },
  };

  Object.assign(MinispielGames, { torwart, ochsamberg, gespensterhaus, tauziehen, staffel, turmbau });
})();
