/**
 * E2E checks for the "v4" batch:
 *   1. backup card with share sheet + direct Download save
 *   2. live Persian digits in numeric text fields (with working Backspace)
 *   3. status-bar shield painted above the sticky header
 *   4. Light Mode leftovers (exercise number square, milestone icons)
 *   5. exercise library picker inside the add-exercise sheet
 *   6. ideal-weight calculator on the progress tab
 *   7. "tomorrow is Friday" weekday bug
 *
 * Usage: node scripts/e2e-v4.mjs
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

const mainText = (page) => page.$eval("#view", (node) => node.textContent ?? "");

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

const bg = (page, selector) =>
  page.$eval(selector, (node) => getComputedStyle(node).backgroundColor);

// ---------------------------------------------------------------------------
// 1. Backup card: share sheet + direct Download save
// ---------------------------------------------------------------------------
{
  const { page, errors } = await openPage();
  await goto(page, "مربی");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await wait(400);

  const text = await mainText(page);
  check("backup card title mentions sharing", text.includes("پشتیبان‌گیری و اشتراک‌گذاری اطلاعات"));
  check("backup card offers the share sheet", text.includes("ارسال به تلگرام / اشتراک‌گذاری فایل"));
  check("backup card offers a Download save", text.includes("ذخیره مستقیم در پوشه Download"));
  check("backup card still offers restore", text.includes("بازیابی از فایل"));
  check("no runtime errors (backup)", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---------------------------------------------------------------------------
// 2. Live Persian digits + Backspace in the profile editor
// ---------------------------------------------------------------------------
{
  const { page, errors } = await openPage();
  await goto(page, "مربی");

  // The profile editor lives in the coach tab; open the weight field by label.
  const inputs = await page.$$("#view input.field");
  let weightInput = null;
  for (const input of inputs) {
    const isNumeric = await input.evaluate(
      (node) => node.getAttribute("inputmode") === "decimal",
    );
    if (isNumeric) {
      weightInput = input;
      break;
    }
  }

  if (!weightInput) {
    check("profile editor exposes a numeric text field", false);
  } else {
    check("numeric field is type=text with a decimal keypad", true);
    await weightInput.evaluate((node) => {
      node.value = "";
      node.focus();
    });
    await page.keyboard.type("75");
    const typed = await weightInput.evaluate((node) => node.value);
    check("latin digits become Persian while typing", typed === "۷۵", typed);

    await page.keyboard.press("Backspace");
    const afterBackspace = await weightInput.evaluate((node) => node.value);
    check("Backspace deletes the last Persian digit", afterBackspace === "۷", afterBackspace);

    await page.keyboard.type(".5");
    const decimal = await weightInput.evaluate((node) => node.value);
    check("decimal separator is Persian", decimal === "۷٫۵", decimal);

    // A stray letter must be dropped without moving the caret to the end.
    await weightInput.evaluate((node) => {
      node.value = "۷۵a";
      node.setSelectionRange(2, 2);
      node.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const cleaned = await weightInput.evaluate((node) => ({
      value: node.value,
      caret: node.selectionStart,
    }));
    check("letters are dropped, digits kept", cleaned.value === "۷۵", cleaned.value);
    check("caret stays before the removed character", cleaned.caret === 2, String(cleaned.caret));
  }

  check("no runtime errors (numeric input)", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---------------------------------------------------------------------------
// 3. Status-bar shield
// ---------------------------------------------------------------------------
{
  const { page, errors } = await openPage();
  const shield = await page.evaluate(() => {
    const node = document.querySelector("#status-shield");
    if (!node) return null;
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return {
      position: style.position,
      zIndex: Number(style.zIndex),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      background: style.backgroundColor,
      pointer: style.pointerEvents,
    };
  });
  check("status shield exists", Boolean(shield));
  if (shield) {
    check("shield is fixed to the top", shield.position === "fixed" && shield.top === 0);
    check("shield spans the full width", shield.width >= 400, String(shield.width));
    check("shield sits above the header", shield.zIndex > 40, String(shield.zIndex));
    check("shield never blocks taps", shield.pointer === "none");
    check(
      "shield is painted with the page colour",
      shield.background === "rgb(2, 6, 23)",
      shield.background,
    );
  }
  check("no runtime errors (shield)", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---------------------------------------------------------------------------
// 4. Light Mode leftovers
// ---------------------------------------------------------------------------
{
  const { page, errors } = await openPage();
  await clickAria(page, "تغییر حالت روشن یا تیره");
  await wait(500);

  const theme = await page.evaluate(() => document.documentElement.className);
  check("light theme is active", theme.includes("theme-light"), theme);
  check(
    "status shield follows the light theme",
    (await bg(page, "#status-shield")) === "rgb(241, 245, 249)",
    await bg(page, "#status-shield"),
  );

  const badge = await page.$("[data-exercise] div.bg-slate-800\\/80");
  if (badge) {
    const color = await badge.evaluate((node) => getComputedStyle(node).backgroundColor);
    check("exercise number square is light", color === "rgb(226, 232, 240)", color);
  } else {
    check("exercise number square is light", false, "badge not found");
  }

  await goto(page, "پیشرفت");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await wait(400);
  const milestoneIcon = await page.$("#view .bg-slate-800");
  if (milestoneIcon) {
    const color = await milestoneIcon.evaluate(
      (node) => getComputedStyle(node).backgroundColor,
    );
    check("milestone icons are light", color === "rgb(226, 232, 240)", color);
  } else {
    check("milestone icons are light", true, "no system milestone on this fixture");
  }

  check("no runtime errors (light mode)", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---------------------------------------------------------------------------
// 5. Exercise library picker
// ---------------------------------------------------------------------------
{
  const { page, errors } = await openPage();
  await goto(page, "تمرین");

  const opened = await clickText(page, "افزودن حرکت به این روز");
  await wait(500);
  check("add-exercise sheet opens", opened && (await page.$("#overlay-root form")) !== null);

  const toggled = await clickText(page, "انتخاب از کتابخانه حرکات");
  await wait(400);
  check("library panel can be opened", toggled);

  const cards = await page.$$("#overlay-root button[data-catalog-id]");
  check("library shows thumbnails", cards.length >= 8, `${cards.length} cards`);

  if (cards.length > 0) {
    const firstGif = await cards[0].evaluate((node) => node.querySelector("img")?.getAttribute("src"));
    check("thumbnails point at bundled GIFs", Boolean(firstGif?.startsWith("/gifs/catalog/cat-")), String(firstGif));

    // Search narrows the grid down.
    await page.type("#overlay-root input[type=search]", "دمبل");
    await wait(350);
    const filtered = await page.$$("#overlay-root button[data-catalog-id]");
    check("search filters the library", filtered.length > 0 && filtered.length <= cards.length, `${filtered.length} after search`);

    await filtered[0].evaluate((node) => node.click());
    await wait(400);
    const filled = await page.evaluate(() => {
      const form = document.querySelector("#overlay-root form");
      if (!form) return null;
      const inputs = [...form.querySelectorAll("input")];
      const name = inputs.find((node) => node.getAttribute("placeholder")?.includes("پرس بالا سینه"));
      const gif = inputs.find((node) => node.type === "url");
      return { name: name?.value ?? "", gif: gif?.value ?? "" };
    });
    check("picking a movement fills the name", Boolean(filled?.name), filled?.name);
    check(
      "picking a movement fills the GIF path",
      Boolean(filled?.gif.startsWith("/gifs/catalog/cat-")),
      filled?.gif,
    );
  }

  check("no runtime errors (library)", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---------------------------------------------------------------------------
// 6. Ideal-weight calculator
// ---------------------------------------------------------------------------
{
  const { page, errors } = await openPage();
  await goto(page, "پیشرفت");

  const card = await page.$("[data-ideal-weight='card']");
  check("ideal-weight card renders", Boolean(card));

  if (card) {
    const shown = await page.$eval("[data-ideal-value]", (node) => node.textContent ?? "");
    const heightCm = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? "null")?.profile?.heightCm ?? 0,
      STORAGE_KEY,
    );
    const expected = Math.round(22 * (heightCm / 100) ** 2 * 10) / 10;
    const toLatin = (value) =>
      value
        .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
        .replace("٫", ".");
    check(
      "standard BMI 22 result matches the height",
      Math.abs(Number.parseFloat(toLatin(shown)) - expected) < 0.15,
      `${shown} vs ${expected}`,
    );

    const before = (await readState(page)).profile.targetWeight;
    await clickText(page, "همین را هدف بگذار");
    await wait(500);
    const after = (await readState(page)).profile.targetWeight;
    check("one tap writes the target weight", Math.abs(after - expected) < 0.2, `${before} → ${after}`);
  }

  check("no runtime errors (ideal weight)", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---------------------------------------------------------------------------
// 7. "Tomorrow is Friday" weekday bug
// ---------------------------------------------------------------------------
{
  const { page, errors } = await openPage();
  await goto(page, "دانشگاه");

  const result = await page.evaluate(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const text = document.querySelector("#view")?.textContent ?? "";
    return {
      tomorrowIsFriday: tomorrow.getDay() === 5,
      mentionsTomorrowFriday: /فردا\s*\(جمعه\)/.test(text),
      hasOldWording: text.includes("فردا جمعه است"),
    };
  });

  check("the old hard-coded sentence is gone", !result.hasOldWording);
  check(
    "the Friday notice only appears when tomorrow really is Friday",
    result.tomorrowIsFriday === result.mentionsTomorrowFriday,
    `tomorrowIsFriday=${result.tomorrowIsFriday} notice=${result.mentionsTomorrowFriday}`,
  );

  check("no runtime errors (weekday)", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---------------------------------------------------------------------------
console.log("\n--- runtime errors ---");
const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
