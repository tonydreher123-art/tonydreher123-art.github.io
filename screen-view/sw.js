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
// RC3 BUILD Nov 14 2026: adds ai-keys.js, ai-key-ui.js, reader/providers/transport.js; real Pro public key.
// AI company requests (api.anthropic.com, api.openai.com, api.x.ai) are other origins: never cached.
// Nov 15, 2026 (upload build): adds pictures.js and site-upload.js. api.github.com is another origin: never cached.
// Nov 15 2026 (-8: Get answer never sends an uploaded picture while sharing). (-7, share-friction fix): every shell file is now fetched from the network first (revalidated, so a
// new deploy shows up on the FIRST open, not the second), with the stored copy used only when offline or slow.
const VERSION = 'sv-shell-rc3-2026-11-15-8';
const SHELL = [
  'index.html', 'view.html', 'style.css', 'LICENSES.txt', 'a11y.js', 'ai-marks.js', 'annotate.js',
  'ai-key-ui.js', 'ai-keys.js', 'answer-view.js', 'ask-reader.js', 'ask.js', 'common.js', 'connector-link.js', 'ext-bridge.js',
  'manifest.webmanifest', 'peerjs.min.js', 'pictures.js', 'pro-public-key.js', 'pro-ui.js', 'pro.js', 'qrcode.js',
  'sender.js', 'share-rule.js', 'site-upload.js', 'sw-register.js', 'tab-bridge.js', 'viewer.js', 'voice.js',
  'icons/apple-touch-icon-180.png', 'icons/favicon-32.png', 'icons/icon-128.png', 'icons/icon-144.png',
  'icons/icon-192.png', 'icons/icon-256.png', 'icons/icon-384.png', 'icons/icon-48.png',
  'icons/icon-512.png', 'icons/icon-72.png', 'icons/icon-96.png', 'icons/maskable-192.png',
  'icons/maskable-512.png', 'reader/index.js', 'reader/lib/guidance.js', 'reader/lib/prompt.js',
  'reader/lib/reader.js', 'reader/lib/snapshot.js', 'reader/providers/adapter-base.js',
  'reader/providers/claude.js', 'reader/providers/grok.js', 'reader/providers/mock.js',
  'reader/providers/openai-compatible.js', 'reader/providers/openai.js', 'reader/providers/transport.js'
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
    // RC3: store each shell file on its own, so one missing file (e.g. the app icons, not yet uploaded to the live
    // site) no longer stops the whole offline copy from installing. Missing files are simply not stored.
    await Promise.allSettled([...SHELL_PATHS].map((p) => cache.add(new Request(p, { cache: 'reload' }))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('sv-shell-') && k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

const SLOW_MS = 6000; // if the network takes longer than this and a stored copy exists, use the stored copy

async function fromNetworkThenCache(request, path) {
  const cache = await caches.open(VERSION);
  // Pages (navigations) must be fetched as they are; other shell files are revalidated with the server
  // (cache: 'no-cache' = ask GitHub "changed?", a tiny 304 if not) so a new deploy is used at once.
  const net = (request.mode === 'navigate' ? fetch(request) : fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' }))
    .then(async (res) => {
      // Refresh the stored copy of this shell file only (stored by path, never with ?query).
      if (res && res.ok && res.type === 'basic') await cache.put(path, res.clone());
      return res;
    });
  net.catch(() => {}); // a late failure after the stored copy was used is not an error
  let timer = 0;
  const slow = new Promise((resolve) => { timer = setTimeout(resolve, SLOW_MS, null); });
  try {
    const first = await Promise.race([net, slow]);
    if (first) return first;
    const hit = await cache.match(path);
    return hit || await net;
  } catch (e) {
    const hit = await cache.match(path);
    if (hit) return hit;
    throw e;
  } finally { clearTimeout(timer); }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return; // pass through
  const url = new URL(req.url);
  const path = shellPath(url);
  if (!path) return; // not part of the app shell: browser handles it, nothing is cached
  event.respondWith(fromNetworkThenCache(req, path)); // Nov 15 2026: network first for every shell file
});
