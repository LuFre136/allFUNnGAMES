// Highscores (z. B. die zehn besten Würfelbecher-Blöcke)
//
// Wie bei den ausgeschlossenen Quizfragen liegt die Liste in data/<name>.json und, wenn
// GITHUB_TOKEN und GITHUB_REPO gesetzt sind, zusätzlich auf dem Daten-Branch im Repository
// (Standard: „quiz-daten“). So bleibt sie auch bei Render ohne dauerhafte Festplatte erhalten.

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const GITHUB = {
  token: process.env.GITHUB_TOKEN,
  repo: process.env.GITHUB_REPO,
  branch: process.env.GITHUB_DATA_BRANCH || 'quiz-daten',
};
const githubEnabled = Boolean(GITHUB.token && GITHUB.repo);

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

async function ensureBranch() {
  const ref = await github('GET', `/git/ref/heads/${encodeURIComponent(GITHUB.branch)}`);
  if (ref.status === 200) return;
  const repo = await github('GET', '');
  const base = await github('GET', `/git/ref/heads/${encodeURIComponent(repo.data.default_branch)}`);
  const created = await github('POST', '/git/refs', { ref: `refs/heads/${GITHUB.branch}`, sha: base.data.object.sha });
  if (created.status !== 201) throw new Error(`Branch ${GITHUB.branch} konnte nicht angelegt werden (${created.status})`);
}

// Bestenliste mit höchstens `limit` Einträgen { id, total, date, … }, höchste Punktzahl zuerst
function createBoard(name, { limit = 10, file = path.join(DATA_DIR, `${name}.json`), github: useGithub = githubEnabled } = {}) {
  const remotePath = `${name}.json`;
  let entries = [];
  let remoteSha = null;
  let saveChain = Promise.resolve();

  function normalize(list) {
    const byId = new Map();
    for (const e of list) if (e && e.id && !byId.has(e.id)) byId.set(e.id, e);
    // Bei Gleichstand bleibt vorn, wer es zuerst geschafft hat
    return [...byId.values()].sort((a, b) => b.total - a.total || String(a.date).localeCompare(String(b.date))).slice(0, limit);
  }

  function serialize() {
    return JSON.stringify({ highscores: entries }, null, 2) + '\n';
  }

  function readFile() {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8')).highscores || [];
    } catch {
      return [];
    }
  }

  function writeFile() {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, serialize());
    } catch (err) {
      console.warn(`Highscores nicht gespeichert: ${err.message}`);
    }
  }

  async function loadRemote() {
    const res = await github('GET', `/contents/${remotePath}?ref=${encodeURIComponent(GITHUB.branch)}`);
    if (res.status === 404) {
      remoteSha = null;
      return null;
    }
    if (res.status !== 200) throw new Error(`GitHub antwortet mit ${res.status}`);
    remoteSha = res.data.sha;
    return JSON.parse(Buffer.from(res.data.content, 'base64').toString('utf8')).highscores || [];
  }

  async function saveRemote(message) {
    await ensureBranch();
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await github('PUT', `/contents/${remotePath}`, {
        message,
        content: Buffer.from(serialize()).toString('base64'),
        branch: GITHUB.branch,
        ...(remoteSha ? { sha: remoteSha } : {}),
      });
      if (res.status === 200 || res.status === 201) {
        remoteSha = res.data.content.sha;
        return;
      }
      // Datei wurde inzwischen geändert: neu laden, zusammenführen, erneut speichern
      if (res.status === 409 || res.status === 422) {
        entries = normalize([...entries, ...((await loadRemote()) || [])]);
        continue;
      }
      throw new Error(`GitHub antwortet mit ${res.status}`);
    }
  }

  async function refresh() {
    try {
      const remote = await loadRemote();
      if (remote) {
        entries = normalize([...remote, ...entries]);
        writeFile();
      }
    } catch (err) {
      console.warn(`Highscores nicht von GitHub geladen: ${err.message}`);
    }
  }

  entries = normalize(readFile());
  if (useGithub) refresh();

  return {
    list: () => entries,
    // Neue Einträge eintragen; zurück kommen die IDs, die es in die Liste geschafft haben
    add(newEntries) {
      entries = normalize([...entries, ...newEntries]);
      const kept = newEntries.filter((e) => entries.includes(e)).map((e) => e.id);
      if (!kept.length) return kept;
      writeFile();
      if (useGithub) {
        saveChain = saveChain
          .then(() => saveRemote(`Neue Highscores: ${name}`))
          .catch((err) => console.warn(`Highscores nicht auf GitHub gespeichert: ${err.message}`));
      }
      return kept;
    },
  };
}

module.exports = { createBoard };
