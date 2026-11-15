// Claude (Anthropic) adapter. Request shape follows Anthropic's Messages API
// (image as a base64 "source" block). Anthropic allows calls straight from a browser only with the
// "anthropic-dangerous-direct-browser-access" header (the key is then visible to that browser, which is
// Tony's own device). Network code is in transport.mjs; see adapter-base.mjs.
import { createAdapter } from './adapter-base.js';

const b64 = u => String(u).replace(/^data:[^,]*,/, '');

export const claudeSpec = {
  name: 'claude',
  company: 'Anthropic (Claude)',
  url: 'https://api.anthropic.com/v1/messages',
  modelsUrl: 'https://api.anthropic.com/v1/models',
  defaultModel: 'claude-sonnet-5-5',
  headers: key => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'content-type': 'application/json' }),
  body: ({ model, dataUrl, system, user }) => ({
    model, max_tokens: 2000, system,
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: b64(dataUrl) } },
      { type: 'text', text: user },
    ] }],
  }),
  replyText: r => (r && Array.isArray(r.content) ? r.content.filter(c => c && c.type === 'text').map(c => c.text).join('\n') : ''),
};

export const createClaudeProvider = opts => createAdapter(claudeSpec, opts);
