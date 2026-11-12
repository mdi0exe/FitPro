/**
 * Builds the complete app icon set from the vector source `icons/icon.svg`.
 *
 * Two tools are involved:
 *   1. puppeteer-core + the installed Edge/Chromium renders icon.svg at exactly
 *      1024x1024 with a transparent background. Browser rendering gives full
 *      support for the SVG's gradients and feDropShadow filters.
 *   2. `tauri icon` rasterises the SVG straight into every platform density
 *      (PNG / ICO / ICNS / Android mipmaps / adaptive foreground). That command
 *      is pure Rust (the Tauri CLI), so CI on Linux does not need a browser.
 *
 * The 1024 PNG masters live in `app-icon.png` and `icon.png`. `tauri icon`
 * treats `icon.png` as one of its OUTPUTS and rewrites it at 512, so the master
 * is restored from the render buffer after the CLI finishes.
 *
 * Usage: node scripts/gen-icons.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import puppeteer from "puppeteer-core";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "src-tauri", "icons");
const SVG_PATH = path.join(OUT, "icon.svg");
const SIZE = 1024;

const BROWSER_CANDIDATES = [
  process.env.EDGE_PATH,
  process.env.CHROME_PATH,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/microsoft-edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

function findBrowser() {
  return BROWSER_CANDIDATES.find((candidate) => fs.existsSync(candidate)) ?? null;
}

/** Render the SVG in a real browser so every gradient/filter is honoured. */
async function renderMaster(svg, executablePath) {
  const browser = await puppeteer.launch({
    executablePath,
    headless: "new",
    args: ["--no-sandbox", "--no-proxy-server", "--hide-scrollbars"],
    defaultViewport: { width: SIZE, height: SIZE, deviceScaleFactor: 1 },
  });

  try {
    const page = await browser.newPage();
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><style>` +
        `html,body{margin:0;padding:0;width:${SIZE}px;height:${SIZE}px;background:transparent}` +
        `svg{display:block;width:${SIZE}px;height:${SIZE}px}` +
        `</style></head><body>${svg}</body></html>`,
      { waitUntil: "load" },
    );
    return await page.screenshot({
      omitBackground: true,
      clip: { x: 0, y: 0, width: SIZE, height: SIZE },
      type: "png",
    });
  } finally {
    await browser.close();
  }
}

/** `npx tauri icon <svg>` — works on Windows, macOS and Linux CI alike. */
function runTauriIcon() {
  const result = spawnSync("npx", ["tauri", "icon", "src-tauri/icons/icon.svg"], {
    cwd: ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    throw new Error(`tauri icon failed (exit ${result.status ?? "signal"})`);
  }
}

const svg = fs.readFileSync(SVG_PATH, "utf8");
const browser = findBrowser();
let master = null;

if (browser) {
  console.log(`Rendering ${path.relative(ROOT, SVG_PATH)} at ${SIZE}x${SIZE} with ${browser}`);
  master = await renderMaster(svg, browser);
  fs.writeFileSync(path.join(OUT, "app-icon.png"), master);
  fs.writeFileSync(path.join(OUT, "icon.png"), master);
  console.log(`  master PNG: ${(master.length / 1024).toFixed(0)} KB`);
} else {
  console.log("No Chromium/Edge found — skipping the PNG render, using the SVG directly.");
}

console.log("Generating platform icons with `npx tauri icon` ...");
runTauriIcon();

// tauri icon rewrites icon.png at 512; put the 1024 master back.
if (master) {
  fs.writeFileSync(path.join(OUT, "icon.png"), master);
}

const produced = fs
  .readdirSync(OUT)
  .filter((name) => !fs.statSync(path.join(OUT, name)).isDirectory())
  .sort();
const mipmaps = fs.existsSync(path.join(OUT, "android"))
  ? fs.readdirSync(path.join(OUT, "android")).length
  : 0;

console.log(`\nDone. ${produced.length} icon files, ${mipmaps} Android mipmap folders.`);
console.log(`Source of truth: ${path.relative(ROOT, SVG_PATH)}`);
