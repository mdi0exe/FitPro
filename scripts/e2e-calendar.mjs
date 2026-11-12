/**
 * Weekly calendar + notification wiring checks (browser backend).
 *
 * Usage: node scripts/e2e-calendar.mjs   (requires scripts/serve-dist.mjs)
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
const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const state = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem("persian-hypertrophy::state::v1") ?? "null"));

const reloadApp = async () => {
  await page.reload({ waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForFunction(
    () => document.querySelectorAll("#nav-slot nav button").length === 4,
    { timeout: 10000 },
  );
};

const calendarText = () =>
  page.evaluate(() => {
    const card = document.querySelector("[data-weekly-activity]");
    return (card?.textContent ?? "").replace(/\s+/g, " ");
  });

const navTo = async (index) => {
  const buttons = await page.$$("#nav-slot nav button");
  await buttons[index].click();
  await wait(600);
};

await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.evaluate(() => localStorage.clear());
await reloadApp();
await wait(500);

// ------------------------------------------------------------- week strip
const labels = await page.evaluate(() =>
  Array.from(document.querySelectorAll("main [data-weekly-activity] button[aria-pressed]")).map(
    (b) => b.getAttribute("aria-label") ?? "",
  ),
);
check("week strip has 7 days", labels.length === 7, `${labels.length}`);
check("week starts on Saturday", labels[0]?.startsWith("شنبه"), labels[0]);
check("week ends on Friday", labels[6]?.startsWith("جمعه"), labels[6]);

const today = await page.evaluate(() => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
});
const pressed = await page.evaluate(() =>
  Array.from(document.querySelectorAll("[data-weekly-activity] button[aria-pressed]")).filter(
    (b) => b.getAttribute("aria-pressed") === "true",
  ).length,
);
check("exactly one day is selected by default", pressed === 1, `${pressed} pressed`);

// --------------------------------------------------- workout snapshot
const checks0 = await page.$$('[data-row] button[aria-label="تکمیل ست"]');
await checks0[0].click();
await wait(500);
await page.evaluate(() =>
  Array.from(document.querySelectorAll("#rest-timer button"))
    .find((x) => (x.textContent ?? "").includes("رد کردن"))
    ?.click(),
);
await wait(400);

let saved = await state();
check(
  "ticking a set writes today's snapshot",
  saved.activityHistory?.[0]?.date === today && saved.activityHistory[0].setsDone === 1,
  JSON.stringify(saved.activityHistory?.[0] ?? null),
);
check(
  "snapshot names the workout day",
  (saved.activityHistory?.[0]?.workoutTitle ?? "").includes("روز ۱"),
  saved.activityHistory?.[0]?.workoutTitle,
);
check(
  "snapshot lists the exercise with its set count",
  (saved.activityHistory?.[0]?.completedExercises ?? []).some((name) => name.includes("ست")),
  JSON.stringify(saved.activityHistory?.[0]?.completedExercises),
);
check("calendar card refreshes in place", (await calendarText()).includes("روز ۱"));

// ------------------------------------------------------- water + diet
await navTo(2);
for (const handle of await page.$$("main button")) {
  if ((await handle.evaluate((n) => (n.textContent ?? "").trim())).includes("لیوان آب خوردم")) {
    await handle.click();
    break;
  }
}
await wait(500);
saved = await state();
check("water lands in today's snapshot", saved.activityHistory?.[0]?.waterGlasses === 1, String(saved.activityHistory?.[0]?.waterGlasses));

await navTo(1);
check("progress tab shows the water count", (await calendarText()).includes("۱ لیوان"));

// ------------------------------------------------ selecting another day
const cells = await page.$$("main [data-weekly-activity] button[aria-pressed]");
await cells[0].click();
await wait(500);
const saturdayText = await calendarText();
check("selecting an empty day shows the empty state", saturdayText.includes("هنوز تمرینی"), saturdayText.slice(0, 90));

const backToToday = await page.evaluate(() => {
  const button = Array.from(document.querySelectorAll("[data-weekly-activity] button")).find(
    (b) => (b.textContent ?? "").trim() === "امروز",
  );
  button?.click();
  return Boolean(button);
});
await wait(500);
check("there is a back-to-today button", backToToday);
check("back-to-today restores the workout", (await calendarText()).includes("روز ۱"));

// ------------------------------------------------------- persistence
await reloadApp();
await wait(600);
await navTo(1);
const afterReload = await calendarText();
check("calendar survives a reload", afterReload.includes("روز ۱") && afterReload.includes("۱ لیوان"));

// ------------------------------------------- notification wiring (browser)
await page.evaluate(() => {
  window.__notes = [];
  class FakeNotification {
    static permission = "granted";
    static requestPermission = async () => "granted";
    constructor(title, options) {
      window.__notes.push({ title, body: options?.body ?? "" });
    }
  }
  window.Notification = FakeNotification;
});

await navTo(3);
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await wait(400);
const clickedNotify = await page.evaluate(() => {
  const button = Array.from(document.querySelectorAll("main button")).find((b) =>
    (b.textContent ?? "").includes("تست نوتیفیکیشن"),
  );
  button?.click();
  return Boolean(button);
});
await wait(600);
let notes = await page.evaluate(() => window.__notes);
check("notification test button exists", clickedNotify);
check("test button posts a system notification", notes.length >= 1, JSON.stringify(notes));
check(
  "water reminder also posts a notification",
  await (async () => {
    const button = await page.evaluate(() => {
      const target = Array.from(document.querySelectorAll("main button")).find((b) =>
        (b.textContent ?? "").includes("تست یادآور آب"),
      );
      target?.click();
      return Boolean(target);
    });
    await wait(600);
    notes = await page.evaluate(() => window.__notes);
    return button && notes.some((n) => n.title.includes("آب"));
  })(),
  JSON.stringify(notes),
);

console.log("\n--- runtime errors ---");
console.log(errors.length ? errors.join("\n") : "none");
check("no runtime errors", errors.length === 0);

const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
