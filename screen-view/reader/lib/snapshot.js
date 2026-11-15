// Snapshot input: turns a PNG (bytes, base64, or data URL) into a checked, plain object.
// Works in Node and in a browser: uses only Uint8Array, atob/btoa, and crypto.subtle.
// The picture is never saved to disk by this module.

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
export const MAX_BYTES = 8 * 1024 * 1024; // 8 MB is far above a 1920px screen frame

export class ReaderError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function b64ToBytes(b64) {
  const clean = String(b64).replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) throw new ReaderError('bad_snapshot', 'The picture data is not valid base64.');
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToB64(bytes) {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s);
}

function toBytes(input) {
  if (input == null) throw new ReaderError('no_snapshot', 'No picture was given.');
  if (input instanceof Uint8Array) return input; // includes Node Buffer
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (typeof input === 'object') {
    // Connector tool result shape: { type:'image', data:'<base64>', mimeType:'image/png' }
    if (typeof input.data === 'string') {
      if (input.mimeType && input.mimeType !== 'image/png') throw new ReaderError('bad_snapshot', 'Only PNG pictures are supported.');
      return b64ToBytes(input.data);
    }
    // MCP result shape: { content: [ {type:'image', ...}, {type:'text', ...} ] }
    if (Array.isArray(input.content)) {
      const img = input.content.find(c => c && c.type === 'image');
      if (!img) throw new ReaderError('no_snapshot', 'The tool result has no picture in it.');
      return toBytes(img);
    }
  }
  if (typeof input === 'string') {
    const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(input);
    if (m) {
      if (m[1] !== 'image/png') throw new ReaderError('bad_snapshot', 'Only PNG pictures are supported.');
      if (!m[2]) throw new ReaderError('bad_snapshot', 'The picture link must be base64.');
      return b64ToBytes(m[3]);
    }
    return b64ToBytes(input); // bare base64
  }
  throw new ReaderError('bad_snapshot', 'Picture must be PNG bytes, base64 text, or a data: link.');
}

// Returns { bytes, width, height, byteLength, mimeType }.
export function readSnapshot(input) {
  const bytes = toBytes(input);
  if (bytes.length > MAX_BYTES) throw new ReaderError('too_big', 'The picture is larger than 8 MB.');
  if (bytes.length < 33) throw new ReaderError('bad_snapshot', 'The picture is too small to be a PNG.');
  for (let i = 0; i < 8; i++) if (bytes[i] !== PNG_SIG[i]) throw new ReaderError('bad_snapshot', 'The picture is not a PNG.');
  // First chunk must be IHDR: length(4) 'IHDR'(4) width(4) height(4)
  const tag = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (tag !== 'IHDR') throw new ReaderError('bad_snapshot', 'The PNG header is damaged.');
  const u32 = o => ((bytes[o] << 24) >>> 0) + (bytes[o + 1] << 16) + (bytes[o + 2] << 8) + bytes[o + 3];
  const width = u32(16), height = u32(20);
  if (!width || !height || width > 20000 || height > 20000) throw new ReaderError('bad_snapshot', 'The PNG size looks wrong.');
  return { bytes, width, height, byteLength: bytes.length, mimeType: 'image/png' };
}

export function toDataUrl(snap) { return 'data:image/png;base64,' + bytesToB64(snap.bytes); }

// Short fingerprint so results can say which picture they were about, without keeping it.
export async function fingerprint(bytes) {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (subtle) {
    const d = new Uint8Array(await subtle.digest('SHA-256', bytes));
    return [...d.slice(0, 8)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback (FNV-1a 32-bit) if no WebCrypto
  let h = 0x811c9dc5;
  for (const b of bytes) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
