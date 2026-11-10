'use strict';
(function () {
  const { PEER_OPTS, PREFIX, pretty, newCode, linkType } = window.SVCommon;
  const $ = id => document.getElementById(id);
  const S = window.SV = { role: 'sender', room: null, stream: null, call: null, conn: null, state: 'starting', link: null };
  const status = t => { $('status').textContent = t; S.state = t; };
  let peer = null;

  function start(tries) {
    const code = newCode();
    peer = new Peer(PREFIX + code, PEER_OPTS);
    peer.on('open', () => {
      S.room = code;
      S.link = new URL('view.html#' + code, location.href).href;
      $('code').textContent = pretty(code);
      $('link').textContent = S.link;
      try { const q = qrcode(0, 'M'); q.addData(S.link); q.make(); $('qr').innerHTML = q.createImgTag(8, 0, 'QR code to open the viewer on the phone'); }
      catch (e) { $('qr').classList.add('hidden'); }
      $('share').disabled = false;
      status('Ready. Click "Share my screen". Then open the link on the phone.');
    });
    peer.on('connection', conn => {
      // one viewer at a time: the newest replaces the old one
      if (S.conn && S.conn !== conn) { try { S.conn.close(); } catch (e) {} }
      S.conn = conn;
      conn.on('open', () => {
        if (S.stream) callViewer();
        else { conn.send({ type: 'waiting' }); status('Phone is connected and waiting. Click "Share my screen".'); }
      });
      conn.on('close', () => { if (S.conn === conn) { S.conn = null; endCall(); if (S.stream) status('Phone left. Sharing is still on; open the link on the phone again.'); } });
    });
    peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
    peer.on('error', err => {
      if (err.type === 'unavailable-id' && tries < 3) { peer.destroy(); start(tries + 1); return; }
      if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error' || err.type === 'socket-closed')
        status('Could not reach the free connection helper (PeerJS). Check the internet, then reload this page.');
      else status('Problem: ' + err.type + '. Reload this page to try again.');
    });
  }

  function endCall() { if (S.call) { try { S.call.close(); } catch (e) {} S.call = null; } }

  function callViewer() {
    endCall();
    const call = S.call = peer.call(S.conn.peer, S.stream);
    status('Sending to the phone…');
    const pc = call.peerConnection;
    if (pc) pc.addEventListener('connectionstatechange', async () => {
      if (call !== S.call) return;
      const st = pc.connectionState;
      if (st === 'connected') status(`Sharing to the phone (${await linkType(pc)} link).`);
      else if (st === 'failed') status('Could not reach the phone. The network may be blocking a direct link (see README: TURN).');
      else if (st === 'disconnected') status('Connection to the phone dropped. Waiting…');
    });
  }

  async function share() {
    try { S.stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false }); }
    catch (e) { status('Sharing was cancelled. Nothing was shared.'); return; }
    S.stream.getVideoTracks()[0].addEventListener('ended', stop);
    $('share').classList.add('hidden'); $('stop').classList.remove('hidden'); $('stop').focus();
    if (S.conn && S.conn.open) callViewer();
    else status('Sharing is ready. Now open the link on the phone (scan the square code).');
  }

  function stop() {
    if (S.stream) S.stream.getTracks().forEach(t => t.stop());
    S.stream = null;
    endCall();
    if (S.conn && S.conn.open) S.conn.send({ type: 'bye' });
    $('stop').classList.add('hidden'); $('share').classList.remove('hidden'); $('share').focus();
    status('Stopped. Nothing is being shared. Click "Share my screen" to start again.');
  }

  $('share').addEventListener('click', share);
  $('stop').addEventListener('click', stop);
  window.addEventListener('pagehide', () => { if (peer) peer.destroy(); });
  start(0);
})();
