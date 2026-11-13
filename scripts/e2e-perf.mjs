/**
 * Scroll-performance regression checks.
 *
 * Every assertion here maps to a fix that made the Android WebView scroll at
 * 120 Hz instead of dropping frames:
 *   1. no `background-attachment: fixed` on <body>
 *   2. no `backdrop-filter` on cards / header / nav
 *   3. `content-visibility: auto` on exercise cards + `decoding="async"` on GIFs
 *   4. the 1 s water countdown never touches localStorage
 *
 * Usage: node scripts/e2e-perf.mjs
 * Requires the built app on http://127.0.0.1:4400/.
 */
import puppeteer from "puppeteer-core";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const BASE = process.env.APP_URL ?? "http://127.0.0.1:4400/";
const STORAGE_KEY = "persian-hypertrophy::state::v1";
const WATER_MIRROR_KEY = "persian-hypertrophy::water-next-at";

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: "new",
  args: ["--no-sandbox", "--no-proxy-server", "--hide-scrollbars"],
  defaultViewport: { width: 412, height: 915, isMobile: true, hasTouch: true },
});

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(err.message));
page.on("console", (msg) => {
  if (msg.type() !== "error") return;
  if (msg.text().includes("Blocked call to navigator.vibrate")) return;
  errors.push(msg.text());
});

await page.evaluateOnNewDocument((mirrorKey) => {
  // Count synchronous localStorage reads of the water deadline mirror.
  const original = Storage.prototype.getItem;
  Storage.prototype.getItem = function getItem(key) {
    if (key === mirrorKey) window.__waterMirrorReads = (window.__waterMirrorReads ?? 0) + 1;
    return original.call(this, key);
  };
}, WATER_MIRROR_KEY);

await page.evaluateOnNewDocument((storageKey) => {
  if (sessionStorage.getItem("e2e:perf")) return;
  sessionStorage.setItem("e2e:perf", "1");
  localStorage.clear();
  // Water reminder ON with a deadline an hour away: this is the state that used
  // to run a 1 s interval reading localStorage on every tick.
  const state = JSON.parse(localStorage.getItem(storageKey) ?? "null");
  if (state) {
    state.diet.waterReminderEnabled = true;
    state.diet.waterReminderNextAt = Date.now() + 3_600_000;
    localStorage.setItem(storageKey, JSON.stringify(state));
  }
}, STORAGE_KEY);

await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 20000 });
await page.waitForFunction(
  () => document.querySelectorAll("#nav-slot nav button").length >= 3,
  { timeout: 15000 },
);
await wait(600);

// ---------------------------------------------------------------------------
// 1. No fixed background on the scrolling element
// ---------------------------------------------------------------------------
const bodyStyle = await page.evaluate(() => {
  const style = getComputedStyle(document.body);
  return { attachment: style.backgroundAttachment, scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior };
});
check(
  "body background is not fixed",
  !bodyStyle.attachment.includes("fixed"),
  bodyStyle.attachment,
);
check("no smooth scroll-behavior", bodyStyle.scrollBehavior === "auto", bodyStyle.scrollBehavior);

// ---------------------------------------------------------------------------
// 2. No backdrop-filter on cards, header or nav
// ---------------------------------------------------------------------------
const blur = await page.evaluate(() => {
  const read = (node) => (node ? getComputedStyle(node).backdropFilter : "missing");
  return {
    card: read(document.querySelector(".card")),
    header: read(document.querySelector("header")),
    nav: read(document.querySelector("nav")),
    headerWillChange: document.querySelector("header")
      ? getComputedStyle(document.querySelector("header")).willChange
      : "missing",
  };
});
check("cards have no backdrop blur", blur.card === "none", blur.card);
check("header has no backdrop blur", blur.header === "none", blur.header);
check("bottom nav has no backdrop blur", blur.nav === "none", blur.nav);
check(
  "header is promoted to its own layer",
  blur.headerWillChange.includes("transform"),
  blur.headerWillChange,
);

// ---------------------------------------------------------------------------
// 3. Off-screen cards + GIF decode
// ---------------------------------------------------------------------------
const exercise = await page.evaluate(() => {
  const node = document.querySelector("[data-exercise]");
  if (!node) return null;
  const style = getComputedStyle(node);
  const img = node.querySelector("img");
  return {
    contentVisibility: style.contentVisibility,
    intrinsic: style.containIntrinsicSize,
    decoding: img?.getAttribute("decoding") ?? "missing",
    loading: img?.getAttribute("loading") ?? "missing",
  };
});
check("exercise cards use content-visibility", exercise?.contentVisibility === "auto", exercise?.contentVisibility);
check(
  "exercise cards reserve their height",
  String(exercise?.intrinsic ?? "").includes("420"),
  exercise?.intrinsic,
);
check("GIFs decode asynchronously", exercise?.decoding === "async", exercise?.decoding);
check("GIFs load lazily", exercise?.loading === "lazy", exercise?.loading);

// ---------------------------------------------------------------------------
// 4. The water countdown does not read localStorage on every tick
// ---------------------------------------------------------------------------
await page.evaluate(() => {
  window.__waterMirrorReads = 0;
});
await wait(2600);
const mirrorReads = await page.evaluate(() => window.__waterMirrorReads ?? 0);
check(
  "1 s water tick never touches localStorage",
  mirrorReads === 0,
  `${mirrorReads} reads in 2.6 s`,
);

check("no runtime errors", errors.length === 0, errors.join(" | "));

console.log(`\n${checks.length - checks.filter((c) => !c.ok).length}/${checks.length} checks passed`);
await browser.close();
process.exit(checks.every((c) => c.ok) ? 0 : 1);
