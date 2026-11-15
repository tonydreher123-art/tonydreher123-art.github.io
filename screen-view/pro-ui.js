// Wires the Pro box on the sharing page to pro.js. Text only (never innerHTML).
'use strict';
(function () {
  const $ = (id) => document.getElementById(id);
  const P = window.SVPro;
  if (!P || !$('pro-box')) return;
  function render(s) {
    const st = $('pro-status');
    if (s.pro) {
      const who = s.payload && s.payload.name ? ' for ' + String(s.payload.name).slice(0, 60) : '';
      st.textContent = 'Pro is on' + who + '. Thank you! AI helper and up to 3 phone viewers are unlocked.';
      $('pro-enter').classList.add('hidden'); $('pro-remove').classList.remove('hidden');
    } else {
      st.textContent = 'Free version: 1 phone viewer. Pro (one-time unlock) adds the AI helper and up to 3 viewers.' + (s.why ? ' ' + s.why : '');
      $('pro-enter').classList.remove('hidden'); $('pro-remove').classList.add('hidden');
    }
    $('ai-pro-note').classList.toggle('hidden', !!s.pro);
  }
  P.onChange(render);
  render(P.info());
  $('pro-unlock').addEventListener('click', async () => {
    $('pro-status').textContent = 'Checking the key on this device…';
    const r = await P.unlock($('pro-key').value);
    if (r.ok) $('pro-key').value = '';
  });
  $('pro-remove').addEventListener('click', () => P.remove());
})();
