// Lobby und Spielansicht für Host und Spieler

const code = decodeURIComponent(location.pathname.split('/').pop() || '').toUpperCase();
const tokenKey = `afng:token:${code}`;
const socket = io();
const app = document.getElementById('app');

let S = null; // Zustand vom Server
let joinInfo = null; // Lobby-Infos für das Beitrittsformular
let fatal = null; // Fehlermeldung, die die Seite ersetzt
let avatars = [];
let serverInfo = {};
let clockOffset = 0;

const ui = {
  profile: null, // Entwurf für Name, Profilbild und Team
  editProfile: false,
  showSolution: false,
  questionKey: null,
};
const drafts = {}; // Eingaben pro Frage, damit beim Neuzeichnen nichts verloren geht
const imageErrors = new Set();

// Spiele mit eigener Spielansicht tragen sich hier ein (siehe justone.js)
const gameViews = {};

function customGame() {
  return S ? gameViews[S.game.id] || null : null;
}

function usesTeams() {
  return S ? S.usesTeams : !!joinInfo?.teams.length;
}

const PART_LABELS = { main: 'Antwort', artist: 'Interpret', title: 'Titel', year: 'Jahr' };
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const TIME_LIMITS = [0, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300];

function timeOptions(selected) {
  return TIME_LIMITS.map((t) => `<option value="${t}" ${t === selected ? 'selected' : ''}>${!t ? 'Kein Zeitlimit' : t % 60 === 0 && t >= 120 ? `${t / 60} Minuten` : `${t} Sekunden`}</option>`).join('');
}

// ---------- Verbindung ----------

socket.on('connect', join);
socket.on('state', (state) => {
  S = state;
  joinInfo = null;
  if (S.round) clockOffset = S.round.serverNow - Date.now();
  document.title = `${S.settings.lobbyName} · all Fun n Games`;
  render();
});
socket.on('kicked', () => {
  store.remove(tokenKey);
  fatal = 'Du wurdest vom Host aus der Lobby entfernt.';
  S = null;
  render();
});
socket.on('replaced', () => {
  fatal = 'Diese Lobby ist jetzt in einem anderen Tab oder Gerät geöffnet.';
  S = null;
  socket.disconnect();
  render();
});

async function join() {
  const res = await emitAck(socket, 'lobby:join', { code, token: store.get(tokenKey) });
  if (res.error) {
    fatal = res.error;
    render();
  } else if (res.needsProfile) {
    joinInfo = res.lobby;
    S = null;
    if (!ui.profile) {
      ui.profile = {
        name: store.get('afng:name') || '',
        avatar: avatars.length ? avatars[Math.floor(Math.random() * avatars.length)] : null,
        teamId: null,
      };
    }
    render();
  }
}

function sendHost(action, data = {}) {
  socket.emit('host', { action, ...data }, (res) => {
    if (res?.error) toast(res.error);
  });
}

function vote(value) {
  socket.emit('vote', value, (res) => {
    if (res?.error) toast(res.error);
  });
}

// ---------- Helfer ----------

function playerById(id) {
  return S?.players.find((p) => p.id === id) || null;
}

function teamById(id) {
  return S?.teams.find((t) => t.id === id) || null;
}

function colorFor(text) {
  let h = 0;
  for (const c of String(text)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 65% 45%)`;
}

function avatarHtml(p, cls = '') {
  if (!p) return '';
  const title = esc(p.name);
  if (p.avatar) return `<img class="avatar ${cls}" src="${esc(p.avatar)}" alt="${title}" title="${title}">`;
  return `<span class="avatar ${cls}" style="background:${colorFor(p.name)}" title="${title}">${esc((p.name || '?')[0].toUpperCase())}</span>`;
}

// Bis zu drei Profilbilder, danach „+N“
function avatarStack(ids) {
  const players = ids.map(playerById).filter(Boolean);
  if (!players.length) return '';
  const more = players.length - 3;
  return `<span class="stack-avatars">${players.slice(0, 3).map((p) => avatarHtml(p, 'sm')).join('')}${more > 0 ? `<span class="more">+${more}</span>` : ''}</span>`;
}

function joinUrl() {
  const local = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
  const base = serverInfo.publicUrl || (local && serverInfo.lanUrl ? serverInfo.lanUrl : location.origin);
  return `${base.replace(/\/$/, '')}/join/${code}`;
}

function fmtNumber(n) {
  return Number(n).toLocaleString('de-DE');
}

function formatValue(q, v) {
  if (v === null || v === undefined) return '';
  switch (q.type) {
    case 'choice': return `${LETTERS[v]}: ${q.options[v]}`;
    case 'estimate': return `${fmtNumber(v)}${q.unit ? ' ' + q.unit : ''}`;
    case 'music-title': return `${v.artist || '?'} – ${v.title || '?'}`;
    case 'music-year': return `${v.artist || '?'} · ${v.year ?? '?'}`;
    default: return String(v);
  }
}

function formatSolution(q, s) {
  switch (q.type) {
    case 'choice': return `${LETTERS[s.index]}: ${esc(s.text)}`;
    case 'estimate': return `${fmtNumber(s.value)}${s.unit ? ' ' + s.unit : ''} <span class="muted small">(richtig ist alles von ${fmtNumber(s.value - s.tolerance)} bis ${fmtNumber(s.value + s.tolerance)})</span>`;
    case 'music-title':
    case 'music-year': return `${esc(s.artist)} – ${esc(s.title)} <span class="muted">(${s.year})</span>`;
    default: return esc(s.text);
  }
}

function voteGroups(votes) {
  const groups = new Map();
  for (const v of votes || []) {
    if (!groups.has(v.key)) groups.set(v.key, { key: v.key, value: v.value, ids: [] });
    groups.get(v.key).ids.push(v.playerId);
  }
  const list = [...groups.values()].sort((a, b) => b.ids.length - a.ids.length);
  const max = list.length ? list[0].ids.length : 0;
  return { list, leaders: new Set(list.filter((g) => g.ids.length === max).map((g) => g.key)) };
}

function isGamemaster() {
  return S.me.isHost && !S.settings.hostPlays;
}

// ---------- Ansichten ----------

function viewFatal() {
  return `<div class="card center stack" style="max-width:520px;margin:40px auto">
    <div style="font-size:3rem">😕</div>
    <h2>${esc(fatal)}</h2>
    <a class="btn primary" href="/">Zur Startseite</a>
  </div>`;
}

function avatarPicker(selected, action = 'pickAvatar') {
  if (!avatars.length) return '<p class="muted small">Keine Profilbilder vorhanden.</p>';
  return `<div class="avatar-grid">${avatars.map((src) => `
    <button type="button" class="avatar-pick ${src === selected ? 'selected' : ''}" data-action="${action}" data-src="${esc(src)}">
      <img src="${esc(src)}" alt="Profilbild">
    </button>`).join('')}</div>`;
}

function teamPicker(teams, selected, membersOf) {
  return `<div class="teams">${teams.map((t) => {
    const members = membersOf(t.id);
    return `<button type="button" class="team ${t.id === selected ? 'mine' : ''}" style="--team:${t.color};text-align:left;cursor:pointer;color:inherit;font:inherit" data-action="pickTeam" data-team="${t.id}">
      <div class="team-head"><span class="team-dot"></span><span class="team-name">${esc(t.name)}</span>${t.id === selected ? '✓' : ''}</div>
      <div class="small muted">${members.length ? members.map((m) => esc(m.name)).join(', ') : 'Noch leer'}</div>
    </button>`;
  }).join('')}
    <button type="button" class="team ${selected === 'random' ? 'mine' : ''}" style="--team:var(--accent);text-align:left;cursor:pointer;color:inherit;font:inherit" data-action="pickTeam" data-team="random">
      <div class="team-head"><span class="team-name">🎲 Zufälliges Team</span>${selected === 'random' ? '✓' : ''}</div>
      <div class="small muted">Füllt das kleinste Team auf</div>
    </button></div>`;
}

function profileFields({ withTeam, teams, membersOf }) {
  const p = ui.profile;
  return `
    <label class="field"><span>Dein Name</span>
      <input id="profile-name" type="text" maxlength="24" value="${esc(p.name)}" placeholder="z. B. Anna" autocomplete="nickname">
    </label>
    <div><div class="small muted" style="font-weight:700;margin-bottom:6px">Profilbild</div>${avatarPicker(p.avatar)}</div>
    ${withTeam ? `<div><div class="small muted" style="font-weight:700;margin-bottom:6px">Team</div>${teamPicker(teams, p.teamId, membersOf)}</div>` : ''}`;
}

function viewJoin() {
  const info = joinInfo;
  return `<form class="card stack" id="join-form" style="max-width:640px;margin:0 auto">
    <div class="small muted">${esc(info.game)} · Lobby ${esc(info.code)}</div>
    <h2>${esc(info.name)}</h2>
    ${profileFields({ withTeam: usesTeams(), teams: info.teams, membersOf: (id) => info.teams.find((t) => t.id === id)?.members || [] })}
    <button class="btn primary big" type="submit">Beitreten</button>
  </form>`;
}

function viewProfileModal() {
  const gm = isGamemaster();
  return `<div class="modal-backdrop">
    <form class="card modal stack" id="profile-form" style="width:min(640px,100%);max-height:90vh;overflow:auto">
      <h2>Dein Profil</h2>
      ${profileFields({ withTeam: !gm && usesTeams(), teams: S.teams, membersOf: (id) => S.players.filter((p) => p.teamId === id) })}
      <div class="row">
        <button type="button" class="btn ghost" data-action="closeProfile">Abbrechen</button>
        <button type="submit" class="btn primary" style="flex:1">Speichern</button>
      </div>
    </form>
  </div>`;
}

function viewTopInfo() {
  if (!S) return '';
  return `<span class="code-pill" title="Lobby-Code">${esc(S.code)}</span>
    <button class="btn small" data-action="editProfile" title="Profil bearbeiten">${avatarHtml(S.me, 'sm')} ${esc(S.me.name)}</button>`;
}

function viewShare() {
  const url = joinUrl();
  return `<div class="card stack">
    <h3>Spieler einladen</h3>
    <div class="row" style="align-items:flex-start;gap:16px">
      <div class="qr"><img src="/api/qr?text=${encodeURIComponent(url)}" alt="QR-Code zum Beitreten"></div>
      <div class="stack" style="flex:1;min-width:200px">
        <div class="link-box">${esc(url)}</div>
        <div class="row">
          <button class="btn small primary" data-action="copyLink">Link kopieren</button>
          ${navigator.share ? '<button class="btn small" data-action="shareLink">Teilen …</button>' : ''}
        </div>
        <div class="small muted">Oder auf der Startseite den Code <b>${esc(S.code)}</b> eingeben.</div>
      </div>
    </div>
  </div>`;
}

function viewTeams() {
  const me = S.me;
  const host = me.isHost;
  const gm = isGamemaster();
  const visiblePlayers = S.players.filter((p) => !(p.isHost && !S.settings.hostPlays));
  const noTeam = visiblePlayers.filter((p) => !p.teamId || !teamById(p.teamId));
  return `<div class="card stack">
    <div class="row spread"><h3 style="margin:0">Teams</h3>${host ? '<button class="btn small" data-action="addTeam">+ Team</button>' : ''}</div>
    ${!gm && !me.teamId ? '<div class="small" style="color:var(--accent);font-weight:800">Wähle ein Team, um mitzuspielen.</div>' : ''}
    <div class="teams">${S.teams.map((t) => {
      const members = visiblePlayers.filter((p) => p.teamId === t.id);
      return `<div class="team ${me.teamId === t.id && !gm ? 'mine' : ''}" style="--team:${t.color}">
        <div class="team-head">
          <span class="team-dot"></span>
          <span class="team-name">${host ? `<input type="text" id="team-name-${t.id}" data-team="${t.id}" value="${esc(t.name)}" maxlength="24">` : esc(t.name)}</span>
          ${host && S.teams.length > 1 ? `<button class="btn small icon ghost" data-action="removeTeam" data-team="${t.id}" title="Team löschen">🗑</button>` : ''}
        </div>
        ${members.map((p) => `<div class="member ${p.connected ? '' : 'offline'}">${avatarHtml(p, 'sm')}<span class="name">${esc(p.name)}${p.isHost ? ' 👑' : ''}${p.id === me.id ? ' (du)' : ''}</span>
          ${host && !p.isHost ? `<button class="btn small icon ghost" data-action="kick" data-player="${p.id}" title="Entfernen">✕</button>` : ''}</div>`).join('') || '<div class="small muted">Noch niemand</div>'}
        ${!gm && me.teamId !== t.id ? `<button class="btn small" style="margin-top:8px;width:100%" data-action="joinTeam" data-team="${t.id}">Beitreten</button>` : ''}
      </div>`;
    }).join('')}</div>
    ${!gm ? '<button class="btn small" data-action="joinTeam" data-team="random">🎲 Zufälligem Team beitreten</button>' : ''}
    ${noTeam.length ? `<div class="small muted">Ohne Team: ${noTeam.map((p) => esc(p.name)).join(', ')}</div>` : ''}
  </div>`;
}

// Für Spiele ohne Teams: einfache Liste aller Mitspieler
function viewPlayers() {
  const me = S.me;
  const visiblePlayers = S.players.filter((p) => !(p.isHost && !S.settings.hostPlays));
  return `<div class="card stack">
    <h3 style="margin:0">Mitspieler (${visiblePlayers.length})</h3>
    <div>${visiblePlayers.map((p) => `<div class="member ${p.connected ? '' : 'offline'}">${avatarHtml(p, 'sm')}<span class="name">${esc(p.name)}${p.isHost ? ' 👑' : ''}${p.id === me.id ? ' (du)' : ''}</span>
      ${me.isHost && !p.isHost ? `<button class="btn small icon ghost" data-action="kick" data-player="${p.id}" title="Entfernen">✕</button>` : ''}</div>`).join('')}</div>
  </div>`;
}

function selectedTypes() {
  return S.settings.game.types || S.game.types.map((t) => t.id);
}

function viewSettings() {
  const s = S.settings;
  const g = s.game;
  const cats = S.game.categories;
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
      <label class="field"><span>Anzahl Fragen (${S.availableQuestions} verfügbar)</span>
        <input id="set-count" type="number" min="1" max="${S.game.totalQuestions}" value="${g.questionCount}" inputmode="numeric">
      </label>
      <label class="field"><span>Zeitlimit pro Frage</span>
        <select id="set-time">${timeOptions(g.timeLimit)}</select>
      </label>
      <label class="field"><span>Zeitlimit für Musikfragen</span>
        <select id="set-music-time">${timeOptions(g.musicTimeLimit ?? 180)}</select>
      </label>
    </div>
    ${g.questionCount > S.availableQuestions ? `<div class="small" style="color:var(--accent)">Für die gewählten Kategorien und Fragenformate gibt es nur ${S.availableQuestions} Fragen. Es werden alle gespielt.</div>` : ''}
    <div>
      <div class="row spread" style="margin-bottom:6px"><span class="small muted" style="font-weight:700">Kategorien</span>
        <span class="row"><button class="btn small ghost" data-action="allCats">Alle</button><button class="btn small ghost" data-action="noCats">Keine</button></span></div>
      <div class="chips">${cats.map((c) => `<button class="chip ${g.categories.includes(c.name) ? 'on' : ''}" data-action="toggleCat" data-cat="${esc(c.name)}">${esc(c.name)} <small>${c.count}</small></button>`).join('')}</div>
    </div>
    <div>
      <div class="row spread" style="margin-bottom:6px"><span class="small muted" style="font-weight:700">Fragenformate</span>
        <span class="row"><button class="btn small ghost" data-action="allTypes">Alle</button><button class="btn small ghost" data-action="noTypes">Keine</button></span></div>
      <div class="chips">${S.game.types.map((t) => `<button class="chip ${selectedTypes().includes(t.id) ? 'on' : ''}" data-action="toggleType" data-type="${esc(t.id)}">${esc(t.label)} <small>${t.count}</small></button>`).join('')}</div>
    </div>
  </div>`;
}

function viewLobby() {
  const host = S.me.isHost;
  return `<div class="stack">
    <div>
      <div class="small muted">${esc(S.game.icon)} ${esc(S.game.name)}</div>
      <h1 style="font-size:2rem">${esc(S.settings.lobbyName)}</h1>
    </div>
    <div class="grid-2">${viewShare()}${usesTeams() ? viewTeams() : viewPlayers()}</div>
    ${host ? customGame()?.settings?.() ?? viewSettings() : `<div class="card center muted">Warte, bis der Host das Spiel startet … 🎲</div>`}
  </div>`;
}

// --- Fragerunde ---

function viewMedia(q, phase) {
  if (q.type === 'image' || q.type === 'flag') {
    const failed = imageErrors.has(q.image);
    return `<div class="media">${failed
      ? '<div class="card muted">Bild konnte nicht geladen werden.</div>'
      : `<img class="quiz-image" src="${esc(q.image)}" alt="Bild zur Frage" data-image-src="${esc(q.image)}">`}</div>`;
  }
  if (q.type.startsWith('music') && (!S.me.isHost || phase !== 'question')) {
    if (phase !== 'question') return '';
    return `<div class="media"><div class="music-card"><div class="note">🎵</div><h3 style="margin:8px 0 4px">Hört genau hin!</h3><div>Der Song läuft beim Host.</div></div></div>`;
  }
  return '';
}

function answerInputs(q, d) {
  switch (q.type) {
    case 'open':
    case 'image':
    case 'flag':
      return `<input id="ans-text" type="text" maxlength="80" placeholder="Eure Antwort" value="${esc(d.text)}" autocomplete="off">`;
    case 'estimate':
      return `<label class="field"><span>Schätzung${q.unit ? ` in ${esc(q.unit)}` : ''}</span><input id="ans-number" type="number" step="any" inputmode="decimal" placeholder="z. B. 1234" value="${esc(d.number)}"></label>`;
    case 'music-title':
      return `<label class="field"><span>Interpret</span><input id="ans-artist" type="text" maxlength="80" value="${esc(d.artist)}" autocomplete="off"></label>
        <label class="field"><span>Titel</span><input id="ans-title" type="text" maxlength="80" value="${esc(d.title)}" autocomplete="off"></label>`;
    case 'music-year':
      return `<label class="field"><span>Interpret</span><input id="ans-artist" type="text" maxlength="80" value="${esc(d.artist)}" autocomplete="off"></label>
        <label class="field"><span>Erscheinungsjahr</span><input id="ans-year" type="number" min="1900" max="2100" inputmode="numeric" placeholder="z. B. 1985" value="${esc(d.year)}"></label>`;
    default:
      return '';
  }
}

function draftFor(q, myVote) {
  if (!drafts[q.id]) {
    const d = { text: '', number: '', artist: '', title: '', year: '' };
    if (myVote !== null && myVote !== undefined) Object.assign(d, valueToDraft(q, myVote));
    drafts[q.id] = d;
  }
  return drafts[q.id];
}

function valueToDraft(q, v) {
  switch (q.type) {
    case 'open':
    case 'image':
    case 'flag': return { text: v };
    case 'estimate': return { number: String(v) };
    case 'music-title': return { artist: v.artist, title: v.title };
    case 'music-year': return { artist: v.artist, year: v.year ?? '' };
    default: return {};
  }
}

function draftToValue(q, d) {
  switch (q.type) {
    case 'open':
    case 'image':
    case 'flag': return d.text;
    case 'estimate': return d.number;
    case 'music-title': return { artist: d.artist, title: d.title };
    case 'music-year': return { artist: d.artist, year: d.year === '' ? null : Number(d.year) };
    default: return null;
  }
}

function viewAnswerArea(R, q) {
  const mine = R.teamStatus.find((t) => t.teamId === S.me.teamId);
  const { list, leaders } = voteGroups(mine?.votes);
  if (q.type === 'choice') {
    return `<div class="options">${q.options.map((opt, i) => {
      const g = list.find((x) => x.key === String(i));
      const cls = [R.myVote === i ? 'mine' : '', g && leaders.has(g.key) ? 'leading' : ''].join(' ');
      return `<button class="option ${cls}" data-action="voteChoice" data-i="${i}">
        <span class="letter">${LETTERS[i]}</span>${esc(opt)}
        <span class="marks">${g ? avatarStack(g.ids) : ''}</span>
      </button>`;
    }).join('')}</div>
    <p class="small muted center">Tippe auf eine Antwort. Du kannst sie bis zur Auflösung ändern.</p>`;
  }
  const d = draftFor(q, R.myVote);
  const myKey = mine?.votes?.find((v) => v.playerId === S.me.id)?.key;
  return `<form id="answer-form" class="answer-form card">
    <div class="inputs">${answerInputs(q, d)}</div>
    <button class="btn primary" type="submit">${R.myVote !== null ? 'Antwort ändern' : 'Antwort abgeben'}</button>
    <div class="small ${R.myVote !== null ? '' : 'muted'}">${R.myVote !== null ? `✓ Deine Stimme: <b>${esc(formatValue(q, R.myVote))}</b>. Du kannst sie bis zur Auflösung ändern.` : 'Noch keine Stimme abgegeben.'}</div>
  </form>
  ${list.length ? `<h3 style="margin-top:18px">Vorschläge in deinem Team</h3>
  <div class="suggestions">${list.map((g) => `
    <div class="suggestion ${leaders.has(g.key) ? 'leading' : ''} ${g.key === myKey ? 'mine' : ''}">
      <span class="text">${esc(formatValue(q, g.value))}</span>
      ${avatarStack(g.ids)}
      ${g.key !== myKey ? `<button class="btn small" data-action="adopt" data-key="${esc(g.key)}">Übernehmen</button>` : ''}
    </div>`).join('')}</div>` : ''}`;
}

function viewGamemasterPanel(R, q) {
  const solution = ui.showSolution && R.solution
    ? `<div class="solution gm-solution"><div class="small muted">Lösung (nur für dich sichtbar)</div><div class="big">${formatSolution(q, R.solution)}</div></div>`
    : '';
  const choices = q.type === 'choice'
    ? `<div class="options">${q.options.map((opt, i) => `<button class="option ${ui.showSolution && R.solution?.index === i ? 'correct' : ''}" disabled><span class="letter">${LETTERS[i]}</span>${esc(opt)}</button>`).join('')}</div>`
    : '';
  const teams = R.teamStatus.filter((t) => t.members.length).map((t) => {
    const team = teamById(t.teamId);
    const { list, leaders } = voteGroups(t.votes);
    const leading = list.filter((g) => leaders.has(g.key)).map((g) => formatValue(q, g.value));
    return `<div class="result" style="--team:${team.color}">
      <div class="row spread"><b>${esc(team.name)}</b><span class="small muted">${t.members.filter((m) => m.voted).length}/${t.members.length} abgestimmt</span></div>
      <div class="answer">${leading.length ? esc(leading.join(' / ')) : '<span class="muted">Noch keine Stimme</span>'}</div>
      ${leading.length > 1 ? '<div class="small muted">Gleichstand</div>' : ''}
    </div>`;
  }).join('');
  return `<div class="stack">${solution}${choices}<h3 style="margin-top:12px">Aktuelle Teamantworten</h3><div class="results">${teams}</div></div>`;
}

function viewStatusBar(R) {
  return `<div class="status-bar">${R.teamStatus.filter((t) => t.members.length).map((t) => {
    const team = teamById(t.teamId);
    return `<div class="status-team" style="--team:${team.color}"><b class="small">${esc(team.name)}</b>
      ${t.members.map((m) => avatarHtml(playerById(m.id), `sm ${m.voted ? 'voted' : ''}`)).join('')}</div>`;
  }).join('')}</div>`;
}

function viewExclude(R) {
  const ex = R.exclude;
  const canVote = !isGamemaster() && S.me.teamId && teamById(S.me.teamId);
  const mine = ex.ids.includes(S.me.id);
  if (!canVote && !ex.ids.length) return '';
  return `<div class="exclude-bar">
    ${canVote ? `<button class="btn small ${mine ? 'pink' : 'ghost'}" data-action="exclude" data-value="${mine ? '0' : '1'}">${mine ? '↩︎ Ausschließen zurücknehmen' : '🚫 Frage ausschließen'}</button>` : ''}
    ${ex.ids.length ? `<span class="small muted">${ex.ids.length}/${ex.needed} wollen die Frage ausschließen</span>${avatarStack(ex.ids)}` : '<span class="small muted">Stimmen alle dafür, kommt die Frage nie wieder dran.</span>'}
  </div>`;
}

function viewQuestion() {
  const R = S.round;
  const q = R.question;
  const gm = isGamemaster();
  let body;
  if (gm) body = viewGamemasterPanel(R, q);
  else if (!S.me.teamId || !teamById(S.me.teamId)) body = `<div class="card stack"><h3>Wähle ein Team, um mitzuraten</h3>${teamPicker(S.teams, null, (id) => S.players.filter((p) => p.teamId === id))}</div>`;
  else body = viewAnswerArea(R, q);
  return `<div>
    ${R.notice ? `<div class="notice">🚫 ${esc(R.notice)}</div>` : ''}
    ${R.paused ? '<div class="notice">⏸ Der Host hat die Frage pausiert. Ihr könnt weiter abstimmen.</div>' : ''}
    <div class="q-head">
      <div class="small muted"><b>Frage ${R.index + 1}/${R.total}</b> · ${esc(q.category)} · ${esc(q.typeLabel)}</div>
      ${R.deadline ? '<span class="timer" id="timer"></span>' : R.paused ? '<span class="timer">⏸</span>' : ''}
    </div>
    <div class="question-text">${esc(q.question)}</div>
    ${viewMedia(q, R.phase)}
    ${body}
    ${viewStatusBar(R)}
    ${viewExclude(R)}
  </div>`;
}

function viewScoreboard(totals) {
  const rows = S.teams
    .filter((t) => S.players.some((p) => p.teamId === t.id) || totals[t.id])
    .map((t) => ({ ...t, pts: totals[t.id] || 0 }))
    .sort((a, b) => b.pts - a.pts);
  let rank = 0;
  let last = null;
  return `<div class="scoreboard">${rows.map((t, i) => {
    if (t.pts !== last) { rank = i + 1; last = t.pts; }
    return `<div class="score-row" style="--team:${t.color}"><span class="rank">${rank}.</span><span class="name">${esc(t.name)}</span><span class="pts">${t.pts}</span></div>`;
  }).join('')}</div>`;
}

function viewTeamResult(R, q, team, r) {
  const host = S.me.isHost;
  const pts = Object.values(r.judgement).filter(Boolean).length;
  let extra = '';
  if (q.type === 'estimate' && r.value !== null) {
    const diff = r.value - R.solution.value;
    extra = `<div class="small muted">Abweichung: ${diff > 0 ? '+' : ''}${fmtNumber(Math.round(diff * 100) / 100)}</div>`;
  }
  const parts = R.parts.map((part) => {
    const ok = r.judgement[part];
    return `<div class="judge-row"><span class="part">${PART_LABELS[part]}</span>
      ${host
        ? `<span class="toggle"><button class="${ok ? 'on yes' : ''}" data-action="judge" data-team="${team.id}" data-part="${part}" data-value="1">✓</button><button class="${!ok ? 'on no' : ''}" data-action="judge" data-team="${team.id}" data-part="${part}" data-value="0">✗</button></span>`
        : `<span class="verdict ${ok ? 'yes' : 'no'}">${ok ? '✓ richtig' : '✗ falsch'}</span>`}
    </div>`;
  }).join('');
  return `<div class="result" style="--team:${team.color}">
    <div class="row spread"><b>${esc(team.name)}</b><span class="points">+${pts}</span></div>
    <div class="answer">${r.value !== null ? esc(formatValue(q, r.value)) : '<span class="muted">Keine Antwort</span>'}</div>
    ${extra}
    ${r.lottery ? `<div class="small muted">🎲 Gleichstand, gelost zwischen: ${r.tied.map((v) => esc(formatValue(q, v))).join(', ')}</div>` : ''}
    ${parts}
  </div>`;
}

function viewReveal() {
  const R = S.round;
  const q = R.question;
  const results = R.results || {};
  const choiceBoard = q.type === 'choice'
    ? `<div class="options" style="margin-bottom:16px">${q.options.map((opt, i) => {
      const teams = S.teams.filter((t) => results[t.id]?.value === i);
      return `<button class="option ${i === R.solution.index ? 'correct' : 'wrong'}" disabled><span class="letter">${LETTERS[i]}</span>${esc(opt)}
        <span class="marks row" style="gap:4px">${teams.map((t) => `<span class="badge" style="background:${t.color};color:#fff;border-color:transparent">${esc(t.name)}</span>`).join('')}</span></button>`;
    }).join('')}</div>`
    : '';
  const spotifyLink = R.solution.spotifyId ? `<a class="btn small" href="https://open.spotify.com/track/${esc(R.solution.spotifyId)}" target="_blank" rel="noopener">Auf Spotify öffnen</a>` : '';
  const teamCards = S.teams.filter((t) => results[t.id]).map((t) => viewTeamResult(R, q, t, results[t.id])).join('');
  const needsJudging = ['open', 'image', 'flag', 'music-title'].includes(q.type);
  return `<div class="stack">
    <div class="q-head"><div class="small muted"><b>Frage ${R.index + 1}/${R.total}</b> · ${esc(q.category)} · Auflösung</div></div>
    <div class="question-text">${esc(q.question)}</div>
    ${viewMedia(q, R.phase)}
    <div class="solution"><div class="small muted">Richtige Antwort</div><div class="big">${formatSolution(q, R.solution)}</div>${spotifyLink ? `<div style="margin-top:8px">${spotifyLink}</div>` : ''}</div>
    ${choiceBoard}
    ${S.me.isHost && needsJudging ? '<div class="small" style="color:var(--accent)">Prüfe die Antworten: Der Vorschlag ist automatisch gesetzt, du entscheidest mit ✓ oder ✗.</div>' : ''}
    <div class="results">${teamCards || '<div class="muted">Kein Team hat abgestimmt.</div>'}</div>
    <h3 style="margin-top:12px">Punktestand</h3>
    ${viewScoreboard(R.totals)}
  </div>`;
}

function viewFinal() {
  const R = S.round;
  const ranked = S.teams.map((t) => ({ ...t, pts: R.totals[t.id] || 0 }))
    .filter((t) => S.players.some((p) => p.teamId === t.id) || t.pts)
    .sort((a, b) => b.pts - a.pts);
  const top = [ranked[1], ranked[0], ranked[2]].filter(Boolean);
  const heights = { 0: 140, 1: 100, 2: 70 };
  return `<div class="stack">
    <div class="center"><div style="font-size:3rem">🏆</div><h1>${!ranked[0] ? 'Spiel beendet' : ranked[1] && ranked[1].pts === ranked[0].pts ? 'Unentschieden!' : `${esc(ranked[0].name)} gewinnt!`}</h1></div>
    <div class="podium">${top.map((t) => {
      // Bei Punktgleichheit teilen sich Teams denselben Platz
      const place = ranked.filter((o) => o.pts > t.pts).length;
      return `<div class="step"><b>${esc(t.name)}</b><div class="small muted">${t.pts} Punkte</div>
        <div class="block" style="--team:${t.color};height:${heights[place] ?? 70}px">${place + 1}</div></div>`;
    }).join('')}</div>
    ${viewScoreboard(R.totals)}
    <details class="card"><summary>Alle Fragen und Antworten</summary>
      <div class="stack" style="margin-top:12px">${R.recap.map((item, i) => `<div><b>${i + 1}. ${esc(item.question)}</b><div class="small">${formatSolution({ type: item.type, options: [] }, item.solution)}</div></div>`).join('')}</div>
    </details>
    ${S.me.isHost ? '' : '<div class="muted center">Der Host kann eine neue Runde starten.</div>'}
  </div>`;
}

function viewHostbar() {
  if (!S?.me.isHost) return '';
  const R = S.round;
  let buttons = '';
  if (S.phase === 'playing' && customGame()) {
    buttons = customGame().hostbar();
  } else if (S.phase === 'lobby') {
    buttons = `<button class="btn primary" data-action="start">▶︎ Spiel starten</button>`;
  } else if (R.phase === 'question') {
    buttons = `${isGamemaster() ? `<button class="btn" data-action="toggleSolution">${ui.showSolution ? '🙈 Lösung verbergen' : '👁 Lösung anzeigen'}</button>` : ''}
      <button class="btn" data-action="${R.paused ? 'resume' : 'pause'}">${R.paused ? '▶︎ Weiter' : '⏸ Pause'}</button>
      <button class="btn pink" data-action="reveal">⏭ Zur Auflösung</button>`;
  } else if (R.phase === 'reveal') {
    buttons = `<button class="btn primary" data-action="next">${R.index + 1 >= R.total ? '🏆 Zum Endergebnis' : 'Nächste Frage ▶︎'}</button>`;
  } else {
    buttons = `<button class="btn primary" data-action="toLobby">Neue Runde (zur Lobby)</button>`;
  }
  const end = S.phase === 'playing' && R?.phase !== 'final' ? '<button class="btn small ghost" data-action="endGame">Beenden</button>' : '';
  return `<div class="hostbar"><div class="inner"><span class="label">Host</span>${end}${buttons}</div></div>`;
}

function view() {
  if (fatal) return viewFatal();
  if (joinInfo) return viewJoin();
  if (!S) return '<div class="empty">Verbinde …</div>';
  let main;
  if (S.phase === 'lobby') main = viewLobby();
  else if (customGame()) main = customGame().view();
  else if (S.round.phase === 'question') main = viewQuestion();
  else if (S.round.phase === 'reveal') main = viewReveal();
  else main = viewFinal();
  return main + (ui.editProfile ? viewProfileModal() : '');
}

// ---------- Zeichnen ----------

function render() {
  // Fokus und Eingabe erhalten, damit Tippen nicht durch Updates unterbrochen wird
  const active = document.activeElement;
  const focusId = active && active.id && app.contains(active) ? active.id : null;
  const focusValue = focusId && 'value' in active ? active.value : null;
  let selection = null;
  try { selection = focusId ? [active.selectionStart, active.selectionEnd] : null; } catch { selection = null; }

  if (S?.round?.question) {
    const key = `${S.round.index}:${S.round.question.id}`;
    if (ui.questionKey !== key) {
      ui.questionKey = key;
      ui.showSolution = false;
    }
  }

  app.innerHTML = view();
  document.getElementById('topinfo').innerHTML = fatal || joinInfo ? '' : viewTopInfo();
  document.getElementById('hostbar-root').innerHTML = fatal ? '' : viewHostbar();

  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) {
      if (focusValue !== null && el.value !== focusValue) el.value = focusValue;
      el.focus();
      try { if (selection && selection[0] !== null) el.setSelectionRange(selection[0], selection[1]); } catch { /* Zahlenfelder */ }
    }
  }
  syncMusic();
  tick();
}

function syncMusic() {
  const R = S?.round;
  if (!S?.me.isHost || S.phase !== 'playing' || !R?.question || R.phase === 'final' || !R.question.type.startsWith('music')) {
    Music.hide();
    return;
  }
  Music.show(R.question.spotifyId, R.phase === 'reveal');
}

function tick() {
  const R = S?.round;
  const now = Date.now() + clockOffset;
  const timer = document.getElementById('timer');
  if (timer && R?.deadline) {
    const ms = R.paused ? R.remainingMs ?? 0 : R.deadline - now;
    const left = Math.max(0, Math.ceil(ms / 1000));
    timer.textContent = `${R.paused ? '⏸ ' : ''}${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    timer.classList.toggle('urgent', left <= 10);
  }
  // Nur neu zeichnen, wenn sich die Zahl ändert, sonst startet die Animation ständig neu
  const root = document.getElementById('countdown-root');
  const left = R?.phase === 'question' && R.countdownEnd ? String(Math.max(1, Math.ceil((R.countdownEnd - now) / 1000))) : '';
  if (root.dataset.value !== left) {
    root.dataset.value = left;
    root.innerHTML = left ? `<div class="countdown"><span>${left}</span></div>` : '';
  }
}
setInterval(tick, 200);

// ---------- Eingaben ----------

const actions = {
  pickAvatar: (el) => { ui.profile.avatar = el.dataset.src; render(); },
  hostAvatar: (el) => socket.emit('player:update', { avatar: el.dataset.src }),
  pickTeam: (el) => {
    if (S && !ui.editProfile) {
      // Spieler ohne Team mitten im Spiel
      socket.emit('player:update', { teamId: el.dataset.team });
      return;
    }
    ui.profile.teamId = el.dataset.team;
    render();
  },
  editProfile: () => {
    if (!S) return;
    ui.profile = { name: S.me.name, avatar: S.me.avatar, teamId: S.me.teamId };
    ui.editProfile = true;
    render();
  },
  closeProfile: () => { ui.editProfile = false; render(); },
  copyLink: async () => {
    try {
      await navigator.clipboard.writeText(joinUrl());
      toast('Link kopiert!', true);
    } catch {
      prompt('Link kopieren:', joinUrl());
    }
  },
  shareLink: () => navigator.share({ title: S.settings.lobbyName, text: `Spiel mit bei ${S.settings.lobbyName}!`, url: joinUrl() }).catch(() => {}),
  addTeam: () => sendHost('team:add'),
  removeTeam: (el) => {
    const team = teamById(el.dataset.team);
    if (confirm(`„${team.name}“ löschen? Die Mitglieder müssen sich ein neues Team suchen.`)) sendHost('team:remove', { teamId: el.dataset.team });
  },
  kick: (el) => {
    const p = playerById(el.dataset.player);
    if (confirm(`${p.name} aus der Lobby entfernen?`)) sendHost('player:kick', { playerId: el.dataset.player });
  },
  joinTeam: (el) => socket.emit('player:update', { teamId: el.dataset.team }),
  hostPlays: (el) => sendHost('settings', { hostPlays: el.dataset.value === '1' }),
  toggleCat: (el) => {
    const cats = new Set(S.settings.game.categories);
    if (cats.has(el.dataset.cat)) cats.delete(el.dataset.cat);
    else cats.add(el.dataset.cat);
    sendHost('settings', { game: { categories: [...cats] } });
  },
  allCats: () => sendHost('settings', { game: { categories: S.game.categories.map((c) => c.name) } }),
  noCats: () => sendHost('settings', { game: { categories: [] } }),
  toggleType: (el) => {
    const types = new Set(selectedTypes());
    if (types.has(el.dataset.type)) types.delete(el.dataset.type);
    else types.add(el.dataset.type);
    sendHost('settings', { game: { types: [...types] } });
  },
  allTypes: () => sendHost('settings', { game: { types: S.game.types.map((t) => t.id) } }),
  noTypes: () => sendHost('settings', { game: { types: [] } }),
  start: () => sendHost('start'),
  reveal: () => sendHost('reveal'),
  pause: () => sendHost('pause'),
  resume: () => sendHost('resume'),
  next: () => sendHost('next'),
  toLobby: () => sendHost('lobby'),
  endGame: () => { if (confirm('Spiel beenden und zurück zur Lobby?')) sendHost('lobby'); },
  toggleSolution: () => { ui.showSolution = !ui.showSolution; render(); },
  judge: (el) => sendHost('judge', { teamId: el.dataset.team, part: el.dataset.part, value: el.dataset.value === '1' }),
  voteChoice: (el) => vote(Number(el.dataset.i)),
  exclude: (el) => socket.emit('exclude', el.dataset.value === '1', (res) => { if (res?.error) toast(res.error); }),
  adopt: (el) => {
    const R = S.round;
    const mine = R.teamStatus.find((t) => t.teamId === S.me.teamId);
    const v = mine?.votes?.find((x) => x.key === el.dataset.key);
    if (!v) return;
    drafts[R.question.id] = { ...drafts[R.question.id], ...valueToDraft(R.question, v.value) };
    vote(v.value);
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.action];
  if (fn) {
    e.preventDefault();
    fn(el);
  }
});

app.addEventListener('error', (e) => {
  const src = e.target?.dataset?.imageSrc;
  if (src && !imageErrors.has(src)) {
    imageErrors.add(src);
    render();
  }
}, true);

const draftFields = { 'ans-text': 'text', 'ans-number': 'number', 'ans-artist': 'artist', 'ans-title': 'title', 'ans-year': 'year' };

app.addEventListener('input', (e) => {
  const id = e.target.id;
  if (draftFields[id] && S?.round) {
    draftFor(S.round.question, S.round.myVote)[draftFields[id]] = e.target.value;
  }
  if (id === 'profile-name' && ui.profile) ui.profile.name = e.target.value;
});

app.addEventListener('change', (e) => {
  const el = e.target;
  if (el.id === 'set-lobbyName') sendHost('settings', { lobbyName: el.value });
  else if (el.id === 'set-myName') socket.emit('player:update', { name: el.value });
  else if (el.id === 'set-count') sendHost('settings', { game: { questionCount: Number(el.value) } });
  else if (el.id === 'set-time') sendHost('settings', { game: { timeLimit: Number(el.value) } });
  else if (el.id === 'set-music-time') sendHost('settings', { game: { musicTimeLimit: Number(el.value) } });
  else if (el.id.startsWith('team-name-')) sendHost('team:rename', { teamId: el.dataset.team, name: el.value });
});

app.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  if (form.id === 'join-form') {
    const p = ui.profile;
    if (!p.name.trim()) return toast('Bitte gib einen Namen ein.');
    if (!p.teamId && usesTeams()) return toast('Bitte wähle ein Team.');
    store.set('afng:name', p.name.trim());
    const res = await emitAck(socket, 'player:register', { code, name: p.name, avatar: p.avatar, teamId: p.teamId });
    if (res.error) return toast(res.error);
    store.set(tokenKey, res.token);
  } else if (form.id === 'profile-form') {
    const p = ui.profile;
    if (!p.name.trim()) return toast('Bitte gib einen Namen ein.');
    store.set('afng:name', p.name.trim());
    socket.emit('player:update', isGamemaster() ? { name: p.name, avatar: p.avatar } : p);
    ui.editProfile = false;
    render();
  } else if (form.id === 'answer-form') {
    const q = S.round.question;
    const value = draftToValue(q, draftFor(q, S.round.myVote));
    vote(value);
    document.activeElement?.blur?.();
  }
});

// ---------- Start ----------

Promise.all([
  fetch('/api/avatars').then((r) => r.json()).catch(() => []),
  fetch('/api/server-info').then((r) => r.json()).catch(() => ({})),
]).then(([list, info]) => {
  avatars = list;
  serverInfo = info;
  if (ui.profile && !ui.profile.avatar && avatars.length) ui.profile.avatar = avatars[Math.floor(Math.random() * avatars.length)];
  render();
});
