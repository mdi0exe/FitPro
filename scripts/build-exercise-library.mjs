#!/usr/bin/env node
/**
 * Builds the searchable exercise library used by the "add exercise" editor.
 *
 * Source: `hasaneyldrm/exercises-dataset` (the same repo the programme GIFs come
 * from). It has ~1300 movements with an English name, a target muscle and an
 * animated GIF, but no Persian text — so this script does three things:
 *
 *   1. picks the most gym-useful movements per muscle group,
 *   2. composes a Persian name from a word dictionary
 *      (`dumbbell incline bench press` → `پرس سینه شیب‌دار دمبل`),
 *   3. downloads the GIF to `public/gifs/catalog/cat-<id>.gif` and writes
 *      `src/data/exerciseCatalog.ts`.
 *
 * The GIFs are committed so the APK ships them: nothing is fetched at runtime.
 *
 * Usage: node scripts/build-exercise-library.mjs [--limit 10] [--force] [--refresh]
 */
import fs from "node:fs";
import path from "node:path";

const OUT_DIR = path.resolve("public", "gifs", "catalog");
const CATALOG_FILE = path.resolve("src", "data", "exerciseCatalog.ts");
const CACHE = path.resolve(".tmp", "dataset-exercises.json");
const REPO_RAW = "https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main";
const DATA_URL = `${REPO_RAW}/data/exercises.json`;

const FORCE = process.argv.includes("--force");
const REFRESH = process.argv.includes("--refresh");
const LIMIT = (() => {
  const index = process.argv.indexOf("--limit");
  const value = index === -1 ? Number.NaN : Number.parseInt(process.argv[index + 1], 10);
  return Number.isFinite(value) && value > 0 ? value : 10;
})();

// ---------------------------------------------------------------------------
// Muscle groups
// ---------------------------------------------------------------------------

/** Picker tabs, in the order a training week is usually organised. */
const MUSCLES = [
  { key: "chest", label: "سینه", targets: ["pectorals", "serratus anterior"] },
  { key: "back", label: "زیربغل", targets: ["lats", "upper back"] },
  { key: "shoulders", label: "سرشانه", targets: ["delts", "traps", "levator scapulae"] },
  { key: "biceps", label: "جلو بازو", targets: ["biceps"] },
  { key: "triceps", label: "پشت بازو", targets: ["triceps"] },
  { key: "quads", label: "چهارسر ران", targets: ["quads"] },
  { key: "hamstrings", label: "همسترینگ", targets: ["hamstrings"] },
  { key: "glutes", label: "باسن", targets: ["glutes"] },
  { key: "calves", label: "ساق پا", targets: ["calves"] },
  { key: "abs", label: "شکم", targets: ["abs", "spine"] },
  { key: "forearms", label: "ساعد", targets: ["forearms"] },
  { key: "cardio", label: "هوازی", targets: ["cardiovascular system"] },
];

// ---------------------------------------------------------------------------
// Persian naming
// ---------------------------------------------------------------------------

/** Equipment → Persian, also used for the small badge under each thumbnail. */
const EQUIPMENT_FA = {
  barbell: "هالتر",
  "olympic barbell": "هالتر المپیک",
  "ez barbell": "هالتر خم",
  "trap bar": "هالتر ترپ",
  dumbbell: "دمبل",
  cable: "سیم‌کش",
  "leverage machine": "دستگاه",
  "smith machine": "اسمیت",
  "sled machine": "دستگاه اسلیج",
  "body weight": "وزن بدن",
  kettlebell: "کتل‌بل",
  band: "کش",
  "resistance band": "کش",
  weighted: "با وزنه",
  "stability ball": "توپ",
  "medicine ball": "توپ طبی",
  assisted: "کمکی",
  "bosu ball": "بوسو",
  rope: "طناب",
  hammer: "چکش",
  "stepmill machine": "پله",
  "stationary bike": "دوچرخه ثابت",
  "elliptical machine": "الپتیکال",
  "skierg machine": "اسکی‌ارگ",
  "upper body ergometer": "ارگومتر",
  "wheel roller": "چرخ شکم",
  roller: "فوم رولر",
  tire: "تایر",
};

/** Movements, most specific first — the first hit wins. */
const MOVEMENT_FA = [
  ["romanian deadlift", "ددلیفت رومانیایی"],
  ["stiff leg deadlift", "ددلیفت پا صاف"],
  ["leg press", "پرس پا"],
  ["calf press", "پرس ساق"],
  ["calf raise", "ساق"],
  ["lateral raise", "نشر از جانب"],
  ["front raise", "نشر از جلو"],
  ["reverse fly", "نشر خم"],
  ["rear delt", "نشر خم"],
  ["pec deck", "پروانه دستگاه"],
  ["bench press", "پرس سینه"],
  ["chest press", "پرس سینه"],
  ["shoulder press", "پرس سرشانه"],
  ["overhead press", "پرس سرشانه"],
  ["military press", "پرس سرشانه"],
  ["push press", "پرس سرشانه"],
  ["hip thrust", "هیپ تراست"],
  ["hip abduction", "باز کردن ران"],
  ["hip adduction", "جمع کردن ران"],
  ["good morning", "گود مورنینگ"],
  ["split squat", "اسکوات بلغاری"],
  ["hack squat", "اسکوات هک"],
  ["goblet squat", "اسکوات گابلت"],
  ["squat", "اسکوات"],
  ["deadlift", "ددلیفت"],
  ["leg extension", "جلو پا"],
  ["leg curl", "پشت پا"],
  ["pushdown", "پشت بازو سیم‌کش"],
  ["skull crusher", "پشت بازو خوابیده"],
  ["triceps extension", "پشت بازو"],
  ["triceps dip", "دیپ پشت بازو"],
  ["preacher curl", "جلو بازو لاری"],
  ["hammer curl", "جلو بازو چکشی"],
  ["concentration curl", "جلو بازو تمرکزی"],
  ["wrist curl", "مچ"],
  ["biceps curl", "جلو بازو"],
  ["curl", "جلو بازو"],
  ["pulldown", "زیربغل سیم‌کش"],
  ["pull up", "بارفیکس"],
  ["chin up", "بارفیکس"],
  ["pullover", "پولاور"],
  ["upright row", "نشر ایستاده"],
  ["row", "پارویی"],
  ["shrug", "شراگ"],
  ["fly", "پروانه"],
  ["push up", "شنا"],
  ["push up", "شنا"],
  ["muscle up", "ماسل‌آپ"],
  ["dip", "دیپ"],
  ["crunch", "کرانچ"],
  ["sit up", "درازنشست"],
  ["leg raise", "بالا آوردن پا"],
  ["knee raise", "بالا آوردن زانو"],
  ["plank", "پلانک"],
  ["russian twist", "چرخش روسی"],
  ["twist", "چرخش"],
  ["step up", "استپ آپ"],
  ["lunge", "لانج"],
  ["run", "دویدن"],
  ["walk", "پیاده‌روی"],
  ["bike", "دوچرخه"],
  ["elliptical", "الپتیکال"],
  ["burpee", "برپی"],
  ["jump", "پرش"],
  ["cross trainer", "الپتیکال"],
  ["back extension", "اکستنشن کمر"],
  ["hip extension", "اکستنشن لگن"],
  ["hip raise", "بالا آوردن لگن"],
  ["side bend", "خم پهلو"],
  ["toe touch", "خم شدن به جلو"],
  ["windmill", "آسیاب"],
  ["judo flip", "چرخش شکم"],
  ["hang clean", "کلین"],
  ["clean", "کلین"],
  ["snatch", "اسنچ"],
  ["gripper", "فشار دست"],
  ["hand squeeze", "فشار دست"],
  ["finger curls", "جلو بازو انگشتی"],
  ["femoral", "پشت پا"],
  ["glute ham", "پشت پا"],
  ["high knee", "زانو بلند"],
  ["v up", "وی‌آپ"],
  ["press", "پرس"],
  ["raise", "بالا آوردن"],
  ["extension", "اکستنشن"],
  ["stretch", "کشش"],
];

/** Modifiers, longest first so `close grip` wins over `grip`. */
const MODIFIER_FA = [
  ["full range of motion", ""],
  ["behind neck", "پشت گردن"],
  ["close grip", "دست نزدیک"],
  ["wide grip", "دست باز"],
  ["reverse grip", "معکوس"],
  ["neutral grip", "دست خنثی"],
  ["bent over", "خم"],
  ["single arm", "یک‌دست"],
  ["one arm", "یک‌دست"],
  ["single leg", "تک‌پا"],
  ["one leg", "تک‌پا"],
  ["alternating", "متناوب"],
  ["alternate", "متناوب"],
  ["incline", "شیب‌دار"],
  ["decline", "شیب منفی"],
  ["seated", "نشسته"],
  ["standing", "ایستاده"],
  ["lying", "خوابیده"],
  ["kneeling", "زانوزده"],
  ["overhead", "از بالای سر"],
  ["overhand", "دست از بالا"],
  ["underhand", "دست از پایین"],
  ["sumo", "سومو"],
  ["deficit", "از ارتفاع"],
  ["smith", "اسمیت"],
  ["machine", "دستگاه"],
  ["cable", "سیم‌کش"],
  ["dumbbell", "دمبل"],
  ["barbell", "هالتر"],
  ["bodyweight", "وزن بدن"],
  ["body weight", "وزن بدن"],
  ["female", ""],
  ["male", ""],
  ["v. 2", ""],
  ["v. 3", ""],
  ["v. 4", ""],
  ["front", "جلو"],
  ["rear", "عقب"],
  ["high", "بلند"],
  ["low", "کوتاه"],
  ["paused", "با توقف"],
  ["tempo", "کنترل‌شده"],
];


/**
 * Whole-word test — `low` must not match inside `lower`, and a parenthesis
 * (`dip (kneeling)`) still counts as a word boundary.
 */
function hasWord(text, needle) {
  return new RegExp(`(?<![a-z0-9])${escapeRegExp(needle)}(?![a-z0-9])`).test(text);
}

function replaceWord(text, needle) {
  return text.replace(new RegExp(`(?<![a-z0-9])${escapeRegExp(needle)}(?![a-z0-9])`, "g"), " ");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Composes a Persian name from the English one.
 *
 * Word-by-word translation is not enough (`bench press` is a unit, `incline` is
 * a modifier that must follow the movement), so the order is always
 * `movement + modifiers + equipment` — the same order an Iranian coach would
 * say it in: «پرس سینه شیب‌دار دمبل».
 */
function persianName(english, equipment, muscleLabel = "حرکت") {
  // `close-grip` must match `close grip`, so hyphens become spaces first.
  const name = english.toLowerCase().replace(/[-\u2010-\u2015]/g, " ").replace(/\s+/g, " ");
  const parts = [];

  let rest = name;
  for (const [needle, label] of MOVEMENT_FA) {
    if (!hasWord(rest, needle)) continue;
    parts.push(label);
    rest = replaceWord(rest, needle);
    break;
  }

  const equipmentFa = EQUIPMENT_FA[equipment] ?? "دستگاه";
  const head = parts[0] ?? `تمرین ${muscleLabel}`;
  const modifiers = [];
  for (const [needle, label] of MODIFIER_FA) {
    if (!label) continue;
    if (!hasWord(rest, needle)) continue;
    // Never repeat the equipment: `ez barbell` + a `barbell` modifier printed
    // «هالتر هالتر خم», and `cable` + `cable` printed «سیم‌کش … سیم‌کش».
    if (equipmentFa.includes(label) || label.includes(equipmentFa)) continue;
    if (head.includes(label)) continue;
    modifiers.push(label);
    rest = replaceWord(rest, needle);
  }

  // `زیربغل سیم‌کش` + `سیم‌کش` printed «زیربغل سیم‌کش سیم‌کش».
  const pieces = [head, ...modifiers, head.includes(equipmentFa) ? "" : equipmentFa].filter(
    Boolean,
  );

  // Drop repeats anywhere, not just adjacent ones.
  const seen = new Set();
  const deduped = pieces.filter((piece) => {
    if (seen.has(piece)) return false;
    seen.add(piece);
    return true;
  });
  return deduped.join(" ").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

/** Gym equipment first: the app is used in a university gym, not a studio. */
const EQUIPMENT_SCORE = {
  barbell: 9,
  dumbbell: 9,
  cable: 8,
  "leverage machine": 8,
  "smith machine": 7,
  "ez barbell": 7,
  "sled machine": 6,
  kettlebell: 5,
  "body weight": 5,
  "olympic barbell": 4,
  weighted: 3,
  band: 2,
  "resistance band": 2,
  "stability ball": 1,
  "medicine ball": 1,
  assisted: 0,
};

/** Entries whose name says they are a variation of something else. */
const SKIP_WORDS = [
  "stretch",
  "mobility",
  "yoga",
  "foam roller",
  "bosu",
  "wheel roller",
  "tire",
  "skierg",
  "ergometer",
  "elliptical",
  "stepmill",
  "stationary bike",
  "rope",
  "suspension",
  "self assisted",
  "on knees",
];

/** Movements a student actually looks for, ranked above dataset oddities. */
const COMMON_MOVEMENTS = [
  "bench press",
  "squat",
  "deadlift",
  "leg press",
  "leg curl",
  "leg extension",
  "pulldown",
  "pull up",
  "push up",
  "row",
  "press",
  "curl",
  "raise",
  "fly",
  "extension",
  "pushdown",
  "crunch",
  "plank",
  "leg raise",
  "sit up",
  "lunge",
  "calf raise",
  "shrug",
  "dip",
  "hip thrust",
  "hip extension",
  "step up",
  "burpee",
];

function score(entry) {
  let value = EQUIPMENT_SCORE[entry.equipment] ?? 0;
  const name = entry.name.toLowerCase().replace(/[-\u2010-\u2015]/g, " ");
  // A plain "barbell bench press" beats a 12-word variation of the same thing.
  if (COMMON_MOVEMENTS.some((movement) => name.includes(movement))) value += 8;
  if (name.split(" ").length <= 5) value += 2;
  if (name.includes("v. 2") || name.includes("v. 3")) value -= 4;
  if (name.includes("(male)") || name.includes("(female)")) value -= 2;
  return value;
}

function isUsable(entry) {
  const name = entry.name.toLowerCase();
  if (!entry.gif_url) return false;
  if (!entry.target) return false;
  if (SKIP_WORDS.some((word) => name.includes(word))) return false;
  return score(entry) > 0;
}

/**
 * Equipment priority for the round-robin, so one muscle group never fills up
 * with eight barbell variations while the dumbbell and cable rows sit unused.
 */
const EQUIPMENT_ORDER = [
  "barbell",
  "dumbbell",
  "cable",
  "leverage machine",
  "smith machine",
  "ez barbell",
  "body weight",
  "sled machine",
  "kettlebell",
  "olympic barbell",
  "weighted",
  "band",
  "resistance band",
  "stability ball",
  "medicine ball",
];


/**
 * Equipment each muscle group should be dominated by.
 *
 * Strict round-robin gave every muscle one barbell move, one dumbbell move, one
 * cable move… and — for abs — exactly one bodyweight move, which is the one
 * thing a student actually wants there. 60% of the slots now come from the
 * preferred equipment and 40% from everything else.
 */
const PREFERRED_EQUIPMENT = {
  chest: ["barbell", "dumbbell", "cable"],
  back: ["cable", "dumbbell", "barbell"],
  shoulders: ["dumbbell", "cable", "barbell"],
  biceps: ["barbell", "dumbbell", "cable"],
  triceps: ["cable", "dumbbell", "barbell"],
  quads: ["barbell", "sled machine", "dumbbell"],
  hamstrings: ["barbell", "dumbbell", "leverage machine"],
  glutes: ["barbell", "dumbbell", "cable"],
  calves: ["leverage machine", "smith machine", "dumbbell"],
  abs: ["body weight", "cable", "dumbbell"],
  forearms: ["barbell", "dumbbell", "cable"],
  cardio: ["body weight", "leverage machine", "dumbbell"],
};

/** Interleaves the per-equipment buckets: one barbell, one dumbbell, one cable… */
function interleaveByEquipment(candidates) {
  const buckets = new Map();
  for (const entry of candidates) {
    const key = entry.equipment ?? "other";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(entry);
  }

  const order = [
    ...EQUIPMENT_ORDER.filter((key) => buckets.has(key)),
    ...[...buckets.keys()].filter((key) => !EQUIPMENT_ORDER.includes(key)).sort(),
  ];

  const ordered = [];
  let depth = 0;
  let more = true;
  while (more) {
    more = false;
    for (const key of order) {
      const bucket = buckets.get(key);
      if (bucket && bucket[depth]) {
        ordered.push(bucket[depth]);
        more = true;
      }
    }
    depth += 1;
  }
  return ordered;
}

// ---------------------------------------------------------------------------
// IO
// ---------------------------------------------------------------------------

async function fetchText(url, attempt = 1) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (error) {
    if (attempt >= 3) throw error;
    await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
    return fetchText(url, attempt + 1);
  }
}

async function fetchBuffer(url, attempt = 1) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } catch (error) {
    if (attempt >= 3) throw error;
    await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
    return fetchBuffer(url, attempt + 1);
  }
}

async function loadDataset() {
  if (!REFRESH && fs.existsSync(CACHE)) {
    console.log(`Using cached dataset: ${CACHE}`);
    return JSON.parse(fs.readFileSync(CACHE, "utf8"));
  }
  console.log("Fetching data/exercises.json …");
  const raw = await fetchText(DATA_URL);
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, raw);
  return JSON.parse(raw);
}

/** Small concurrency pool — 120 sequential downloads would take forever. */
async function pool(items, size, worker) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const dataset = await loadDataset();
  console.log(`${dataset.length} movements in the dataset`);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const selected = [];
  for (const muscle of MUSCLES) {
    const candidates = dataset
      .filter((entry) => muscle.targets.includes(entry.target) && isUsable(entry))
      .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));

    const preferred = PREFERRED_EQUIPMENT[muscle.key] ?? [];
    const primary = interleaveByEquipment(
      candidates.filter((entry) => preferred.includes(entry.equipment)),
    );
    const secondary = interleaveByEquipment(
      candidates.filter((entry) => !preferred.includes(entry.equipment)),
    );
    const quota = Math.ceil(LIMIT * 0.6);
    const queue = [...primary.slice(0, quota), ...secondary, ...primary.slice(quota)];

    const picked = [];
    const seenNames = new Set();
    const seenPersian = new Set();
    for (const entry of queue) {
      if (picked.length >= LIMIT) break;
      // The dataset repeats a movement across several targets.
      if (seenNames.has(entry.name)) continue;
      const name = persianName(entry.name, entry.equipment, muscle.label);
      // `barbell bench press` / `barbell guillotine bench press` / `barbell wide
      // bench press` all translate to the same Persian phrase — keep one.
      if (seenPersian.has(name)) continue;
      seenNames.add(entry.name);
      seenPersian.add(name);
      picked.push({ entry, name });
    }

    for (const { entry, name } of picked) {
      selected.push({
        id: entry.id,
        english: entry.name,
        name,
        muscleKey: muscle.key,
        muscle: muscle.label,
        equipment: EQUIPMENT_FA[entry.equipment] ?? entry.equipment,
        gifUrl: entry.gif_url,
        target: entry.target,
      });
    }
    console.log(`  ${muscle.label.padEnd(12)} ${picked.length} moves`);
  }

  console.log(`\nDownloading ${selected.length} GIFs …`);
  let downloaded = 0;
  let bytes = 0;
  const failed = [];

  await pool(selected, 6, async (item) => {
    const file = path.join(OUT_DIR, `cat-${item.id}.gif`);
    if (!FORCE && fs.existsSync(file) && fs.statSync(file).size > 1000) {
      bytes += fs.statSync(file).size;
      downloaded += 1;
      return;
    }
    try {
      const buffer = await fetchBuffer(`${REPO_RAW}/${item.gifUrl}`);
      fs.writeFileSync(file, buffer);
      bytes += buffer.length;
      downloaded += 1;
    } catch (error) {
      failed.push(`${item.id} ${item.english}: ${error.message}`);
    }
  });

  const usable = selected.filter((item) => !failed.some((line) => line.startsWith(item.id)));
  console.log(`  ${downloaded}/${selected.length} GIFs, ${(bytes / 1024 / 1024).toFixed(2)} MB`);

  // ------------------------------------------------------------------ catalog
  const lines = [];
  lines.push("/**");
  lines.push(" * Exercise library for the \"add exercise\" picker.");
  lines.push(" *");
  lines.push(" * AUTO-GENERATED by `scripts/build-exercise-library.mjs` — do not edit by");
  lines.push(" * hand. Source: hasaneyldrm/exercises-dataset (Gym Visual artwork), with");
  lines.push(" * Persian names composed from a word dictionary.");
  lines.push(" */");
  lines.push("");
  lines.push("export interface CatalogExercise {");
  lines.push("  /** Dataset id, also the GIF file name. */");
  lines.push("  id: string;");
  lines.push("  /** Persian display name. */");
  lines.push("  name: string;");
  lines.push("  /** Original English name, searched as a fallback. */");
  lines.push("  english: string;");
  lines.push("  /** Muscle group key (`chest`, `back`, …) used by the filter chips. */");
  lines.push("  muscleKey: string;");
  lines.push("  /** Persian muscle label. */");
  lines.push("  muscle: string;");
  lines.push("  /** Persian equipment label. */");
  lines.push("  equipment: string;");
  lines.push("  /** Bundled GIF, e.g. `/gifs/catalog/cat-0314.gif`. */");
  lines.push("  gif: string;");
  lines.push("}");
  lines.push("");
  lines.push("export interface CatalogMuscle {");
  lines.push("  key: string;");
  lines.push("  label: string;");
  lines.push("}");
  lines.push("");
  lines.push("export const CATALOG_MUSCLES: CatalogMuscle[] = [");
  for (const muscle of MUSCLES) {
    lines.push(`  { key: "${muscle.key}", label: "${muscle.label}" },`);
  }
  lines.push("];");
  lines.push("");
  lines.push("export const EXERCISE_CATALOG: CatalogExercise[] = [");
  for (const item of usable) {
    lines.push("  {");
    lines.push(`    id: "${item.id}",`);
    lines.push(`    name: "${item.name}",`);
    lines.push(`    english: ${JSON.stringify(item.english)},`);
    lines.push(`    muscleKey: "${item.muscleKey}",`);
    lines.push(`    muscle: "${item.muscle}",`);
    lines.push(`    equipment: "${item.equipment}",`);
    lines.push(`    gif: "/gifs/catalog/cat-${item.id}.gif",`);
    lines.push("  },");
  }
  lines.push("];");
  lines.push("");
  lines.push("/** Persian name lookup for the bundled programme movements. */");
  lines.push("export function catalogByMuscle(muscleKey: string): CatalogExercise[] {");
  lines.push("  return EXERCISE_CATALOG.filter((item) => item.muscleKey === muscleKey);");
  lines.push("}");
  lines.push("");

  fs.mkdirSync(path.dirname(CATALOG_FILE), { recursive: true });
  fs.writeFileSync(CATALOG_FILE, lines.join("\n"), "utf8");

  console.log(`\nWrote ${CATALOG_FILE} (${usable.length} movements)`);
  if (failed.length) {
    console.error(`\n${failed.length} GIF(s) failed:`);
    for (const line of failed) console.error(`  ${line}`);
    process.exitCode = 1;
  }
}

await main();
