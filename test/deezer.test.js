// Tests für die Deezer-Vorschau mit nachgebauter API: node --test

const test = require('node:test');
const assert = require('node:assert');
const deezer = require('../server/deezer');

function fakeFetch(routes) {
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    const route = routes.find(([pattern]) => url.includes(pattern));
    const body = route ? route[1](url) : { error: { type: 'DataException', message: 'no data' } };
    return { ok: true, json: async () => body };
  };
  return calls;
}

test.afterEach(() => { delete global.fetch; });

test('sucht Hauptinterpret und Titel ohne Klammerzusatz', async () => {
  const calls = fakeFetch([['/search', () => ({ data: [{ id: 1, preview: '' }, { id: 2, preview: 'https://cdn/x.mp3' }] })]]);
  const url = await deezer.previewUrl({ artist: 'Mark Ronson feat. Bruno Mars', title: '(I Can’t) Uptown Funk' });
  assert.strictEqual(url, 'https://cdn/x.mp3');
  const q = decodeURIComponent(calls[0].split('q=')[1]);
  assert.strictEqual(q, 'artist:"Mark Ronson" track:"Uptown Funk"');
});

test('holt beim zweiten Mal eine frische Adresse über die Track-ID', async () => {
  fakeFetch([['/search', () => ({ data: [{ id: 7, preview: 'https://cdn/alt.mp3' }] })]]);
  const song = { artist: 'ABBA', title: 'Waterloo' };
  await deezer.previewUrl(song);
  const calls = fakeFetch([['/track/7', () => ({ id: 7, preview: 'https://cdn/neu.mp3' })]]);
  assert.strictEqual(await deezer.previewUrl(song), 'https://cdn/neu.mp3');
  assert.strictEqual(calls.length, 1);
});

test('freie Suche, wenn die genaue Suche nichts findet', async () => {
  const calls = fakeFetch([['/search', (url) => (url.includes('artist%3A') ? { data: [] } : { data: [{ id: 3, preview: 'https://cdn/y.mp3' }] })]]);
  assert.strictEqual(await deezer.previewUrl({ artist: 'Nena', title: '99 Luftballons' }), 'https://cdn/y.mp3');
  assert.strictEqual(calls.length, 2);
});

test('nichts gefunden', async () => {
  fakeFetch([['/search', () => ({ data: [] })]]);
  assert.strictEqual(await deezer.previewUrl({ artist: 'Niemand', title: 'Nichts' }), null);
});
