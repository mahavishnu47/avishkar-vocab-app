#!/usr/bin/env node
// Generates the PNG app icons (Android/Chrome install + iPhone home screen) from simple shapes, no image tools needed.
// Run: node scripts/make-icons.mjs   -> apps/web/public/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../apps/web/public');
const BLUE = [29, 78, 216];
const WHITE = [255, 255, 255];

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay; const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};
// the letter "A" in unit coordinates, scaled about the centre by s
const inLetter = (x, y, s) => {
  const u = (x - 0.5) / s + 0.5, v = (y - 0.5) / s + 0.5; const w = 0.055;
  return segDist(u, v, 0.28, 0.76, 0.5, 0.24) <= w || segDist(u, v, 0.72, 0.76, 0.5, 0.24) <= w || (v >= 0.56 && v <= 0.63 && u >= 0.37 && u <= 0.63);
};
const inRounded = (x, y, r) => { const cx = Math.min(Math.max(x, r), 1 - r), cy = Math.min(Math.max(y, r), 1 - r); return Math.hypot(x - cx, y - cy) <= r; };

function icon(size, { rounded, scale }) {
  const px = Buffer.alloc(size * size * 4); const SS = 3;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    let a = 0, r = 0, g = 0, b = 0;
    for (let sj = 0; sj < SS; sj++) for (let si = 0; si < SS; si++) {
      const x = (i + (si + 0.5) / SS) / size, y = (j + (sj + 0.5) / SS) / size;
      if (rounded && !inRounded(x, y, 14 / 64)) continue;
      const c = inLetter(x, y, scale) ? WHITE : BLUE; a++; r += c[0]; g += c[1]; b += c[2];
    }
    const o = (j * size + i) * 4;
    if (a) { px[o] = r / a; px[o + 1] = g / a; px[o + 2] = b / a; px[o + 3] = Math.round((255 * a) / (SS * SS)); }
  }
  return png(size, px);
}

writeFileSync(join(OUT, 'icon-192.png'), icon(192, { rounded: true, scale: 1 }));
writeFileSync(join(OUT, 'icon-512.png'), icon(512, { rounded: true, scale: 1 }));
writeFileSync(join(OUT, 'icon-maskable-512.png'), icon(512, { rounded: false, scale: 0.8 })); // safe zone for Android masks
writeFileSync(join(OUT, 'apple-touch-icon.png'), icon(180, { rounded: false, scale: 0.9 }));    // iOS rounds the corners itself
console.log('icons written to', OUT);
