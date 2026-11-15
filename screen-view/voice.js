// Screen-View "Read aloud" (voice-ai-2026-11-10, BUILD-PLAN step 57). Private build.
// Uses only the browser's own built-in voice (window.speechSynthesis). Free. Screen-View sends nothing anywhere.
// OFF by default. When the person turns it on, new messages on this page are read out loud:
// status lines, "AI took a picture" notices, mark summaries, text to copy, and AI answers.
// Buttons the person presses on purpose ("Say it again", "Read step by step", "Next step") speak even when
// automatic reading is off, because the person asked for it right then.
// The choice (on/off, speed) is remembered on this device only (localStorage "sv.voice.on", "sv.voice.rate").
'use strict';
(function (root) {
  const RATES = { slow: 0.7, medium: 0.85, normal: 1.0 };   // design: slow and clear by default (0.85)
  const RATE_WORD = { slow: 'Slow', medium: 'Medium', normal: 'Normal' };
  const DEFAULT_RATE = 'medium';
  const MAX_CHARS = 1500;

  // Turn page text into something sensible to say: one line, no web addresses read letter by letter,
  // long room codes like ABCD-EFGH spelled out, and not too long.
  function speakable(text) {
    let s = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    s = s.replace(/\bhttps?:\/\/\S+/gi, 'a web link');
    s = s.replace(/\b([A-Z2-9]{4})-([A-Z2-9]{4})\b/g, (m, a, b) => (a + b).split('').join(' '));
    s = s.replace(/…/g, '.');
    if (s.length > MAX_CHARS) s = s.slice(0, MAX_CHARS) + '. The rest is on the screen.';
    return s;
  }

  // Prefer a voice that runs on this device ("localService") in the page's language; otherwise let the
  // browser choose. We never pick a cloud voice on purpose.
  function pickVoice(voices, lang) {
    const list = Array.isArray(voices) ? voices : [];
    const want = String(lang || 'en').toLowerCase().slice(0, 2);
    const same = list.filter(v => v && String(v.lang || '').toLowerCase().startsWith(want));
    return same.find(v => v.localService) || null; // null = browser default voice
  }

  function rateId(x) { return Object.prototype.hasOwnProperty.call(RATES, x) ? x : DEFAULT_RATE; }

  // Core speaker. "synth" and "Utterance" are injectable so it can be tested without a real voice.
  function createSpeaker(opts) {
    const o = opts || {};
    const synth = o.synth || null;
    const Utterance = o.Utterance || null;
    const store = o.storage || null;
    const lang = o.lang || 'en';
    const onState = typeof o.onState === 'function' ? o.onState : () => {};
    const get = k => { try { return store ? store.getItem(k) : null; } catch (e) { return null; } };
    const set = (k, v) => { try { if (store) store.setItem(k, v); } catch (e) {} };
    const sp = {
      available: !!(synth && Utterance && typeof synth.speak === 'function'),
      enabled: get('sv.voice.on') === '1',          // off unless the person turned it on before, on this device
      rate: rateId(get('sv.voice.rate')),
      last: '', spoken: [], blocked: false, lastError: '',
    };
    let lastAt = 0;
    function utter(text) {
      const u = new Utterance(text);
      u.rate = RATES[sp.rate];
      u.pitch = 1;
      u.lang = lang;
      try { const v = pickVoice(synth.getVoices ? synth.getVoices() : [], lang); if (v) u.voice = v; } catch (e) {}
      u.onerror = (e) => {
        const why = (e && e.error) || 'error';
        if (why === 'interrupted' || why === 'canceled') return;
        sp.lastError = why;
        if (why === 'not-allowed') { sp.blocked = true; onState('blocked'); } else onState('error');
      };
      u.onstart = () => { sp.blocked = false; onState('speaking'); };
      u.onend = () => onState('done');
      return u;
    }
    // say(text, { now, force }): now = stop what is being said first; force = speak even if automatic reading is off.
    sp.say = function (text, how) {
      const h = how || {};
      if (!sp.available) return false;
      if (!sp.enabled && !h.force) return false;
      const s = speakable(text);
      if (!s) return false;
      const t = Date.now();
      if (!h.force && s === sp.last && t - lastAt < 2000) return false; // same words again right away: skip
      if (h.now) { try { synth.cancel(); } catch (e) {} }
      sp.last = s; lastAt = t;
      sp.spoken.push({ text: s, rate: RATES[sp.rate], now: !!h.now, force: !!h.force });
      if (sp.spoken.length > 200) sp.spoken.shift();
      try { synth.speak(utter(s)); } catch (e) { sp.lastError = String(e && e.message || e); onState('error'); return false; }
      return true;
    };
    sp.again = function () { return sp.last ? sp.say(sp.last, { now: true, force: true }) : false; };
    sp.stop = function () { if (sp.available) { try { synth.cancel(); } catch (e) {} } onState('stopped'); };
    sp.setEnabled = function (on) {
      sp.enabled = !!on; set('sv.voice.on', sp.enabled ? '1' : '0');
      if (!sp.enabled) sp.stop();
      return sp.enabled;
    };
    sp.setRate = function (id) { sp.rate = rateId(id); set('sv.voice.rate', sp.rate); return sp.rate; };
    return sp;
  }

  // One-step-at-a-time reader for an answer: first the short answer, then "Next step" reads each step.
  function createStepper(speaker) {
    const st = { intro: '', steps: [], index: -1 };
    st.load = (intro, steps) => { st.intro = String(intro || ''); st.steps = (Array.isArray(steps) ? steps : []).map(String); st.index = -1; };
    st.start = () => { st.index = -1; speaker.say(st.intro + (st.steps.length ? ` There ${st.steps.length === 1 ? 'is 1 step' : 'are ' + st.steps.length + ' steps'}. Press Next step to hear step 1.` : ''), { now: true, force: true }); return st.steps.length > 0; };
    st.next = () => {
      if (st.index + 1 >= st.steps.length) { speaker.say('That was the last step.', { now: true, force: true }); return false; }
      st.index++;
      speaker.say(`Step ${st.index + 1}. ${st.steps[st.index]}` + (st.index + 1 >= st.steps.length ? ' That was the last step.' : ''), { now: true, force: true });
      return st.index + 1 < st.steps.length;
    };
    return st;
  }

  // ---- page wiring (only in a browser) ----
  function attach(doc, win, cfg) {
    const $ = id => doc.getElementById(id);
    const box = $('voice-box');
    if (!box) return null;
    const note = $('voice-note');
    const toggle = $('voice-toggle');
    const synth = win.speechSynthesis;
    const speaker = createSpeaker({
      synth, Utterance: win.SpeechSynthesisUtterance, storage: win.localStorage, lang: doc.documentElement.lang || 'en',
      onState: (s) => {
        if (s === 'blocked') note.textContent = 'The browser stopped this page from talking. Press any button on this page once, then try "Say it again".';
        else if (s === 'error') note.textContent = 'The browser could not read this out loud (' + speaker.lastError + '). The words are still on the screen.';
      },
    });
    const stepper = createStepper(speaker);
    function show() {
      toggle.setAttribute('aria-pressed', String(speaker.enabled));
      toggle.textContent = 'Read aloud: ' + (speaker.enabled ? 'On' : 'Off');
      for (const id of Object.keys(RATES)) {
        const b = $('voice-rate-' + id);
        if (b) { const on = speaker.rate === id; b.setAttribute('aria-pressed', String(on)); b.classList.toggle('on', on); }
      }
      if (!speaker.available) note.textContent = 'This browser cannot read out loud. Everything is still shown on the screen.';
      else note.textContent = speaker.enabled
        ? `Read aloud is on (${RATE_WORD[speaker.rate].toLowerCase()} speed). New messages on this page will be read out loud.`
        : 'Read aloud is off. Nothing is read out loud unless you press a button.';
    }
    if (!speaker.available) {
      for (const id of ['voice-toggle', 'voice-again', 'voice-stop', 'voice-steps', 'voice-next']) { const b = $(id); if (b) b.disabled = true; }
      const rates = $('voice-rates'); if (rates) rates.classList.add('hidden');
    }
    toggle.addEventListener('click', () => {
      const on = speaker.setEnabled(!speaker.enabled);
      show();
      if (on) speaker.say('Read aloud is on.', { now: true });
    });
    for (const id of Object.keys(RATES)) {
      const b = $('voice-rate-' + id);
      if (b) b.addEventListener('click', () => { speaker.setRate(id); show(); speaker.say(`${RATE_WORD[id]} speed.`, { now: true }); });
    }
    $('voice-again').addEventListener('click', () => { if (!speaker.again()) note.textContent = 'Nothing has been read out loud yet.'; });
    $('voice-stop').addEventListener('click', () => { speaker.stop(); });
    const stepsBtn = $('voice-steps'), nextBtn = $('voice-next');
    if (stepsBtn) stepsBtn.addEventListener('click', () => { const more = stepper.start(); if (nextBtn) { nextBtn.classList.toggle('hidden', !more); if (more) nextBtn.focus(); } });
    if (nextBtn) nextBtn.addEventListener('click', () => { const more = stepper.next(); if (!more) { nextBtn.classList.add('hidden'); if (stepsBtn) stepsBtn.focus(); } });
    // Stop talking when sharing stops.
    win.addEventListener('sv:sharing', (e) => { if (e && e.detail && !e.detail.sharing) speaker.stop(); });

    // Watch the page's own message lines and read new ones (only when automatic reading is on).
    const watched = (cfg && cfg.watch) || [];
    for (const w of watched) {
      const el = $(w.id);
      if (!el || typeof win.MutationObserver !== 'function') continue;
      let prev = el.textContent;
      new win.MutationObserver(() => {
        const t = el.textContent;
        if (t === prev) return;
        prev = t;
        if (!t.trim() || el.classList.contains('hidden')) return;
        speaker.say((w.prefix || '') + t, { now: !!w.now });
      }).observe(el, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    }
    show();
    const api = { speaker, stepper, say: (t, h) => speaker.say(t, h), show };
    return api;
  }

  const exported = { RATES, DEFAULT_RATE, speakable, pickVoice, createSpeaker, createStepper, attach };
  root.SVVoiceCore = exported;
  if (typeof document !== 'undefined' && typeof window !== 'undefined' && root === window) {
    const start = () => {
      const page = document.body && document.body.dataset.page;
      const watch = page === 'phone'
        ? [{ id: 'status' }, { id: 'ai-snap-notice' }, { id: 'ai-marks-summary' }]
        : [{ id: 'status' }, { id: 'ai-snap-notice' }, { id: 'ann-summary' }, { id: 'ai-status' }, { id: 'got-text', prefix: 'Text to copy: ' }];
      window.SVVoice = attach(document, window, { watch });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  }
})(typeof window !== 'undefined' ? window : globalThis);
