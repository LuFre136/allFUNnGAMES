// Mäxchen: Spielansicht für Host und Handys (nutzt die Helfer aus lobby.js)

(() => {
  const LIVES = [1, 2, 3, 5, 7];
  const TIMES = [0, 15, 30, 60];
  const PASCH = { 1: 'Einerpasch', 2: 'Zweierpasch', 3: 'Dreierpasch', 4: 'Viererpasch', 5: 'Fünferpasch', 6: 'Sechserpasch' };
  // Augen auf einem 3×3-Raster
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const mx = {
    seenRoll: 0,
    rolling: false,
    selected: null, // angetippte Ansage, bis sie bestätigt wird
    peek: false, // Host-Gerät: Becher anheben, damit der Fernseher nichts verrät
    seenReveal: null,
    lifting: false,
  };

  function act(type, data = {}) {
    socket.emit('game:action', { type, ...data }, (res) => {
      if (res?.error) toast(res.error);
    });
  }

  function playerName(id) {
    return playerById(id)?.name || 'Jemand';
  }

  function rank(v) {
    if (v === 21) return 100;
    const hi = Math.floor(v / 10);
    return hi === v % 10 ? 70 + hi : v;
  }

  function label(v) {
    if (v === 21) return 'Mäxchen';
    const hi = Math.floor(v / 10);
    return hi === v % 10 ? PASCH[hi] : String(v);
  }

  function shortLabel(v) {
    if (v === 21) return 'Mäxchen';
    const hi = Math.floor(v / 10);
    return hi === v % 10 ? `${hi}er-Pasch` : String(v);
  }

  function hearts(lives, max) {
    if (max > 7) return `❤️ ${lives}`;
    return `${'❤️'.repeat(lives)}${'🖤'.repeat(Math.max(0, max - lives))}`;
  }

  // ---------- Lobby ----------

  function viewSettings() {
    const s = S.settings;
    const g = s.game;
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
      <div class="grid-2" style="gap:12px">
        <label class="field"><span>Leben pro Spieler</span>
          <select id="mx-lives">${LIVES.map((n) => `<option value="${n}" ${n === g.lives ? 'selected' : ''}>${n} Leben</option>`).join('')}</select>
        </label>
        <label class="field"><span>Zeit pro Zug</span>
          <select id="mx-time">${TIMES.map((t) => `<option value="${t}" ${t === g.timeLimit ? 'selected' : ''}>${t ? `${t} Sekunden` : 'Kein Zeitlimit'}</option>`).join('')}</select>
        </label>
      </div>
      <div>
        <div class="small muted" style="font-weight:700;margin-bottom:6px">Aufgedecktes Mäxchen</div>
        <div class="segmented">
          <button data-action="mxSetting" data-key="maexDouble" data-value="1" class="${g.maexDouble ? 'on' : ''}">💥 Kostet zwei Leben</button>
          <button data-action="mxSetting" data-key="maexDouble" data-value="0" class="${!g.maexDouble ? 'on' : ''}">Ein Leben</button>
        </div>
      </div>
      <div class="small muted">So geht's: Wer dran ist, würfelt verdeckt mit zwei Würfeln. Nur er sieht das Ergebnis auf seinem Handy und sagt einen Wert an, ehrlich oder geblufft. Jede Ansage muss höher sein als die vorige. Der höhere Würfel zählt als Zehner: 31 ist das Kleinste, dann 32, 41 … 65, darüber die Pasche (11 bis 66) und ganz oben das Mäxchen (2 und 1). Der Nächste glaubt die Ansage und würfelt selbst weiter, oder er deckt auf. Stimmt die Ansage (oder es liegt sogar mehr), verliert der Aufdecker ein Leben, sonst der Bluffer. Ein angesagtes Mäxchen kann man nur aufdecken oder glauben und aufgeben (ein Leben).${g.maexDouble ? ' Wird ein Mäxchen aufgedeckt, kostet es den Verlierer zwei Leben.' : ''} Wer verliert, beginnt die nächste Runde. Wer alle Leben los ist, scheidet aus, der Letzte gewinnt.${g.timeLimit ? ' Läuft die Zeit ab, würfelt das Spiel, sagt ehrlich an (oder knapp höher) bzw. glaubt die Ansage.' : ''}</div>
    </div>`;
  }

  // ---------- Spiel ----------

  function dieHtml(value, extra = '') {
    const pips = PIPS[value] || [];
    return `<span class="mx-die ${extra}">${Array.from({ length: 9 }, (_, k) => `<span class="${pips.includes(k) ? 'pip' : ''}"></span>`).join('')}</span>`;
  }

  function cupHtml(content = '', cls = '') {
    return `<div class="mx-cupzone ${cls}"><div class="mx-under">${content}</div><div class="mx-cup"><span>🎲</span></div></div>`;
  }

  function viewPlayers(R) {
    return `<div class="mx-players">${R.players.map((p) => {
      const player = playerById(p.id);
      const cls = [p.id === R.actorId ? 'active' : '', p.out ? 'out' : '', p.id === S.me.id ? 'me' : '', player?.connected === false ? 'offline' : ''].join(' ');
      return `<div class="mx-player ${cls}">${avatarHtml(player, 'sm')}<div class="mx-pname">${esc(player?.name || '?')}</div>
        <div class="mx-hearts">${p.out ? '💀 raus' : hearts(p.lives, R.maxLives)}</div></div>`;
    }).join('')}</div>`;
  }

  function viewHistory(R) {
    if (!R.history.length) return '';
    return `<div class="mx-history">${R.history.map((h) => `<span class="mx-hist">${esc(playerName(h.by))}: <b>${shortLabel(h.value)}</b>${h.believedBy ? ` <span class="muted">· ${esc(playerName(h.believedBy))} glaubt</span>` : ''}</span>`).join('')}</div>`;
  }

  function viewClaim(R) {
    if (!R.claim) return '<div class="mx-claim empty">Neue Runde, noch keine Ansage</div>';
    return `<div class="mx-claim ${R.claim.value === R.maexchen ? 'maex' : ''}">
      <div class="small">${avatarHtml(playerById(R.claim.by), 'sm')} ${esc(playerName(R.claim.by))} sagt</div>
      <div class="mx-claim-value">${label(R.claim.value)}</div>
    </div>`;
  }

  function viewStatus(R) {
    const id = R.actorId;
    const name = esc(playerName(id));
    const who = `${avatarHtml(playerById(id), 'sm')} ${name}`;
    let text;
    if (R.phase === 'roll') text = R.mine ? `${who} ist dran: würfeln! 🎲` : `${who} würfelt …`;
    else if (R.phase === 'announce') text = R.mine ? `${who}, was sagst du an?` : `${who} schaut unter den Becher …`;
    else if (R.phase === 'decide') text = R.mine ? `${who}: Glaubst du das?` : `${who} überlegt: glauben oder aufdecken?`;
    else text = R.mine ? `${who} beginnt die nächste Runde` : `Gleich beginnt ${name} die nächste Runde`;
    return `<div class="mx-status ${R.mine ? 'mine' : ''}">${text}</div>`;
  }

  function viewAnnounce(R) {
    const actual = Math.max(...R.myDice) * 10 + Math.min(...R.myDice);
    const min = R.claim ? rank(R.claim.value) : 0;
    if (mx.selected !== null && rank(mx.selected) <= min) mx.selected = null;
    const hostScreen = S.me.isHost;
    const dice = R.myDice.map((d) => dieHtml(d, mx.rolling ? 'rolling' : '')).join('');
    const showDice = !hostScreen || mx.peek;
    const cup = showDice
      ? `<div class="mx-mine"><div class="mx-dice">${dice}</div><div class="mx-actual">Du hast <b>${label(actual)}</b></div></div>`
      : '<div class="mx-mine"><div class="mx-cup small"><span>🎲</span></div></div>';
    const grid = R.values.map((v) => {
      const ok = rank(v) > min;
      const cls = [mx.selected === v ? 'on' : '', v === actual && showDice ? 'actual' : '', v === R.maexchen ? 'maex' : ''].join(' ');
      return `<button class="mx-value ${cls}" ${ok ? `data-action="mxPick" data-value="${v}"` : 'disabled'}>${shortLabel(v)}${v === actual && showDice ? '<small>dein Wurf</small>' : ''}</button>`;
    }).join('');
    const truth = mx.selected !== null && rank(actual) >= rank(mx.selected);
    const confirm = mx.selected !== null
      ? `<button class="btn primary big" data-action="mxAnnounce">📣 ${label(mx.selected)} ansagen ${showDice ? (truth ? '(ehrlich)' : '(Bluff!)') : ''}</button>`
      : `<div class="small muted center">${R.claim ? `Wähle eine Ansage über ${shortLabel(R.claim.value)}.` : 'Wähle, was du ansagst.'}</div>`;
    return `<div class="stack">
      ${cup}
      ${hostScreen ? `<button class="btn mx-peek" data-action="mxPeek">${mx.peek ? '🙈 Becher zu' : '👀 Unter den Becher schauen'}</button>` : ''}
      <div class="mx-grid">${grid}</div>
      ${confirm}
    </div>`;
  }

  function viewDecide(R) {
    const maex = R.claim.value === R.maexchen;
    if (!R.mine) return '';
    return `<div class="mx-decide">
      <button class="btn big ${maex ? '' : 'primary'}" data-action="mxBelieve">${maex ? '🏳️ Glauben und aufgeben (1 Leben)' : '👍 Glauben und weiterwürfeln'}</button>
      <button class="btn big pink" data-action="mxChallenge">🔍 Aufdecken!</button>
      <div class="small muted center">${maex ? 'Ein Mäxchen kann keiner überbieten.' : `Wer glaubt, muss mehr als ${shortLabel(R.claim.value)} ansagen.`}${maex && R.maexDouble ? ' Stimmt es beim Aufdecken, kostet das zwei Leben.' : ''}</div>
    </div>`;
  }

  function viewReveal(R) {
    const v = R.reveal;
    const loser = esc(playerName(v.loserId));
    const lost = v.lost === 2 ? 'zwei Leben' : 'ein Leben';
    let head;
    if (v.gaveUp) head = `${loser} glaubt ${esc(playerName(v.claim.by))} das Mäxchen und gibt auf. Der Becher bleibt zu.`;
    else if (v.claim.truth) head = `Kein Bluff! ${esc(playerName(v.claim.by))} sagte ${label(v.claim.value)} und hatte ${v.actual === v.claim.value ? 'genau das' : label(v.actual)}.`;
    else head = `Gelogen! ${esc(playerName(v.claim.by))} sagte ${label(v.claim.value)}, hatte aber nur ${label(v.actual)}.`;
    const dice = v.dice ? `<div class="mx-dice">${v.dice.map((d) => dieHtml(d)).join('')}</div>` : '<div class="mx-dice muted">?</div>';
    return `<div class="stack mx-reveal">
      ${cupHtml(dice, `${v.dice ? 'lifted' : ''} ${mx.lifting ? 'lifting' : ''}`)}
      <div class="mx-verdict ${v.claim.truth || v.gaveUp ? 'truth' : 'lie'}">
        <div class="mx-verdict-head">${head}</div>
        <div>${avatarHtml(playerById(v.loserId), 'sm')} <b>${loser}</b> verliert ${lost}${v.out ? ' und ist raus! 💀' : '.'}</div>
      </div>
    </div>`;
  }

  function viewTable(R) {
    let inner = '';
    if (R.phase === 'reveal') inner = viewReveal(R);
    else if (R.phase === 'announce' && R.myDice) inner = viewAnnounce(R);
    else inner = cupHtml('', mx.rolling ? 'shake' : '');
    let button = '';
    if (R.mine && (R.phase === 'roll' || R.phase === 'reveal')) {
      button = `<button class="btn primary big mx-roll" data-action="mxRoll">🎲 ${R.phase === 'reveal' ? 'Neue Runde würfeln' : 'Würfeln'}</button>`;
    }
    return `<div class="mx-table">
      ${R.phase !== 'reveal' ? viewClaim(R) : ''}
      ${inner}
      ${R.phase === 'decide' ? viewDecide(R) : ''}
      ${button}
    </div>`;
  }

  function viewLog(R) {
    if (!R.log.length) return '';
    return `<div class="mx-log">${[...R.log].reverse().slice(0, 5).map((l) => `<div>${esc(l.text)}</div>`).join('')}</div>`;
  }

  function viewPlaying(R) {
    return `<div class="stack">
      <div class="q-head">
        <div class="small muted"><b>Mäxchen</b> · Runde ${R.roundNo}</div>
        ${R.deadline ? '<span class="timer" id="timer"></span>' : ''}
      </div>
      ${viewStatus(R)}
      ${viewTable(R)}
      ${viewHistory(R)}
      ${viewPlayers(R)}
      ${viewLog(R)}
    </div>`;
  }

  function awards(R) {
    const ids = R.players.map((p) => p.id);
    const best = (fn, min = 1) => {
      const top = Math.max(...ids.map(fn));
      return top >= min ? { ids: ids.filter((id) => fn(id) === top), n: top } : null;
    };
    const list = [
      ['🤥', 'Bester Bluffer', 'unentdeckte Bluffs', best((id) => R.stats[id].lies - R.stats[id].caught)],
      ['🔍', 'Detektiv', 'Bluffs aufgedeckt', best((id) => R.stats[id].rightCalls)],
      ['🙈', 'Zu misstrauisch', 'zu Unrecht aufgedeckt', best((id) => R.stats[id].wrongCalls)],
      ['🍀', 'Glückspilz', 'echte Mäxchen gewürfelt', best((id) => R.stats[id].maexchen)],
    ];
    return list.filter((a) => a[3]).map(([icon, title, what, a]) => `<div class="score-row" style="--team:var(--accent)"><span class="rank">${icon}</span>
      <span class="name">${title}<div class="small muted">${a.ids.map((id) => esc(playerName(id))).join(', ')}</div></span><span class="small muted">${a.n} ${what}</span></div>`).join('');
  }

  function viewFinal(R) {
    const winner = R.ranking[0];
    const top = [R.ranking[1], R.ranking[0], R.ranking[2]].filter(Boolean);
    const heights = { [R.ranking[0]]: 140, [R.ranking[1]]: 100, [R.ranking[2]]: 70 };
    const list = awards(R);
    return `<div class="stack">
      <div class="center"><div style="font-size:3rem">🏆</div><h1>${esc(playerName(winner))} gewinnt!</h1></div>
      ${R.reveal ? viewReveal(R) : ''}
      <div class="podium">${top.map((id) => {
        const place = R.ranking.indexOf(id);
        return `<div class="step"><div>${avatarHtml(playerById(id))}</div><b>${esc(playerName(id))}</b>
          <div class="block" style="--team:var(--accent);height:${heights[id]}px">${place + 1}</div></div>`;
      }).join('')}</div>
      <div class="card stack">
        <h3 style="margin:0">Rangliste</h3>
        ${R.ranking.map((id, i) => `<div class="score-row" style="--team:var(--accent)"><span class="rank">${i + 1}.</span>${avatarHtml(playerById(id), 'sm')}
          <span class="name">${esc(playerName(id))}</span><span class="small muted">${i === 0 ? hearts(R.players.find((p) => p.id === id).lives, R.maxLives) : 'raus'}</span></div>`).join('')}
      </div>
      ${list ? `<div class="card stack"><h3 style="margin:0">Sonderpreise</h3>${list}</div>` : ''}
      ${S.me.isHost ? '' : '<div class="muted center">Der Host kann eine neue Runde starten.</div>'}
    </div>`;
  }

  function view() {
    const R = S.round;
    // Würfel nur einmal pro Wurf rollen lassen
    if (R.rollSeq !== mx.seenRoll) {
      mx.seenRoll = R.rollSeq;
      mx.selected = null;
      mx.peek = false;
      mx.rolling = R.rollSeq > 0;
      if (mx.rolling) setTimeout(() => { mx.rolling = false; document.querySelectorAll('.mx-die.rolling, .mx-cupzone.shake').forEach((d) => d.classList.remove('rolling', 'shake')); }, 700);
    }
    // Becher nur einmal pro Auflösung anheben
    const key = R.reveal ? `${R.roundNo}` : null;
    if (key !== mx.seenReveal) {
      mx.seenReveal = key;
      mx.lifting = !!key;
      if (mx.lifting) setTimeout(() => { mx.lifting = false; }, 900);
    }
    return R.phase === 'final' ? viewFinal(R) : viewPlaying(R);
  }

  function hostbar() {
    const R = S.round;
    if (R.phase === 'final') return '<button class="btn primary" data-action="toLobby">Neue Runde (zur Lobby)</button>';
    return `<button class="btn" data-action="mxForce">⏩ Für ${esc(playerName(R.actorId))} weiter</button>`;
  }

  gameViews.maexchen = { settings: viewSettings, view, hostbar };

  Object.assign(actions, {
    mxSetting: (el) => sendHost('settings', { game: { [el.dataset.key]: el.dataset.value === '1' } }),
    mxRoll: () => act('roll'),
    mxPick: (el) => {
      const v = Number(el.dataset.value);
      mx.selected = mx.selected === v ? null : v;
      render();
    },
    mxAnnounce: () => {
      const value = mx.selected;
      mx.selected = null;
      act('announce', { value });
    },
    mxPeek: () => { mx.peek = !mx.peek; render(); },
    mxBelieve: () => act('believe'),
    mxChallenge: () => act('challenge'),
    mxForce: () => {
      const R = S.round;
      const what = { roll: 'würfeln', announce: 'ansagen (ehrlich oder knapp höher)', decide: 'die Ansage glauben', reveal: 'die nächste Runde würfeln' }[R.phase];
      if (confirm(`Für ${playerName(R.actorId)} ${what}?`)) act('force');
    },
  });

  app.addEventListener('change', (e) => {
    if (S?.game.id !== 'maexchen') return;
    if (e.target.id === 'mx-lives') sendHost('settings', { game: { lives: Number(e.target.value) } });
    else if (e.target.id === 'mx-time') sendHost('settings', { game: { timeLimit: Number(e.target.value) } });
  });
})();
