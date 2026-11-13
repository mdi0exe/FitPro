/**
 * E2E checks for the "v3" batch:
 *   1. first-run wizard + one-tap developer preset
 *   2. Light Mode toggle (persisted across reload)
 *   3. modular app modes (uni_only / gym_only hide their tabs)
 *   4. five workout templates (3/4/6-day, dorm, cut) with offline GIFs
 *   5. water reminder switch pill
 *   6. student diet templates + custom meal add/remove + cut macros
 *   7. university: food reservation weekday, editable study goal, JSON share
 *   8. coach settings entry points
 *
 * Usage: node scripts/e2e-v3.mjs
 * Requires the built app on http://127.0.0.1:4400/.
 */
import puppeteer from "puppeteer-core";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const BASE = process.env.APP_URL ?? "http://127.0.0.1:4400/";
const STORAGE_KEY = "persian-hypertrophy::state::v1";

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

async function openPage(query = "") {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    if (msg.text().includes("Blocked call to navigator.vibrate")) return;
    errors.push(msg.text());
  });
  await page.evaluateOnNewDocument(() => {
    if (sessionStorage.getItem("e2e:booted")) return;
    sessionStorage.setItem("e2e:booted", "1");
    localStorage.clear();
  });
  await page.goto(BASE + query, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForFunction(
    () => document.querySelectorAll("#nav-slot nav button").length >= 3,
    { timeout: 15000 },
  );
  await wait(550);
  return { page, errors };
}

const readState = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), STORAGE_KEY);

const clickText = async (page, text, exact = false) => {
  const handles = await page.$$("button");
  for (const handle of handles) {
    const content = await handle.evaluate((node) =>
      (node.textContent ?? "").replace(/\s+/g, " ").trim(),
    );
    if (exact ? content === text : content.includes(text)) {
      await handle.evaluate((node) => node.click());
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

const closeModal = (page) =>
  page.evaluate(() => {
    document.querySelector("#overlay-root button[aria-label='بستن']")?.click();
  });

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

const navLabels = (page) =>
  page.$$eval("#nav-slot nav button", (nodes) =>
    nodes.map((node) => (node.textContent ?? "").replace(/\s+/g, " ").trim()),
  );

// ---------------------------------------------------------------------------
// 1. First-run wizard + developer preset
// ---------------------------------------------------------------------------
{
  const { page, errors } = await openPage("?onboarding=1");
  const wizardOpen = await page.$eval("#overlay-root", (node) =>
    node.textContent.includes("تنظیم سریع برنامه"),
  );
  check("first-run wizard opens", wizardOpen);
  check(
    "wizard offers the developer preset",
    Boolean(await page.$('button[aria-label="پروفایل پیشفرض توسعه دهنده"]')),
  );

  // Press the one-tap preset.
  await clickAria(page, "پروفایل پیشفرض توسعه دهنده");
  await wait(700);
  let saved = await readState(page);
  check("preset sets Tabriz university", saved.profile.universityName === "دانشگاه صنعتی تبریز", saved.profile.universityName);
  check("preset selects 4-day plan", saved.profile.workoutProgramId === "upper-lower-4" && saved.days.length === 4, `${saved.days.length} days`);
  check("preset restores 6 MSc sessions + built-in shuttle", saved.courses.length === 6 && saved.customShuttleJson === null);
  check("preset marks onboarding complete", saved.onboardingCompleted === true);
  // The rest timer lives in #overlay-root too, so check the sheet itself.
  check("wizard closed after preset", !(await page.$('button[aria-label="پروفایل پیشفرض توسعه دهنده"]')));

  check("no runtime errors (wizard)", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---------------------------------------------------------------------------
// 2. Light Mode
// ---------------------------------------------------------------------------
{
  const { page, errors } = await openPage();
  check("starts in dark mode", await page.evaluate(() => !document.documentElement.classList.contains("theme-light")));
  check("header has a theme button", Boolean(await page.$('button[aria-label="تغییر حالت روشن یا تیره"]')));
  await clickAria(page, "تغییر حالت روشن یا تیره");
  await wait(650);
  check("html gets theme-light", await page.evaluate(() => document.documentElement.classList.contains("theme-light")));
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check("body background turns light", bg === "rgb(241, 245, 249)", bg);
  const persisted = await readState(page);
  check("theme is persisted", persisted.theme === "light", persisted.theme);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelectorAll("#nav-slot nav button").length >= 3);
  await wait(550);
  check("light mode survives a reload", await page.evaluate(() => document.documentElement.classList.contains("theme-light")));
  await clickAria(page, "تغییر حالت روشن یا تیره");
  await wait(550);
  check("can switch back to dark", await page.evaluate(() => !document.documentElement.classList.contains("theme-light")));
  check("no runtime errors (theme)", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---------------------------------------------------------------------------
// 3. Modular modes + workout templates
// ---------------------------------------------------------------------------
{
  const { page, errors } = await openPage();
  await goto(page, "مربی");
  check("coach has the setup button", Boolean(await page.$('button[aria-label="تغییر پروفایل و حالت برنامه"]')));
  await clickAria(page, "تغییر پروفایل و حالت برنامه");
  await wait(400);
  let wizard = await page.$eval("#overlay-root", (node) => node.textContent);
  check("wizard lists 5 workout templates",
    ["۴ روزه بالاتنه", "۳ روزه کل بدن", "۶ روزه", "خوابگاه", "چربیسوزی"].every((t) => wizard.includes(t)),
    wizard.slice(0, 80));

  // University-only: hide workout + progress tabs.
  await clickText(page, "فقط دانشگاه و برنامهریزی");
  await wait(200);
  const gymHidden = await page.$eval("#overlay-root", (node) => {
    const section = [...node.querySelectorAll("div")].find((d) => d.className.includes("space-y-3") && d.textContent.includes("انتخاب برنامه تمرینی"));
    return section ? section.classList.contains("hidden") : false;
  });
  check("uni_only hides the workout picker", gymHidden);
  await clickAria(page, "ذخیره و ورود به برنامه");
  await wait(700);

  let saved = await readState(page);
  check("appMode saved as uni_only", saved.appMode === "uni_only", saved.appMode);
  const labels = await navLabels(page);
  check("uni_only shows exactly 3 tabs", labels.length === 3, labels.join(" | "));
  check("uni_only hides workout/progress", !labels.some((l) => l.includes("تمرین") || l.includes("پیشرفت")), labels.join(" | "));
  const header = await page.$eval("header", (node) => node.textContent);
  check("uni_only header shows campus + study", header.includes("دانشگاه من") && header.includes("مطالعه"), header.slice(0, 90));

  // Switch to a 3-day full-body plan in full mode.
  await clickAria(page, "تنظیم پروفایل و حالت برنامه");
  await wait(350);
  await clickText(page, "حالت کامل (دانشگاه + ورزش");
  await wait(200);
  await clickText(page, "۳ روزه کل بدن");
  await wait(200);
  await clickAria(page, "ذخیره و ورود به برنامه");
  await wait(800);
  saved = await readState(page);
  check("fullbody-3 replaces the days", saved.days.length === 3 && saved.days[0].id === "fb-1", saved.days.map((d) => d.id).join(","));
  check("fullbody-3 keeps offline GIFs", saved.days.every((d) => d.exercises.every((e) => e.gifUrl && e.gifUrl.endsWith(".gif"))));
  check("fullbody-3 logs match sets", saved.days.every((d) => d.exercises.every((e) => e.logs.length === e.sets)));
  check("program id + rest saved", saved.profile.workoutProgramId === "fullbody-3" && saved.restSeconds === 90);
  check("full mode restores all 5 tabs", (await navLabels(page)).length === 5);
  const header3 = await page.$eval("header", (node) => node.textContent);
  check("header shows the 3-day label", header3.includes("۳ روز در هفته"), header3.slice(0, 80));

  // Gym-only hides the university tab.
  await clickAria(page, "تنظیم پروفایل و حالت برنامه");
  await wait(350);
  await clickText(page, "فقط ورزش و تغذیه");
  await wait(200);
  await clickAria(page, "ذخیره و ورود به برنامه");
  await wait(700);
  const gymLabels = await navLabels(page);
  check("gym_only hides university tab", gymLabels.length === 4 && !gymLabels.some((l) => l.includes("دانشگاه")), gymLabels.join(" | "));
  check("no runtime errors (modes)", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---------------------------------------------------------------------------
// 4. Water switch pill + diet templates / custom meals / cut macros
// ---------------------------------------------------------------------------
{
  const { page, errors } = await openPage();
  await goto(page, "تغذیه");

  const sw = await page.$('button[role="switch"][aria-label="یادآور آب"]');
  check("water reminder is a standard switch", Boolean(sw));
  const switchInfo = await page.evaluate(() => {
    const node = document.querySelector('button[role="switch"][aria-label="یادآور آب"]');
    return {
      pill: node?.className.includes("toggle-switch"),
      thumb: Boolean(node?.querySelector(".toggle-switch-thumb")),
      checked: node?.getAttribute("aria-checked"),
      width: Math.round(node?.getBoundingClientRect().width ?? 0),
      height: Math.round(node?.getBoundingClientRect().height ?? 0),
    };
  });
  check("switch has pill + thumb", switchInfo.pill && switchInfo.thumb, JSON.stringify(switchInfo));
  check("switch is not squashed (52x28)", switchInfo.width === 52 && switchInfo.height === 28, `${switchInfo.width}x${switchInfo.height}`);
  check("switch starts off", switchInfo.checked === "false");
  await sw.evaluate((node) => node.click());
  await wait(600);
  const after = await page.evaluate(() => ({
    checked: document.querySelector('button[role="switch"][aria-label="یادآور آب"]')?.getAttribute("aria-checked"),
    on: document.querySelector(".toggle-switch")?.classList.contains("is-on"),
  }));
  check("switch enables the reminder", after.checked === "true" && after.on, JSON.stringify(after));

  const beforeCount = (await readState(page)).diet.items.length;
  check("home template applies", await clickText(page, "ناهار دانشگاه + خانه"));
  await wait(650);
  let saved = await readState(page);
  check("template changes the first meal", saved.diet.items[0].text.includes("صبحانه در خانه"), saved.diet.items[0].text);
  check("water row survives a template switch", saved.diet.items.some((i) => i.id === "diet-4"));
  check("template keeps the row count", saved.diet.items.length === beforeCount, `${beforeCount} → ${saved.diet.items.length}`);

  // Add a custom supplement and then remove it.
  await clickAria(page, "افزودن وعده یا مکمل دلخواه");
  await wait(350);
  await clickText(page, "کراتین ۵ گرم بعد از تمرین");
  await wait(150);
  await clickAria(page, "تایید افزودن وعده دلخواه");
  await wait(650);
  saved = await readState(page);
  const custom = saved.diet.items.find((i) => i.id.startsWith("custom-"));
  check("custom supplement is added", Boolean(custom), JSON.stringify(custom?.text ?? null));
  check("custom row count grows by one", saved.diet.items.length === beforeCount + 1);
  if (custom) {
    const deleted = await clickAria(page, `حذف ${custom.text}`);
    await wait(600);
    saved = await readState(page);
    check("custom supplement can be deleted", deleted && !saved.diet.items.some((i) => i.id === custom.id));
  } else {
    check("custom supplement can be deleted", false, "no custom row found");
  }

  // Custom rows survive a template change.
  await clickAria(page, "افزودن وعده یا مکمل دلخواه");
  await wait(300);
  await clickText(page, "کراتین ۵ گرم بعد از تمرین");
  await wait(120);
  await clickAria(page, "تایید افزودن وعده دلخواه");
  await wait(550);
  await clickText(page, "کاهش وزن و کات");
  await wait(650);
  saved = await readState(page);
  check("custom rows survive template switch", saved.diet.items.some((i) => i.id.startsWith("custom-")));

  // Cut macros: target below current weight → 28 kcal/kg and 1.8 g/kg.
  // The app flushes its in-memory state on `pagehide`, which would overwrite
  // the fixture; block writes for the duration of the reload (same trick as
  // e2e-water.mjs).
  await page.evaluate((key) => {
    const raw = JSON.parse(localStorage.getItem(key));
    raw.profile.currentWeight = 80;
    raw.profile.targetWeight = 70;
    const original = Storage.prototype.setItem;
    original.call(localStorage, key, JSON.stringify(raw));
    Storage.prototype.setItem = function (name, value) {
      if (name === key) return;
      return original.call(this, name, value);
    };
  }, STORAGE_KEY);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelectorAll("#nav-slot nav button").length >= 3);
  await goto(page, "تغذیه");
  await wait(500);
  const macroText = await page.$eval("main", (node) => node.textContent);
  check("cut uses 28 kcal/kg", macroText.includes("۲۲۴۰ کالری"), `80*28=2240`);
  check("cut uses 1.8 g/kg protein", macroText.includes("۱۴۴ گرم"), `80*1.8=144`);
  check("no runtime errors (nutrition)", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---------------------------------------------------------------------------
// 5. University: weekday, study goal, share/import JSON
// ---------------------------------------------------------------------------
{
  const { page, errors } = await openPage();
  await goto(page, "دانشگاه");

  check("food weekday chips render", Boolean(await page.$('button[aria-label="روز رزرو سلف چهارشنبه"]')));
  await clickAria(page, "روز رزرو سلف چهارشنبه");
  await wait(650);
  let saved = await readState(page);
  check("food reminder day is saved", saved.uniReminders.foodReminderDay === 3, String(saved.uniReminders.foodReminderDay));

  await clickText(page, "💻 برنامهنویسی");
  await wait(600);
  saved = await readState(page);
  check("study goal title is editable", saved.languageStudy.title === "تمرین برنامهنویسی", saved.languageStudy.title);
  const uniText = await page.$eval("main", (node) => node.textContent);
  check("study card shows the new goal", uniText.includes("تمرین برنامهنویسی"));

  await clickText(page, "۱۲۰ دقیقه");
  await wait(600);
  saved = await readState(page);
  check("120-minute study session is available", saved.languageStudy.targetMinutes === 120, String(saved.languageStudy.targetMinutes));

  check("share button exists", Boolean(await page.$('button[aria-label="کپی JSON دروس"]')));
  await clickAria(page, "دریافت JSON دروس");
  await wait(450);
  const area = await page.$("#overlay-root textarea");
  check("import sheet has a JSON textarea", Boolean(area));
  if (area) {
    await area.evaluate((node, payload) => {
      node.value = payload;
      node.dispatchEvent(new Event("input", { bubbles: true }));
    }, JSON.stringify({ universityName: "دانشگاه تهران", courses: [{ id: "x", name: "شبکه", dayOfWeek: 1, startTime: "08:00", endTime: "10:00", weekType: "all", professor: "د. تست" }], customShuttleJson: null }));
    await clickAria(page, "اعمال دروس");
    await wait(700);
    saved = await readState(page);
    check("shared university is applied", saved.profile.universityName === "دانشگاه تهران", saved.profile.universityName);
    check("shared courses are applied", saved.courses.length === 1 && saved.courses[0].name === "شبکه", JSON.stringify(saved.courses));
    const hero = await page.$eval("header", (node) => node.textContent);
    check("shared campus reaches the header/hero", (await page.$eval("main", (n) => n.textContent)).includes("دانشگاه تهران"));
    void hero;
  } else {
    check("shared university is applied", false, "no textarea");
    check("shared courses are applied", false, "no textarea");
    check("shared campus reaches the header/hero", false, "no textarea");
  }

  check("no runtime errors (university)", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---------------------------------------------------------------------------
// 6. Coach entry points
// ---------------------------------------------------------------------------
{
  const { page, errors } = await openPage();
  await goto(page, "مربی");
  const coachText = await page.$eval("main", (node) => node.textContent);
  check("coach exposes the setup wizard", coachText.includes("تغییر پروفایل، حالت برنامه"));
  check("coach exposes the developer preset", coachText.includes("پروفایل پیشفرض (برای توسعه دهنده)"));
  check("no runtime errors (coach)", errors.length === 0, errors.join(" | "));
  await page.close();
}

const passed = checks.filter((entry) => entry.ok).length;
console.log(`\n${passed}/${checks.length} checks passed`);
await browser.close();
if (passed !== checks.length) process.exitCode = 1;
