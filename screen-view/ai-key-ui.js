// RC3 (Nov 14, 2026): wires the "Your AI key" box and decides, for each question, whether the answer comes
// from a real AI company (Tony's own key + Pro) or from the free practice helper. Module; text only (no innerHTML).
// window.SVAiLive.pick() -> { provider, live:true, label } or { provider:<practice>, live:false, why }
import { createClaudeProvider, createOpenAIProvider, createGrokProvider, createMockProvider, directTransport, extensionTransport, claudeSpec, openaiSpec, grokSpec } from './reader/index.js';

const $ = (id) => document.getElementById(id);
const K = window.SVAiKeys;
const SPECS = { claude: claudeSpec, openai: openaiSpec, grok: grokSpec };
const MAKE = { claude: createClaudeProvider, openai: createOpenAIProvider, grok: createGrokProvider };
const PICK = 'screenview.ai.provider';
const L = window.SVAiLive = { backend: null, status: {}, ready: null, lastTest: null };

const store = (() => { try { return window.localStorage; } catch (e) { return null; } })();
const chosen = () => { const v = $('aikey-provider').value; return SPECS[v] ? v : 'claude'; };
const say = (t) => { $('aikey-status').textContent = t; };

function transportFor(backend) {
  if (backend.kind === 'extension') return extensionTransport(window.chrome && window.chrome.runtime, window.SVExtBridge && window.SVExtBridge.DEFAULT_EXT_ID);
  return directTransport(window.fetch.bind(window));
}

// Build the provider for the chosen company, or the practice helper with a plain reason.
L.pick = function pick() {
  const p = chosen();
  const s = L.status && L.status[p];
  const practice = createMockProvider();
  if (!L.backend || !s || !s.saved) return { provider: practice, live: false, why: 'Practice answer: no AI key is saved yet. Add your key in the "Your AI key" box to get real answers.' };
  if (!(window.SVPro && window.SVPro.isPro())) return { provider: practice, live: false, why: 'Practice answer: real AI answers are part of Screen-View Pro. Enter your Pro key in the Pro box below.' };
  const model = s.model || SPECS[p].defaultModel;
  const provider = MAKE[p]({ apiKey: L.backend.getKey(p), model, transport: transportFor(L.backend) });
  return { provider, live: true, label: K.PROVIDERS[p].label, model };
};

function render() {
  const p = chosen();
  const s = L.status[p] || { saved: false };
  $('aikey-where').textContent = L.backend ? 'Where your key is kept: ' + L.backend.where + '.' : '';
  if (!$('aikey-model').value || $('aikey-model').dataset.auto === '1') { $('aikey-model').value = s.model || SPECS[p].defaultModel; $('aikey-model').dataset.auto = '1'; }
  const pro = !!(window.SVPro && window.SVPro.isPro());
  if (s.saved) say(`${K.PROVIDERS[p].label} key is saved (ends in ${s.last4 || '****'}).` + (pro ? ' Real answers are on.' : ' Real answers also need Screen-View Pro (Pro box below).'));
  else say(`No ${K.PROVIDERS[p].label} key saved. Answers are free practice answers.`);
  $('aikey-remove').disabled = !s.saved; $('aikey-test').disabled = !s.saved;
  $('ask-mode').textContent = s.saved && pro
    ? `Real answers from ${K.PROVIDERS[p].label}: each question sends one picture (of your shared tab, or the picture you chose) and your question to that company, and it charges your key. It needs your screen to be shared, or a picture chosen in "Upload your pictures".`
    : 'It needs your screen to be shared (or a picture chosen in "Upload your pictures" above), and it takes one picture each time you ask. With no AI key (or without Pro) you get a free practice answer that does not really read your screen, and nothing leaves this computer.';
}

async function refresh() {
  try { L.status = (await L.backend.status()) || {}; } catch (e) { L.status = {}; }
  render();
}

async function save() {
  const p = chosen();
  if (!$('aikey-agree').checked) { say('Please tick "I understand each question is charged to my key" first.'); $('aikey-agree').focus(); return; }
  const model = $('aikey-model').value.trim();
  const r = await L.backend.save(p, $('aikey-input').value, model && model !== SPECS[p].defaultModel ? model : '');
  if (!r.ok) { say(r.why || 'The key was not saved.'); return; }
  $('aikey-input').value = '';
  await refresh();
  say(`Saved. ${K.PROVIDERS[p].label} key ending in ${r.last4} is kept in ${L.backend.where}. Press "Test key" to check it (free).`);
}

async function test() {
  const p = chosen();
  say('Checking the key with ' + K.PROVIDERS[p].label + '… (free: this only lists your AI models)');
  const s = L.status[p] || {};
  const prov = MAKE[p]({ apiKey: L.backend.getKey(p), model: s.model || SPECS[p].defaultModel, transport: transportFor(L.backend) });
  try {
    const r = await prov.testKey();
    L.lastTest = { ok: true, provider: p, count: r.models.length, modelAvailable: r.modelAvailable, imageInputAvailable: r.imageInputAvailable };
    const imageNote = p === 'grok'
      ? (r.imageInputAvailable === true ? ' Screenshot/image input is confirmed for this model.'
        : r.imageInputAvailable === false ? ' WARNING: this model does not list image input, so it cannot be used for screenshot reading.'
        : ' The model list did not report image-input capability.')
      : '';
    say(`The key works. ${K.PROVIDERS[p].label} lists ${r.models.length} model${r.models.length === 1 ? '' : 's'} for it.` +
      (r.modelAvailable === false ? ` The model "${r.defaultModel}" is not in that list; type one from your account in the AI model box and press Save key again.` : ` The model "${r.defaultModel}" is ready.`) + imageNote);
  } catch (e) {
    L.lastTest = { ok: false, provider: p, code: e.code };
    say('Key test failed: ' + (e && e.message || e));
  }
}

async function remove() {
  const p = chosen();
  await L.backend.remove(p);
  // Also clear any copy saved in this browser, in case the extension was added later.
  if (L.backend.kind === 'extension') { try { await K.pageBackend().remove(p); } catch (e) {} }
  await refresh();
  say(`${K.PROVIDERS[p].label} key removed from this device.`);
}

L.ready = (async () => {
  const saved = store && store.getItem(PICK);
  if (saved && SPECS[saved]) $('aikey-provider').value = saved;
  L.backend = await K.choose();
  await refresh();
  $('aikey-provider').addEventListener('change', () => { if (store) { try { store.setItem(PICK, chosen()); } catch (e) {} } $('aikey-model').dataset.auto = '1'; render(); });
  $('aikey-model').addEventListener('input', () => { $('aikey-model').dataset.auto = '0'; });
  $('aikey-save').addEventListener('click', save);
  $('aikey-test').addEventListener('click', test);
  $('aikey-remove').addEventListener('click', remove);
  if (window.SVPro && window.SVPro.onChange) window.SVPro.onChange(render);
  return true;
})();
