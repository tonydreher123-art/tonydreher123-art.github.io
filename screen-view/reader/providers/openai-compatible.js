// Shared request/reply shape for "chat completions" style APIs (OpenAI and xAI Grok use it).
// tokenField: OpenAI's newer models want "max_completion_tokens"; xAI accepts "max_tokens".
export const chatBody = ({ model, dataUrl, system, user }, tokenField = 'max_tokens', limit = 2000) => ({
  model, [tokenField]: limit,
  messages: [
    { role: 'system', content: system },
    { role: 'user', content: [
      { type: 'text', text: user },
      { type: 'image_url', image_url: { url: dataUrl } },
    ] },
  ],
});
export const chatReplyText = r => {
  const c = r && r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map(p => (p && (p.text || '')) || '').join('\n');
  return '';
};
export const bearer = key => ({ authorization: 'Bearer ' + key, 'content-type': 'application/json' });
