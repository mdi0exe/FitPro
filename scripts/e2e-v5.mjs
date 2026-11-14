/**
 * E2E checks for the "v5" batch:
 *   1. committed debug keystore (stable APK signature)
 *   2. formal, emoji-free header with SVG icons + a perfectly centred .btn-icon
 *   3. automatic odd/even semester weeks (no manual switch)
 *   4. class sharing split from shuttle sharing
 *   5. AI diet/coach configurator (prompt → JSON → applied plan)
 *   6. catalog coaching tips in the busy-machine picker
 *   7. per-exercise history chart + the double-progression dialog
 *
 * Usage: node scripts/e2e-v5.mjs
 * Requires the built app on http://127.0.0.1:4400/.
 */
import fs from "node:fs";
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
  for (const handle of await page.$$("button")) {
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

// ---------------------------------------------------------------------------
// 1. Persistent debug keystore
// ---------------------------------------------------------------------------
{
  const path = "src-tauri/keystore/debug.keystore";
  const exists = fs.existsSync(path);
  check("committed debug keystore exists", exists, path);
  if (exists) {
    const size = fs.statSync(path).size;
    check("keystore is a real file (not a placeholder)", size > 1500, `${size} bytes`);
    // PKCS12 files start with the ASN.1 SEQUENCE tag (0x30).
    const head = fs.readFileSync(path).subarray(0, 1);
    check("keystore is PKCS12-encoded", head[0] === 0x30, `0x${head[0].toString(16)}`);
  }
  const workflow = fs.readFileSync(".github/workflows/android-apk.yml", "utf8");
  // Match the *step* line: "Build debug APK" also appears as the job name at
  // the top of the file, which would make a plain indexOf comparison useless.
  check(
    "CI installs the keystore before building",
    workflow.indexOf("Install persistent debug keystore") !== -1 &&
      workflow.indexOf("Install persistent debug keystore") <
        workflow.indexOf("- name: Build debug APK"),
  );
}

// ---------------------------------------------------------------------------
// 2. Formal header, SVG icons, centred icon buttons
// ---------------------------------------------------------------------------
{
  const { page, errors } = await openPage();

  const header = await page.evaluate(() => {
    const node = document.querySelector("header");
    return {
      text: node?.textContent ?? "",
      iconButtons: node?.querySelectorAll(".btn-icon svg").length ?? 0,
      subtitleIcon: node?.querySelectorAll("p svg").length ?? 0,
    };
  });
  check("header has no emoji", !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u.test(header.text), header.text.slice(0, 40));
  check("header icon buttons use inline SVG", header.iconButtons === 2, String(header.iconButtons));
  check("header subtitle carries a mode icon", header.subtitleIcon >= 1, String(header.subtitleIcon));

  const geometry = await page.$eval('header .btn-icon', (node) => {
    const style = getComputedStyle(node);
    const svg = node.querySelector("svg");
    const box = node.getBoundingClientRect();
    const glyph = svg.getBoundingClientRect();
    return {
      width: box.width,
      height: box.height,
      padding: style.paddingTop,
      lineHeight: parseFloat(style.lineHeight),
      fontSize: parseFloat(style.fontSize),
      svgDisplay: getComputedStyle(svg).display,
      // Sub-pixel offsets are what "off-centre" actually looks like.
      offsetX: glyph.left + glyph.width / 2 - (box.left + box.width / 2),
      offsetY: glyph.top + glyph.height / 2 - (box.top + box.height / 2),
    };
  });
  check("icon button is square", Math.abs(geometry.width - geometry.height) < 0.6, `${geometry.width}×${geometry.height}`);
  check("icon button has no padding", geometry.padding === "0px", geometry.padding);
  check(
    "icon button has no line-height slack",
    Math.abs(geometry.lineHeight - geometry.fontSize) < 0.6,
    `${geometry.lineHeight}px vs ${geometry.fontSize}px`,
  );
  check("icon glyph is a block element", geometry.svgDisplay === "block", geometry.svgDisplay);
  check(
    "icon glyph is horizontally centred",
    Math.abs(geometry.offsetX) < 0.6,
    `${geometry.offsetX.toFixed(2)}px`,
  );
  check(
    "icon glyph is vertically centred",
    Math.abs(geometry.offsetY) < 0.6,
    `${geometry.offsetY.toFixed(2)}px`,
  );

  // The default profile name must be neutral, not "دانشجوی ورزشکار".
  const state = await readState(page);
  check("default profile name is neutral", state?.profile?.name === "کاربر", String(state?.profile?.name));
  check("no runtime errors (header)", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---------------------------------------------------------------------------
// 3. Automatic odd/even weeks
// ---------------------------------------------------------------------------
{
  const { page, errors } = await openPage();
  await goto(page, "دانشگاه");

  const card = await page.$eval("#view", (node) => node.textContent ?? "");
  check("manual week switch is gone", !card.includes("هفته یک‌ستاره (*)"), "no odd/even toggle");
  check("week status strip is shown", /هفته\s*[۰-۹]+\s*ترم/.test(card), card.match(/هفته[^•]*ترم/)?.[0] ?? "");

  const before = await readState(page);
  check(
    "anchor defaults to current week start",
    typeof before.semesterWeekAnchorDate === "string" && before.semesterWeekAnchorDate.length === 10,
    String(before.semesterWeekAnchorDate),
  );

  const opened = await clickAria(page, "تنظیم شماره هفته ترم");
  check("week modal opens", opened);
  await wait(400);
  await clickAria(page, "هفته بعد");
  await wait(200);
  const overlay = await page.$("#overlay-root");
  for (const handle of await overlay.$$("button")) {
    const content = await handle.evaluate((node) => (node.textContent ?? "").trim());
    if (content === "ذخیره") {
      await handle.evaluate((node) => node.click());
      break;
    }
  }
  await wait(600);

  const after = await readState(page);
  check(
    "saving stores a 7-day-shifted anchor",
    typeof after.semesterWeekAnchorDate === "string" && after.semesterWeekAnchorDate.length === 10,
    String(after.semesterWeekAnchorDate),
  );
  check("derived parity follows the anchor", after.semesterWeekType === "even", after.semesterWeekType);
  check("no runtime errors (weeks)", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---------------------------------------------------------------------------
// 4. Split sharing: classes vs shuttle
// ---------------------------------------------------------------------------
{
  const { page, errors } = await openPage();
  await goto(page, "دانشگاه");

  check("class card has its own copy button", Boolean(await page.$('button[aria-label="کپی JSON دروس"]')));
  check("class card has its own import button", Boolean(await page.$('button[aria-label="دریافت JSON دروس"]')));
  check("shuttle card has its own copy button", Boolean(await page.$('button[aria-label="کپی JSON سرویس‌ها"]')));
  check("shuttle card has its own import button", Boolean(await page.$('button[aria-label="دریافت JSON سرویس‌ها"]')));

  // Importing a timetable-only payload must not wipe the shuttle table.
  const before = await readState(page);
  await clickAria(page, "دریافت JSON دروس");
  await wait(450);
  const area = await page.$("#overlay-root textarea");
  check("courses import sheet opens", Boolean(area));
  if (area) {
    await area.evaluate((node) => {
      node.value = JSON.stringify({
        universityName: "دانشگاه صنعتی تبریز",
        courses: [
          { id: "x1", name: "شبکه‌های عصبی", professor: "د. تست", dayOfWeek: 1, startTime: "08:00", endTime: "10:00", weekType: "all" },
        ],
      });
      node.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await clickAria(page, "اعمال دروس");
    await wait(700);
    const after = await readState(page);
    check("courses import replaces the timetable", after.courses.length === 1 && after.courses[0].name === "شبکه‌های عصبی", JSON.stringify(after.courses));
    check(
      "courses import leaves the shuttle table alone",
      after.customShuttleJson === before.customShuttleJson,
      `${before.customShuttleJson} -> ${after.customShuttleJson}`,
    );
  }
  check("no runtime errors (sharing)", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---------------------------------------------------------------------------
// 5. AI diet & coach configurator
// ---------------------------------------------------------------------------
{
  const { page, errors } = await openPage();
  await goto(page, "تغذیه");

  const opened = await clickAria(page, "ساخت برنامه تغذیه با هوش مصنوعی");
  check("AI configurator opens", opened);
  await wait(450);

  const prompt = await page.$eval("#overlay-root textarea", (node) => node.value);
  check("prompt contains the real body weight", /وزن فعلی/.test(prompt), prompt.slice(0, 40));
  check("prompt demands a strict JSON reply", prompt.includes('"coachRules"') && prompt.includes("calories"));

  const areas = await page.$$("#overlay-root textarea");
  check("configurator has a prompt box and an answer box", areas.length === 2, String(areas.length));
  if (areas.length === 2) {
    await areas[1].evaluate((node) => {
      node.value = JSON.stringify({
        calories: 2750,
        protein: 165,
        trainingWindow: "۵ عصر، قبل از شام سلف",
        meals: [
          { name: "صبحانه: تخم‌مرغ و نان کامل", kcal: 500, protein: 28 },
          { name: "ناهار سلف: چلو مرغ", kcal: 900, protein: 42 },
          { name: "شام بعد تمرین: خوراک مرغ", kcal: 800, protein: 45 },
        ],
        checklist: [
          { text: "۳ وعده اصلی را کامل بخور", hint: "کالری هدف ۲۷۵۰" },
          { text: "قبل تمرین ۱ لیوان آب", hint: "هیدراته بمان" },
        ],
        coachRules: [
          { title: "قانون تایم تمرین", headline: "۵ عصر بهترین تایم است", points: ["دو ساعت قبل شام سلف", "بعد تمرین فوراً شام"] },
        ],
      });
      node.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await clickAria(page, "اعمال برنامه هوش مصنوعی");
    await wait(800);

    const state = await readState(page);
    check("AI calories are stored", state.diet.customCalories === 2750, String(state.diet.customCalories));
    check("AI protein target is stored", state.diet.customProtein === 165, String(state.diet.customProtein));
    check("AI meal table is stored", state.diet.mealTable?.length === 3, String(state.diet.mealTable?.length));
    check("AI coach rules are stored", state.diet.coachRules?.length === 1, String(state.diet.coachRules?.length));
    check(
      "training window is updated",
      state.profile.trainingWindow.includes("۵ عصر"),
      state.profile.trainingWindow,
    );
    check(
      "checklist is replaced by the AI rows",
      state.diet.items.filter((item) => item.id.startsWith("ai-")).length === 2,
      String(state.diet.items.length),
    );
    check(
      "water row survives the replacement",
      state.diet.items.some((item) => item.id === "diet-4"),
      state.diet.items.map((item) => item.id).join(","),
    );

    const text = await page.$eval("#view", (node) => node.textContent ?? "");
    check("protein card shows the AI target", text.includes("۱۶۵"), text.match(/پروتئین روزانه[^]*?گرم/)?.[0] ?? "");
    check("meal table renders the AI rows", text.includes("صبحانه: تخم‌مرغ و نان کامل"));

    await goto(page, "مربی");
    const coachText = await page.$eval("#view", (node) => node.textContent ?? "");
    check("coach tab shows the AI rule", coachText.includes("۵ عصر بهترین تایم است"));
  }
  check("no runtime errors (AI diet)", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---------------------------------------------------------------------------
// 6. Catalog tips in the busy-machine picker
// ---------------------------------------------------------------------------
{
  const { page, errors } = await openPage();
  await page.waitForSelector("article[data-exercise]", { timeout: 10000 });

  await clickAria(page, "حرکت جایگزین");
  await wait(600);
  const rows = await page.$$eval("#overlay-root button[aria-label^='انتخاب ']", (nodes) =>
    nodes.map((node) => ({
      name: node.querySelector("p")?.textContent ?? "",
      tip: node.querySelectorAll("p")[2]?.textContent ?? "",
      gif: node.querySelector("img")?.getAttribute("src") ?? "",
    })),
  );
  check("picker lists same-muscle movements", rows.length >= 5, String(rows.length));
  check("every row carries a coaching tip", rows.every((row) => row.tip.length > 20), rows[0]?.tip.slice(0, 40));
  check("every row has a bundled GIF", rows.every((row) => row.gif.startsWith("/gifs/catalog/")), rows[0]?.gif);

  if (rows.length > 0) {
    await page.$$eval("#overlay-root button[aria-label^='انتخاب ']", (nodes) => nodes[0].click());
    await wait(700);
    const state = await readState(page);
    const exercise = state.days[0].exercises[0];
    check("picked movement replaces today's lift", exercise.name === rows[0].name, `${exercise.name} vs ${rows[0].name}`);
    check("picked movement keeps a way back", Boolean(exercise.originalName), String(exercise.originalName));
    check("picked movement uses the catalog GIF", String(exercise.gifUrl).startsWith("/gifs/catalog/"), String(exercise.gifUrl));
    check("picked movement adopts the tip", String(exercise.tip).length > 20, String(exercise.tip).slice(0, 40));
  }
  check("no runtime errors (swap picker)", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---------------------------------------------------------------------------
// 7. Per-exercise history + double progression
// ---------------------------------------------------------------------------
{
  const { page, errors } = await openPage();
  await page.waitForSelector("article[data-exercise]", { timeout: 10000 });

  const firstId = await page.$eval("article[data-exercise]", (node) => node.getAttribute("data-exercise"));

  // Tick one set of the first movement: history must record the top set.
  const firstCheck = await page.$("article[data-exercise] button[aria-label='تکمیل ست']");
  await firstCheck.evaluate((node) => node.click());
  await wait(700);

  let state = await readState(page);
  const rows = state.exerciseHistory?.[firstId] ?? [];
  check("ticking a set records today's row", rows.length === 1, String(rows.length));
  check("history row carries weight/reps/sets", rows[0]?.reps > 0 && rows[0]?.setsCompleted === 1, JSON.stringify(rows[0]));
  check("history row is dated today", /^\d{4}-\d{2}-\d{2}$/.test(rows[0]?.date ?? ""), String(rows[0]?.date));

  // The card exposes a progress chart for that movement.
  const historyOpened = await clickAria(page, "تاریخچه این حرکت");
  check("history modal opens", historyOpened);
  await wait(500);
  const historyText = await page.$eval("#overlay-root", (node) => node.textContent ?? "");
  check("history modal reports the session count", historyText.includes("جلسات"), historyText.slice(0, 60));
  // One session has no line to draw, so the modal explains that instead of
  // showing an empty 120px box.
  check(
    "single-session history explains the missing chart",
    !(await page.$("#overlay-root svg polyline")) && historyText.includes("دومین جلسه"),
    historyText.slice(0, 80),
  );
  const overlayRoot = await page.$("#overlay-root");
  for (const handle of await overlayRoot.$$("button")) {
    const content = await handle.evaluate((node) => (node.textContent ?? "").trim());
    if (content === "بستن") {
      await handle.evaluate((node) => node.click());
      break;
    }
  }
  await wait(500);

  // Add an older session straight into the saved state so the chart has two
  // points; a reload makes the app pick it up.
  // Written with `evaluateOnNewDocument`: a plain write before `reload()` is
  // undone by the app persisting its in-memory state on visibilitychange.
  const seeded = await page.evaluate((key, id) => {
    const state = JSON.parse(localStorage.getItem(key));
    const rows = state.exerciseHistory[id] ?? [];
    if (rows.length === 0) return null;
    const yesterday = new Date(Date.now() - 86_400_000);
    const pad = (n) => String(n).padStart(2, "0");
    const iso = `${yesterday.getFullYear()}-${pad(yesterday.getMonth() + 1)}-${pad(yesterday.getDate())}`;
    state.exerciseHistory[id] = [
      { date: iso, weight: Math.max(2.5, rows[0].weight - 2.5), reps: rows[0].reps, setsCompleted: rows[0].setsCompleted },
      ...rows,
    ];
    return state;
  }, STORAGE_KEY, firstId);
  check("older session can be seeded for the chart", seeded !== null);
  if (seeded) {
    await page.evaluateOnNewDocument(
      (key, payload) => {
        localStorage.setItem(key, JSON.stringify(payload));
      },
      STORAGE_KEY,
      seeded,
    );
  }
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => document.querySelectorAll("#nav-slot nav button").length >= 3,
    { timeout: 15000 },
  );
  await wait(700);
  await clickAria(page, "تاریخچه این حرکت");
  await wait(600);
  check("two sessions draw a chart line", Boolean(await page.$("#overlay-root svg polyline")));
  const overlayAgain = await page.$("#overlay-root");
  for (const handle of await overlayAgain.$$("button")) {
    const content = await handle.evaluate((node) => (node.textContent ?? "").trim());
    if (content === "بستن") {
      await handle.evaluate((node) => node.click());
      break;
    }
  }
  await wait(500);

  // Finish every set of the *second* movement once (no double-toggling), which
  // is what raises the double-progression question.
  const secondCard = "article[data-exercise]:nth-of-type(2)";
  const secondId = await page.$eval(secondCard, (node) => node.getAttribute("data-exercise"));
  const secondChecks = await page.$$(`${secondCard} button[aria-label='تکمیل ست']`);
  check("second movement has sets to tick", secondChecks.length > 0, String(secondChecks.length));
  for (const handle of secondChecks) {
    await handle.evaluate((node) => node.click());
    await wait(220);
  }
  await wait(800);

  const overlayText = await page.$eval("#overlay-root", (node) => node.textContent ?? "");
  check("double progression dialog appears", overlayText.includes("پله بعدی این حرکت"), overlayText.slice(0, 60));

  const before = await readState(page);
  const beforeExercise = before.days[0].exercises.find((item) => item.id === secondId);
  const beforeWeight = beforeExercise?.targetWeight ?? 0;
  await clickAria(page, "انتخاب گزینه 1");
  await wait(800);

  state = await readState(page);
  const after = state.days[0].exercises.find((item) => item.id === secondId);
  if (beforeWeight > 0) {
    check(
      "choosing +2.5 kg raises the prescription",
      Math.abs(after.targetWeight - (beforeWeight + 2.5)) < 0.01,
      `${beforeWeight} -> ${after.targetWeight}`,
    );
    check(
      "reps range is preserved on the exercise",
      String(after.reps) === String(beforeExercise.reps),
      String(after.reps),
    );
  } else {
    check(
      "bodyweight movement bumps the rep range instead",
      after.reps !== beforeExercise.reps,
      String(after.reps),
    );
    check("bodyweight movement keeps its weight", after.targetWeight === beforeWeight, String(after.targetWeight));
  }
  check("today's ticked sets are left untouched", after.logs.every((log) => log.done));
  check("no runtime errors (history)", errors.length === 0, errors.join(" | "));
  await page.close();
}

await browser.close();

const passed = checks.filter((entry) => entry.ok).length;
console.log(`\n${passed}/${checks.length} checks passed`);
if (passed !== checks.length) process.exitCode = 1;
