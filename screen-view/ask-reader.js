// Computer page: "Ask the practice AI helper" (voice-ai-2026-11-10). Loaded as a module (type="module").
// Uses the AI reader from ai-reader-2026-11-10 (copied into site/reader/, files renamed .mjs -> .js so a plain
// web server sends them as JavaScript). Only the PRACTICE helper ("mock") is used: no keys, no network,
// no AI company. It does not really look at the picture; it gives a sample answer.
// Flow: question (typed or spoken) + one picture of the shared screen -> guidance -> marks on the AI layer
// (same path as the connector's send_annotation: SVMarks.applyConnector with mode "replace") -> phones and the
// extension get them as before; the words are shown, read aloud if Read aloud is on, and sent to phones.
import { createReader, createMockProvider, toConnectorArgs } from './reader/index.js';

const $ = id => document.getElementById(id);
const reader = createReader({ provider: createMockProvider() });
const R = window.SVAskReader = { asked: 0, answered: 0, last: null, lastError: null, busy: false };
const note = t => { $('ask-note').textContent = t; };

async function ask() {
  if (R.busy) return;
  const q = $('ask-text').value.trim();
  if (!q) { note('Please type or say a question first.'); $('ask-text').focus(); return; }
  if (!(window.SVSender && window.SVSender.isSharing())) { note('Share your screen first, so the practice helper has a picture to look at.'); return; }
  R.busy = true; R.asked++;
  note('Thinking…');
  try {
    const pic = await window.SVConnector.defaultCapture(1024);
    if (window.SVLink && window.SVLink.noteSnapshot) window.SVLink.noteSnapshot();
    const g = await reader.safeRead({ snapshot: 'data:image/png;base64,' + pic.png, question: q });
    if (!g.ok) { R.lastError = g; note('The practice helper could not answer: ' + g.message); return; }
    R.last = g; R.answered++;
    const next = window.SVMarks.applyConnector(window.SVSender.getAiItems(), toConnectorArgs(g));
    window.SVSender.setAiItems(next);
    const msg = { type: 'ai-guidance', text: g.text, steps: g.steps, speak: g.speak, from: 'practice', at: g.at };
    window.SVAnswer.show(msg, 'the practice AI helper');
    R.sentToPhones = window.SVSender.broadcast(msg);
    note(`Answer ready, with ${g.marks.length} mark${g.marks.length === 1 ? '' : 's'} on the picture.` + (R.sentToPhones ? ` Also shown on ${R.sentToPhones} phone${R.sentToPhones === 1 ? '' : 's'}.` : ''));
  } catch (e) {
    R.lastError = { message: String(e && e.message || e) };
    note('The practice helper could not answer: ' + R.lastError.message);
  } finally { R.busy = false; }
}
$('ask-send').addEventListener('click', ask);
R.ready = true;
