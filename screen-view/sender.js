'use strict';
// PROPOSED (not live): multi-viewer sender with annotation overlay and a big Copy button.
// Marks and text are only shown. They are never typed or run automatically.
// UNIFIED BUILD (private, Nov 10 2026): accessibility copy (accessibility-2026-11-10) merged with the
// integration copy (integration-2026-11-10): two mark layers (phone + AI helper), window.SVSender,
// 'sv:sharing' / 'sv:marks' / 'sv:copied' events. New here: AI marks and "AI took a picture" notices
// are passed on to the phones; a phone coming back after a network drop replaces its own old entry
// (matched by its per-page viewer id) even if the room looks full.
// POLISH BUILD (private, Nov 10 2026): after the browser's share box, check what was picked (share-rule.js):
// one tab or one window is allowed, the whole screen is refused, and a warning shows if the browser doesn't say.
(function () {
  const { PEER_OPTS, PREFIX, pretty, newCode, linkType } = window.SVCommon;
  const A = window.SVAnnotate;
  const $ = id => document.getElementById(id);
  const VID_OK = s => typeof s === 'string' && /^[A-Za-z0-9_-]{6,40}$/.test(s);
  const HOLD_MS = 1500; // how long a connection to a full room may wait for its hello
  const S = window.SV = { role: 'sender', room: null, stream: null, viewers: new Map(), state: 'starting', link: null, annItems: [], phoneItems: [], aiItems: [], lastText: '', lastCopy: '', maxViewers: 3 };
  // RC2 BUILD (Nov 10 2026, Pro gate from packaging-2026-11-10): free = 1 phone viewer, Pro = up to 3 (pro.js).
  // Setting SV.maxViewers can only LOWER the limit (tests use it); it can never go past what Pro allows.
  let viewerCap = 3;
  Object.defineProperty(S, 'maxViewers', { enumerable: true, get: () => Math.min(viewerCap, window.SVPro ? window.SVPro.maxViewers() : 3), set: (n) => { viewerCap = Math.max(1, Math.min(3, n | 0)); } });
  const status = t => { $('status').textContent = t; S.state = t; };
  let peer = null, fadeTimer = 0;
  const preview = $('preview');
  const canvas = $('ann-in');

  const names = () => [...S.viewers.values()].filter(v => v.conn.open).map(v => v.name);

  function redraw() {
    if (!S._annSize) return;
    A.drawItems(S._annSize.ctx, S.annItems, S._annSize.width, S._annSize.height);
  }

  function fit() {
    if (!preview.videoWidth) return;
    S._annSize = A.fitCanvas(canvas, preview);
    redraw();
  }

  function pulse() {
    const stage = $('preview-stage');
    stage.classList.remove('fresh');
    void stage.offsetWidth;
    stage.classList.add('fresh');
    if (fadeTimer) clearTimeout(fadeTimer);
    fadeTimer = setTimeout(() => stage.classList.remove('fresh'), 1500);
  }

  // Plain-words summary of marks for screen readers, e.g. "The phone drew 2 marks: arrow, circle."
  const NAMES = { arrow: 'arrow', circle: 'circle', highlight: 'highlight box', freehand: 'drawing' };
  function describeList(who, items) {
    return `${who} drew ${items.length} mark${items.length === 1 ? '' : 's'}: ` + items.map(i => NAMES[i.kind] || 'mark').join(', ') + '.';
  }
  function describeAnn() {
    const phone = S.phoneItems.length ? describeList('The phone', S.phoneItems) : 'No marks from the phone.';
    return S.aiItems.length ? phone + ' ' + describeList('The AI helper', S.aiItems) : phone;
  }
  let lastAnnSaid = '';

  function emitMarks() {
    try { window.dispatchEvent(new CustomEvent('sv:marks', { detail: { items: S.annItems.slice() } })); } catch (e) {}
  }

  // Phone marks and AI marks are separate layers so one never wipes out the other.
  function showLayers(opts) {
    showAnn(S.phoneItems.concat(S.aiItems), opts);
  }

  function showAnn(items, { pulseIfNew } = { pulseIfNew: true }) {
    S.annItems = Array.isArray(items) ? items : [];
    emitMarks();
    const said = describeAnn();
    $('ann-summary').textContent = said;
    if (said !== lastAnnSaid && window.SVA11y) { lastAnnSaid = said; window.SVA11y.announce(said); }
    if (S.stream) {
      $('preview-box').classList.remove('hidden');
      fit();
      redraw();
      if (pulseIfNew && S.annItems.length) pulse();
    }
  }

  function showText(text, from) {
    S.lastText = String(text);
    $('got-text').textContent = S.lastText; // text only; never innerHTML
    $('text-box').classList.remove('hidden');
    const chip = $('text-chip');
    chip.classList.remove('hidden');
    chip.textContent = S.lastText.length > 80 ? S.lastText.slice(0, 80) + '…' : S.lastText;
    $('copy-status').textContent = `New text arrived from the ${from || 'phone'}. Press Copy to copy it. Nothing was typed or run.`;
  }

  async function refresh() {
    const n = names();
    $('watchers').textContent = n.length ? 'Watching now: ' + n.join(', ') : 'Nobody is watching.';
    if (!S.stream) { status(n.length ? `${n.join(' and ')} connected and waiting. Click "Share my screen".` : 'Ready. Click "Share my screen". Then open the link on the phone.'); return; }
    const live = [...S.viewers.values()].filter(v => v.call && v.call.peerConnection && v.call.peerConnection.connectionState === 'connected');
    if (!live.length) { status(n.length ? 'Sending…' : 'Sharing is ready. Now open the link on the phone (scan the square code).'); return; }
    const kinds = await Promise.all(live.map(v => linkType(v.call.peerConnection)));
    status(`Sharing to ${live.map(v => v.name).join(' and ')} (${[...new Set(kinds)].join('/')} link).`);
  }

  function handleData(m) {
    const parsed = A.parseMessage(m);
    if (!parsed) return;
    if (parsed.kind === 'annotate') { S.phoneItems = parsed.items; showLayers(); }
    if (parsed.kind === 'text') showText(parsed.text);
  }

  S.handleData = handleData; // used by the accessibility tests to feed a message without a phone

  function start(tries) {
    const code = newCode();
    peer = new Peer(PREFIX + code, PEER_OPTS);
    peer.on('open', () => {
      S.room = code;
      S.link = new URL('view.html#' + code, location.href).href;
      $('code').textContent = pretty(code);
      $('link').textContent = S.link;
      try { const q = qrcode(0, 'M'); q.addData(S.link); q.make(); $('qr').innerHTML = q.createImgTag(8, 0, 'QR code to open the viewer on the phone'); }
      catch (e) { $('qr').classList.add('hidden'); }
      $('share').disabled = false;
      if ($('share-other')) $('share-other').disabled = false;
      refresh();
    });
    peer.on('connection', conn => {
      const v = { conn, call: null, name: 'phone', vid: null, admitted: false };
      let holdTimer = 0;
      const roomFull = () => S.viewers.size >= S.maxViewers;
      function admit() {
        if (v.admitted) return;
        v.admitted = true; clearTimeout(holdTimer);
        S.viewers.set(conn.peer, v);
        if (conn.open) { if (S.stream) callViewer(v); else conn.send({ type: 'waiting' }); sendAiState(v); }
        refresh();
      }
      function refuse() {
        clearTimeout(holdTimer);
        try { conn.send({ type: 'full' }); } catch (e) {}
        setTimeout(() => { try { conn.close(); } catch (e) {} }, 500);
      }
      conn.on('data', m => {
        if (m && m.type === 'hello') {
          if (VID_OK(m.vid)) {
            v.vid = m.vid;
            // Same phone page coming back after a network drop: forget its old (stale) entry.
            for (const [key, old] of [...S.viewers]) {
              if (old !== v && old.vid === m.vid) { endCall(old); S.viewers.delete(key); try { old.conn.close(); } catch (e) {} S.rejoins = (S.rejoins || 0) + 1; }
            }
          }
          if (m.as === 'ai') v.name = 'AI helper';
          if (!v.admitted) { if (roomFull()) refuse(); else admit(); }
          refresh();
          return;
        }
        if (!v.admitted) return;
        handleData(m);
      });
      conn.on('open', () => {
        if (!roomFull()) admit();
        else holdTimer = setTimeout(() => { if (!v.admitted) refuse(); }, HOLD_MS); // wait for a hello from a returning phone
      });
      const gone = () => { clearTimeout(holdTimer); if (S.viewers.get(conn.peer) !== v) return; endCall(v); S.viewers.delete(conn.peer); refresh(); };
      conn.on('close', gone);
      conn.on('iceStateChanged', st => { if (st === 'failed' || st === 'closed') gone(); });
    });
    peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
    peer.on('error', err => {
      if (err.type === 'unavailable-id' && tries < 3) { peer.destroy(); start(tries + 1); return; }
      if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type))
        status('Could not reach the free connection helper (PeerJS). Check the internet, then reload this page.');
      else if (err.type !== 'peer-unavailable') status('Problem: ' + err.type + '. Reload this page to try again.');
    });
  }

  function endCall(v) { if (v.call) { try { v.call.close(); } catch (e) {} v.call = null; } }
  function callViewer(v) {
    endCall(v);
    const call = v.call = peer.call(v.conn.peer, S.stream);
    const pc = call.peerConnection;
    if (pc) pc.addEventListener('connectionstatechange', () => { if (v.call === call) refresh(); });
    refresh();
  }

  // Nov 15 2026 (share-friction fix): "Share my screen" = one-click "Share this tab?" (preferCurrentTab).
  // "Share a different tab" = Chrome's full tab list. getDisplayMedia is called first thing inside the click
  // (no await before it), because Chrome only allows it straight after a user's click.
  async function share(ev, other) {
    // POLISH BUILD: share-surface rule (share-rule.js). Tab or window only; whole screen refused.
    const R = window.SVShareRule;
    shareNote('', '');
    let got = null;
    const first = other ? R.otherTabOptions({ frameRate: 15 }) : R.displayMediaOptions({ frameRate: 15 });
    try { got = await navigator.mediaDevices.getDisplayMedia(first); }
    catch (e) {
      // A browser that rejects some hint names: try again with fewer hints (keeping preferCurrentTab).
      if (e && e.name === 'TypeError') {
        for (const opt of R.fallbackOptions({ frameRate: 15 }, !other)) {
          try { got = await navigator.mediaDevices.getDisplayMedia(opt); S.usedFallback = true; break; }
          catch (e2) { if (!(e2 && e2.name === 'TypeError')) break; }
        }
        if (!got) { status('Sharing was cancelled. Nothing was shared.'); return; }
      } else { status('Sharing was cancelled. Nothing was shared.'); return; }
    }
    const verdict = R.judgeTrack(got.getVideoTracks()[0]);
    S.lastShareVerdict = verdict;
    if (verdict.verdict === 'refuse') {
      // Stop at once, before anything is sent to any phone or the AI helper.
      got.getTracks().forEach(t => t.stop());
      status('Nothing was shared: whole screen is not allowed. Pick one tab or one window.');
      shareNote(verdict.message, 'refuse');
      $('share').focus();
      return;
    }
    S.stream = got;
    if (verdict.verdict === 'warn' || verdict.verdict === 'allow-note') shareNote(verdict.message, verdict.verdict);
    S.stream.getVideoTracks()[0].addEventListener('ended', stop);
    $('share').classList.add('hidden'); if ($('share-other')) $('share-other').classList.add('hidden'); $('stop').classList.remove('hidden'); $('stop').focus();
    preview.srcObject = S.stream;
    preview.play().catch(() => {});
    $('preview-box').classList.remove('hidden');
    preview.addEventListener('loadedmetadata', fit, { once: true });
    for (const v of S.viewers.values()) if (v.conn.open) callViewer(v);
    if (S.annItems.length) { fit(); redraw(); }
    refresh();
    sharingEvent(true);
  }

  function shareNote(text, kind) {
    const n = $('share-note'); if (!n) return;
    n.textContent = text; n.className = 'share-note' + (kind ? ' ' + kind : '') + (text ? '' : ' hidden');
  }

  function stop() {
    shareNote('', '');
    if (S.stream) S.stream.getTracks().forEach(t => t.stop());
    S.stream = null;
    preview.srcObject = null;
    $('preview-box').classList.add('hidden');
    for (const v of S.viewers.values()) { endCall(v); if (v.conn.open) v.conn.send({ type: 'bye' }); }
    $('stop').classList.add('hidden'); $('share').classList.remove('hidden'); if ($('share-other')) $('share-other').classList.remove('hidden'); $('share').focus();
    status('Stopped. Nothing is being shared. Click "Share my screen" to start again.');
    sharingEvent(false);
  }

  $('clear-ann').addEventListener('click', () => { S.phoneItems = []; S.aiItems = []; showLayers({ pulseIfNew: false }); broadcast({ type: 'ai-marks', items: [] }); });

  function sharingEvent(on) {
    try { window.dispatchEvent(new CustomEvent('sv:sharing', { detail: { sharing: !!on } })); } catch (e) {}
  }

  // Send one message to every phone that is connected (not to refused or waiting connections).
  function broadcast(msg) {
    let n = 0;
    for (const v of S.viewers.values()) if (v.conn.open) { try { v.conn.send(msg); n++; } catch (e) {} }
    return n;
  }
  // A phone that joins (or re-joins) late still gets the AI helper's current marks.
  function sendAiState(v) { if (S.aiItems.length) try { v.conn.send({ type: 'ai-marks', items: S.aiItems.slice() }); } catch (e) {} }

  window.SVSender = {
    showText,
    setAiItems(items) {
      S.aiItems = Array.isArray(items) ? items.slice() : [];
      showLayers();
      broadcast({ type: 'ai-marks', items: S.aiItems.slice() }); // phones draw these on their own AI layer
    },
    getAiItems() { return S.aiItems.slice(); },
    getItems() { return S.annItems.slice(); },
    isSharing() { return !!S.stream; },
    broadcast
  };

  $('copy-text').addEventListener('click', async () => {
    const text = S.lastText;
    if (!text) { $('copy-status').textContent = 'Nothing to copy yet.'; return; }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(text);
      else {
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
      }
      S.lastCopy = text;
      try { window.dispatchEvent(new CustomEvent('sv:copied', { detail: { text } })); } catch (e) {}
      $('copy-status').textContent = 'Copied. You can paste it where you need it.';
    } catch (e) {
      $('copy-status').textContent = 'Could not copy automatically. Select the text and copy it yourself.';
    }
  });

  $('text-chip').addEventListener('dragstart', e => {
    const text = S.lastText;
    if (!text) { e.preventDefault(); return; }
    e.dataTransfer.setData('text/plain', text);
    e.dataTransfer.effectAllowed = 'copy';
  });

  window.addEventListener('resize', fit);
  if (typeof ResizeObserver === 'function') new ResizeObserver(fit).observe($('preview-stage'));

  $('share').addEventListener('click', (e) => share(e, false));
  if ($('share-other')) $('share-other').addEventListener('click', (e) => share(e, true));
  $('stop').addEventListener('click', stop);
  window.addEventListener('pagehide', () => { if (peer) peer.destroy(); });
  start(0);
})();
