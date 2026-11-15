// OpenAI (ChatGPT) adapter. OpenAI's API answers browser requests (CORS), checked Nov 14, 2026.
// Network code is in transport.mjs; see adapter-base.mjs.
import { createAdapter } from './adapter-base.js';
import { chatBody, chatReplyText, bearer } from './openai-compatible.js';

export const openaiSpec = {
  name: 'openai', company: 'OpenAI (ChatGPT)',
  url: 'https://api.openai.com/v1/chat/completions',
  modelsUrl: 'https://api.openai.com/v1/models',
  defaultModel: 'gpt-6.1-sol',
  headers: bearer, body: (a) => chatBody(a, 'max_completion_tokens', 4000), replyText: chatReplyText,
};
export const createOpenAIProvider = opts => createAdapter(openaiSpec, opts);
