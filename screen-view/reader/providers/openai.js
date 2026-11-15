// OpenAI (ChatGPT) adapter shell. No network code here; see adapter-base.mjs.
import { createAdapter } from './adapter-base.js';
import { chatBody, chatReplyText, bearer } from './openai-compatible.js';

export const openaiSpec = {
  name: 'openai', company: 'OpenAI (ChatGPT)',
  url: 'https://api.openai.com/v1/chat/completions',
  headers: bearer, body: chatBody, replyText: chatReplyText,
};
export const createOpenAIProvider = opts => createAdapter(openaiSpec, opts);
