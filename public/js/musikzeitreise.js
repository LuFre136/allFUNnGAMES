// Musikzeitreise: Einstellungen und Spielansicht für Host und Handys (nutzt die Helfer aus lobby.js)

(() => {
  const mzDrafts = {}; // Eingaben für Interpret und Titel pro Song

  function act(type, data = {}) {
    socket.emit('game:action', { type, ...data }, (res) => {
      if (res?.error) toast(res.error);
    });
  }

  function songKey(R) {
    return `${R.activeKey}:${R.deckLeft}`;
  }

  function draft(R) {
    const key = songKey(R);
    if (!mzDrafts[key]) mzDrafts[key] = { artist: '', title: '' };
    return mzDrafts[key];
  }

  // ---------- Namen der Zeitleisten (Spieler oder Team) ----------

  function unitLabel(R, key) {
    if (R.teamMode) {
      const t = teamById(key);
      return `<span class="mz-who"><span class="team-dot" style="--team:${t?.color || 'var(--line)'}"></span>${esc(t?.name || 'Team')}</span>`;
    }
    const p = playerById(key);
    return `<span class="mz-who">${avatarHtml(p, 'sm')}${esc(p?.name || 'Jemand')}${key === S.me.id ? ' <span class="muted">(du)</span>' : ''}</span>`;
  }

  function unitName(R, key) {
    return (R.teamMode ? teamById(key)?.name : playerById(key)?.name) || 'Jemand';
  }

  function unitByKey(R, key) {
    return R.units.find((u) => u.key === key) || null;
  }

  function chips(n) {
    return `<span class="mz-chips" title="Chips">🪙 ${n}</span>`;
  }

  // ---------- Einstellungen ----------

  function viewSettings() {
    const s = S.settings;
    const g = s.game;
    const meta = S.game;
    return `<div class="card stack">
      <h3>Einstellungen</h3>
      <div class="grid-2" style="gap:12px">
        <label class="field"><span>Lobbyname</span><input id="set-lobbyName" type="text" maxlength="40" value="${esc(s.lobbyName)}"></label>
        <label class="field"><span>Dein Spielername</span><input id="set-myName" type="text" maxlength="24" value="${esc(S.me.name)}"></label>
      </div>
      <div><div class="small muted" style="font-weight:700;margin-bottom:6px">Dein Profilbild</div>${avatarPicker(S.me.avatar, 'hostAvatar')}</div>
      <div>
        <div class="small muted" style="font-weight:700;margin-bottom:6px">Deine Rolle</div>
        <div class="segmented">
          <button data-action="hostPlays" data-value="1" class="${s.hostPlays ? 'on' : ''}">🎮 Spielt mit</button>
          <button data-action="hostPlays" data-value="0" class="${!s.hostPlays ? 'on' : ''}">🎩 Nur Gamemaster</button>
        </div>
      </div>
      <div>
        <div class="small muted" style="font-weight:700;margin-bottom:6px">Spielmodus</div>
        <div class="segmented">
          <button data-action="mzTeamMode" data-value="0" class="${!g.teamMode ? 'on' : ''}">🙋 Jeder für sich</button>
          <button data-action="mzTeamMode" data-value="1" class="${g.teamMode ? 'on' : ''}">👥 In Teams</button>
        </div>
      </div>
      <div class="grid-2" style="gap:12px">
        <label class="field"><span>Karten zum Sieg (Original: 10)</span>
          <input id="mz-target" type="number" min="3" max="30" value="${g.targetCards}" inputmode="numeric">
        </label>
        <div>
          <div class="small muted" style="font-weight:700;margin-bottom:6px">Chips 🪙</div>
          <div class="segmented">
            <button data-action="mzChips" data-value="1" class="${g.chips ? 'on' : ''}">An</button>
            <button data-action="mzChips" data-value="0" class="${!g.chips ? 'on' : ''}">Aus</button>
          </div>
        </div>
      </div>
      <div class="small muted">${meta.totalSongs} Songs. ${meta.spotifySongs} davon laufen über Spotify (mit Spotify-Login im Browser der ganze Song), die übrigen als 30-Sekunden-Vorschau über Deezer.</div>
      <div class="small muted">So geht's: Jeder startet mit einer offenen Karte. Wer dran ist, hört einen Song (er läuft verdeckt auf dem Gerät des Hosts) und legt die Karte an die Stelle seiner Zeitleiste, an die das Erscheinungsjahr passt. Stimmt die Stelle, darf er die Karte behalten. Wer zuerst ${g.targetCards} Karten hat, gewinnt.${g.chips ? ` Mit Chips: Jeder startet mit ${meta.startChips}. Wer Interpret und Titel richtig nennt, bekommt einen dazu (höchstens ${meta.maxChips}). Ein Chip überspringt einen Song oder setzt auf eine andere Stelle, wenn ihr glaubt, dass der Aktive falsch liegt: Liegt ihr richtig, bekommt ihr die Karte. Für ${meta.buyCost} Chips gibt es die Karte geschenkt.` : ''}</div>
    </div>`;
  }

  // ---------- Zeitleiste ----------

  function viewCard(c, cls = '') {
    return `<div class="mz-card ${cls}"><div class="year">${c.year}</div><div class="artist">${esc(c.artist)}</div><div class="title">${esc(c.title)}</div></div>`;
  }

  function mysteryCard(R) {
    if (R.song) return viewCard(R.song, `new ${R.result?.correct ? 'good' : 'bad'}`);
    return '<div class="mz-card mystery"><div class="year">?</div><div class="artist">Neuer Song</div></div>';
  }

  // mode: place (aktiver Spieler legt), challenge (Einspruch möglich) oder view
  function viewTimeline(R, mode) {
    const unit = unitByKey(R, R.activeKey);
    const cards = unit?.cards || [];
    // Nach dem Aufdecken liegt die richtig gelegte Karte schon in der Zeitleiste, sie wird extra hervorgehoben
    const shown = R.phase === 'reveal' && R.result?.correct ? cards.filter((_, i) => i !== R.slot) : cards;
    const takenBy = new Map(R.challenges.map((c) => [c.slot, c.key]));
    const parts = [];
    for (let i = 0; i <= shown.length; i++) {
      const challenger = takenBy.get(i);
      if (i === R.slot && R.phase !== 'final') {
        parts.push(mysteryCard(R));
      } else if (challenger) {
        parts.push(`<div class="mz-slot challenged">🪙 ${unitLabel(R, challenger)}</div>`);
      } else if (mode === 'place') {
        parts.push(`<button class="mz-slot" data-action="mzPlace" data-slot="${i}" title="Hier einordnen">＋</button>`);
      } else if (mode === 'challenge') {
        parts.push(`<button class="mz-slot" data-action="mzChallenge" data-slot="${i}" title="Einspruch: hierhin">🪙</button>`);
      }
      if (i < shown.length) parts.push(viewCard(shown[i]));
    }
    return `<div class="mz-timeline">${parts.join('')}</div>`;
  }

  function viewOthers(R) {
    const others = R.units.filter((u) => u.key !== R.activeKey);
    if (!others.length) return '';
    return `<div class="stack" style="gap:8px">
      <h3 style="margin:0">Die anderen Zeitleisten</h3>
      ${others.map((u) => `<div class="mz-unit ${u.present ? '' : 'offline'}">
        <div class="row spread">${unitLabel(R, u.key)}<span class="small"><b>${u.cards.length}/${R.target}</b> Karten${R.chipsEnabled ? ` · ${chips(u.chips)}` : ''}</span></div>
        <div class="mz-years">${u.cards.map((c) => `<span title="${esc(`${c.artist} – ${c.title}`)}">${c.year}</span>`).join('')}</div>
      </div>`).join('')}
    </div>`;
  }

  function viewNoUnit(R) {
    if (isGamemaster() || R.myKey) return '';
    if (S.usesTeams && !S.me.teamId) {
      return `<div class="card stack center"><b>Tritt einem Team bei, um mitzuspielen:</b>
        <div class="row" style="justify-content:center">${S.teams.map((t) => `<button class="btn small" style="border-color:${t.color}" data-action="pickTeam" data-team="${t.id}">${esc(t.name)}</button>`).join('')}</div></div>`;
    }
    return '';
  }

  // ---------- Phasen ----------

  function viewPlace(R) {
    const unit = unitByKey(R, R.activeKey);
    if (!R.isMyTurn) {
      return `<div class="stack">
        <div class="music-card"><div class="note">🎵</div><h3 style="margin:8px 0 4px">${esc(unitName(R, R.activeKey))} ordnet ein …</h3><div>Der Song läuft beim Host.</div></div>
        ${viewTimeline(R, 'view')}
      </div>`;
    }
    const d = draft(R);
    return `<div class="stack">
      <div class="music-card"><div class="note">🎵</div><h3 style="margin:8px 0 4px">Du bist dran!</h3><div>Hör genau hin und tippe auf die Stelle, an die der Song passt.</div></div>
      ${viewTimeline(R, 'place')}
      <form id="mz-form" class="card stack" autocomplete="off">
        ${R.chipsEnabled ? `<div class="small muted">Optional: Interpret und Titel richtig nennen gibt einen Chip.</div>
          <div class="grid-2" style="gap:8px">
            <input id="mz-artist" type="text" maxlength="60" placeholder="Interpret" value="${esc(d.artist)}" spellcheck="false">
            <input id="mz-title" type="text" maxlength="60" placeholder="Titel" value="${esc(d.title)}" spellcheck="false">
          </div>` : ''}
        <button class="btn primary big" type="submit" ${R.slot === null ? 'disabled' : ''}>${R.slot === null ? 'Wähle eine Stelle' : 'Karte festlegen ✓'}</button>
        ${R.chipsEnabled ? `<div class="row" style="justify-content:center">
          <button class="btn small" type="button" data-action="mzSkip" ${unit.chips < 1 ? 'disabled' : ''}>⏭ Anderer Song (1 🪙)</button>
          <button class="btn small" type="button" data-action="mzBuy" ${unit.chips < S.game.buyCost ? 'disabled' : ''}>🎁 Karte kaufen (${S.game.buyCost} 🪙)</button>
        </div>` : ''}
      </form>
    </div>`;
  }

  function viewChallenge(R) {
    const name = esc(unitName(R, R.activeKey));
    const mine = R.myKey && R.challenges.find((c) => c.key === R.myKey);
    const canChallenge = R.waitingFor.includes(R.myKey);
    const waiting = R.waitingFor.length ? `<div class="small muted center">Warte auf ${R.waitingFor.map((k) => (k === R.myKey ? 'dich' : esc(unitName(R, k)))).join(', ')}</div>` : '';
    let head;
    if (canChallenge) {
      head = `<div class="notice">Glaubst du, ${name} liegt falsch? Tippe auf die Stelle, an die der Song gehört (kostet 1 🪙). Liegst du richtig, bekommst du die Karte.</div>
        <button class="btn" data-action="mzPass">Kein Einspruch</button>`;
    } else if (mine) {
      head = '<div class="notice">Dein Einspruch steht. Gleich wird aufgedeckt …</div>';
    } else if (R.isMyTurn) {
      head = '<div class="notice">Die anderen können jetzt Einspruch erheben …</div>';
    } else {
      head = `<div class="notice">${name} hat die Karte gelegt. Wer noch Chips hat, kann Einspruch erheben.</div>`;
    }
    return `<div class="stack">${head}${viewTimeline(R, canChallenge ? 'challenge' : 'view')}${waiting}</div>`;
  }

  function viewReveal(R) {
    const res = R.result;
    const name = esc(unitName(R, R.activeKey));
    let banner;
    if (res.bought) banner = { cls: 'good', icon: '🎁', text: `${name} hat die Karte gekauft.` };
    else if (res.correct) banner = { cls: 'good', icon: '🎉', text: `Richtig! ${name} behält die Karte.` };
    else if (res.winnerKey) banner = { cls: 'bad', icon: '🪙', text: `Daneben! Der Einspruch von ${esc(unitName(R, res.winnerKey))} war richtig, die Karte wandert dorthin.` };
    else banner = { cls: 'bad', icon: '😬', text: 'Daneben! Die Karte fliegt raus.' };
    const g = res.guess;
    const judgeable = S.me.isHost && g && R.chipsEnabled;
    return `<div class="stack">
      <div class="jo-outcome ${banner.cls}"><div style="font-size:2.4rem">${banner.icon}</div><b>${banner.text}</b></div>
      <div class="mz-reveal">${viewCard(R.song, 'new big')}</div>
      ${g ? `<div class="center">${name} tippte <b>${esc(g.artist || '?')} – ${esc(g.title || '?')}</b> ${res.guessOk ? '✓ (+1 🪙)' : '✗'}</div>` : ''}
      ${judgeable ? `<div class="row" style="justify-content:center"><span class="small muted">Interpret & Titel:</span>
        <span class="toggle"><button class="${res.guessOk ? 'on yes' : ''}" data-action="mzJudge" data-value="1">✓</button><button class="${!res.guessOk ? 'on no' : ''}" data-action="mzJudge" data-value="0">✗</button></span></div>` : ''}
      ${viewTimeline(R, 'view')}
    </div>`;
  }

  function viewFinal(R) {
    const top = R.ranking[0];
    const winner = top && top.cards >= R.target;
    return `<div class="stack">
      <div class="center"><div style="font-size:3rem">🏆</div><h1>${winner ? `${esc(unitName(R, top.key))} gewinnt!` : 'Keine Songs mehr!'}</h1>
        ${winner ? '' : '<p class="muted">Alle Songs sind gespielt. Es zählen die meisten Karten.</p>'}</div>
      <div class="card stack">${R.ranking.map((r, i) => {
        const u = unitByKey(R, r.key);
        return `<div class="stack" style="gap:6px"><div class="row spread"><span><b>${i + 1}.</b> ${unitLabel(R, r.key)}</span><span><b>${r.cards}</b> Karten${R.chipsEnabled ? ` · ${chips(r.chips)}` : ''}</span></div>
          <div class="mz-years">${u.cards.map((c) => `<span title="${esc(`${c.artist} – ${c.title}`)}">${c.year}</span>`).join('')}</div></div>`;
      }).join('')}</div>
      ${S.me.isHost ? '' : '<div class="muted center">Der Host kann eine neue Runde starten.</div>'}
    </div>`;
  }

  function view() {
    const R = S.round;
    if (R.phase === 'final') return viewFinal(R);
    const unit = unitByKey(R, R.activeKey);
    const body = { place: viewPlace, challenge: viewChallenge, reveal: viewReveal }[R.phase](R);
    return `<div>
      ${R.notice ? `<div class="notice">${esc(R.notice)}</div>` : ''}
      <div class="q-head">
        <div class="small muted"><b>Ziel: ${R.target} Karten</b> · noch ${R.deckLeft} Songs</div>
      </div>
      <div class="mz-turn">${unitLabel(R, R.activeKey)}<span class="small">${R.isMyTurn ? 'Du bist dran' : 'ist dran'} · <b>${unit.cards.length}/${R.target}</b>${R.chipsEnabled ? ` · ${chips(unit.chips)}` : ''}</span></div>
      ${viewNoUnit(R)}
      ${body}
      <div style="margin-top:20px">${viewOthers(R)}</div>
    </div>`;
  }

  function hostbar() {
    const R = S.round;
    if (R.phase === 'final') return '<button class="btn primary" data-action="toLobby">Neue Runde (zur Lobby)</button>';
    if (R.phase === 'reveal') {
      const done = R.units.some((u) => u.cards.length >= R.target) || !R.deckLeft;
      return `<button class="btn primary" data-action="next">${done ? '🏆 Zum Ergebnis' : 'Nächster Song ▶︎'}</button>`;
    }
    return `<button class="btn small" data-action="mzHostSkip" title="Zum Beispiel, wenn der Song nicht abspielt">⏭ Song tauschen</button>
      <button class="btn small" data-action="mzSkipTurn">Zug überspringen</button>
      ${R.phase === 'challenge' ? '<button class="btn pink" data-action="reveal">Aufdecken</button>' : ''}`;
  }

  // Nur auf dem Gerät des Hosts: Song bis zur Auflösung verdeckt abspielen
  function music(R) {
    if (!R || R.phase === 'final') return null;
    return { trackId: R.trackId || null, revealed: R.phase === 'reveal', previewUrl: R.previewUrl || null };
  }

  gameViews.musikzeitreise = { settings: viewSettings, view, hostbar, music };

  Object.assign(actions, {
    mzTeamMode: (el) => sendHost('settings', { game: { teamMode: el.dataset.value === '1' } }),
    mzChips: (el) => sendHost('settings', { game: { chips: el.dataset.value === '1' } }),
    mzPlace: (el) => act('place', { slot: Number(el.dataset.slot) }),
    mzChallenge: (el) => { if (confirm('Für 1 Chip Einspruch an dieser Stelle erheben?')) act('challenge', { slot: Number(el.dataset.slot) }); },
    mzPass: () => act('pass'),
    mzSkip: () => { if (confirm('Für 1 Chip einen anderen Song ziehen?')) act('skip'); },
    mzBuy: () => { if (confirm(`Für ${S.game.buyCost} Chips die Karte ohne Raten bekommen?`)) act('buy'); },
    mzJudge: (el) => act('judge', { ok: el.dataset.value === '1' }),
    mzHostSkip: () => { if (confirm('Diesen Song durch einen anderen ersetzen?')) act('hostSkip'); },
    mzSkipTurn: () => { if (confirm('Den Zug überspringen? Der Nächste ist dran.')) act('skipTurn'); },
  });

  app.addEventListener('input', (e) => {
    if (S?.game.id !== 'musikzeitreise' || !S.round) return;
    if (e.target.id === 'mz-artist') draft(S.round).artist = e.target.value;
    if (e.target.id === 'mz-title') draft(S.round).title = e.target.value;
  });

  app.addEventListener('change', (e) => {
    if (e.target.id === 'mz-target') sendHost('settings', { game: { targetCards: Number(e.target.value) } });
  });

  app.addEventListener('submit', (e) => {
    if (e.target.id !== 'mz-form') return;
    const R = S.round;
    act('confirm', draft(R));
    document.activeElement?.blur?.();
  });
})();
