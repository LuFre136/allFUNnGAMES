// Memekönig: Einstellungen und Spielansicht für Host und Handys (nutzt die Helfer aus lobby.js)

(() => {
  const mk = { joker: false, jokerText: '', jokerKey: null };

  function act(type, data = {}, done) {
    socket.emit('game:action', { type, ...data }, (res) => {
      if (res?.error) toast(res.error);
      done?.(res || {});
    });
  }

  function setGame(patch) {
    sendHost('settings', { game: patch });
  }

  function playerName(id) {
    return playerById(id)?.name || 'Jemand';
  }

  function names(ids) {
    const list = ids.map((id) => esc(playerName(id)));
    return list.length > 1 ? `${list.slice(0, -1).join(', ')} und ${list[list.length - 1]}` : list[0] || '';
  }

  // ---------- Einstellungen ----------

  function viewSettings() {
    const s = S.settings;
    const g = s.game;
    const meta = S.game;
    const modes = [['judge', '👑 Juror reihum'], ['vote', '🗳 Alle stimmen ab']];
    const sources = [['both', '🖼 Beide'], ['wiki', '📚 Wikipedia'], ['local', '📁 Eigene']];
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
        <div class="small muted" style="margin-top:6px">Läuft dein Bildschirm auf dem Fernseher, wähle „Nur Gamemaster“ und tritt zum Mitspielen zusätzlich mit dem Handy bei. Sonst sehen alle deine Karten.</div>
      </div>
      <div>
        <div class="small muted" style="font-weight:700;margin-bottom:6px">Wer entscheidet?</div>
        <div class="segmented">${modes.map(([v, label]) => `<button data-action="mkMode" data-value="${v}" class="${g.mode === v ? 'on' : ''}">${label}</button>`).join('')}</div>
        <div class="small muted" style="margin-top:6px">${g.mode === 'judge'
          ? 'Wie im Original: Jede Runde ist ein anderer Spieler Juror, legt selbst nicht und wählt die lustigste Karte. Sie bringt 1 Punkt.'
          : 'Alle stimmen für die lustigste fremde Karte. Jede Stimme bringt 1 Punkt.'}</div>
      </div>
      <div>
        <div class="small muted" style="font-weight:700;margin-bottom:6px">Bilder (${S.availableQuestions} verfügbar)</div>
        <div class="segmented">${sources.map(([v, label]) => `<button data-action="mkSource" data-value="${v}" class="${g.source === v ? 'on' : ''}">${label}</button>`).join('')}</div>
        <div class="small muted" style="margin-top:6px">${meta.imageCounts.wiki} freie Bilder von Wikipedia (komische Tiere und berühmte Gemälde) und ${meta.imageCounts.local} eigene aus dem Ordner <code>public/meme-images</code>.</div>
      </div>
      ${!S.availableQuestions ? '<div class="small" style="color:var(--accent)">Für diese Auswahl gibt es keine Bilder.</div>' : ''}
      <div class="grid-2" style="gap:12px">
        <label class="field"><span>Runden</span>
          <select id="mk-rounds">${meta.roundOptions.map((n) => `<option value="${n}" ${n === g.rounds ? 'selected' : ''}>${n} Bilder</option>`).join('')}</select>
        </label>
        <label class="field"><span>Zeit zum Legen</span>
          <select id="mk-time">${meta.playTimes.map((t) => `<option value="${t}" ${t === g.playTime ? 'selected' : ''}>${t ? `${t} Sekunden` : 'Kein Zeitlimit'}</option>`).join('')}</select>
        </label>
      </div>
      <div>
        <div class="small muted" style="font-weight:700;margin-bottom:6px">Joker-Karten pro Spieler</div>
        <div class="segmented">${[0, 1, 2, 3].map((n) => `<button data-action="mkJokers" data-value="${n}" class="${g.jokers === n ? 'on' : ''}">${n ? `✏️ ${n}` : 'Keine'}</button>`).join('')}</div>
        <div class="small muted" style="margin-top:6px">Auf einen Joker schreibt man selbst eine Bildunterschrift.</div>
      </div>
      <div class="small muted">So geht's: Auf dem Fernseher erscheint ein Bild. Jeder hat ${7} Bildunterschriften auf dem Handy (${meta.captionCount} Karten im Stapel) und legt die, die am besten passt. Dann werden alle Karten ohne Namen gezeigt und die lustigste gewinnt. Einmal pro Spiel darf jeder seine Hand tauschen. Für 3 bis 12 Spieler.</div>
    </div>`;
  }

  // ---------- Spielansicht ----------

  function myPoints(R) {
    return R.ranking.find((r) => r.id === S.me.id)?.points ?? 0;
  }

  function viewHead(R) {
    const judge = R.judge ? `${avatarHtml(playerById(R.judge), 'sm')} Juror: <b>${esc(R.judge === S.me.id ? 'Du' : playerName(R.judge))}</b>` : '🗳 Alle stimmen ab';
    return `<div class="q-head">
      <div class="small muted"><b>Bild ${R.index + 1}/${R.total}</b> · <span class="mk-judge">${judge}</span>${R.playing ? ` · 👑 ${myPoints(R)}` : ''}</div>
      ${R.deadline ? '<span class="timer" id="timer"></span>' : ''}
    </div>`;
  }

  function imageHtml(img, cls = '') {
    if (!img) return '';
    const failed = imageErrors.has(img.url);
    return `<figure class="mk-figure ${cls}">
      ${failed
        ? `<div class="mk-fallback"><div style="font-size:3rem">🖼</div><div>${esc(img.text)}</div><div class="small muted">Bild konnte nicht geladen werden.</div></div>`
        : `<img class="mk-img" src="${esc(img.url)}" alt="${esc(img.text)}" data-image-src="${esc(img.url)}">`}
      ${img.credit ? `<figcaption class="small muted">${esc(img.credit)}</figcaption>` : ''}
    </figure>`;
  }

  function progress(R) {
    const done = new Set(R.played);
    return `<div class="mk-progress">${R.layers.map((id) => `<span class="mk-who ${done.has(id) ? 'done' : ''}">${avatarHtml(playerById(id))}<span>${done.has(id) ? '🃏' : '⏳'}</span></span>`).join('')}</div>`;
  }

  function jokerForm(R) {
    const key = `${R.index}:${R.image?.id}`;
    if (mk.jokerKey !== key) {
      mk.jokerKey = key;
      mk.joker = false;
      mk.jokerText = '';
    }
    if (!mk.joker) return '';
    return `<form id="mk-joker-form" class="card stack" autocomplete="off">
      <label class="field"><span>Deine eigene Bildunterschrift</span>
        <textarea id="mk-joker-text" maxlength="100" rows="2" placeholder="Wenn …">${esc(mk.jokerText)}</textarea>
      </label>
      <div class="row"><button class="btn primary" type="submit">✏️ Joker legen</button><button class="btn ghost" type="button" data-action="mkJokerClose">Abbrechen</button></div>
    </form>`;
  }

  function handHtml(R) {
    const chosen = R.myPlay?.card;
    const cards = R.hand.map((c) => `<button class="mk-card ${c.card === chosen ? 'chosen' : ''}" data-action="mkPlay" data-card="${c.card}">${esc(c.text)}</button>`).join('');
    const joker = R.jokers ? `<button class="mk-card joker ${R.myPlay?.joker ? 'chosen' : ''}" data-action="mkJoker">✏️ Joker<br><span class="small">selbst schreiben (${R.jokers} übrig)</span></button>` : '';
    return `<div class="mk-hand">${cards}${joker}</div>`;
  }

  function viewPlay(R) {
    const me = S.me.id;
    let body;
    if (!R.playing) {
      body = `<p class="center muted">Alle suchen die lustigste Bildunterschrift aus …</p>${progress(R)}`;
    } else if (R.judge === me) {
      body = `<div class="mk-banner">👑 Du bist diese Runde Juror. Lehn dich zurück, gleich wählst du die lustigste Karte.</div>${progress(R)}`;
    } else {
      const status = R.myPlay
        ? `<div class="notice">✅ Gelegt: <b>${esc(R.myPlay.text)}</b><br><span class="small">Du kannst noch eine andere Karte antippen, bis alle fertig sind.</span></div>`
        : '<div class="small muted center">Tippe auf die Karte, die am besten zum Bild passt.</div>';
      body = `${status}${jokerForm(R)}${handHtml(R)}
        <div class="row" style="justify-content:center">${R.canSwap ? '<button class="btn small ghost" data-action="mkSwap">🔄 Ganze Hand tauschen (einmal pro Spiel)</button>' : ''}</div>
        ${progress(R)}`;
    }
    return `<div class="stack">
      ${viewHead(R)}
      ${R.notice ? `<div class="notice">${esc(R.notice)}</div>` : ''}
      ${imageHtml(R.image, R.playing ? 'small' : '')}
      ${body}
    </div>`;
  }

  function canChoose(R, entry) {
    if (R.mode === 'judge') return R.judge === S.me.id || (S.me.isHost && R.judgeGone);
    return R.playing && !entry.mine;
  }

  function viewPick(R) {
    const judgeMode = R.mode === 'judge';
    const chooser = R.entries.some((e) => canChoose(R, e));
    let hint;
    if (judgeMode) {
      hint = R.judge === S.me.id
        ? '👑 Du bist Juror: Tippe auf die lustigste Karte.'
        : R.judgeGone && S.me.isHost
          ? `${esc(playerName(R.judge))} ist weg. Wähle du die lustigste Karte.`
          : `${avatarHtml(playerById(R.judge), 'sm')} <b>${esc(playerName(R.judge))}</b> wählt die lustigste Karte …`;
    } else {
      hint = R.playing
        ? R.myVote ? '✅ Abgestimmt. Du kannst deine Stimme noch ändern.' : '🗳 Stimme für die lustigste Karte (nicht deine eigene).'
        : `Alle stimmen ab … ${R.voted.length}/${R.players.length}`;
    }
    const cards = R.entries.map((e) => {
      const clickable = canChoose(R, e);
      const tag = clickable ? 'button' : 'div';
      return `<${tag} class="mk-entry ${e.mine ? 'mine' : ''} ${R.myVote === e.key ? 'chosen' : ''}" ${clickable ? `data-action="mkChoose" data-key="${e.key}"` : ''}>
        ${esc(e.text)}${e.mine ? '<span class="mk-tag">deine</span>' : ''}</${tag}>`;
    }).join('');
    return `<div class="stack">
      ${viewHead(R)}
      <div class="mk-stage ${chooser ? 'phone' : ''}">
        ${imageHtml(R.image, chooser ? 'small' : '')}
        <div class="stack">
          <div class="mk-banner ${chooser ? 'me' : ''}">${hint}</div>
          <div class="mk-entries">${cards}</div>
        </div>
      </div>
    </div>`;
  }

  function viewResult(R) {
    if (!R.last) {
      return `<div class="stack">${viewHead(R)}<div class="notice">${esc(R.notice || 'Diese Runde wurde übersprungen.')}</div>
        ${imageHtml(R.image)}
        ${S.me.isHost ? '' : '<div class="small muted center">Der Host startet das nächste Bild.</div>'}</div>`;
    }
    const winners = R.entries.filter((e) => R.winners.includes(e.key));
    const others = R.entries.filter((e) => !R.winners.includes(e.key));
    const entry = (e, win) => `<div class="mk-entry ${win ? 'win' : ''}">
      <div>${esc(e.text)}</div>
      <div class="mk-owner">${avatarHtml(playerById(e.playerId), 'sm')} ${esc(playerName(e.playerId))}${e.joker ? ' · ✏️ Joker' : ''}${R.mode === 'vote' ? ` · 🗳 ${e.votes}` : ''}</div>
    </div>`;
    const title = winners.length
      ? `👑 ${names(winners.map((e) => e.playerId))} ${winners.length > 1 ? 'gewinnen' : 'gewinnt'} die Runde!`
      : R.mode === 'vote' ? 'Keine Stimmen, kein Punkt.' : 'Der Juror war weg, keine Punkte.';
    return `<div class="stack">
      ${viewHead(R)}
      <div class="mk-title">${title}</div>
      <div class="mk-stage">
        ${imageHtml(R.image)}
        <div class="stack">
          ${winners.map((e) => entry(e, true)).join('')}
          <div class="mk-entries">${others.map((e) => entry(e, false)).join('')}</div>
        </div>
      </div>
      ${viewScores(R)}
      ${S.me.isHost ? '' : '<div class="small muted center">Der Host startet das nächste Bild.</div>'}
    </div>`;
  }

  function quoted(text) {
    return text.startsWith('„') ? text : `„${text}“`;
  }

  function places(ranking) {
    return ranking.map((r) => ({ ...r, place: ranking.filter((o) => o.points > r.points).length + 1 }));
  }

  function viewScores(R) {
    return `<div class="scoreboard">${places(R.ranking).map((r) => {
      const plus = R.points?.[r.id] ? `<span class="small" style="color:var(--good);font-weight:800">+${R.points[r.id]}</span>` : '';
      return `<div class="score-row" style="--team:var(--accent)"><span class="rank">${r.place}.</span>${avatarHtml(playerById(r.id), 'sm')}<span class="name">${esc(playerName(r.id))}</span>${plus}<span class="pts">${r.points}</span></div>`;
    }).join('')}</div>`;
  }

  function viewFinal(R) {
    const ranked = places(R.ranking);
    const kings = ranked.filter((r) => r.place === 1 && r.points > 0);
    const title = !kings.length ? 'Spiel beendet' : kings.length === 1 ? `${esc(playerName(kings[0].id))} ist Memekönig!` : `${names(kings.map((k) => k.id))} teilen sich die Krone!`;
    const top = [ranked[1], ranked[0], ranked[2]].filter(Boolean);
    const heights = { 1: 140, 2: 100, 3: 70 };
    const gallery = (R.history || []).filter((h) => h && h.winners.length).map((h) => `<div class="card mk-gallery-item">
      ${imageHtml(h.image, 'small')}
      ${h.winners.map((w) => `<div class="mk-gallery-text">${esc(quoted(w.text))}<div class="small muted">${avatarHtml(playerById(w.playerId), 'sm')} ${esc(playerName(w.playerId))}</div></div>`).join('')}
    </div>`).join('');
    return `<div class="stack">
      <div class="center"><div style="font-size:3rem">👑</div><h1>${title}</h1></div>
      <div class="podium">${top.map((t) => `<div class="step"><div>${avatarHtml(playerById(t.id))}</div><b>${esc(playerName(t.id))}</b>
        <div class="small muted">${t.points === 1 ? '1 Punkt' : `${t.points} Punkte`}</div>
        <div class="block" style="--team:var(--accent);height:${heights[t.place] ?? 70}px">${t.place}</div></div>`).join('')}</div>
      ${viewScores(R)}
      ${gallery ? `<h3 style="margin:8px 0 0">Die besten Karten</h3><div class="mk-gallery">${gallery}</div>` : ''}
      ${S.me.isHost ? '' : '<div class="muted center">Der Host kann eine neue Runde starten.</div>'}
    </div>`;
  }

  function view() {
    const R = S.round;
    if (R.phase === 'final') return `<div>${viewFinal(R)}</div>`;
    const body = { play: viewPlay, pick: viewPick, result: viewResult }[R.phase];
    return `<div>${body(R)}</div>`;
  }

  function hostbar() {
    const R = S.round;
    if (R.phase === 'final') return '<button class="btn primary" data-action="toLobby">Neue Runde (zur Lobby)</button>';
    if (R.phase === 'play') {
      return `${R.canSkipImage ? '<button class="btn ghost" data-action="mkSkipImage">🔄 Anderes Bild</button>' : ''}
        <button class="btn pink" data-action="mkNext">⏭ Zur Auswahl</button>`;
    }
    if (R.phase === 'pick') {
      if (R.mode === 'vote') return '<button class="btn pink" data-action="mkNext">⏭ Abstimmung beenden</button>';
      return R.judgeGone ? '<button class="btn ghost" data-action="mkNext">⏭ Ohne Gewinner weiter</button>' : '';
    }
    return `<button class="btn primary" data-action="mkNext">${R.index + 1 >= R.total ? '👑 Zum Ergebnis' : 'Nächstes Bild ▶︎'}</button>`;
  }

  gameViews.memekoenig = { settings: viewSettings, view, hostbar };

  // ---------- Eingaben ----------

  Object.assign(actions, {
    mkMode: (el) => setGame({ mode: el.dataset.value }),
    mkSource: (el) => setGame({ source: el.dataset.value }),
    mkJokers: (el) => setGame({ jokers: Number(el.dataset.value) }),
    mkPlay: (el) => {
      mk.joker = false;
      act('play', { card: Number(el.dataset.card) });
    },
    mkJoker: () => {
      mk.joker = true;
      if (!mk.jokerText && S.round.myPlay?.joker) mk.jokerText = S.round.myPlay.text;
      render();
      document.getElementById('mk-joker-text')?.focus();
    },
    mkJokerClose: () => { mk.joker = false; render(); },
    mkSwap: () => { if (confirm('Alle sieben Karten abwerfen und neue ziehen? Das geht nur einmal pro Spiel.')) act('swap'); },
    mkChoose: (el) => act('choose', { key: el.dataset.key }),
    mkSkipImage: () => act('skipImage'),
    mkNext: () => act('next'),
  });

  app.addEventListener('input', (e) => {
    if (e.target.id === 'mk-joker-text') mk.jokerText = e.target.value;
  });

  app.addEventListener('change', (e) => {
    if (S?.game.id !== 'memekoenig') return;
    if (e.target.id === 'mk-rounds') setGame({ rounds: Number(e.target.value) });
    else if (e.target.id === 'mk-time') setGame({ playTime: Number(e.target.value) });
  });

  app.addEventListener('submit', (e) => {
    if (e.target.id !== 'mk-joker-form') return;
    const text = mk.jokerText.trim();
    if (!text) return toast('Schreib erst etwas auf deinen Joker.');
    act('play', { joker: true, text }, (res) => {
      if (!res.ok) return;
      mk.joker = false;
      document.activeElement?.blur?.();
      render();
    });
  });
})();
