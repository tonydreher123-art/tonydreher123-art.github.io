// Grok (xAI) adapter. xAI's API uses the same chat-completions shape as OpenAI and answers browser
// requests (CORS), checked Nov 14, 2026. Network code is in transport.mjs; see adapter-base.mjs.
import { createAdapter } from './adapter-base.js';
import { chatBody, chatReplyText, bearer } from './openai-compatible.js';

export const grokSpec = {
  name: 'grok', company: 'xAI (Grok)',
  url: 'https://api.x.ai/v1/chat/completions',
  modelsUrl: 'https://api.x.ai/v1/models',
  defaultModel: 'grok-4.7',
  headers: bearer, body: (a) => chatBody(a, 'max_tokens', 2000), replyText: chatReplyText,
};
export const createGrokProvider = opts => createAdapter(grokSpec, opts);
