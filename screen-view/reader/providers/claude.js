// Claude (Anthropic) adapter shell. Request shape follows Anthropic's Messages API
// (image as a base64 "source" block). No network code here; see adapter-base.mjs.
import { createAdapter } from './adapter-base.js';

const b64 = u => String(u).replace(/^data:[^,]*,/, '');

export const claudeSpec = {
  name: 'claude',
  company: 'Anthropic (Claude)',
  url: 'https://api.anthropic.com/v1/messages',
  headers: key => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }),
  body: ({ model, dataUrl, system, user }) => ({
    model, max_tokens: 800, system,
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: b64(dataUrl) } },
      { type: 'text', text: user },
    ] }],
  }),
  replyText: r => (r && Array.isArray(r.content) ? r.content.filter(c => c && c.type === 'text').map(c => c.text).join('\n') : ''),
};

export const createClaudeProvider = opts => createAdapter(claudeSpec, opts);
