// Screen-View tab bridge (proposed, not on the live site).
// Connects this browser tab to a local or future hosted connector over WebSocket,
// shows a short pairing code, answers snapshot requests, and applies marks / proposed text.
// Snapshots are taken only when asked and are not saved by this script.
(function (root) {
  'use strict';

  function parseJson(s) {
    try { return JSON.parse(s); } catch { return null; }
  }

  function defaultCapture(maxWidth) {
    const canvas = document.getElementById('sv-capture') || document.querySelector('canvas#stage, canvas#c, video + canvas, canvas');
    const video = document.getElementById('preview') || document.getElementById('v') || document.querySelector('video');
    const src = (video && video.videoWidth) ? video : canvas;
    if (!src) return Promise.reject(new Error('Nothing to capture on this page.'));
    const sw = src.videoWidth || src.width || 0;
    const sh = src.videoHeight || src.height || 0;
    if (!sw || !sh) return Promise.reject(new Error('The screen is not being shared right now.'));
    const scale = Math.min(1, (maxWidth || 1024) / sw);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(sw * scale));
    c.height = Math.max(1, Math.round(sh * scale));
    const x = c.getContext('2d');
    x.drawImage(src, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL('image/png');
    return Promise.resolve({
      png: dataUrl.replace(/^data:image\/png;base64,/, ''),
      width: c.width,
      height: c.height,
    });
  }

  function connect(url, opts) {
    const o = opts || {};
    let ws, capture = o.capture || defaultCapture;
    const listeners = { code: [], paired: [], unpaired: [], annotate: [], propose: [], closed: [], error: [] };
    function on(ev, fn) { (listeners[ev] || (listeners[ev] = [])).push(fn); return api; }
    function emit(ev, data) { (listeners[ev] || []).forEach((fn) => { try { fn(data); } catch (e) {} }); }

    function send(msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }

    function handle(msg) {
      if (!msg || !msg.type) return;
      if (msg.type === 'code') emit('code', msg);
      else if (msg.type === 'paired') emit('paired', msg);
      else if (msg.type === 'unpaired') emit('unpaired', msg);
      else if (msg.type === 'closed') emit('closed', msg);
      else if (msg.type === 'error') emit('error', msg);
      else if (msg.type === 'snapshot') {
        Promise.resolve(capture(msg.max_width || 1024)).then((pic) => {
          send({ type: 'snapshot', id: msg.id, png: pic.png, width: pic.width, height: pic.height, blank: !!pic.blank });
        }).catch((e) => {
          send({ type: 'snapshot', id: msg.id, error: String(e.message || e), code: 'no_picture' });
        });
      } else if (msg.type === 'annotate') {
        emit('annotate', msg);
        send({ type: 'annotate_ack', id: msg.id, ok: true, mode: msg.mode });
      } else if (msg.type === 'propose_text') {
        emit('propose', msg);
        send({ type: 'propose_shown', id: msg.id, shown: true, accepted: false });
      }
    }

    function start() {
      ws = new WebSocket(url);
      ws.addEventListener('message', (ev) => handle(parseJson(ev.data)));
      ws.addEventListener('close', () => emit('closed', { reason: 'socket' }));
      ws.addEventListener('error', () => emit('error', { error: 'socket_error' }));
    }

    const api = {
      on, start,
      setCapture: (fn) => { capture = fn; },
      acceptText: (id) => send({ type: 'text_accepted', id: id, accepted: true }),
      setSharing: (onOff) => send({ type: 'sharing', sharing: !!onOff }),
      disconnect: () => { try { ws && ws.close(); } catch (e) {} },
    };
    return api;
  }

  root.SVConnector = { connect, defaultCapture };
})(typeof window !== 'undefined' ? window : globalThis);
