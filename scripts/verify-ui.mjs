/**
 * Headless UI verification with the locally installed Edge browser.
 *
 * Usage: node scripts/verify-ui.mjs
 * Captures each tab, reports console errors and horizontal overflow.
 */
import fs from "node:fs";
import puppeteer from "puppeteer-core";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const URL = process.env.APP_URL ?? "http://127.0.0.1:4400/";
const OUT = "shots";

fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: "new",
  args: ["--no-sandbox", "--no-proxy-server", "--hide-scrollbars", "--font-render-hinting=none"],
  defaultViewport: { width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
});

const page = await browser.newPage();
const problems = [];
page.on("console", (msg) => {
  if (msg.type() === "error") problems.push(`console: ${msg.text()}`);
});
page.on("pageerror", (err) => problems.push(`pageerror: ${err.message}`));
page.on("requestfailed", (req) => {
  if (!req.url().includes("fonts.g")) problems.push(`requestfailed: ${req.url()}`);
});

await page.goto(URL, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 900));

const metrics = await page.evaluate(() => {
  const doc = document.documentElement;
  const wide = [...document.querySelectorAll("*")]
    .filter((node) => node.getBoundingClientRect().width > doc.clientWidth + 1)
    .slice(0, 8)
    .map((node) => `${node.tagName.toLowerCase()}.${String(node.className).slice(0, 60)} → ${Math.round(node.getBoundingClientRect().width)}px`);
  return {
    clientWidth: doc.clientWidth,
    scrollWidth: doc.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    scrollX: window.scrollX,
    dir: document.documentElement.dir,
    fontFamily: getComputedStyle(document.body).fontFamily,
    fontLoaded: document.fonts.check("16px Vazirmatn"),
    wide,
  };
});
console.log(JSON.stringify(metrics, null, 2));

async function shot(name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log("captured", name);
}

await shot("01-workout");

// Scroll to the first exercise card for a detail shot
await page.evaluate(() => {
  const card = document.querySelector("[data-exercise]");
  card?.scrollIntoView({ block: "start" });
  window.scrollBy(0, -70);
});
await new Promise((r) => setTimeout(r, 500));
await shot("01b-exercise-card");

// Tab navigation
for (const [index, name] of ["02-progress", "03-nutrition", "04-uni", "05-coach"].entries()) {
  const buttons = await page.$$("#nav-slot nav button");
  await buttons[index + 1].click();
  await new Promise((r) => setTimeout(r, 600));
  await shot(name);
}

// Back to workout: complete a set and check the rest timer appears
const navButtons = await page.$$("#nav-slot nav button");
await navButtons[0].click();
await new Promise((r) => setTimeout(r, 500));

const setButtons = await page.$$('[data-row] button');
if (setButtons.length > 0) {
  await setButtons[0].click();
  await new Promise((r) => setTimeout(r, 700));
  const timerVisible = await page.evaluate(() => {
    const node = document.getElementById("rest-timer");
    return node ? !node.classList.contains("hidden") : false;
  });
  console.log("rest timer visible after set toggle:", timerVisible);
  await shot("05-set-logged");
}

// Open the GIF modal for the first exercise
const gifButtons = await page.$$('[data-exercise] .btn-icon');
if (gifButtons.length > 0) {
  await gifButtons[0].click();
  await new Promise((r) => setTimeout(r, 600));
  await shot("06-gif-modal");
  await page.keyboard.press("Escape");
  await new Promise((r) => setTimeout(r, 400));
}

// Open the exercise action menu
const cards = await page.$$("[data-exercise]");
if (cards.length > 0) {
  // Index-based selection broke once the card gained a history button.
  const menuBtn = await cards[0].$('.btn-icon[aria-label="گزینه‌های حرکت"]');
  if (menuBtn) {
    await menuBtn.click();
    await new Promise((r) => setTimeout(r, 500));
    await shot("07-exercise-menu");
    await page.keyboard.press("Escape");
  }
}

console.log("\n--- problems ---");
console.log(problems.length ? problems.join("\n") : "none");

await browser.close();
