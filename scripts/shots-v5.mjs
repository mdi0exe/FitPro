/**
 * Screenshots for the "v5" batch, for a human eyeball pass.
 *
 * Usage: node scripts/shots-v5.mjs   (needs the built app on :4400)
 */
import fs from "node:fs";
import puppeteer from "puppeteer-core";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const BASE = process.env.APP_URL ?? "http://127.0.0.1:4400/";
const OUT = "shots";
const STORAGE_KEY = "persian-hypertrophy::state::v1";

fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: "new",
  args: ["--no-sandbox", "--no-proxy-server", "--hide-scrollbars"],
  defaultViewport: { width: 412, height: 915, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const page = await browser.newPage();
await page.evaluateOnNewDocument(() => {
  if (sessionStorage.getItem("shots:booted")) return;
  sessionStorage.setItem("shots:booted", "1");
  localStorage.clear();
});
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.querySelectorAll("#nav-slot nav button").length >= 3);
await wait(700);

const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`${OUT}/${name}.png`);
};

const clickAria = async (label) => {
  const node = await page.$(`button[aria-label="${label}"]`);
  if (!node) {
    console.log(`  (missing) ${label}`);
    return false;
  }
  await node.evaluate((element) => element.click());
  return true;
};

const goto = async (label) => {
  for (const button of await page.$$("#nav-slot nav button")) {
    const text = await button.evaluate((node) => node.textContent ?? "");
    if (text.includes(label)) {
      await button.evaluate((node) => node.click());
      await wait(500);
      return;
    }
  }
};

const readState = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), STORAGE_KEY);

// 1. Formal header --------------------------------------------------------
await shot("v5-header");

// 2. Busy-machine picker --------------------------------------------------
await page.waitForSelector("article[data-exercise]");
await clickAria("حرکت جایگزین");
await wait(700);
await shot("v5-swap-picker");
await page.keyboard.press("Escape");
await wait(400);

// 3. Per-exercise history chart ------------------------------------------
await page.$eval("article[data-exercise] button[aria-label='تکمیل ست']", (node) => node.click());
await wait(700);
await clickAria("تاریخچه این حرکت");
await wait(700);
await shot("v5-exercise-history");
const overlay = await page.$("#overlay-root");
for (const handle of await overlay.$$("button")) {
  const content = await handle.evaluate((node) => (node.textContent ?? "").trim());
  if (content === "بستن") {
    await handle.evaluate((node) => node.click());
    break;
  }
}
await wait(500);

// 4. Double progression ---------------------------------------------------
const second = "article[data-exercise]:nth-of-type(2)";
for (const handle of await page.$$(`${second} button[aria-label='تکمیل ست']`)) {
  await handle.evaluate((node) => node.click());
  await wait(200);
}
await wait(800);
await shot("v5-double-progression");
await clickAria("انتخاب گزینه 1");
await wait(700);

// 5. University: derived week strip + split sharing -----------------------
await goto("دانشگاه");
await wait(500);
await shot("v5-uni-week");

// 6. Nutrition: AI plan applied ------------------------------------------
await goto("تغذیه");
await wait(500);
await clickAria("ساخت برنامه تغذیه با هوش مصنوعی");
await wait(700);
await shot("v5-ai-configurator");

const areas = await page.$$("#overlay-root textarea");
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
        { name: "میان‌وعده: ماست و موز", kcal: 550, protein: 50 },
      ],
      checklist: [
        { text: "۳ وعده اصلی را کامل بخور", hint: "کالری هدف ۲۷۵۰" },
        { text: "قبل تمرین ۱ لیوان آب", hint: "هیدراته بمان" },
        { text: "خواب ۷ ساعته", hint: "ریکاوری" },
      ],
      coachRules: [
        {
          title: "قانون تایم تمرین",
          headline: "۵ عصر بهترین تایم است",
          points: ["دو ساعت قبل شام سلف", "بعد تمرین فوراً شام"],
        },
      ],
    });
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await clickAria("اعمال برنامه هوش مصنوعی");
  await wait(900);
}
await page.evaluate(() => window.scrollTo(0, 260));
await wait(400);
await shot("v5-nutrition-ai");
await page.evaluate(() => window.scrollTo(0, 1500));
await wait(400);
await shot("v5-nutrition-meals");

// 7. Coach tab with AI rules ---------------------------------------------
await page.evaluate(() => window.scrollTo(0, 0));
await goto("مربی");
await wait(500);
await shot("v5-coach-ai");

const state = await readState();
console.log("\nstate check:", {
  calories: state?.diet?.customCalories,
  protein: state?.diet?.customProtein,
  meals: state?.diet?.mealTable?.length,
  rules: state?.diet?.coachRules?.length,
  historyKeys: Object.keys(state?.exerciseHistory ?? {}),
});

await browser.close();
