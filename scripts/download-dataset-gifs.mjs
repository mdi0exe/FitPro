/**
 * Downloads the real animated GIFs (180×180, white background, Gym Visual) for
 * every movement of the programme from `hasaneyldrm/exercises-dataset`.
 *
 *   26 primary movements      → public/gifs/d1e1.gif … d4e6.gif
 *   26 busy-machine swaps     → public/gifs/d1e1-alt.gif … d4e6-alt.gif
 *   10 warm-up movements      → public/gifs/wu-u1.gif … wu-l5.gif
 *
 * The GIFs are committed, so the APK ships them and nothing is fetched at
 * runtime (the old `fitnessprogramer.com` hotlinks were Cloudflare-blocked).
 *
 * Usage: node scripts/download-dataset-gifs.mjs [--force]
 */
import fs from "node:fs";
import path from "node:path";

const OUT_DIR = path.resolve("public", "gifs");
const CACHE = path.resolve(".tmp", "dataset-exercises.json");
const REPO_RAW = "https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main";
const DATA_URL = `${REPO_RAW}/data/exercises.json`;
const FORCE = process.argv.includes("--force");

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(path.dirname(CACHE), { recursive: true });

/** The 62 movements, with the dataset names they should resolve to. */
const SPECS = {
  // ------------------------------------------------------------ Day 1
  d1e1: { exact: ["dumbbell incline bench press", "dumbbell incline press"], keywords: ["incline", "dumbbell", "press"], equipment: ["dumbbell"], target: ["pectorals"] },
  "d1e1-alt": { exact: ["barbell incline bench press", "smith incline bench press"], keywords: ["incline", "bench", "press"], equipment: ["barbell", "smith machine"], target: ["pectorals"] },
  d1e2: { exact: ["cable wide-grip lat pulldown", "cable pulldown", "cable lat pulldown full range of motion"], keywords: ["pulldown", "lat"], equipment: ["cable"], target: ["lats"] },
  "d1e2-alt": { exact: ["dumbbell bent over row", "dumbbell one arm bent-over row", "pull-up"], keywords: ["row", "bent"], equipment: ["dumbbell", "body weight"], target: ["upper back", "lats"] },
  d1e3: { exact: ["lever chest press", "lever seated chest press"], keywords: ["chest", "press"], equipment: ["leverage machine"], target: ["pectorals"] },
  "d1e3-alt": { exact: ["dumbbell bench press", "barbell bench press"], keywords: ["bench", "press"], equipment: ["dumbbell", "barbell"], target: ["pectorals"] },
  d1e4: { exact: ["cable seated row", "cable low seated row"], keywords: ["seated", "row"], equipment: ["cable"], target: ["upper back", "lats"] },
  "d1e4-alt": { exact: ["barbell bent over row", "barbell incline row"], keywords: ["bent", "over", "row"], equipment: ["barbell"], target: ["upper back", "lats"] },
  d1e5: { exact: ["dumbbell lateral raise", "dumbbell side lateral raise"], keywords: ["lateral", "raise"], equipment: ["dumbbell"], target: ["delts"] },
  "d1e5-alt": { exact: ["cable lateral raise", "cable one arm lateral raise"], keywords: ["lateral", "raise"], equipment: ["cable"], target: ["delts"] },
  d1e6: { exact: ["ez barbell curl", "ez-bar curl"], keywords: ["curl"], equipment: ["ez barbell"], target: ["biceps"] },
  "d1e6-alt": { exact: ["dumbbell biceps curl", "dumbbell alternate biceps curl"], keywords: ["biceps", "curl"], equipment: ["dumbbell"], target: ["biceps"] },
  d1e7: { exact: ["cable pushdown (with rope attachment)", "cable pushdown"], keywords: ["pushdown", "rope"], equipment: ["cable"], target: ["triceps"] },
  "d1e7-alt": { exact: ["cable pushdown", "dumbbell standing triceps extension"], keywords: ["triceps", "pushdown"], equipment: ["cable", "dumbbell"], target: ["triceps"] },

  // ------------------------------------------------------------ Day 2
  d2e1: { exact: ["sled 45° leg press", "sled leg press"], keywords: ["leg", "press"], equipment: ["sled machine"], target: ["quads", "glutes"] },
  "d2e1-alt": { exact: ["barbell full squat", "barbell high bar squat"], keywords: ["squat"], equipment: ["barbell"], target: ["quads", "glutes"] },
  d2e2: { exact: ["smith squat", "smith full squat"], keywords: ["smith", "squat"], equipment: ["smith machine"], target: ["quads", "glutes"] },
  "d2e2-alt": { exact: ["dumbbell goblet squat", "dumbbell squat"], keywords: ["goblet", "squat"], equipment: ["dumbbell"], target: ["quads", "glutes"] },
  d2e3: { exact: ["lever leg extension", "leg extension"], keywords: ["leg", "extension"], equipment: ["leverage machine"], target: ["quads"] },
  "d2e3-alt": { exact: ["dumbbell single leg split squat", "dumbbell lunge"], keywords: ["split", "squat"], equipment: ["dumbbell"], target: ["quads", "glutes"] },
  d2e4: { exact: ["lever lying leg curl", "lying leg curl"], keywords: ["lying", "leg", "curl"], equipment: ["leverage machine"], target: ["hamstrings"] },
  "d2e4-alt": { exact: ["dumbbell romanian deadlift", "dumbbell stiff leg deadlift"], keywords: ["romanian", "deadlift"], equipment: ["dumbbell"], target: ["hamstrings", "glutes"] },
  d2e5: { exact: ["lever seated calf raise", "sled calf press on leg press"], keywords: ["seated", "calf", "raise"], equipment: ["leverage machine", "sled machine"], target: ["calves"] },
  "d2e5-alt": { exact: ["dumbbell standing calf raise", "barbell standing leg calf raise"], keywords: ["standing", "calf", "raise"], equipment: ["dumbbell", "barbell"], target: ["calves"] },
  d2e6: { exact: ["hanging leg raise", "hanging knee raise"], keywords: ["hanging", "raise"], equipment: ["body weight"], target: ["abs"] },
  "d2e6-alt": { exact: ["crunch floor", "3/4 sit-up", "cable kneeling crunch"], keywords: ["crunch", "sit-up"], equipment: ["body weight", "cable"], target: ["abs"] },

  // ------------------------------------------------------------ Day 3
  d3e1: { exact: ["dumbbell seated shoulder press", "dumbbell shoulder press"], keywords: ["seated", "shoulder", "press"], equipment: ["dumbbell"], target: ["delts"] },
  "d3e1-alt": { exact: ["lever shoulder press", "barbell seated overhead press"], keywords: ["shoulder", "press"], equipment: ["leverage machine", "barbell"], target: ["delts"] },
  d3e2: { exact: ["cable underhand pulldown", "cable close grip front lat pulldown"], keywords: ["underhand", "pulldown"], equipment: ["cable"], target: ["lats"] },
  "d3e2-alt": { exact: ["cable straight arm pulldown", "cable pullover"], keywords: ["straight", "arm", "pulldown"], equipment: ["cable"], target: ["lats"] },
  d3e3: { exact: ["lever seated fly", "lever pec deck fly"], keywords: ["seated", "fly"], equipment: ["leverage machine"], target: ["pectorals"] },
  "d3e3-alt": { exact: ["dumbbell fly", "cable middle fly"], keywords: ["fly"], equipment: ["dumbbell", "cable"], target: ["pectorals"] },
  d3e4: { exact: ["lever t bar row", "lever t-bar row"], keywords: ["t bar", "row"], equipment: ["leverage machine"], target: ["upper back", "lats"] },
  "d3e4-alt": { exact: ["dumbbell incline row", "barbell bent over row"], keywords: ["incline", "row"], equipment: ["dumbbell", "barbell"], target: ["upper back"] },
  d3e5: { exact: ["lever seated reverse fly", "lever reverse fly"], keywords: ["reverse", "fly"], equipment: ["leverage machine"], target: ["delts"] },
  "d3e5-alt": { exact: ["dumbbell rear lateral raise", "cable upper row"], keywords: ["rear", "raise"], equipment: ["dumbbell", "cable"], target: ["delts"] },
  d3e6: { exact: ["lever preacher curl", "ez barbell preacher curl"], keywords: ["preacher", "curl"], equipment: ["leverage machine", "ez barbell"], target: ["biceps"] },
  "d3e6-alt": { exact: ["dumbbell concentration curl", "dumbbell incline curl"], keywords: ["concentration", "curl"], equipment: ["dumbbell"], target: ["biceps"] },
  d3e7: { exact: ["lever seated dip", "lever overhand triceps dip"], keywords: ["dip", "triceps"], equipment: ["leverage machine"], target: ["triceps"] },
  "d3e7-alt": { exact: ["barbell lying triceps extension skull crusher", "ez barbell lying triceps extension"], keywords: ["lying", "triceps", "extension"], equipment: ["barbell", "ez barbell"], target: ["triceps"] },

  // ------------------------------------------------------------ Day 4
  d4e1: { exact: ["dumbbell romanian deadlift", "dumbbell stiff leg deadlift"], keywords: ["romanian", "deadlift"], equipment: ["dumbbell"], target: ["hamstrings", "glutes"] },
  "d4e1-alt": { exact: ["barbell romanian deadlift", "barbell deadlift"], keywords: ["romanian", "deadlift"], equipment: ["barbell"], target: ["hamstrings", "glutes"] },
  d4e2: { exact: ["sled hack squat", "barbell hack squat"], keywords: ["hack", "squat"], equipment: ["sled machine", "barbell"], target: ["quads", "glutes"] },
  "d4e2-alt": { exact: ["sled 45° leg press", "sled leg press"], keywords: ["leg", "press"], equipment: ["sled machine"], target: ["quads", "glutes"] },
  d4e3: { exact: ["dumbbell lunge", "dumbbell rear lunge", "dumbbell walking lunge"], keywords: ["dumbbell", "lunge"], equipment: ["dumbbell"], target: ["quads", "glutes"] },
  "d4e3-alt": { exact: ["barbell lunge", "dumbbell step-up"], keywords: ["lunge", "step-up"], equipment: ["barbell", "dumbbell"], target: ["quads", "glutes"] },
  d4e4: { exact: ["lever seated leg curl", "seated leg curl"], keywords: ["seated", "leg", "curl"], equipment: ["leverage machine"], target: ["hamstrings"] },
  "d4e4-alt": { exact: ["lever lying leg curl", "dumbbell lying femoral"], keywords: ["lying", "leg", "curl"], equipment: ["leverage machine", "dumbbell"], target: ["hamstrings"] },
  d4e5: { exact: ["lever standing calf raise", "smith standing leg calf raise", "standing calf raises"], keywords: ["standing", "calf", "raise"], equipment: ["leverage machine", "smith machine"], target: ["calves"] },
  "d4e5-alt": { exact: ["lever seated calf raise", "barbell seated calf raise"], keywords: ["seated", "calf", "raise"], equipment: ["leverage machine", "barbell"], target: ["calves"] },
  d4e6: { exact: ["barbell wrist curl", "barbell seated wrist curl"], keywords: ["wrist", "curl"], equipment: ["barbell"], target: ["forearms"] },
  "d4e6-alt": { exact: ["dumbbell seated palms up wrist curl", "dumbbell one arm wrist curl"], keywords: ["wrist", "curl"], equipment: ["dumbbell"], target: ["forearms"] },

  // ------------------------------------------------- warm-ups (upper body)
  "wu-u1": { exact: ["walking on incline treadmill", "running on treadmill", "walking on stepmill"], keywords: ["treadmill", "walk", "run"], equipment: ["leverage machine"], target: ["cardiovascular system"] },
  // The dataset has no "arm circles" clip; shoulder external rotation is the
  // closest visual for the same warm-up (rotate the shoulder, no load).
  "wu-u2": { exact: ["cable standing shoulder external rotation", "standing lateral stretch"], keywords: ["shoulder", "rotation"], equipment: ["cable", "body weight"], target: ["delts"] },
  "wu-u3": { exact: ["dynamic chest stretch", "chest stretch"], keywords: ["chest", "stretch"], equipment: ["body weight"], target: ["pectorals"] },
  "wu-u4": { exact: ["dumbbell lying external shoulder rotation", "dumbbell upright shoulder external rotation"], keywords: ["external", "rotation", "shoulder"], equipment: ["dumbbell"], target: ["delts"] },
  "wu-u5": { exact: ["dumbbell incline bench press"], keywords: ["incline", "dumbbell", "press"], equipment: ["dumbbell"], target: ["pectorals"] },

  // ------------------------------------------------- warm-ups (lower body)
  "wu-l1": { exact: ["stationary bike walk", "stationary bike run v. 3", "cycle cross trainer"], keywords: ["stationary", "bike", "cycle"], equipment: ["leverage machine"], target: ["cardiovascular system"] },
  "wu-l2": { exact: ["forward lunge", "bodyweight drop lunge", "walking high knees lunge"], keywords: ["lunge", "leg"], equipment: ["body weight"], target: ["glutes", "quads"] },
  "wu-l3": { exact: ["bodyweight squat", "air squat", "jump squat"], keywords: ["squat"], equipment: ["body weight"], target: ["quads", "glutes"] },
  "wu-l4": { exact: ["ankle circles", "standing calf stretch"], keywords: ["ankle", "calf", "circles"], equipment: ["body weight"], target: ["calves"] },
  "wu-l5": { exact: ["sled 45° leg press", "sled leg press"], keywords: ["leg", "press"], equipment: ["sled machine"], target: ["quads"] },
};

/** Highest score wins; `used` keeps a primary and its alternative apart. */
function findMatch(exercises, spec, used) {
  let best = null;
  let bestScore = 0;

  for (const entry of exercises) {
    if (used.has(entry.id)) continue;
    const name = (entry.name ?? "").toLowerCase();
    const equipment = (entry.equipment ?? "").toLowerCase();
    const target = (entry.target ?? "").toLowerCase();

    let score = 0;
    for (const exact of spec.exact ?? []) {
      const needle = exact.toLowerCase();
      if (name === needle) score += 100;
      else if (name.includes(needle)) score += 50;
    }
    for (const keyword of spec.keywords ?? []) {
      if (name.includes(keyword.toLowerCase())) score += 15;
    }
    for (const item of spec.equipment ?? []) {
      if (equipment === item.toLowerCase()) score += 20;
    }
    for (const item of spec.target ?? []) {
      if (target === item.toLowerCase()) score += 20;
    }

    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }

  return bestScore >= 30 ? best : null;
}

async function fetchBuffer(url, attempt = 1) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } catch (error) {
    if (attempt >= 3) throw error;
    await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    return fetchBuffer(url, attempt + 1);
  }
}

async function main() {
  // Old 2-frame SVGs are replaced by the real GIFs.
  for (const file of fs.readdirSync(OUT_DIR)) {
    if (file.endsWith(".svg")) fs.unlinkSync(path.join(OUT_DIR, file));
  }

  console.log("Fetching data/exercises.json …");
  let exercises;
  try {
    exercises = JSON.parse((await fetchBuffer(DATA_URL)).toString("utf8"));
    fs.writeFileSync(CACHE, JSON.stringify(exercises));
  } catch (error) {
    console.log("! Download failed, using the cached copy.");
    exercises = JSON.parse(fs.readFileSync(CACHE, "utf8"));
  }
  console.log(`  ${exercises.length} movements in the dataset\n`);

  const used = new Map();
  const manifest = {};
  let downloaded = 0;
  let bytes = 0;
  const missing = [];

  for (const [key, spec] of Object.entries(SPECS)) {
    const outFile = path.join(OUT_DIR, `${key}.gif`);

    const base = key.replace("-alt", "");
    if (!used.has(base)) used.set(base, new Set());
    const pair = used.get(base);

    const match = findMatch(exercises, spec, pair);
    if (!match?.gif_url) {
      missing.push(key);
      console.error(`✗ ${key.padEnd(11)} — no dataset match`);
      continue;
    }
    pair.add(match.id);
    manifest[key] = { id: match.id, name: match.name, file: match.gif_url };

    if (!FORCE && fs.existsSync(outFile) && fs.statSync(outFile).size > 1000) {
      bytes += fs.statSync(outFile).size;
      downloaded += 1;
      continue;
    }

    try {
      const buffer = await fetchBuffer(`${REPO_RAW}/${match.gif_url}`);
      fs.writeFileSync(outFile, buffer);
      bytes += buffer.length;
      downloaded += 1;
      console.log(
        `✓ ${key.padEnd(11)} → ${match.name}  (${(buffer.length / 1024).toFixed(0)} KB)`,
      );
    } catch (error) {
      missing.push(key);
      console.error(`✗ ${key.padEnd(11)} — download failed: ${error.message}`);
    }
  }

  fs.writeFileSync(
    path.join(OUT_DIR, "manifest.json"),
    `${JSON.stringify({ source: "hasaneyldrm/exercises-dataset", movements: manifest }, null, 2)}\n`,
  );

  console.log(
    `\n${downloaded}/${Object.keys(SPECS).length} GIFs, ${(bytes / 1024 / 1024).toFixed(2)} MB total`,
  );
  if (missing.length) {
    console.error(`Missing: ${missing.join(", ")}`);
    process.exitCode = 1;
  }
}

await main();
