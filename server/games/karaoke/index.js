// Karaoke: Die Songs (Karaoke-Videos von YouTube oder Titel von Spotify mit mitlaufendem Text)
// laufen auf dem Host-Bildschirm, die Handys sind Warteschlange, Applaus und Jury.

const spotify = require('../../spotify');
const lyrics = require('./lyrics');

const MAX_TITLE = 80;
const REACTION_MS = 6000;
const REACTION_GAP_MS = 600;
const REACTIONS = ['👏', '🔥', '😂', '😍', '🎉', '🙉'];

// Akzeptiert YouTube-Links aller Formen (watch, youtu.be, shorts, embed, music) oder eine nackte Video-ID
function parseVideoId(input) {
  const text = String(input ?? '').trim();
  if (!text) return null;
  if (/^[\w-]{11}$/.test(text)) return text;
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  let id = null;
  if (host === 'youtu.be') id = url.pathname.split('/')[1];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = url.searchParams.get('v');
    const m = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/);
    if (!id && m) id = m[1];
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

// Spotify-Links (open.spotify.com/track/…, auch mit /intl-de/) oder spotify:track:…
function parseTrackId(input) {
  const text = String(input ?? '').trim();
  const m = text.match(/^spotify:track:([A-Za-z0-9]{22})$/) || text.match(/^(?:https?:\/\/)?open\.spotify\.com\/(?:intl-[a-z-]+\/)?track\/([A-Za-z0-9]{22})(?:[/?#]|$)/i);
  return m ? m[1] : null;
}

function parseLink(input) {
  const trackId = parseTrackId(input);
  if (trackId) return { source: 'spotify', trackId, videoId: null };
  const videoId = parseVideoId(input);
  return videoId ? { source: 'youtube', videoId, trackId: null } : null;
}

// Titelinfos aus der Spotify-Suche des Handys, nur für die Textsuche verwendet
function cleanMeta(meta) {
  if (!meta || typeof meta !== 'object') return null;
  const text = (v) => String(v ?? '').slice(0, 200);
  const durationMs = Math.round(Number(meta.durationMs));
  return { name: text(meta.name), artist: text(meta.artist), durationMs: Number.isFinite(durationMs) && durationMs > 0 ? durationMs : null };
}

function cleanTitle(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE);
}

function average(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

class Karaoke {
  constructor(lobby) {
    this.lobby = lobby;
    this.songs = []; // Warteschlange: { id, title, source, videoId, trackId, lyrics, singers, addedBy, addedAt, pinned }
    this.history = []; // gesungene Songs mit Bewertung
    this.seq = 0;
    this.current = null;
    this.ratings = new Map(); // playerId -> 1..5
    this.reactions = [];
    this.lastReaction = new Map();
    this.lastResult = null;
    this.phase = 'queue'; // queue | singing | rating | final
  }

  static meta() {
    return {
      id: 'karaoke',
      name: 'Karaoke',
      icon: '🎤',
      description: 'Singt zu Karaoke-Videos auf dem großen Bildschirm. Die Handys sind Warteschlange, Applaus und Jury.',
      players: '1–30 Sänger, alle zusammen',
      available: true,
      teams: false,
      search: Boolean(process.env.YOUTUBE_API_KEY),
      spotifySearch: Karaoke.deps.spotify.enabled(),
      reactions: REACTIONS,
    };
  }

  static defaultSettings() {
    return { maxQueued: 3, rating: true, fairOrder: true };
  }

  static sanitizeSettings(current, patch) {
    const next = { ...current };
    if (patch.maxQueued !== undefined) {
      const n = Math.round(Number(patch.maxQueued));
      if (Number.isFinite(n)) next.maxQueued = Math.min(Math.max(n, 1), 10);
    }
    if (patch.rating !== undefined) next.rating = Boolean(patch.rating);
    if (patch.fairOrder !== undefined) next.fairOrder = Boolean(patch.fairOrder);
    return next;
  }

  static availableCount() {
    return 0;
  }

  get settings() {
    return this.lobby.settings.game;
  }

  players() {
    return this.lobby.activePlayers();
  }

  start() {
    this.phase = 'queue';
  }

  sungCount(playerId) {
    return this.history.filter((h) => h.singers.includes(playerId)).length;
  }

  // Reihum: Wer weniger gesungen hat, ist zuerst dran. Vom Host vorgezogene Songs kommen vor allen anderen.
  queue() {
    const perPlayer = new Map();
    const ranked = this.songs.map((s) => {
      const lead = s.singers[0];
      const rank = perPlayer.get(lead) || 0;
      perPlayer.set(lead, rank + 1);
      return { song: s, round: this.settings.fairOrder ? this.sungCount(lead) + rank : 0 };
    });
    ranked.sort((a, b) => {
      if (a.song.pinned || b.song.pinned) return (b.song.pinned || 0) - (a.song.pinned || 0);
      return a.round - b.round || a.song.addedAt - b.song.addedAt;
    });
    return ranked.map((r) => r.song);
  }

  songById(id) {
    return this.songs.find((s) => s.id === id) || null;
  }

  canEdit(player, song) {
    return player.isHost || song.addedBy === player.id || song.singers.includes(player.id);
  }

  add(player, { title, url, source, track, singerId, partnerId }) {
    if (this.phase === 'final') return { error: 'Der Karaoke-Abend ist vorbei.' };
    const name = cleanTitle(title);
    if (!name) return { error: 'Bitte gib Interpret und Titel an.' };
    const link = url ? parseLink(url) : null;
    if (url && !link) return { error: 'Das ist weder ein YouTube- noch ein Spotify-Link.' };
    // Der Host kann Songs für andere eintragen, z. B. für Gäste ohne Handy
    const lead = player.isHost && singerId ? this.lobby.players.get(singerId) : player;
    if (!lead) return { error: 'Diesen Sänger gibt es nicht.' };
    const singers = [lead.id];
    if (partnerId && partnerId !== lead.id) {
      if (!this.lobby.players.has(partnerId)) return { error: 'Diesen Duettpartner gibt es nicht.' };
      singers.push(partnerId);
    }
    if (!player.isHost) {
      const queued = this.songs.filter((s) => s.addedBy === player.id).length;
      if (queued >= this.settings.maxQueued) return { error: `Du hast schon ${queued} ${queued === 1 ? 'Song' : 'Songs'} in der Warteschlange.` };
    }
    this.seq++;
    const song = {
      id: `s${this.seq}`,
      title: name,
      source: link?.source || (source === 'spotify' ? 'spotify' : 'youtube'),
      videoId: link?.videoId || null,
      trackId: link?.trackId || null,
      meta: link?.trackId ? cleanMeta(track) : null,
      lyrics: null,
      lyricsStatus: 'none', // none | pending | synced | plain | missing
      offsetMs: 0,
      singers,
      addedBy: player.id,
      addedAt: Date.now() + this.seq / 1000,
      pinned: 0,
    };
    this.songs.push(song);
    this.loadLyrics(song);
    return { ok: true };
  }

  remove(player, songId) {
    const song = this.songById(songId);
    if (!song) return { error: 'Diesen Song gibt es nicht mehr.' };
    if (!this.canEdit(player, song)) return { error: 'Das ist nicht dein Song.' };
    this.songs = this.songs.filter((s) => s !== song);
    return { ok: true };
  }

  // Link nachtragen oder austauschen, z. B. wenn ein Video nicht eingebettet werden darf
  setVideo(player, songId, url, track) {
    const song = songId === this.current?.id ? this.current : this.songById(songId);
    if (!song) return { error: 'Diesen Song gibt es nicht mehr.' };
    if (!this.canEdit(player, song)) return { error: 'Das ist nicht dein Song.' };
    const link = parseLink(url);
    if (!link) return { error: 'Das ist weder ein YouTube- noch ein Spotify-Link.' };
    const changedTrack = link.trackId !== song.trackId;
    Object.assign(song, link);
    if (changedTrack) {
      song.meta = cleanMeta(track);
      song.offsetMs = 0;
      this.loadLyrics(song);
    }
    return { ok: true };
  }

  // Spotify liefert keine Texte: Sie kommen aus LRCLIB, sobald der Song eingetragen ist
  async loadLyrics(song) {
    song.lyrics = null;
    if (song.source !== 'spotify' || !song.trackId) {
      song.lyricsStatus = 'none';
      return;
    }
    const trackId = song.trackId;
    song.lyricsStatus = 'pending';
    const { lyrics: source, spotify: api } = Karaoke.deps;
    let found = null;
    try {
      if (!song.meta?.name && api.enabled()) song.meta = await api.trackInfo(trackId);
      found = await source.find({ title: song.title, ...(song.meta || {}) });
    } catch (err) {
      console.warn(`Songtext für „${song.title}“ nicht geladen: ${err.message}`);
    }
    if (song.trackId !== trackId) return;
    song.lyrics = found;
    song.lyricsStatus = found ? found.kind : 'missing';
    this.lobby.broadcast?.();
  }

  // Host: Text gegenüber der Musik verschieben (z. B. bei Karaoke-Versionen mit längerem Intro)
  shiftLyrics(deltaMs) {
    if (!this.current) return { error: 'Gerade läuft kein Song.' };
    const d = Math.round(Number(deltaMs));
    if (!Number.isFinite(d)) return { error: 'Ungültiger Wert.' };
    this.current.offsetMs = Math.min(Math.max(this.current.offsetMs + d, -30000), 30000);
    return { ok: true };
  }

  bump(songId) {
    const song = this.songById(songId);
    if (!song) return { error: 'Diesen Song gibt es nicht mehr.' };
    song.pinned = Date.now();
    return { ok: true };
  }

  play(songId) {
    if (this.phase === 'singing') return { error: 'Es läuft schon ein Song.' };
    if (this.phase === 'final') return { error: 'Der Karaoke-Abend ist vorbei.' };
    if (this.phase === 'rating') this.closeRating();
    const song = songId ? this.songById(songId) : this.queue()[0];
    if (!song) return { error: 'Die Warteschlange ist leer.' };
    this.songs = this.songs.filter((s) => s !== song);
    this.current = song;
    this.ratings = new Map();
    this.reactions = [];
    this.lastResult = null;
    this.phase = 'singing';
    return { ok: true };
  }

  // Alle Mitspieler außer den Sängern bewerten
  raters() {
    if (!this.current) return [];
    return this.players().filter((p) => !this.current.singers.includes(p.id));
  }

  ended(player, songId) {
    if (this.phase !== 'singing' || (songId && songId !== this.current.id)) return { ok: true };
    if (!player.isHost && !this.current.singers.includes(player.id)) return { error: 'Nur die Sänger oder der Host beenden den Song.' };
    if (this.settings.rating && this.raters().length) {
      this.phase = 'rating';
      this.checkAllRated();
    } else {
      this.closeRating();
    }
    return { ok: true };
  }

  rate(player, stars) {
    if (!['singing', 'rating'].includes(this.phase) || !this.settings.rating) return { error: 'Gerade wird nicht bewertet.' };
    if (!this.raters().includes(player)) return { error: 'Den eigenen Auftritt bewertest du nicht.' };
    const n = Math.round(Number(stars));
    if (!Number.isInteger(n) || n < 1 || n > 5) return { error: 'Bitte 1 bis 5 Sterne.' };
    this.ratings.set(player.id, n);
    this.checkAllRated();
    return { ok: true };
  }

  checkAllRated() {
    if (this.phase !== 'rating') return;
    const raters = this.raters();
    if (raters.every((p) => this.ratings.has(p.id))) this.closeRating();
  }

  closeRating() {
    if (!this.current) return;
    const stars = [...this.ratings.values()];
    const result = {
      id: this.current.id,
      title: this.current.title,
      source: this.current.source,
      videoId: this.current.videoId,
      trackId: this.current.trackId,
      singers: this.current.singers,
      votes: stars.length,
      average: this.settings.rating ? average(stars) : null,
    };
    this.history.push(result);
    this.lastResult = result;
    this.current = null;
    this.ratings = new Map();
    this.reactions = [];
    this.phase = 'queue';
  }

  // Host: Song abbrechen, ohne dass er gewertet wird
  skip() {
    if (this.phase !== 'singing' && this.phase !== 'rating') return;
    this.current = null;
    this.ratings = new Map();
    this.reactions = [];
    this.phase = 'queue';
  }

  react(player, emoji) {
    if (this.phase !== 'singing') return { error: 'Gerade singt niemand.' };
    if (!REACTIONS.includes(emoji)) return { error: 'Unbekannte Reaktion.' };
    const now = Date.now();
    if (now - (this.lastReaction.get(player.id) || 0) < REACTION_GAP_MS) return { ok: true };
    this.lastReaction.set(player.id, now);
    this.seq++;
    this.reactions = this.reactions.filter((r) => now - r.at < REACTION_MS);
    this.reactions.push({ id: this.seq, playerId: player.id, emoji, at: now });
    return { ok: true };
  }

  finish() {
    if (this.phase === 'rating') this.closeRating();
    this.current = null;
    this.phase = 'final';
  }

  next() {
    // „Weiter“ aus der Hostleiste spielt den nächsten Song
    this.play();
  }

  action(player, { type, ...data }) {
    const hostOnly = ['bump', 'play', 'skip', 'finish', 'closeRating', 'offset'];
    if (hostOnly.includes(type) && !player.isHost) return { error: 'Nur der Host darf das.' };
    switch (type) {
      case 'add': return this.add(player, data);
      case 'remove': return this.remove(player, data.songId);
      case 'video': return this.setVideo(player, data.songId, data.url, data.track);
      case 'offset': return this.shiftLyrics(data.deltaMs);
      case 'bump': return this.bump(data.songId);
      case 'play': return this.play(data.songId);
      case 'ended': return this.ended(player, data.songId);
      case 'rate': return this.rate(player, data.stars);
      case 'react': return this.react(player, data.emoji);
      case 'closeRating':
        if (this.phase === 'rating') this.closeRating();
        return { ok: true };
      case 'skip': this.skip(); return { ok: true };
      case 'finish': this.finish(); return { ok: true };
      default: return { error: 'Unbekannte Aktion.' };
    }
  }

  playersChanged() {
    this.checkAllRated();
  }

  // Rangliste nach durchschnittlicher Bewertung pro Sänger
  ranking() {
    const stats = new Map();
    for (const h of this.history) {
      for (const id of h.singers) {
        if (!stats.has(id)) stats.set(id, { playerId: id, songs: 0, scores: [] });
        const s = stats.get(id);
        s.songs++;
        if (h.average !== null) s.scores.push(h.average);
      }
    }
    return [...stats.values()]
      .map((s) => ({ playerId: s.playerId, songs: s.songs, average: average(s.scores) }))
      .sort((a, b) => (b.average ?? -1) - (a.average ?? -1) || b.songs - a.songs);
  }

  publicSong(song, viewer) {
    return {
      id: song.id,
      title: song.title,
      source: song.source,
      videoId: song.videoId,
      trackId: song.trackId,
      lyricsStatus: song.lyricsStatus,
      singers: song.singers,
      mine: song.addedBy === viewer.id || song.singers.includes(viewer.id),
      editable: this.canEdit(viewer, song),
    };
  }

  view(viewer) {
    const now = Date.now();
    const raters = this.raters();
    const view = {
      phase: this.phase,
      queue: this.queue().map((s) => this.publicSong(s, viewer)),
      myQueued: this.songs.filter((s) => s.addedBy === viewer.id).length,
      current: this.current ? this.publicSong(this.current, viewer) : null,
      isSinger: Boolean(this.current?.singers.includes(viewer.id)),
      canRate: this.settings.rating && raters.includes(viewer),
      myRating: this.ratings.get(viewer.id) ?? null,
      raters: raters.map((p) => ({ id: p.id, done: this.ratings.has(p.id) })),
      reactions: this.reactions.filter((r) => now - r.at < REACTION_MS),
      lastResult: this.lastResult,
      sungCount: this.history.length,
      serverNow: now,
    };
    // Den Text braucht nur die Bühne
    if (viewer.isHost && this.current?.source === 'spotify') {
      view.lyrics = this.current.lyrics;
      view.offsetMs = this.current.offsetMs;
    }
    if (this.phase === 'final') {
      view.history = this.history;
      view.ranking = this.ranking();
    }
    return view;
  }

  dispose() {}
}

// Austauschbar für Tests
Karaoke.deps = { spotify, lyrics };
Karaoke.parseVideoId = parseVideoId;
Karaoke.parseLink = parseLink;
module.exports = Karaoke;
