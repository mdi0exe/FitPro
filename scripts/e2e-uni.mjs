/**
 * University tab (shuttle schedule + reminders) and gym tools checks.
 *
 * Usage: node scripts/e2e-uni.mjs   (requires scripts/serve-dist.mjs)
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

const mainText = () =>
  page.evaluate(() => (document.querySelector("main")?.textContent ?? "").replace(/\s+/g, " "));

const overlayText = () =>
  page.evaluate(() =>
    (document.querySelector("#overlay-root")?.textContent ?? "").replace(/\s+/g, " "),
  );

const go = async (label) => {
  for (const button of await page.$$("#nav-slot nav button")) {
    if ((await button.evaluate((node) => node.textContent ?? "")).includes(label)) {
      await button.evaluate((node) => node.click());
      await wait(600);
      return;
    }
  }
  throw new Error(`nav tab not found: ${label}`);
};

const clickExactIn = async (root, text) => {
  for (const button of await root.$$("button")) {
    const content = await button.evaluate((node) =>
      (node.textContent ?? "").replace(/\s+/g, " ").trim(),
    );
    if (content === text) {
      // Programmatic click: the fixed bottom nav can swallow coordinate clicks
      // on buttons that scroll underneath it.
      await button.evaluate((node) => node.click());
      return true;
    }
  }
  return false;
};

const clickExact = (text) => clickExactIn(page, text);

const scheduleCard = async () =>
  (
    await page.evaluateHandle(() =>
      Array.from(document.querySelectorAll("main .card")).find((card) =>
        (card.textContent ?? "").includes("جدول کامل سرویس"),
      ),
    )
  ).asElement();

await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForFunction(
  () => document.querySelectorAll("#nav-slot nav button").length >= 5,
  { timeout: 10000 },
);
await wait(600);

// ------------------------------------------------------------------ nav
const labels = await page.evaluate(() =>
  Array.from(document.querySelectorAll("#nav-slot nav button")).map((b) =>
    (b.textContent ?? "").trim(),
  ),
);
check("bottom nav has five tabs", labels.length === 5, labels.join(" | "));
check("university tab is present", labels.includes("دانشگاه"));

// -------------------------------------------------------------- uni tab
await go("دانشگاه");
let text = await mainText();
check("hero mentions the university", text.includes("دانشگاه صنعتی تبریز"));
check("next-bus radar renders", text.includes("رادار سرویس"));
check("Thursday reminder card renders", text.includes("رزرو غذای هفته بعد"));
check("full schedule card renders", text.includes("جدول کامل سرویس"));
check("overflow is contained", await page.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth));

// ------------------------------------------------------- schedule groups
check("Saturday tab switches", await clickExactIn(await scheduleCard(), "شنبه"));
await wait(500);
text = await mainText();
check(
  "Saturday times are shown",
  text.includes("۰۹:۳۰") && text.includes("۱۶:۰۰") && text.includes("۰۸:۱۵"),
  text.slice(0, 90),
);

check(
  "suburb tab switches",
  await clickExactIn(await scheduleCard(), "خسروشهر / اسکو / شرق / فهمیده"),
);
await wait(500);
text = await mainText();
check(
  "suburb routes are listed",
  text.includes("خسروشهر ← دانشگاه") && text.includes("۰۸:۲۵") && text.includes("میدان شهید فهمیده"),
  text.slice(0, 90),
);

// ------------------------------------------------------------ bus alarm
const busChip = await (await scheduleCard()).$('button[aria-label^="یادآور سرویس"]');
await busChip.evaluate((node) => node.click());
await wait(900);
let saved = await state();
check(
  "bus alarm is stored",
  saved.uniReminders.activeBusAlarms.length === 1,
  JSON.stringify(saved.uniReminders.activeBusAlarms),
);
check(
  "bus chip reflects the alarm",
  (await (await (await scheduleCard()).$('button[aria-label^="یادآور سرویس"]')).evaluate((n) =>
    n.getAttribute("aria-pressed"),
  )) === "true",
);

await (await (await scheduleCard()).$('button[aria-label^="یادآور سرویس"]')).evaluate((node) => node.click());
await wait(900);
saved = await state();
check("bus alarm can be removed", saved.uniReminders.activeBusAlarms.length === 0);

// ------------------------------------------------- Thursday food reminder
const foodToggle = await page.$('button[aria-label="یادآور رزرو سلف"]');
check(
  "Thursday reminder defaults on",
  (await foodToggle.evaluate((n) => n.getAttribute("aria-pressed"))) === "true",
);
await foodToggle.evaluate((node) => node.click());
await wait(600);
saved = await state();
check("Thursday reminder can be disabled", saved.uniReminders.thursdayFoodEnabled === false);

await (await page.$('button[aria-label="یادآور رزرو سلف"]')).evaluate((node) => node.click());
await wait(700);
await (await page.$('button[aria-label="ساعت یادآوری سلف ۱۶:۰۰"]')).evaluate((node) => node.click());
await wait(700);
saved = await state();
check(
  "Thursday time chip updates state",
  saved.uniReminders.thursdayFoodTime === "16:00" && saved.uniReminders.thursdayFoodEnabled,
  JSON.stringify(saved.uniReminders),
);

// -------------------------------------------------------- gym reminder
await (await page.$('button[aria-label="یادآور باشگاه"]')).evaluate((node) => node.click());
await wait(700);
saved = await state();
check("gym reminder enables", saved.uniReminders.gymReminderEnabled === true);

await (await page.$('button[aria-label="ساعت یادآوری باشگاه ۱۵:۳۰"]')).evaluate((node) => node.click());
await wait(700);
saved = await state();
check("gym time chip updates state", saved.uniReminders.gymReminderTime === "15:30");

// -------------------------------------------------------------- tools
await go("تمرین");
check("readiness bar renders", (await mainText()).includes("انرژی امروزت"));

await clickExact("⚡ پرانرژی");
await wait(600);
saved = await state();
check(
  "readiness sets the rest timer",
  saved.readiness === "high" && saved.restSeconds === 75,
  `${saved.readiness}/${saved.restSeconds}`,
);

const weightBefore = saved.days[0].exercises[0].targetWeight;
await clickExact("🌿 هفته ریکاوری");
await wait(700);
saved = await state();
check(
  "deload lowers working weights",
  saved.deloadActive === true && saved.days[0].exercises[0].targetWeight < weightBefore,
  `${weightBefore} -> ${saved.days[0].exercises[0].targetWeight}`,
);

const nameBefore = saved.days[0].exercises[0].name;
await clickExact("🔄 دستگاه شلوغه؟");
await wait(700);
saved = await state();
check(
  "busy machine swap changes the lift",
  saved.days[0].exercises[0].name !== nameBefore,
  `${nameBefore} -> ${saved.days[0].exercises[0].name}`,
);

await clickExact("🏋️ صفحه‌های هالتر");
await wait(800);
const plateText = await overlayText();
check("plate calculator opens", plateText.includes("ماشین‌حساب صفحه‌های هالتر"), plateText.slice(0, 60));
check("plate calculator shows a bar", plateText.includes("میله المپیکی"));
await page.keyboard.press("Escape");
await wait(400);

const setChecks = await page.$$('[data-row] button[aria-label="تکمیل ست"]');
await setChecks[0].evaluate((node) => node.click());
await wait(900);
saved = await state();
const firstId = saved.days[0].exercises[0].id;
check(
  "ticking a set records a personal record",
  Boolean(saved.personalRecords?.[firstId]),
  JSON.stringify(saved.personalRecords ?? null),
);

await clickExact("🏁 ثبت پایان تمرین امروز");
await wait(800);
const finishText = await overlayText();
check("finish celebration opens", finishText.includes("خسته نباشی"), finishText.slice(0, 60));
check("finish modal reports tonnage", finishText.includes("حجم کل"), finishText.slice(0, 80));
await page.keyboard.press("Escape");
await wait(400);

// -------------------------------------------------------------- cards
await go("پیشرفت");
check("photo album card renders", (await mainText()).includes("آلبوم تغییرات بدن"));
check(
  "photo add button exists",
  await page.evaluate(() =>
    Array.from(document.querySelectorAll("main button")).some((button) =>
      (button.textContent ?? "").includes("ثبت عکس"),
    ),
  ),
);

await go("مربی");
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await wait(400);
check("backup card renders", (await mainText()).includes("پشتیبان‌گیری و بازیابی"));

console.log("\n--- runtime errors ---");
console.log(errors.length ? errors.join("\n") : "none");
check("no runtime errors", errors.length === 0);

const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
