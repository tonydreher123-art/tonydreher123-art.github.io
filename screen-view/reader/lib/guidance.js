// The "guidance" result every provider must return, and the checker for it.
// Marks use the same 0-1 picture coordinates as annotate.js (site) and
// annotations.mjs (connector): 0,0 is the top-left of the shared picture, 1,1 the bottom-right.
//
//   arrow:     { kind:'arrow', x1, y1, x2, y2, color? }
//   circle:    { kind:'circle', cx, cy, r, color? }   r = fraction of the shorter side
//   highlight: { kind:'highlight', x, y, w, h, color? }
//   freehand:  { kind:'freehand', points:[{x,y},...], color? }
//
// Guidance:
//   { ok:true, provider, question, text, steps:[string], marks:[mark], speak:string,
//     needsUserAction:boolean, snapshot:{ width, height, id }, at }

import { ReaderError } from './snapshot.js';

export const KINDS = ['arrow', 'circle', 'highlight', 'freehand'];
const HEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
export const DEFAULT_COLOR = '#ffd400';
export const MAX_MARKS = 20;
export const MAX_TEXT = 4000;
export const MAX_STEPS = 12;
export const MAX_POINTS = 500;

const c01 = n => { const x = Number(n); return Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : NaN; };
const r6 = n => Math.round((n + Number.EPSILON) * 1e6) / 1e6;
function need(n, what) {
  const v = c01(n);
  if (Number.isNaN(v)) throw new ReaderError('bad_mark', `${what} must be a number from 0 to 1.`);
  return r6(v);
}
function colorOf(c) {
  if (c == null || c === '') return DEFAULT_COLOR;
  const s = String(c).trim();
  return HEX.test(s) ? s.toLowerCase() : DEFAULT_COLOR; // a bad color is not worth failing over
}

export function normalizeMark(raw) {
  if (!raw || typeof raw !== 'object') throw new ReaderError('bad_mark', 'A mark must be an object.');
  const kind = String(raw.kind || '').toLowerCase();
  const color = colorOf(raw.color);
  const label = raw.label == null ? undefined : String(raw.label).slice(0, 80);
  const out = (o) => (label ? { ...o, label } : o);
  if (kind === 'arrow') return out({ kind, x1: need(raw.x1, 'x1'), y1: need(raw.y1, 'y1'), x2: need(raw.x2, 'x2'), y2: need(raw.y2, 'y2'), color });
  if (kind === 'circle') {
    const r = need(raw.r, 'r');
    if (r <= 0) throw new ReaderError('bad_mark', 'Circle r must be above 0.');
    return out({ kind, cx: need(raw.cx, 'cx'), cy: need(raw.cy, 'cy'), r, color });
  }
  if (kind === 'highlight') {
    let x = Number(raw.x), y = Number(raw.y), w = Number(raw.w), h = Number(raw.h);
    if (![x, y, w, h].every(Number.isFinite)) throw new ReaderError('bad_mark', 'Highlight needs x, y, w, h numbers.');
    const L = c01(Math.min(x, x + w)), T = c01(Math.min(y, y + h)), R = c01(Math.max(x, x + w)), B = c01(Math.max(y, y + h));
    if (R - L <= 0 || B - T <= 0) throw new ReaderError('bad_mark', 'Highlight box has no size.');
    return out({ kind, x: r6(L), y: r6(T), w: r6(R - L), h: r6(B - T), color });
  }
  if (kind === 'freehand') {
    if (!Array.isArray(raw.points) || raw.points.length < 2) throw new ReaderError('bad_mark', 'Freehand needs at least 2 points.');
    const pts = raw.points.slice(0, MAX_POINTS).map((p, i) => ({ x: need(p && p.x, `points[${i}].x`), y: need(p && p.y, `points[${i}].y`) }));
    return out({ kind, points: pts, color });
  }
  throw new ReaderError('bad_mark', 'Mark kind must be arrow, circle, highlight, or freehand.');
}

// Turns whatever a provider returned into a safe, complete guidance object.
// Bad marks are dropped (and counted) rather than failing the whole answer,
// because the words are still useful without the drawing.
export function normalizeGuidance(raw, ctx = {}) {
  if (!raw || typeof raw !== 'object') throw new ReaderError('bad_guidance', 'The helper gave no answer.');
  let text = raw.text == null ? '' : String(raw.text).trim();
  if (!text) throw new ReaderError('bad_guidance', 'The helper answer had no words.');
  if (text.length > MAX_TEXT) text = text.slice(0, MAX_TEXT) + '…';
  const steps = (Array.isArray(raw.steps) ? raw.steps : [])
    .map(s => String(s == null ? '' : s).trim()).filter(Boolean).slice(0, MAX_STEPS);
  const marks = [];
  let droppedMarks = 0;
  for (const m of (Array.isArray(raw.marks) ? raw.marks : [])) {
    if (marks.length >= MAX_MARKS) { droppedMarks++; continue; }
    try { marks.push(normalizeMark(m)); } catch { droppedMarks++; }
  }
  const speak = raw.speak == null ? [text, ...steps.map((s, i) => `Step ${i + 1}. ${s}`)].join(' ') : String(raw.speak).slice(0, MAX_TEXT);
  return {
    ok: true,
    provider: String(ctx.provider || raw.provider || 'unknown'),
    question: String(ctx.question || ''),
    text,
    steps,
    marks,
    speak,
    needsUserAction: raw.needsUserAction !== false,
    droppedMarks,
    snapshot: ctx.snapshot || null,
    at: ctx.at || new Date().toISOString(),
  };
}

// Message shape the live viewer page already understands (annotate.js parseMessage).
export function toAnnotateMessage(guidance) {
  return { type: 'annotate', items: guidance.marks.map((m, i) => ({ id: 'ai' + (i + 1), ...m })) };
}

// Argument shape the connector's send_annotation tool accepts (no freehand there).
export function toConnectorArgs(guidance) {
  return { mode: 'replace', items: guidance.marks.filter(m => m.kind !== 'freehand').map(({ label, ...m }) => m) };
}

// Pull a JSON object out of a model's reply (it may wrap it in ``` fences or add words).
export function extractJson(reply) {
  const s = String(reply == null ? '' : reply);
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
  const body = fence ? fence[1] : s;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new ReaderError('bad_guidance', 'The helper reply had no JSON object.');
  try { return JSON.parse(body.slice(start, end + 1)); }
  catch { throw new ReaderError('bad_guidance', 'The helper reply JSON could not be read.'); }
}
