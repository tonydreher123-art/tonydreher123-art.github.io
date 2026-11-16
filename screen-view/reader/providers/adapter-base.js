// Shared shell for real AI adapters (Claude, OpenAI/ChatGPT, Grok).
//
// RC3 (Nov 14, 2026, about 10:15 PM MST): LIVE CALLS ARE ON, with Tony's yes (voice, about 10:08 PM MST).
// SAFETY RULES BUILT IN:
//  1. No key -> refuses with code 'no_key'. Keys are never read from the environment
//     or from files; they must be handed in on purpose (the "Paste your AI key" box).
//     Exception: a transport that holds the key itself (the Chrome helper extension), marked holdsKey.
//  2. No transport -> refuses with code 'no_transport'. This file still contains no fetch() call;
//     the network part lives in transport.mjs and is handed in, so tests can use a fake one.
//  3. The request only ever goes to the fixed company address in the spec (never a page-chosen URL).
//  4. buildRequest() shows what WOULD be sent with the key hidden.

import { ReaderError } from '../lib/snapshot.js';
import { extractJson } from '../lib/guidance.js';

export const LIVE_CALLS_ENABLED = true;

// Short, plain error text from a company's error reply. Never includes the key.
export function companyError(company, status, json) {
  const msg = json && json.error && (json.error.message || (typeof json.error === 'string' ? json.error : '')) || (json && json.message) || '';
  // xAI answers a wrong key with 400 "Incorrect API key provided" (checked Nov 14, 2026), so look at the words too.
  if (status === 401 || status === 403 || (status === 400 && /api[ -]?key/i.test(String(msg)))) return new ReaderError('bad_key', `${company} did not accept the key. Check that you pasted the whole key, and that it is still active.`);
  if (status === 429) return new ReaderError('rate_or_credit', `${company} said "too many requests" or no credit left on the account. Wait a minute, or add credit on the ${company} website.`);
  if (status === 402) return new ReaderError('rate_or_credit', `${company} says the account needs credit or a payment method.`);
  if (status === 404) return new ReaderError('bad_model', `${company} did not find that AI model. Press "Test key" to see which models your key can use.`);
  return new ReaderError('company_error', `${company} answered with an error (${status})${msg ? ': ' + String(msg).slice(0, 200) : ''}.`);
}

export function createAdapter(spec, { apiKey, model, transport } = {}) {
  const key = typeof apiKey === 'string' ? apiKey.trim() : '';
  const chosenModel = model ? String(model).trim() : spec.defaultModel;
  const holdsKey = !!(transport && transport.holdsKey);
  let calls = 0, refused = 0;

  function redactedHeaders() { return spec.headers(key || holdsKey ? '***hidden***' : '<no key>'); }
  function guard() {
    if (!key && !holdsKey) { refused++; throw new ReaderError('no_key', `${spec.company} needs an API key, and none was given. Nothing was sent.`); }
    if (!LIVE_CALLS_ENABLED) { refused++; throw new ReaderError('live_calls_off', `Live ${spec.company} calls are turned off in this build. Nothing was sent.`); }
    if (!transport || typeof transport.send !== 'function') { refused++; throw new ReaderError('no_transport', 'No way to reach the AI company was set up. Nothing was sent.'); }
  }
  async function send(req) {
    let res;
    try { res = await transport.send({ provider: spec.name, headers: holdsKey ? undefined : spec.headers(key), ...req }); }
    catch (e) { throw new ReaderError('network', `Could not reach ${spec.company}. Check the internet connection. (${String(e && e.message || e).slice(0, 120)})`); }
    if (!res || typeof res.status !== 'number') throw new ReaderError('network', `No answer from ${spec.company}.`);
    if (res.status < 200 || res.status >= 300) throw companyError(spec.company, res.status, res.json);
    return res.json;
  }

  return {
    name: spec.name,
    company: spec.company,
    needsKey: true,
    hasKey: !!key || holdsKey,
    model: chosenModel,
    get refusedCount() { return refused; },
    get callCount() { return calls; },

    // What the request would look like. The picture is shortened so it can be shown safely.
    buildRequest({ dataUrl, system, user }) {
      const short = String(dataUrl || '').slice(0, 40) + '…';
      return { method: 'POST', url: spec.url, headers: redactedHeaders(), body: spec.body({ model: chosenModel, dataUrl: short, system, user }), sent: false };
    },

    // Turn the company's reply JSON into a guidance-like object.
    parseReply(reply) {
      const textOut = spec.replyText(reply);
      if (!textOut) throw new ReaderError('bad_guidance', `${spec.company} reply had no text.`);
      try { return extractJson(textOut); }
      catch (e) { return { text: String(textOut).slice(0, 1500), steps: [], marks: [], needsUserAction: true }; } // plain words, no marks
    },

    // One real, billed question: picture + question -> guidance.
    async ask({ dataUrl, system, user }) {
      guard();
      calls++;
      const json = await send({ method: 'POST', url: spec.url, body: spec.body({ model: chosenModel, dataUrl, system, user }) });
      return this.parseReply(json);
    },

    // "Test key": lists the models the key can use. Free at all three companies (no AI answer is made).
    async testKey() {
      guard();
      const json = await send({ method: 'GET', url: spec.modelsUrl });
      // xAI's /v1/language-models returns { models:[...] } with input_modalities;
      // OpenAI/Anthropic model-list endpoints use { data:[...] }. Accept both shapes.
      const entries = json && Array.isArray(json.data) ? json.data
        : json && Array.isArray(json.models) ? json.models : [];
      const ids = entries.map((m) => m && m.id).filter(Boolean).map(String);
      const selected = entries.find((m) => m && (m.id === chosenModel ||
        (Array.isArray(m.aliases) && m.aliases.includes(chosenModel))));
      const imageInputAvailable = selected && Array.isArray(selected.input_modalities)
        ? selected.input_modalities.includes('image') : null;
      return {
        ok: true, company: spec.company, models: ids, defaultModel: chosenModel,
        modelAvailable: ids.length ? (ids.includes(chosenModel) || !!selected) : null,
        imageInputAvailable,
      };
    },
  };
}
