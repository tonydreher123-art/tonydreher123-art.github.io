// RC3 (Nov 14, 2026): "Paste your AI key" storage for the built-in AI helper. Text only, no network here.
// Where a key is kept (never anywhere else, never in the page address, never in a log):
//   - the Screen-View Helper Chrome extension (chrome.storage.local), if it is installed: the page never
//     reads the key back; the extension makes the AI request itself. Preferred.
//   - otherwise this browser's own storage (localStorage) on this device; this page then calls the AI
//     company directly. Only that one company ever receives the key.
// A key is sent only to the company it belongs to: Anthropic (Claude), OpenAI (ChatGPT), or xAI (Grok).
'use strict';
(function (root) {
  const STORE = 'screenview.ai.keys.v1';
  const SOURCE = 'screen-view';
  const PROVIDERS = {
    claude: { label: 'Claude (Anthropic)', prefix: /^sk-ant-/, hint: 'starts with sk-ant-', site: 'console.anthropic.com' },
    openai: { label: 'ChatGPT (OpenAI)', prefix: /^sk-/, hint: 'starts with sk-', site: 'platform.openai.com' },
    grok: { label: 'Grok (xAI)', prefix: /^xai-/, hint: 'starts with xai-', site: 'console.x.ai' },
  };
  const MIN = 20, MAX = 400;

  // Check a pasted key before saving. Returns { ok, key, why, warn }.
  function checkShape(provider, raw) {
    const p = PROVIDERS[provider];
    if (!p) return { ok: false, why: 'Pick Claude, ChatGPT, or Grok first.' };
    const key = String(raw == null ? '' : raw).trim();
    if (!key) return { ok: false, why: 'Please paste your AI key first.' };
    if (/^SV1\./.test(key)) return { ok: false, why: 'That is a Screen-View Pro key. It goes in the Pro box below, not here.' };
    if (/\s/.test(key)) return { ok: false, why: 'The key has a space or line break in it. Copy it again in one piece.' };
    if (key.length < MIN || key.length > MAX) return { ok: false, why: 'That is not the right length for an AI key. Copy the whole key again.' };
    if (!/^[A-Za-z0-9_\-.]+$/.test(key)) return { ok: false, why: 'That key has characters AI keys do not use. Copy it again.' };
    if (provider === 'openai' && /^(sk-ant-|xai-)/.test(key)) return { ok: false, why: 'That looks like a key for a different company. Check the company picker.' };
    if (!p.prefix.test(key)) return { ok: false, why: `A ${p.label} key usually ${p.hint}. Check the company picker, or copy the key again.` };
    return { ok: true, key };
  }
  const last4 = (k) => (k && k.length > 8 ? k.slice(-4) : '');

  // ---- Backend 1: this browser (localStorage) ----
  function pageBackend(storage) {
    const st = storage !== undefined ? storage : (function () { try { return root.localStorage; } catch (e) { return null; } })();
    const readAll = () => { try { const v = st && st.getItem(STORE); const o = v ? JSON.parse(v) : {}; return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } };
    const writeAll = (o) => { if (!st) throw new Error('This browser will not let the page save the key.'); if (Object.keys(o).length) st.setItem(STORE, JSON.stringify(o)); else st.removeItem(STORE); };
    return {
      kind: 'page',
      where: 'this browser, on this device only',
      async save(provider, key, model) {
        const c = checkShape(provider, key); if (!c.ok) return c;
        const o = readAll(); o[provider] = { key: c.key, model: model ? String(model).trim().slice(0, 80) : '', savedAt: new Date().toISOString() };
        writeAll(o); return { ok: true, last4: last4(c.key) };
      },
      async remove(provider) { const o = readAll(); if (provider) delete o[provider]; else for (const k of Object.keys(o)) delete o[k]; writeAll(o); return { ok: true }; },
      async status() { const o = readAll(); const out = {}; for (const p of Object.keys(PROVIDERS)) out[p] = o[p] && o[p].key ? { saved: true, last4: last4(o[p].key), model: o[p].model || '' } : { saved: false }; return out; },
      getKey(provider) { const o = readAll(); return o[provider] && o[provider].key || ''; }, // used only by the page's own direct call
    };
  }

  // ---- Backend 2: the Screen-View Helper extension (key never comes back to the page) ----
  function extensionBackend(runtime, extId, timeoutMs) {
    const call = (message) => new Promise((resolve) => {
      let done = false; const fin = (r) => { if (!done) { done = true; resolve(r); } };
      try {
        runtime.sendMessage(extId, { source: SOURCE, v: 1, message }, (res) => {
          const err = runtime.lastError; fin(err ? { ok: false, error: String(err.message || err) } : (res || { ok: false, error: 'No answer.' }));
        });
      } catch (e) { fin({ ok: false, error: String(e && e.message || e) }); }
      setTimeout(() => fin({ ok: false, error: 'timeout' }), timeoutMs || 3000);
    });
    return {
      kind: 'extension',
      where: 'the Screen-View Helper extension on this computer',
      call,
      async save(provider, key, model) {
        const c = checkShape(provider, key); if (!c.ok) return c;
        const r = await call({ type: 'ai-key-save', provider, key: c.key, model: model ? String(model).trim().slice(0, 80) : '' });
        return r && r.ok ? { ok: true, last4: last4(c.key) } : { ok: false, why: 'The helper extension could not save the key. ' + ((r && r.error) || '') };
      },
      async remove(provider) { const r = await call({ type: 'ai-key-remove', provider: provider || 'all' }); return { ok: !!(r && r.ok) }; },
      async status() { const r = await call({ type: 'ai-key-status' }); return r && r.ok && r.providers ? r.providers : null; },
      getKey() { return ''; }, // never: the extension keeps it
    };
  }

  // Pick where keys live: the extension if it answers 'ai-key-status', otherwise this browser.
  async function choose(opts) {
    const o = opts || {};
    const win = o.win || root;
    const runtime = o.runtime !== undefined ? o.runtime : (win.chrome && win.chrome.runtime && win.chrome.runtime.sendMessage ? win.chrome.runtime : null);
    const extId = o.extId || (root.SVExtBridge && root.SVExtBridge.DEFAULT_EXT_ID);
    if (runtime && extId) {
      const ext = extensionBackend(runtime, extId, o.timeoutMs);
      const s = await ext.status();
      if (s) return ext;
    }
    return pageBackend(o.storage);
  }

  root.SVAiKeys = { STORE, PROVIDERS, checkShape, pageBackend, extensionBackend, choose, last4 };
})(typeof window !== 'undefined' ? window : globalThis);
