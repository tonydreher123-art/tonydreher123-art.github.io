// Nov 15 2026: the version line ("Version sv-shell-…, updated Nov 15 2026 3:20 AM MST").
// Single source of truth: the VERSION and UPDATED lines in sw.js (the offline-copy file that every deploy must
// change anyway), so the line can never drift from the real build. Reads sw.js from this website only; if the
// network is down, it falls back to the name of the stored offline copy. Text only, nothing sent anywhere.
'use strict';
(function () {
  const B = window.SVBuild = { version: '', updated: '', text: '', source: '', ready: false };
  function fmt(iso) {
    const d = new Date(iso);
    if (!iso || isNaN(d.getTime())) return '';
    try {
      return d.toLocaleString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).replace(/,/g, '');
    } catch (e) { return d.toISOString(); }
  }
  function show() {
    B.text = B.version ? 'Version ' + B.version + (B.updated ? ', updated ' + fmt(B.updated) : '') + (B.source === 'offline' ? ' (offline copy)' : '') : 'Version: could not be checked right now.';
    const el = document.getElementById('build-line');
    if (el) el.textContent = B.text;
    B.ready = true;
  }
  async function load() {
    try {
      const res = await fetch('sw.js', { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const src = await res.text();
      const v = /const VERSION = '([^']+)'/.exec(src), u = /const UPDATED = '([^']+)'/.exec(src);
      if (!v) throw new Error('no VERSION');
      B.version = v[1]; B.updated = u ? u[1] : ''; B.source = 'network';
    } catch (e) {
      try {
        const names = (await caches.keys()).filter((k) => k.startsWith('sv-shell-')).sort();
        if (names.length) { B.version = names[names.length - 1]; B.source = 'offline'; }
      } catch (e2) { /* nothing to show */ }
    }
    show();
  }
  B.reload = load; B.fmt = fmt;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load); else load();
})();
