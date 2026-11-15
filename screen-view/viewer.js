'use strict';
(function () {
  const { PEER_OPTS, PREFIX, norm, pretty, linkType } = window.SVCommon;
  const A = window.SVAnnotate;
  const $ = id => document.getElementById(id);
  // UNIFIED BUILD (private, Nov 10 2026): accessibility copy + AI-helper marks layer, "AI took a picture"
  // notice, color buttons, automatic re-connect, and "computer" instead of "Chromebook" on screen.
  const S = window.SV = { role: 'viewer', room: null, call: null, conn: null, state: 'starting', link: null, ann: A.createSession(), lastSent: null, aiItems: [], snapNotices: [] };
  // Random id for this page only (not stored anywhere). Lets the computer recognise this phone when it re-joins.
  S.vid = (function () { const b = new Uint8Array(9); crypto.getRandomValues(b); return 'v' + [...b].map(x => x.toString(16).padStart(2, '0')).join(''); })();
  const status = t => { $('status').textContent = t; S.state = t; };
  const video = $('v');
  const canvas = $('ann');
  const aiCanvas = $('ann-ai'); // AI helper marks: separate layer under the phone's own drawing layer
  let peer = null, joining = false, sendTimer = 0;
  const AS_AI = new URLSearchParams(location.search).get('as') === 'ai';

  function box() { const c = A.videoContentRect(video); return { width: c.width, height: c.height }; }

  // Keyboard drawing: a yellow cross the arrow keys move (0-1 picture coordinates).
  const kb = S.kb = { x: 0.5, y: 0.5, active: false, on: false };

  function drawCross(ctx, size) {
    const x = kb.x * size.width, y = kb.y * size.height, r = 18;
    ctx.save();
    ctx.lineWidth = 7; ctx.strokeStyle = '#000';
    ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = '#ffd400';
    ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke();
    ctx.restore();
  }

  function redraw() {
    if (!canvas.width) return;
    const fitted = { width: canvas.getBoundingClientRect().width, height: canvas.getBoundingClientRect().height };
    const ctx = canvas.getContext('2d');
    // fitCanvas already set the transform; use CSS pixel size
    const size = S._annSize || fitted;
    A.drawItems(ctx, S.ann.snapshot(), size.width, size.height);
    if (kb.on) drawCross(ctx, size);
  }

  const say = msg => { if (window.SVA11y) window.SVA11y.announce(msg); };
  const pct = n => Math.round(n * 100);
  const TOOL_WORD = { arrow: 'Arrow', circle: 'Circle', highlight: 'Highlight', freehand: 'Draw' };

  function fit() {
    if (!video.videoWidth) return;
    S._annSize = A.fitCanvas(canvas, video);
    S._aiSize = A.fitCanvas(aiCanvas, video);
    redraw();
    redrawAi();
  }

  // --- AI helper marks (read-only on the phone, dashed so they look different from your own) ---
  const KINDS = { arrow: 1, circle: 1, highlight: 1, freehand: 1 };
  const NUMS = ['x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'x', 'y', 'w', 'h'];
  function cleanAi(list) {
    const out = [];
    for (const it of (Array.isArray(list) ? list : []).slice(-50)) {
      if (!it || typeof it !== 'object' || !KINDS[it.kind]) continue;
      const c = { kind: it.kind, by: 'ai', color: typeof it.color === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(it.color) ? it.color : '#ffd400' };
      for (const k of NUMS) if (k in it) c[k] = it.kind === 'highlight' && (k === 'w' || k === 'h') ? A.clamp(Number(it[k]) || 0, -1, 1) : A.clamp(Number(it[k]) || 0, 0, 1);
      if (it.kind === 'freehand') { c.points = (Array.isArray(it.points) ? it.points : []).slice(0, 500).map(p => ({ x: A.clamp(Number(p && p.x) || 0, 0, 1), y: A.clamp(Number(p && p.y) || 0, 0, 1) })); if (!c.points.length) continue; }
      out.push(c);
    }
    return out;
  }
  function redrawAi() {
    if (!S._aiSize) return;
    const { ctx, width, height } = S._aiSize;
    const m = Math.min(width, height);
    ctx.setLineDash([Math.max(14, m * 0.05), Math.max(12, m * 0.04)]); // long dashes, gaps wider than the round line ends
    A.drawItems(ctx, S.aiItems, width, height);
  }
  const NAMES = { arrow: 'arrow', circle: 'circle', highlight: 'highlight box', freehand: 'drawing' };
  function setAiItems(list) {
    S.aiItems = cleanAi(list);
    const el = $('ai-marks-summary');
    const n = S.aiItems.length;
    const said = n ? `The AI helper drew ${n} mark${n === 1 ? '' : 's'} (dashed lines): ${S.aiItems.map(i => NAMES[i.kind]).join(', ')}.` : 'No marks from the AI helper.';
    if (el.textContent !== said) { el.textContent = said; if (n || !el.classList.contains('hidden')) say(said); }
    el.classList.toggle('hidden', !n && !S.aiEverSeen);
    if (n) S.aiEverSeen = true;
    redrawAi();
  }
  S.setAiItems = setAiItems;

  // --- "AI took a picture" notice ---
  function showSnapNotice(m) {
    const d = new Date(m && m.at);
    const at = isNaN(d.getTime()) ? new Date() : d;
    let t;
    try { t = at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }); } catch (e) { t = at.toTimeString().slice(0, 8); }
    S.snapNotices.push(at.toISOString());
    const el = $('ai-snap-notice');
    el.textContent = `AI took a picture at ${t}. It saw only the shared screen.`;
    el.classList.remove('hidden');
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  }

  function sendAnn() {
    const items = S.ann.snapshot();
    S.lastSent = { type: 'annotate', items };
    if (S.conn && S.conn.open) S.conn.send(S.lastSent);
  }

  function sendAnnSoon() {
    if (sendTimer) return;
    sendTimer = setTimeout(() => { sendTimer = 0; sendAnn(); }, 80);
  }
  S.sendAnn = sendAnn;
  S.showTools = on => showTools(on);
  S.redraw = redraw;
  S.fit = fit;

  function showTools(on) {
    $('tools').classList.toggle('hidden', !on);
    $('full').classList.toggle('hidden', !on);
    $('draw-help').classList.toggle('hidden', !on);
    canvas.tabIndex = on ? 0 : -1; // only a Tab stop while there is a screen to draw on
    if (on) say('The shared screen is showing. Drawing tools are below it.');
    if (on) fit();
  }

  function clearVideo() {
    video.srcObject = null; showTools(false);
    if (S._aiSize) S._aiSize.ctx.clearRect(0, 0, S._aiSize.width, S._aiSize.height); // AI marks come back with the picture
  }

  function askCode(msg) { $('ask').classList.remove('hidden'); status(msg); }

  // --- drawing on the overlay ---
  let drawing = false;
  canvas.addEventListener('pointerdown', e => {
    if (!video.srcObject || !video.videoWidth) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    drawing = true;
    const p = A.pointerToNorm(video, e.clientX, e.clientY);
    S.ann.pointerDown(p.x, p.y);
    redraw();
    sendAnnSoon();
  });
  canvas.addEventListener('pointermove', e => {
    if (!drawing) return;
    e.preventDefault();
    const p = A.pointerToNorm(video, e.clientX, e.clientY);
    S.ann.pointerMove(p.x, p.y, box());
    redraw();
    sendAnnSoon();
  });
  function endStroke(e) {
    if (!drawing) return;
    drawing = false;
    if (e) e.preventDefault();
    S.ann.pointerUp(box());
    redraw();
    sendAnn();
  }
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', () => { S.ann.cancelDraft(); drawing = false; redraw(); sendAnn(); });

  // --- keyboard drawing on the overlay ---
  // Show the cross only for keyboard focus (not when a finger or mouse taps the screen).
  canvas.addEventListener('focus', () => { let v = false; try { v = canvas.matches(':focus-visible'); } catch (e) {} kb.on = v; redraw(); });
  canvas.addEventListener('blur', () => { kb.on = false; if (kb.active) { S.ann.cancelDraft(); kb.active = false; sendAnn(); } redraw(); });
  canvas.addEventListener('keydown', e => {
    if (!video.srcObject || !video.videoWidth) return;
    const step = e.shiftKey ? 0.1 : 0.02;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key] || e.key === 'Enter' || e.key === ' ') kb.on = true;
    if (moves[e.key]) {
      e.preventDefault();
      kb.x = A.clamp(kb.x + moves[e.key][0], 0, 1);
      kb.y = A.clamp(kb.y + moves[e.key][1], 0, 1);
      if (kb.active) { S.ann.pointerMove(kb.x, kb.y, box()); sendAnnSoon(); }
      redraw();
      say(`${pct(kb.x)}% across, ${pct(kb.y)}% down.`);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!kb.active) {
        kb.active = true;
        S.ann.pointerDown(kb.x, kb.y);
        redraw(); sendAnnSoon();
        say(`${TOOL_WORD[S.ann.tool] || 'Mark'} started. Move with the arrow keys, then press Enter to finish.`);
      } else {
        kb.active = false;
        const kept = S.ann.pointerUp(box());
        redraw(); sendAnn();
        say(kept ? `${TOOL_WORD[S.ann.tool] || 'Mark'} added. ${S.ann.items.length} mark${S.ann.items.length === 1 ? '' : 's'} on screen.` : 'Too small, so it was not added. Move further before pressing Enter.');
      }
      return;
    }
    if (e.key === 'Escape' && kb.active) {
      e.preventDefault();
      kb.active = false; S.ann.cancelDraft(); redraw(); sendAnn();
      say('Mark cancelled.');
    }
  });

  function setTool(name) {
    say(`${TOOL_WORD[name] || name} tool chosen.`);
    S.ann.setTool(name);
    ['arrow', 'circle', 'highlight', 'draw'].forEach(t => {
      const b = $('tool-' + t);
      const on = t === name || (name === 'freehand' && t === 'draw');
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  $('tool-arrow').addEventListener('click', () => setTool('arrow'));
  $('tool-circle').addEventListener('click', () => setTool('circle'));
  $('tool-highlight').addEventListener('click', () => setTool('highlight'));
  $('tool-draw').addEventListener('click', () => setTool('freehand'));
  // --- color buttons ---
  const COLOR_KEY = 'sv.color';
  function setColor(btn, announce) {
    const c = btn.dataset.color;
    S.ann.setColor(c);
    document.querySelectorAll('.colorrow .color').forEach(b => { const on = b === btn; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    try { localStorage.setItem(COLOR_KEY, btn.id); } catch (e) {}
    if (announce) say(`${btn.textContent.trim()} color chosen. New marks will be ${btn.textContent.trim().toLowerCase()}.`);
  }
  document.querySelectorAll('.colorrow .color').forEach(b => b.addEventListener('click', () => setColor(b, true)));
  try { const saved = localStorage.getItem(COLOR_KEY); const b = saved && /^color-[a-z]+$/.test(saved) && document.getElementById(saved); if (b) setColor(b, false); } catch (e) {}

  $('undo').addEventListener('click', () => {
    if (S.ann.undo()) { redraw(); sendAnn(); say(`Last mark removed. ${S.ann.items.length} left.`); }
    else say('Nothing to undo.');
  });
  $('clear-ann').addEventListener('click', () => { S.ann.clear(); redraw(); sendAnn(); say('All marks cleared.'); });

  $('sendtext').addEventListener('click', () => {
    const text = $('textout').value;
    if (!text) { $('sentnote').textContent = 'Type something first.'; return; }
    if (!(S.conn && S.conn.open)) { $('sentnote').textContent = 'Not connected yet. Wait for the computer.'; return; }
    S.conn.send({ type: 'text', text: String(text) });
    $('sentnote').textContent = 'Sent. The computer can copy it. It will not be typed or run by itself.';
  });

  // --- automatic re-connect after a brief network drop (unified build) ---
  // If the link to the computer drops (Wi-Fi blip, phone switching networks), try to join the same
  // room again a few times, waiting a little longer each time. The computer recognises this page by
  // S.vid and replaces its old entry, so a returning phone is not turned away as "room full".
  S.reconnectDelays = [1000, 2000, 3000, 5000, 8000, 10000]; // about 29 seconds in total, then give up
  S.reconnects = 0;
  S.connectTimeoutMs = 8000;
  const rc = { tries: 0, timer: 0, discTimer: 0, active: false };
  S.rc = rc;
  function dropped(why) {
    if (!S.room || rc.timer) return;
    clearTimeout(rc.discTimer); rc.discTimer = 0;
    const old = S.conn; S.conn = null;
    if (old) { old.__dead = true; try { old.close(); } catch (e) {} }
    endCall(); clearVideo();
    joining = false;
    if (rc.tries >= S.reconnectDelays.length) {
      rc.active = false; rc.tries = 0;
      S.lastDrop = why;
      askCode('Lost the connection to the computer and could not get it back. Check the Wi-Fi, then press Watch to try again, or scan the new code on the computer.');
      $('codein').value = pretty(S.room);
      say('Connection lost. Could not reconnect.');
      return;
    }
    rc.active = true;
    const wait = S.reconnectDelays[rc.tries++];
    S.lastDrop = why;
    status(`Connection dropped. Reconnecting automatically… (try ${rc.tries} of ${S.reconnectDelays.length})`);
    rc.timer = setTimeout(() => { rc.timer = 0; join(S.room); }, wait);
  }
  // When the phone says it is back online, try right away instead of waiting.
  window.addEventListener('online', () => { if (rc.timer) { clearTimeout(rc.timer); rc.timer = 0; join(S.room); } });

  function join(raw) {
    const code = norm(raw);
    if (code.length !== 8) { askCode('That code should have 8 letters/numbers. Try again.'); return; }
    if (joining) return; joining = true;
    $('ask').classList.add('hidden');
    S.room = code;
    history.replaceState(null, '', '#' + code);
    if (!rc.active) status('Connecting to the computer…');
    if (peer) peer.destroy();
    const me = peer = new Peer(PEER_OPTS);
    me.on('open', () => {
      if (peer !== me) return;
      const conn = me.connect(PREFIX + code, { reliable: true });
      S.conn = conn;
      // While re-connecting, don't wait forever on a link that never opens (e.g. the computer page is gone
      // but the free helper server has not noticed yet): count it as a failed try and move on.
      if (rc.active) setTimeout(() => { if (S.conn === conn && !conn.open && !conn.__dead && rc.active) dropped('connect-timeout'); }, S.connectTimeoutMs);
      conn.on('open', () => {
        if (conn.__dead) return;
        conn.send({ type: 'hello', as: AS_AI ? 'ai' : 'phone', vid: S.vid });
        if (rc.active) { S.reconnects++; say('Reconnected to the computer.'); }
        rc.active = false; rc.tries = 0; joining = false;
        status(S.reconnects && !S.call ? `Reconnected to room ${pretty(code)}. Waiting for the computer…` : `Joined room ${pretty(code)}. Waiting for the computer…`);
        // Our own marks come back too, so the computer sees the same picture as before the drop.
        if (S.ann.items.length) sendAnn();
      });
      conn.on('data', m => {
        if (!m || typeof m !== 'object' || conn.__dead) return;
        if (m.type === 'full') { conn.__dead = true; status('This room already has the most viewers allowed.'); }
        if (m.type === 'waiting') status('Connected to the computer. Waiting for it to click "Share my screen"…');
        if (m.type === 'bye') { endCall(); clearVideo(); status('The computer stopped sharing. Leave this page open; it will show again when sharing restarts.'); }
        if (m.type === 'ai-marks') setAiItems(m.items);
        if (m.type === 'ai-snapshot') showSnapNotice(m);
        if (m.type === 'ai-guidance' && window.SVAnswer) window.SVAnswer.show(m, 'the AI helper on the computer'); // VOICE-AI BUILD: answer words (shown + read aloud if on)
      });
      conn.on('close', () => { if (conn.__dead || S.conn !== conn) return; dropped('closed'); });
      conn.on('iceStateChanged', st => {
        if (conn.__dead || S.conn !== conn) return;
        if (st === 'failed' || st === 'closed') dropped('ice-' + st);
        else if (st === 'disconnected') { clearTimeout(rc.discTimer); rc.discTimer = setTimeout(() => { if (S.conn === conn) dropped('ice-disconnected'); }, 5000); }
        else if (st === 'connected' || st === 'completed') { clearTimeout(rc.discTimer); rc.discTimer = 0; }
      });
    });
    me.on('call', call => {
      endCall();
      S.call = call;
      call.answer();
      call.on('stream', st => {
        video.srcObject = st;
        video.play().catch(() => {});
        showTools(true);
        video.addEventListener('loadedmetadata', fit, { once: true });
      });
      call.on('close', () => { if (S.call === call) { S.call = null; clearVideo(); } });
      const pc = call.peerConnection;
      if (pc) pc.addEventListener('connectionstatechange', async () => {
        if (call !== S.call) return;
        const st = pc.connectionState;
        if (st === 'connected') { clearTimeout(rc.discTimer); rc.discTimer = 0; S.link = await linkType(pc); status(`Showing the computer screen (${S.link} link).`); }
        else if (st === 'failed') dropped('video-failed');
        else if (st === 'disconnected') {
          status('Connection dropped. Waiting a moment…');
          clearTimeout(rc.discTimer);
          rc.discTimer = setTimeout(() => { if (call === S.call && pc.connectionState !== 'connected') dropped('video-disconnected'); }, 5000);
        }
      });
    });
    me.on('disconnected', () => { if (!me.destroyed) me.reconnect(); });
    me.on('error', err => {
      if (peer !== me) return;
      joining = false;
      const net = ['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type);
      if (rc.active && (err.type === 'peer-unavailable' || net)) { dropped(err.type); return; }
      if (err.type === 'peer-unavailable') askCode('Room not found. Check the code, or reload the computer page for a new one.');
      else if (net) status('Could not reach the free connection helper (PeerJS). Check the internet and reload.');
      else status('Problem: ' + err.type + '. Reload to try again.');
    });
  }
  function endCall() { if (S.call) { const c = S.call; S.call = null; try { c.close(); } catch (e) {} } }

  $('go').addEventListener('click', () => join($('codein').value));
  $('codein').addEventListener('keydown', e => { if (e.key === 'Enter') join($('codein').value); });
  // Full screen the stage (video + marks), not the video alone, so drawings stay visible.
  $('full').addEventListener('click', () => {
    const el = $('stage');
    const fn = el.requestFullscreen || el.webkitRequestFullscreen || video.requestFullscreen || video.webkitEnterFullscreen;
    if (fn) fn.call(el.requestFullscreen || el.webkitRequestFullscreen ? el : video);
  });
  document.addEventListener('fullscreenchange', fit);
  window.addEventListener('resize', fit);
  if (typeof ResizeObserver === 'function') new ResizeObserver(fit).observe($('stage'));

  window.addEventListener('pagehide', () => { if (peer) peer.destroy(); });

  const fromLink = location.hash.slice(1);
  if (fromLink) join(fromLink);
  else { askCode('Type the code shown on the computer.'); $('codein').focus(); }
})();
