/**
 * Audio engine checks: WAV generation, compressor chain, vibration patterns.
 * Usage: node scripts/e2e-audio.mjs
 */
import puppeteer from "puppeteer-core";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const URL = process.env.APP_URL ?? "http://127.0.0.1:4400/";

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: "new",
  args: ["--no-sandbox", "--no-proxy-server", "--hide-scrollbars", "--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 412, height: 915, isMobile: true, hasTouch: true },
});

const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(err.message));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

await page.goto(URL, { waitUntil: "networkidle2" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle2" });
await wait(700);

// Instrument Audio + vibrate + AudioContext before any click.
await page.evaluate(() => {
  window.__audio = [];
  window.__vibrate = [];

  const OriginalAudio = window.Audio;
  window.Audio = function (src) {
    const element = new OriginalAudio(src);
    const entry = { src: typeof src === "string" ? src : "", volume: element.volume, played: false };
    window.__audio.push(entry);
    const originalPlay = element.play.bind(element);
    element.play = () => {
      entry.played = true;
      entry.volume = element.volume;
      return originalPlay();
    };
    return element;
  };

  navigator.vibrate = (pattern) => {
    window.__vibrate.push(pattern);
    return true;
  };

  const Original = window.AudioContext;
  window.__compressorNode = null;
  window.AudioContext = function (...args) {
    const ctx = new Original(...args);
    const originalCreate = ctx.createDynamicsCompressor.bind(ctx);
    ctx.createDynamicsCompressor = () => {
      const node = originalCreate();
      window.__compressorNode = node;
      return node;
    };
    return ctx;
  };
});

// Go offline so the online clips fail and the generated WAV path is exercised.
await page.setOfflineMode(true);

const nav = await page.$$("#nav-slot nav button");
await nav[3].click();
await wait(600);
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await wait(400);

const clickText = async (text) => {
  for (const handle of await page.$$("button")) {
    if ((await handle.evaluate((n) => (n.textContent ?? "").trim())).includes(text)) {
      await handle.click();
      return true;
    }
  }
  return false;
};

// ------------------------------------------------------------- loud alarm
const clickedAlarm = await clickText("تست صدای هشدار استراحت");
await wait(900);
let audio = await page.evaluate(() => window.__audio);
let vibrate = await page.evaluate(() => window.__vibrate);

check("alarm test button exists", clickedAlarm);
check(
  "alarm generates a WAV data URL",
  audio.some((entry) => entry.src.startsWith("data:audio/wav;base64,")),
  audio.map((entry) => entry.src.slice(0, 24)).join(" | "),
);
check(
  "alarm WAV plays at full volume",
  audio.some((entry) => entry.src.startsWith("data:audio/wav") && entry.volume === 1 && entry.played),
  JSON.stringify(audio.map((entry) => entry.volume)),
);
check(
  "alarm uses the strong vibration pattern",
  vibrate.some((pattern) => JSON.stringify(pattern) === JSON.stringify([500, 150, 500, 150, 700])),
  JSON.stringify(vibrate),
);

const wav = await page.evaluate(async () => {
  const entry = window.__audio.find((item) => item.src.startsWith("data:audio/wav"));
  if (!entry) return null;
  const base64 = entry.src.split(",")[1];
  const binary = atob(base64);
  const header = binary.slice(0, 12);
  return {
    riff: header.slice(0, 4),
    wave: header.slice(8, 12),
    bytes: binary.length,
    sampleRate: new DataView(
      Uint8Array.from(binary.slice(24, 28), (c) => c.charCodeAt(0)).buffer,
    ).getUint32(0, true),
  };
});
check("WAV header is valid 44.1kHz RIFF", wav?.riff === "RIFF" && wav?.wave === "WAVE" && wav?.sampleRate === 44100, JSON.stringify(wav));

// ------------------------------------------------------------- soft water
await page.evaluate(() => {
  window.__audio = [];
  window.__vibrate = [];
});
const clickedWater = await clickText("تست یادآور آب");
await wait(900);
audio = await page.evaluate(() => window.__audio);
vibrate = await page.evaluate(() => window.__vibrate);

check("water test button exists", clickedWater);
check(
  "water alert is quiet (0.25)",
  audio.some((entry) => entry.volume === 0.25),
  JSON.stringify(audio.map((entry) => entry.volume)),
);
check(
  "water alert uses the light vibration",
  vibrate.some((pattern) => JSON.stringify(pattern) === JSON.stringify([100, 60, 100])),
  JSON.stringify(vibrate),
);

// --------------------------------------------------------- compressor chain
const compressor = await page.evaluate(() => {
  const node = window.__compressorNode;
  if (!node) return null;
  return {
    threshold: node.threshold.value,
    knee: node.knee.value,
    ratio: node.ratio.value,
    attack: node.attack.value,
    release: node.release.value,
  };
});
check(
  "master compressor is configured",
  compressor?.threshold === -12 && compressor?.ratio === 12 && compressor?.knee === 10,
  JSON.stringify(compressor),
);

console.log("\n--- runtime errors ---");
console.log(errors.length ? errors.join("\n") : "none");

const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);

await browser.close();
process.exit(failed === 0 ? 0 : 1);
