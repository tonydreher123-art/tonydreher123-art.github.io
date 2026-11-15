// AI helper marks: pure helpers (no DOM), so they can be unit-tested in Node.
// The connector sends { mode: 'add' | 'replace' | 'clear', items: [...] }.
// The phone viewer and the extension use "the whole list" messages:
// { type: 'annotate', items: [...] } and { type: 'clear' }.
// This file turns one into the other. Coordinates stay 0-1. Text is never evaluated.
'use strict';
(function (root) {
  const KINDS = { arrow: 1, circle: 1, highlight: 1, freehand: 1 };
  const MAX_ITEMS = 50;
  let seq = 1;

  function clamp01(n) { const x = Number(n); return Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0; }

  function cleanItem(it) {
    if (!it || typeof it !== 'object' || !KINDS[it.kind]) return null;
    const color = typeof it.color === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(it.color) ? it.color : '#ffd400';
    const id = typeof it.id === 'string' && it.id ? it.id : 'ai' + (seq++);
    if (it.kind === 'arrow') return { id, kind: 'arrow', x1: clamp01(it.x1), y1: clamp01(it.y1), x2: clamp01(it.x2), y2: clamp01(it.y2), color, by: 'ai' };
    if (it.kind === 'circle') return { id, kind: 'circle', cx: clamp01(it.cx), cy: clamp01(it.cy), r: clamp01(it.r), color, by: 'ai' };
    if (it.kind === 'highlight') return { id, kind: 'highlight', x: clamp01(it.x), y: clamp01(it.y), w: clamp01(it.w), h: clamp01(it.h), color, by: 'ai' };
    const pts = Array.isArray(it.points) ? it.points.slice(0, 500).map(p => ({ x: clamp01(p && p.x), y: clamp01(p && p.y) })) : [];
    return pts.length ? { id, kind: 'freehand', points: pts, color, by: 'ai' } : null;
  }

  // Apply one connector "annotate" message to the current AI layer. Returns a new array.
  function applyConnector(current, msg) {
    const cur = Array.isArray(current) ? current : [];
    if (!msg || typeof msg !== 'object') return cur.slice();
    const mode = String(msg.mode || 'add').toLowerCase();
    if (mode === 'clear') return [];
    const incoming = (Array.isArray(msg.items) ? msg.items : []).map(cleanItem).filter(Boolean);
    const next = mode === 'replace' ? incoming : cur.concat(incoming);
    return next.slice(-MAX_ITEMS); // keep the newest marks if a helper sends too many
  }

  // What the extension (and any "whole list" listener) should receive.
  function toListMessage(items) {
    const list = Array.isArray(items) ? items : [];
    return list.length ? { type: 'annotate', items: list } : { type: 'clear' };
  }

  root.SVMarks = { applyConnector, toListMessage, cleanItem, MAX_ITEMS };
})(typeof window !== 'undefined' ? window : globalThis);
