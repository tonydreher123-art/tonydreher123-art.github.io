'use strict';
// POLISH BUILD (private, Nov 10 2026): what may be shared.
// Rule (from compat-2026-11-10, DECISIONS "Compat:" line): allow ONE browser tab or ONE window,
// refuse the WHOLE screen ("monitor") with a plain-words message, and WARN (not refuse) when the
// browser does not say what was picked (some browsers do not report displaySurface).
// Pure functions only: no page access, no network. Also loadable in Node for unit tests.
(function (root) {
  // Hints for the browser's own "choose what to share" box. Browsers ignore hints they don't know.
  //  - displaySurface 'browser': list tabs first (Chrome/Edge 107+).
  //  - preferCurrentTab false: do NOT pre-pick the Screen-View page itself (sharing it would show
  //    the phone a picture of its own picture).
  //  - selfBrowserSurface 'exclude': leave the Screen-View tab out of the list (Chrome/Edge 112+).
  //  - monitorTypeSurfaces 'exclude': leave "Entire screen" out of the list (Chrome/Edge 119+).
  //  - surfaceSwitching 'include': allow "Share this tab instead" (tab to tab) in Chrome.
  function displayMediaOptions(opts) {
    const o = opts || {};
    return {
      video: { frameRate: o.frameRate || 15, displaySurface: 'browser' },
      audio: false,
      preferCurrentTab: false,
      selfBrowserSurface: 'include',
      monitorTypeSurfaces: 'exclude',
      surfaceSwitching: 'include'
    };
  }

  const MSG = {
    monitor: 'You picked your whole screen. Screen-View only shares one tab or one window, so nothing was shared. ' +
      'Click "Share my screen" again and pick a tab (best) or a single window.',
    window: 'You are sharing one window. Everything inside that window shows on the phone. ' +
      'Close or move private things out of that window first.',
    unknown: 'This browser did not say what you picked. If you picked your whole screen, click Stop now ' +
      'and share again, choosing one tab or one window. Screen-View is meant for one tab or one window only.',
    odd: 'This browser reported an unusual kind of share. If it is your whole screen, click Stop now ' +
      'and share again, choosing one tab or one window.'
  };

  // settings = videoTrack.getSettings() (or {}). Returns { verdict, surface, message }.
  //   verdict: 'allow' (tab), 'allow-note' (window), 'warn' (not reported / unknown), 'refuse' (whole screen)
  function judge(settings) {
    const s = settings && typeof settings === 'object' ? settings : {};
    const surface = typeof s.displaySurface === 'string' ? s.displaySurface : '';
    if (surface === 'browser') return { verdict: 'allow', surface, message: '' };
    if (surface === 'window') return { verdict: 'allow-note', surface, message: MSG.window };
    if (surface === 'monitor') return { verdict: 'refuse', surface, message: MSG.monitor };
    if (surface === '') return { verdict: 'warn', surface: 'not reported', message: MSG.unknown };
    // 'application' (old spec value) or anything new: we cannot be sure, so warn.
    return { verdict: 'warn', surface, message: MSG.odd };
  }

  function judgeTrack(track) {
    let st = {};
    try { st = (track && typeof track.getSettings === 'function') ? (track.getSettings() || {}) : {}; } catch (e) { st = {}; }
    return judge(st);
  }

  const api = { displayMediaOptions, judge, judgeTrack, MSG };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SVShareRule = api;
})(typeof window !== 'undefined' ? window : null);
