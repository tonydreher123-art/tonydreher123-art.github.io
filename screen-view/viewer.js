'use strict';
(function () {
  const { PEER_OPTS, PREFIX, norm, pretty, linkType } = window.SVCommon;
  const $ = id => document.getElementById(id);
  const S = window.SV = { role: 'viewer', room: null, call: null, state: 'starting', link: null };
  const status = t => { $('status').textContent = t; S.state = t; };
  const video = $('v');
  let peer = null, joining = false;

  function clearVideo() { video.srcObject = null; $('full').classList.add('hidden'); }
  function askCode(msg) { $('ask').classList.remove('hidden'); status(msg); }

  function join(raw) {
    const code = norm(raw);
    if (code.length !== 8) { askCode('That code should have 8 letters/numbers. Try again.'); return; }
    if (joining) return; joining = true;
    $('ask').classList.add('hidden');
    S.room = code;
    history.replaceState(null, '', '#' + code);
    status('Connecting to the Chromebook…');
    if (peer) peer.destroy();
    peer = new Peer(PEER_OPTS);
    peer.on('open', () => {
      const conn = peer.connect(PREFIX + code, { reliable: true });
      conn.on('open', () => status(`Joined room ${pretty(code)}. Waiting for the Chromebook…`));
      conn.on('data', m => {
        if (!m || typeof m !== 'object') return;
        if (m.type === 'waiting') status('Connected to the Chromebook. Waiting for it to click "Share my screen"…');
        if (m.type === 'bye') { endCall(); clearVideo(); status('The Chromebook stopped sharing. Leave this page open; it will show again when sharing restarts.'); }
      });
      conn.on('close', () => { endCall(); clearVideo(); joining = false; status('The Chromebook page closed. Scan the new code on the Chromebook.'); });
    });
    peer.on('call', call => {
      endCall();
      S.call = call;
      call.answer(); // receive only: the phone sends nothing
      call.on('stream', st => { video.srcObject = st; video.play().catch(() => {}); $('full').classList.remove('hidden'); });
      call.on('close', () => { if (S.call === call) { S.call = null; clearVideo(); } });
      const pc = call.peerConnection;
      if (pc) pc.addEventListener('connectionstatechange', async () => {
        if (call !== S.call) return;
        const st = pc.connectionState;
        if (st === 'connected') { S.link = await linkType(pc); status(`Showing the Chromebook screen (${S.link} link).`); }
        else if (st === 'failed') status('Could not connect. The network may be blocking a direct link.');
        else if (st === 'disconnected') status('Connection dropped. Waiting…');
      });
    });
    peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
    peer.on('error', err => {
      joining = false;
      if (err.type === 'peer-unavailable') askCode('Room not found. Check the code, or reload the Chromebook page for a new one.');
      else if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type)) status('Could not reach the free connection helper (PeerJS). Check the internet and reload.');
      else status('Problem: ' + err.type + '. Reload to try again.');
    });
  }
  function endCall() { if (S.call) { const c = S.call; S.call = null; try { c.close(); } catch (e) {} } }

  $('go').addEventListener('click', () => join($('codein').value));
  $('codein').addEventListener('keydown', e => { if (e.key === 'Enter') join($('codein').value); });
  $('full').addEventListener('click', () => { (video.requestFullscreen || video.webkitEnterFullscreen || (() => {})).call(video); });

  const fromLink = location.hash.slice(1);
  if (fromLink) join(fromLink);
  else { askCode('Type the code shown on the Chromebook.'); $('codein').focus(); }
})();
