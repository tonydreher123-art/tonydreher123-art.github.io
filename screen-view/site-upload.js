// Upload your pictures, part B (Nov 15, 2026): "Add pictures to my website (site owner only)".
// Puts the pictures picked in part A (pictures.js) into the owner's GitHub Pages repository with GitHub's
// create-or-update-file API: PUT https://api.github.com/repos/{owner}/{repo}/contents/{path}
// (content in base64; when a file with that name is already there, its "sha" is sent so it is updated).
// The GitHub token: a fine-grained token limited to this ONE repository with "Contents: Read and write" and an
// expiry. Kept only in this browser's storage on this device (like the AI key). Sent only to api.github.com.
// It is never shown again, never put in the page address, never logged; the status shows only the last 4.
// Nothing is uploaded until the owner presses the button AND answers "Yes" to the confirmation.
// Text only (no innerHTML).
'use strict';
(function () {
  const $ = (id) => document.getElementById(id);
  const TOKEN_KEY = 'screenview.github.token.v1';
  const API = 'https://api.github.com';
  const FOLDERS = ['screen-view/icons', 'screen-view/screenshots'];
  const NAME_RX = /^[A-Za-z0-9._-]{1,100}$/;
  const U = window.SVSiteUpload = { busy: false, results: [], ready: false, TOKEN_KEY };
  const store = (() => { try { return window.localStorage; } catch (e) { return null; } })();

  // Check a pasted token before saving. Returns { ok, token, why }.
  function checkToken(raw) {
    const t = String(raw == null ? '' : raw).trim();
    if (!t) return { ok: false, why: 'Please paste your GitHub token first.' };
    if (/\s/.test(t)) return { ok: false, why: 'The token has a space or line break in it. Copy it again in one piece.' };
    if (/^(ghp|gho|ghu|ghs|ghr)_/.test(t)) return { ok: false, why: 'That looks like a classic GitHub token, which can change every repository you own. Please make a fine-grained token instead (steps above).' };
    if (/^(xai-|sk-|SV1\.)/.test(t)) return { ok: false, why: 'That looks like an AI key or a Pro key, not a GitHub token. It was not saved.' };
    if (!/^github_pat_[A-Za-z0-9_]{20,250}$/.test(t)) return { ok: false, why: 'That does not look like a fine-grained GitHub token. Those start with github_pat_. Copy it again.' };
    return { ok: true, token: t };
  }
  const getToken = () => { try { return (store && store.getItem(TOKEN_KEY)) || ''; } catch (e) { return ''; } };
  const last4 = (t) => (t && t.length > 12 ? t.slice(-4) : '');
  const tokSay = (t) => { $('gh-token-status').textContent = t; };
  const say = (t) => { $('up-status').textContent = t; };

  function renderToken() {
    const t = getToken();
    tokSay(t ? 'A GitHub token is saved in this browser on this device only (ends in ' + (last4(t) || '****') + ').' : 'No GitHub token saved. Uploading to your website needs one.');
    $('gh-token-remove').disabled = !t;
  }
  function saveToken() {
    const c = checkToken($('gh-token').value);
    $('gh-token').value = ''; // never leave it on screen, saved or not
    if (!c.ok) { tokSay(c.why); return; }
    if (!store) { tokSay('This browser will not let the page save the token.'); return; }
    try { store.setItem(TOKEN_KEY, c.token); } catch (e) { tokSay('This browser will not let the page save the token.'); return; }
    renderToken();
    tokSay('Saved. ' + $('gh-token-status').textContent);
  }
  function removeToken() {
    try { store && store.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ }
    renderToken();
    tokSay('GitHub token removed from this device.');
  }

  function target() {
    const owner = $('up-owner').value.trim(), repo = $('up-repo').value.trim(), branch = $('up-branch').value.trim();
    const folder = $('up-folder').value;
    if (!NAME_RX.test(owner) || !NAME_RX.test(repo)) return { ok: false, why: 'The owner or repository name under "Advanced" does not look right.' };
    if (!/^[A-Za-z0-9._/-]{1,100}$/.test(branch) || branch.includes('..')) return { ok: false, why: 'The branch name under "Advanced" does not look right.' };
    if (!FOLDERS.includes(folder)) return { ok: false, why: 'Pick a folder first.' };
    return { ok: true, owner, repo, branch, folder };
  }
  // The names the pictures get on the website (sanitized; never two the same).
  function plan() {
    const P = window.SVPictures; const used = new Set();
    return (P ? P.items : []).map((it) => ({ it, name: P.safeName(it.name, used) }));
  }
  function renderNames() {
    const p = plan();
    $('up-names').textContent = p.length ? 'Names they will have on your website: ' + p.map((x) => x.name).join(', ') + '.' : 'Pick pictures at the top of this box first.';
    $('up-start').disabled = U.busy || !p.length;
  }
  U.publicUrl = (t, path) => (t.repo.toLowerCase() === t.owner.toLowerCase() + '.github.io' ? 'https://' + t.repo.toLowerCase() + '/' + path : '');

  function bytesToB64(bytes) {
    let s = ''; const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  }
  function why(status, what) {
    if (status === 401) return 'GitHub did not accept the token (it may be wrong or expired). Make a new one and save it again.';
    if (status === 403) return 'The token is not allowed to change this repository. It needs "Contents: Read and write" for ' + what + '.';
    if (status === 404) return 'GitHub could not find ' + what + ', or the token is not allowed to see it.';
    if (status === 409) return 'GitHub was busy with another change. Press the button again.';
    if (status === 422) return 'GitHub refused the file (it may be too big or the name is not allowed).';
    return 'GitHub answered with error ' + status + '.';
  }

  async function uploadOne(t, token, item, name, line) {
    const f = window.fetch.bind(window);
    const path = t.folder + '/' + name;
    const url = API + '/repos/' + encodeURIComponent(t.owner) + '/' + encodeURIComponent(t.repo) + '/contents/' + path.split('/').map(encodeURIComponent).join('/');
    const headers = { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token, 'X-GitHub-Api-Version': '2022-11-28' };
    const show = (s) => { line.textContent = name + ': ' + s; };
    const repoWords = t.owner + '/' + t.repo;
    try {
      show('checking whether it is already there…');
      let sha = '';
      const g = await f(url + '?ref=' + encodeURIComponent(t.branch), { method: 'GET', headers, cache: 'no-store' });
      if (g.status === 200) { const j = await g.json(); if (Array.isArray(j) || j.type !== 'file') { show('not uploaded: there is a folder with that name.'); return { name, ok: false }; } sha = j.sha || ''; }
      else if (g.status !== 404) { show('not uploaded. ' + why(g.status, repoWords)); return { name, ok: false, status: g.status }; }
      show(sha ? 'replacing the old copy…' : 'uploading…');
      const content = bytesToB64(new Uint8Array(await item.file.arrayBuffer()));
      const body = { message: (sha ? 'Update' : 'Add') + ' picture ' + path + ' (from the Screen-View page)', content, branch: t.branch };
      if (sha) body.sha = sha;
      const r = await f(url, { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, headers), body: JSON.stringify(body) });
      if (r.status === 200 || r.status === 201) {
        const pub = U.publicUrl(t, path);
        show((r.status === 201 ? 'added' : 'updated') + ' in ' + t.folder + '.' + (pub ? ' It will be at ' + pub + ' in a minute or two.' : ''));
        return { name, ok: true, updated: r.status === 200, path };
      }
      show('not uploaded. ' + why(r.status, repoWords)); return { name, ok: false, status: r.status };
    } catch (e) {
      show('not uploaded: could not reach GitHub. Check the internet connection and try again.');
      return { name, ok: false, network: true };
    }
  }

  let pending = null;
  function start() {
    if (U.busy) return;
    const p = plan();
    if (!p.length) { say('Pick pictures at the top of this box first.'); return; }
    if (!getToken()) { say('Save your GitHub token first (steps above).'); $('gh-token').focus(); return; }
    const t = target(); if (!t.ok) { say(t.why); return; }
    pending = { t, p };
    $('up-confirm-text').textContent = 'This will put ' + p.length + ' picture' + (p.length === 1 ? '' : 's') + ' on your public website, in the folder ' + t.folder + ' of ' + t.owner + '/' + t.repo + '. Anyone on the internet will be able to see ' + (p.length === 1 ? 'it' : 'them') + '. Continue?';
    $('up-confirm').classList.remove('hidden');
    $('up-yes').focus();
  }
  function cancel() { pending = null; $('up-confirm').classList.add('hidden'); say('Cancelled. Nothing was uploaded.'); $('up-start').focus(); }
  async function go() {
    if (!pending || U.busy) return;
    const { t, p } = pending; pending = null;
    $('up-confirm').classList.add('hidden');
    const token = getToken();
    if (!token) { say('Save your GitHub token first (steps above).'); return; }
    U.busy = true; renderNames(); $('up-start').textContent = 'Uploading…';
    const ol = $('up-results'); while (ol.firstChild) ol.removeChild(ol.firstChild);
    U.results = [];
    say('Uploading ' + p.length + ' picture' + (p.length === 1 ? '' : 's') + ' to GitHub, one at a time…');
    for (const x of p) {
      const li = document.createElement('li'); ol.appendChild(li);
      U.results.push(await uploadOne(t, token, x.it, x.name, li));
    }
    const good = U.results.filter((r) => r.ok).length;
    U.busy = false; $('up-start').textContent = 'Put my pictures on my website'; renderNames();
    say(good === p.length ? 'Done. All ' + good + ' picture' + (good === 1 ? ' is' : 's are') + ' on your website. GitHub Pages takes a minute or two to show them.'
      : good + ' of ' + p.length + ' uploaded. See each line below for what went wrong.');
  }

  function wire() {
    $('gh-token-save').addEventListener('click', saveToken);
    $('gh-token-remove').addEventListener('click', removeToken);
    $('up-start').addEventListener('click', start);
    $('up-yes').addEventListener('click', go);
    $('up-no').addEventListener('click', cancel);
    const P = window.SVPictures;
    if (P) { const prev = P.onChange; P.onChange = () => { if (prev) prev(); renderNames(); }; }
    renderToken(); renderNames();
    U.ready = true;
  }
  U.checkToken = checkToken;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
