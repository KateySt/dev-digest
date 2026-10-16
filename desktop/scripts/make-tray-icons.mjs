// Generates the tray + taskbar-overlay PNGs in build/icons/ (committed).
// Pure geometry rasterized with 4×4 supersampling — no image tooling needed.
// Re-run after changing a shape:  node scripts/make-tray-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'build', 'icons');
mkdirSync(out, { recursive: true });

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Render: `shade(x, y)` (unit square coords) → [r,g,b,a] or null, averaged over 4×4 samples. */
function render(size, shade) {
  const buf = Buffer.alloc(size * size * 4);
  const S = 4;
  for (let py = 0; py < size; py++)
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++)
        for (let sx = 0; sx < S; sx++) {
          const c = shade((px + (sx + 0.5) / S) / size, (py + (sy + 0.5) / S) / size);
          if (!c) continue;
          const ca = c[3] / 255;
          r += c[0] * ca; g += c[1] * ca; b += c[2] * ca; a += ca;
        }
      const i = (py * size + px) * 4;
      if (a > 0) {
        buf[i] = Math.round(r / a); buf[i + 1] = Math.round(g / a); buf[i + 2] = Math.round(b / a);
      }
      buf[i + 3] = Math.round((a / (S * S)) * 255);
    }
  return buf;
}

const inRoundRect = (x, y, inset, radius) => {
  const lo = inset, hi = 1 - inset;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + radius), hi - radius);
  const cy = Math.min(Math.max(y, lo + radius), hi - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
};
const ring = (x, y, r0, r1) => {
  const d = Math.hypot(x - 0.5, y - 0.5);
  return d >= r0 && d <= r1;
};

const BRAND = [59, 130, 246, 255]; // blue-500, the default accent
const BUSY = [245, 158, 11, 255]; // amber-500
const WHITE = [255, 255, 255, 255];
const BLACK = [0, 0, 0, 255];

/** Brand tile with a white ring — the colour tray icon (Windows/Linux). */
const tile = (fill) => (x, y) =>
  inRoundRect(x, y, 0.06, 0.22) ? (ring(x, y, 0.17, 0.29) ? WHITE : fill) : null;
/** macOS menu-bar template: black-only, the OS tints it. */
const template = (x, y) => (inRoundRect(x, y, 0.06, 0.22) && !ring(x, y, 0.17, 0.29) ? BLACK : null);
/** Taskbar overlay: a red dot = unread notifications. */
const dot = (x, y) => (Math.hypot(x - 0.5, y - 0.5) <= 0.42 ? [239, 68, 68, 255] : null);

const files = {
  'tray.png': [16, tile(BRAND)],
  'tray@2x.png': [32, tile(BRAND)],
  'tray-busy.png': [16, tile(BUSY)],
  'tray-busy@2x.png': [32, tile(BUSY)],
  'trayTemplate.png': [16, template],
  'trayTemplate@2x.png': [32, template],
  'overlay-unread.png': [16, dot],
  'overlay-unread@2x.png': [32, dot],
};
for (const [name, [size, shade]] of Object.entries(files)) {
  writeFileSync(join(out, name), png(size, render(size, shade)));
}
console.log(`wrote ${Object.keys(files).length} icons to ${out}`);
