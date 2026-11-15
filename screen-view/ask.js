// Screen-View "Ask out loud" (voice-ai-2026-11-10, BUILD-PLAN step 58). Private build.
// Speech-to-text with the browser's own Web Speech recognition, where the browser has it (Chrome and Edge first).
// Opt-in only:
//  - The button shows only if the browser has speech recognition. Typing always works.
//  - Before the microphone is used the first time on this page, a plain note says where the voice goes:
//    if the browser says it can do it on this device, the voice stays here (processLocally);
//    otherwise Chrome sends the sound to Google, and Edge to Microsoft, to turn it into words.
//    The person must press "Yes, use my voice". The yes lasts for this page visit only (never stored).
//  - Press to start, press again to stop (never always-listening). Words go into the text box.
//    Nothing is ever sent automatically: the person checks the words and presses the send button.
'use strict';
(function (root) {
  const LOCAL_NOTE = 'Your voice will be turned into words on this device by your browser. It is not sent anywhere, and Screen-View does not record it. Use the microphone?';
  const CLOUD_NOTE = 'To turn your voice into words, your browser sends the sound of your voice to its own speech service over the internet (Chrome sends it to Google; Edge sends it to Microsoft). Screen-View does not record or keep it. Use the microphone?';

  function recognitionCtor(win) { return (win && (win.SpeechRecognition || win.webkitSpeechRecognition)) || null; }

  // Ask the browser whether it can do on-device recognition for this language. Never installs anything.
  async function localMode(Ctor, lang) {
    try {
      if (!Ctor || typeof Ctor.available !== 'function') return false;
      const r = await Ctor.available({ langs: [lang], processLocally: true });
      return r === 'available';
    } catch (e) { return false; }
  }

  // Plain-words messages for recognition errors.
  function errorText(code) {
    switch (code) {
      case 'not-allowed': case 'service-not-allowed': return 'The microphone was not allowed. That is fine. You can type instead.';
      case 'network': return 'The speech service could not be reached. You can type instead.';
      case 'no-speech': return 'No words were heard. Press the button and try again, or type instead.';
      case 'audio-capture': return 'No microphone was found. You can type instead.';
      case 'language-not-supported': return 'This language is not available for speaking. You can type instead.';
      case 'aborted': return 'Stopped listening.';
      default: return 'Speaking did not work (' + String(code || 'unknown') + '). You can type instead.';
    }
  }

  // Joins recognition results into one line of text.
  function transcriptOf(results) {
    let s = '';
    for (let i = 0; i < (results ? results.length : 0); i++) { const alt = results[i] && results[i][0]; if (alt && alt.transcript) s += alt.transcript; }
    return s.replace(/\s+/g, ' ').trim();
  }

  // cfg: { textarea, button, note, consent, consentText, yes, no, sendLabel, lang }
  function attach(win, cfg) {
    const c = cfg || {};
    const Ctor = recognitionCtor(win);
    const st = { supported: !!Ctor, consented: false, listening: false, local: false, rec: null, starts: 0, heard: '', autoSent: 0 };
    const btn = c.button, note = c.note, ta = c.textarea;
    const idle = btn ? btn.textContent : '';
    const say = (t) => { if (note) note.textContent = t; };
    if (!Ctor) {
      if (btn) btn.classList.add('hidden');
      say('Speaking a question is not available in this browser. Type it in the box instead.');
      return st;
    }
    btn.classList.remove('hidden');
    const lang = c.lang || 'en-US';

    function setListening(on) {
      st.listening = on;
      btn.textContent = on ? 'Stop listening' : idle;
      btn.setAttribute('aria-pressed', String(on));
    }
    function start() {
      let rec;
      try { rec = new Ctor(); } catch (e) { say(errorText('unknown')); return; }
      st.rec = rec;
      rec.lang = lang;
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;
      if (st.local) { try { rec.processLocally = true; } catch (e) {} }
      const base = ta.value.trim() ? ta.value.trim() + ' ' : '';
      let failed = false;
      st.heard = '';
      rec.onresult = (e) => {
        st.heard = transcriptOf(e.results);
        ta.value = base + st.heard;
        try { ta.dispatchEvent(new win.Event('input', { bubbles: true })); } catch (er) {}
      };
      rec.onerror = (e) => { failed = true; say(errorText(e && e.error)); };
      rec.onend = () => {
        if (st.rec !== rec) return;
        st.rec = null; setListening(false);
        if (st.heard && !failed) say(`Check the words in the box. Fix them if needed, then press "${c.sendLabel || 'Send'}". Nothing was sent yet.`);
        ta.focus();
      };
      try { rec.start(); st.starts++; setListening(true); say('Listening… speak now. Press "Stop listening" when you are done.'); }
      catch (e) { st.rec = null; say(errorText('unknown')); }
    }
    function stop() { if (st.rec) { try { st.rec.stop(); } catch (e) {} } }

    btn.addEventListener('click', async () => {
      if (st.listening) { stop(); return; }
      if (st.consented) { start(); return; }
      st.local = await localMode(Ctor, lang);
      c.consentText.textContent = st.local ? LOCAL_NOTE : CLOUD_NOTE;
      c.consent.classList.remove('hidden');
      c.yes.focus();
    });
    c.yes.addEventListener('click', () => { st.consented = true; c.consent.classList.add('hidden'); btn.focus(); start(); });
    c.no.addEventListener('click', () => { c.consent.classList.add('hidden'); say('OK. The microphone was not used. Type in the box instead.'); ta.focus(); });
    return st;
  }

  root.SVAskCore = { LOCAL_NOTE, CLOUD_NOTE, recognitionCtor, localMode, errorText, transcriptOf, attach };
  if (typeof document !== 'undefined' && typeof window !== 'undefined' && root === window) {
    const start = () => {
      const $ = id => document.getElementById(id);
      const page = document.body && document.body.dataset.page;
      const ids = page === 'phone'
        ? { textarea: 'textout', button: 'textout-voice', note: 'textout-voice-note', consent: 'textout-consent', consentText: 'textout-consent-text', yes: 'textout-consent-yes', no: 'textout-consent-no', sendLabel: 'Send text' }
        : { textarea: 'ask-text', button: 'ask-voice', note: 'ask-voice-note', consent: 'ask-consent', consentText: 'ask-consent-text', yes: 'ask-consent-yes', no: 'ask-consent-no', sendLabel: 'Get answer' };
      const cfg = { sendLabel: ids.sendLabel, lang: navigator.language || 'en-US' };
      for (const k of Object.keys(ids)) if (k !== 'sendLabel') { cfg[k] = $(ids[k]); if (!cfg[k]) return; }
      window.SVAsk = attach(window, cfg);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  }
})(typeof window !== 'undefined' ? window : globalThis);
