/**
 * Workout programme bank for the modular app.
 *
 * Every template builds a *fresh* set of days from `createSeedState()`. The
 * exercises are deep-cloned: sharing one object between two days would make a
 * "machine is busy" swap on Monday silently change Friday's workout too, and
 * would duplicate DOM ids. GIF links are resolved here as well, because the
 * wizard swaps the plan at runtime (no reload → no `normalizeState()` pass).
 */
import type { Exercise, WarmupItem, WorkoutDay } from "../types";
import { createSeedState } from "./seed";
import defaultGifs from "./default-gifs.json";
import { syncLogs } from "../lib/localBackend";

export interface ProgramTemplate {
  id: string;
  title: string;
  subtitle: string;
  goalLabel: string;
  /** Shown in the header instead of the hard-coded "۴ روز در هفته". */
  daysPerWeekLabel: string;
  restSeconds: number;
  buildDays: () => WorkoutDay[];
}

const exerciseGifs = defaultGifs.exercises as Record<string, string>;
const warmupGifs = defaultGifs.warmups as Record<string, string>;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** One deep-cloned exercise with its bundled demo and a fresh set log. */
function pick(base: WorkoutDay[], dayIndex: number, exIndex: number): Exercise {
  const exercise = clone(base[dayIndex].exercises[exIndex]);
  exercise.gifUrl = exercise.gifUrl || exerciseGifs[exercise.id] || null;
  exercise.logs = syncLogs(exercise);
  return exercise;
}

/** Deep-cloned warm-ups, with GIFs taken from the source day's bundle keys. */
function warmups(base: WorkoutDay[], dayIndex: number, from = 0, to = 5): WarmupItem[] {
  const source = base[dayIndex];
  return source.warmups.slice(from, to).map((warmup) => {
    const copy = clone(warmup);
    copy.gifUrl = warmupGifs[`${source.id}:${warmup.id}`] ?? null;
    return copy;
  });
}

/** Attaches offline demos + logs to a plan built from the raw seed days. */
function finalize(days: WorkoutDay[]): WorkoutDay[] {
  return days.map((day) => ({
    ...day,
    warmups: day.warmups.map((warmup) => ({
      ...clone(warmup),
      gifUrl: warmup.gifUrl || warmupGifs[`${day.id}:${warmup.id}`] || null,
    })),
    exercises: day.exercises.map((exercise) => {
      const copy = clone(exercise);
      copy.gifUrl = exercise.gifUrl || exerciseGifs[exercise.id] || null;
      copy.logs = syncLogs(copy);
      return copy;
    }),
  }));
}

const baseDays = () => createSeedState().days;

export const WORKOUT_PROGRAMS: ProgramTemplate[] = [
  {
    id: "upper-lower-4",
    title: "۴ روزه بالاتنه / پایینتنه (حجم خشک)",
    subtitle: "بهترین تعادل بین درس و باشگاه • ۴ جلسه در هفته",
    goalLabel: "افزایش حجم خشک (Lean Bulk)",
    daysPerWeekLabel: "۴ روز در هفته",
    restSeconds: 90,
    buildDays: () => finalize(baseDays()),
  },
  {
    id: "fullbody-3",
    title: "۳ روزه کل بدن (Full Body — زوج یا فرد)",
    subtitle: "مخصوص ترمهای سنگین • فقط ۳ جلسه در هفته",
    goalLabel: "حجم و قدرت (Full Body)",
    daysPerWeekLabel: "۳ روز در هفته",
    restSeconds: 90,
    buildDays: () => {
      const base = baseDays();
      return [
        {
          id: "fb-1",
          label: "جلسه ۱",
          title: "کل بدن A (سینه، پشت، چهارسر)",
          focus: "حرکات مادر بالاتنه و پا",
          warmups: warmups(base, 0),
          exercises: [
            pick(base, 0, 0), // Incline DB Press
            pick(base, 0, 1), // Lat Pulldown
            pick(base, 1, 0), // Leg Press
            pick(base, 0, 4), // Lateral Raise
            pick(base, 0, 5), // EZ Bar Curl
            pick(base, 0, 6), // Rope Pushdown
          ],
        },
        {
          id: "fb-2",
          label: "جلسه ۲",
          title: "کل بدن B (سرشانه، پشت پا، زیربغل)",
          focus: "سرشانه، همسترینگ و ضخامت پشت",
          warmups: warmups(base, 0),
          exercises: [
            pick(base, 2, 0), // Shoulder Press
            pick(base, 0, 3), // Seated Cable Row
            pick(base, 3, 0), // Romanian Deadlift
            pick(base, 2, 2), // Pec Deck
            pick(base, 1, 4), // Calf Raise
            pick(base, 1, 5), // Hanging Knee Raise
          ],
        },
        {
          id: "fb-3",
          label: "جلسه ۳",
          title: "کل بدن C (پرسها، پا و بازو)",
          focus: "پمپ کامل عضلات و بازو",
          warmups: warmups(base, 1),
          exercises: [
            pick(base, 0, 2), // Chest Press
            pick(base, 2, 1), // Reverse Grip Pulldown
            pick(base, 1, 1), // Smith Squat
            pick(base, 2, 4), // Rear Delt Fly
            pick(base, 2, 5), // Preacher Curl
            pick(base, 2, 6), // Tricep Dip
          ],
        },
      ];
    },
  },
  {
    id: "ppl-6",
    title: "۶ روزه / روزانه (Push / Pull / Legs)",
    subtitle: "مخصوص عاشقان باشگاه • تمرین تقریباً هر روز هفته",
    goalLabel: "هایپرتروفی پیشرفته (PPL)",
    daysPerWeekLabel: "۶ روز در هفته",
    restSeconds: 90,
    buildDays: () => {
      const base = baseDays();
      return [
        {
          id: "ppl-1",
          label: "روز ۱",
          title: "Push A (سینه، سرشانه، پشت بازو)",
          focus: "عضلات هلدهنده بالاتنه",
          warmups: warmups(base, 0),
          exercises: [
            pick(base, 0, 0),
            pick(base, 0, 2),
            pick(base, 2, 0),
            pick(base, 0, 4),
            pick(base, 0, 6),
          ],
        },
        {
          id: "ppl-2",
          label: "روز ۲",
          title: "Pull A (زیربغل، پشت، جلوبازو)",
          focus: "عضلات کشنده و جلوبازو",
          warmups: warmups(base, 0),
          exercises: [
            pick(base, 0, 1),
            pick(base, 0, 3),
            pick(base, 2, 4),
            pick(base, 0, 5),
            pick(base, 3, 5),
          ],
        },
        {
          id: "ppl-3",
          label: "روز ۳",
          title: "Legs A (چهارسر ران، همسترینگ، ساق)",
          focus: "حجم کامل پایینتنه",
          warmups: warmups(base, 1),
          exercises: [
            pick(base, 1, 0),
            pick(base, 1, 1),
            pick(base, 1, 2),
            pick(base, 1, 3),
            pick(base, 1, 4),
          ],
        },
        {
          id: "ppl-4",
          label: "روز ۴",
          title: "Push B (سرشانه، قفسه سینه، پشت بازو)",
          focus: "پهنای سرشانه و تفکیک سینه",
          warmups: warmups(base, 0),
          exercises: [
            pick(base, 2, 0),
            pick(base, 2, 2),
            pick(base, 0, 0),
            pick(base, 0, 4),
            pick(base, 2, 6),
          ],
        },
        {
          id: "ppl-5",
          label: "روز ۵",
          title: "Pull B (ضخامت پشت، زیربغل، جلوبازو)",
          focus: "ضخامت عضلات پشت و پیک بازو",
          warmups: warmups(base, 0),
          exercises: [
            pick(base, 2, 3),
            pick(base, 2, 1),
            pick(base, 2, 4),
            pick(base, 2, 5),
            pick(base, 1, 5),
          ],
        },
        {
          id: "ppl-6",
          label: "روز ۶",
          title: "Legs B (پشت پا، باسن، ساق و شکم)",
          focus: "زنجیره پشتی پا و میانتنه",
          warmups: warmups(base, 1),
          exercises: [
            pick(base, 3, 0),
            pick(base, 3, 1),
            pick(base, 3, 2),
            pick(base, 3, 3),
            pick(base, 3, 4),
          ],
        },
      ];
    },
  },
  {
    id: "dorm-daily",
    title: "تمرین روزانه در خوابگاه / خانه (بدون دستگاه)",
    subtitle: "فقط با وزن بدن و یک جفت دمبل • ۳ روز تکرارشونده",
    goalLabel: "تناسب اندام خوابگاهی",
    daysPerWeekLabel: "بدون وسیله • خوابگاهی",
    restSeconds: 60,
    buildDays: () => {
      const base = baseDays();
      const pushUp: Exercise = {
        id: "d1e1",
        name: "شنا سوئدی استاندارد (یا دست روی تخت)",
        sets: 4,
        reps: "12-15",
        query: "Push-up gif",
        tip: "بدن در یک خط صاف، سینه تا نزدیک زمین پایین بیاید",
        gifUrl: "/gifs/wu-u3.gif",
        targetWeight: 0,
        bodyweight: true,
        logs: [],
      };
      pushUp.logs = syncLogs(pushUp);

      const squat: Exercise = {
        id: "d2e2",
        name: "اسکات وزن بدن (یا گابلت اسکات با دمبل/کوله)",
        sets: 4,
        reps: "15-20",
        query: "Bodyweight Squat gif",
        tip: "مکث ۱ ثانیهای در پایینترین نقطه",
        gifUrl: "/gifs/wu-l3.gif",
        targetWeight: 0,
        bodyweight: true,
        logs: [],
      };
      squat.logs = syncLogs(squat);

      return [
        {
          id: "dorm-1",
          label: "روز ۱",
          title: "بالاتنه خوابگاه (شنا، سرشانه، بازو)",
          focus: "قابل اجرا در اتاق خوابگاه یا خانه",
          warmups: warmups(base, 0, 1, 4),
          exercises: [
            pushUp,
            pick(base, 0, 4), // Lateral Raise
            pick(base, 2, 0), // DB Shoulder Press
            pick(base, 0, 5), // Curl
            pick(base, 1, 5), // Abs
          ],
        },
        {
          id: "dorm-2",
          label: "روز ۲",
          title: "پایینتنه و شکم خوابگاه (اسکات و لانگز)",
          focus: "تقویت پا و میانتنه بدون دستگاه",
          warmups: warmups(base, 1, 1, 4),
          exercises: [
            squat,
            pick(base, 3, 2), // Lunges
            pick(base, 3, 0), // DB RDL
            pick(base, 1, 5), // Abs
          ],
        },
      ];
    },
  },
  {
    id: "fatloss-4",
    title: "۴ روزه چربیسوزی و کات (کاهش وزن)",
    subtitle: "تکرار بالاتر (۱۲ تا ۱۵) + استراحت کوتاه ۶۰ ثانیه",
    goalLabel: "کاهش وزن و چربیسوزی (Cut)",
    daysPerWeekLabel: "۴ روز در هفته • کات",
    restSeconds: 60,
    buildDays: () => {
      const days = baseDays();
      for (const day of days) {
        for (const exercise of day.exercises) {
          if (!exercise.bodyweight) exercise.reps = "12-15";
        }
      }
      return finalize(days);
    },
  },
];

export function findProgram(id: string | undefined): ProgramTemplate {
  return WORKOUT_PROGRAMS.find((program) => program.id === id) ?? WORKOUT_PROGRAMS[0];
}
