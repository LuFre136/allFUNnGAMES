// Dauerhaft ausgeschlossene Fragen
//
// Die Liste liegt immer in data/excluded-questions.json. Sind GITHUB_TOKEN und GITHUB_REPO
// gesetzt, wird sie zusätzlich auf einem eigenen Branch im Repository gespeichert
// (Standard: „quiz-daten“). Das ist nötig, wenn der Server wie bei Render keine
// dauerhafte Festplatte hat. Ein eigener Branch löst kein neues Deployment aus.
// Zum Reaktivieren einer Frage den Eintrag aus der Datei löschen.

const fs = require('fs');
const path = require('path');

const FILE = process.env.EXCLUSIONS_FILE || path.join(__dirname, '..', 'data', 'excluded-questions.json');
const GITHUB = {
  token: process.env.GITHUB_TOKEN,
  repo: process.env.GITHUB_REPO,
  branch: process.env.GITHUB_DATA_BRANCH || 'quiz-daten',
  path: 'excluded-questions.json',
};
const githubEnabled = Boolean(GITHUB.token && GITHUB.repo);

let entries = [];
let remoteSha = null;
let saveChain = Promise.resolve();

function readFile() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8')).excluded || [];
  } catch {
    return [];
  }
}

function writeFile() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, serialize());
}

function serialize() {
  return JSON.stringify({ excluded: entries }, null, 2) + '\n';
}

async function github(method, url, body) {
  const res = await fetch(`https://api.github.com/repos/${GITHUB.repo}${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${GITHUB.token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'allFunnGames',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, data };
}

async function loadRemote() {
  const res = await github('GET', `/contents/${GITHUB.path}?ref=${encodeURIComponent(GITHUB.branch)}`);
  if (res.status === 404) {
    remoteSha = null;
    return null;
  }
  if (res.status !== 200) throw new Error(`GitHub antwortet mit ${res.status}`);
  remoteSha = res.data.sha;
  return JSON.parse(Buffer.from(res.data.content, 'base64').toString('utf8')).excluded || [];
}

async function ensureBranch() {
  const ref = await github('GET', `/git/ref/heads/${encodeURIComponent(GITHUB.branch)}`);
  if (ref.status === 200) return;
  const repo = await github('GET', '');
  const base = await github('GET', `/git/ref/heads/${encodeURIComponent(repo.data.default_branch)}`);
  const created = await github('POST', '/git/refs', { ref: `refs/heads/${GITHUB.branch}`, sha: base.data.object.sha });
  if (created.status !== 201) throw new Error(`Branch ${GITHUB.branch} konnte nicht angelegt werden (${created.status})`);
}

async function saveRemote(message) {
  await ensureBranch();
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await github('PUT', `/contents/${GITHUB.path}`, {
      message,
      content: Buffer.from(serialize()).toString('base64'),
      branch: GITHUB.branch,
      ...(remoteSha ? { sha: remoteSha } : {}),
    });
    if (res.status === 200 || res.status === 201) {
      remoteSha = res.data.content.sha;
      return;
    }
    // Datei wurde inzwischen von Hand geändert: neu laden, zusammenführen, erneut speichern
    if (res.status === 409 || res.status === 422) {
      const remote = (await loadRemote()) || [];
      merge(remote);
      continue;
    }
    throw new Error(`GitHub antwortet mit ${res.status}`);
  }
}

function merge(list) {
  const known = new Set(entries.map((e) => e.id));
  for (const e of list) if (!known.has(e.id)) entries.push(e);
}

// Beim Start und regelmäßig neu laden, damit von Hand reaktivierte Fragen zurückkommen
async function refresh() {
  if (!githubEnabled) return;
  try {
    const remote = await loadRemote();
    if (remote) {
      entries = remote;
      writeFile();
    }
  } catch (err) {
    console.warn(`Ausgeschlossene Fragen nicht von GitHub geladen: ${err.message}`);
  }
}

function init() {
  entries = readFile();
  if (githubEnabled) {
    refresh();
    setInterval(refresh, 10 * 60 * 1000).unref();
  }
}

// Musikfragen haben alle denselben Fragetext, deshalb den Song dazuschreiben
function describe(q) {
  return q.type.startsWith('music') ? `${q.question} (${q.artist} – ${q.title})` : q.question;
}

function isExcluded(id) {
  return entries.some((e) => e.id === id);
}

function add(question) {
  if (isExcluded(question.id)) return;
  entries.push({ id: question.id, type: question.type, question: describe(question), excludedAt: new Date().toISOString() });
  writeFile();
  if (githubEnabled) {
    saveChain = saveChain
      .then(() => saveRemote(`Frage ${question.id} ausgeschlossen`))
      .catch((err) => console.warn(`Ausgeschlossene Fragen nicht auf GitHub gespeichert: ${err.message}`));
  }
}

module.exports = { init, isExcluded, add, describe, githubEnabled };
