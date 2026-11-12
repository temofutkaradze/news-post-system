// SPDX-License-Identifier: AGPL-3.0-or-later
export const MAX_BYTES = 25 * 1024 * 1024, MAX_PIXELS = 16000000;
export function canvas(width, height) {
  const c = document.createElement('canvas'); c.width = width; c.height = height; return c;
}
export function releaseCanvas(c) { if (c) c.width = c.height = 1; }
export function toBlob(c, type = 'image/png', quality) {
  return new Promise((resolve, reject) => c.toBlob(b => b ? resolve(b) : reject(Error('Image export failed. Try 1080 × 1350 or a smaller photo.')), type, quality));
}
export async function digest(file) {
  const bytes = await file.arrayBuffer();
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
}
/** Header dimensions prevent large compressed images being decoded before validation. */
export function dimensions(buffer) {
  const a = new Uint8Array(buffer), v = new DataView(buffer);
  if (a.length < 30) throw Error('The image file is incomplete.');
  if (v.getUint32(0) === 0x89504e47 && v.getUint32(4) === 0x0d0a1a0a) {
    return { width: v.getUint32(16), height: v.getUint32(20), type: 'image/png' };
  }
  if (a[0] === 255 && a[1] === 216) {
    let p = 2;
    while (p + 9 < a.length) {
      if (a[p++] !== 255) continue;
      while (a[p] === 255) p++;
      const marker = a[p++];
      if (marker === 218 || marker === 217) break;
      if (marker === 1 || marker >= 208 && marker <= 215) continue;
      const length = v.getUint16(p);
      if (length < 2 || p + length > a.length) break;
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker))
        return { width: v.getUint16(p + 5), height: v.getUint16(p + 3), type: 'image/jpeg' };
      p += length;
    }
  }
  if (v.getUint32(0) === 0x52494646 && v.getUint32(8) === 0x57454250) {
    const tag = v.getUint32(12), u24 = p => a[p] + a[p+1]*256 + a[p+2]*65536;
    if (tag === 0x56503858) {
      if (a[20] & 2) throw Error('Animated WebP is not supported.');
      return { width: 1 + u24(24), height: 1 + u24(27), type: 'image/webp' };
    }
    if (tag === 0x5650384c && a[20] === 47) {
      const n = v.getUint32(21, true);
      return { width: (n & 16383) + 1, height: ((n >>> 14) & 16383) + 1, type: 'image/webp' };
    }
    if (tag === 0x56503820 && a[23] === 157 && a[24] === 1 && a[25] === 42)
      return { width: v.getUint16(26, true) & 16383, height: v.getUint16(28, true) & 16383, type: 'image/webp' };
  }
  throw Error('Use a valid JPEG, PNG or non-animated WebP photograph.');
}
export async function loadImage(file) {
  if (!file || file.size > MAX_BYTES) throw Error('Choose a photograph under 25 MB.');
  const header = dimensions(await file.arrayBuffer());
  if (!header.width || !header.height || header.width * header.height > MAX_PIXELS || Math.max(header.width, header.height) > 16000)
    throw Error('This photo exceeds the 16 megapixel editing limit. Export a smaller copy; the editor will not silently reduce your original.');
  const bitmap = await createImageBitmap(new Blob([file], { type: header.type }), { imageOrientation: 'from-image' });
  try {
    return { bitmap, file, width: bitmap.width, height: bitmap.height, hash: await digest(file) };
  } catch (error) { bitmap.close(); throw error; }
}
export function disposeSource(source) { source?.bitmap?.close(); }
export async function inferenceInput(source, region) {
  const r = region || { x: 0, y: 0, w: source.width, h: source.height };
  const scale = Math.min(1, 1600 / Math.max(r.w, r.h));
  const c = canvas(Math.max(1, Math.round(r.w * scale)), Math.max(1, Math.round(r.h * scale)));
  try {
    c.getContext('2d').drawImage(source.bitmap, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
    return { blob: await toBlob(c), region: r, width: c.width, height: c.height };
  } finally { releaseCanvas(c); }
}
export async function save(blob, filename, share = false) {
  const file = new File([blob], filename, { type: blob.type });
  if (share && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
