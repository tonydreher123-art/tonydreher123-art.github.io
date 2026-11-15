// Shared shell for real AI adapters (Claude, OpenAI/ChatGPT, Grok).
//
// SAFETY RULES BUILT IN:
//  1. No key -> refuses with code 'no_key'. Keys are never read from the environment
//     or from files; they must be handed in on purpose.
//  2. Even WITH a key, this build refuses with code 'live_calls_off'. Live calls cost
//     money and send the picture to a company, so they stay off until Tony says yes.
//  3. This file contains no fetch() call at all. buildRequest() only shows what WOULD
//     be sent (with the key hidden), and parseReply() reads a reply someone pastes in.

import { ReaderError } from '../lib/snapshot.js';
import { extractJson } from '../lib/guidance.js';

export const LIVE_CALLS_ENABLED = false;

export function createAdapter(spec, { apiKey, model } = {}) {
  const key = typeof apiKey === 'string' ? apiKey.trim() : '';
  const chosenModel = model ? String(model) : null;
  let refused = 0;

  function redactedHeaders() {
    const h = spec.headers(key ? '***hidden***' : '<no key>');
    return h;
  }

  return {
    name: spec.name,
    company: spec.company,
    needsKey: true,
    hasKey: !!key,
    model: chosenModel,
    get refusedCount() { return refused; },

    // What the request would look like. The picture is shortened so it can be shown safely.
    buildRequest({ dataUrl, system, user }) {
      const short = String(dataUrl || '').slice(0, 40) + '…';
      return {
        method: 'POST',
        url: spec.url,
        headers: redactedHeaders(),
        body: spec.body({ model: chosenModel || '<model to be chosen>', dataUrl: short, system, user }),
        sent: false,
      };
    },

    // Turn the company's reply JSON into a guidance-like object.
    parseReply(reply) {
      const textOut = spec.replyText(reply);
      if (!textOut) throw new ReaderError('bad_guidance', `${spec.company} reply had no text.`);
      return extractJson(textOut);
    },

    async ask() {
      refused++;
      if (!key) throw new ReaderError('no_key', `${spec.company} needs an API key, and none was given. Nothing was sent.`);
      if (!LIVE_CALLS_ENABLED) throw new ReaderError('live_calls_off', `Live ${spec.company} calls are turned off in this build until Tony approves. Nothing was sent.`);
      throw new ReaderError('live_calls_off', 'Nothing was sent.');
    },
  };
}
