/**
 * Audio checks: bundled studio MP3s, per-alert gain/vibration, no synthesis.
 * Usage: node scripts/e2e-audio.mjs   (requires scripts/serve-dist.mjs)
 */
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const URL = process.env.APP_URL ?? "http://127.0.0.1:4400/";
const SOUNDS = ["alarm", "success", "water", "tap"];

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

// ---------------------------------------------------------------- file checks
for (const name of SOUNDS) {
  const source = path.join("public", "sounds", `${name}.mp3`);
  const bundled = path.join("dist", "sounds", `${name}.mp3`);
  const buf = fs.existsSync(source) ? fs.readFileSync(source) : Buffer.alloc(0);
  const isMpeg = buf.length > 1000 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0;
  check(`${name}.mp3 bundled in public/ and dist/`, isMpeg && fs.existsSync(bundled), `${buf.length} bytes`);
}

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: "new",
  args: ["--no-sandbox", "--no-proxy-server", "--hide-scrollbars", "--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 412, height: 915, isMobile: true, hasTouch: true },
});

const page = await browser.newPage();
const errors = [];
const requests = [];
page.on("pageerror", (err) => errors.push(err.message));
page.on("request", (req) => {
  if (req.url().includes("/sounds/")) requests.push(req.url());
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// `networkidle2` can hang on lazy images; wait for the app shell instead.
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForFunction(
  () => document.querySelectorAll("#nav-slot nav button").length >= 5,
  { timeout: 10000 },
);
await wait(700);

// Instrument Web Audio + vibration before the first user gesture.
await page.evaluate(() => {
  window.__gains = [];
  window.__vibrate = [];
  window.__oscillators = 0;
  window.__bufferSources = 0;
  window.__wavDataUrls = 0;
  window.__mediaFallback = [];
  window.__gainProbe = true;

  const proto = window.AudioContext.prototype;

  const createGain = proto.createGain;
  proto.createGain = function () {
    const node = createGain.call(this);
    try {
      const param = node.gain;
      const proxy = new Proxy(param, {
        set(target, prop, value) {
          if (prop === "value") window.__gains.push(value);
          target.value = value;
          return true;
        },
      });
      Object.defineProperty(node, "gain", { configurable: true, value: proxy });
    } catch {
      window.__gainProbe = false;
    }
    return node;
  };

  const createBufferSource = proto.createBufferSource;
  proto.createBufferSource = function () {
    window.__bufferSources += 1;
    return createBufferSource.call(this);
  };

  const createOscillator = proto.createOscillator;
  proto.createOscillator = function () {
    window.__oscillators += 1;
    return createOscillator.call(this);
  };

  const createCompressor = proto.createDynamicsCompressor;
  proto.createDynamicsCompressor = function () {
    const node = createCompressor.call(this);
    window.__compressorNode = node;
    return node;
  };

  const OriginalAudio = window.Audio;
  window.Audio = function (src) {
    const element = new OriginalAudio(src);
    const url = String(src ?? "");
    if (url.startsWith("data:audio")) window.__wavDataUrls += 1;
    window.__mediaFallback.push({ src: url, volume: element.volume });
    return element;
  };

  navigator.vibrate = (pattern) => {
    window.__vibrate.push(pattern);
    return true;
  };
});

// First real gesture unlocks audio and warms all four clips.
const nav = await page.$$("#nav-slot nav button");
for (const button of nav) {
  if ((await button.evaluate((node) => node.textContent ?? "")).includes("مربی")) {
    await button.click();
    break;
  }
}
await wait(1000);
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await wait(400);

check("all 4 MP3s fetched by the app", SOUNDS.every((n) => requests.some((u) => u.endsWith(`/sounds/${n}.mp3`))), `${requests.length} sound requests`);
check("no synthesized oscillators", (await page.evaluate(() => window.__oscillators)) === 0);
check("no generated WAV data URLs", (await page.evaluate(() => window.__wavDataUrls)) === 0);
check("gain probe installed", await page.evaluate(() => window.__gainProbe));

const compressor = await page.evaluate(() => {
  const node = window.__compressorNode;
  if (!node) return null;
  return { threshold: node.threshold.value, knee: node.knee.value, ratio: node.ratio.value, attack: node.attack.value, release: node.release.value };
});
check("master compressor configured", compressor?.threshold === -12 && compressor?.ratio === 12 && compressor?.knee === 10, JSON.stringify(compressor));

const clickText = async (text) => {
  for (const handle of await page.$$("button")) {
    if ((await handle.evaluate((n) => (n.textContent ?? "").trim())).includes(text)) {
      await handle.evaluate((n) => n.scrollIntoView({ block: "center" }));
      await wait(250);
      await handle.click();
      return true;
    }
  }
  return false;
};

// ------------------------------------------------------------- loud alarm
await page.evaluate(() => { window.__gains = []; window.__vibrate = []; window.__bufferSources = 0; });
check("alarm test button exists", await clickText("تست صدای هشدار استراحت"));
await wait(700);
let gains = await page.evaluate(() => window.__gains);
let vibrates = await page.evaluate(() => window.__vibrate);
check("alarm plays at 1.8x gain", gains.includes(1.8), JSON.stringify(gains));
check("alarm uses decoded MP3 buffer", (await page.evaluate(() => window.__bufferSources)) >= 1);
check("alarm uses strong vibration", vibrates.some((p) => JSON.stringify(p) === JSON.stringify([500, 150, 500, 150, 700])), JSON.stringify(vibrates));

// ------------------------------------------------------------- soft water
await page.evaluate(() => { window.__gains = []; window.__vibrate = []; });
check("water test button exists", await clickText("تست یادآور آب"));
await wait(700);
gains = await page.evaluate(() => window.__gains);
vibrates = await page.evaluate(() => window.__vibrate);
check("water alert plays at 0.35 gain", gains.includes(0.35), JSON.stringify(gains));
check("water alert uses light vibration", vibrates.some((p) => JSON.stringify(p) === JSON.stringify([100, 60, 100])), JSON.stringify(vibrates));

// ------------------------------- HTMLAudioElement media fallback (fresh page)
// The main page has already cached decoded buffers, so decode failure has to be
// simulated before the app ever unlocks audio.
const fallbackPage = await browser.newPage();
fallbackPage.on("pageerror", (err) => errors.push(`[fallback] ${err.message}`));
await fallbackPage.goto(URL, { waitUntil: "domcontentloaded" });
await fallbackPage.waitForFunction(
  () => document.querySelectorAll("#nav-slot nav button").length >= 5,
  { timeout: 10000 },
);
await fallbackPage.evaluate(() => {
  window.__mediaFallback = [];
  window.AudioContext.prototype.decodeAudioData = function () {
    return Promise.reject(new Error("simulated decode failure"));
  };
  const OriginalAudio = window.Audio;
  window.Audio = function (src) {
    const element = new OriginalAudio(src);
    window.__mediaFallback.push({ src: String(src ?? ""), volume: element.volume });
    return element;
  };
});
const fNav = await fallbackPage.$$("#nav-slot nav button");
for (const button of fNav) {
  if ((await button.evaluate((node) => node.textContent ?? "")).includes("مربی")) {
    await button.click();
    break;
  }
}
await wait(900);
await fallbackPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await wait(400);
for (const handle of await fallbackPage.$$("button")) {
  if ((await handle.evaluate((n) => (n.textContent ?? "").trim())).includes("تست صدای هشدار استراحت")) {
    await handle.evaluate((n) => n.scrollIntoView({ block: "center" }));
    await wait(250);
    await handle.click();
    break;
  }
}
await wait(700);
const fallback = await fallbackPage.evaluate(() => window.__mediaFallback);
check("media fallback plays the real alarm MP3", fallback.some((a) => a.src === "/sounds/alarm.mp3" && a.volume === 1), JSON.stringify(fallback));
await fallbackPage.close();

console.log("\n--- runtime errors ---");
console.log(errors.length ? errors.join("\n") : "none");
check("no runtime errors", errors.length === 0);

const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
