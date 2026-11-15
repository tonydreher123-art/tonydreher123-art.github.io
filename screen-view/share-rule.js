'use strict';
// POLISH BUILD (private, Nov 10 2026): what may be shared.
// Rule (from compat-2026-11-10, DECISIONS "Compat:" line): allow ONE browser tab or ONE window,
// refuse the WHOLE screen ("monitor") with a plain-words message, and WARN (not refuse) when the
// browser does not say what was picked (some browsers do not report displaySurface).
// Pure functions only: no page access, no network. Also loadable in Node for unit tests.
(function (root) {
  // Hints for the browser's own "choose what to share" box. Browsers ignore hints they don't know.
  // Nov 15 2026 (share-friction fix, checked against developer.chrome.com "screen-sharing-controls", MDN
  // getDisplayMedia, and Chromium's source: user_media_request.cc + desktop_media_picker_views.cc):
  //  - preferCurrentTab true: current desktop Chrome (incl. ChromeOS) then shows ONLY the small
  //    "Share this tab?" box (Allow/Cancel), with no tab list. One click on Share is still required:
  //    Chrome requires it every time and no web page can skip it. Chrome 94 to about 106 showed the full
  //    list with "This tab" pre-picked instead (one more click). Chrome does NOT show the
  //    "Share this tab instead" button for a this-tab share, so sharing a DIFFERENT tab needs
  //    otherTabOptions() below (the "Share a different tab" button).
  //  - selfBrowserSurface 'include': required with preferCurrentTab true ('exclude' + true is a TypeError).
  //  - displaySurface 'browser', monitorTypeSurfaces 'exclude', surfaceSwitching 'include': only used when a
  //    browser shows a full list (older Chrome, Edge, otherTabOptions); harmless otherwise.
  function displayMediaOptions(opts) {
    const o = opts || {};
    return {
      video: { frameRate: o.frameRate || 15, displaySurface: 'browser' },
      audio: false,
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
      monitorTypeSurfaces: 'exclude',
      surfaceSwitching: 'include'
    };
  }

  // "Share a different tab": Chrome's full list of tabs (Screen-View's own tab left out, so no picture
  // inside a picture), whole screen left out, "Share this tab instead" allowed while sharing.
  function otherTabOptions(opts) {
    const o = opts || {};
    return {
      video: { frameRate: o.frameRate || 15, displaySurface: 'browser' },
      audio: false,
      preferCurrentTab: false,
      selfBrowserSurface: 'exclude',
      monitorTypeSurfaces: 'exclude',
      surfaceSwitching: 'include'
    };
  }

  // If a browser rejects the hints with a TypeError, try again with fewer hints, but keep
  // preferCurrentTab (when it was asked for) so the one-click "Share this tab?" box is not lost.
  function fallbackOptions(opts, current) {
    const o = opts || {};
    const list = [];
    if (current !== false) list.push({ video: { frameRate: o.frameRate || 15 }, audio: false, preferCurrentTab: true });
    list.push({ video: { frameRate: o.frameRate || 15 }, audio: false });
    return list;
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

  const api = { displayMediaOptions, otherTabOptions, fallbackOptions, judge, judgeTrack, MSG };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SVShareRule = api;
})(typeof window !== 'undefined' ? window : null);
