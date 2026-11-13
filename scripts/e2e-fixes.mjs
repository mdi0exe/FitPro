/**
 * End-to-end checks for the review fixes + the keyboard-free input layer.
 *
 * Usage: node scripts/e2e-fixes.mjs
 */
import puppeteer from "puppeteer-core";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const URL = process.env.APP_URL ?? "http://127.0.0.1:4400/";

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: "new",
  args: ["--no-sandbox", "--no-proxy-server", "--hide-scrollbars"],
  defaultViewport: { width: 412, height: 915, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
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

const clickByText = async (text, root = null) => {
  const scope = root ?? page;
  const handles = await scope.$$("button");
  for (const handle of handles) {
    const content = await handle.evaluate((node) => node.textContent ?? "");
    if (content.includes(text)) {
      await handle.click();
      return true;
    }
  }
  return false;
};

await page.goto(URL, { waitUntil: "networkidle2" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle2" });
await wait(700);

// ------------------------------------------------ 1. steppers, no keyboard
const inputs = await page.$$("[data-row] input");
check("set rows have no <input> (no keyboard)", inputs.length === 0, `${inputs.length} inputs`);

const plusButtons = await page.$$('[data-row] button[aria-label="افزایش"]');
await plusButtons[0].click(); // weight 12.5 → 15
await plusButtons[0].click(); // → 17.5
await plusButtons[1].click(); // reps 8 → 9
await wait(700); // persist() is debounced by 350ms

let saved = await state();
const firstLog = saved.days[0].exercises[0].logs[0];
check(
  "steppers update weight (2.5) and reps (1)",
  firstLog.weight === 17.5 && firstLog.reps === 9,
  JSON.stringify(firstLog),
);

const displayText = await page.$eval(
  '[data-row] button[aria-label^="وزنه ست"]',
  (node) => node.textContent.trim(),
);
check("stepper shows Persian digits", /[۰-۹]/.test(displayText), displayText);

// ------------------------------------------------------- 2. quick picker
const openers = await page.$$('[data-row] button[aria-label^="وزنه ست"]');
await openers[0].click();
await wait(400);
const overlay = await page.$("#overlay-root");
const modalCount = () =>
  page.evaluate(() => document.querySelectorAll("#overlay-root > div:not(#rest-timer)").length);
check("weight picker opens", (await modalCount()) === 1);

await clickByText("۴۰", overlay);
await wait(200);
const applied = await clickByText("اعمال برای همه ست‌های این حرکت", overlay);
check("apply-to-all button present", applied);
await wait(400);
await page.keyboard.press("Escape");
await wait(300);

saved = await state();
const weights = saved.days[0].exercises[0].logs.map((log) => log.weight);
check("apply-to-all writes every set", weights.every((w) => w === 40), weights.join(","));

// ---------------------------------------------- 3. check a set + rest timer
const checkButton = await page.$('[data-row] button[aria-label="تکمیل ست"]');
await checkButton.click();
await wait(500);
const timerVisible = await page.evaluate(() => {
  const node = document.getElementById("rest-timer");
  return !!node && !node.classList.contains("hidden");
});
check("rest timer starts after a set", timerVisible);

const timerText = await page.$eval("#rest-timer p:nth-of-type(2)", (node) => node.textContent.trim());
check("rest timer shows Persian clock", /[۰-۹]/.test(timerText) && timerText.includes(":"), timerText);

await clickByText("رد کردن");
await wait(300);

// ------------------------------------------------------------- 4. gifs
saved = await state();
check(
  "exercise demos point at the bundled files",
  (saved.days[0].exercises[0].gifUrl ?? "") === "/gifs/d1e1.svg",
  saved.days[0].exercises[0].gifUrl,
);
check(
  "warm-up demos point at the bundled files",
  (saved.days[0].warmups[0].gifUrl ?? "") === "/gifs/wu-upper-1.svg",
  saved.days[0].warmups[0].gifUrl,
);

const imgSrc = await page.$eval("[data-exercise] img", (node) => node.src).catch(() => "");
check("exercise card renders the demo", imgSrc.endsWith("/gifs/d1e1.svg"), imgSrc);
const referrer = await page.$eval("[data-exercise] img", (node) => node.referrerPolicy).catch(() => "");
check("gif uses no-referrer", referrer === "no-referrer", referrer);

// ------------------------------------------------------- 5. restart day
const restart = await page.$('button[aria-label="شروع مجدد این روز"]');
check("restart-day button appears after progress", restart !== null);
if (restart) {
  // The sticky header covers the top of the viewport after scrolling.
  await restart.evaluate((node) => node.scrollIntoView({ block: "center" }));
  await wait(300);
  await restart.click();
  await wait(400);
  check("restart dialog opens", (await modalCount()) === 1, `${await modalCount()} overlay(s)`);
  const confirmed = await clickByText("شروع مجدد", await page.$("#overlay-root"));
  check("restart dialog confirms", confirmed);
  await wait(600);
  saved = await state();
  check(
    "restart clears ticks but keeps weights",
    saved.days[0].exercises[0].logs.every((log) => log.done === false) &&
      saved.days[0].exercises[0].logs[0].weight === 40,
    JSON.stringify(saved.days[0].exercises[0].logs[0]),
  );
}

// ------------------------------------- 6. warm-ups reset by overload
for (const handle of await page.$$("main button")) {
  const label = await handle.evaluate((node) => node.getAttribute("aria-label") ?? "");
  if (label === "انجام شد") {
    await handle.click();
    break;
  }
}
await wait(300);
saved = await state();
check("warm-up checkbox toggles", saved.days[0].warmups.some((w) => w.done));

await clickByText("اعمال افزایش وزنه");
await wait(400);
await clickByText("اعمال افزایش", await page.$("#overlay-root"));
await wait(700);
saved = await state();
check(
  "overload resets warm-ups too",
  saved.days[0].warmups.every((w) => w.done === false) && saved.overloadCount === 1,
  `overloadCount=${saved.overloadCount}`,
);

const ids = saved.milestones.map((m) => m.id);
check("milestone ids are unique", new Set(ids).size === ids.length, ids.join(","));

// ------------------------------------------------- 7. back closes a modal
await page.evaluate(() => {
  const skip = Array.from(document.querySelectorAll("#rest-timer button")).find((button) =>
    (button.textContent ?? "").includes("رد کردن"),
  );
  skip?.click();
});
await wait(250);

const gifButton = await page.$("[data-exercise] .btn-icon");
await gifButton.evaluate((node) => node.click());
await wait(400);
check("gif modal opens", (await modalCount()) === 1);

await page.evaluate(() => history.back());
await wait(500);
check("Android back closes the modal", (await modalCount()) === 0);

// -------------------------------------------- 8. back returns to workout
/** Click a bottom-nav tab by its label (indices shift when tabs are added). */
const navTo = async (label) => {
  const buttons = await page.$$("#nav-slot nav button");
  for (const button of buttons) {
    if ((await button.evaluate((node) => node.textContent ?? "")).includes(label)) {
      await button.click();
      return;
    }
  }
  throw new Error(`nav tab not found: ${label}`);
};

await navTo("تغذیه");
await wait(500);
check(
  "tab switch works",
  await page.evaluate(() => !document.querySelector("[data-day-count]")),
);

await page.evaluate(() => history.back());
await wait(500);
check(
  "Android back returns to the workout tab",
  await page.evaluate(() => !!document.querySelector("[data-day-count]")),
);

// ------------------------------------------------------ 9. profile edit
await navTo("مربی");
await wait(500);
const nameInput = await page.$('main input[type="text"]');
await nameInput.click({ clickCount: 3 });
await nameInput.type("علی");
await clickByText("ذخیره مشخصات");
await wait(500);
saved = await state();
check("profile name saved", saved.profile.name === "علی", saved.profile.name);

const greeting = await page.$eval("header h1", (node) => node.textContent.trim());
check("header greets the new name", greeting.includes("علی"), greeting);

// ------------------------------------------------------------ 10. errors
console.log("\n--- runtime errors ---");
console.log(errors.length ? errors.join("\n") : "none");

const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);

await browser.close();
process.exit(failed === 0 ? 0 : 1);
