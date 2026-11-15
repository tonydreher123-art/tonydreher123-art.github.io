// Page-to-extension message bridge (private integration build).
// Sends Screen-View marks and notes from this page to the "Screen-View Helper" extension,
// which draws them on the tab where the person turned the helper on.
//
// Two delivery paths, both carrying the same shared message format:
//  1. chrome.runtime.sendMessage(EXTENSION_ID, { source: 'screen-view', v: 1, message })
//     Works only when the extension lists this page's address in "externally_connectable".
//     The extension forwards it to every tab where the helper is on (not this tab).
//  2. window.postMessage({ source: 'screen-view', message }) for a helper turned on in THIS tab.
//
// Only 'annotate', 'clear' and 'text' are sent. Never 'fill' (typing) from here.
'use strict';
(function (root) {
  const SOURCE = 'screen-view';
  const ALLOWED = { annotate: 1, clear: 1, text: 1 };
  // Stable id of the private integration build (from the public "key" in extension/manifest.json).
  const DEFAULT_EXT_ID = 'bcekpcjpickjdbeomklaehmomcebcomn';

  function create(opts) {
    const o = opts || {};
    const win = o.win || root;
    const extId = o.extId || DEFAULT_EXT_ID;
    const runtime = o.runtime !== undefined ? o.runtime : (win.chrome && win.chrome.runtime && win.chrome.runtime.sendMessage ? win.chrome.runtime : null);
    const state = { extId, lastResult: null, available: null };

    function viaRuntime(envelope) {
      if (!runtime || !extId) return Promise.resolve({ ok: false, reason: 'no-extension-channel' });
      return new Promise((resolve) => {
        let done = false;
        const finish = (r) => { if (!done) { done = true; resolve(r); } };
        try {
          runtime.sendMessage(extId, envelope, (res) => {
            const err = runtime.lastError;
            if (err) finish({ ok: false, reason: 'not-installed-or-not-allowed', detail: String(err.message || err) });
            else finish(res || { ok: false, reason: 'no-answer' });
          });
        } catch (e) { finish({ ok: false, reason: 'not-installed-or-not-allowed', detail: String(e && e.message || e) }); }
        setTimeout(() => finish({ ok: false, reason: 'timeout' }), o.timeoutMs || 3000);
      });
    }

    async function send(message) {
      if (!message || !ALLOWED[message.type]) return { ok: false, reason: 'type-not-allowed' };
      const body = message.type === 'text' ? { type: 'text', text: String(message.text == null ? '' : message.text) } : message;
      try { win.postMessage({ source: SOURCE, message: body }, '*'); } catch (e) {}
      const r = await viaRuntime({ source: SOURCE, v: 1, message: body });
      state.lastResult = r;
      return r;
    }

    async function ping() {
      const r = await viaRuntime({ source: SOURCE, v: 1, message: { type: 'ping' } });
      state.available = !!(r && r.ok);
      return r;
    }

    return { send, ping, state };
  }

  root.SVExtBridge = { create, DEFAULT_EXT_ID, SOURCE };
})(typeof window !== 'undefined' ? window : globalThis);
