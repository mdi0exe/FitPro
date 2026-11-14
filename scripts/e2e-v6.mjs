/**
 * E2E checks for the "v6" batch:
 *   1. water reminder restarts from NOW whenever a glass is logged
 *      (nutrition tab, workout tab, notification action and native receiver)
 *   2. exact muscle detection for compound Persian leg movements
 *      ("جلو پا" → quads, "پشت پا" → hamstrings) + muscle filter chips
 *   3. one toast only when the curated suggestion replaces an active swap
 *   4. deload weights survive an app restart (localStorage snapshot)
 *   5. the two backup buttons do genuinely different, native work
 *      (MediaStore.Downloads save vs ACTION_SEND share sheet)
 *   6. the exercise GIF fallback points at a real .gif, not a missing .svg
 *
 * Usage: node scripts/e2e-v6.mjs
 * Requires the built app on http://127.0.0.1:4400/.
 */
import fs from "node:fs";
import puppeteer from "puppeteer-core";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const BASE = process.env.APP_URL ?? "http://127.0.0.1:4400/";
const STORAGE_KEY = "persian-hypertrophy::state::v1";
const readFile = (path) => fs.readFileSync(path, "utf8");

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

function attachErrors(page) {
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    if (msg.text().includes("Blocked call to navigator.vibrate")) return;
    errors.push(msg.text());
  });
  return errors;
}

async function openPage() {
  const page = await browser.newPage();
  const errors = attachErrors(page);
  await page.evaluateOnNewDocument(() => {
    if (sessionStorage.getItem("e2e:booted")) return;
    sessionStorage.setItem("e2e:booted", "1");
    localStorage.clear();
  });
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForFunction(
    () => document.querySelectorAll("#nav-slot nav button").length >= 3,
    { timeout: 15000 },
  );
  await wait(550);
  return { page, errors };
}

/** Seeds a state through evaluateOnNewDocument so reloads cannot undo it. */
async function openSeededPage(stateJson, withBridge = false) {
  const page = await browser.newPage();
  const errors = attachErrors(page);
  await page.evaluateOnNewDocument(
    (key, json) => localStorage.setItem(key, json),
    STORAGE_KEY,
    stateJson,
  );
  if (withBridge) {
    await page.evaluateOnNewDocument(() => {
      window.__bridgeCalls = [];
      window.AndroidWater = {
        showWaterNotification() {},
        scheduleWaterNotification() {},
        cancelWaterNotification() {},
        saveBackupToDownloads(name, contents) {
          window.__bridgeCalls.push({
            method: "save",
            name,
            size: contents.length,
          });
          return "/storage/emulated/0/Download/" + name;
        },
        shareBackupFile(name, contents) {
          window.__bridgeCalls.push({
            method: "share",
            name,
            size: contents.length,
          });
          return true;
        },
      };
    });
  }
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForFunction(
    () => document.querySelectorAll("#nav-slot nav button").length >= 3,
    { timeout: 15000 },
  );
  await wait(550);
  return { page, errors };
}

const readState = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), STORAGE_KEY);

const goto = async (page, label) => {
  for (const button of await page.$$("#nav-slot nav button")) {
    const text = await button.evaluate((node) => node.textContent ?? "");
    if (text.includes(label)) {
      await button.evaluate((node) => node.click());
      await wait(450);
      return true;
    }
  }
  return false;
};

const clickAria = async (page, label) => {
  const node = await page.$(`button[aria-label="${label}"]`);
  if (!node) return false;
  await node.evaluate((element) => element.click());
  return true;
};

const clickText = async (page, text) => {
  for (const handle of await page.$$("button")) {
    const content = await handle.evaluate((node) =>
      (node.textContent ?? "").replace(/\s+/g, " ").trim(),
    );
    if (content.includes(text)) {
      await handle.evaluate((node) => node.click());
      return true;
    }
  }
  return false;
};

/** Mirrors src/lib/quietHours.ts so 00:00-09:00 expectations stay honest. */
function quietAdjusted(ms) {
  const date = new Date(ms);
  if (date.getHours() >= 9) return ms;
  date.setHours(9, 0, 0, 0);
  return date.getTime();
}

// ---------------------------------------------------------------------------
// 1. Static source checks (native glue cannot run in a desktop WebView)
// ---------------------------------------------------------------------------
{
  const native = readFile("scripts/setup-android-native.mjs");
  const notify = readFile("src/lib/notify.ts");
  const nutrition = readFile("src/views/nutrition.ts");
  const workout = readFile("src/views/workout.ts");
  const photos = readFile("src/components/progressPhotos.ts");
  const tools = readFile("src/lib/workoutTools.ts");

  check("GIF fallback uses .gif", workout.includes("`/gifs/${exercise.id}.gif`"));
  check("GIF fallback no longer uses .svg", !workout.includes("`${exercise.id}.svg`"));
  check("native save uses MediaStore.Downloads", native.includes("MediaStore.Downloads.EXTERNAL_CONTENT_URI"));
  check("native share uses ACTION_SEND", native.includes("Intent.ACTION_SEND"));
  check("native provider is registered", native.includes('android:name=".BackupFileProvider"'));
  check("provider grants Uri permissions", native.includes('android:grantUriPermissions="true"'));
  check("share sheet sets EXTRA_TITLE", native.includes("putExtra(Intent.EXTRA_TITLE, safeName)"));
  check("MediaStore stream is flushed", native.includes("out.flush()"));
  check("provider getType returns application/json", native.includes('getType(uri: Uri): String = "application/json"'));
  check("notify.ts declares both backup bridge methods", notify.includes("shareBackupFile?:") && notify.includes("saveBackupToDownloads?:"));
  check("progressPhotos accesses the bridge directly", !photos.includes("nativeSaveBackupToDownloads"));
  check("stateFile tolerates filesDir", native.includes("File(context.filesDir"));
  check("stateFile keeps dataDir too", native.includes("File(context.dataDir"));
  check(
    "drink action reschedules the alarm",
    /ACTION_DRINK_ONE[\s\S]{0,400}rescheduleFromState\(context\)/.test(native),
  );
  check("notify.ts bumps the deadline on a glass", notify.includes("bumpWaterDeadlineOnDrink()"));
  check("silent increment mirrors the deadline", notify.includes("state.diet.waterReminderNextAt = Math.trunc(nextAt)"));
  check("nutrition +1 restarts the cycle", nutrition.includes("startNewWaterReminderCycle(state.diet.waterReminderMinutes)"));
  check("workout +1 restarts the cycle", workout.includes("startNewWaterReminderCycle(state.diet.waterReminderMinutes)"));
  check("share failure no longer silently saves", !photos.includes("await saveBackupToDownloads(hint);"));
  check("share button uses the native bridge", photos.includes("nativeBridge.shareBackupFile(name, json)"));
  check("save button uses the native bridge", photos.includes("nativeBridge.saveBackupToDownloads(name, json)"));
  check("muscle phrase table exists", tools.includes("const MUSCLE_KEYWORDS"));
  check("leg compound phrases come before arms", tools.indexOf('"جلو پا"') < tools.indexOf('"جلو بازو"'));
  check("deload snapshot is persisted", tools.includes("DELOAD_SNAPSHOT_KEY"));
}

// ---------------------------------------------------------------------------
// Grab a pristine seed to build the seeded fixtures below
// ---------------------------------------------------------------------------
let baseState;
{
  const { page } = await openPage();
  baseState = await readState(page);
  check("seed state is readable", Boolean(baseState?.days?.length), String(Boolean(baseState)));
  await page.close();
}
const clone = () => JSON.parse(JSON.stringify(baseState));

// ---------------------------------------------------------------------------
// 2. Water timer resets on +1 glass — nutrition tab
// ---------------------------------------------------------------------------
{
  const state = clone();
  state.diet.waterReminderEnabled = true;
  state.diet.waterReminderMinutes = 60;
  state.diet.waterGlasses = 2;
  state.diet.waterReminderNextAt = Date.now() + 45_000; // about to ring
  const before = state.diet.waterReminderNextAt;
  const { page, errors } = await openSeededPage(JSON.stringify(state));
  await goto(page, "تغذیه");
  const clicked = await clickText(page, "لیوان آب خوردم");
  await wait(600);
  const after = await readState(page);
  const expected = quietAdjusted(Date.now() + 60 * 60_000);
  check("nutrition +1 button was clickable", clicked);
  check("nutrition +1 increments the count", after.diet.waterGlasses === 3, String(after.diet.waterGlasses));
  check(
    "nutrition +1 pushes the deadline forward",
    after.diet.waterReminderNextAt > before,
    `${before} -> ${after.diet.waterReminderNextAt}`,
  );
  check(
    "nutrition +1 starts a full 60-minute cycle",
    Math.abs(after.diet.waterReminderNextAt - expected) < 120_000,
    `${Math.round((after.diet.waterReminderNextAt - expected) / 1000)}s drift`,
  );
  check("no runtime errors (nutrition water)", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---------------------------------------------------------------------------
// 3. Water timer resets on +1 glass — workout tab
// ---------------------------------------------------------------------------
{
  const state = clone();
  state.diet.waterReminderEnabled = true;
  state.diet.waterReminderMinutes = 45;
  state.diet.waterGlasses = 1;
  state.diet.waterReminderNextAt = Date.now() + 30_000;
  const before = state.diet.waterReminderNextAt;
  const { page, errors } = await openSeededPage(JSON.stringify(state));
  const clicked = await clickAria(page, "افزودن یک لیوان آب");
  await wait(600);
  const after = await readState(page);
  const expected = quietAdjusted(Date.now() + 45 * 60_000);
  check("workout +1 button was clickable", clicked);
  check("workout +1 increments the count", after.diet.waterGlasses === 2, String(after.diet.waterGlasses));
  check(
    "workout +1 pushes the deadline forward",
    after.diet.waterReminderNextAt > before,
    `${before} -> ${after.diet.waterReminderNextAt}`,
  );
  check(
    "workout +1 starts a full 45-minute cycle",
    Math.abs(after.diet.waterReminderNextAt - expected) < 120_000,
    `${Math.round((after.diet.waterReminderNextAt - expected) / 1000)}s drift`,
  );
  check("no runtime errors (workout water)", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---------------------------------------------------------------------------
// 4. Muscle detection — "جلو پا" must never show "جلو بازو" alternatives
// ---------------------------------------------------------------------------
for (const [name, query, expectedLabel] of [
  ["جلو پا دستگاه", "Leg Extension gif", "چهارسر ران"],
  ["پشت پا دستگاه", "Leg Curl gif", "همسترینگ"],
  ["پرس پا دستگاه", "Leg Press gif", "چهارسر ران"],
]) {
  const state = clone();
  const first = state.days[0].exercises[0];
  first.name = name;
  first.query = query;
  // Clear any catalog GIF so detection falls through to the phrase rules.
  first.gifUrl = null;
  delete first.originalGifUrl;
  const { page, errors } = await openSeededPage(JSON.stringify(state));
  await page.waitForSelector("article[data-exercise]", { timeout: 10000 });
  const opened = await clickAria(page, "حرکت جایگزین");
  await wait(500);
  const desc = await page.$eval("#overlay-root", (node) => node.textContent ?? "");
  const activeChip = await page.$$eval(
    "#overlay-root button[aria-label^='فیلتر ']",
    (nodes) => nodes.filter((n) => n.className.includes("border-emerald-400/60")).map((n) => n.getAttribute("aria-label")),
  );
  const rows = await page.$$eval("#overlay-root button[aria-label^='انتخاب ']", (nodes) =>
    nodes.map((n) => n.getAttribute("aria-label") ?? ""),
  );
  check(`picker opens for «${name}»`, opened);
  check(
    `«${name}» resolves to ${expectedLabel}`,
    desc.includes(expectedLabel) && activeChip.length === 1 && activeChip[0] === `فیلتر ${expectedLabel}`,
    `chips=${activeChip.join(",")}`,
  );
  check(`«${name}» offers several same-muscle rows`, rows.length >= 5, String(rows.length));
  check(
    `«${name}» never offers arm movements`,
    rows.every((r) => !r.includes("بازو")),
    rows.filter((r) => r.includes("بازو")).join(", "),
  );
  // Browsing another group is possible via the chips.
  const switched = await clickAria(page, "فیلتر سینه");
  await wait(300);
  const heading = switched
    ? await page.$eval("#overlay-root", (node) => node.textContent ?? "")
    : "";
  check(`muscle chips switch the list for «${name}»`, switched && heading.includes("همه حرکت"), String(switched));
  check(`no runtime errors (muscle «${name}»)`, errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---------------------------------------------------------------------------
// 5. Only one toast when the curated suggestion replaces an active swap
// ---------------------------------------------------------------------------
{
  const { page, errors } = await openPage();
  await page.waitForSelector("article[data-exercise]", { timeout: 10000 });
  await clickAria(page, "حرکت جایگزین");
  await wait(450);
  const first = await clickAria(page, "جایگزین پیشنهادی");
  await wait(450);
  await clickAria(page, "حرکت جایگزین");
  await wait(450);
  const second = await clickAria(page, "جایگزین پیشنهادی");
  await wait(400);
  const toastCount = await page.$$eval("#toast-root > div", (nodes) => nodes.length);
  check("curated suggestion clickable twice", first && second, `${first}/${second}`);
  check("two picks produce at most two toasts (no double toast)", toastCount <= 2, String(toastCount));
  const state = await readState(page);
  check("second pick still keeps a way back", Boolean(state.days[0].exercises[0].originalName));
  check("no runtime errors (double toast)", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---------------------------------------------------------------------------
// 6. Deload snapshot survives a restart
// ---------------------------------------------------------------------------
{
  const { page, errors } = await openPage();
  const before = (await readState(page)).days[0].exercises[0].targetWeight;
  await clickText(page, "هفته ریکاوری");
  await wait(500);
  const during = (await readState(page)).days[0].exercises[0].targetWeight;
  check("deload lowers the working weight", during < before, `${before} -> ${during}`);
  const snapshot = await page.evaluate(() =>
    localStorage.getItem("persian-hypertrophy::deload-snapshot"),
  );
  check(
    "deload snapshot is in localStorage",
    Boolean(snapshot && snapshot.startsWith("{") && snapshot.length > 10),
    String(snapshot).slice(0, 60),
  );

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelectorAll("#nav-slot nav button").length >= 3);
  await wait(500);
  await clickText(page, "ریکاوری فعال");
  await wait(500);
  const restored = (await readState(page)).days[0].exercises[0].targetWeight;
  check(
    "leaving deload restores the exact weight after a restart",
    restored === before,
    `${before} -> ${during} -> ${restored}`,
  );
  const cleared = await page.evaluate(() =>
    localStorage.getItem("persian-hypertrophy::deload-snapshot"),
  );
  check("deload snapshot is cleared on exit", cleared === null, String(cleared));
  check("no runtime errors (deload)", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---------------------------------------------------------------------------
// 7. The two backup buttons call DIFFERENT native methods
// ---------------------------------------------------------------------------
{
  const { page, errors } = await openSeededPage(JSON.stringify(clone()), true);
  await goto(page, "مربی");
  await wait(300);
  const shareClicked = await clickAria(page, "اشتراکگذاری فایل پشتیبان");
  await wait(350);
  const shareCalls = await page.evaluate(() => window.__bridgeCalls.slice());
  check("share button is clickable", shareClicked);
  check(
    "share button opens the native share sheet",
    shareCalls.length === 1 && shareCalls[0].method === "share",
    JSON.stringify(shareCalls),
  );
  check("share button sends real JSON content", shareCalls[0]?.size > 1000, String(shareCalls[0]?.size));

  await page.evaluate(() => (window.__bridgeCalls = []));
  const saveClicked = await clickAria(page, "ذخیره پشتیبان در Download");
  await wait(350);
  const saveCalls = await page.evaluate(() => window.__bridgeCalls.slice());
  check("Download button is clickable", saveClicked);
  check(
    "Download button writes through MediaStore, not the share sheet",
    saveCalls.length === 1 && saveCalls[0].method === "save",
    JSON.stringify(saveCalls),
  );
  const hint = await page.$eval("#view", (node) => node.textContent ?? "");
  check("Download button reports a public path", hint.includes("/storage/emulated/0/Download/"));
  check("no runtime errors (native backup)", errors.length === 0, errors.join(" | "));
  await page.close();
}

await browser.close();

const passed = checks.filter((entry) => entry.ok).length;
console.log(`\n${passed}/${checks.length} checks passed`);
if (passed !== checks.length) process.exitCode = 1;
