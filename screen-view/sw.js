// Screen-View service worker (packaging build, private; RC2 BUILD Nov 10 2026: shell list now covers every
// rc file: a11y.js, share-rule.js, voice.js, ask.js, answer-view.js, ask-reader.js and its reader/ modules).
// Caches the APP SHELL ONLY: the app's own HTML, scripts, styles, icons and manifest,
// so the pages open even with no internet. Sharing itself always needs a connection.
//
// NEVER cached: shared screen video, snapshots, marks, text, room codes, PeerJS signaling,
// the AI connector, or any other request. Those are either not HTTP fetches at all
// (WebRTC media, WebSockets, blob:/data: URLs) or are passed straight through below
// without being stored. Only same-origin GET requests for the exact files in SHELL are
// answered from the cache, and only those files are ever written to it.
'use strict';
const VERSION = 'sv-shell-rc2-2026-11-10-1';
const SHELL = [
  'index.html', 'view.html', 'style.css', 'LICENSES.txt', 'a11y.js', 'ai-marks.js', 'annotate.js',
  'answer-view.js', 'ask-reader.js', 'ask.js', 'common.js', 'connector-link.js', 'ext-bridge.js',
  'manifest.webmanifest', 'peerjs.min.js', 'pro-public-key.js', 'pro-ui.js', 'pro.js', 'qrcode.js',
  'sender.js', 'share-rule.js', 'sw-register.js', 'tab-bridge.js', 'viewer.js', 'voice.js',
  'icons/apple-touch-icon-180.png', 'icons/favicon-32.png', 'icons/icon-128.png', 'icons/icon-144.png',
  'icons/icon-192.png', 'icons/icon-256.png', 'icons/icon-384.png', 'icons/icon-48.png',
  'icons/icon-512.png', 'icons/icon-72.png', 'icons/icon-96.png', 'icons/maskable-192.png',
  'icons/maskable-512.png', 'reader/index.js', 'reader/lib/guidance.js', 'reader/lib/prompt.js',
  'reader/lib/reader.js', 'reader/lib/snapshot.js', 'reader/providers/adapter-base.js',
  'reader/providers/claude.js', 'reader/providers/grok.js', 'reader/providers/mock.js',
  'reader/providers/openai-compatible.js', 'reader/providers/openai.js'
];
const SCOPE = new URL('./', self.location.href);
const SHELL_PATHS = new Set(SHELL.map((p) => new URL(p, SCOPE).pathname));
const INDEX_PATH = new URL('index.html', SCOPE).pathname;

// Which shell file (by path) a request maps to, or null if it is not part of the shell.
function shellPath(url) {
  if (url.origin !== self.location.origin) return null;
  let p = url.pathname;
  if (p === SCOPE.pathname) p = INDEX_PATH; // "/screen-view/" -> index.html
  return SHELL_PATHS.has(p) ? p : null;
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll([...SHELL_PATHS].map((p) => new Request(p, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('sv-shell-') && k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function fromNetworkThenCache(request, path) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(request);
    // Refresh the stored copy of this shell page only (stored by path, never with ?query).
    if (res && res.ok && res.type === 'basic') await cache.put(path, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(path);
    if (hit) return hit;
    throw e;
  }
}

async function fromCacheThenNetwork(request, path) {
  const hit = await (await caches.open(VERSION)).match(path);
  return hit || fetch(request); // not stored: shell assets only change with a new VERSION
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return; // pass through
  const url = new URL(req.url);
  const path = shellPath(url);
  if (!path) return; // not part of the app shell: browser handles it, nothing is cached
  if (req.mode === 'navigate' || path.endsWith('.html')) event.respondWith(fromNetworkThenCache(req, path));
  else event.respondWith(fromCacheThenNetwork(req, path));
});
