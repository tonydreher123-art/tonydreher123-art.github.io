// Shared drawing helpers for Screen-View annotations.
// Coordinates are 0-1 of the video picture, so marks line up at any size.
'use strict';
window.SVAnnotate = (function () {
  const MIN_DRAG = 3; // CSS pixels; ignore tiny accidental taps
  const HIGHLIGHT_ALPHA = 0.35;

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  // The letterboxed rectangle of the actual video picture inside the <video> element.
  function videoContentRect(video) {
    const vw = video.videoWidth || 0;
    const vh = video.videoHeight || 0;
    const rw = video.clientWidth || 0;
    const rh = video.clientHeight || 0;
    if (!vw || !vh || !rw || !rh) return { left: 0, top: 0, width: rw, height: rh };
    const scale = Math.min(rw / vw, rh / vh);
    const width = vw * scale;
    const height = vh * scale;
    return { left: (rw - width) / 2, top: (rh - height) / 2, width, height };
  }

  function pointerToNorm(video, clientX, clientY) {
    const br = video.getBoundingClientRect();
    const c = videoContentRect(video);
    if (!c.width || !c.height) return { x: 0, y: 0 };
    const x = (clientX - br.left - c.left) / c.width;
    const y = (clientY - br.top - c.top) / c.height;
    return { x: clamp(x, 0, 1), y: clamp(y, 0, 1) };
  }

  function normToPixel(width, height, x, y) {
    return { x: x * width, y: y * height };
  }

  function hexToRgba(hex, a) {
    const h = String(hex || '#ffd400').replace('#', '');
    const full = h.length === 3 ? h.split('').map(ch => ch + ch).join('') : h;
    const n = parseInt(full, 16);
    if (Number.isNaN(n)) return 'rgba(255,212,0,' + a + ')';
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  function lineWidth(minSide) { return Math.max(4, minSide * 0.012); }

  function drawArrow(ctx, x1, y1, x2, y2, color, minSide) {
    const lw = lineWidth(minSide);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const head = Math.max(14, minSide * 0.04);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  }

  function boxOf(item) {
    // Normalize highlight boxes that were dragged up/left.
    const x = Math.min(item.x, item.x + item.w);
    const y = Math.min(item.y, item.y + item.h);
    const w = Math.abs(item.w);
    const h = Math.abs(item.h);
    return { x, y, w, h };
  }

  function drawItems(ctx, items, width, height) {
    ctx.clearRect(0, 0, width, height);
    const minSide = Math.min(width, height) || 1;
    for (const item of items) {
      if (!item || !item.kind) continue;
      const color = item.color || '#ffd400';
      if (item.kind === 'arrow') {
        drawArrow(ctx, item.x1 * width, item.y1 * height, item.x2 * width, item.y2 * height, color, minSide);
      } else if (item.kind === 'circle') {
        const cx = item.cx * width, cy = item.cy * height;
        const rpx = Math.max(1, (item.r || 0) * minSide);
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth(minSide);
        ctx.beginPath();
        ctx.arc(cx, cy, rpx, 0, Math.PI * 2);
        ctx.stroke();
      } else if (item.kind === 'highlight') {
        const b = boxOf(item);
        ctx.fillStyle = hexToRgba(color, HIGHLIGHT_ALPHA);
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(3, lineWidth(minSide) * 0.7);
        ctx.fillRect(b.x * width, b.y * height, b.w * width, b.h * height);
        ctx.strokeRect(b.x * width, b.y * height, b.w * width, b.h * height);
      } else if (item.kind === 'freehand' && item.points && item.points.length) {
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth(minSide) * 1.2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        item.points.forEach((p, i) => {
          const x = p.x * width, y = p.y * height;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
      }
    }
  }

  // Size and position a canvas so it sits exactly on the video picture.
  function fitCanvas(canvas, video) {
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const c = videoContentRect(video);
    canvas.style.left = c.left + 'px';
    canvas.style.top = c.top + 'px';
    canvas.style.width = c.width + 'px';
    canvas.style.height = c.height + 'px';
    const cssW = Math.max(1, Math.round(c.width));
    const cssH = Math.max(1, Math.round(c.height));
    canvas.width = Math.max(1, Math.round(cssW * dpr));
    canvas.height = Math.max(1, Math.round(cssH * dpr));
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width: cssW, height: cssH, ctx, content: c };
  }

  function tooSmall(kind, item, box) {
    const min = MIN_DRAG;
    const W = box.width || 1, H = box.height || 1;
    if (kind === 'arrow') return Math.hypot((item.x2 - item.x1) * W, (item.y2 - item.y1) * H) < min;
    if (kind === 'circle') return (item.r || 0) * Math.min(W, H) < min;
    if (kind === 'highlight') return Math.abs(item.w) * W < min && Math.abs(item.h) * H < min;
    if (kind === 'freehand') return !item.points || item.points.length < 2;
    return false;
  }

  function createSession() {
    const items = [];
    let draft = null;
    let tool = 'arrow';
    let color = '#ffd400';
    let idSeq = 1;
    const nextId = () => 'a' + (idSeq++);

    function snapshot() { return draft ? items.concat([draft]) : items.slice(); }

    function pointerDown(nx, ny) {
      if (tool === 'arrow') draft = { id: nextId(), kind: 'arrow', x1: nx, y1: ny, x2: nx, y2: ny, color };
      else if (tool === 'circle') draft = { id: nextId(), kind: 'circle', cx: nx, cy: ny, r: 0, color };
      else if (tool === 'highlight') draft = { id: nextId(), kind: 'highlight', x: nx, y: ny, w: 0, h: 0, color };
      else if (tool === 'freehand') draft = { id: nextId(), kind: 'freehand', points: [{ x: nx, y: ny }], color };
    }

    function pointerMove(nx, ny, box) {
      if (!draft) return;
      if (draft.kind === 'arrow') { draft.x2 = nx; draft.y2 = ny; }
      else if (draft.kind === 'circle') {
        const W = (box && box.width) || 1, H = (box && box.height) || 1;
        const rpx = Math.hypot((nx - draft.cx) * W, (ny - draft.cy) * H);
        draft.r = rpx / Math.min(W, H);
      } else if (draft.kind === 'highlight') {
        draft.w = nx - draft.x;
        draft.h = ny - draft.y;
      } else if (draft.kind === 'freehand') {
        const last = draft.points[draft.points.length - 1];
        if (!last || last.x !== nx || last.y !== ny) draft.points.push({ x: nx, y: ny });
      }
    }

    function pointerUp(box) {
      if (!draft) return false;
      const item = draft;
      draft = null;
      if (tooSmall(item.kind, item, box || { width: 1, height: 1 })) return false;
      if (item.kind === 'highlight') {
        const b = boxOf(item);
        item.x = b.x; item.y = b.y; item.w = b.w; item.h = b.h;
      }
      items.push(item);
      return true;
    }

    function cancelDraft() { draft = null; }

    function undo() {
      if (draft) { draft = null; return true; }
      if (!items.length) return false;
      items.pop();
      return true;
    }

    function clear() {
      const had = items.length || draft;
      items.length = 0;
      draft = null;
      return !!had;
    }

    return {
      get tool() { return tool; },
      setTool(t) { tool = t; },
      get color() { return color; },
      setColor(c) { color = c; },
      snapshot, pointerDown, pointerMove, pointerUp, cancelDraft, undo, clear,
      items, // live array of committed items (tests)
      get draft() { return draft; }
    };
  }

  // Parse a data-channel message. Returns {kind:'annotate', items} | {kind:'text', text} | null.
  // Text is always a string. Never evaluated.
  function parseMessage(m) {
    if (!m || typeof m !== 'object') return null;
    if (m.type === 'annotate' && Array.isArray(m.items)) {
      return { kind: 'annotate', items: m.items.filter(it => it && typeof it === 'object' && typeof it.kind === 'string') };
    }
    if (m.type === 'text') {
      const text = m.text == null ? '' : String(m.text);
      return { kind: 'text', text };
    }
    return null;
  }

  return {
    MIN_DRAG, HIGHLIGHT_ALPHA,
    clamp, videoContentRect, pointerToNorm, normToPixel, hexToRgba,
    drawItems, fitCanvas, createSession, parseMessage, boxOf, tooSmall, lineWidth
  };
})();
