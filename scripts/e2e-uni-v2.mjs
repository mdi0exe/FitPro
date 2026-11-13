/**
 * E2E checks for the "university v2" batch:
 *   1. re-render without a full-page flash (header kept, no entrance animation)
 *   2. editable MSc timetable (* / ** weeks, add / edit / delete)
 *   3. daily language study (checkmark, timer, reminder time)
 *   4. shuttle table replaced from an AI JSON (and reset to default)
 *   5. water toast action (+1 glass from the in-app banner)
 *
 * Usage: node scripts/e2e-uni-v2.mjs
 * Requires the built app on http://127.0.0.1:4400/.
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

async function openPage(frozen = null) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    // Chrome's vibration policy warning is not an app error.
    if (msg.text().includes("Blocked call to navigator.vibrate")) return;
    errors.push(msg.text());
  });
  // Clear only on the tab's first load: `sessionStorage` survives reloads, so a
  // test that reloads keeps the state it just patched.
  await page.evaluateOnNewDocument(() => {
    if (sessionStorage.getItem("e2e:booted")) return;
    sessionStorage.setItem("e2e:booted", "1");
    localStorage.clear();
  });
  if (frozen) await page.evaluateOnNewDocument(freezeClock(frozen));
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForFunction(
    () => document.querySelectorAll("#nav-slot nav button").length >= 5,
    { timeout: 15000 },
  );
  await wait(600);
  return { page, errors };
}

const readState = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("persian-hypertrophy::state::v1") ?? "null"));

/** DOM click (never a coordinate click: the bottom nav sits on top of content). */
const clickText = async (page, text, scope = null) => {
  const root = scope ?? (await page.$("#app"));
  const handles = await root.$$("button");
  for (const handle of handles) {
    const content = await handle.evaluate((node) => node.textContent?.trim() ?? "");
    if (content === text || content.includes(text)) {
      await handle.evaluate((node) => node.click());
      return true;
    }
  }
  return false;
};

const clickSelector = async (page, selector) => {
  const node = await page.$(selector);
  if (!node) return false;
  await node.evaluate((el) => el.click());
  return true;
};

const goToUni = async (page) => {
  const nav = await page.$$("#nav-slot nav button");
  await nav[3].click();
  await wait(700);
};

// ---------------------------------------------------------------------------
// 1. No full-page flash on an in-tab re-render
// ---------------------------------------------------------------------------
{
  const { page, errors } = await openPage();

  await page.evaluate(() => {
    const header = document.getElementById("header-slot")?.firstElementChild;
    if (header) header.setAttribute("data-test-mark", "keep-me");
    window.scrollTo(0, 420);
  });
  await wait(400);
  // Read after the frame: `scrollY` right after `scrollTo` is not reliable.
  const scrollBefore = await page.evaluate(() => Math.round(window.scrollY));

  // The swap button opens the picker; its curated row then triggers a full
  // `requestRender()` from inside the same tab.
  await clickSelector(page, 'button[aria-label="حرکت جایگزین"]');
  await wait(400);
  await clickSelector(page, 'button[aria-label="جایگزین پیشنهادی"]');
  await wait(700);

  const after = await page.evaluate(() => {
    const header = document.getElementById("header-slot")?.firstElementChild;
    const view = document.querySelector("#view > div");
    return {
      headerKept: header?.getAttribute("data-test-mark") === "keep-me",
      animated: view?.classList.contains("animate-fade-up") ?? true,
      scrollY: Math.round(window.scrollY),
    };
  });

  check("header is not rebuilt on an in-tab update", after.headerKept);
  check("entrance animation does not replay", after.animated === false);
  check(
    "scroll position survives the re-render",
    Math.abs(after.scrollY - scrollBefore) <= 2,
    `${scrollBefore}px -> ${after.scrollY}px`,
  );

  // Switching tabs must still animate (it is a real navigation).
  await page.evaluate(() => window.scrollTo(0, 0));
  const nav = await page.$$("#nav-slot nav button");
  await nav[2].click();
  await wait(600);
  const tabAnimated = await page.evaluate(
    () => document.querySelector("#view > div")?.classList.contains("animate-fade-up") ?? false,
  );
  check("tab switch still plays the entrance animation", tabAnimated);

  check("no runtime errors (render)", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---------------------------------------------------------------------------
// 2. Editable MSc timetable
// ---------------------------------------------------------------------------
{
  const { page, errors } = await openPage();
  await goToUni(page);

  let saved = await readState(page);
  check("timetable is seeded with 6 sessions", saved.courses.length === 6, String(saved.courses.length));
  check("default week type is odd (*)", saved.semesterWeekType === "odd", saved.semesterWeekType);

  const cardText = await page.$eval("#view", (node) => node.textContent);
  check("class schedule card renders", cardText.includes("برنامه هفتگی کلاس‌ها"));
  check("professor names are shown", cardText.includes("د. فرجی") && cardText.includes("د. بدری"));

  const editButtons = await page.$$('button[aria-label^="ویرایش "]');
  check("every session has an edit button", editButtons.length === 6, String(editButtons.length));

  // Move to the even (**) week: the odd-only VLSI class must grey out.
  // The manual switch is gone — parity now comes from the term anchor date, so
  // the test advances the anchor by one week instead.
  const openedAnchor = await clickSelector(page, 'button[aria-label="تنظیم شماره هفته ترم"]');
  check("term week modal opens", openedAnchor === true);
  await wait(400);
  await clickSelector(page, 'button[aria-label="هفته بعد"]');
  await wait(250);
  // The modal lives in `#overlay-root`, outside `#app`, so the text search has
  // to be scoped to it.
  await clickText(page, "ذخیره", await page.$("#overlay-root"));
  await wait(600);
  saved = await readState(page);
  check(
    "term anchor date is stored",
    typeof saved.semesterWeekAnchorDate === "string" && saved.semesterWeekAnchorDate.length === 10,
    String(saved.semesterWeekAnchorDate),
  );
  check("week parity is derived", saved.semesterWeekType === "even", saved.semesterWeekType);
  const evenText = await page.$eval("#view", (node) => node.textContent);
  check("odd-week class is marked as not this week", evenText.includes("این هفته تشکیل نمی‌شود"));

  // ------------------------------------------------------------ add
  await clickSelector(page, 'button[aria-label="افزودن درس"]');
  await wait(500);
  const inputs = await page.$$("#overlay-root input");
  check("course editor opens with two inputs", inputs.length === 2, String(inputs.length));
  await inputs[0].click();
  await page.keyboard.type("پردازش سیگنال دیجیتال");
  await inputs[1].click();
  await page.keyboard.type("د. رضایی");
  await clickText(page, "چهارشنبه", await page.$("#overlay-root"));
  await clickText(page, "۱۴:۰۰–۱۶:۰۰", await page.$("#overlay-root"));
  await clickText(page, "افزودن درس", await page.$("#overlay-root"));
  await wait(700);

  saved = await readState(page);
  check("course is added", saved.courses.length === 7, String(saved.courses.length));
  const added = saved.courses.find((course) => course.name === "پردازش سیگنال دیجیتال");
  check("added course keeps day/time/professor", Boolean(added) && added.dayOfWeek === 3 && added.startTime === "14:00" && added.professor === "د. رضایی", JSON.stringify(added ?? {}));

  // ------------------------------------------------------------ edit
  const addedIndex = saved.courses.findIndex((course) => course.name === "پردازش سیگنال دیجیتال");
  const editAll = await page.$$('button[aria-label^="ویرایش "]');
  await editAll[addedIndex].evaluate((node) => node.click());
  await wait(500);
  const editInputs = await page.$$("#overlay-root input");
  await editInputs[0].evaluate((node) => {
    node.value = "";
  });
  await editInputs[0].click();
  await page.keyboard.type("پردازش سیگنال");
  await clickText(page, "ذخیره تغییرات", await page.$("#overlay-root"));
  await wait(700);
  saved = await readState(page);
  check(
    "course edit is saved",
    saved.courses.some((course) => course.name === "پردازش سیگنال"),
    saved.courses.map((course) => course.name).join(" | "),
  );

  // ------------------------------------------------------------ delete
  const editAll2 = await page.$$('button[aria-label^="ویرایش "]');
  const targetIndex = saved.courses.findIndex((course) => course.name === "پردازش سیگنال");
  await editAll2[targetIndex].evaluate((node) => node.click());
  await wait(500);
  await clickText(page, "حذف", await page.$("#overlay-root"));
  await wait(500);
  await clickText(page, "حذف کن", await page.$("#overlay-root"));
  await wait(700);
  saved = await readState(page);
  check("course delete is saved", saved.courses.length === 6, String(saved.courses.length));

  check("no runtime errors (timetable)", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---------------------------------------------------------------------------
// 3. Daily language study
// ---------------------------------------------------------------------------
{
  const { page, errors } = await openPage();
  await goToUni(page);

  let saved = await readState(page);
  check("language defaults are seeded", saved.languageStudy.reminderTime === "20:30" && saved.languageStudy.targetMinutes === 60, JSON.stringify(saved.languageStudy));

  const uniText = await page.$eval("#view", (node) => node.textContent);
  check("language card renders", uniText.includes("مطالعه روزانه زبان"));

  // Checkmark.
  await clickSelector(page, 'button[aria-label="ثبت مطالعه زبان امروز"]');
  await wait(600);
  saved = await readState(page);
  const today = await page.evaluate(() => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
  check("daily checkmark is recorded", saved.languageStudy.completedDates.includes(today), String(saved.languageStudy.completedDates));

  // Timer.
  await clickSelector(page, 'button[aria-label="شروع یا توقف تایمر زبان"]');
  await wait(400);
  const runningLabel = await page.evaluate(() => {
    const node = [...document.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") ?? "") === "شروع یا توقف تایمر زبان");
    return node?.textContent ?? "";
  });
  check("timer starts", runningLabel.includes("توقف"), runningLabel);
  await clickSelector(page, 'button[aria-label="شروع یا توقف تایمر زبان"]');
  await wait(400);
  const pausedLabel = await page.evaluate(() => {
    const node = [...document.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") ?? "") === "شروع یا توقف تایمر زبان");
    return node?.textContent ?? "";
  });
  check("timer pauses", pausedLabel.includes("شروع"), pausedLabel);

  // Target duration.
  await clickText(page, "۳۰ دقیقه");
  await wait(600);
  saved = await readState(page);
  check("session length is saved", saved.languageStudy.targetMinutes === 30, String(saved.languageStudy.targetMinutes));
  const clockText = await page.evaluate(
    () => document.querySelector("[data-lang-clock]")?.textContent ?? "",
  );
  check("timer resets to the new length", clockText.startsWith("۳۰"), clockText);

  // Reminder time preset.
  await clickText(page, "ساعت ۱۹:۰۰");
  await wait(700);
  saved = await readState(page);
  check("reminder time is saved", saved.languageStudy.reminderTime === "19:00", saved.languageStudy.reminderTime);
  check("reminder is enabled by the preset", saved.languageStudy.reminderEnabled === true);

  // +15 minutes stepper.
  await clickText(page, "‎+۱۵ دقیقه");
  await wait(600);
  saved = await readState(page);
  check("minute stepper shifts the reminder", saved.languageStudy.reminderTime === "19:15", saved.languageStudy.reminderTime);

  check("no runtime errors (language)", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---------------------------------------------------------------------------
// 4. Shuttle table from an AI JSON
// ---------------------------------------------------------------------------
{
  const { page, errors } = await openPage();
  await goToUni(page);

  await clickSelector(page, 'button[aria-label="بروزرسانی سرویس‌ها با هوش مصنوعی"]');
  await wait(500);
  const area = await page.$("#overlay-root textarea");
  check("AI import sheet opens", Boolean(area));

  // Invalid JSON must be rejected without touching the stored table.
  await area.evaluate((node) => {
    node.value = "{ this is not json";
  });
  await clickText(page, "💾 ذخیره و اعمال", await page.$("#overlay-root"));
  await wait(500);
  let saved = await readState(page);
  check("invalid JSON is rejected", saved.customShuttleJson === null, String(saved.customShuttleJson));

  // Valid JSON with a unique time replaces the table.
  const imported = JSON.stringify({
    effectiveDate: "1406/01/15",
    railway: {
      "sun-wed": { title: "یکشنبه تا چهارشنبه (جدید)", fromRailway: ["07:07"], fromUni: ["17:17"] },
      sat: { title: "شنبه‌ها", fromRailway: ["08:15"], fromUni: ["09:30"] },
      thu: { title: "پنجشنبه‌ها", fromRailway: ["08:15"], fromUni: ["09:30"] },
      fri: { title: "جمعه‌ها", fromRailway: ["09:00"], fromUni: ["10:00"] },
    },
    suburbs: [
      { id: "khosro-to-uni", route: "خسروشهر ← دانشگاه", direction: "تست", times: ["06:06"] },
    ],
  });
  await area.evaluate((node, value) => {
    node.value = value;
  }, imported);
  await clickText(page, "💾 ذخیره و اعمال", await page.$("#overlay-root"));
  await wait(800);

  saved = await readState(page);
  check("valid JSON is stored", typeof saved.customShuttleJson === "string", String(saved.customShuttleJson).slice(0, 20));
  const viewText = await page.$eval("#view", (node) => node.textContent);
  check("hero shows the imported effective date", viewText.includes("1406/01/15"), "1406/01/15");

  // The table itself reads the imported times.
  await clickText(page, "یکشنبه تا چهارشنبه");
  await wait(600);
  const tableText = await page.$eval("#view", (node) => node.textContent);
  check("table shows the imported departure times", tableText.includes("۰۷:۰۷") && tableText.includes("۱۷:۱۷"));

  // Reset back to the published table.
  await clickSelector(page, 'button[aria-label="بروزرسانی سرویس‌ها با هوش مصنوعی"]');
  await wait(500);
  await clickText(page, "بازگشت به پیش‌فرض", await page.$("#overlay-root"));
  await wait(500);
  await clickText(page, "بازگردان", await page.$("#overlay-root"));
  await wait(700);
  saved = await readState(page);
  check("reset restores the default table", saved.customShuttleJson === null, String(saved.customShuttleJson));

  check("no runtime errors (shuttle)", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---------------------------------------------------------------------------
// 5. Water toast action (+1 glass from the in-app banner)
// ---------------------------------------------------------------------------
{
  // 14:00 so the reminder is not inside the 00:00–09:00 sleep window.
  const { page, errors } = await openPage("2026-11-13T14:00:00");

  // Arm a deadline that already passed: boot fires the reminder once. The patch
  // has to land at document start, otherwise the outgoing page's flush wins.
  await page.evaluateOnNewDocument(() => {
    const key = "persian-hypertrophy::state::v1";
    const raw = JSON.parse(localStorage.getItem(key) ?? "null");
    if (!raw) return;
    raw.diet.waterReminderEnabled = true;
    raw.diet.waterReminderMinutes = 60;
    raw.diet.waterReminderNextAt = Date.now() - 60_000;
    raw.diet.waterGlasses = 2;
    localStorage.setItem(key, JSON.stringify(raw));
  });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForFunction(
    () => document.querySelectorAll("#nav-slot nav button").length >= 5,
    { timeout: 15000 },
  );
  await wait(1200);

  const toastText = await page.evaluate(
    () => document.getElementById("toast-root")?.textContent ?? "",
  );
  check("water alert shows an action toast", toastText.includes("+۱ آب خوردم"), toastText.slice(0, 60));

  const clicked = await clickText(page, "+۱ آب خوردم 💧", await page.$("#toast-root"));
  await wait(700);
  const saved = await readState(page);
  check("toast action button is clickable", clicked);
  check("toast action logs one glass", saved.diet.waterGlasses === 3, String(saved.diet.waterGlasses));

  check("no runtime errors (water action)", errors.length === 0, errors.join(" | "));
  await page.close();
}

console.log(`\n${checks.filter((c) => c.ok).length}/${checks.length} checks passed`);
const failed = checks.filter((c) => !c.ok).length;
await browser.close();
process.exit(failed === 0 ? 0 : 1);
