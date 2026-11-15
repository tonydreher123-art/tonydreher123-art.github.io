// Registers the offline app-shell service worker (see sw.js). Kept out of the HTML
// because the page's security rules do not allow inline scripts.
'use strict';
(function () {
  window.SVOffline = { registered: false, error: null };
  if (!('serviceWorker' in navigator)) { window.SVOffline.error = 'not supported'; return; }
  navigator.serviceWorker.register('sw.js', { scope: './' }).then(
    () => { window.SVOffline.registered = true; },
    (e) => { window.SVOffline.error = String(e && e.message || e); }
  );
})();
