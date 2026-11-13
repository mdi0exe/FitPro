/**
 * Offline demo checks: the exercise pictures must render with the network cut.
 *
 * Before this change every card hotlinked `fitnessprogramer.com`, which answers
 * 403 to the Android WebView (Cloudflare), so the picture simply vanished.
 * Now the demos are bundled under `public/gifs/` and shipped inside the APK.
 *
 * Usage: node scripts/e2e-offline.mjs
 * Requires the built app on http://127.0.0.1:4400/.
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const URL = process.env.APP_URL ?? "http://127.0.0.1:4400/";

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// 1. Every bundled file exists and is a real animated SVG
// ---------------------------------------------------------------------------
{
  const dir = path.resolve("dist", "gifs");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".svg")) : [];
  check("dist/gifs contains the bundle", files.length >= 36, `${files.length} files`);

  const sample = files.length ? fs.readFileSync(path.join(dir, "d1e1.svg"), "utf8") : "";
  check(
    "demos are self-contained (embedded JPEG, no remote URL)",
    sample.includes("data:image/jpeg;base64,") &&
      !sample.includes("https://") &&
      !sample.includes("fitnessprogramer"),
  );
  check("demos animate (CSS keyframes)", sample.includes("@keyframes alt"));

  const totalBytes = files.reduce((sum, file) => sum + fs.statSync(path.join(dir, file)).size, 0);
  check(
    "bundle stays small enough for the APK",
    totalBytes < 3.5 * 1024 * 1024,
    `${(totalBytes / 1024 / 1024).toFixed(2)} MB`,
  );
}

// ---------------------------------------------------------------------------
// 2. The app renders the demo with the network disabled
// ---------------------------------------------------------------------------
const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: "new",
  args: ["--no-sandbox", "--no-proxy-server", "--hide-scrollbars"],
  defaultViewport: { width: 412, height: 915, isMobile: true, hasTouch: true },
});

const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(err.message));

await page.evaluateOnNewDocument(() => localStorage.clear());
// "No internet at the gym": block everything that is not the local app. The
// offline flag would also kill the localhost server, so intercept instead.
await page.setRequestInterception(true);
page.on("request", (request) => {
  const url = request.url();
  if (url.startsWith("http://127.0.0.1") || url.startsWith("data:") || url.startsWith("blob:")) {
    void request.continue();
  } else {
    void request.abort();
  }
});
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 20000 });
await page.waitForFunction(
  () => document.querySelectorAll("#nav-slot nav button").length >= 5,
  { timeout: 15000 },
);
await wait(1500);

const card = await page.evaluate(() => {
  const img = document.querySelector("article[data-exercise] img");
  if (!img) return null;
  return { src: img.getAttribute("src"), width: img.naturalWidth, height: img.naturalHeight };
});
check("exercise card keeps its picture offline", Boolean(card) && card.width > 0, JSON.stringify(card));
check("picture comes from the bundle", (card?.src ?? "").startsWith("/gifs/"), card?.src ?? "");

// Warm-up rows use the same bundled files.
const warmupFallback = await page.evaluate(() => {
  const button = [...document.querySelectorAll("button")].find((node) => node.textContent?.includes("🎬"));
  button?.click();
  return Boolean(button);
});
await wait(600);
const modalSrc = await page.evaluate(
  () => document.querySelector("#overlay-root img")?.getAttribute("src") ?? "",
);
check("warm-up viewer opens offline", warmupFallback);
check("warm-up demo is the bundled file", modalSrc.startsWith("/gifs/"), modalSrc);

await page.evaluate(() => {
  document.querySelector("#overlay-root button[aria-label='بستن']")?.click();
});

// ---------------------------------------------------------------------------
// 3. A saved Cloudflare hotlink is migrated on load
// ---------------------------------------------------------------------------
await page.evaluateOnNewDocument(() => {
  const key = "persian-hypertrophy::state::v1";
  const raw = JSON.parse(localStorage.getItem(key) ?? "null");
  if (!raw) return;
  raw.days[0].exercises[0].gifUrl =
    "https://fitnessprogramer.com/wp-content/uploads/2021/02/Incline-Dumbbell-Press.gif";
  raw.days[0].warmups[0].gifUrl = "";
  localStorage.setItem(key, JSON.stringify(raw));
});
await page.reload({ waitUntil: "domcontentloaded", timeout: 20000 });
await page.waitForFunction(
  () => document.querySelectorAll("#nav-slot nav button").length >= 5,
  { timeout: 15000 },
);
await wait(1200);

const migrated = await page.evaluate(() =>
  JSON.parse(localStorage.getItem("persian-hypertrophy::state::v1") ?? "{}"),
);
check(
  "old fitnessprogramer link is migrated",
  migrated.days?.[0]?.exercises?.[0]?.gifUrl === "/gifs/d1e1.svg",
  migrated.days?.[0]?.exercises?.[0]?.gifUrl,
);
check(
  "blank warm-up demo is refilled",
  migrated.days?.[0]?.warmups?.[0]?.gifUrl === "/gifs/wu-upper-1.svg",
  migrated.days?.[0]?.warmups?.[0]?.gifUrl,
);

const offlineImg = await page.evaluate(() => {
  const img = document.querySelector("article[data-exercise] img");
  return img ? { src: img.getAttribute("src"), width: img.naturalWidth } : null;
});
check("migrated picture renders offline", Boolean(offlineImg) && offlineImg.width > 0, JSON.stringify(offlineImg));
check("no runtime errors", errors.length === 0, errors.join(" | "));

console.log(`\n${checks.filter((c) => c.ok).length}/${checks.length} checks passed`);
const failed = checks.filter((c) => !c.ok).length;
await browser.close();
process.exit(failed === 0 ? 0 : 1);
