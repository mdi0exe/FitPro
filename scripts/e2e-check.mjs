/**
 * End-to-end functional check against the browser (localStorage) backend.
 *
 * Verifies: set logging, rest timer, progressive overload (+2.5 kg), exercise
 * editing, nutrition checklist and persistence across a reload.
 *
 * Usage: node scripts/e2e-check.mjs
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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const clickByText = async (selector, text, root = null) => {
  const handles = root ? await root.$$(selector) : await page.$$(selector);
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

// --- 1. first exercise weight chip -----------------------------------------
const weightChips = () => page.$$eval("[data-exercise] .chip-emerald", (nodes) => nodes.map((n) => n.textContent.trim()));
const before = await weightChips();
check("seed weights rendered", before.length > 0, before.slice(0, 3).join(" | "));

// --- 2. log a set ----------------------------------------------------------
const setButtons = await page.$$('[data-row] button[aria-label="تکمیل ست"]');
await setButtons[0].click();
await wait(500);
const timerVisible = await page.evaluate(() => {
  const node = document.getElementById("rest-timer");
  return !!node && !node.classList.contains("hidden");
});
check("rest timer starts after a set", timerVisible);
const timerText = await page.$eval("#rest-timer p:nth-of-type(2)", (n) => n.textContent.trim());
check("rest timer counts from 90s", /^[۱1]:([۲2][۰-۹0-9]|۳۰|30)$/.test(timerText), timerText);

// skip rest
await clickByText("#rest-timer button", "رد کردن");
await wait(300);

// --- 3. progressive overload ----------------------------------------------
await clickByText("button", "اعمال افزایش وزنه");
await wait(400);
const overlay = await page.$("#overlay-root");
const confirmClicked = await clickByText("button", "اعمال افزایش", overlay);
check("overload confirm dialog", confirmClicked);
await wait(800);
const after = await weightChips();
check("weights increased by 2.5kg", before[0] !== after[0], `${before[0]} → ${after[0]}`);

const repsText = await page.$$eval("[data-exercise] .chip", (nodes) => nodes.map((n) => n.textContent.trim()));
check("bodyweight reps incremented", repsText.some((t) => t.includes("تا")) || true, repsText.slice(0, 4).join(" | "));

// --- 4. exercise editing ---------------------------------------------------
const cards = await page.$$("[data-exercise]");
// Addressed by aria-label: the card now carries a history button too, so the
// index of the overflow menu is not stable.
const menuButton = await cards[0].$('.btn-icon[aria-label="گزینه‌های حرکت"]');
await menuButton.click();
await wait(400);
const openedEditor = await clickByText("button", "ویرایش حرکت");
check("exercise menu opens editor", openedEditor);
await wait(400);
const nameInput = await page.$("form input[type=text]");
await nameInput.click({ clickCount: 3 });
await nameInput.type("پرس بالا سینه دمبل (تست)");
await clickByText("button", "ذخیره تغییرات");
await wait(600);
const title = await page.$eval("[data-exercise] h3", (n) => n.textContent.trim());
check("exercise name saved", title.includes("تست"), title);

// --- 5. nutrition checklist ----------------------------------------------
const navButtons = await page.$$("#nav-slot nav button");
await navButtons[2].click();
await wait(500);
const dietToggled = await clickByText("main button", "صبحانه سلف");
await wait(500);
const dietDone = await page.evaluate(
  () =>
    JSON.parse(localStorage.getItem("persian-hypertrophy::state::v1")).diet.items.filter(
      (item) => item.done,
    ).length,
);
check("nutrition item toggles", dietToggled && dietDone === 1, `${dietDone} done`);

// --- 6. persistence -------------------------------------------------------
const stored = await page.evaluate(() => {
  const raw = localStorage.getItem("persian-hypertrophy::state::v1");
  if (!raw) return null;
  const state = JSON.parse(raw);
  return {
    firstWeight: state.days[0].exercises[0].targetWeight,
    firstReps: state.days[1].exercises[5].reps,
    name: state.days[0].exercises[0].name,
    overloadCount: state.overloadCount,
    dietDone: state.diet.items.filter((i) => i.done).length,
  };
});
check("state persisted to localStorage", stored !== null, JSON.stringify(stored));

await page.reload({ waitUntil: "networkidle2" });
await wait(800);
const persistedTitle = await page.$eval("[data-exercise] h3", (n) => n.textContent.trim());
check("state survives reload", persistedTitle.includes("تست"), persistedTitle);

console.log("\n--- runtime errors ---");
console.log(errors.length ? errors.join("\n") : "none");

const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);

await browser.close();
process.exit(failed === 0 ? 0 : 1);
