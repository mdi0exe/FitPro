/**
 * E2E checks for the two "quality of life" features:
 *   1. busy-machine swap → manual restore + automatic reset on a new day
 *   2. water reminder sleep window (00:00–09:00 completely silent)
 *
 * Usage: node scripts/e2e-swap-quiet.mjs
 * Requires the built app on http://127.0.0.1:4400/ (node scripts/serve-dist.mjs).
 */
import puppeteer from "puppeteer-core";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const URL = process.env.APP_URL ?? "http://127.0.0.1:4400/";

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

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Freezes `new Date()` / `Date.now()` at a local wall-clock time. */
const freezeClock = (isoLocal) =>
  `(() => {
     const fixed = new Date("${isoLocal}").getTime();
     const RealDate = Date;
     class FakeDate extends RealDate {
       constructor(...args) {
         if (args.length === 0) super(fixed);
         else super(...args);
       }
       static now() { return fixed; }
     }
     window.Date = FakeDate;
   })();`;

async function openPage(isoLocal = null) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  if (isoLocal) {
    await page.evaluateOnNewDocument(freezeClock(isoLocal));
    // Fresh install: the toggle starts off, so one click always means "on".
    await page.evaluateOnNewDocument(() => localStorage.clear());
  }
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForFunction(
    () => document.querySelectorAll("#nav-slot nav button").length >= 5,
    { timeout: 15000 },
  );
  await wait(500);
  return { page, errors };
}

const readState = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("persian-hypertrophy::state::v1") ?? "null"));

/** Writes state at document start of the next load, then reloads.
 *
 * Patching after load is not enough: the outgoing page flushes its in-memory
 * state on `pagehide`, which would overwrite the patch.
 */
async function patchStateOnReload(page, mutate) {
  await page.evaluateOnNewDocument((body) => {
    const key = "persian-hypertrophy::state::v1";
    const raw = JSON.parse(localStorage.getItem(key) ?? "null");
    if (!raw) return;
    // eslint-disable-next-line no-new-func
    new Function("state", body)(raw);
    localStorage.setItem(key, JSON.stringify(raw));
  }, mutate);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForFunction(
    () => document.querySelectorAll("#nav-slot nav button").length >= 5,
    { timeout: 15000 },
  );
  await wait(700);
}

// ---------------------------------------------------------------------------
// 1. Busy-machine swap
// ---------------------------------------------------------------------------

{
  const { page, errors } = await openPage();

  const firstCard = "article[data-exercise]";
  await page.waitForSelector(firstCard, { timeout: 10000 });

  const originalName = await page.$eval(`${firstCard} h3`, (node) => node.textContent.trim());
  const swapButton = await page.$('button[aria-label="حرکت جایگزین"]');
  check("swap button is rendered", Boolean(swapButton));
  await swapButton.click();
  await wait(700);

  let saved = await readState(page);
  const swapped = saved.days[0].exercises[0];
  const today = await page.evaluate(() => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });

  check("swap stores the original name", swapped.originalName === originalName, swapped.originalName);
  check("swap stores today's date", swapped.swappedDate === today, `${swapped.swappedDate} vs ${today}`);
  check("swap changes the movement", swapped.name !== originalName, swapped.name);
  check("swap shows the substitute demo", swapped.gifUrl === "/gifs/d1e1-alt.gif", String(swapped.gifUrl));

  const cardText = await page.$eval(firstCard, (node) => node.textContent);
  check("amber 'جایگزین امروز' chip is visible", cardText.includes("جایگزین امروز"));
  check(
    "'برگشت به حرکت اصلی' button replaces the swap button",
    Boolean(await page.$('button[aria-label="برگشت به حرکت اصلی"]')),
  );

  // Manual restore.
  await (await page.$('button[aria-label="برگشت به حرکت اصلی"]')).click();
  await wait(700);
  saved = await readState(page);
  const restored = saved.days[0].exercises[0];
  check("manual restore puts the name back", restored.name === originalName, restored.name);
  check("manual restore clears swappedDate", !restored.swappedDate, String(restored.swappedDate));
  check("manual restore clears originalName", !restored.originalName, String(restored.originalName));
  check(
    "swap button comes back",
    Boolean(await page.$('button[aria-label="حرکت جایگزین"]')),
  );

  // Swap again, then pretend it happened yesterday.
  await (await page.$('button[aria-label="حرکت جایگزین"]')).click();
  await wait(700);
  await patchStateOnReload(page, 'state.days[0].exercises[0].swappedDate = "2020-01-01";');

  saved = await readState(page);
  const autoReset = saved.days[0].exercises[0];
  check("next day restores the name automatically", autoReset.name === originalName, autoReset.name);
  check("next day clears swappedDate", !autoReset.swappedDate, String(autoReset.swappedDate));
  check("next day clears originalName", !autoReset.originalName, String(autoReset.originalName));
  check("next day restores the programmed demo", autoReset.gifUrl === "/gifs/d1e1.gif", String(autoReset.gifUrl));
  const cardAfterReset = await page.$eval(firstCard, (node) => node.textContent);
  check("'جایگزین امروز' chip is gone", !cardAfterReset.includes("جایگزین امروز"));

  check("no runtime errors (swap)", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---------------------------------------------------------------------------
// 2. Sleep window 00:00–09:00
// ---------------------------------------------------------------------------

async function waterTest(isoLocal, label, expectations) {
  const { page, errors } = await openPage(isoLocal);

  // Nutrition tab (third button in the bottom nav).
  const nav = await page.$$("#nav-slot nav button");
  await nav[2].click();
  await wait(700);

  const beforeText = await page.$eval("#view", (node) => node.textContent);
  check(`${label}: sleep-window hint is shown`, beforeText.includes("حالت خواب"));

  const toggle = await page.$('button[aria-label="یادآور آب"]');
  await toggle.click();
  await wait(900);

  const saved = await readState(page);
  const nextAt = saved.diet.waterReminderNextAt;
  const nextDate = await page.evaluate((ms) => {
    const d = new Date(ms);
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  }, nextAt);

  check(`${label}: reminder is enabled`, saved.diet.waterReminderEnabled === true);
  check(`${label}: next deadline is ${expectations.time}`, nextDate === expectations.time, nextDate);

  const viewText = await page.$eval("#view", (node) => node.textContent);
  if (expectations.sleeping) {
    check(`${label}: card says 'در حالت خواب'`, viewText.includes("در حالت خواب"));
  } else {
    check(`${label}: card does not say 'در حالت خواب'`, !viewText.includes("در حالت خواب"));
  }

  check(`${label}: no runtime errors`, errors.length === 0, errors.join(" | "));
  await page.close();
}

// 02:30 → the 60-minute reminder would land at 03:30, so it must move to 09:00.
await waterTest("2026-11-12T02:30:00", "02:30", { time: "9:00", sleeping: true });
// 23:30 → the deadline would be 00:30 (inside the window) so it moves to 09:00.
// The user is awake right now, so the card must not claim to be asleep.
await waterTest("2026-11-12T23:30:00", "23:30", { time: "9:00", sleeping: false });
// 14:00 → ordinary daytime deadline, untouched.
await waterTest("2026-11-12T14:00:00", "14:00", { time: "15:00", sleeping: false });

console.log(`\n${checks.filter((c) => c.ok).length}/${checks.length} checks passed`);
const failed = checks.filter((c) => !c.ok).length;
await browser.close();
process.exit(failed === 0 ? 0 : 1);
