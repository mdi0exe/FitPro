/**
 * Gym experience tools: wake lock, busy-machine swaps, plate calculator,
 * personal records, finish celebration, streak, deload week and readiness.
 */
import defaultGifs from "../data/default-gifs.json";
import { btn, el, escapeHtml } from "./dom";
import { fa, faNum, isoAddDays, isoToday } from "./fa";
import { getState, persist, requestRender } from "./store";
import type { Exercise, Readiness, WorkoutDay } from "../types";
import { openModal, toast } from "../components/ui";
import {
  CATALOG_MUSCLES,
  catalogByMuscle,
  EXERCISE_CATALOG,
  type CatalogExercise,
} from "../data/exerciseCatalog";
import { beep, softTap, vibrate } from "./timer";

// ---------------------------------------------------------------------------
// #1. Screen Wake Lock
// ---------------------------------------------------------------------------

interface WakeLockLike {
  release: () => Promise<void>;
  addEventListener: (type: string, listener: () => void) => void;
}

const wakeLockApi = (
  navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLockLike> } }
).wakeLock;

let wakeLockSentinel: WakeLockLike | null = null;
let wakeLockDesired = true;

/** True only while the OS actually holds the lock. */
export function isWakeLockActive(): boolean {
  return wakeLockSentinel !== null;
}

/** Re-acquires the lock; browsers drop it whenever the page is hidden. */
export async function requestGymWakeLock(): Promise<void> {
  if (!wakeLockDesired || wakeLockSentinel) return;
  if (!wakeLockApi) {
    // Unsupported browser: stop pretending it is on.
    wakeLockDesired = false;
    return;
  }
  try {
    wakeLockSentinel = await wakeLockApi.request("screen");
    wakeLockSentinel.addEventListener("release", () => {
      wakeLockSentinel = null;
    });
  } catch {
    // Battery saver or a policy blocked it.
    wakeLockDesired = false;
  }
}

export async function toggleGymWakeLock(): Promise<boolean> {
  if (wakeLockDesired) {
    wakeLockDesired = false;
    try {
      await wakeLockSentinel?.release();
    } catch {
      /* already released */
    }
    wakeLockSentinel = null;
    toast("قفل روشن ماندن صفحه خاموش شد.", "info");
    return false;
  }

  wakeLockDesired = true;
  await requestGymWakeLock();
  if (!wakeLockSentinel) {
    wakeLockDesired = false;
    toast("این مرورگر از روشن نگه داشتن صفحه پشتیبانی نمی‌کند.", "error");
    return false;
  }
  toast("روشن ماندن صفحه حین تمرین فعال شد 📱");
  return true;
}

/** Call once at boot: keeps the screen awake for the whole session. */
export function installWakeLockLifecycle(): void {
  void requestGymWakeLock();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void requestGymWakeLock();
  });
}

// ---------------------------------------------------------------------------
// #2. Busy machine → swap exercise (one-day override, auto-reset tomorrow)
// ---------------------------------------------------------------------------

interface AltSpec {
  name: string;
  query: string;
  tip: string;
}

const ALTERNATIVE_MOVES: Record<string, AltSpec> = {
  // Day 1
  d1e1: {
    name: "پرس بالا سینه هالتر (یا اسمیت)",
    query: "Incline Barbell Bench Press gif",
    tip: "میله را تا بالای ترقوه پایین بیاورید و آرنج‌ها زاویه ۴۵ درجه داشته باشند",
  },
  d1e2: {
    name: "بارفیکس دست باز (یا زیربغل دمبل تک‌خم)",
    query: "Dumbbell Row gif",
    tip: "دمبل را به سمت مفصل ران بکشید تا زیربغل کاملاً منقبض شود",
  },
  d1e3: {
    name: "پرس سینه دمبل روی میز صاف",
    query: "Dumbbell Bench Press gif",
    tip: "دمبل‌ها را با کنترل تا کنار سینه پایین بیاورید و در بالا قفل نکنید",
  },
  d1e4: {
    name: "زیربغل هالتر خم (Barbell Row)",
    query: "Barbell Bent Over Row gif",
    tip: "کمر کاملاً صاف و تنه ۴۵ درجه، هالتر را به سمت ناف بکشید",
  },
  d1e5: {
    name: "نشر جانب سیم‌کش (تک‌دست)",
    query: "Cable Lateral Raise gif",
    tip: "تنش دائمی سیم‌کش فشار فوق‌العاده‌ای به سرشانه میانی وارد می‌کند",
  },
  d1e6: {
    name: "جلوبازو دمبل متناوب (ایستاده)",
    query: "Dumbbell Curl gif",
    tip: "مچ دست را در بالا بچرخانید و آرنج را کنار بدن ثابت نگه دارید",
  },
  d1e7: {
    name: "پشت بازو سیم‌کش با دسته صاف (یا دمبل جفت دست)",
    query: "Pushdown gif",
    tip: "آرنج‌ها چسبیده به پهلو، فقط ساعد حرکت کند",
  },
  // Day 2
  d2e1: {
    name: "هاگ اسکات دستگاه (یا اسکات هالتر)",
    query: "Sled Hack Squat gif",
    tip: "کمر کاملاً چسبیده به پشتی، فشار از پاشنه پا",
  },
  d2e2: {
    name: "گابلت اسکات با دمبل (Goblet Squat)",
    query: "Dumbbell Goblet Squat gif",
    tip: "دمبل را نزدیک سینه نگه دارید و سینه را صاف بالا نگه دارید",
  },
  d2e3: {
    name: "لانگز بلغاری با دمبل (تک پا روی نیمکت)",
    query: "Dumbbell Bulgarian Split Squat gif",
    tip: "فشار عالی روی چهارسر ران بدون نیاز به دستگاه جلوپا",
  },
  d2e4: {
    name: "ددلیفت رومانیایی با دمبل (پشت پا)",
    query: "Dumbbell Romanian Deadlift gif",
    tip: "باسن را به عقب بدهید تا کشش کامل در همسترینگ حس شود",
  },
  d2e5: {
    name: "ساق پا ایستاده با دمبل (روی پله)",
    query: "Dumbbell Calf Raise gif",
    tip: "مکث ۱ ثانیه‌ای در بالاترین نقطه روی پنجه پا",
  },
  d2e6: {
    name: "کرانچ شکم روی زمین (یا سیم‌کش)",
    query: "Crunch gif",
    tip: "بازدم کامل در بالا و تمرکز روی انقباض عضلات شکم",
  },
  // Day 3
  d3e1: {
    name: "پرس سرشانه دستگاه (یا هالتر از جلو)",
    query: "Lever Shoulder Press gif",
    tip: "کمر را به پشتی بچسبانید و وزنه را با کنترل پایین بیاورید",
  },
  d3e2: {
    name: "پول‌اور سیم‌کش ایستاده (زیربغل)",
    query: "Rope Straight Arm Pulldown gif",
    tip: "دست‌ها تقریباً صاف، تمرکز کامل روی کشش زیربغل",
  },
  d3e3: {
    name: "فلای سینه با دمبل روی میز صاف (یا کراس‌اور)",
    query: "Dumbbell Fly gif",
    tip: "آرنج‌ها کمی خمیده، کشش کنترل‌شده در قفسه سینه",
  },
  d3e4: {
    name: "زیربغل دمبل جفت خم (روی میز شیب‌دار)",
    query: "Chest Supported Dumbbell Row gif",
    tip: "سینه روی میز شیب‌دار، کتف‌ها را در بالا به هم نزدیک کنید",
  },
  d3e5: {
    name: "نشر خم دمبل (پشت سرشانه) یا فیس‌پول سیم‌کش",
    query: "Face Pull gif",
    tip: "طناب را به سمت پیشانی بکشید و آرنج‌ها را بالا نگه دارید",
  },
  d3e6: {
    name: "جلوبازو تمرکزی با دمبل (نشسته)",
    query: "Concentration Curl gif",
    tip: "پشت بازو را به داخل ران تکیه دهید تا هیچ تقلبی نباشد",
  },
  d3e7: {
    name: "پشت بازو هالتر خوابیده (Skull Crusher)",
    query: "Barbell Triceps Extension gif",
    tip: "میله را تا بالای پیشانی پایین ببرید و آرنج‌ها باز نشوند",
  },
  // Day 4
  d4e1: {
    name: "ددلیفت رومانیایی با هالتر",
    query: "Barbell Romanian Deadlift gif",
    tip: "میله چسبیده به پا حرکت کند و کمر کاملاً صاف باشد",
  },
  d4e2: {
    name: "پرس پا دستگاه (پا باز و بالا)",
    query: "Leg Press gif",
    tip: "قرار دادن پاها کمی بالاتر فشار را روی همسترینگ و باسن بیشتر می‌کند",
  },
  d4e3: {
    name: "اسکات بلغاری با دمبل",
    query: "Dumbbell Bulgarian Split Squat gif",
    tip: "تنه کمی متمایل به جلو برای درگیری بیشتر باسن و پا",
  },
  d4e4: {
    name: "پشت پا دستگاه خوابیده (یا دمبل بین پا)",
    query: "Leg Curl gif",
    tip: "لگن از روی تشک بلند نشود و پایین بردن با کنترل باشد",
  },
  d4e5: {
    name: "ساق پا دستگاه نشسته",
    query: "Lever Seated Calf Raise gif",
    tip: "دامنه حرکتی کامل از پایین‌ترین تا بالاترین نقطه",
  },
  d4e6: {
    name: "ساعد با دمبل (یا هالتر از پشت)",
    query: "Dumbbell Wrist Curl gif",
    tip: "مچ را کامل باز و جمع کنید تا ساعد به سوزش بیفتد",
  },
  "dorm-pushup": {
    name: "شنا سوئدی دست جمع (الماسی) یا پرس دمبل روی زمین",
    query: "Diamond Push-up gif",
    tip: "آرنج‌ها نزدیک پهلو، فشار عالی روی سینه و پشت بازو بدون دستگاه",
  },
  "dorm-squat": {
    name: "گابلت اسکات با دمبل (یا اسکات پرشی)",
    query: "Dumbbell Goblet Squat gif",
    tip: "دمبل یا کوله را نزدیک سینه نگه دارید و کمر را صاف حفظ کنید",
  },
};

/** Exact muscle group for every movement in the bundled 4-day programme. */
const EXERCISE_MUSCLE_MAP: Record<string, string> = {
  "dorm-pushup": "chest",
  "dorm-squat": "quads",
  // Day 1 — Upper A
  d1e1: "chest",
  d1e2: "back",
  d1e3: "chest",
  d1e4: "back",
  d1e5: "shoulders",
  d1e6: "biceps",
  d1e7: "triceps",
  // Day 2 — Lower A + Abs
  d2e1: "quads",
  d2e2: "quads",
  d2e3: "quads",
  d2e4: "hamstrings",
  d2e5: "calves",
  d2e6: "abs",
  // Day 3 — Upper B
  d3e1: "shoulders",
  d3e2: "back",
  d3e3: "chest",
  d3e4: "back",
  d3e5: "shoulders",
  d3e6: "biceps",
  d3e7: "triceps",
  // Day 4 — Lower B + Forearms
  d4e1: "hamstrings",
  d4e2: "quads",
  d4e3: "quads",
  d4e4: "hamstrings",
  d4e5: "calves",
  d4e6: "forearms",
};

/**
 * Compound Persian/English movement phrases, ordered so specific terms
 * ("جلو پا", "پشت پا", "پرس پا", "جلو بازو"…) win before generic words.
 *
 * This replaces the old word-overlap scoring, which dropped every 2-letter
 * word: "پا" disappeared from «جلو پا دستگاه» and the leftover «جلو» matched
 * the ten «جلو بازو» catalog rows. Equipment words are deliberately absent.
 */
const MUSCLE_KEYWORDS: Array<[string, string[]]> = [
  [
    "quads",
    [
      "جلو پا",
      "جلوپا",
      "چهارسر",
      "پرس پا",
      "هاگ پا",
      "هاگ اسکات",
      "اسکات",
      "اسکوات",
      "لانگز",
      "لانج",
      "استپ آپ",
      "leg extension",
      "leg press",
      "squat",
      "lunge",
    ],
  ],
  [
    "hamstrings",
    [
      "پشت پا",
      "همسترینگ",
      "ددلیفت رومانیایی",
      "ددلیفت پا صاف",
      "گود مورنینگ",
      "leg curl",
      "romanian deadlift",
      "stiff leg",
      "hamstring",
    ],
  ],
  ["glutes", ["باسن", "هیپ تراست", "پل باسن", "hip thrust", "glute"]],
  ["calves", ["ساق پا", "پرس ساق", "ساق", "calf"]],
  [
    "abs",
    [
      "زیرشکم",
      "شکم",
      "کرانچ",
      "درازنشست",
      "پلانک",
      "چرخش روسی",
      "وی\u200cآپ",
      "crunch",
      "plank",
      "sit-up",
      "sit up",
      "knee raise",
      "leg raise",
      "abs",
    ],
  ],
  [
    "biceps",
    [
      "جلو بازو",
      "جلوبازو",
      "لاری",
      "چکشی",
      "bicep",
      "preacher curl",
      "hammer curl",
      "concentration curl",
      "ez bar curl",
      "barbell curl",
      "dumbbell curl",
    ],
  ],
  [
    "triceps",
    [
      "پشت بازو",
      "پشت\u200cبازو",
      "دیپ پشت بازو",
      "دیپ",
      "پشت سر",
      "tricep",
      "pushdown",
      "skull crusher",
    ],
  ],
  [
    "shoulders",
    [
      "سرشانه",
      "نشر جانب",
      "نشر از جانب",
      "نشر از جلو",
      "نشر خم",
      "نشر ایستاده",
      "فلای معکوس",
      "فیس\u200cپول",
      "فیس پول",
      "شراگ",
      "shoulder",
      "lateral raise",
      "front raise",
      "rear delt",
      "reverse fly",
      "face pull",
      "shrug",
      "overhead press",
      "military press",
    ],
  ],
  [
    "back",
    [
      "زیربغل",
      "قایقی",
      "تی\u200cبار",
      "تی بار",
      "بارفیکس",
      "روئینگ",
      "پارویی",
      "پول\u200cاور",
      "پول اور",
      "ددلیفت",
      "pulldown",
      "pull-up",
      "pull up",
      "chin up",
      "row",
      "t-bar",
      "lat ",
      "pullover",
    ],
  ],
  ["forearms", ["ساعد", "مچ روی زانو", "جلو بازو انگشتی", "فشار دست", "wrist curl", "forearm"]],
  [
    "chest",
    [
      "سینه",
      "پروانه",
      "پک دک",
      "کراس\u200cاور",
      "کراس اور",
      "شنا سوئدی",
      "شنا",
      "bench press",
      "chest press",
      "incline dumbbell press",
      "pec deck",
      "chest fly",
      "dumbbell fly",
      "push-up",
      "push up",
    ],
  ],
  ["cardio", ["هوازی", "تردمیل", "دوچرخه", "الپتیکال", "برپی", "cardio", "treadmill", "bike", "burpee"]],
];

/** Bundled demo GIFs, used when the original movement had none stored. */
const EXERCISE_GIFS = defaultGifs.exercises as Record<string, string>;

/**
 * GIF to show once the programmed movement is back.
 *
 * `""` means the user cleared it on purpose and must stay cleared; `null` /
 * `undefined` means the save predates the bundled demos, so the default is used
 * (mirrors what `normalize` does on the Rust side).
 */
function originalGifFor(exercise: Exercise): string | null {
  if (typeof exercise.originalGifUrl === "string") return exercise.originalGifUrl;
  return EXERCISE_GIFS[exercise.id] ?? null;
}

/** True when the movement on screen is today's substitute, not the programme. */
export function isExerciseSwapped(exercise: Exercise): boolean {
  return Boolean(exercise.swappedDate && exercise.originalName);
}

/** Swaps a busy machine for its alternative and remembers the original fields. */
export function swapBusyExercise(exercise: Exercise): void {
  // Picking the curated suggestion while a swap is already active used to call
  // `restoreOriginalExercise()` first, which showed its own toast and re-render
  // before this function showed a second one. Restore the fields silently and
  // let the single toast below describe the final state.
  if (isExerciseSwapped(exercise) && exercise.originalName) {
    exercise.name = exercise.originalName;
    if (exercise.originalQuery) exercise.query = exercise.originalQuery;
    exercise.gifUrl = originalGifFor(exercise);
    if (exercise.originalTip !== undefined && exercise.originalTip !== null) {
      exercise.tip = exercise.originalTip;
    }
    exercise.swappedDate = null;
    exercise.originalName = null;
    exercise.originalQuery = null;
    exercise.originalGifUrl = null;
    exercise.originalTip = null;
  }

  const alt = ALTERNATIVE_MOVES[exercise.id];

  // Save the programmed movement first: this is what "back to original" and the
  // automatic next-day reset restore.
  exercise.originalName = exercise.name;
  exercise.originalQuery = exercise.query;
  exercise.originalGifUrl = exercise.gifUrl ?? null;
  exercise.originalTip = exercise.tip;
  exercise.swappedDate = isoToday();

  if (alt) {
    exercise.name = alt.name;
    exercise.query = alt.query;
    // The substitute movement has its own bundled demo for d1..d4; dorm moves keep their gif.
    if (EXERCISE_GIFS[exercise.id]) {
      exercise.gifUrl = `/gifs/${exercise.id}-alt.gif`;
    }
    exercise.tip = alt.tip;
  } else {
    // Custom exercises have no curated alternative: rename so the card is honest.
    exercise.name = exercise.name.includes("دستگاه")
      ? exercise.name.replace("دستگاه", "دمبل / هالتر (جایگزین)")
      : `${exercise.name} (حرکت جایگزین)`;
  }

  softTap();
  persist(0);
  toast(`حرکت امروز جایگزین شد: «${exercise.name}» (فردا خودکار به حرکت اصلی برمی‌گردد) 🔄`);
  requestRender();
}

/** Manual restore: puts the programmed movement back right away. */
export function restoreOriginalExercise(exercise: Exercise): void {
  if (!exercise.originalName) return;
  exercise.name = exercise.originalName;
  if (exercise.originalQuery) exercise.query = exercise.originalQuery;
  exercise.gifUrl = originalGifFor(exercise);
  if (exercise.originalTip !== undefined && exercise.originalTip !== null) {
    exercise.tip = exercise.originalTip;
  }
  exercise.swappedDate = null;
  exercise.originalName = null;
  exercise.originalQuery = null;
  exercise.originalGifUrl = null;
  exercise.originalTip = null;

  softTap();
  persist(0);
  toast(`به حرکت اصلی برگشت: «${exercise.name}» ↩️`);
  requestRender();
}

/**
 * Which catalog muscle group an exercise belongs to.
 *
 * The old word-overlap scorer dropped every two-letter word, so «جلو پا دستگاه»
 * lost «پا» and the surviving «جلو» matched the ten «جلو بازو» rows. The order
 * now is: exact catalog match (GIF / name / English query), then explicit
 * compound phrase rules, then the known programme IDs, and only then a
 * whole-word overlap score for genuinely unknown custom movements.
 */
export function guessMuscleKey(exercise: Exercise): string {
  const baseName = (exercise.originalName ?? exercise.name).trim();
  const baseQuery = (exercise.originalQuery ?? exercise.query ?? "")
    .toLowerCase()
    .replace(/\bgif\b/g, "")
    .trim();
  const baseGif = exercise.originalGifUrl ?? exercise.gifUrl;

  // 1. Exact catalog match by GIF, Persian name or English query.
  const byCatalog =
    EXERCISE_CATALOG.find((item) => baseGif && item.gif === baseGif) ??
    EXERCISE_CATALOG.find((item) => item.name === baseName || item.name === exercise.name) ??
    EXERCISE_CATALOG.find((item) => baseQuery.length > 0 && item.english.toLowerCase() === baseQuery);
  if (byCatalog) return byCatalog.muscleKey;

  // 2. Specific compound phrases. Leg/back/arm terms are deliberately checked
  //    before generic ones so «پشت پا» never becomes «پشت بازو».
  const haystack = `${baseName} ${exercise.name} ${baseQuery}`.toLowerCase();
  for (const [muscleKey, phrases] of MUSCLE_KEYWORDS) {
    if (phrases.some((phrase) => haystack.includes(phrase))) return muscleKey;
  }

  // 3. Every movement in the bundled 4-day programme has an exact answer.
  if (EXERCISE_MUSCLE_MAP[exercise.id]) return EXERCISE_MUSCLE_MAP[exercise.id];

  // 4. Unknown custom movement: fall back to overlap, but keep short words
  //    (they are exactly what the old filter threw away).
  const words = baseName.split(/\s+/).filter((word) => word.length >= 2);
  const scores = new Map<string, number>();
  for (const item of EXERCISE_CATALOG) {
    let hits = 0;
    for (const word of words) {
      if (item.name.includes(word)) hits += 1;
    }
    if (hits === 0) continue;
    scores.set(item.muscleKey, (scores.get(item.muscleKey) ?? 0) + hits * hits);
  }
  let best = "chest";
  let bestScore = 0;
  for (const [key, value] of scores) {
    if (value > bestScore) {
      best = key;
      bestScore = value;
    }
  }
  return best;
}

/** Applies a catalog movement as today's substitute, remembering the original. */
function applyCatalogSwap(exercise: Exercise, item: CatalogExercise): void {
  // Only capture the original on the first swap of the day, otherwise a second
  // pick would store the substitute as "the original".
  if (!exercise.originalName) {
    exercise.originalName = exercise.name;
    exercise.originalQuery = exercise.query;
    exercise.originalGifUrl = exercise.gifUrl ?? null;
    exercise.originalTip = exercise.tip;
  }
  exercise.swappedDate = isoToday();
  exercise.name = item.name;
  exercise.query = item.english;
  exercise.gifUrl = item.gif;
  exercise.tip = item.tip;

  softTap();
  persist(0);
  toast(`حرکت امروز: «${item.name}» — فردا خودکار به حرکت اصلی برمی‌گردد.`);
  requestRender();
}

/**
 * Busy-machine picker.
 *
 * The old one-tap swap jumped to a single hardcoded alternative, which is
 * useless when that machine is *also* busy. This lists every same-muscle
 * movement from the 120-item catalog with its GIF and its coaching cue, so the
 * student can pick whatever is actually free — plus the curated one-tap
 * suggestion, plus a way back to the programmed movement.
 */
export function openSwapExerciseModal(exercise: Exercise): void {
  const swapped = isExerciseSwapped(exercise);
  // Automatically selects the detected muscle, but the chips let the student
  // browse a neighbouring group when that classification is not what they want.
  let activeMuscleKey = guessMuscleKey(exercise);
  const curated = ALTERNATIVE_MOVES[exercise.id];

  const body = el("div", "space-y-2.5");
  const desc = el("p", "text-[11px] leading-6 text-slate-400");
  const filterRow = el("div", "flex flex-wrap gap-1 pt-0.5");
  const sectionHeading = el("p", "mt-1 text-[10px] font-bold text-slate-300");
  const list = el("div", "max-h-[42vh] space-y-1.5 overflow-y-auto pr-1");
  body.append(desc);

  const handle = openModal({
    title: "جایگزین حرکت امروز",
    subtitle: swapped ? `در حال اجرا: ${exercise.name}` : exercise.name,
    body,
    footer: btn("btn-ghost w-full", "بستن", () => handle.close()),
  });

  const paintList = () => {
    const muscle = CATALOG_MUSCLES.find((entry) => entry.key === activeMuscleKey);
    const muscleLabel = muscle?.label ?? "هم\u200cگروه";

    desc.textContent = `دستگاه شلوغ است؟ یک حرکت از گروه «${muscleLabel}» انتخاب کن. جایگزینی فقط برای امروز است و فردا خودکار به برنامه بر\u200cمی\u200cگردد.`;
    sectionHeading.textContent = `همه حرکت\u200cهای ${muscleLabel}`;

    filterRow.replaceChildren();
    for (const m of CATALOG_MUSCLES) {
      const isActive = m.key === activeMuscleKey;
      filterRow.append(
        btn(
          `rounded-lg border px-2 py-1 text-[10px] font-bold transition active:scale-95 ${
            isActive
              ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-300"
              : "border-slate-800 bg-slate-900/60 text-slate-400"
          }`,
          m.label,
          () => {
            activeMuscleKey = m.key;
            softTap();
            paintList();
          },
          { "aria-label": `فیلتر ${m.label}` },
        ),
      );
    }

    list.replaceChildren();
    const options = catalogByMuscle(activeMuscleKey).filter(
      (item) => item.name !== exercise.name && item.name !== exercise.originalName,
    );

    if (options.length === 0) {
      list.append(
        el(
          "div",
          "rounded-xl border border-dashed border-slate-800 bg-slate-900/40 px-3 py-4 text-center text-[10px] text-slate-500",
          "برای این گروه حرکتی در کتابخانه پیدا نشد.",
        ),
      );
      return;
    }

    for (const item of options) {
      const row = btn(
        "flex w-full items-start gap-2 rounded-xl border border-slate-800 bg-slate-950/50 p-2 text-right transition active:scale-[0.99]",
        "",
        () => {
          applyCatalogSwap(exercise, item);
          handle.close();
        },
        { "aria-label": `انتخاب ${item.name}` },
      );
      const img = el("img", "h-12 w-12 shrink-0 rounded-lg bg-white object-contain");
      img.src = item.gif;
      img.alt = item.name;
      img.loading = "lazy";
      img.decoding = "async";
      const info = el("div", "min-w-0 flex-1");
      info.append(
        el("p", "text-[11px] font-extrabold leading-5 text-slate-100", escapeHtml(item.name)),
        el("p", "mt-0.5 text-[9px] text-slate-500", `${escapeHtml(item.equipment)} • ${escapeHtml(item.muscle)}`),
        el("p", "mt-1 text-[10px] leading-5 text-slate-400", escapeHtml(item.tip)),
      );
      row.append(img, info);
      list.append(row);
    }
  };

  // Curated one-tap suggestion first: it is the only option that ships with a
  // hand-picked demo GIF and a matching cue. `swapBusyExercise` now replaces an
  // existing swap silently, so only one toast is shown.
  if (curated) {
    const quick = btn(
      "flex w-full items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2 text-right transition active:scale-[0.99]",
      "",
      () => {
        swapBusyExercise(exercise);
        handle.close();
      },
      { "aria-label": "جایگزین پیشنهادی" },
    );
    const info = el("div", "min-w-0 flex-1");
    info.append(
      el("p", "text-[10px] font-bold text-emerald-300", "پیشنهاد آماده (یک لمس)"),
      el("p", "mt-0.5 text-[11px] font-extrabold text-slate-100", escapeHtml(curated.name)),
      el("p", "mt-0.5 text-[10px] leading-5 text-slate-400", escapeHtml(curated.tip)),
    );
    quick.append(info);
    body.append(quick);
  }

  body.append(filterRow, sectionHeading, list);
  paintList();

  if (swapped) {
    body.append(
      btn(
        "btn-ghost mt-1 w-full py-2 text-[11px]",
        "بازگشت به حرکت اصلی",
        () => {
          restoreOriginalExercise(exercise);
          handle.close();
        },
        { "aria-label": "بازگشت به حرکت برنامه" },
      ),
    );
  }
}

/**
 * Restores every exercise that was swapped on an earlier calendar day.
 * Returns `true` when something changed so the caller can persist + re-render.
 */
export function ensureDailySwappedExercisesReset(): boolean {
  let state;
  try {
    state = getState();
  } catch {
    return false;
  }
  const today = isoToday();
  let changed = false;

  for (const day of state.days) {
    for (const exercise of day.exercises) {
      if (!exercise.swappedDate || exercise.swappedDate === today) continue;
      if (exercise.originalName) exercise.name = exercise.originalName;
      if (exercise.originalQuery) exercise.query = exercise.originalQuery;
      exercise.gifUrl = originalGifFor(exercise);
      if (exercise.originalTip !== undefined && exercise.originalTip !== null) {
        exercise.tip = exercise.originalTip;
      }
      exercise.swappedDate = null;
      exercise.originalName = null;
      exercise.originalQuery = null;
      exercise.originalGifUrl = null;
      exercise.originalTip = null;
      changed = true;
    }
  }
  return changed;
}

// ---------------------------------------------------------------------------
// #3. Visual barbell plate calculator
// ---------------------------------------------------------------------------

const PLATES = [
  { weight: 20, color: "bg-blue-600 border-blue-400 text-white", height: "h-24" },
  { weight: 15, color: "bg-amber-500 border-amber-300 text-slate-950", height: "h-20" },
  { weight: 10, color: "bg-emerald-600 border-emerald-400 text-white", height: "h-16" },
  { weight: 5, color: "bg-slate-200 border-white text-slate-950", height: "h-14" },
  { weight: 2.5, color: "bg-rose-600 border-rose-400 text-white", height: "h-12" },
  { weight: 1.25, color: "bg-slate-400 border-slate-300 text-slate-950", height: "h-10" },
];

export function openPlateCalculatorModal(initialWeight = 40): void {
  let barWeight = 20;
  // Never start below the empty bar — otherwise the diagram says "no plates".
  let totalWeight = Math.max(barWeight, Math.round((initialWeight || 40) / 2.5) * 2.5);

  const body = el("div", "space-y-4");
  const paint = () => {
    body.innerHTML = "";

    const barRow = el("div", "grid grid-cols-2 gap-2");
    [
      { w: 20, label: "میله المپیکی (۲۰ کیلو)" },
      { w: 10, label: "میله EZ / سبک (۱۰ کیلو)" },
    ].forEach((option) => {
      barRow.append(
        btn(
          `rounded-xl border px-2 py-2 text-[11px] font-extrabold transition ${
            barWeight === option.w
              ? "border-emerald-400 bg-emerald-500/15 text-emerald-200"
              : "border-slate-800 bg-slate-950 text-slate-400"
          }`,
          option.label,
          () => {
            barWeight = option.w;
            if (totalWeight < barWeight) totalWeight = barWeight;
            softTap();
            paint();
          },
        ),
      );
    });
    body.append(barRow);

    const stepper = el(
      "div",
      "flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/70 p-3",
    );
    stepper.append(
      btn("btn-ghost px-3 py-1.5 text-xs", "‎−۲٫۵", () => {
        totalWeight = Math.max(barWeight, totalWeight - 2.5);
        softTap();
        paint();
      }),
      el(
        "div",
        "text-center",
        `<p class="text-[10px] text-slate-400">وزنه کل (با میله)</p>
         <p class="mt-0.5 text-xl font-black text-emerald-400">${faNum(totalWeight, 1)} کیلو</p>`,
      ),
      btn("btn-ghost px-3 py-1.5 text-xs", "‎+۲٫۵", () => {
        totalWeight += 2.5;
        softTap();
        paint();
      }),
    );
    body.append(stepper);

    let perSide = Math.max(0, (totalWeight - barWeight) / 2);
    const sidePlates: typeof PLATES = [];
    for (const plate of PLATES) {
      while (perSide >= plate.weight - 0.001) {
        sidePlates.push(plate);
        perSide -= plate.weight;
      }
    }

    const visual = el(
      "div",
      "flex min-h-[120px] items-center justify-center gap-1 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950 p-4",
    );
    if (sidePlates.length === 0) {
      visual.append(el("p", "text-xs text-slate-400", "فقط میله خالی (بدون صفحه وزنه)"));
    } else {
      visual.append(el("div", "h-3 w-6 shrink-0 rounded-l bg-slate-500"));
      sidePlates.forEach((plate) => {
        visual.append(
          el(
            "div",
            `${plate.height} ${plate.color} flex min-w-[26px] shrink-0 items-center justify-center rounded-md border px-1 text-[9px] font-black shadow-md`,
            faNum(plate.weight, 2),
          ),
        );
      });
      visual.append(
        el(
          "div",
          "flex h-4 w-14 shrink-0 items-center justify-center rounded-r bg-slate-400 text-[9px] font-bold text-slate-950",
          "میله",
        ),
      );
    }
    body.append(visual);

    const summary =
      sidePlates.length === 0
        ? "نیازی به انداختن صفحه نیست."
        : `هر طرف میله: ${sidePlates.map((p) => `${faNum(p.weight, 2)}`).join(" + ")} کیلو`;
    body.append(
      el(
        "div",
        "rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-2.5 text-center text-xs font-bold text-emerald-200",
        summary,
      ),
    );

    const remainder = Math.round(perSide * 100) / 100;
    if (remainder > 0.01) {
      body.append(
        el(
          "p",
          "text-center text-[10px] text-amber-300",
          `${faNum(remainder, 2)} کیلو با صفحه‌های موجود قابل ساخت نیست (نزدیک‌ترین وزن).`,
        ),
      );
    }
  };

  paint();
  openModal({
    title: "🏋️ ماشین‌حساب صفحه‌های هالتر",
    subtitle: "صفحه‌های لازم برای هر طرف میله",
    body,
  });
}

// ---------------------------------------------------------------------------
// #4. Personal records
// ---------------------------------------------------------------------------

/** Epley 1RM estimate. */
const oneRepMax = (weight: number, reps: number) => weight * (1 + reps / 30);

export function checkAndUpdatePR(exercise: Exercise, weight: number, reps: number): boolean {
  if (weight <= 0 || reps <= 0) return false;
  const state = getState();
  state.personalRecords = state.personalRecords ?? {};

  const previous = state.personalRecords[exercise.id];
  const improved = !previous || oneRepMax(weight, reps) > oneRepMax(previous.weight, previous.reps) + 0.01;
  if (!improved) return false;

  state.personalRecords[exercise.id] = { weight, reps, date: isoToday() };

  // The very first record is silent; beating it is worth celebrating.
  if (previous) {
    state.milestones.unshift({
      id: `pr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: isoToday(),
      text: `🏆 رکورد جدید در «${exercise.name}»: ${faNum(weight, 1)} کیلو × ${fa(reps)} تکرار`,
      kind: "goal",
    });
    if (state.milestones.length > 60) state.milestones.length = 60;
    toast(`🏆 رکورد جدید در ${exercise.name}: ${faNum(weight, 1)} کیلو × ${fa(reps)}!`);
  }
  return true;
}

export function personalRecordFor(exerciseId: string): { weight: number; reps: number } | null {
  const record = getState().personalRecords?.[exerciseId];
  return record ? { weight: record.weight, reps: record.reps } : null;
}

// ---------------------------------------------------------------------------
// #5. Finish celebration + total tonnage
// ---------------------------------------------------------------------------

export function openWorkoutFinishModal(day: WorkoutDay): void {
  let totalVolumeKg = 0;
  let totalSets = 0;
  const state = getState();

  for (const exercise of day.exercises) {
    for (const log of exercise.logs) {
      if (!log.done) continue;
      totalSets += 1;
      const weight = log.weight > 0 ? log.weight : state.profile.currentWeight * 0.5;
      totalVolumeKg += weight * (log.reps || 1);
    }
  }

  // ~1.3 tonnes for a small hatchback, a tangible comparison for the tonnage.
  const cars = totalVolumeKg / 1300;

  const body = el("div", "space-y-4 py-2 text-center");
  body.append(
    el("div", "text-5xl", "🏆🔥"),
    el(
      "h3",
      "text-lg font-black text-emerald-300",
      `تمرین «${escapeHtml(day.title)}» تمام شد!`,
    ),
    el(
      "p",
      "text-xs leading-6 text-slate-300",
      "حالا نوبت شام سلف (مرغ یا جوجه) و آب کافی است تا عضله رشد کند.",
    ),
  );

  const stats = el("div", "grid grid-cols-2 gap-2.5");
  stats.append(
    el(
      "div",
      "rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3",
      `<p class="text-[10px] text-emerald-200">حجم کل جابه‌جاشده</p>
       <p class="mt-1 text-xl font-black text-emerald-300">${fa(Math.round(totalVolumeKg))} کیلو</p>
       <p class="mt-0.5 text-[10px] text-emerald-200/80">معادل ${faNum(cars, 1)} خودروی سواری</p>`,
    ),
    el(
      "div",
      "rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-3",
      `<p class="text-[10px] text-cyan-200">ست‌های تکمیل‌شده</p>
       <p class="mt-1 text-xl font-black text-cyan-300">${fa(totalSets)} ست</p>
       <p class="mt-0.5 text-[10px] text-cyan-200/80">ثبت‌شده در تقویم هفتگی</p>`,
    ),
  );
  body.append(stats);

  beep();
  vibrate([200, 80, 200, 80, 400]);

  const handle = openModal({
    title: "عملکرد امروز ثبت شد",
    subtitle: "خلاصه عملکرد امروز",
    body,
    footer: btn("btn-primary w-full", "بستن", () => handle.close()),
  });
}

// ---------------------------------------------------------------------------
// #8. Streak
// ---------------------------------------------------------------------------

/** Consecutive days with a logged workout, anchored at today or yesterday. */
export function getWorkoutStreak(): number {
  const history = getState().activityHistory ?? [];
  const active = new Set(history.filter((entry) => entry.setsDone > 0).map((entry) => entry.date));
  if (active.size === 0) return 0;

  const today = isoToday();
  const iso = (offset: number) => isoAddDays(today, -offset);

  let cursor = active.has(iso(0)) ? 0 : active.has(iso(1)) ? 1 : -1;
  if (cursor === -1) return 0;

  let streak = 0;
  while (active.has(iso(cursor))) {
    streak += 1;
    cursor += 1;
  }
  return streak;
}

export function getActiveWorkoutDaysCount(): number {
  return (getState().activityHistory ?? []).filter((entry) => entry.setsDone > 0).length;
}

// ---------------------------------------------------------------------------
// #9. Deload week
// ---------------------------------------------------------------------------

/**
 * Weights captured before entering deload, so leaving it is lossless.
 *
 * The old in-memory `Map` vanished when the app was closed mid-deload, and the
 * fallback (`× 1.25`) slowly drifted the weights upwards on every cycle. The
 * snapshot now lives in localStorage next to the state.
 */
const DELOAD_SNAPSHOT_KEY = "persian-hypertrophy::deload-snapshot";

function readDeloadSnapshot(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(DELOAD_SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function writeDeloadSnapshot(map: Record<string, number> | null): void {
  try {
    if (!map) window.localStorage.removeItem(DELOAD_SNAPSHOT_KEY);
    else window.localStorage.setItem(DELOAD_SNAPSHOT_KEY, JSON.stringify(map));
  } catch {
    /* storage unavailable — the × 1.25 fallback below still applies */
  }
}

const roundToPlate = (value: number) => Math.max(2.5, Math.round(value / 2.5) * 2.5);

export function toggleDeloadWeek(): void {
  const state = getState();
  const entering = !state.deloadActive;
  state.deloadActive = entering;

  const snapshot = entering ? {} : readDeloadSnapshot();

  for (const day of state.days) {
    for (const exercise of day.exercises) {
      if (exercise.bodyweight || exercise.targetWeight <= 0) continue;
      const key = `${day.id}:${exercise.id}`;

      if (entering) {
        snapshot[key] = exercise.targetWeight;
        exercise.targetWeight = roundToPlate(exercise.targetWeight * 0.8);
      } else {
        // Older saves used the bare exercise id as the key.
        const original = snapshot[key] ?? snapshot[exercise.id];
        exercise.targetWeight = original ?? roundToPlate(exercise.targetWeight * 1.25);
      }

      for (const log of exercise.logs) {
        if (!log.done) log.weight = exercise.targetWeight;
      }
    }
  }

  writeDeloadSnapshot(entering ? snapshot : null);
  persist(0);
  toast(
    entering
      ? "هفته ریکاوری فعال شد: وزنه‌ها ۲۰٪ سبک‌تر شدند 🌿"
      : "هفته ریکاوری تمام شد: وزنه‌ها به مقدار قبل برگشتند ⚡",
  );
  requestRender();
}

// ---------------------------------------------------------------------------
// #14. Readiness + tool bar
// ---------------------------------------------------------------------------

const READINESS_MODES: Array<{ id: Readiness; label: string; rest: number; cue: string }> = [
  { id: "high", label: "⚡ پرانرژی", rest: 75, cue: "امروز روی فرم انفجاری و رکورد تمرکز کن." },
  { id: "normal", label: "🙂 معمولی", rest: 90, cue: "استراحت استاندارد ۹۰ ثانیه؛ طبق برنامه پیش برو." },
  { id: "low", label: "😴 خسته", rest: 120, cue: "استراحت ۱۲۰ ثانیه شد؛ فرم صحیح اولویت اول است." },
];

export function renderReadinessAndToolsBar(): HTMLElement {
  const state = getState();
  const readiness = state.readiness ?? "normal";
  const streak = getWorkoutStreak();
  const sessions = getActiveWorkoutDaysCount();

  const card = el("div", "card space-y-2.5");
  const topRow = el("div", "flex items-center justify-between gap-2");
  topRow.append(
    el("p", "text-xs font-extrabold text-slate-200", "⚡ انرژی امروزت چطوره؟"),
    el(
      "span",
      `chip ${streak > 0 ? "chip-amber" : ""}`,
      streak > 0 ? `🔥 ${fa(streak)} روز پیوسته` : `🔥 ${fa(sessions)} جلسه`,
    ),
  );
  card.append(topRow);

  const modes = el("div", "grid grid-cols-3 gap-1.5");
  for (const mode of READINESS_MODES) {
    const active = readiness === mode.id;
    modes.append(
      btn(
        `rounded-xl border px-1 py-2 text-[11px] font-extrabold transition active:scale-95 ${
          active
            ? "border-emerald-400 bg-emerald-500/15 text-emerald-200"
            : "border-slate-800 bg-slate-950/60 text-slate-400"
        }`,
        mode.label,
        () => {
          state.readiness = mode.id;
          state.restSeconds = mode.rest;
          softTap();
          persist(0);
          toast(mode.cue);
          requestRender();
        },
        { "aria-pressed": String(active) },
      ),
    );
  }
  card.append(modes);

  const tools = el("div", "grid grid-cols-3 gap-1.5 pt-0.5");
  tools.append(
    btn(
      `rounded-xl border px-2 py-1.5 text-[10px] font-bold transition ${
        isWakeLockActive()
          ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300"
          : "border-slate-800 bg-slate-950 text-slate-400"
      }`,
      isWakeLockActive() ? "📱 صفحه روشن" : "📱 صفحه خاموش",
      () => void toggleGymWakeLock().then(() => requestRender()),
    ),
    btn(
      "rounded-xl border border-slate-800 bg-slate-950 px-2 py-1.5 text-[10px] font-bold text-slate-300 transition",
      "🏋️ صفحه هالتر",
      () => openPlateCalculatorModal(40),
    ),
    btn(
      `rounded-xl border px-2 py-1.5 text-[10px] font-bold transition ${
        state.deloadActive
          ? "border-amber-400 bg-amber-500/20 text-amber-200"
          : "border-slate-800 bg-slate-950 text-slate-400"
      }`,
      state.deloadActive ? "🌿 ریکاوری فعال" : "🌿 هفته ریکاوری",
      () => toggleDeloadWeek(),
    ),
  );
  card.append(tools);

  return card;
}
