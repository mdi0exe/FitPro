/**
 * E2E checks for the "v7" targeted-edit batch:
 *   1. reset_to_defaults / localReset keep exercise history + week anchor,
 *      reset the default programme and clear deload state
 *   2. normalizeState mirrors models.rs AI-diet clamps and expired-swap reset
 *   3. catalog picks fill the real Persian coaching tip in the exercise editor
 *   4. editing / unticking a finished set keeps the per-exercise history honest
 *   5. bus alarm ids use the wide 50,000-bucket space
 *   6. tab history is replaced instead of stacked; header/resume stay in sync
 *   7. MOVEMENT_FA has no duplicate "push up" key
 *
 * Usage: node scripts/e2e-v7.mjs
 * Requires the built app on http://127.0.0.1:4400/.
 */
import fs from "node:fs";
import puppeteer from "puppeteer-core";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const BASE = process.env.APP_URL ?? "http://127.0.0.1:4400/";
const STORAGE_KEY = "persian-hypertrophy::state::v1";
const SNAPSHOT_KEY = "persian-hypertrophy::deload-snapshot";
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

async function ready(page) {
  await page.waitForFunction(
    () => document.querySelectorAll("#nav-slot nav button").length >= 5,
    { timeout: 15000 },
  );
  await wait(550);
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
  await ready(page);
  return { page, errors };
}

async function openSeededPage(stateJson, extras = {}) {
  const page = await browser.newPage();
  const errors = attachErrors(page);
  await page.evaluateOnNewDocument(
    (key, json, extra) => {
      localStorage.setItem(key, json);
      for (const [name, value] of Object.entries(extra)) localStorage.setItem(name, value);
    },
    STORAGE_KEY,
    stateJson,
    extras,
  );
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 20000 });
  await ready(page);
  return { page, errors };
}

const readState = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), STORAGE_KEY);

const goto = async (page, label) => {
  for (const button of await page.$$("#nav-slot nav button")) {
    const text = await button.evaluate((node) => node.textContent ?? "");
    if (text.includes(label)) {
      await button.evaluate((node) => node.click());
      await wait(400);
      return true;
    }
  }
  return false;
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

// ---------------------------------------------------------------------------
// 1. Static source checks
// ---------------------------------------------------------------------------
{
  const rust = readFile("src-tauri/src/lib.rs");
  const local = readFile("src/lib/localBackend.ts");
  const editor = readFile("src/components/exerciseEditor.ts");
  const history = readFile("src/components/exerciseHistory.ts");
  const workout = readFile("src/views/workout.ts");
  const uni = readFile("src/views/uni.ts");
  const nav = readFile("src/lib/navigation.ts");
  const main = readFile("src/main.ts");
  const store = readFile("src/lib/store.ts");
  const library = readFile("scripts/build-exercise-library.mjs");

  check("Rust reset keeps exercise history", rust.includes("fresh.exercise_history = current.exercise_history;"));
  check("Rust reset keeps the week anchor", rust.includes("fresh.semester_week_anchor_date = current.semester_week_anchor_date;"));
  check("Rust reset reselects the default programme", rust.includes("fresh.profile.workout_program_id = crate::models::default_program_id();"));
  check("Rust reset clears the deload flag", rust.includes("fresh.deload_active = false;"));

  check("TS reset keeps exercise history", local.includes("fresh.exerciseHistory = current.exerciseHistory;"));
  check("TS reset keeps the week anchor", local.includes("fresh.semesterWeekAnchorDate = current.semesterWeekAnchorDate;"));
  check("TS reset clears the deload flag", local.includes("fresh.deloadActive = false;"));
  check("TS reset drops the deload snapshot", local.includes(`removeItem("${SNAPSHOT_KEY}")`));

  check("normalizeState clamps AI calories", local.includes("calories >= 1200 && calories <= 5000"));
  check("normalizeState clamps AI protein", local.includes("protein >= 60 && protein <= 320"));
  check("normalizeState caps the meal table", local.includes(".slice(0, 10)") && local.includes("Math.min(3000"));
  check("normalizeState caps coach rules", local.includes(".slice(0, 4)") && local.includes(".slice(0, 6)"));
  check("normalizeState resets expired swaps", local.includes("exercise.swappedDate !== localIso()"));
  check("localLoad persists repaired swaps", local.includes("if (hadExpiredSwap) writeRaw(normalized);"));

  check("editor uses the catalog tip", editor.includes("tipInput.value = item.tip || item.muscle;"));
  check("history exposes a clear-today helper", history.includes("export function clearTodayExerciseHistory"));
  check("set edits refresh history", (workout.match(/if \(log\.done\) recordExerciseHistory\(exercise\);/g) ?? []).length >= 4);
  check("applyToAllSets refreshes history", workout.includes("if (exercise.logs.some((log) => log.done)) recordExerciseHistory(exercise);"));
  check("unticking the last set clears the row", workout.includes("clearTodayExerciseHistory(exercise.id);"));
  check("syncTodayActivity keeps today's record", store.includes("restarting a day does not erase"));

  check("bus alarms use 50,000 buckets", uni.includes("% 50000") && !uni.includes("% 80)"));
  check("pushTab replaces on non-home tabs", nav.includes("history.replaceState({ tab }, \"\")"));
  check("header signature tracks today's study flag", main.includes("completedDates.includes(isoToday())"));
  check("resume flushes a queued save", main.includes("if (hasPendingSave()) await flushNow();"));
  check("store exposes hasPendingSave", store.includes("export function hasPendingSave()"));

  const dupes = (library.match(/\["push up", "شنا"\],/g) ?? []).length;
  check("MOVEMENT_FA has one 'push up' key", dupes === 1, String(dupes));
}

// ---------------------------------------------------------------------------
// Pristine seed
// ---------------------------------------------------------------------------
let baseState;
{
  const { page } = await openPage();
  baseState = await readState(page);
  check("seed state is readable", Boolean(baseState?.days?.length));
  await page.close();
}
const clone = () => JSON.parse(JSON.stringify(baseState));

// ---------------------------------------------------------------------------
// 2. normalizeState clamps + expired swap reset
// ---------------------------------------------------------------------------
{
  const state = clone();
  const today = new Date();
  const iso = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("-");
  const id = state.days[0].exercises[0].id;
  state.diet.customCalories = 99999;
  state.diet.customProtein = 3;
  state.diet.mealTable = Array.from({ length: 12 }, (_, i) => ({
    name: i === 0 ? "   " : `وعده ${i}`,
    kcal: 9999,
    protein: 999,
  }));
  state.diet.coachRules = Array.from({ length: 5 }, (_, i) => ({
    title: `قاعده ${i}`,
    headline: "سرخط",
    points: Array.from({ length: 8 }, (_, j) => `نکته ${j}`),
  }));
  state.exerciseHistory = { [id]: [{ date: iso, weight: 40, reps: 8, setsCompleted: 2 }] };
  state.semesterWeekAnchorDate = "2026-01-01";
  // An expired swap makes localLoad write the normalised state back, so the
  // clamps are observable in localStorage too.
  state.days[0].exercises[0].swappedDate = "2020-01-01";
  state.days[0].exercises[0].originalName = "حرکت جایگزین قدیمی";

  const { page, errors } = await openSeededPage(JSON.stringify(state));
  const saved = await readState(page);
  const first = saved.days[0].exercises[0];
  check("out-of-range AI calories become null", saved.diet.customCalories === null, String(saved.diet.customCalories));
  check("out-of-range AI protein become null", saved.diet.customProtein === null, String(saved.diet.customProtein));
  check("blank meal rows are dropped", saved.diet.mealTable.every((row) => row.name.trim().length > 0));
  check("meal table is capped at 10", saved.diet.mealTable.length === 10, String(saved.diet.mealTable.length));
  check("meal kcal/protein are clamped", saved.diet.mealTable.every((row) => row.kcal <= 3000 && row.protein <= 200));
  check("coach rules are capped at 4", saved.diet.coachRules.length === 4, String(saved.diet.coachRules.length));
  check("each coach rule has at most 6 points", saved.diet.coachRules.every((rule) => rule.points.length === 6));
  check("expired swap is cleared on restore", !first.swappedDate, String(first.swappedDate));
  check("exercise history survives normalization", saved.exerciseHistory?.[id]?.length === 1);
  check("week anchor survives normalization", saved.semesterWeekAnchorDate === "2026-01-01");
  check("no runtime errors (normalize)", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---------------------------------------------------------------------------
// 3. reset_to_defaults keeps history/anchor, clears deload
// ---------------------------------------------------------------------------
{
  const state = clone();
  const id = state.days[0].exercises[0].id;
  const today = new Date();
  const iso = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("-");
  state.exerciseHistory = { [id]: [{ date: iso, weight: 42.5, reps: 10, setsCompleted: 3 }] };
  state.semesterWeekAnchorDate = "2026-02-02";
  state.deloadActive = true;
  state.profile.workoutProgramId = "ppl-6";
  const { page, errors } = await openSeededPage(JSON.stringify(state), {
    [SNAPSHOT_KEY]: JSON.stringify({ "day-1:d1e1": 50 }),
  });
  await goto(page, "مربی");
  const opened = await clickText(page, "بازگردانی برنامه تمرینی به حالت پیش");
  await wait(450);
  // Scope to the overlay: the coach tab still has the "بازگردانی..." trigger
  // behind the dialog, and an unscoped text search would click it again.
  const confirmed = await page.evaluate(() => {
    const node = Array.from(document.querySelectorAll("#overlay-root button")).find((b) =>
      (b.textContent ?? "").trim() === "بازگردانی",
    );
    if (!node) return false;
    node.click();
    return true;
  });
  await wait(700);
  const saved = await readState(page);
  const snapshot = await page.evaluate((key) => localStorage.getItem(key), SNAPSHOT_KEY);
  check("reset button opens the confirmation", opened);
  check("confirmation is clickable", confirmed);
  check("reset keeps the per-exercise charts", saved.exerciseHistory?.[id]?.[0]?.weight === 42.5, JSON.stringify(saved.exerciseHistory?.[id]));
  check("reset keeps the semester anchor", saved.semesterWeekAnchorDate === "2026-02-02", String(saved.semesterWeekAnchorDate));
  check("reset clears the deload flag", saved.deloadActive === false, String(saved.deloadActive));
  check("reset drops the deload snapshot", snapshot === null, String(snapshot));
  check("reset reselects the default programme", saved.profile.workoutProgramId === "upper-lower-4", saved.profile.workoutProgramId);
  check("no runtime errors (reset)", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---------------------------------------------------------------------------
// 4. catalog pick fills the real coaching tip
// ---------------------------------------------------------------------------
{
  const { page, errors } = await openPage();
  const opened = await clickText(page, "افزودن حرکت به این روز");
  await wait(450);
  const pickerOpened = await clickText(page, "انتخاب از کتابخانه حرکات");
  await wait(400);
  const firstRow = await page.$("#overlay-root button[data-catalog-id]");
  if (firstRow) await firstRow.evaluate((node) => node.click());
  await wait(300);
  const tip = await page.$eval("#overlay-root textarea", (node) => node.value).catch(() => "");
  check("add-exercise editor opens", opened);
  check("catalog picker expands", pickerOpened);
  check("a catalog row was selectable", Boolean(firstRow));
  check("catalog tip is a full coaching cue", tip.length > 40, `${tip.length} chars`);
  check("catalog tip is not the short muscle label", tip.length > 12);
  check("no runtime errors (catalog tip)", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---------------------------------------------------------------------------
// 5. per-exercise history follows edits and unticks
// ---------------------------------------------------------------------------
{
  const { page, errors } = await openPage();
  const id = (await readState(page)).days[0].exercises[0].id;
  const rowSel = `[data-row="${id}-1"]`;
  await page.waitForSelector(rowSel, { timeout: 10000 });
  await page.$eval(`${rowSel} button[aria-label="تکمیل ست"]`, (node) => node.click());
  await wait(600);
  const afterTick = await readState(page);
  const ticked = afterTick.exerciseHistory?.[id]?.at(-1);
  check("ticking a set records today's row", Boolean(ticked), JSON.stringify(ticked));

  await page.$eval(`${rowSel} button[aria-label="افزایش"]`, (node) => node.click());
  await wait(600);
  const afterEdit = await readState(page);
  const edited = afterEdit.exerciseHistory?.[id]?.at(-1);
  check(
    "editing a finished set moves the chart point",
    Boolean(edited && edited.weight > ticked.weight),
    `${ticked?.weight} -> ${edited?.weight}`,
  );

  await page.$eval(`${rowSel} button[aria-label="تکمیل ست"]`, (node) => node.click());
  await wait(600);
  const afterUntick = await readState(page);
  check(
    "unticking the last set removes today's row",
    (afterUntick.exerciseHistory?.[id] ?? []).length === 0,
    JSON.stringify(afterUntick.exerciseHistory?.[id]),
  );
  check("no runtime errors (history edits)", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---------------------------------------------------------------------------
// 6. tab history is replaced, not stacked
// ---------------------------------------------------------------------------
{
  const { page, errors } = await openPage();
  const initial = await page.evaluate(() => history.length);
  for (const label of ["تغذیه", "دانشگاه", "مربی", "پیشرفت"]) await goto(page, label);
  const afterHops = await page.evaluate(() => history.length);
  check(
    "tab hops do not stack history entries",
    afterHops <= initial + 1,
    `${initial} -> ${afterHops}`,
  );
  await page.evaluate(() => history.back());
  await wait(500);
  const home = await page.evaluate(() => Boolean(document.querySelector("[data-day-count]")));
  check("one Back press returns to the workout tab", home);
  check("no runtime errors (tab history)", errors.length === 0, errors.join(" | "));
  await page.close();
}

await browser.close();

const passed = checks.filter((entry) => entry.ok).length;
console.log(`\n${passed}/${checks.length} checks passed`);
if (passed !== checks.length) process.exitCode = 1;
