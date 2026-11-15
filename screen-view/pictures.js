// Upload your pictures, part A (Nov 15, 2026): "Show a picture to the AI helper". Works for every user, no GitHub.
// Pick pictures (file picker, drag and drop, or paste a screenshot), see thumbnails, remove them, and choose one
// for "Get answer" so the helper looks at that picture instead of the shared screen (no screen sharing needed).
// Pictures stay in this page's memory on this device. Nothing is stored and nothing is sent anywhere here.
// Only when you press "Get answer" with "The picture I chose" selected does ask-reader.js send the chosen picture
// (scaled to at most 1024 pixels wide, as PNG) to the AI company your key belongs to; the free practice answer
// sends it nowhere. Part B (site-upload.js) can put the same pictures on the owner's website.
// Text only (no innerHTML). Thumbnails use data: links because the page's security policy blocks blob: pictures.
'use strict';
(function () {
  const $ = (id) => document.getElementById(id);
  const MAX_BYTES = 5 * 1024 * 1024, MAX_FILES = 20, MAX_W = 1024, THUMB = 240;
  const OK_EXT = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
  const P = window.SVPictures = { items: [], selectedId: 0, rejected: [], ready: false, MAX_BYTES, MAX_W };
  let nextId = 1;

  const extOf = (name) => { const m = /\.([A-Za-z0-9]+)$/.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; };
  const sizeWords = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

  // What kind of picture the first bytes say it is ('' if not a picture we accept). SVG is never accepted:
  // it can carry scripts, and on the public website it would run with this site's stored keys.
  function sniff(b) {
    if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
    if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
    if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif';
    if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
    return '';
  }

  // Website-safe file name: lowercase, only a-z 0-9 - . _, keeps the extension, never repeats a name in `used`.
  function safeName(name, used) {
    let ext = extOf(name);
    if (!OK_EXT[ext]) ext = 'png';
    let base = String(name || '').replace(/\.[A-Za-z0-9]+$/, '').toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-').replace(/-{2,}/g, '-').replace(/^[-._]+|[-._]+$/g, '').slice(0, 60);
    if (!base) base = 'picture';
    let out = base + '.' + ext, n = 2;
    while (used && used.has(out)) out = base + '-' + (n++) + '.' + ext;
    if (used) used.add(out);
    return out;
  }

  async function check(f) {
    const label = f && f.name ? '"' + f.name + '"' : 'That file';
    if (!f || typeof f.size !== 'number') return { ok: false, why: label + ' could not be read.' };
    const ext = extOf(f.name);
    if (!OK_EXT[ext] && !(f.name === 'image.png' || /^image\/(png|jpeg|gif|webp)$/.test(f.type || ''))) return { ok: false, why: label + ' is not a picture Screen-View accepts. Use PNG, JPG, GIF or WebP.' };
    if (f.size === 0) return { ok: false, why: label + ' is empty.' };
    if (f.size > MAX_BYTES) return { ok: false, why: label + ' is bigger than 5 MB (' + sizeWords(f.size) + ').' };
    const head = new Uint8Array(await f.slice(0, 16).arrayBuffer());
    const type = sniff(head);
    if (!type) return { ok: false, why: label + ' is not really a PNG, JPG, GIF or WebP picture.' };
    return { ok: true, type };
  }

  function fileToDataUrl(f) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(f); });
  }
  async function decode(f) {
    if (window.createImageBitmap) { try { return await createImageBitmap(f); } catch (e) { /* try the slower way */ } }
    const url = await fileToDataUrl(f);
    return await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('bad picture')); im.src = url; });
  }
  function draw(img, maxW, maxH) {
    const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
    const s = Math.min(1, maxW / w0, maxH ? maxH / h0 : 1);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w0 * s)); c.height = Math.max(1, Math.round(h0 * s));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  const say = (t) => { $('pic-status').textContent = t; };
  const selected = () => P.items.find((i) => i.id === P.selectedId) || null;
  P.selected = selected;
  P.mode = () => ($('pic-use-picture').checked ? 'picture' : 'screen');
  // True when "Get answer" should use the chosen picture instead of the shared screen.
  P.useForAnswer = () => P.mode() === 'picture' && !!selected();
  P.choiceLabel = () => { const s = selected(); return s ? s.name : ''; };
  // The picture for "Get answer": PNG data link, at most 1024 pixels wide (the reader accepts PNG only).
  P.snapshotForAnswer = async () => {
    const s = selected();
    if (!s) throw new Error('No picture is chosen.');
    const img = await decode(s.file);
    const url = draw(img, MAX_W, 0).toDataURL('image/png');
    if (img.close) img.close();
    return url;
  };

  function setMode(m) {
    const has = !!selected();
    $('pic-use-picture').disabled = !has;
    if (m === 'picture' && has) $('pic-use-picture').checked = true; else if (!has || m === 'screen') $('pic-use-screen').checked = true;
  }

  function render() {
    const ul = $('pic-list');
    while (ul.firstChild) ul.removeChild(ul.firstChild);
    for (const it of P.items) {
      const li = document.createElement('li');
      li.className = 'pic-item' + (it.id === P.selectedId ? ' chosen' : '');
      li.dataset.id = String(it.id);
      const img = document.createElement('img');
      img.src = it.thumb; img.alt = 'Picture: ' + it.name;
      const cap = document.createElement('p');
      cap.className = 'pic-name';
      cap.textContent = it.name + ' (' + it.width + ' × ' + it.height + ', ' + sizeWords(it.size) + ')';
      const use = document.createElement('button');
      use.type = 'button'; use.className = 'pic-use-btn';
      use.setAttribute('aria-pressed', it.id === P.selectedId ? 'true' : 'false');
      use.textContent = it.id === P.selectedId ? 'Chosen for Get answer' : 'Use for Get answer';
      use.setAttribute('aria-label', (it.id === P.selectedId ? 'Chosen for Get answer: ' : 'Use for Get answer: ') + it.name);
      use.addEventListener('click', () => { P.selectedId = it.id; setMode('picture'); render(); say('"' + it.name + '" is chosen. "Get answer" will look at this picture.'); });
      const rm = document.createElement('button');
      rm.type = 'button'; rm.className = 'pic-remove';
      rm.textContent = 'Remove'; rm.setAttribute('aria-label', 'Remove ' + it.name);
      rm.addEventListener('click', () => remove(it.id));
      li.append(img, cap, use, rm);
      ul.appendChild(li);
    }
    $('pic-use-picture').disabled = !selected();
    if (P.onChange) { try { P.onChange(); } catch (e) { /* ignore */ } }
  }

  function remove(id) {
    const it = P.items.find((i) => i.id === id);
    P.items = P.items.filter((i) => i.id !== id);
    if (P.selectedId === id) { P.selectedId = P.items.length ? P.items[0].id : 0; }
    setMode(P.selectedId ? P.mode() : 'screen');
    render();
    say((it ? '"' + it.name + '" removed. ' : '') + (P.items.length ? P.items.length + ' picture' + (P.items.length === 1 ? '' : 's') + ' left.' : 'No pictures picked. "Get answer" will look at your shared screen.'));
    const first = document.querySelector('#pic-list .pic-remove') || $('pic-input');
    if (first) first.focus();
  }
  P.remove = remove;

  // Add pictures from a FileList or array. Returns { added, rejected:[why...] }.
  P.addFiles = async function addFiles(list) {
    const files = Array.from(list || []);
    const added = [], bad = [];
    say('Opening ' + files.length + ' file' + (files.length === 1 ? '' : 's') + '…');
    for (const f of files) {
      if (P.items.length >= MAX_FILES) { bad.push('"' + f.name + '" was not added: up to ' + MAX_FILES + ' pictures at a time.'); continue; }
      const c = await check(f);
      if (!c.ok) { bad.push(c.why); continue; }
      let img;
      try { img = await decode(f); } catch (e) { bad.push('"' + f.name + '" could not be opened as a picture.'); continue; }
      const it = { id: nextId++, file: f, name: f.name || 'pasted-picture.png', type: c.type, size: f.size,
        width: img.naturalWidth || img.width, height: img.naturalHeight || img.height };
      it.thumb = draw(img, THUMB, THUMB).toDataURL('image/png');
      if (img.close) img.close();
      P.items.push(it); added.push(it);
    }
    P.rejected = bad;
    if (added.length && !selected()) { P.selectedId = added[0].id; setMode('picture'); }
    render();
    const parts = [];
    if (added.length) parts.push('Added ' + added.length + ' picture' + (added.length === 1 ? '' : 's') + '.' + (P.useForAnswer() ? ' "Get answer" will look at "' + selected().name + '" (no screen sharing needed).' : ''));
    if (bad.length) parts.push(bad.join(' '));
    if (!parts.length) parts.push('No pictures were added.');
    say(parts.join(' '));
    return { added: added.length, rejected: bad };
  };

  function wire() {
    const input = $('pic-input'), drop = $('pic-drop');
    input.addEventListener('change', async () => { const fl = Array.from(input.files || []); input.value = ''; if (fl.length) await P.addFiles(fl); });
    drop.addEventListener('click', () => input.click());
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'dragend'].forEach((t) => drop.addEventListener(t, () => drop.classList.remove('over')));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); const fl = e.dataTransfer && e.dataTransfer.files; if (fl && fl.length) P.addFiles(fl); });
    // Paste a screenshot anywhere on the page (Ctrl+V), except inside a text box.
    document.addEventListener('paste', (e) => {
      const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const fl = Array.from((e.clipboardData && e.clipboardData.files) || []).filter((f) => /^image\//.test(f.type));
      if (fl.length) { e.preventDefault(); P.addFiles(fl); }
    });
    $('pic-use-screen').addEventListener('change', () => { render(); say('"Get answer" will look at your shared screen.'); });
    $('pic-use-picture').addEventListener('change', () => { render(); const s = selected(); if (s) say('"Get answer" will look at "' + s.name + '" (no screen sharing needed).'); });
    setMode('screen');
    P.ready = true;
  }
  P.safeName = safeName; P.sniff = sniff;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
