// How a real AI request leaves the device. Two ways, same shape:
//   send({ provider, method, url, headers, body }) -> { status, json }
//
// 1. directTransport(fetch): this browser calls the AI company itself, with the key from this device.
//    Only the three fixed company addresses are allowed. The page's security policy allows exactly these.
// 2. extensionTransport(runtime, extId): the Screen-View Helper Chrome extension holds the key
//    (chrome.storage.local) and makes the request. The page never sees the key. holdsKey = true.
export const COMPANY_HOSTS = {
  claude: 'https://api.anthropic.com/',
  openai: 'https://api.openai.com/',
  grok: 'https://api.x.ai/',
};
export const MAX_BODY = 12 * 1024 * 1024;

export function allowedUrl(provider, url) {
  const base = COMPANY_HOSTS[provider];
  return !!base && typeof url === 'string' && url.startsWith(base) && !/[\s@]/.test(url);
}

export function directTransport(fetchImpl = globalThis.fetch) {
  return {
    kind: 'direct',
    holdsKey: false,
    async send({ provider, method = 'POST', url, headers, body }) {
      if (!allowedUrl(provider, url)) throw new Error('That address is not one of the three AI companies.');
      const text = body === undefined ? undefined : JSON.stringify(body);
      if (text && text.length > MAX_BODY) throw new Error('The picture is too big to send.');
      const res = await fetchImpl(url, { method, headers, body: text, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
      let json = null;
      try { json = await res.json(); } catch (e) { json = null; }
      return { status: res.status, json };
    },
  };
}

export function extensionTransport(runtime, extId, { timeoutMs = 120000 } = {}) {
  return {
    kind: 'extension',
    holdsKey: true,
    send({ provider, method = 'POST', url, body }) {
      return new Promise((resolve, reject) => {
        if (!runtime || !extId) { reject(new Error('The Screen-View Helper extension is not available.')); return; }
        let done = false;
        const t = setTimeout(() => { if (!done) { done = true; reject(new Error('The Screen-View Helper extension did not answer in time.')); } }, timeoutMs);
        try {
          runtime.sendMessage(extId, { source: 'screen-view', v: 1, message: { type: 'ai-call', provider, method, url, body } }, (res) => {
            if (done) return; done = true; clearTimeout(t);
            const err = runtime.lastError;
            if (err) { reject(new Error(String(err.message || err))); return; }
            if (!res || res.ok === false && typeof res.status !== 'number') { reject(new Error((res && res.error) || 'No answer from the extension.')); return; }
            resolve({ status: res.status, json: res.json });
          });
        } catch (e) { done = true; clearTimeout(t); reject(e); }
      });
    },
  };
}
