/**
 * Builds the Android launcher icon set from the two PNG masters.
 *
 * Why this exists: `tauri icon` scales the artwork to the full 108dp adaptive
 * canvas. Android then crops that canvas to the 72dp visible circle (66dp safe
 * zone), so a full-bleed crest gets zoomed in and its edges are cut off on real
 * launchers. This script instead:
 *
 *   • foreground (108dp): the crest only, transparent, inset to 60% so nothing
 *     is ever clipped by the launcher mask;
 *   • background: a dark radial gradient (replaces the white default, which
 *     showed as a bright ring around the icon on dark launchers);
 *   • legacy ic_launcher / ic_launcher_round: the full artwork, with the round
 *     variant properly circle-masked.
 *
 * Inputs (committed):
 *   src-tauri/icons/app-icon.png          1024×1024 full artwork
 *   src-tauri/icons/android-foreground.png 1024×1024 crest on transparency
 *
 * Outputs: src-tauri/icons/android/** and, when the Android project has been
 * generated, src-tauri/gen/android/app/src/main/res/**.
 *
 * Zero dependencies: a tiny PNG codec (zlib is built into Node) keeps CI free of
 * Pillow/sharp/browser installs.
 *
 * Usage: node scripts/gen-android-icons.mjs
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const ROOT = process.cwd();
const ICONS = path.join(ROOT, "src-tauri", "icons");
const OUT = path.join(ICONS, "android");
const GEN_RES = path.join(ROOT, "src-tauri", "gen", "android", "app", "src", "main", "res");

/** mdpi … xxxhdpi multipliers (48dp launcher / 108dp adaptive foreground). */
const DENSITIES = [
  ["mdpi", 1],
  ["hdpi", 1.5],
  ["xhdpi", 2],
  ["xxhdpi", 3],
  ["xxxhdpi", 4],
];

/** Crest occupies 60% of the 108dp canvas: inside the 66dp safe zone. */
const FOREGROUND_FILL = 0.6;

// ---------------------------------------------------------------------------
// Minimal PNG codec (8-bit, non-interlaced)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/** @returns {{width:number,height:number,rgba:Buffer}} */
function decodePng(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`${file} is not a PNG`);

  let width = 0;
  let height = 0;
  let depth = 8;
  let colorType = 6;
  let interlace = 0;
  let palette = null;
  let trns = null;
  const idat = [];

  let offset = 8;
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "PLTE") {
      palette = data;
    } else if (type === "tRNS") {
      trns = data;
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += length + 12;
  }

  if (depth !== 8) throw new Error(`${file}: only 8-bit PNGs are supported (got ${depth})`);
  if (interlace !== 0) throw new Error(`${file}: interlaced PNGs are not supported`);

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`${file}: unsupported color type ${colorType}`);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    const prev = y === 0 ? null : pixels.subarray((y - 1) * stride, y * stride);
    for (let i = 0; i < stride; i += 1) {
      const a = i >= channels ? out[i - channels] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= channels ? prev[i - channels] : 0;
      let value = line[i];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) value += paeth(a, b, c);
      out[i] = value & 0xff;
    }
  }

  const rgba = Buffer.alloc(width * height * 4);
  for (let p = 0; p < width * height; p += 1) {
    const s = p * channels;
    const d = p * 4;
    if (colorType === 6) {
      rgba[d] = pixels[s];
      rgba[d + 1] = pixels[s + 1];
      rgba[d + 2] = pixels[s + 2];
      rgba[d + 3] = pixels[s + 3];
    } else if (colorType === 2) {
      rgba[d] = pixels[s];
      rgba[d + 1] = pixels[s + 1];
      rgba[d + 2] = pixels[s + 2];
      rgba[d + 3] = 255;
    } else if (colorType === 0) {
      rgba[d] = rgba[d + 1] = rgba[d + 2] = pixels[s];
      rgba[d + 3] = 255;
    } else if (colorType === 4) {
      rgba[d] = rgba[d + 1] = rgba[d + 2] = pixels[s];
      rgba[d + 3] = pixels[s + 1];
    } else if (colorType === 3) {
      const index = pixels[s];
      rgba[d] = palette[index * 3];
      rgba[d + 1] = palette[index * 3 + 1];
      rgba[d + 2] = palette[index * 3 + 2];
      rgba[d + 3] = trns && index < trns.length ? trns[index] : 255;
    }
  }

  return { width, height, rgba };
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng({ width, height, rgba }) {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Image operations (premultiplied, so transparent pixels never bleed colour)
// ---------------------------------------------------------------------------

function areaWeights(srcSize, dstSize) {
  const scale = srcSize / dstSize;
  const table = [];
  for (let d = 0; d < dstSize; d += 1) {
    const start = d * scale;
    const end = (d + 1) * scale;
    const first = Math.floor(start);
    const last = Math.min(srcSize - 1, Math.ceil(end) - 1);
    const weights = [];
    let total = 0;
    for (let s = first; s <= last; s += 1) {
      const w = Math.min(end, s + 1) - Math.max(start, s);
      if (w <= 0) continue;
      weights.push([s, w]);
      total += w;
    }
    table.push(weights.map(([s, w]) => [s, w / total]));
  }
  return table;
}

/** High-quality area-average resize (downscale only). */
function resize(src, dstWidth, dstHeight) {
  const { width, height, rgba } = src;
  if (width === dstWidth && height === dstHeight) return { width, height, rgba: Buffer.from(rgba) };

  const xw = areaWeights(width, dstWidth);
  const yw = areaWeights(height, dstHeight);
  const out = Buffer.alloc(dstWidth * dstHeight * 4);

  // Premultiply once.
  const pre = new Float32Array(width * height * 4);
  for (let p = 0; p < width * height; p += 1) {
    const a = rgba[p * 4 + 3] / 255;
    pre[p * 4] = rgba[p * 4] * a;
    pre[p * 4 + 1] = rgba[p * 4 + 1] * a;
    pre[p * 4 + 2] = rgba[p * 4 + 2] * a;
    pre[p * 4 + 3] = rgba[p * 4 + 3];
  }

  for (let dy = 0; dy < dstHeight; dy += 1) {
    for (let dx = 0; dx < dstWidth; dx += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (const [sy, wy] of yw[dy]) {
        const rowBase = sy * width;
        for (const [sx, wx] of xw[dx]) {
          const w = wy * wx;
          const s = (rowBase + sx) * 4;
          r += pre[s] * w;
          g += pre[s + 1] * w;
          b += pre[s + 2] * w;
          a += pre[s + 3] * w;
        }
      }
      const d = (dy * dstWidth + dx) * 4;
      const alpha = a / 255;
      out[d] = alpha > 0 ? Math.min(255, Math.round(r / alpha)) : 0;
      out[d + 1] = alpha > 0 ? Math.min(255, Math.round(g / alpha)) : 0;
      out[d + 2] = alpha > 0 ? Math.min(255, Math.round(b / alpha)) : 0;
      out[d + 3] = Math.round(a);
    }
  }

  return { width: dstWidth, height: dstHeight, rgba: out };
}

/** Alpha bounding box, ignoring near-invisible glow pixels. */
function inkBounds({ width, height, rgba }, threshold = 12) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (rgba[(y * width + x) * 4 + 3] <= threshold) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error("image is fully transparent");
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function crop(src, box) {
  const out = Buffer.alloc(box.width * box.height * 4);
  for (let y = 0; y < box.height; y += 1) {
    src.rgba.copy(
      out,
      y * box.width * 4,
      ((box.y + y) * src.width + box.x) * 4,
      ((box.y + y) * src.width + box.x + box.width) * 4,
    );
  }
  return { width: box.width, height: box.height, rgba: out };
}

function blank(width, height) {
  return { width, height, rgba: Buffer.alloc(width * height * 4) };
}

/**
 * The artwork's own radial gradient, rendered from scratch. Used behind the
 * legacy icons so their rounded corners are never transparent (old launchers
 * paint them over a light frame, which looked like a broken icon).
 */
function gradientBackground(size) {
  const img = blank(size, size);
  const stops = [
    [0, [0x0f, 0x29, 0x26]],
    [0.55, [0x06, 0x10, 0x1e]],
    [1, [0x02, 0x06, 0x17]],
  ];
  const cx = 0.5 * size;
  const cy = 0.38 * size;
  const radius = 0.7 * size;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const t = Math.min(1, Math.sqrt(dx * dx + dy * dy) / radius);
      let a = stops[0];
      let b = stops[stops.length - 1];
      for (let i = 0; i < stops.length - 1; i += 1) {
        if (t >= stops[i][0] && t <= stops[i + 1][0]) {
          a = stops[i];
          b = stops[i + 1];
          break;
        }
      }
      const span = b[0] - a[0] || 1;
      const k = (t - a[0]) / span;
      const d = (y * size + x) * 4;
      for (let c = 0; c < 3; c += 1) img.rgba[d + c] = Math.round(a[1][c] + (b[1][c] - a[1][c]) * k);
      img.rgba[d + 3] = 255;
    }
  }
  return img;
}

/** Source-over composite of `src` onto `dst` at (ox, oy). */
function drawOnto(dst, src, ox, oy) {
  for (let y = 0; y < src.height; y += 1) {
    const ty = y + oy;
    if (ty < 0 || ty >= dst.height) continue;
    for (let x = 0; x < src.width; x += 1) {
      const tx = x + ox;
      if (tx < 0 || tx >= dst.width) continue;
      const s = (y * src.width + x) * 4;
      const d = (ty * dst.width + tx) * 4;
      const sa = src.rgba[s + 3] / 255;
      if (sa === 0) continue;
      const da = dst.rgba[d + 3] / 255;
      const outA = sa + da * (1 - sa);
      if (outA === 0) continue;
      for (let c = 0; c < 3; c += 1) {
        dst.rgba[d + c] = Math.round(
          (src.rgba[s + c] * sa + dst.rgba[d + c] * da * (1 - sa)) / outA,
        );
      }
      dst.rgba[d + 3] = Math.round(outA * 255);
    }
  }
  return dst;
}

/** Anti-aliased circular alpha mask (4×4 supersampling). */
function circleMask(img) {
  const { width, height, rgba } = img;
  const r = width / 2;
  const samples = 4;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let hits = 0;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const px = x + (sx + 0.5) / samples - r;
          const py = y + (sy + 0.5) / samples - r;
          if (px * px + py * py <= r * r) hits += 1;
        }
      }
      const coverage = hits / (samples * samples);
      const d = (y * width + x) * 4 + 3;
      rgba[d] = Math.round(rgba[d] * coverage);
    }
  }
  return img;
}

// ---------------------------------------------------------------------------
// Android resources
// ---------------------------------------------------------------------------

const ADAPTIVE_XML = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
  <background android:drawable="@drawable/ic_launcher_background"/>
</adaptive-icon>
`;

const ADAPTIVE_ROUND_XML = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
  <background android:drawable="@drawable/ic_launcher_background"/>
</adaptive-icon>
`;

/** Same gradient as the artwork, so the mask edge blends into the crest. */
const BACKGROUND_XML = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
  <gradient
    android:type="radial"
    android:centerX="0.5"
    android:centerY="0.38"
    android:gradientRadius="70%p"
    android:startColor="#0F2926"
    android:centerColor="#06101E"
    android:endColor="#020617" />
</shape>
`;

function writeRes(dir, rel, contents) {
  const target = path.join(dir, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

function buildDensity(art, crest, scale) {
  const launcherSize = Math.round(48 * scale);
  const foregroundSize = Math.round(108 * scale);

  // Legacy icons are drawn on a flat gradient so their rounded corners stay
  // opaque; the round variant is then clipped to a circle.
  const launcher = drawOnto(gradientBackground(launcherSize), resize(art, launcherSize, launcherSize), 0, 0);
  const round = circleMask(
    drawOnto(gradientBackground(launcherSize), resize(art, launcherSize, launcherSize), 0, 0),
  );

  // Inset the crest: nothing may fall outside the 66dp safe circle.
  const box = inkBounds(crest);
  const crestCrop = crop(crest, box);
  const fit = Math.round(foregroundSize * FOREGROUND_FILL);
  const ratio = Math.min(fit / crestCrop.width, fit / crestCrop.height);
  const scaled = resize(
    crestCrop,
    Math.max(1, Math.round(crestCrop.width * ratio)),
    Math.max(1, Math.round(crestCrop.height * ratio)),
  );
  const foreground = blank(foregroundSize, foregroundSize);
  drawOnto(
    foreground,
    scaled,
    Math.round((foregroundSize - scaled.width) / 2),
    Math.round((foregroundSize - scaled.height) / 2),
  );

  return { launcher, round, foreground };
}

const art = decodePng(path.join(ICONS, "app-icon.png"));
const crest = decodePng(path.join(ICONS, "android-foreground.png"));
if (art.width !== art.height || crest.width !== crest.height) {
  throw new Error("icon masters must be square");
}

const results = [];
for (const [name, scale] of DENSITIES) {
  const { launcher, round, foreground } = buildDensity(art, crest, scale);
  results.push({ name, scale, launcher, round, foreground });
}

// Sanity check: the adaptive foreground must be transparent at its edges,
// otherwise Android will crop the crest again.
for (const { name, foreground } of results) {
  const edge = (x, y) => foreground.rgba[(y * foreground.width + x) * 4 + 3];
  const corners = [
    edge(0, 0),
    edge(foreground.width - 1, 0),
    edge(0, foreground.height - 1),
    edge(foreground.width - 1, foreground.height - 1),
  ];
  if (corners.some((alpha) => alpha !== 0)) {
    throw new Error(`${name}: adaptive foreground is not transparent at the corners`);
  }
}

const targets = [OUT];
if (fs.existsSync(path.join(ROOT, "src-tauri", "gen", "android"))) targets.push(GEN_RES);

for (const dir of targets) {
  for (const { name, launcher, round, foreground } of results) {
    // Tauri ships webp launchers; leaving them next to our PNGs makes aapt2
    // fail with "Duplicate resource".
    for (const oldFile of ["ic_launcher.webp", "ic_launcher_round.webp", "ic_launcher_foreground.webp"]) {
      const stale = path.join(dir, `mipmap-${name}`, oldFile);
      if (fs.existsSync(stale)) fs.unlinkSync(stale);
    }
    writeRes(dir, path.join(`mipmap-${name}`, "ic_launcher.png"), encodePng(launcher));
    writeRes(dir, path.join(`mipmap-${name}`, "ic_launcher_round.png"), encodePng(round));
    writeRes(dir, path.join(`mipmap-${name}`, "ic_launcher_foreground.png"), encodePng(foreground));
  }
  writeRes(dir, path.join("mipmap-anydpi-v26", "ic_launcher.xml"), ADAPTIVE_XML);
  writeRes(dir, path.join("mipmap-anydpi-v26", "ic_launcher_round.xml"), ADAPTIVE_ROUND_XML);
  writeRes(dir, path.join("drawable", "ic_launcher_background.xml"), BACKGROUND_XML);
  // Legacy (API < 26) fallback colour, used by the splash/theme too.
  writeRes(
    dir,
    path.join("values", "ic_launcher_background.xml"),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <color name="ic_launcher_background">#06101E</color>\n</resources>\n`,
  );
}

const sample = results[results.length - 1];
console.log(
  `Android icons written to ${targets.map((t) => path.relative(ROOT, t)).join(", ")}\n` +
    `  xxxhdpi: launcher ${sample.launcher.width}px, foreground ${sample.foreground.width}px ` +
    `(crest ${Math.round(FOREGROUND_FILL * 100)}% of the canvas)`,
);
