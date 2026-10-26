// Minispiel Party: Einstellungen, Ablauf (Ansage, Ergebnis, Siegerehrung) und die Bühne für die Minispiele.
// Die Minispiele selbst stehen in minispielparty-games.js.

(() => {
  const ID = 'minispielparty';
  const mp = {
    el: document.createElement('div'), // Bühne, bleibt beim Neuzeichnen erhalten
    key: null,
    ctl: null,
    offset: null, // eigener Uhrabgleich, stabiler als der aus jedem Zustand
    syncKey: null,
    raf: 0,
  };
  mp.el.className = 'mp-stage';
  mp.el.innerHTML = '<div class="mp-game"></div><div class="mp-count hidden"></div>';

  function now() {
    return Date.now() + (mp.offset ?? clockOffset);
  }

  function act(type, data = {}, done) {
    socket.emit('game:action', { type, ...data }, (res) => {
      if (res?.error) toast(res.error);
      done?.(res || {});
    });
  }

  function setGame(patch) {
    sendHost('settings', { game: patch });
  }

  function pname(id) {
    return esc(playerById(id)?.name || 'Jemand');
  }

  function names(ids) {
    const list = ids.map(pname);
    return list.length > 1 ? `${list.slice(0, -1).join(', ')} und ${list[list.length - 1]}` : list[0] || '';
  }

  // Großer Bildschirm: das Host-Gerät, wenn mit Fernseher gespielt wird
  function big(R) {
    return S.me.isHost && R.tv;
  }

  // Uhr mit dem Server abgleichen: einige Pings, der schnellste zählt
  async function syncClock() {
    let best = null;
    for (let i = 0; i < 6; i++) {
      const t0 = Date.now();
      const res = await emitAck(socket, 'game:draw', { op: 'ping' });
      const t1 = Date.now();
      if (!res.t) return;
      const rtt = t1 - t0;
      if (!best || rtt < best.rtt) best = { rtt, offset: res.t + rtt / 2 - t1 };
    }
    // Während eines Minispiels nicht mehr verstellen
    if (best && S?.round?.phase !== 'play') mp.offset = best.offset;
  }

  // ---------- Einstellungen ----------

  function seg(key, value, options) {
    return `<div class="segmented" style="grid-template-columns:repeat(${options.length},1fr)">${options.map(([v, text]) => `<button data-action="mpSetting" data-key="${key}" data-value="${v}" class="${String(value) === String(v) ? 'on' : ''}">${text}</button>`).join('')}</div>`;
  }

  function viewSettings() {
    const s = S.settings;
    const g = s.game;
    const meta = S.game;
    const label = (text) => `<div class="small muted" style="font-weight:700;margin-bottom:6px">${text}</div>`;
    return `<div class="card stack">
      <h3>Einstellungen</h3>
      <div class="grid-2" style="gap:12px">
        <label class="field"><span>Lobbyname</span><input id="set-lobbyName" type="text" maxlength="40" value="${esc(s.lobbyName)}"></label>
        <label class="field"><span>Dein Spielername</span><input id="set-myName" type="text" maxlength="24" value="${esc(S.me.name)}"></label>
      </div>
      <div>${label('Dein Profilbild')}${avatarPicker(S.me.avatar, 'hostAvatar')}</div>
      <div>${label('Fernseher')}${seg('tv', g.tv ? 1 : 0, [[1, '📺 Mit Fernseher'], [0, '📱 Nur Handys']])}
        <div class="small muted" style="margin-top:6px">${g.tv
          ? 'Dieses Gerät ist die Bühne: Ansage, Minispiel und Punkte. Spielst du mit, tippst du am Fernseher mit Maus oder Leertaste, sonst bist du nur Gamemaster und trittst zum Mitspielen zusätzlich mit dem Handy bei.'
          : 'Kein Fernseher: Jedes Handy zeigt das Minispiel selbst, auch dieses Gerät spielt mit.'}</div>
      </div>
      ${g.tv ? `<div>${label('Deine Rolle')}
        <div class="segmented">
          <button data-action="hostPlays" data-value="1" class="${s.hostPlays ? 'on' : ''}">🎮 Spielt mit</button>
          <button data-action="hostPlays" data-value="0" class="${!s.hostPlays ? 'on' : ''}">🎩 Nur Gamemaster</button>
        </div></div>` : ''}
      <div>${label('Modus')}${seg('mode', g.mode, [['serie', '🎪 Minispiel-Reihe'], ['brett', '🎡 Spielbrett'], ['team', '🤝 Team-Party']])}
        <div class="small muted" style="margin-top:6px">${{
          brett: 'Reihum würfeln (1–10) und über das Brett ziehen, Münzen sammeln und Sterne kaufen. Nach jeder Runde kommt ein Minispiel um Münzen. Wer am Ende die meisten Sterne hat, gewinnt.',
          team: 'Zwei feste Teams (Blau gegen Rot) für die ganze Partie, zufällig gemischt. Jedes Minispiel ist ein Punkt für ein Team: Team-Minispiele direkt, bei den anderen gewinnt das Team mit mehr Punkten pro Kopf. Ab 4 Spielern.',
          serie: 'Ein Minispiel nach dem anderen, nach jedem gibt es Punkte.',
        }[g.mode]}</div>
      </div>
      ${g.mode !== 'team' ? `<div>${label('Spielarten')}${seg('formatMix', g.formatMix, [['ffa', '👤 Jeder gegen jeden'], ['mixed', '🎲 Gemischt'], ['many', '🤝 Viel Team']])}
        <div class="small muted" style="margin-top:6px">${{
          ffa: 'Bei jedem Minispiel spielt jeder für sich.',
          mixed: 'Etwa jedes dritte Minispiel ist „Einer gegen alle“ (ab 3 Spielern, der Einzelne wird ausgelost) oder Team gegen Team (ab 4 Spielern, jedes Mal neu gemischt).',
          many: 'Jedes zweite Minispiel ist „Einer gegen alle“ oder Team gegen Team.',
        }[g.formatMix]}</div>
      </div>` : ''}
      ${g.mode === 'brett' ? `<div class="grid-2" style="gap:12px">
        <label class="field"><span>Runden</span>
          <select id="mp-rounds">${meta.roundOptions.map((n) => `<option value="${n}" ${n === g.rounds ? 'selected' : ''}>${n} Runden</option>`).join('')}</select>
        </label>
        <label class="field"><span>Preis für einen Stern</span>
          <select id="mp-star">${meta.starPrices.map((n) => `<option value="${n}" ${n === g.starPrice ? 'selected' : ''}>${n} Münzen</option>`).join('')}</select>
        </label>
        <div>${label('Letzte drei Runden: doppelte Münzen')}${seg('lastDouble', g.lastDouble ? 1 : 0, [[1, 'An'], [0, 'Aus']])}</div>
        <div>${label('Bonussterne am Ende')}${seg('bonusStars', g.bonusStars ? 1 : 0, [[1, 'An'], [0, 'Aus']])}</div>
      </div>` : `<div class="grid-2" style="gap:12px">
        <label class="field"><span>Anzahl Minispiele</span>
          <select id="mp-count">${meta.countOptions.map((n) => `<option value="${n}" ${n === g.count ? 'selected' : ''}>${n} Minispiele</option>`).join('')}</select>
        </label>
        <div>${label('Letztes Minispiel zählt doppelt')}${seg('doubleLast', g.doubleLast ? 1 : 0, [[1, 'An'], [0, 'Aus']])}</div>
      </div>`}
      <div>${label(g.mode === 'brett' ? 'Münzen aus Minispielen' : 'Punkte')}${seg('scoring', g.scoring, [['behind', '👥 Pro Spieler dahinter'], ['top3', '🥇 3/2/1 für die Besten']])}
        <div class="small muted" style="margin-top:6px">${g.scoring === 'behind'
          ? 'Jeder bekommt so viele Punkte, wie Spieler hinter ihm liegen. Bei sechs Spielern bekommt der Erste 5, der Letzte 0.'
          : 'Nur die ersten drei Plätze bekommen Punkte: 3, 2 und 1.'}${g.mode === 'brett' ? ' Auf dem Brett gibt es dafür doppelt so viele Münzen.' : ''}</div>
      </div>
      <div>
        <div class="row spread" style="margin-bottom:6px"><span class="small muted" style="font-weight:700">Minispiele (${g.games.length} von ${meta.minigames.length})</span>
          <span class="row"><button class="btn small ghost" data-action="mpAllGames">Alle</button></span></div>
        ${FORMAT_GROUPS.map(([f, title]) => `<div class="small muted mp-pick-title">${title}</div>
        <div class="mp-pick">${meta.minigames.filter((m) => m.formats.includes(f)).map((m) => `<button class="mp-pick-one ${g.games.includes(m.id) ? 'on' : ''}" data-action="mpToggleGame" data-id="${m.id}">
          <span class="mp-pick-icon">${m.icon}</span><b>${esc(m.name)}</b><span class="small muted">${esc(m.short)}${m.motion ? ' 📳' : ''}</span></button>`).join('')}</div>`).join('')}
      </div>
      <div class="small muted">So geht's: Eine Partie besteht aus kurzen Minispielen, die alle gleichzeitig auf dem Handy spielen. Vor jedem Minispiel steht kurz da, wie es geht. Nach jedem Minispiel gibt es Punkte, am Ende gewinnt, wer die meisten hat. 📳 = mit Schütteln (geht auch mit Tippen). Für 2 bis 12 Spieler.</div>
    </div>`;
  }

  const FORMAT_GROUPS = [['ffa', '👤 Jeder gegen jeden'], ['solo', '🎯 Einer gegen alle'], ['teams', '🤝 Team gegen Team']];

  // ---------- Ansichten ----------

  function teamParty(R) {
    return R.mode === 'team';
  }

  function teamTag(t) {
    return `<span class="mp-team-tag" style="--tc:${t.color}">${t.icon} ${esc(t.name)}</span>`;
  }

  // Wer gegen wen: Einzelner gegen Gruppe oder zwei Teams
  function versus(R, setupData = R.setup) {
    if (!setupData) return '';
    if (setupData.format === 'solo') {
      const others = R.standings.map((e) => e.id).filter((id) => id !== setupData.solo && playerById(id)?.connected);
      return `<div class="mp-vs">
        <div class="mp-vs-solo">${avatarHtml(playerById(setupData.solo), 'lg')}<b>🎯 ${pname(setupData.solo)}</b>${setupData.solo === S.me.id ? '<span class="mp-vs-you">Das bist du!</span>' : ''}</div>
        <div class="mp-vs-x">gegen</div>
        <div class="mp-vs-group"><b>👥 alle anderen</b><div>${others.map((id) => avatarHtml(playerById(id), 'sm')).join('')}</div></div>
      </div>`;
    }
    if (setupData.teams) {
      return `<div class="mp-vs teams">${setupData.teams.map((t, i) => `${i ? '<div class="mp-vs-x">gegen</div>' : ''}<div class="mp-vs-team ${t.ids.includes(S.me.id) ? 'me' : ''}" style="--tc:${t.color}">
        ${teamTag(t)}${R.teamParty ? `<span class="mp-vs-score">${R.teamParty.score[i]}</span>` : ''}
        <div class="mp-vs-names">${t.ids.map((id) => `<span>${avatarHtml(playerById(id), 'sm')} ${pname(id)}</span>`).join('')}</div>
        ${t.ids.includes(S.me.id) ? '<span class="mp-vs-you">Dein Team</span>' : ''}</div>`).join('')}</div>`;
    }
    return '';
  }

  // Für Handys: Rahmen in der Farbe des eigenen Teams
  function myTeamColor(R) {
    const t = R.setup?.teams?.find((x) => x.ids.includes(S.me.id));
    return t ? t.color : null;
  }

  function formatLabel(format) {
    return { solo: '🎯 Einer gegen alle', teams: '🤝 Team gegen Team' }[format] || '';
  }

  function brett(R) {
    return R.mode === 'brett';
  }

  function head(R) {
    const m = R.current;
    const where = R.duel ? '⚔️ Duell' : brett(R) ? `Runde ${R.board.round}/${R.board.rounds} · Minispiel` : `Minispiel ${R.index + 1}/${R.total}`;
    const fmt = !R.duel && R.format !== 'ffa' ? ` · ${formatLabel(R.format)}` : '';
    const score = R.teamParty ? ` · ${R.teamParty.teams.map((t, i) => `${t.icon} ${R.teamParty.score[i]}`).join(' : ')}` : '';
    return `<div class="q-head mp-head">
      <div class="small muted"><b>${where}</b>${fmt}${score}${R.double ? ' · <span class="mp-double">⭐ zählt doppelt</span>' : ''}</div>
      <div class="mp-head-name">${m ? `${m.icon} ${esc(m.name)}` : ''}</div>
    </div>`;
  }

  function standingsList(R, { limit = 0, highlight = true } = {}) {
    const rows = limit ? R.standings.slice(0, limit) : R.standings;
    return `<div class="scoreboard">${rows.map((e) => `<div class="score-row ${highlight && e.id === S.me.id ? 'me' : ''}" style="--team:var(--accent)"><span class="rank">${e.place}.</span>
      <span class="name">${avatarHtml(playerById(e.id), 'sm')} ${pname(e.id)}</span>${e.stars !== undefined ? `<span class="mp-sc">⭐ ${e.stars}</span><span class="mp-sc">🪙 ${e.coins}</span>` : `<span class="pts">${e.points}</span>`}</div>`).join('')}</div>`;
  }

  // ---------- Brett ----------

  function itemOf(R, id) {
    return R.board.items[id];
  }

  function myStatus(R) {
    const me = R.board.players[S.me.id];
    if (!me) return '';
    return `<div class="mp-bd-me"><span>⭐ <b>${me.stars}</b></span><span>🪙 <b>${me.coins}</b></span>
      <span class="mp-bd-items">${me.items.length ? me.items.map((i) => `<span title="${esc(itemOf(R, i).name)}">${itemOf(R, i).icon}</span>`).join('') : '<span class="small muted">keine Gegenstände</span>'}</span></div>`;
  }

  function turnPanel(R) {
    const B = R.board;
    const t = B.turn;
    if (!t) return '';
    const mine = t.id === S.me.id;
    const me = B.players[S.me.id];
    if (mine && t.step === 'start') {
      const items = !t.usedItem && !t.extra ? me.items : [];
      return `<div class="mp-bd-turn me">
        <div class="mp-bd-turn-title">🎲 Du bist dran!${t.double ? ' (mit zwei Würfeln)' : ''}</div>
        ${items.length ? `<div class="mp-bd-useitems">${[...new Set(items)].map((i) => `<button class="btn small" data-action="mpItem" data-item="${i}">${itemOf(R, i).icon} ${esc(itemOf(R, i).name)} benutzen</button>`).join('')}</div>` : ''}
        <button class="btn primary big mp-bd-roll" data-action="mpRoll">Würfeln 🎲</button>
      </div>`;
    }
    if (mine && t.step === 'choice' && t.choice?.options) {
      return `<div class="mp-bd-turn me">
        <div class="mp-bd-turn-title">${esc(t.choice.title)}</div>
        <div class="mp-bd-options">${t.choice.options.map((o) => `<button class="btn ${o.value === 'none' || o.value === 'no' ? 'ghost' : 'primary'}" data-action="mpChoose" data-value="${esc(JSON.stringify(o.value))}">
          ${o.player ? avatarHtml(playerById(o.player), 'sm') : ''} ${esc(o.label)}${o.text ? `<span class="small" style="display:block;font-weight:400">${esc(o.text)}</span>` : ''}</button>`).join('')}</div>
      </div>`;
    }
    const who = `${avatarHtml(playerById(t.id), 'sm')} <b>${pname(t.id)}</b>`;
    let line;
    if (t.step === 'start') line = `${who} ist dran und würfelt gleich …`;
    else if (t.step === 'choice') line = `${who} entscheidet: ${esc(t.choice?.title || '…')}`;
    else if (t.step === 'dice') line = `${who} würfelt …`;
    else if (t.step === 'moving') {
      const n = t.dice ? t.dice.reduce((a, b) => a + b, 0) : 0;
      line = `${who} zieht ${n} ${n === 1 ? 'Feld' : 'Felder'} …`;
    }
    else if (t.step === 'wheel') line = `${who} dreht am Glücksrad …`;
    else line = t.message ? esc(t.message) : `${who} ist dran`;
    return `<div class="mp-bd-turn ${mine ? 'me' : ''}"><div>${line}</div>${t.message && t.step !== 'effect' && !big(R) ? `<div class="small muted">${esc(t.message)}</div>` : ''}</div>`;
  }

  function boardSide(R) {
    const B = R.board;
    return `<div class="mp-bd-side">
      ${B.standings.map((e) => `<div class="mp-bd-row ${B.turn?.id === e.id ? 'turn' : ''} ${e.id === S.me.id ? 'me' : ''}">
        <span class="rank">${e.place}.</span>${avatarHtml(playerById(e.id), 'sm')}<span class="name">${pname(e.id)}</span>
        <span>⭐${e.stars}</span><span>🪙${e.coins}</span></div>`).join('')}
    </div>`;
  }

  function viewBoard(R) {
    const B = R.board;
    return `<div class="stack">
      <div class="q-head mp-head">
        <div class="small muted"><b>Runde ${B.round}/${B.rounds}</b>${B.lastRounds ? ' · <span class="mp-double">🔥 doppelte Münzen</span>' : ''} · Stern: ${B.price} 🪙</div>
        <div class="mp-head-name">${B.def.icon} ${esc(B.def.name)}</div>
      </div>
      <div class="mp-bd-layout ${big(R) ? 'big' : ''}">
        <div id="mp-slot"></div>
        ${boardSide(R)}
      </div>
      ${big(R) && !R.playing ? turnPanel(R) : `${turnPanel(R)}${myStatus(R)}`}
    </div>`;
  }

  function viewIntro(R) {
    const m = R.current;
    const ready = new Set(R.ready);
    const players = (R.duel ? R.duel.ids : R.standings.map((e) => e.id)).filter((id) => playerById(id)?.connected);
    const mineReady = ready.has(S.me.id);
    const canReady = R.playing && (!R.duel || R.duel.ids.includes(S.me.id));
    return `<div class="stack">
      ${head(R)}
      ${!R.duel ? versus(R) : ''}
      ${R.duel ? `<div class="mp-duel">${avatarHtml(playerById(R.duel.ids[0]), 'lg')}<b>${pname(R.duel.ids[0])}</b><span>⚔️</span><b>${pname(R.duel.ids[1])}</b>${avatarHtml(playerById(R.duel.ids[1]), 'lg')}<div class="small muted">Duell um ${R.duel.stake} Münzen</div></div>` : ''}
      <div class="card mp-intro">
        <div class="mp-intro-icon">${m.icon}</div>
        <h1>${esc(m.name)}</h1>
        <p class="mp-howto">${esc(m.howto)}</p>
        ${m.motion ? '<div class="small muted">📳 Mit Schütteln. Wer nicht schütteln kann, tippt.</div>' : ''}
      </div>
      ${canReady ? `<button class="btn ${mineReady ? 'ghost' : 'primary'} big mp-ready" data-action="mpReady" ${mineReady ? 'disabled' : ''}>${mineReady ? '✅ Bereit! Warte auf die anderen …' : 'Bereit! 👍'}</button>` : ''}
      <div class="mp-ready-list">${players.map((id) => `<span class="mp-chip ${ready.has(id) ? 'done' : ''}">${avatarHtml(playerById(id), 'sm')} ${pname(id)} ${ready.has(id) ? '✅' : '⏳'}</span>`).join('')}</div>
      <div class="small muted center">Sind alle bereit, geht es los. Spätestens in <span class="timer" id="timer"></span></div>
      ${R.duel && !canReady ? '<div class="notice center">Du schaust bei diesem Duell zu.</div>' : ''}
      ${(R.index > 0 || brett(R)) && big(R) && !R.duel ? `<div class="card stack"><h3 style="margin:0">Zwischenstand</h3>${standingsList(R, { limit: 12, highlight: false })}</div>` : ''}
    </div>`;
  }

  function viewPlay(R) {
    const color = !big(R) && (R.format === 'teams' || R.teamParty) ? myTeamColor(R) : null;
    const role = R.setup?.format === 'solo' && R.inGame && !big(R) ? `<div class="mp-role">${R.setup.solo === S.me.id ? '🎯 Du spielst allein gegen alle!' : `👥 Ihr spielt zusammen gegen ${pname(R.setup.solo)}`}</div>` : '';
    const team = color ? `<div class="mp-role" style="--tc:${color}">${teamTag(R.setup.teams.find((t) => t.ids.includes(S.me.id)))} Du spielst für dein Team</div>` : '';
    return `<div class="stack ${color ? 'mp-teamframe' : ''}" ${color ? `style="--tc:${color}"` : ''}>${head(R)}${role}${team}<div id="mp-slot"></div>${!R.inGame && !big(R) ? '<div class="notice center">Du schaust bei diesem Minispiel zu. Beim nächsten bist du dabei!</div>' : ''}</div>`;
  }

  // Gewonnen hat nur, wer vor jemandem liegt
  function won(last, g) {
    return g.place === 1 && !g.none && last.groups.length > 1 && !last.tie;
  }

  function gain(last, id, g) {
    if (last.duel) return '';
    if (last.coins) {
      const c = last.coins.find((x) => x.id === id)?.coins || 0;
      return `${c < 0 ? '−' : '+'}${Math.abs(c)} 🪙`;
    }
    return g.points ? `+${g.points}` : '0';
  }

  function resultRows(last) {
    const teamOf = (id) => last.setup?.teams?.find((t) => t.ids.includes(id));
    return last.groups.map((g) => g.ids.map((id) => `<div class="score-row ${id === S.me.id ? 'me' : ''}" style="--team:${g.place === 1 ? 'var(--accent)' : 'var(--line)'}">
      <span class="rank">${won(last, g) ? '🏆' : `${g.place}.`}</span>
      <span class="name">${avatarHtml(playerById(id), 'sm')} ${pname(id)}${last.format === 'ffa' && teamOf(id) ? ` ${teamOf(id).icon}` : ''}</span>
      <span class="small muted">${esc(g.label)}</span>
      <span class="pts">${gain(last, id, g)}</span></div>`).join('')).join('');
  }

  function myLine(R, last) {
    const g = last.groups.find((x) => x.ids.includes(S.me.id));
    if (!g) return '';
    const total = R.standings.find((e) => e.id === S.me.id);
    if (last.format && last.format !== 'ffa') {
      const verdict = last.tie ? '🤝 Unentschieden' : won(last, g) ? '🏆 Gewonnen!' : '😢 Verloren';
      return `<div class="mp-myline">${verdict} · <b>${gain(last, S.me.id, g)}</b>${last.coins ? '' : ` ${g.points === 1 ? 'Punkt' : 'Punkte'}`}${total ? (last.coins ? ` · jetzt ⭐ ${total.stars} und 🪙 ${total.coins}` : ` · gesamt ${total.points} (Platz ${total.place})`) : ''}</div>`;
    }
    if (last.coins) return `<div class="mp-myline">${won(last, g) ? '🏆 Gewonnen!' : `Platz ${g.place}`} · <b>${gain(last, S.me.id, g)}</b>${total ? ` · jetzt ⭐ ${total.stars} und 🪙 ${total.coins}` : ''}</div>`;
    return `<div class="mp-myline">${won(last, g) ? '🏆 Gewonnen!' : `Platz ${g.place}`} · <b>+${g.points}</b> ${g.points === 1 ? 'Punkt' : 'Punkte'}${total ? ` · gesamt ${total.points} (Platz ${total.place})` : ''}</div>`;
  }

  function viewDuelResult(R) {
    const last = R.last;
    return `<div class="stack">
      ${head(R)}
      <div class="center"><h2 style="margin:0">⚔️ ${last.winner ? `${pname(last.winner)} gewinnt das Duell!` : 'Unentschieden!'}</h2>
        <p class="mp-info">${last.winner ? `${pname(last.loser)} zahlt ${last.stake} Münzen.` : 'Niemand zahlt.'}${last.info ? ` ${esc(last.info)}` : ''}</p></div>
      <div class="card stack"><div class="scoreboard">${resultRows(last)}</div></div>
      <div class="small muted center">Gleich geht es auf dem Brett weiter.</div>
    </div>`;
  }

  // Überschrift im Ergebnis: wer hat gewonnen
  function headline(last) {
    if (last.format === 'solo') {
      if (last.winner === 'solo') return `🎯 ${pname(last.setup.solo)} gewinnt allein!`;
      return `👥 Die Gruppe gewinnt gegen ${pname(last.setup.solo)}!`;
    }
    if (last.format === 'teams') {
      if (last.winner === null || last.winner === undefined) return 'Unentschieden!';
      const t = last.setup.teams[last.winner];
      return `${t.icon} ${esc(t.name)} gewinnt!`;
    }
    return 'Ergebnis';
  }

  function teamPoint(R, last) {
    if (!R.teamParty || last.teamWin === undefined) return '';
    const t = last.teamWin === null ? null : R.teamParty.teams[last.teamWin];
    const score = R.teamParty.teams.map((x, i) => `${x.icon} ${R.teamParty.score[i]}`).join(' : ');
    return `<div class="mp-teampoint">${t ? `Punkt für ${teamTag(t)}` : 'Kein Punkt, beide Teams gleichauf.'} · Stand ${score}</div>`;
  }

  function viewResult(R) {
    const last = R.last;
    if (last.duel) return viewDuelResult(R);
    const m = last.game;
    const extra = MinispielGames[m.id]?.result?.(last) || '';
    const nextHint = S.me.isHost ? '' : `<div class="small muted center">${R.lastOne ? 'Gleich kommt die Siegerehrung.' : brett(R) ? 'Gleich geht es auf dem Brett weiter.' : `Als Nächstes: ${R.next ? `${R.next.icon} ${esc(R.next.name)}` : '…'}. Der Host startet es.`}</div>`;
    return `<div class="stack">
      ${head(R)}
      <div class="center"><h2 style="margin:0">🏁 ${esc(m.name)}: ${headline(last)}</h2>${last.info ? `<p class="mp-info">${esc(last.info)}</p>` : ''}${last.double ? '<div class="mp-double">⭐ doppelte Punkte</div>' : ''}${teamPoint(R, last)}</div>
      ${!big(R) && R.playing ? myLine(R, last) : ''}
      <div class="grid-2">
        <div class="card stack"><h3 style="margin:0">Dieses Minispiel</h3><div class="scoreboard">${resultRows(last)}</div></div>
        <div class="card stack"><h3 style="margin:0">Gesamtstand</h3>${standingsList(R)}</div>
      </div>
      ${extra}
      ${nextHint}
    </div>`;
  }

  function viewFinal(R) {
    const a = R.awards || {};
    const tp = R.teamParty;
    const st = R.standings;
    const podium = [st.filter((e) => e.place === 2), st.filter((e) => e.place === 1), st.filter((e) => e.place === 3)];
    const step = (list, cls, medal) => `<div class="mp-podium-step ${cls}">${list.map((e) => `<div class="mp-podium-who">${avatarHtml(playerById(e.id), cls === 'first' ? 'lg' : '')}<b>${pname(e.id)}</b><span class="small">${e.stars !== undefined ? `⭐ ${e.stars} · 🪙 ${e.coins}` : `${e.points} ${e.points === 1 ? 'Punkt' : 'Punkte'}`}</span></div>`).join('') || ''}<div class="mp-podium-block">${list.length ? medal : ''}</div></div>`;
    const award = (icon, title, ids, text) => `<div class="card mp-award"><div class="icon">${icon}</div><div><b>${title}</b><div>${names(ids)}</div><div class="small muted">${text}</div></div></div>`;
    const awards = [
      a.wins && award('🔥', 'Dauerbrenner', a.wins.ids, `${a.wins.n} ${a.wins.n === 1 ? 'Minispiel' : 'Minispiele'} gewonnen`),
      a.fastest && award('⚡', 'Blitzmerker', [a.fastest.id], `schnellste Reaktion: ${a.fastest.ms} ms`),
      a.bombs && award('💣', 'Bombenpech', a.bombs.ids, `${a.bombs.n}× in der Hand explodiert`),
      a.lasts && award('🐢', 'Pechvogel', a.lasts.ids, `${a.lasts.n}× Letzter`),
      a.solo && award('🎯', 'Einzelkämpfer', a.solo.ids, `${a.solo.n}× allein gegen alle gewonnen`),
      a.team && award('🤝', 'Teamplayer', a.team.ids, `${a.team.n} Team-${a.team.n === 1 ? 'Minispiel' : 'Minispiele'} gewonnen`),
    ].filter(Boolean).join('');
    const bonus = (R.bonus || []).map((b) => award(b.icon, `Bonusstern: ${b.title}`, b.ids, `${b.n} ${b.unit}`)).join('');
    const history = (R.history || []).map((h, i) => {
      const m = S.game.minigames.find((x) => x.id === h.id);
      return `<div class="score-row" style="--team:var(--accent)"><span class="rank">${i + 1}.</span><span class="name">${m.icon} ${esc(m.name)}${h.double ? ' ⭐' : ''}</span>
        <span class="small">${h.skipped ? '<span class="muted">übersprungen</span>' : h.tie ? 'unentschieden' : `🏆 ${names(h.winners)}`}${tp && h.teamWin !== undefined && h.teamWin !== null ? ` · ${tp.teams[h.teamWin].icon}` : ''}</span></div>`;
    }).join('');
    let teamFinal = '';
    if (tp) {
      const [a, b] = tp.score;
      const win = a === b ? null : a > b ? 0 : 1;
      teamFinal = `<div class="card center mp-teamfinal">
        <h2 style="margin:0">${win === null ? '🤝 Unentschieden!' : `🏆 ${esc(tp.teams[win].name)} gewinnt!`}</h2>
        <div class="mp-teamfinal-score">${tp.teams.map((t, i) => `<span style="color:${t.color}">${t.icon} ${tp.score[i]}</span>`).join(' : ')}</div>
        ${versus(R, { format: 'teams', teams: tp.teams })}
      </div>`;
    }
    return `<div class="stack">
      <div class="center"><div style="font-size:3rem">🎪</div><h1>Siegerehrung</h1></div>
      ${teamFinal}
      ${tp ? '' : `<div class="mp-podium">${step(podium[0], 'second', '🥈')}${step(podium[1], 'first', '🥇')}${step(podium[2], 'third', '🥉')}</div>`}
      ${bonus ? `<div class="mp-awards">${bonus}</div>` : ''}
      ${awards ? `<div class="mp-awards">${awards}</div>` : ''}
      <div class="grid-2">
        <div class="card stack"><h3 style="margin:0">Endstand</h3>${standingsList(R)}</div>
        <div class="card stack"><h3 style="margin:0">Alle Minispiele</h3><div class="scoreboard">${history}</div></div>
      </div>
      ${S.me.isHost ? '' : '<div class="muted center">Der Host kann eine neue Partie starten.</div>'}
    </div>`;
  }

  function view() {
    const R = S.round;
    const body = { board: viewBoard, intro: viewIntro, play: viewPlay, result: viewResult, final: viewFinal }[R.phase];
    return `<div class="mp ${big(R) ? 'mp-big' : ''}">${body(R)}</div>`;
  }

  function hostbar() {
    const R = S.round;
    if (R.phase === 'final') return '<button class="btn primary" data-action="toLobby">Neue Partie (zur Lobby)</button>';
    if (R.phase === 'board') {
      const t = R.board.turn;
      return t && ['start', 'choice'].includes(t.step) ? `<button class="btn" data-action="mpForce">⏩ Für ${pname(t.id)} weitermachen</button>` : '<span class="small muted">Auf dem Brett wird gezogen …</span>';
    }
    if (R.duel && R.phase === 'result') return '<button class="btn primary" data-action="mpNext">Zurück zum Brett ▶︎</button>';
    if (R.phase === 'intro') return '<button class="btn ghost" data-action="mpSkip">⏭ Überspringen</button><button class="btn pink" data-action="mpNext">▶︎ Los geht’s</button>';
    if (R.phase === 'play') return '<button class="btn ghost" data-action="mpSkip">⏭ Abbrechen (keine Punkte)</button><button class="btn" data-action="mpNext">🏁 Jetzt werten</button>';
    return `<button class="btn primary" data-action="mpNext">${R.lastOne ? '🏆 Zur Siegerehrung' : brett(R) ? 'Weiter auf dem Brett ▶︎' : 'Nächstes Minispiel ▶︎'}</button>`;
  }

  // ---------- Bühne ----------

  function unmount() {
    mp.ctl?.unmount?.();
    mp.ctl = null;
    mp.key = null;
    mp.el.querySelector('.mp-game').innerHTML = '';
    mp.el.remove();
  }

  function loop() {
    mp.raf = requestAnimationFrame(loop);
    const R = S?.round;
    if (!mp.ctl || !['play', 'board'].includes(R?.phase)) return;
    const t = now();
    if (R.phase === 'board') {
      try {
        mp.ctl.frame?.(t);
      } catch (err) {
        console.error(err);
      }
      return;
    }
    const count = mp.el.querySelector('.mp-count');
    const left = R.startAt - t;
    const text = left > 0 ? String(Math.min(3, Math.ceil(left / 1000))) : left > -700 ? 'Los!' : '';
    if (count.dataset.v !== text) {
      count.dataset.v = text;
      count.textContent = text;
      count.classList.toggle('hidden', !text);
    }
    try {
      mp.ctl.frame?.(t);
    } catch (err) {
      console.error(err);
    }
  }

  function mount(R) {
    const mod = MinispielGames[R.current.id];
    if (!mod) return;
    mp.key = R.playId;
    const c = {
      round: () => S.round,
      game: () => S.round.game,
      big: big(R),
      play: Boolean(R.inGame),
      now,
      mine: () => S.me.id,
      move: (m, done) => act('move', { move: m }, done),
      draw: (data) => socket.emit('game:draw', data, () => {}),
    };
    mp.ctl = mod.mount(mp.el.querySelector('.mp-game'), c);
    mp.el.dataset.game = R.current.id;
    if (!mp.raf) loop();
  }

  function mountBoard(R) {
    mp.key = 'board';
    const c = { board: () => S.round.board, big: big(R), play: R.playing, mine: () => S.me.id };
    mp.ctl = MinispielBoard.mount(mp.el.querySelector('.mp-game'), c);
    mp.el.dataset.game = 'board';
    if (!mp.raf) loop();
  }

  function afterRender() {
    if (S?.game.id !== ID || S.phase !== 'playing') {
      if (mp.ctl) unmount();
      return;
    }
    const R = S.round;
    // Uhr vor jedem Minispiel neu abgleichen
    if (R.phase === 'intro' && mp.syncKey !== R.index) {
      mp.syncKey = R.index;
      syncClock();
    }
    if (R.phase === 'board') {
      const slot = document.getElementById('mp-slot');
      if (!slot) return;
      if (mp.key !== 'board') {
        if (mp.ctl) unmount();
        mountBoard(R);
      }
      slot.appendChild(mp.el);
      return;
    }
    if (R.phase !== 'play') {
      if (mp.ctl) unmount();
      return;
    }
    const slot = document.getElementById('mp-slot');
    if (!slot) return;
    if (mp.key !== R.playId) {
      if (mp.ctl) unmount();
      mount(R);
    } else {
      mp.ctl?.update?.(R);
    }
    slot.appendChild(mp.el);
  }

  gameViews[ID] = { settings: viewSettings, view, hostbar, afterRender };

  socket.on('mp-live', (data) => {
    if (S?.game.id !== ID || S.round?.phase !== 'play' || data.seq !== S.round.playId) return;
    mp.ctl?.live?.(data);
  });

  // Am Fernseher: Leertaste statt Tippen
  document.addEventListener('keydown', (e) => {
    if (S?.game.id !== ID || S.round?.phase !== 'play' || !mp.ctl?.tap) return;
    if (e.code !== 'Space' || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
    e.preventDefault();
    if (!e.repeat) mp.ctl.tap();
  });

  // ---------- Eingaben ----------

  Object.assign(actions, {
    mpSetting: (el) => {
      const { key, value } = el.dataset;
      setGame({ [key]: ['scoring', 'mode', 'formatMix'].includes(key) ? value : value === '1' });
    },
    mpToggleGame: (el) => {
      const list = S.settings.game.games;
      const id = el.dataset.id;
      const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
      if (!next.length) return toast('Mindestens ein Minispiel muss dabei sein.');
      setGame({ games: next });
    },
    mpAllGames: () => setGame({ games: S.game.minigames.map((m) => m.id) }),
    mpReady: () => {
      // Für Schüttelspiele die Erlaubnis gleich hier holen, das geht nur nach einem Tippen
      if (S.round.current?.motion) MinispielGames.motion.request();
      act('ready');
    },
    mpNext: () => act('next'),
    mpRoll: () => act('roll'),
    mpItem: (el) => act('useItem', { item: el.dataset.item }),
    mpChoose: (el) => act('choose', { value: JSON.parse(el.dataset.value) }),
    mpForce: () => act('force'),
    mpSkip: () => {
      if (confirm('Dieses Minispiel ohne Punkte überspringen?')) act('skip');
    },
  });

  app.addEventListener('change', (e) => {
    if (S?.game.id !== ID) return;
    if (e.target.id === 'mp-count') setGame({ count: Number(e.target.value) });
    else if (e.target.id === 'mp-rounds') setGame({ rounds: Number(e.target.value) });
    else if (e.target.id === 'mp-star') setGame({ starPrice: Number(e.target.value) });
  });
})();
