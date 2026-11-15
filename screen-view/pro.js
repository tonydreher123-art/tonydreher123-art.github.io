// Screen-View Pro unlock: device-side license key check (no server, no internet call).
// Design from docs-business-2026-11-10/license-key-demo: key = SV1.<base64url(JSON payload)>.<base64url(signature)>,
// signature = ECDSA P-256 / SHA-256 over the text "SV1.<payload part>", checked with the PUBLIC key only
// (pro-public-key.js). This app can check keys but can never make them.
//
// Pro in this build unlocks: the AI helper (local connector) and up to 3 phone viewers (free: 1).
// The key is kept in this browser's localStorage and re-checked every time the page opens;
// no "is Pro" flag is stored. Honest limit: someone who edits this code can skip the check.
'use strict';
(function (root) {
  const STORE = 'screenview.pro.key';
  const PRODUCT = 'screen-view-pro';
  const MAX_KEY = 1000;
  const SIG = { name: 'ECDSA', hash: 'SHA-256' };
  const enc = new TextEncoder();

  function unb64u(s) {
    if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('bad base64url');
    let b = s.replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    const bin = atob(b);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  let keyPromise = null;
  function publicKey(jwk) {
    if (jwk !== undefined) return root.crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    if (!keyPromise) {
      const j = root.SV_PRO_PUBLIC_KEY_JWK;
      keyPromise = j ? root.crypto.subtle.importKey('jwk', j, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']) : Promise.resolve(null);
    }
    return keyPromise;
  }

  // Returns { ok:true, payload } or { ok:false, why } (plain words). Never throws.
  async function checkKey(text, opts) {
    try {
      const key = await publicKey(opts && opts.jwk);
      if (!key) return { ok: false, why: 'This copy of Screen-View has no Pro checking key installed yet.' };
      const s = String(text == null ? '' : text).trim();
      if (!s) return { ok: false, why: 'Please paste your Pro key first.' };
      if (s.length > MAX_KEY) return { ok: false, why: 'That is too long to be a Screen-View Pro key.' };
      const parts = s.split('.');
      if (parts.length !== 3 || parts[0] !== 'SV1') return { ok: false, why: 'That does not look like a Screen-View Pro key. It should start with SV1.' };
      let payload, sig;
      try { payload = JSON.parse(new TextDecoder().decode(unb64u(parts[1]))); sig = unb64u(parts[2]); }
      catch (e) { return { ok: false, why: 'Part of the key is missing or changed. Copy the whole key from your email again.' }; }
      const good = await root.crypto.subtle.verify(SIG, key, sig, enc.encode('SV1.' + parts[1]));
      if (!good) return { ok: false, why: 'This key did not pass the check. Copy the whole key from your email again.' };
      if (!payload || payload.product !== PRODUCT || payload.v !== 1) return { ok: false, why: 'This key is not for Screen-View Pro.' };
      return { ok: true, payload };
    } catch (e) {
      return { ok: false, why: 'The key could not be checked on this device.' };
    }
  }

  const listeners = [];
  const state = { pro: false, payload: null, why: '' };
  function emit() { for (const f of listeners) { try { f(state); } catch (e) {} } }
  function storage() { try { return root.localStorage; } catch (e) { return null; } }

  async function unlock(text) {
    const r = await checkKey(text);
    if (r.ok) {
      state.pro = true; state.payload = r.payload; state.why = '';
      const st = storage(); if (st) { try { st.setItem(STORE, String(text).trim()); } catch (e) {} }
    } else { state.why = r.why; }
    emit();
    return r;
  }

  function remove() {
    const st = storage(); if (st) { try { st.removeItem(STORE); } catch (e) {} }
    state.pro = false; state.payload = null; state.why = '';
    emit();
  }

  // Re-check a saved key at start-up. A saved key that no longer passes is ignored (not deleted).
  async function start() {
    const st = storage();
    const saved = st ? st.getItem(STORE) : null;
    if (saved) {
      const r = await checkKey(saved);
      if (r.ok) { state.pro = true; state.payload = r.payload; }
      else state.why = 'The saved Pro key did not pass the check, so Pro is off.';
    }
    emit();
    return state;
  }

  const api = {
    STORE, PRODUCT, checkKey, unlock, remove,
    isPro: () => state.pro,
    info: () => ({ pro: state.pro, payload: state.payload, why: state.why }),
    maxViewers: () => (state.pro ? 3 : 1),
    onChange: (f) => { listeners.push(f); },
    ready: null
  };
  root.SVPro = api;
  if (root.document) api.ready = start();
})(typeof window !== 'undefined' ? window : globalThis);
