// Grok (xAI) adapter. xAI's chat-completions endpoint accepts OpenAI-compatible text/image messages.
// Use /v1/language-models for the key test: unlike /v1/models, it exposes input modalities,
// so Screen-View can verify that the selected model actually accepts screenshots.
import { createAdapter } from './adapter-base.js';
import { chatBody, chatReplyText, bearer } from './openai-compatible.js';

export const grokSpec = {
  name: 'grok', company: 'xAI (Grok)',
  url: 'https://api.x.ai/v1/chat/completions',
  modelsUrl: 'https://api.x.ai/v1/language-models',
  defaultModel: 'grok-4.7',
  headers: bearer, body: (a) => chatBody(a, 'max_tokens', 2000), replyText: chatReplyText,
};
export const createGrokProvider = opts => createAdapter(grokSpec, opts);
