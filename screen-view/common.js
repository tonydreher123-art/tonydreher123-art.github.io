// Shared helpers. Signaling uses the free public PeerJS cloud server (0.peerjs.com),
// which only passes connection setup; video goes browser to browser.
'use strict';
window.SVCommon = (function () {
  const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
  const PEER_OPTS = { debug: 0, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } };
  const PREFIX = 'screenview-';
  const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const pretty = c => c.length === 8 ? c.slice(0, 4) + '-' + c.slice(4) : c;
  function newCode() {
    const b = new Uint8Array(8); crypto.getRandomValues(b);
    let s = ''; for (let i = 0; i < 8; i++) s += ALPHA[b[i] % ALPHA.length];
    return s;
  }
  async function linkType(pc) {
    try {
      const st = await pc.getStats();
      let pair = null; const c = {};
      st.forEach(r => { if (r.type === 'transport' && r.selectedCandidatePairId) pair = st.get(r.selectedCandidatePairId); c[r.id] = r; });
      if (!pair) st.forEach(r => { if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') pair = r; });
      if (!pair) return 'unknown';
      const a = c[pair.localCandidateId], b = c[pair.remoteCandidateId];
      if ((a && a.candidateType === 'relay') || (b && b.candidateType === 'relay')) return 'relayed';
      return 'direct';
    } catch (e) { return 'unknown'; }
  }
  return { PEER_OPTS, PREFIX, norm, pretty, newCode, linkType };
})();
