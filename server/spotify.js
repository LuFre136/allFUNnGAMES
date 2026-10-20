// Spotify-Anbindung
//
// Die Wiedergabe läuft im Browser des Hosts über die Spotify-Embed-API und braucht
// keine Zugangsdaten. Sind SPOTIFY_CLIENT_ID und SPOTIFY_CLIENT_SECRET gesetzt, sucht
// der Server die Songs zusätzlich über die Spotify Web API und verwendet die gefundenen
// Track-IDs. So stimmen die Songs auch dann, wenn eine hinterlegte ID nicht mehr gültig ist.

const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, '..', 'data', 'spotify-cache.json');

let cache = {};
try {
  cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
} catch {
  cache = {};
}

const state = { enabled: false, resolved: 0, failed: [], error: null };

function cacheKey(q) {
  return `${q.artist} - ${q.title}`.toLowerCase();
}

function trackIdFor(q) {
  return cache[cacheKey(q)] || q.spotifyId || null;
}

async function getToken(clientId, clientSecret) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`Spotify-Anmeldung fehlgeschlagen (${res.status})`);
  return (await res.json()).access_token;
}

async function searchTrack(token, q) {
  const artist = q.artist.split(/ feat\.? /i)[0];
  const query = `track:${q.title} artist:${artist}`;
  const url = `https://api.spotify.com/v1/search?type=track&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Spotify-Suche fehlgeschlagen (${res.status})`);
  const data = await res.json();
  return data.tracks?.items?.[0]?.id || null;
}

async function resolveAll(questions) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return state;
  state.enabled = true;
  try {
    const token = await getToken(clientId, clientSecret);
    for (const q of questions.filter((x) => x.type.startsWith('music'))) {
      try {
        const id = await searchTrack(token, q);
        if (id) {
          cache[cacheKey(q)] = id;
          state.resolved++;
        } else {
          state.failed.push(cacheKey(q));
        }
      } catch (err) {
        state.failed.push(cacheKey(q));
      }
    }
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (err) {
    state.error = err.message;
  }
  return state;
}

module.exports = { trackIdFor, resolveAll, state };
