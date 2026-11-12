/**
 * Nutrition + water tracker checks (browser / localStorage backend).
 *
 * Usage: node scripts/e2e-water.mjs
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

const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(err.message));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Reload + wait for the app shell (avoids networkidle2 with lazy images). */
const reloadApp = async () => {
  await page.reload({ waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForFunction(
    () => document.querySelectorAll("#nav-slot nav button").length === 4,
    { timeout: 10000 },
  );
};
const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const state = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem("persian-hypertrophy::state::v1") ?? "null"));

const clickByText = async (text, root = null) => {
  const scope = root ?? page;
  for (const handle of await scope.$$("button")) {
    const content = await handle.evaluate((node) => node.textContent ?? "");
    if (content.includes(text)) {
      await handle.click();
      return true;
    }
  }
  return false;
};

const goToNutrition = async () => {
  const nav = await page.$$("#nav-slot nav button");
  await nav[2].click();
  await wait(600);
};

await page.goto(URL, { waitUntil: "networkidle2" });
await page.evaluate(() => localStorage.clear());
await reloadApp();
await wait(700);
await goToNutrition();

// ------------------------------------------------------- 1. cafeteria plan
let saved = await state();
check(
  "diet has 5 cafeteria items",
  saved.diet.items.length === 5 && saved.diet.items[0].text.includes("صبحانه سلف"),
  saved.diet.items.map((item) => item.id).join(","),
);

const pageText = await page.$eval("main", (node) => node.textContent ?? "");
check("cafeteria breakfast rendered", pageText.includes("صبحانه سلف"));
check("cafeteria lunch rendered", pageText.includes("چلو جوجه کباب"));
check("no grocery wording left", !pageText.includes("بادام‌زمینی"));

// ---------------------------------------------------------- 2. water flow
const plusOne = await clickByText("لیوان آب خوردم");
await wait(400);
await clickByText("لیوان آب خوردم");
await wait(400);
await clickByText("لیوان آب خوردم");
await wait(500);
saved = await state();
check("+1 glass button increments", saved.diet.waterGlasses === 3, String(saved.diet.waterGlasses));

const glass8 = await page.$('button[aria-label="۸ لیوان آب"]');
await glass8.click();
await wait(600);
saved = await state();
const waterItem = saved.diet.items.find((item) => item.id === "diet-4");
check("tap glass 8 sets the count", saved.diet.waterGlasses === 8, String(saved.diet.waterGlasses));
check("8 glasses ticks the water checklist row", waterItem?.done === true, String(waterItem?.done));

const minusOne = await clickByText("−۱ لیوان");
await wait(600);
saved = await state();
const waterItem2 = saved.diet.items.find((item) => item.id === "diet-4");
check("dropping below 8 unticks it", saved.diet.waterGlasses === 7 && waterItem2?.done === false, `${saved.diet.waterGlasses}/${waterItem2?.done}`);

// -------------------------------------------------------- 3. smart reminder
const toggle = await page.$('button[aria-label="یادآور آب"]');
await toggle.click();
await wait(600);
saved = await state();
check("reminder toggle enables", saved.diet.waterReminderEnabled === true);

const countdown = await page.evaluate(() => {
  const node = Array.from(document.querySelectorAll("p")).find((p) =>
    (p.textContent ?? "").includes("یادآوری بعدی"),
  );
  return node?.textContent?.trim() ?? "";
});
check("countdown is shown", countdown.includes(":"), countdown);

await clickByText("۴۵ دقیقه");
await wait(600);
saved = await state();
check("interval chip updates minutes", saved.diet.waterReminderMinutes === 45, String(saved.diet.waterReminderMinutes));

// ------------------------------------------------- 4. legacy state migration
await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem("persian-hypertrophy::state::v1"));
  raw.diet.items = [
    { id: "diet-1", text: "۳ تا ۴ عدد تخم‌مرغ کامل (ارزان‌ترین بمب پروتئین)", hint: "", done: true },
    { id: "diet-2", text: "وعده کامل سلف دانشگاه (با برنج و نان اضافه)", hint: "", done: false },
  ];
  localStorage.setItem("persian-hypertrophy::state::v1", JSON.stringify(raw));
});
await reloadApp();
await wait(800);
saved = await state();
check(
  "legacy 6-item diet migrates on load",
  saved.diet.items.length === 5 && saved.diet.items[0].text.includes("صبحانه سلف"),
  `${saved.diet.items.length} items`,
);
check("water settings survive the reload", saved.diet.waterReminderMinutes === 45);

// ------------------------------------------------------ 5. daily reset
await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem("persian-hypertrophy::state::v1"));
  raw.diet.waterGlasses = 6;
  raw.diet.lastResetDate = "2020-01-01";
  localStorage.setItem("persian-hypertrophy::state::v1", JSON.stringify(raw));

  // The app flushes its in-memory state on pagehide, which would overwrite the
  // fixture above; block writes for the duration of this check.
  const original = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    if (key === "persian-hypertrophy::state::v1") return;
    return original.call(this, key, value);
  };
});
await reloadApp();
await wait(900);
saved = await state();
check("new day resets the water counter", saved.diet.waterGlasses === 0, String(saved.diet.waterGlasses));

// ------------------------------- 6. persistent reminder across restarts
const goNutrition = async () => {
  const nav = await page.$$("#nav-slot nav button");
  await nav[2].click();
  await wait(600);
};

/** Seconds left, parsed from the Persian countdown text. */
const countdownSeconds = () =>
  page.evaluate(() => {
    const node = Array.from(document.querySelectorAll("p")).find((p) =>
      (p.textContent ?? "").includes("یادآوری بعدی"),
    );
    const text = (node?.textContent ?? "").replace(/[۰-۹]/g, (d) =>
      String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)),
    );
    const match = /(\d+):(\d+)/.exec(text);
    return match ? Number(match[1]) * 60 + Number(match[2]) : -1;
  });

await goNutrition();
saved = await state();
const deadline1 = saved.diet.waterReminderNextAt;
check("reminder stores an absolute deadline", deadline1 > Date.now(), `${deadline1} vs ${Date.now()}`);
check(
  "deadline is ~45 minutes ahead",
  deadline1 > Date.now() + 43 * 60_000 && deadline1 <= Date.now() + 45 * 60_000,
  String(Math.round((deadline1 - Date.now()) / 60_000)),
);

const before = await countdownSeconds();
check("countdown reflects the deadline", before > 43 * 60 && before <= 45 * 60, `${before}s`);

await reloadApp();
await wait(900);
await goNutrition();
saved = await state();
const deadline2 = saved.diet.waterReminderNextAt;
check("deadline survives a restart unchanged", deadline2 === deadline1, `${deadline1} -> ${deadline2}`);

const after = await countdownSeconds();
check("countdown resumes instead of resetting", after > 0 && after <= before, `${before}s -> ${after}s`);

// Expired while the app was closed: the next boot must fire once and advance.
await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem("persian-hypertrophy::state::v1"));
  raw.diet.waterReminderEnabled = true;
  raw.diet.waterReminderNextAt = Date.now() - 5_000;
  localStorage.setItem("persian-hypertrophy::state::v1", JSON.stringify(raw));
  localStorage.setItem("persian-hypertrophy::water-next-at", String(Date.now() - 5_000));

  const original = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    if (key === "persian-hypertrophy::state::v1") return;
    return original.call(this, key, value);
  };
});
await reloadApp();
await wait(1400);
saved = await state();
check(
  "expired reminder advances to the next cycle",
  saved.diet.waterReminderNextAt > Date.now(),
  `${saved.diet.waterReminderNextAt} vs ${Date.now()}`,
);

// A new calendar day must not touch the reminder deadline.
const deadlineBeforeMidnight = saved.diet.waterReminderNextAt;
await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem("persian-hypertrophy::state::v1"));
  raw.diet.lastResetDate = "2020-01-01";
  raw.diet.waterGlasses = 4;
  localStorage.setItem("persian-hypertrophy::state::v1", JSON.stringify(raw));

  const original = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    if (key === "persian-hypertrophy::state::v1") return;
    return original.call(this, key, value);
  };
});
await reloadApp();
await wait(900);
saved = await state();
check("new day keeps the reminder deadline", saved.diet.waterReminderNextAt === deadlineBeforeMidnight, `${deadlineBeforeMidnight} -> ${saved.diet.waterReminderNextAt}`);
check("new day still clears the glasses", saved.diet.waterGlasses === 0, String(saved.diet.waterGlasses));

console.log("\n--- runtime errors ---");
console.log(errors.length ? errors.join("\n") : "none");

const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);

await browser.close();
process.exit(failed === 0 ? 0 : 1);
