// Provider-neutral snapshot reader.
//   const reader = createReader({ provider: createMockProvider() });
//   const g = await reader.read({ snapshot, question });
// "provider" is any object with { name, async ask({ snap, dataUrl, question, system, user }) }
// that returns a raw guidance-like object. The reader checks inputs and output so every
// provider gives the same safe shape.

import { readSnapshot, toDataUrl, fingerprint, ReaderError } from './snapshot.js';
import { normalizeGuidance } from './guidance.js';
import { SYSTEM_PROMPT, userPrompt } from './prompt.js';

export const MAX_QUESTION = 1000;

export function createReader({ provider, now } = {}) {
  if (!provider || typeof provider.ask !== 'function') throw new ReaderError('no_provider', 'A provider with an ask() function is required.');
  const clock = typeof now === 'function' ? now : () => new Date().toISOString();

  async function read({ snapshot, question } = {}) {
    const q = String(question == null ? '' : question).trim();
    if (!q) throw new ReaderError('no_question', 'Please type or say a question.');
    if (q.length > MAX_QUESTION) throw new ReaderError('question_too_long', `Questions are limited to ${MAX_QUESTION} characters.`);
    const snap = readSnapshot(snapshot);
    const id = await fingerprint(snap.bytes);
    const raw = await provider.ask({
      snap, question: q,
      dataUrl: toDataUrl(snap),
      system: SYSTEM_PROMPT,
      user: userPrompt(q, snap),
    });
    return normalizeGuidance(raw, {
      provider: provider.name,
      question: q,
      snapshot: { width: snap.width, height: snap.height, id },
      at: clock(),
    });
  }

  // Same as read() but never throws: returns { ok:false, code, message } instead.
  async function safeRead(args) {
    try { return await read(args); }
    catch (e) { return { ok: false, code: e.code || 'error', message: e.message, provider: provider.name }; }
  }

  return { read, safeRead, provider: provider.name };
}

export { ReaderError };
