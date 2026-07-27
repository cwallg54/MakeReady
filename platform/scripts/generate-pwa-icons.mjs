// Generate MakeReady PWA icons with no external dependencies.
// Draws a navy square with a white "M" monogram and writes valid PNGs.
// Run: node scripts/generate-pwa-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const NAVY = [15, 23, 42]; // #0f172a
const WHITE = [255, 255, 255];

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

// Is normalized point (u,v in 0..1) inside the "M" glyph?
function inM(u, v) {
  const w = 0.18;           // stroke thickness
  const half = w / 2;
  // verticals
  if (u <= w && v >= 0 && v <= 1) return true;
  if (u >= 1 - w && v >= 0 && v <= 1) return true;
  // diagonals meeting at center valley (0.5, 0.55)
  if (distToSeg(u, v, half, half, 0.5, 0.62) <= half) return true;
  if (distToSeg(u, v, 1 - half, half, 0.5, 0.62) <= half) return true;
  return false;
}

function render(size) {
  const buf = Buffer.alloc(size * size * 4);
  const pad = 0.24; // letter occupies middle (1-2*pad) of the icon → within maskable safe zone
  const span = 1 - pad * 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // background navy, full-bleed (valid as "any" and "maskable")
      let [r, g, b] = NAVY;
      const u = (x / (size - 1) - pad) / span;
      const v = (y / (size - 1) - pad) / span;
      if (u >= 0 && u <= 1 && v >= 0 && v <= 1 && inM(u, v)) [r, g, b] = WHITE;
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
