// Screen-View accessibility helpers (loaded in <head> so saved choices apply before the page shows).
// - High contrast and Larger text switches, remembered on this device (localStorage).
// - If nothing is saved yet, high contrast follows the computer's "more contrast" setting.
// - One polite announcer for screen readers.
// - Arrow keys move between buttons inside a toolbar.
'use strict';
window.SVA11y = (function () {
  const KEYS = { contrast: 'sv.a11y.contrast', bigtext: 'sv.a11y.bigtext' };
  const CLASS = { contrast: 'hc', bigtext: 'big' };
  const root = document.documentElement;

  function load(name) {
    try {
      const v = localStorage.getItem(KEYS[name]);
      if (v === 'on') return true;
      if (v === 'off') return false;
    } catch (e) { /* storage blocked: fall through */ }
    if (name === 'contrast' && window.matchMedia) return window.matchMedia('(prefers-contrast: more)').matches;
    return false;
  }
  function save(name, on) { try { localStorage.setItem(KEYS[name], on ? 'on' : 'off'); } catch (e) {} }

  const state = { contrast: load('contrast'), bigtext: load('bigtext') };
  function apply() {
    root.classList.toggle(CLASS.contrast, state.contrast);
    root.classList.toggle(CLASS.bigtext, state.bigtext);
    for (const name of Object.keys(KEYS)) {
      const b = document.getElementById('toggle-' + name);
      if (b) b.setAttribute('aria-pressed', state[name] ? 'true' : 'false');
    }
  }
  apply(); // runs in <head>: classes are on <html> before first paint

  function set(name, on) {
    state[name] = !!on; save(name, state[name]); apply();
    announce((name === 'contrast' ? 'High contrast ' : 'Larger text ') + (state[name] ? 'on.' : 'off.'));
  }

  let clearTimer = 0;
  function announce(msg) {
    const el = document.getElementById('sr-announce');
    if (!el) return;
    // Clear then set, so the same message twice is still read.
    el.textContent = '';
    setTimeout(() => { el.textContent = String(msg); }, 30);
    if (clearTimer) clearTimeout(clearTimer);
    clearTimer = setTimeout(() => { el.textContent = ''; }, 8000);
  }

  // Read the room code letter by letter ("A B C D, dash, ...") for screen readers.
  function spellCode(code) {
    return String(code || '').split('').map(ch => (ch === '-' ? 'dash' : ch)).join(' ');
  }

  function toolbarKeys(e) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const bar = e.currentTarget;
    const btns = [...bar.querySelectorAll('button')].filter(b => !b.disabled && b.offsetParent !== null);
    const i = btns.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    let j = i;
    if (e.key === 'ArrowLeft') j = (i - 1 + btns.length) % btns.length;
    if (e.key === 'ArrowRight') j = (i + 1) % btns.length;
    if (e.key === 'Home') j = 0;
    if (e.key === 'End') j = btns.length - 1;
    btns[j].focus();
  }

  function wire() {
    apply();
    for (const name of Object.keys(KEYS)) {
      const b = document.getElementById('toggle-' + name);
      if (b) b.addEventListener('click', () => set(name, !state[name]));
    }
    document.querySelectorAll('[role="toolbar"]').forEach(bar => bar.addEventListener('keydown', toolbarKeys));
    // Room code: keep a spelled-out copy for screen readers in sync with the visible code.
    const code = document.getElementById('code');
    const spoken = document.getElementById('code-spoken');
    if (code && spoken) {
      const sync = () => {
        const t = code.textContent.trim();
        spoken.textContent = /[A-Z0-9]/.test(t) ? 'Room code: ' + spellCode(t) : 'Room code: not ready yet';
      };
      sync();
      new MutationObserver(sync).observe(code, { childList: true, characterData: true, subtree: true });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();

  return { KEYS, state, set, announce, spellCode, apply };
})();
