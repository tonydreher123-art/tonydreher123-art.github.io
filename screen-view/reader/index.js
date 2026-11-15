// One import for everything.
export { createReader, ReaderError, MAX_QUESTION } from './lib/reader.js';
export { readSnapshot, toDataUrl, fingerprint } from './lib/snapshot.js';
export { normalizeGuidance, normalizeMark, toAnnotateMessage, toConnectorArgs, extractJson, KINDS } from './lib/guidance.js';
export { SYSTEM_PROMPT } from './lib/prompt.js';
export { createMockProvider } from './providers/mock.js';
export { createClaudeProvider } from './providers/claude.js';
export { createOpenAIProvider } from './providers/openai.js';
export { createGrokProvider } from './providers/grok.js';
export { LIVE_CALLS_ENABLED, companyError } from './providers/adapter-base.js';
export { directTransport, extensionTransport, allowedUrl, COMPANY_HOSTS } from './providers/transport.js';
export { claudeSpec } from './providers/claude.js';
export { openaiSpec } from './providers/openai.js';
export { grokSpec } from './providers/grok.js';

import { createMockProvider } from './providers/mock.js';
import { createClaudeProvider } from './providers/claude.js';
import { createOpenAIProvider } from './providers/openai.js';
import { createGrokProvider } from './providers/grok.js';

// Pick a provider by name. Unknown names fall back to nothing (error), never to a paid one.
export function providerByName(name, opts = {}) {
  switch (String(name || 'mock').toLowerCase()) {
    case 'mock': return createMockProvider(opts);
    case 'claude': return createClaudeProvider(opts);
    case 'openai': case 'chatgpt': return createOpenAIProvider(opts);
    case 'grok': case 'xai': return createGrokProvider(opts);
    default: { const e = new Error(`Unknown helper "${name}". Use mock, claude, openai, or grok.`); e.code = 'unknown_provider'; throw e; }
  }
}
