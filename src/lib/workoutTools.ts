/**
 * Gym experience tools: wake lock, busy-machine swaps, plate calculator,
 * personal records, finish celebration, streak, deload week and readiness.
 */
import defaultGifs from "../data/default-gifs.json";
import { btn, el, escapeHtml } from "./dom";
import { fa, faNum, isoToday } from "./fa";
import { getState, persist, requestRender } from "./store";
import type { Exercise, Readiness, WorkoutDay } from "../types";
import { openModal, toast } from "../components/ui";
import { beep, softTap, vibrate } from "./timer";

const EXERCISE_GIFS = defaultGifs.exercises as Record<string, string>;

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
// #2. Busy machine → swap exercise
// ---------------------------------------------------------------------------

interface SwapSpec {
  name: string;
  query: string;
  /** Reuse a verified GIF from another exercise in the programme. */
  gifId?: string;
  tip: string;
}

const SWAPS: Record<string, [SwapSpec, SwapSpec]> = {
  d1e1: [
    { name: "پرس سینه دستگاه (نشسته)", query: "Chest Press Machine gif", gifId: "d1e3", tip: "شانه را به نشیمنگاه بچسبان و آرنج را در بالا قفل نکن" },
    { name: "فلای سینه دستگاه (Pec Deck)", query: "Pec Deck Fly gif", gifId: "d3e3", tip: "حرکت را آرام با کشش کامل سینه انجام بده" },
  ],
  d1e2: [
    { name: "زیربغل قایقی سیم‌کش", query: "Seated Cable Row gif", gifId: "d1e4", tip: "کمر صاف؛ در انتها کتف‌ها را به هم نزدیک کن" },
    { name: "زیربغل سیم‌کش دست برعکس", query: "Reverse Lat Pulldown gif", gifId: "d3e2", tip: "میله را تا بالای سینه بکش و سینه را بالا نگه دار" },
  ],
  d1e3: [
    { name: "پرس بالا سینه دمبل", query: "Incline Dumbbell Press gif", gifId: "d1e1", tip: "زاویه نیمکت ۳۰ تا ۴۵ درجه، کنترل کامل در پایین" },
    { name: "فلای سینه دستگاه (Pec Deck)", query: "Pec Deck Fly gif", gifId: "d3e3", tip: "آرنج کمی خم و ثابت؛ فقط سینه کار کند" },
  ],
  d1e4: [
    { name: "زیربغل سیم‌کش از جلو", query: "Lat Pulldown gif", gifId: "d1e2", tip: "سینه بالا، میله به بالای سینه" },
    { name: "زیربغل تی‌بار دستگاه", query: "Lever T-bar Row gif", gifId: "d3e4", tip: "تنه را ثابت نگه دار و از بازوها بکش" },
  ],
  d1e5: [
    { name: "فلای معکوس دستگاه (پشت سرشانه)", query: "Rear Delt Machine Fly gif", gifId: "d3e5", tip: "دست‌ها را باز و کمی پایین‌تر از شانه نگه دار" },
    { name: "پرس سرشانه دمبل (نشسته)", query: "Dumbbell Shoulder Press gif", gifId: "d3e1", tip: "دمبل‌ها را تا کشش کامل پایین بیاور، کمر قوس نگیرد" },
  ],
  d1e6: [
    { name: "جلوبازو لاری دستگاه", query: "Lever Preacher Curl gif", gifId: "d3e6", tip: "بازو را کامل روی پد بگذار و از تاب دادن جلوگیری کن" },
    { name: "جلوبازو دمبل نشسته", query: "Seated Dumbbell Curl gif", tip: "آرنج ثابت کنار تنه؛ در پایین کامل باز کن" },
  ],
  d1e7: [
    { name: "پشت بازو دستگاه دیپ", query: "Lever Triceps Dip gif", gifId: "d3e7", tip: "تنه را کمی جلو نگه دار تا فشار روی پشت بازو بماند" },
    { name: "پشت بازو سیم‌کش تک‌دست", query: "Single Arm Triceps Pushdown gif", tip: "آرنج را کنار تنه قفل کن و فقط ساعد حرکت کند" },
  ],
  d2e1: [
    { name: "هاگ پا دستگاه", query: "Sled Hack Squat gif", gifId: "d4e2", tip: "پاشنه‌ها را روی صفحه فشار بده و کمر را به پشتی بچسبان" },
    { name: "اسکات با دستگاه اسمیت", query: "Smith Machine Squat gif", gifId: "d2e2", tip: "پاها به عرض شانه؛ تا زاویه ۹۰ درجه پایین برو" },
  ],
  d2e2: [
    { name: "پرس پا دستگاه", query: "Leg Press gif", gifId: "d2e1", tip: "زانو را در بالا قفل نکن و کمر از پشتی جدا نشود" },
    { name: "لانج دمبل درجا", query: "Dumbbell Lunge gif", gifId: "d4e3", tip: "زانوی عقب را تا نزدیک زمین پایین بیاور، تنه صاف" },
  ],
  d2e3: [
    { name: "لانج دمبل درجا", query: "Dumbbell Lunge gif", gifId: "d4e3", tip: "قدم بلند بردار تا زانوی جلو از پنجه رد نشود" },
    { name: "هاگ پا دستگاه", query: "Sled Hack Squat gif", gifId: "d4e2", tip: "دامنه حرکت را کامل کن و در پایین مکث کن" },
  ],
  d2e4: [
    { name: "پشت پا نشسته دستگاه", query: "Seated Leg Curl gif", gifId: "d4e4", tip: "پنجه‌ها را بالا بکش و در انتها یک ثانیه نگه دار" },
    { name: "ددلیفت رومانیایی دمبل", query: "Dumbbell Romanian Deadlift gif", gifId: "d4e1", tip: "لگن را عقب ببر، کمر صاف و کشش در پشت پا" },
  ],
  d2e5: [
    { name: "ساق پا ایستاده دستگاه", query: "Standing Calf Raise gif", gifId: "d4e5", tip: "در بالا یک ثانیه مکث کن و آرام پایین بیا" },
    { name: "پرس پا دستگاه (ساق)", query: "Leg Press Calf Raise gif", gifId: "d2e1", tip: "فقط مچ را حرکت بده، زانو را قفل نگه دار" },
  ],
  d2e6: [
    { name: "زیرشکم روی میز شیب‌دار", query: "Incline Reverse Crunch gif", tip: "با شکم بالا بیا نه با تاب دادن پا" },
    { name: "پلانک شکم", query: "Plank gif", tip: "بدن یک خط صاف؛ شکم و باسن را منقبض نگه دار" },
  ],
  d3e1: [
    { name: "نشر جانب با دمبل", query: "Dumbbell Lateral Raise gif", gifId: "d1e5", tip: "آرنج کمی خم؛ تا ارتفاع شانه و بدون تاب دادن" },
    { name: "فلای معکوس دستگاه", query: "Rear Delt Machine Fly gif", gifId: "d3e5", tip: "حرکت را با کنترل و دامنه کامل انجام بده" },
  ],
  d3e2: [
    { name: "زیربغل سیم‌کش از جلو", query: "Lat Pulldown gif", gifId: "d1e2", tip: "دست بازتر = تمرکز بیشتر روی زیربغل" },
    { name: "زیربغل قایقی سیم‌کش", query: "Seated Cable Row gif", gifId: "d1e4", tip: "در انتهای حرکت یک ثانیه کتف‌ها را نگه دار" },
  ],
  d3e3: [
    { name: "پرس سینه دستگاه", query: "Chest Press Machine gif", gifId: "d1e3", tip: "پاها را محکم روی زمین بگذار و آرنج را قفل نکن" },
    { name: "پرس بالا سینه دمبل", query: "Incline Dumbbell Press gif", gifId: "d1e1", tip: "دامنه کامل و کنترل‌شده، بدون کوبیدن دمبل‌ها" },
  ],
  d3e4: [
    { name: "زیربغل قایقی سیم‌کش", query: "Seated Cable Row gif", gifId: "d1e4", tip: "تنه را ثابت نگه دار و از بازوها بکش" },
    { name: "زیربغل سیم‌کش از جلو", query: "Lat Pulldown gif", gifId: "d1e2", tip: "سینه بالا و نگاه به بالا، بدون تاب دادن تنه" },
  ],
  d3e5: [
    { name: "نشر جانب با دمبل", query: "Dumbbell Lateral Raise gif", gifId: "d1e5", tip: "حرکت را آرام؛ سرشانه میانی را هدف بگیر" },
    { name: "پرس سرشانه دمبل", query: "Dumbbell Shoulder Press gif", gifId: "d3e1", tip: "مسیر دمبل کمی جلوتر از گوش باشد" },
  ],
  d3e6: [
    { name: "جلوبازو با هالتر EZ", query: "Z-Bar Curl gif", gifId: "d1e6", tip: "آرنج ثابت و دامنه کامل، بدون تاب دادن کمر" },
    { name: "جلوبازو دمبل تک‌دست", query: "Single Arm Dumbbell Curl gif", tip: "در پایین کامل باز کن و در بالا یک ثانیه نگه دار" },
  ],
  d3e7: [
    { name: "پشت بازو سیم‌کش با طناب", query: "Rope Pushdown gif", gifId: "d1e7", tip: "در انتها طناب را از هم باز کن و پشت بازو را بفشار" },
    { name: "پشت بازو سیم‌کش تک‌دست", query: "Single Arm Triceps Pushdown gif", tip: "آرنج ثابت؛ فقط ساعد حرکت کند" },
  ],
  d4e1: [
    { name: "پشت پا خوابیده دستگاه", query: "Lying Leg Curl gif", gifId: "d2e4", tip: "لگن را روی دستگاه بچسبان و کامل جمع کن" },
    { name: "پشت پا نشسته دستگاه", query: "Seated Leg Curl gif", gifId: "d4e4", tip: "پنجه‌ها بالا؛ در انتها مکث کوتاه" },
  ],
  d4e2: [
    { name: "پرس پا دستگاه", query: "Leg Press gif", gifId: "d2e1", tip: "پاها را به عرض شانه و کمر را چسبیده نگه دار" },
    { name: "اسکات با دستگاه اسمیت", query: "Smith Machine Squat gif", gifId: "d2e2", tip: "پایین رفتن کنترل‌شده تا زاویه ۹۰ درجه" },
  ],
  d4e3: [
    { name: "اسکات با دستگاه اسمیت", query: "Smith Machine Squat gif", gifId: "d2e2", tip: "پاشنه‌ها روی زمین؛ زانو هم‌جهت پنجه" },
    { name: "پرس پا دستگاه", query: "Leg Press gif", gifId: "d2e1", tip: "دامنه کامل و بدون قفل کردن زانو" },
  ],
  d4e4: [
    { name: "پشت پا خوابیده دستگاه", query: "Lying Leg Curl gif", gifId: "d2e4", tip: "کمر را به دستگاه بچسبان تا لگن بلند نشود" },
    { name: "ددلیفت رومانیایی دمبل", query: "Dumbbell Romanian Deadlift gif", gifId: "d4e1", tip: "کشش را در پشت پا حس کن، کمر گرد نشود" },
  ],
  d4e5: [
    { name: "ساق پا نشسته دستگاه", query: "Seated Calf Raise gif", gifId: "d2e5", tip: "دامنه کامل: کشش در پایین، انقباض در بالا" },
    { name: "پرس پا دستگاه (ساق)", query: "Leg Press Calf Raise gif", gifId: "d2e1", tip: "فقط مچ حرکت کند و مکث بالا را حذف نکن" },
  ],
  d4e6: [
    { name: "ساعد دمبل روی زانو", query: "Dumbbell Wrist Curl gif", tip: "ساعد را ثابت نگه دار و مچ را کامل باز و بسته کن" },
    { name: "ساعد هالتر ایستاده (پشت مچ)", query: "Standing Wrist Extension gif", tip: "وزنه سبک؛ حرکت را آرام و کامل انجام بده" },
  ],
};

/** Original specs captured the first time an exercise is swapped. */
const originalSpecs = new Map<string, Pick<Exercise, "name" | "query" | "gifUrl" | "tip">>();

function applySpec(exercise: Exercise, spec: SwapSpec): void {
  exercise.name = spec.name;
  exercise.query = spec.query;
  exercise.tip = spec.tip;
  // `""` = deliberately no demo yet (normalize keeps it empty); the film button
  // still opens the GIF search for the new movement.
  exercise.gifUrl = spec.gifId ? (EXERCISE_GIFS[spec.gifId] ?? "") : "";
}

/** Cycles original → alternative 1 → alternative 2 → original. */
export function swapBusyExercise(exercise: Exercise): void {
  const pair = SWAPS[exercise.id];
  if (!pair) {
    toast("برای این حرکت جایگزین تعریف نشده.", "info");
    return;
  }

  if (!originalSpecs.has(exercise.id)) {
    originalSpecs.set(exercise.id, {
      name: exercise.name,
      query: exercise.query,
      gifUrl: exercise.gifUrl,
      tip: exercise.tip,
    });
  }

  const index = pair.findIndex((spec) => spec.name === exercise.name);
  if (index === -1) {
    applySpec(exercise, pair[0]);
  } else if (index === 0) {
    applySpec(exercise, pair[1]);
  } else {
    const original = originalSpecs.get(exercise.id);
    if (original) {
      exercise.name = original.name;
      exercise.query = original.query;
      exercise.tip = original.tip;
      exercise.gifUrl = original.gifUrl;
    } else {
      applySpec(exercise, pair[0]);
    }
  }

  softTap();
  persist(0);
  toast(`حرکت عوض شد: «${exercise.name}» 🔄`);
  requestRender();
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
    title: "🎉 خسته نباشی قهرمان!",
    subtitle: "خلاصه عملکرد امروز",
    body,
    footer: btn("btn-primary w-full", "بستن 💪", () => handle.close()),
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

  const iso = (offset: number) => {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  };

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

/** Weights captured before entering deload, so leaving it is lossless. */
const deloadSnapshot = new Map<string, number>();

const roundToPlate = (value: number) => Math.max(2.5, Math.round(value / 2.5) * 2.5);

export function toggleDeloadWeek(): void {
  const state = getState();
  const entering = !state.deloadActive;
  state.deloadActive = entering;

  if (entering) deloadSnapshot.clear();

  for (const day of state.days) {
    for (const exercise of day.exercises) {
      if (exercise.bodyweight || exercise.targetWeight <= 0) continue;

      if (entering) {
        deloadSnapshot.set(exercise.id, exercise.targetWeight);
        exercise.targetWeight = roundToPlate(exercise.targetWeight * 0.8);
      } else {
        const original = deloadSnapshot.get(exercise.id);
        exercise.targetWeight = original ?? roundToPlate(exercise.targetWeight * 1.25);
      }

      for (const log of exercise.logs) {
        if (!log.done) log.weight = exercise.targetWeight;
      }
    }
  }

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
