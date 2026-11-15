// Grok (xAI) adapter shell. xAI's API uses the same chat-completions shape as OpenAI.
// No network code here; see adapter-base.mjs.
import { createAdapter } from './adapter-base.js';
import { chatBody, chatReplyText, bearer } from './openai-compatible.js';

export const grokSpec = {
  name: 'grok', company: 'xAI (Grok)',
  url: 'https://api.x.ai/v1/chat/completions',
  headers: bearer, body: chatBody, replyText: chatReplyText,
};
export const createGrokProvider = opts => createAdapter(grokSpec, opts);
