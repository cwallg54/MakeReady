// Generate MakeReady PWA icons with no external dependencies.
// Draws the brand mark — a white left peak + two lime bars on a dark square —
// matching src/components/logo.tsx, and writes valid PNGs.
// Run: node scripts/generate-pwa-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const NAVY = [15, 23, 42]; // #0f172a background
const WHITE = [255, 255, 255];
const GREEN = [141, 198, 63]; // #8DC63F brand lime

// CRC32 for PNG chunks
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePng(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // rows with filter byte 0
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// distance from point p to segment ab
function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

// The brand mark in its own coordinate space (matches the SVG in logo.tsx):
// a left peak + two parallel bars, stroke radius R.
const MARK_W = 136, MARK_H = 60, R = 6.5;
const LEFT_PEAK = [ [6, 60, 44, 6], [44, 6, 82, 60] ]; // apex (44,6)
const GREEN_BARS = [ [70, 60, 98, 18], [92, 60, 120, 18] ]; // two "/" bars
function nearAny(mx, my, segs) {
  for (const [ax, ay, bx, by] of segs) if (distToSeg(mx, my, ax, ay, bx, by) <= R) return true;
  return false;
}

function render(size) {
  const buf = Buffer.alloc(size * size * 4);
  const pad = 0.16;                 // mark sits in the maskable safe zone
  const span = size * (1 - pad * 2);
  const scale = span / MARK_W;
  const offX = (size - MARK_W * scale) / 2;
  const offY = (size - MARK_H * scale) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      let [r, g, b] = NAVY;         // full-bleed dark background (any + maskable)
      const mx = (x - offX) / scale;
      const my = (y - offY) / scale;
      // Green drawn on top (matches SVG order), then the white peak.
      if (nearAny(mx, my, GREEN_BARS)) [r, g, b] = GREEN;
      else if (nearAny(mx, my, LEFT_PEAK)) [r, g, b] = WHITE;
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255;
    }
  }
  return encodePng(size, buf);
}

const out = new URL("../public/", import.meta.url);
for (const [name, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]]) {
  writeFileSync(new URL(name, out), render(size));
  console.log("wrote public/" + name + " (" + size + "px)");
}
