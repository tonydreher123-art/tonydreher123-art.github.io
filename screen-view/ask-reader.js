// Computer page: "Ask the AI helper" (voice-ai-2026-11-10; RC3 Nov 14, 2026: real answers switched on).
// Real answer: only when an AI key is saved in the "Your AI key" box AND Screen-View Pro is on (window.SVAiLive.pick()).
// Otherwise the free PRACTICE helper ("mock") answers: no key, no network, no AI company, and it does not really
// look at the picture.
// Flow: question (typed or spoken) + one picture of the shared screen -> guidance -> marks on the AI layer
// (same path as the connector's send_annotation: SVMarks.applyConnector with mode "replace") -> phones and the
// extension get them as before; the words are shown, read aloud if Read aloud is on, and sent to phones.
import { createReader, createMockProvider, toConnectorArgs } from './reader/index.js';

const $ = id => document.getElementById(id);
const R = window.SVAskReader = { asked: 0, answered: 0, live: 0, last: null, lastError: null, busy: false, lastMode: null };
const note = t => { $('ask-note').textContent = t; };

function choose() {
  const L = window.SVAiLive;
  if (L && typeof L.pick === 'function') { try { return L.pick(); } catch (e) { /* fall through to practice */ } }
  return { provider: createMockProvider(), live: false, why: '' };
}

async function ask() {
  if (R.busy) return;
  const q = $('ask-text').value.trim();
  if (!q) { note('Please type or say a question first.'); $('ask-text').focus(); return; }
  if (!(window.SVSender && window.SVSender.isSharing())) { note('Share your screen first, so the helper has a picture to look at.'); return; }
  const pick = choose();
  const who = pick.live ? pick.label : 'the practice AI helper';
  R.busy = true; R.asked++; R.lastMode = pick.live ? 'live' : 'practice';
  note(pick.live ? `Sending one picture and your question to ${pick.label}… (this is charged to your key)` : 'Thinking…');
  try {
    const pic = await window.SVConnector.defaultCapture(1024);
    if (window.SVLink && window.SVLink.noteSnapshot) window.SVLink.noteSnapshot();
    const reader = createReader({ provider: pick.provider });
    const g = await reader.safeRead({ snapshot: 'data:image/png;base64,' + pic.png, question: q });
    if (!g.ok) { R.lastError = g; note(`${pick.live ? pick.label : 'The practice helper'} could not answer: ` + g.message); return; }
    R.last = g; R.answered++; if (pick.live) R.live++;
    const next = window.SVMarks.applyConnector(window.SVSender.getAiItems(), toConnectorArgs(g));
    window.SVSender.setAiItems(next);
    const msg = { type: 'ai-guidance', text: g.text, steps: g.steps, speak: g.speak, from: pick.live ? pick.provider.name : 'practice', at: g.at };
    window.SVAnswer.show(msg, who);
    R.sentToPhones = window.SVSender.broadcast(msg);
    note(`Answer ready, with ${g.marks.length} mark${g.marks.length === 1 ? '' : 's'} on the picture.` + (R.sentToPhones ? ` Also shown on ${R.sentToPhones} phone${R.sentToPhones === 1 ? '' : 's'}.` : '') + (pick.live ? '' : (pick.why ? ' ' + pick.why : '')));
  } catch (e) {
    R.lastError = { message: String(e && e.message || e) };
    note(`${pick.live ? pick.label : 'The practice helper'} could not answer: ` + R.lastError.message);
  } finally { R.busy = false; }
}
$('ask-send').addEventListener('click', ask);
R.ready = true;
