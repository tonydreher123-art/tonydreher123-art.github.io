// Glue for the private integration build. Joins:
//   connector (AI helper over WebSocket, via tab-bridge.js)  -> this sharer page
//   phone viewer marks (PeerJS, already in sender.js)         -> this sharer page
//   this sharer page                                          -> browser extension (ext-bridge.js)
// Nothing connects to the AI helper until the person presses "Let an AI helper connect".
// UNIFIED BUILD additions (Nov 10 2026): every picture the AI helper takes shows a yellow
// "AI took a picture at <time>" notice here AND on every connected phone; the pairing code is
// spelled out for screen readers; proposed text is labelled as coming from the AI helper.
'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const CONNECTOR_URL = params.get('connector') || 'ws://127.0.0.1:8940/tab';
  const bridge = window.SVExtBridge.create({ extId: params.get('ext') || undefined });
  const L = window.SVLink = { connector: null, code: null, paired: false, extResults: [], lastProposeId: null, bridge, snapshots: [] };

  // "AI took a picture at 10:41:05 PM" — local clock of the device showing it.
  function timeText(d) {
    try { return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }); }
    catch (e) { return d.toTimeString().slice(0, 8); }
  }
  function noteSnapshot() {
    const at = new Date();
    L.snapshots.push(at.toISOString());
    const n = L.snapshots.length;
    const el = $('ai-snap-notice');
    el.textContent = `AI took a picture at ${timeText(at)}` + (n > 1 ? ` (${n} pictures so far)` : '') + '. It saw only the shared screen.';
    el.classList.remove('hidden');
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    if (window.SVSender && window.SVSender.broadcast) window.SVSender.broadcast({ type: 'ai-snapshot', at: at.toISOString(), count: n });
  }
  L.noteSnapshot = noteSnapshot; // VOICE-AI BUILD: the practice AI helper (ask-reader.js) shows the same notice when it takes a picture.
  // Wrap the normal capture so a notice appears every time a picture is actually taken.
  // Also: no picture at all unless the screen is being shared right now (otherwise the page's
  // fallback would send a picture of the empty marks layer and we would wrongly claim a picture).
  function captureWithNotice(maxWidth) {
    if (window.SVSender && window.SVSender.isSharing && !window.SVSender.isSharing()) return Promise.reject(new Error('The screen is not being shared right now.'));
    return Promise.resolve(window.SVConnector.defaultCapture(maxWidth)).then((pic) => { noteSnapshot(); return pic; });
  }

  function aiStatus(t) { $('ai-status').textContent = t; L.aiState = t; }
  function extStatus(t) { $('ext-status').textContent = 'Browser helper extension: ' + t; L.extState = t; }

  async function forwardToExtension(items) {
    const r = await bridge.send(window.SVMarks.toListMessage(items));
    L.extResults.push(r);
    if (r && r.ok) extStatus(`marks sent to ${r.delivered || 0} tab(s) where the helper is on.`);
    else if (r && r.reason === 'not-installed-or-not-allowed') extStatus('not found (that is fine; marks still show on this page).');
    else extStatus('could not deliver marks (' + (r && r.reason || 'unknown') + ').');
  }

  // Every time the combined marks change (phone or AI), pass them on to the extension.
  window.addEventListener('sv:marks', (e) => { forwardToExtension(e.detail.items); });

  window.addEventListener('sv:sharing', (e) => { if (L.connector) L.connector.setSharing(e.detail.sharing); });
  window.addEventListener('sv:copied', () => { if (L.connector && L.lastProposeId) L.connector.acceptText(L.lastProposeId); });

  function showCode(code) {
    L.code = code;
    $('ai-code').textContent = code || '';
    $('ai-code-spoken').textContent = code ? 'AI helper code: ' + (window.SVA11y ? window.SVA11y.spellCode(code) : code) : '';
    $('ai-code').classList.toggle('hidden', !code);
    $('ai-code-label').classList.toggle('hidden', !code);
  }

  function connect() {
    if (L.connector) return;
    // RC2 BUILD (Pro gate from packaging-2026-11-10): the AI helper is a Pro feature. Nothing connects unless Pro is on.
    if (window.SVPro && !window.SVPro.isPro()) { aiStatus('The AI helper is part of Screen-View Pro. Enter a Pro key in the Pro box below.'); return; }
    if (!window.SVConnector) { aiStatus('The AI helper script is missing.'); return; }
    const c = L.connector = window.SVConnector.connect(CONNECTOR_URL, { capture: captureWithNotice });
    c.on('code', (m) => { showCode(m.code); L.paired = false; aiStatus('Waiting for the AI helper. Give it the code below. The code works once.'); });
    c.on('paired', () => { L.paired = true; showCode(null); aiStatus('AI helper connected. It can ask for one picture at a time and draw marks. It cannot click or type.'); c.setSharing(window.SVSender.isSharing()); });
    c.on('unpaired', () => { L.paired = false; window.SVSender.setAiItems([]); aiStatus('AI helper disconnected.'); });
    c.on('annotate', (m) => {
      const next = window.SVMarks.applyConnector(window.SVSender.getAiItems(), m);
      window.SVSender.setAiItems(next);
    });
    c.on('propose', (m) => {
      L.lastProposeId = m.id;
      window.SVSender.showText(String(m.text == null ? '' : m.text), 'AI helper');
      bridge.send({ type: 'text', text: String(m.text == null ? '' : m.text) });
    });
    c.on('closed', () => { if (L.connector === c) { aiStatus('AI helper is off.'); showCode(null); } });
    c.on('error', () => { aiStatus('Could not reach the AI helper connector at ' + CONNECTOR_URL + '.'); });
    c.start();
    $('ai-connect').classList.add('hidden');
    $('ai-stop').classList.remove('hidden');
    aiStatus('Connecting to the AI helper connector…');
  }

  function stop() {
    if (L.connector) { const c = L.connector; L.connector = null; c.disconnect(); }
    L.paired = false; showCode(null);
    window.SVSender.setAiItems([]);
    $('ai-stop').classList.add('hidden');
    $('ai-connect').classList.remove('hidden');
    aiStatus('AI helper is off.');
  }

  $('ai-connect').addEventListener('click', connect);
  $('ai-stop').addEventListener('click', stop);

  bridge.ping().then((r) => {
    if (r && r.ok) extStatus('found (version ' + (r.version || '?') + '). Turn it on in the tab you want marks on.');
    else extStatus('not found. That is fine; marks still show on this page.');
  });
})();
