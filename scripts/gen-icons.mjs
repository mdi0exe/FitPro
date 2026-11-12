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
//
// Everything is drawn in normalized 0..1 space with signed-distance functions so
// edges stay razor sharp: coverage is derived from the distance to the shape and
// blended per pixel. Three passes: background → crest → shadow + dumbbell.

const DUMBBELL_ANGLE = (-28 * Math.PI) / 180;

const clamp01 = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);

/** Hermite ramp; also works inverted (edge0 > edge1). */
function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1e-6));
  return t * t * (3 - 2 * t);
}

/** Distance (in normalized units) → pixel coverage. */
function aaCoverage(signedDist, pixelScale) {
  return clamp01(0.5 - signedDist * pixelScale);
}

/** Rotates a point around the origin. */
function rotate2D(x, y, theta) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [x * c - y * s, x * s + y * c];
}

function lerpColor(a, b, t) {
  const k = clamp01(t);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/** Source-over blend with a float alpha in 0..1. */
function blendPx(canvas, x, y, r, g, b, alpha) {
  if (alpha <= 0) return;
  if (x < 0 || y < 0 || x >= canvas.size || y >= canvas.size) return;

  const i = (y * canvas.size + x) * 4;
  const src = alpha > 1 ? 1 : alpha;
  const dstA = canvas.data[i + 3] / 255;
  const outA = src + dstA * (1 - src);
  if (outA <= 0) return;

  canvas.data[i] = Math.round((r * src + canvas.data[i] * dstA * (1 - src)) / outA);
  canvas.data[i + 1] = Math.round((g * src + canvas.data[i + 1] * dstA * (1 - src)) / outA);
  canvas.data[i + 2] = Math.round((b * src + canvas.data[i + 2] * dstA * (1 - src)) / outA);
  canvas.data[i + 3] = Math.round(outA * 255);
}

/** Rounded rectangle centred on the origin (negative inside). */
function sdRoundRectLocal(px, py, halfW, halfH, radius) {
  const qx = Math.abs(px) - (halfW - radius);
  const qy = Math.abs(py) - (halfH - radius);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - radius;
}

/** Regular hexagon (flat top), rounded corners. */
function sdHexagon(px, py, radius, rounding) {
  const kx = -0.866025404;
  const ky = 0.5;
  const kz = 0.577350269;

  let x = Math.abs(px);
  let y = Math.abs(py);

  const projection = Math.min(kx * x + ky * y, 0);
  x -= 2 * projection * kx;
  y -= 2 * projection * ky;

  x -= Math.min(Math.max(x, -kz * radius), kz * radius);
  y -= radius;

  return Math.hypot(x, y) * Math.sign(y || 1) - rounding;
}

// Plate layout along the bar (u = axis of the dumbbell).
const PLATES = [
  { u: 0.312, halfW: 0.03, halfH: 0.098, radius: 0.016, palette: "outer" },
  { u: 0.245, halfW: 0.038, halfH: 0.138, radius: 0.02, palette: "middle" },
  { u: 0.165, halfW: 0.044, halfH: 0.175, radius: 0.024, palette: "inner" },
];

const PALETTES = {
  inner: {
    top: hexToRgb("#6ee7b7"),
    body: hexToRgb("#10b981"),
    shadow: hexToRgb("#047857"),
    highlight: hexToRgb("#d1fae5"),
  },
  middle: {
    top: hexToRgb("#5eead4"),
    body: hexToRgb("#14b8a6"),
    shadow: hexToRgb("#0f766e"),
    highlight: hexToRgb("#ccfbf1"),
  },
  outer: {
    top: hexToRgb("#a5f3fc"),
    body: hexToRgb("#22d3ee"),
    shadow: hexToRgb("#0891b2"),
    highlight: hexToRgb("#ecfeff"),
  },
};

const HANDLE = {
  halfW: 0.24,
  halfH: 0.032,
  radius: 0.016,
  colors: [hexToRgb("#f8fafc"), hexToRgb("#94a3b8"), hexToRgb("#334155")],
};

/** Composite distance of the whole dumbbell in its own rotated space. */
function dumbbellSd(u, v) {
  let d = sdRoundRectLocal(u, v, HANDLE.halfW, HANDLE.halfH, HANDLE.radius);
  for (const plate of PLATES) {
    d = Math.min(d, sdRoundRectLocal(u - plate.u, v, plate.halfW, plate.halfH, plate.radius));
    d = Math.min(d, sdRoundRectLocal(u + plate.u, v, plate.halfW, plate.halfH, plate.radius));
  }
  return d;
}

function paintHandle(canvas, x, y, u, v, pixelScale) {
  const d = sdRoundRectLocal(u, v, HANDLE.halfW, HANDLE.halfH, HANDLE.radius);
  if (d > 0.02) return;

  const cov = aaCoverage(d, pixelScale);
  if (cov <= 0) return;

  // Cylindrical metal: bright top, mid grey centre, dark bottom.
  const t = clamp01((v + HANDLE.halfH) / (2 * HANDLE.halfH));
  let color =
    t < 0.5
      ? lerpColor(HANDLE.colors[0], HANDLE.colors[1], t / 0.5)
      : lerpColor(HANDLE.colors[1], HANDLE.colors[2], (t - 0.5) / 0.5);

  // Specular stripe along the top of the bar.
  const spec = Math.exp(-Math.pow((v + HANDLE.halfH * 0.45) / 0.014, 2));
  color = lerpColor(color, [255, 255, 255], spec * 0.5);

  // Knurled grip in the middle section.
  if (Math.abs(u) < 0.11) {
    const groove = Math.sin((u + v) * 240) * Math.sin((u - v) * 240);
    const knurl = smoothstep(0.35, 0.85, groove) * 0.16;
    color = lerpColor(color, [15, 23, 42], knurl);
  }

  blendPx(canvas, x, y, color[0], color[1], color[2], cov);
}

function paintPlate(canvas, x, y, u, v, plate, pixelScale) {
  const d = sdRoundRectLocal(u - plate.u, v, plate.halfW, plate.halfH, plate.radius);
  if (d > 0.02) return;

  const cov = aaCoverage(d, pixelScale);
  if (cov <= 0) return;

  const palette = PALETTES[plate.palette];

  // Vertical bevel gradient.
  const t = clamp01((v + plate.halfH) / (2 * plate.halfH));
  let color =
    t < 0.5
      ? lerpColor(palette.top, palette.body, t / 0.5)
      : lerpColor(palette.body, palette.shadow, (t - 0.5) / 0.5);

  // Crisp rim on the top/left edge, softer on the bottom.
  const rim = smoothstep(0.012, 0, Math.abs(d)) * (v < 0 ? 1 : 0.4);
  color = lerpColor(color, palette.highlight, rim * 0.8);

  // Specular highlight near the upper-left of the plate.
  const sx = (u - plate.u + 0.014) / (plate.halfW * 0.9);
  const sy = (v + plate.halfH * 0.5) / (plate.halfH * 0.45);
  const spec = Math.exp(-(sx * sx + sy * sy)) * 0.55;
  color = lerpColor(color, [255, 255, 255], spec);

  blendPx(canvas, x, y, color[0], color[1], color[2], cov);
}

function drawMaster() {
  const canvas = createCanvas(MASTER);
  const size = MASTER;
  const pixelScale = size;

  const centerColor = hexToRgb("#0b1528");
  const edgeColor = hexToRgb("#020617");
  const emerald = hexToRgb("#10b981");
  const cyanGlow = hexToRgb("#06b6d4");
  const cyan = hexToRgb("#22d3ee");
  const mint = hexToRgb("#34d399");

  // ------------------------------------------------- Layer 1: background
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x + 0.5) / size;
      const ny = (y + 0.5) / size;

      const radial = Math.hypot(nx - 0.5, ny - 0.5) * 1.45;
      let color = lerpColor(centerColor, edgeColor, clamp01(radial));

      const emeraldGlow = Math.exp(-(((nx - 0.72) ** 2 + (ny - 0.24) ** 2) / 0.075));
      const cyanHalo = Math.exp(-(((nx - 0.26) ** 2 + (ny - 0.78) ** 2) / 0.09));
      color = lerpColor(color, emerald, emeraldGlow * 0.55);
      color = lerpColor(color, cyanGlow, cyanHalo * 0.45);

      const vignette = smoothstep(0.36, 0.74, Math.hypot(nx - 0.5, ny - 0.5));
      color = lerpColor(color, [0, 0, 0], vignette * 0.5);

      blendPx(canvas, x, y, color[0], color[1], color[2], 1);
    }
  }

  // ------------------------------------------------- Layer 2: hex crest
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x + 0.5) / size;
      const ny = (y + 0.5) / size;
      const dHex = sdHexagon(nx - 0.5, ny - 0.5, 0.36, 0.055);

      // Soft neon halo outside the shape.
      if (dHex > 0 && dHex < 0.11) {
        const halo = Math.exp(-dHex / 0.032) * 0.5;
        const tint = lerpColor(mint, cyan, clamp01((nx + ny - 0.3) / 1.1));
        blendPx(canvas, x, y, tint[0], tint[1], tint[2], halo);
      }

      // Dark glass fill.
      const fill = aaCoverage(dHex, pixelScale);
      if (fill > 0) {
        blendPx(canvas, x, y, 3, 9, 20, fill * 0.78);
      }

      // 1.4% rim, mint → cyan gradient, brighter on the top-left.
      const ringOuter = aaCoverage(dHex, pixelScale);
      const ringInner = aaCoverage(dHex + 0.014, pixelScale);
      const ring = Math.max(0, ringOuter - ringInner);
      if (ring > 0) {
        const along = clamp01((nx + ny - 0.3) / 1.1);
        let rimColor = lerpColor(mint, cyan, along);
        const topLight = smoothstep(0.85, 0.2, Math.hypot(nx - 0.28, ny - 0.24));
        rimColor = lerpColor(rimColor, [240, 255, 250], topLight * 0.35);
        blendPx(canvas, x, y, rimColor[0], rimColor[1], rimColor[2], ring * 0.95);
      }
    }
  }

  // --------------------------------- Layer 3 + 4: shadow and dumbbell
  const scale = 0.94;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x + 0.5) / size;
      const ny = (y + 0.5) / size;
      const dHex = sdHexagon(nx - 0.5, ny - 0.5, 0.36, 0.055);
      const clip = aaCoverage(dHex, pixelScale);

      // Drop shadow: same shape pushed down-right with a soft falloff.
      const [su, sv] = rotate2D(nx - 0.5 - 0.014, ny - 0.5 - 0.022, -DUMBBELL_ANGLE);
      const sdShadow = dumbbellSd(su / scale, sv / scale);
      const shadowAlpha = 0.55 * (1 - smoothstep(-0.005, 0.05, sdShadow)) * clip;
      if (shadowAlpha > 0.002) {
        blendPx(canvas, x, y, 0, 0, 0, shadowAlpha);
      }

      const [u, v] = rotate2D(nx - 0.5, ny - 0.5, -DUMBBELL_ANGLE);
      const uu = u / scale;
      const vv = v / scale;
      if (dumbbellSd(uu, vv) > 0.02) continue;

      paintHandle(canvas, x, y, uu, vv, pixelScale / scale);
      // Outer → inner so the heavy plates sit on top.
      for (const plate of [...PLATES].reverse()) {
        paintPlate(canvas, x, y, uu, vv, plate, pixelScale / scale);
        paintPlate(canvas, x, y, -uu, vv, plate, pixelScale / scale);
      }
    }
  }

  return canvas;
}

// ------------------------------------------------------------------ main
const master = drawMaster();
const sizes = [1024, 512, 256, 128, 64, 32];
const pngs = new Map();
for (const size of sizes) {
  const scaled = size === MASTER ? master : downsample(master, size);
  pngs.set(size, encodePng(scaled));
}

fs.mkdirSync(OUT, { recursive: true });
// `tauri icon` treats icon.png as an OUTPUT and rewrites it at 512, so the 1024
// master lives in app-icon.png and that is the file we hand to the CLI.
fs.writeFileSync(path.join(OUT, "app-icon.png"), pngs.get(1024));
fs.writeFileSync(path.join(OUT, "icon.png"), pngs.get(1024));
fs.writeFileSync(path.join(OUT, "32x32.png"), pngs.get(32));
fs.writeFileSync(path.join(OUT, "128x128.png"), pngs.get(128));
fs.writeFileSync(path.join(OUT, "128x128@2x.png"), pngs.get(256));

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

console.log(`icons written to ${OUT} (master ${MASTER}x${MASTER})`);
