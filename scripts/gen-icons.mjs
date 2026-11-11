/**
 * Generates the app icon set (PNG + ICO + ICNS) with zero dependencies.
 *
 * The icon is a minimal "dumbbell" mark on a dark emerald gradient, drawn at
 * 1024px and box-downsampled so every small size stays crisp.
 *
 * Usage: node scripts/gen-icons.mjs
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const OUT = path.resolve("src-tauri/icons");
const MASTER = 1024;

// ---------------------------------------------------------------- raster utils
function createCanvas(size) {
  return { size, data: new Uint8Array(size * size * 4) };
}

function setPx(canvas, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= canvas.size || y >= canvas.size) return;
  const i = (y * canvas.size + x) * 4;
  canvas.data[i] = r;
  canvas.data[i + 1] = g;
  canvas.data[i + 2] = b;
  canvas.data[i + 3] = a;
}

function hexToRgb(hex) {
  const v = parseInt(hex.replace("#", ""), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/** Signed distance to a rounded rectangle (negative inside). */
function sdRoundRect(px, py, cx, cy, halfW, halfH, radius) {
  const qx = Math.abs(px - cx) - (halfW - radius);
  const qy = Math.abs(py - cy) - (halfH - radius);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - radius;
}

function drawRoundRect(canvas, cx, cy, halfW, halfH, radius, color) {
  const s = canvas.size;
  const x0 = Math.max(0, Math.floor((cx - halfW) * s) - 2);
  const x1 = Math.min(s - 1, Math.ceil((cx + halfW) * s) + 2);
  const y0 = Math.max(0, Math.floor((cy - halfH) * s) - 2);
  const y1 = Math.min(s - 1, Math.ceil((cy + halfH) * s) + 2);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = sdRoundRect((x + 0.5) / s, (y + 0.5) / s, cx, cy, halfW, halfH, radius);
      if (d <= 0) setPx(canvas, x, y, color[0], color[1], color[2], 255);
    }
  }
}

function downsample(canvas, target) {
  const ratio = canvas.size / target;
  const out = createCanvas(target);
  const n = ratio * ratio;
  for (let y = 0; y < target; y++) {
    for (let x = 0; x < target; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let sy = 0; sy < ratio; sy++) {
        for (let sx = 0; sx < ratio; sx++) {
          const i = ((y * ratio + sy) * canvas.size + (x * ratio + sx)) * 4;
          const alpha = canvas.data[i + 3] / 255;
          r += canvas.data[i] * alpha;
          g += canvas.data[i + 1] * alpha;
          b += canvas.data[i + 2] * alpha;
          a += alpha;
        }
      }
      const o = (y * target + x) * 4;
      out.data[o] = a > 0 ? Math.round(r / a) : 0;
      out.data[o + 1] = a > 0 ? Math.round(g / a) : 0;
      out.data[o + 2] = a > 0 ? Math.round(b / a) : 0;
      out.data[o + 3] = Math.round((a / n) * 255);
    }
  }
  return out;
}

// ------------------------------------------------------------------ PNG writer
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
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
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(canvas) {
  const { size, data } = canvas;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    Buffer.from(data.buffer, y * size * 4, size * 4).copy(
      raw,
      y * (size * 4 + 1) + 1,
    );
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------ ICO / ICNS
function encodeIco(pngs) {
  const count = pngs.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const entries = [];
  let offset = 6 + count * 16;
  for (const { size, buf } of pngs) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(buf.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += buf.length;
    entries.push(entry);
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.buf)]);
}

function encodeIcns(entries) {
  const chunks = entries.map(({ type, buf }) => {
    const head = Buffer.alloc(8);
    head.write(type, 0, 4, "ascii");
    head.writeUInt32BE(buf.length + 8, 4);
    return Buffer.concat([head, buf]);
  });
  const body = Buffer.concat(chunks);
  const head = Buffer.alloc(8);
  head.write("icns", 0, 4, "ascii");
  head.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([head, body]);
}

// ------------------------------------------------------------------ artwork
function drawMaster() {
  const canvas = createCanvas(MASTER);
  const top = hexToRgb("#0d4f3c");
  const mid = hexToRgb("#052e26");
  const bottom = hexToRgb("#020617");
  const emerald = hexToRgb("#34d399");
  const cyan = hexToRgb("#22d3ee");
  const white = hexToRgb("#f0fdf4");

  // Background gradient with a soft diagonal light.
  for (let y = 0; y < MASTER; y++) {
    const t = y / (MASTER - 1);
    const base = t < 0.55 ? mix(top, mid, t / 0.55) : mix(mid, bottom, (t - 0.55) / 0.45);
    for (let x = 0; x < MASTER; x++) {
      const glow = Math.max(0, 1 - Math.hypot(x / MASTER - 0.28, y / MASTER - 0.16) * 1.55);
      const c = mix(base, emerald, glow * 0.35);
      setPx(canvas, x, y, c[0], c[1], c[2], 255);
    }
  }

  // Dumbbell: bar, inner plates, outer plates.
  drawRoundRect(canvas, 0.5, 0.5, 0.215, 0.036, 0.03, white);

  drawRoundRect(canvas, 0.285, 0.5, 0.052, 0.16, 0.032, emerald);
  drawRoundRect(canvas, 0.715, 0.5, 0.052, 0.16, 0.032, emerald);

  drawRoundRect(canvas, 0.19, 0.5, 0.038, 0.115, 0.028, cyan);
  drawRoundRect(canvas, 0.81, 0.5, 0.038, 0.115, 0.028, cyan);

  // Subtle floor shadow.
  for (let y = Math.floor(MASTER * 0.78); y < MASTER; y++) {
    const t = (y - MASTER * 0.78) / (MASTER * 0.22);
    for (let x = 0; x < MASTER; x++) {
      const i = (y * MASTER + x) * 4;
      const shade = 1 - Math.min(0.45, t * 0.5);
      canvas.data[i] = Math.round(canvas.data[i] * shade);
      canvas.data[i + 1] = Math.round(canvas.data[i + 1] * shade);
      canvas.data[i + 2] = Math.round(canvas.data[i + 2] * shade);
    }
  }

  return canvas;
}

// ------------------------------------------------------------------ main
const master = drawMaster();
const sizes = [512, 256, 128, 64, 32];
const pngs = new Map();
for (const size of sizes) {
  const scaled = downsample(master, size);
  pngs.set(size, encodePng(scaled));
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "32x32.png"), pngs.get(32));
fs.writeFileSync(path.join(OUT, "128x128.png"), pngs.get(128));
fs.writeFileSync(path.join(OUT, "128x128@2x.png"), pngs.get(256));
fs.writeFileSync(path.join(OUT, "icon.png"), pngs.get(512));

fs.writeFileSync(
  path.join(OUT, "icon.ico"),
  encodeIco([
    { size: 32, buf: pngs.get(32) },
    { size: 64, buf: pngs.get(64) },
    { size: 128, buf: pngs.get(128) },
    { size: 256, buf: pngs.get(256) },
  ]),
);

fs.writeFileSync(
  path.join(OUT, "icon.icns"),
  encodeIcns([
    { type: "ic07", buf: pngs.get(128) },
    { type: "ic08", buf: pngs.get(256) },
    { type: "ic09", buf: pngs.get(512) },
  ]),
);

// Windows Store / mobile scaffolding also expects these names.
fs.writeFileSync(path.join(OUT, "Square30x30Logo.png"), pngs.get(32));
fs.writeFileSync(path.join(OUT, "Square44x44Logo.png"), pngs.get(64));
fs.writeFileSync(path.join(OUT, "Square71x71Logo.png"), pngs.get(128));
fs.writeFileSync(path.join(OUT, "Square89x89Logo.png"), pngs.get(128));
fs.writeFileSync(path.join(OUT, "Square107x107Logo.png"), pngs.get(128));
fs.writeFileSync(path.join(OUT, "Square142x142Logo.png"), pngs.get(256));
fs.writeFileSync(path.join(OUT, "Square150x150Logo.png"), pngs.get(256));
fs.writeFileSync(path.join(OUT, "Square284x284Logo.png"), pngs.get(512));
fs.writeFileSync(path.join(OUT, "Square310x310Logo.png"), pngs.get(512));
fs.writeFileSync(path.join(OUT, "StoreLogo.png"), pngs.get(64));

console.log("icons written to", OUT);
