// Computer page (hotfix 2026-11-15; upload build 2026-11-15: can use a chosen picture instead of the shared screen): "Ask the AI helper" (voice-ai-2026-11-10; RC3 Nov 14, 2026: real answers switched on).
// Real answer: only when an AI key is saved in the "Your AI key" box AND Screen-View Pro is on (window.SVAiLive.pick()).
// Otherwise the free PRACTICE helper ("mock") answers: no key, no network, no AI company, and it does not really
// look at the picture.
// Flow: question (typed or spoken) + one picture of the shared screen -> guidance -> marks on the AI layer
// (same path as the connector's send_annotation: SVMarks.applyConnector with mode "replace") -> phones and the
// extension get them as before; the words are shown, read aloud if Read aloud is on, and sent to phones.
import { createReader, createMockProvider, toConnectorArgs } from './reader/index.js';

const $ = id => document.getElementById(id);
const R = window.SVAskReader = { asked: 0, answered: 0, live: 0, last: null, lastError: null, busy: false, lastMode: null };
// Hotfix Nov 15, 2026: every press now shows a fresh, timed message (so a repeat press never looks like "nothing
// happened"), the button says "Working…" while busy, and the message is scrolled into view.
const note = t => {
  const el = $('ask-note');
  const at = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  el.textContent = t + ' (' + at + ')';
  try { el.scrollIntoView({ block: 'nearest' }); } catch (e) { /* ignore */ }
};
const setBusy = on => { R.busy = on; const b = $('ask-send'); b.textContent = on ? 'Working…' : 'Get answer'; b.setAttribute('aria-busy', on ? 'true' : 'false'); };

function choose() {
  const L = window.SVAiLive;
  if (L && typeof L.pick === 'function') { try { return L.pick(); } catch (e) { /* fall through to practice */ } }
  return { provider: createMockProvider(), live: false, why: '' };
}

async function ask() {
  if (R.busy) { note('Still waiting for the last answer. It will finish or stop by itself within about a minute.'); return; }
  const q = $('ask-text').value.trim();
  if (!q) { note('Please type or say a question first.'); $('ask-text').focus(); return; }
  // Upload build (Nov 15, 2026): a picture chosen in "Upload your pictures" (pictures.js) can be used instead of the
  // shared screen. Then no screen sharing is needed, and marks are not drawn on the shared-screen preview or sent
  // to phones (they belong to the chosen picture, not the screen). Same practice/live rules and cost wording.
  const PIC = window.SVPictures;
  // Nov 15 2026: a live shared screen always wins; an uploaded picture is used only when nothing is shared.
  const sharingLive = !!(window.SVSender && window.SVSender.isSharing && window.SVSender.isSharing());
  const usePic = !sharingLive && !!(PIC && PIC.useForAnswer && PIC.useForAnswer());
  if (!usePic && !(window.SVSender && window.SVSender.isSharing())) { note('Share your screen first, or choose a picture in "Upload your pictures", so the helper has a picture to look at.'); return; }
  const pick = choose();
  const who = pick.live ? pick.label : 'the practice AI helper';
  const picName = usePic ? PIC.choiceLabel() : '';
  setBusy(true); R.asked++; R.lastMode = pick.live ? 'live' : 'practice'; R.lastSource = usePic ? 'picture' : 'screen';
  note(pick.live ? (usePic ? `Sending your chosen picture and your question to ${pick.label}… (this is charged to your key)` : `Sending one picture and your question to ${pick.label}… (this is charged to your key)`) : 'Thinking…');
  try {
    let snapshot;
    if (usePic) snapshot = await PIC.snapshotForAnswer();
    else {
      const pic = await window.SVConnector.defaultCapture(1024);
      if (window.SVLink && window.SVLink.noteSnapshot) window.SVLink.noteSnapshot();
      snapshot = 'data:image/png;base64,' + pic.png;
    }
    const reader = createReader({ provider: pick.provider });
    const g = await reader.safeRead({ snapshot, question: q });
    if (!g.ok) { R.lastError = g; note(`${pick.live ? pick.label : 'The practice helper'} could not answer: ` + g.message); return; }
    R.last = g; R.answered++; if (pick.live) R.live++;
    if (!usePic) {
      const next = window.SVMarks.applyConnector(window.SVSender.getAiItems(), toConnectorArgs(g));
      window.SVSender.setAiItems(next);
    }
    const msg = { type: 'ai-guidance', text: g.text, steps: g.steps, speak: g.speak, from: pick.live ? pick.provider.name : 'practice', at: g.at };
    window.SVAnswer.show(msg, who);
    R.sentToPhones = window.SVSender.broadcast(msg);
    note((usePic ? `Answer ready, about your picture "${picName}".` : `Answer ready, with ${g.marks.length} mark${g.marks.length === 1 ? '' : 's'} on the picture.`) + (R.sentToPhones ? ` Also shown on ${R.sentToPhones} phone${R.sentToPhones === 1 ? '' : 's'}.` : '') + (pick.live ? '' : (pick.why ? ' ' + pick.why : '')));
  } catch (e) {
    R.lastError = { message: String(e && e.message || e) };
    note(`${pick.live ? pick.label : 'The practice helper'} could not answer: ` + R.lastError.message);
  } finally { setBusy(false); }
}
$('ask-send').addEventListener('click', ask);
R.ready = true;
