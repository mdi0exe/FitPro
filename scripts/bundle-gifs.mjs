/**
 * Bundles offline exercise demos into `public/gifs/<id>.svg`.
 *
 * Why: `fitnessprogramer.com` sits behind Cloudflare and answers 403 to the
 * Android WebView (no cookies, no referer, flaky gym Wi-Fi), so every remote GIF
 * silently failed. Instead of shipping hotlinks, this script pulls the two
 * reference photos of each movement from the open-source
 * `yuhonas/free-exercise-db` (public domain), shrinks them, and embeds them as
 * base64 JPEGs inside a 2-frame animated SVG. The result is a single small file
 * per exercise that lives in the APK and needs no network at all.
 *
 * Usage: node scripts/bundle-gifs.mjs
 *   --force   re-download every file even if it already exists
 *
 * The generated files are committed; CI never runs this script (no browser and
 * no network access needed at build time).
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const OUT_DIR = path.resolve("public", "gifs");
const CACHE_DIR = path.resolve(".tmp", "gifs-cache");
const DB_URL = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";
const IMG_BASE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/";

/** Max width of the embedded photos (the card renders ~400 CSS px wide). */
const MAX_WIDTH = 460;
const JPEG_QUALITY = 0.72;
const FORCE = process.argv.includes("--force");

/**
 * Our exercise/warm-up id → candidate folder ids in free-exercise-db, best first.
 * Warm-ups are shared: day 1 & 3 use the upper-body set, day 2 & 4 the lower one.
 */
const EXERCISE_MAP = {
  // ---------------------------------------------------------------- Day 1
  d1e1: ["Incline_Dumbbell_Press", "Incline_Dumbbell_Press_Reverse-Grip"],
  d1e2: ["Wide-Grip_Lat_Pulldown", "Full_Range-Of-Motion_Lat_Pulldown"],
  d1e3: ["Leverage_Chest_Press", "Machine_Bench_Press"],
  d1e4: ["Seated_Cable_Rows", "Elevated_Cable_Rows"],
  d1e5: ["Side_Lateral_Raise", "Dumbbell_Raise"],
  d1e6: ["EZ-Bar_Curl", "Close-Grip_EZ_Bar_Curl"],
  d1e7: ["Triceps_Pushdown_-_Rope_Attachment", "Triceps_Pushdown"],
  // ---------------------------------------------------------------- Day 2
  d2e1: ["Leg_Press", "Narrow_Stance_Leg_Press"],
  d2e2: ["Smith_Machine_Squat", "Goblet_Squat"],
  d2e3: ["Leg_Extensions", "Single-Leg_Leg_Extension"],
  d2e4: ["Lying_Leg_Curls", "Seated_Leg_Curl"],
  d2e5: ["Seated_Calf_Raise", "Standing_Calf_Raises"],
  d2e6: ["Hanging_Leg_Raise", "Hanging_Pike"],
  // ---------------------------------------------------------------- Day 3
  d3e1: ["Dumbbell_Shoulder_Press", "Seated_Dumbbell_Press"],
  d3e2: ["Underhand_Cable_Pulldowns", "Close-Grip_Front_Lat_Pulldown"],
  d3e3: ["Butterfly", "Dumbbell_Flyes"],
  d3e4: ["Lying_T-Bar_Row", "T-Bar_Row_with_Handle"],
  d3e5: ["Reverse_Machine_Flyes", "Seated_Bent-Over_Rear_Delt_Raise"],
  d3e6: ["Machine_Preacher_Curls", "Preacher_Curl"],
  d3e7: ["Dip_Machine", "Tricep_Dips"],
  // ---------------------------------------------------------------- Day 4
  d4e1: ["Romanian_Deadlift", "Stiff-Legged_Dumbbell_Deadlift"],
  d4e2: ["Hack_Squat", "Barbell_Hack_Squat"],
  d4e3: ["Dumbbell_Lunges", "Dumbbell_Rear_Lunge"],
  d4e4: ["Seated_Leg_Curl", "Lying_Leg_Curls"],
  d4e5: ["Standing_Calf_Raises", "Calf_Press_On_The_Leg_Press_Machine"],
  d4e6: ["Palms-Up_Barbell_Wrist_Curl_Over_A_Bench", "Palms-Up_Dumbbell_Wrist_Curl_Over_A_Bench"],
  // ------------------------------------------------- warm-ups (upper body)
  "wu-upper-1": ["Jogging_Treadmill", "Walking_Treadmill"],
  "wu-upper-2": ["Arm_Circles"],
  "wu-upper-3": ["Dynamic_Chest_Stretch", "Behind_Head_Chest_Stretch"],
  "wu-upper-4": ["External_Rotation", "External_Rotation_with_Band"],
  "wu-upper-5": ["Incline_Dumbbell_Press"],
  // ------------------------------------------------- warm-ups (lower body)
  "wu-lower-1": ["Bicycling_Stationary", "Bicycling"],
  "wu-lower-2": ["Bodyweight_Squat", "Barbell_Lunge"],
  "wu-lower-3": ["Bodyweight_Squat"],
  "wu-lower-4": ["Ankle_Circles"],
  "wu-lower-5": ["Leg_Press"],
};

const BROWSER_CANDIDATES = [
  process.env.EDGE_PATH,
  process.env.CHROME_PATH,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/microsoft-edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchBuffer(url, attempt = 1) {
  try {
    const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (FitPro icon bundler)" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } catch (error) {
    if (attempt >= 3) throw error;
    await wait(400 * attempt);
    return fetchBuffer(url, attempt + 1);
  }
}

/** Two frames, hard-cut like a GIF. `steps(1)` keeps the pose crisp. */
function buildAnimatedSvg(frameA, frameB) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 280" width="420" height="280">
<style>.b{animation:alt 1.8s steps(1,end) infinite}@keyframes alt{0%,49.99%{opacity:0}50%,100%{opacity:1}}</style>
<rect width="420" height="280" fill="#020617"/>
<image href="data:image/jpeg;base64,${frameA}" x="0" y="0" width="420" height="280" preserveAspectRatio="xMidYMid meet"/>
<image class="b" href="data:image/jpeg;base64,${frameB}" x="0" y="0" width="420" height="280" preserveAspectRatio="xMidYMid meet"/>
</svg>`;
}

/** Last resort so no movement is ever left without a picture. */
function buildFallbackSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 280" width="420" height="280">
<rect width="420" height="280" rx="16" fill="#091326"/>
<circle cx="210" cy="140" r="100" fill="#10b981" fill-opacity="0.08"/>
<g transform="translate(210,150)">
  <g>
    <animateTransform attributeName="transform" type="translate" values="0,14; 0,-24; 0,14" dur="1.5s" repeatCount="indefinite"/>
    <rect x="-110" y="-8" width="220" height="10" rx="5" fill="#94a3b8"/>
    <rect x="-95" y="-38" width="22" height="70" rx="6" fill="#10b981"/>
    <rect x="-122" y="-28" width="18" height="50" rx="5" fill="#22d3ee"/>
    <rect x="73" y="-38" width="22" height="70" rx="6" fill="#10b981"/>
    <rect x="104" y="-28" width="18" height="50" rx="5" fill="#22d3ee"/>
  </g>
</g>
</svg>`;
}

/** Shrinks + re-encodes a JPEG through a canvas (keeps the APK small). */
async function makeShrinker() {
  const executablePath = BROWSER_CANDIDATES.find((candidate) => fs.existsSync(candidate));
  if (!executablePath) {
    console.log("! No Chromium/Edge found — embedding the original JPEGs (bigger files).");
    return async (buffer) => buffer.toString("base64");
  }

  const browser = await puppeteer.launch({
    executablePath,
    headless: "new",
    args: ["--no-sandbox", "--hide-scrollbars"],
  });
  const page = await browser.newPage();
  await page.setContent("<!doctype html><html><body></body></html>", { waitUntil: "load" });

  const shrink = async (buffer) => {
    const base64 = buffer.toString("base64");
    return page.evaluate(
      async (src, maxWidth, quality) => {
        const img = new Image();
        img.src = `data:image/jpeg;base64,${src}`;
        await img.decode();
        const scale = Math.min(1, maxWidth / img.naturalWidth);
        const width = Math.max(1, Math.round(img.naturalWidth * scale));
        const height = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.drawImage(img, 0, 0, width, height);
        return canvas.toDataURL("image/jpeg", quality).split(",")[1];
      },
      base64,
      MAX_WIDTH,
      JPEG_QUALITY,
    );
  };

  return { shrink, close: () => browser.close() };
}

async function downloadFrames(folder) {
  const [frameA, frameB] = await Promise.all([
    fetchBuffer(`${IMG_BASE}${folder}/0.jpg`),
    fetchBuffer(`${IMG_BASE}${folder}/1.jpg`),
  ]);
  return [frameA, frameB];
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  console.log(`Fetching the exercise index …`);
  let index;
  try {
    index = JSON.parse((await fetchBuffer(DB_URL)).toString("utf8"));
  } catch (error) {
    const cached = path.join(CACHE_DIR, "exercises.json");
    if (!fs.existsSync(cached)) throw error;
    console.log("! Index download failed, using the cached copy.");
    index = JSON.parse(fs.readFileSync(cached, "utf8"));
  }
  fs.writeFileSync(path.join(CACHE_DIR, "exercises.json"), JSON.stringify(index));
  const known = new Set(index.map((entry) => entry.id));
  console.log(`  ${known.size} movements in the database\n`);

  const shrinker = await makeShrinker();
  const shrink = typeof shrinker === "function" ? shrinker : shrinker.shrink;

  let bundled = 0;
  let fallback = 0;
  let totalBytes = 0;

  for (const [id, candidates] of Object.entries(EXERCISE_MAP)) {
    const outFile = path.join(OUT_DIR, `${id}.svg`);
    if (!FORCE && fs.existsSync(outFile)) {
      totalBytes += fs.statSync(outFile).size;
      bundled += 1;
      continue;
    }

    let written = false;
    for (const folder of candidates) {
      if (!known.has(folder)) continue;
      try {
        const [frameA, frameB] = await downloadFrames(folder);
        const [a, b] = await Promise.all([shrink(frameA), shrink(frameB)]);
        const svg = buildAnimatedSvg(a, b);
        fs.writeFileSync(outFile, svg, "utf8");
        totalBytes += svg.length;
        console.log(`✓ ${id.padEnd(12)} ← ${folder} (${(svg.length / 1024).toFixed(0)} KB)`);
        written = true;
        bundled += 1;
        break;
      } catch {
        // Try the next candidate folder.
      }
    }

    if (!written) {
      const svg = buildFallbackSvg();
      fs.writeFileSync(outFile, svg, "utf8");
      totalBytes += svg.length;
      console.log(`! ${id.padEnd(12)} ← animated vector fallback`);
      fallback += 1;
    }
  }

  if (typeof shrinker !== "function") await shrinker.close();

  console.log(
    `\n${bundled} real demos, ${fallback} fallbacks, ${(totalBytes / 1024 / 1024).toFixed(2)} MB total`,
  );
  console.log(`Output: ${path.relative(process.cwd(), OUT_DIR)}`);
}

await main();
