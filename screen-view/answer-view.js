// Shows an AI helper answer ("guidance": short text + numbered steps) on the page, as plain text only,
// and hands it to Read aloud (voice.js). Used by the computer page (practice AI helper) and the phone page
// (computer -> phone message { type:"ai-guidance", text, steps, speak, from, at }). voice-ai-2026-11-10.
'use strict';
(function (root) {
  const MAX_TEXT = 4000, MAX_STEPS = 12, MAX_STEP = 500;
  // Clean a guidance-like object coming from another device. Never trusts HTML.
  function cleanGuidance(m) {
    if (!m || typeof m !== 'object') return null;
    const text = String(m.text == null ? '' : m.text).replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
    if (!text) return null;
    const steps = (Array.isArray(m.steps) ? m.steps : []).map(s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, MAX_STEP)).filter(Boolean).slice(0, MAX_STEPS);
    const speak = m.speak == null ? [text, ...steps.map((s, i) => `Step ${i + 1}. ${s}`)].join(' ') : String(m.speak).slice(0, MAX_TEXT);
    const from = m.from === 'practice' ? 'practice' : 'ai';
    return { text, steps, speak, from };
  }
  function show(doc, g, whoWords) {
    const $ = id => doc.getElementById(id);
    const box = $('ai-answer');
    if (!box || !g) return false;
    $('ai-answer-from').textContent = 'From ' + whoWords + (g.from === 'practice' ? ' (practice answer, not a real AI).' : '.');
    $('ai-answer-text').textContent = g.text;
    const ol = $('ai-answer-steps');
    while (ol.firstChild) ol.removeChild(ol.firstChild);
    for (const s of g.steps) { const li = doc.createElement('li'); li.textContent = s; ol.appendChild(li); }
    box.classList.remove('hidden');
    const next = $('voice-next'); if (next) next.classList.add('hidden');
    const V = root.SVVoice;
    if (V) { V.stepper.load(g.text, g.steps); V.say(g.speak, { now: true }); }
    return true;
  }
  const api = { cleanGuidance, MAX_TEXT, MAX_STEPS };
  if (typeof document !== 'undefined') {
    api.last = null; api.count = 0;
    api.show = (m, whoWords) => { const g = cleanGuidance(m); if (!g) return false; api.last = g; api.count++; return show(document, g, whoWords || 'the AI helper'); };
  }
  root.SVAnswer = api;
})(typeof window !== 'undefined' ? window : globalThis);
