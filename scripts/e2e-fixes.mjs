/**
 * End-to-end checks for the nine review fixes (browser / localStorage backend).
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

// ---------------------------------------------------------------- 1. digits
const rowInputs = await page.$$("[data-row] input");
await rowInputs[0].click({ clickCount: 3 });
await rowInputs[0].type("۲۰٫۵");
await rowInputs[1].click({ clickCount: 3 });
await rowInputs[1].type("۱۲");
const checkButton = await page.$("[data-row] button");
await checkButton.click();
await wait(500);

let saved = await state();
const firstLog = saved.days[0].exercises[0].logs[0];
check(
  "Persian digits parsed in set logger",
  firstLog.weight === 20.5 && firstLog.reps === 12 && firstLog.done === true,
  JSON.stringify(firstLog),
);

// skip the rest timer
await clickByText("رد کردن");
await wait(300);

// --------------------------------------------------------- 2. restart day
const restart = await page.$('button[aria-label="شروع مجدد این روز"]');
check("restart-day button appears after progress", restart !== null);
if (restart) {
  await restart.click();
  await wait(400);
  const overlay = await page.$("#overlay-root");
  await clickByText("شروع مجدد", overlay);
  await wait(500);
  saved = await state();
  check(
    "restart clears set ticks but keeps weights",
    saved.days[0].exercises[0].logs.every((log) => log.done === false) &&
      saved.days[0].exercises[0].logs[0].weight === 20.5,
    JSON.stringify(saved.days[0].exercises[0].logs[0]),
  );
}

// ------------------------------------------------- 3. warm-ups reset by overload
const warmupCheck = await page.$$("main button");
for (const handle of warmupCheck) {
  const label = await handle.evaluate((node) => node.getAttribute("aria-label") ?? "");
  if (label === "انجام شد") {
    await handle.click();
    break;
  }
}
await wait(300);
saved = await state();
const warmupWasChecked = saved.days[0].warmups.some((w) => w.done);
check("warm-up checkbox toggles", warmupWasChecked);

await clickByText("اعمال افزایش وزنه");
await wait(400);
const overlay2 = await page.$("#overlay-root");
await clickByText("اعمال افزایش", overlay2);
await wait(700);
saved = await state();
check(
  "overload resets warm-ups too",
  saved.days[0].warmups.every((w) => w.done === false) && saved.overloadCount === 1,
  `overloadCount=${saved.overloadCount}`,
);

// -------------------------------------------------------- 4. milestone ids
const ids = saved.milestones.map((m) => m.id);
check("milestone ids are unique", new Set(ids).size === ids.length, ids.join(","));

// ----------------------------------------------------- 5. back closes a modal
// The floating rest timer can cover the card's action buttons; dismiss it first
// and invoke the button directly (this check is about the modal/history wiring).
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
const modalsOpen = () =>
  page.evaluate(() => document.querySelectorAll("#overlay-root > div:not(#rest-timer)").length);
const opened = await modalsOpen();
const overlayDebug = await page.evaluate(() =>
  Array.from(document.getElementById("overlay-root").children).map(
    (node) => `${node.tagName}.${node.className.split(" ").slice(0, 3).join(".")}`,
  ),
);
check("gif modal opens", opened === 1, `children=[${overlayDebug.join(" | ")}]`);

await page.evaluate(() => history.back());
await wait(500);
check("Android back closes the modal", (await modalsOpen()) === 0);

// ------------------------------------------------- 6. back returns to workout
const navTo = async (index) => {
  const buttons = await page.$$("#nav-slot nav button");
  await buttons[index].click();
};

await navTo(2);
await wait(500);
const onNutrition = await page.evaluate(() => !document.querySelector("[data-day-count]"));
check("tab switch works", onNutrition);

await page.evaluate(() => history.back());
await wait(500);
const backOnWorkout = await page.evaluate(() => !!document.querySelector("[data-day-count]"));
check("Android back returns to the workout tab", backOnWorkout);

// ------------------------------------------------------------ 7. profile edit
await navTo(3);
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

// -------------------------------------------------------------- 8. no errors
console.log("\n--- runtime errors ---");
console.log(errors.length ? errors.join("\n") : "none");

const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);

await browser.close();
process.exit(failed === 0 ? 0 : 1);
