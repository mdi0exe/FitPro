/**
 * Browser-only fallback backend.
 *
 * When the app runs in a plain browser (no Tauri shell) we emulate the Rust
 * commands against `localStorage`, keeping the exact same business rules so the
 * UI can be developed and tested with `npm run dev`.
 */
import type { AppStateData, Exercise, Milestone, SetLog } from "../types";
import { createSeedState, localIso } from "../data/seed";
import defaultGifs from "../data/default-gifs.json";
import { en, fa, firstNumber } from "./fa";
import { uid } from "./dom";

const STORAGE_KEY = "persian-hypertrophy::state::v1";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** True when the stored demo cannot be trusted (missing, blank or hotlinked). */
function gifNeedsReplacement(url: string | null | undefined): boolean {
  if (!url) return true;
  const value = url.trim();
  return (
    value.length === 0 ||
    value.includes("fitnessprogramer.com") ||
    value.includes("giphy.com") ||
    value.includes("imgur.com") ||
    value.endsWith(".svg")
  );
}

/** Trimmed, bounded free text so a bad paste cannot bloat the save file. */
function cleanText(value: unknown, maxChars: number, fallback: string): string {
  const text = typeof value === "string" ? value.trim().slice(0, maxChars) : "";
  return text || fallback;
}

/** The old 6-item "budget bulking" grocery list, before the 3-meal plan. */
export function isLegacyDiet(items: unknown): boolean {
  if (!Array.isArray(items) || items.length === 0) return true;
  const markers = ["بمب پروتئین", "عدسی یا خوراک سویا", "وعده کامل سلف دانشگاه"];
  return items.some(
    (row) =>
      row &&
      typeof row.text === "string" &&
      markers.some((marker) => row.text.includes(marker)),
  );
}

export function normalizeState(input: AppStateData): AppStateData {
  const state = input;
  state.days = state.days ?? [];
  // Older localStorage snapshots predate the weekly calendar.
  state.activityHistory = Array.isArray(state.activityHistory) ? state.activityHistory : [];
  state.activityHistory = state.activityHistory
    .filter((entry) => entry && typeof entry.date === "string" && entry.date.length > 0)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 90);

  // Per-exercise progression log. A saved file from before this existed simply
  // has no key, and a corrupted row must never break the chart.
  const rawHistory = state.exerciseHistory;
  const history: typeof state.exerciseHistory = {};
  if (rawHistory && typeof rawHistory === "object" && !Array.isArray(rawHistory)) {
    for (const [id, rows] of Object.entries(rawHistory)) {
      if (!id || !Array.isArray(rows)) continue;
      const clean = rows
        .filter((row) => row && typeof row.date === "string" && row.date.length > 0)
        .map((row) => ({
          date: row.date,
          weight: Math.max(0, Math.min(500, Number(row.weight) || 0)),
          reps: Math.max(0, Math.min(200, Math.round(Number(row.reps) || 0))),
          setsCompleted: Math.max(0, Math.min(30, Math.round(Number(row.setsCompleted) || 0))),
        }))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-120);
      if (clean.length > 0) history[id] = clean;
    }
  }
  state.exerciseHistory = history;

  // ---------------------------------------------------------- look & modules
  // Runs before the `days.length === 0` short-circuit: a student who turned
  // the gym off still needs a valid theme, mode and university name.
  state.profile = state.profile ?? createSeedState().profile;
  state.profile.universityName = cleanText(state.profile.universityName, 80, "دانشگاه من");
  state.profile.workoutProgramId = cleanText(
    state.profile.workoutProgramId,
    64,
    "upper-lower-4",
  );
  state.theme = state.theme === "light" ? "light" : "dark";
  state.appMode =
    state.appMode === "uni_only" || state.appMode === "gym_only" ? state.appMode : "full";
  // A missing key is a legacy browser snapshot (already configured). An
  // explicit `false` comes from the native first-run seed and opens the wizard.
  state.onboardingCompleted =
    typeof state.onboardingCompleted === "boolean" ? state.onboardingCompleted : true;

  if (state.days.length === 0) return createSeedState();

  // Gym tools + uni tab fields (added after the first release).
  const seed = createSeedState();
  state.deloadActive = Boolean(state.deloadActive);
  if (!["high", "normal", "low"].includes(state.readiness)) state.readiness = "normal";
  state.personalRecords =
    state.personalRecords && typeof state.personalRecords === "object"
      ? state.personalRecords
      : {};
  state.progressPhotos = Array.isArray(state.progressPhotos)
    ? state.progressPhotos
        .filter((photo) => photo && photo.dataUrl && photo.dataUrl.length <= 900_000)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 24)
    : [];

  const reminders = state.uniReminders ?? seed.uniReminders;
  const hhmm = (value: unknown, fallback: string) =>
    typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback;
  state.uniReminders = {
    thursdayFoodEnabled: reminders.thursdayFoodEnabled !== false,
    thursdayFoodTime: hhmm(reminders.thursdayFoodTime, "12:00"),
    gymReminderEnabled: Boolean(reminders.gymReminderEnabled),
    gymReminderTime: hhmm(reminders.gymReminderTime, "16:30"),
    activeBusAlarms: Array.isArray(reminders.activeBusAlarms)
      ? [...new Set(reminders.activeBusAlarms.filter((key) => typeof key === "string" && key))].slice(0, 64)
      : [],
    foodReminderDay: Number.isInteger(reminders.foodReminderDay)
      ? Math.min(6, Math.max(0, reminders.foodReminderDay))
      : 4,
  };

  // MSc timetable: missing = legacy save (seed it), empty array = user deleted
  // every course and must stay empty.
  if (!Array.isArray(state.courses)) {
    state.courses = seed.courses;
  } else {
    state.courses = state.courses
      .filter((course) => course && typeof course.name === "string" && course.name.trim())
      .map((course) => ({
        id: course.id || uid("course"),
        name: course.name.trim(),
        professor: (course.professor ?? "").trim(),
        dayOfWeek: Number.isInteger(course.dayOfWeek) && course.dayOfWeek >= 0 && course.dayOfWeek <= 6
          ? course.dayOfWeek
          : 0,
        startTime: hhmm(course.startTime, "09:00"),
        endTime: hhmm(course.endTime, "11:00"),
        weekType: (["all", "odd", "even"] as const).includes(course.weekType) ? course.weekType : "all",
      }))
      .slice(0, 60);
  }
  if (state.semesterWeekType !== "odd" && state.semesterWeekType !== "even") {
    state.semesterWeekType = "odd";
  }
  // `null`/garbage both mean "anchor on the current week".
  state.semesterWeekAnchorDate =
    typeof state.semesterWeekAnchorDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(state.semesterWeekAnchorDate)
      ? state.semesterWeekAnchorDate
      : null;

  const lang = state.languageStudy ?? seed.languageStudy;
  state.languageStudy = {
    reminderEnabled: lang.reminderEnabled !== false,
    reminderTime: hhmm(lang.reminderTime, "20:30"),
    targetMinutes: Math.min(180, Math.max(10, Math.round(Number(lang.targetMinutes) || 60))),
    completedDates: Array.isArray(lang.completedDates)
      ? [...new Set(lang.completedDates.filter((date) => typeof date === "string" && date))]
          .sort()
          .slice(-400)
      : [],
    title: cleanText(lang.title, 80, "مطالعه روزانه زبان"),
  };

  if (typeof state.customShuttleJson === "string") {
    const raw = state.customShuttleJson.trim();
    let valid = raw.length > 0 && raw.length <= 20_000;
    if (valid) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        valid = Boolean(parsed) && typeof parsed === "object" && !Array.isArray(parsed);
      } catch {
        valid = false;
      }
    }
    state.customShuttleJson = valid ? raw : null;
  } else {
    state.customShuttleJson = null;
  }
  state.activeDay = Math.min(Math.max(0, state.activeDay ?? 0), state.days.length - 1);  if (!state.restSeconds || state.restSeconds < 15 || state.restSeconds > 600) {
    state.restSeconds = 90;
  }
  // Same migration as models.rs: only the old 6-item grocery list is replaced.
  // A student-selected template or an added custom meal must survive a reload.
  const seedDiet = createSeedState().diet;
  if (!state.diet) {
    state.diet = seedDiet;
  } else {
    if (isLegacyDiet(state.diet.items)) state.diet.items = seedDiet.items;
    state.diet.items = (state.diet.items ?? [])
      .filter((row) => row && typeof row.text === 'string' && row.text.trim())
      .slice(0, 20)
      .map((row, index) => ({
        id: cleanText(row.id, 64, `diet-custom-${index}`),
        text: row.text.trim().slice(0, 160),
        hint: typeof row.hint === 'string' ? row.hint.trim().slice(0, 200) : '',
        done: Boolean(row.done),
      }));
    state.diet.waterGlasses = Math.min(20, Math.max(0, state.diet.waterGlasses ?? 0));
    state.diet.waterReminderEnabled = Boolean(state.diet.waterReminderEnabled);
    const minutes = state.diet.waterReminderMinutes;
    if (!minutes || minutes < 15 || minutes > 240) {
      state.diet.waterReminderMinutes = 60;
    }
    // Same rule as models.rs: a disabled reminder keeps no deadline.
    const nextAt = Number(state.diet.waterReminderNextAt);
    state.diet.waterReminderNextAt =
      !state.diet.waterReminderEnabled || !Number.isFinite(nextAt) || nextAt < 0
        ? 0
        : Math.trunc(nextAt);
  }

  const exerciseGifs = defaultGifs.exercises as Record<string, string>;
  const warmupGifs = defaultGifs.warmups as Record<string, string>;

  for (const day of state.days) {
    for (const warmup of day.warmups ?? []) {
      // Same rule as `gif_needs_replacement` in models.rs: a blank or
      // Cloudflare-blocked hotlink falls back to the bundled offline demo.
      if (gifNeedsReplacement(warmup.gifUrl)) {
        warmup.gifUrl = warmupGifs[`${day.id}:${warmup.id}`] ?? null;
      }
    }
    for (const exercise of day.exercises) {
      exercise.sets = Math.min(12, Math.max(1, exercise.sets || 1));
      // Same rule as models.rs: keep prescriptions in ASCII digits.
      exercise.reps = en(exercise.reps ?? "");
      if (gifNeedsReplacement(exercise.gifUrl)) {
        // A swapped movement shows its own substitute demo; the programmed one
        // stays in `originalGifUrl` so the daily reset restores it.
        const swapped = Boolean(exercise.swappedDate && exercise.originalName);
        exercise.gifUrl = swapped
          ? `/gifs/${exercise.id}-alt.gif`
          : (exerciseGifs[exercise.id] ?? null);
      }
      if (exercise.swappedDate && exercise.originalName && gifNeedsReplacement(exercise.originalGifUrl)) {
        exercise.originalGifUrl = `/gifs/${exercise.id}.gif`;
      }
      exercise.logs = syncLogs(exercise);
    }
  }
  state.weightHistory = (state.weightHistory ?? []).slice(-400);
  return state;
}

export function syncLogs(exercise: Exercise): SetLog[] {
  const fallbackReps = firstNumber(exercise.reps) || 8;
  const existing = [...(exercise.logs ?? [])].sort((a, b) => a.index - b.index);
  const rows: SetLog[] = [];
  for (let i = 1; i <= exercise.sets; i += 1) {
    const found = existing.find((log) => log.index === i);
    rows.push(found ?? { index: i, weight: exercise.targetWeight, reps: fallbackReps, done: false });
  }
  return rows;
}

function readRaw(): AppStateData | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AppStateData;
  } catch (error) {
    console.warn("localStorage state is unreadable, reseeding", error);
    return null;
  }
}

function writeRaw(state: AppStateData): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("failed to persist state in localStorage", error);
  }
}

export function localLoad(): AppStateData {
  const raw = readRaw();
  if (!raw) {
    // Same as `storage::seed()` in Rust: the seed is normalised before use, so
    // the bundled offline demos are already attached on the very first launch.
    const seed = normalizeState(createSeedState());
    writeRaw(seed);
    return clone(seed);
  }
  return clone(normalizeState(raw));
}

export function localSave(state: AppStateData): void {
  writeRaw(state);
}

function roundStep(value: number): number {
  return Math.round(value / 2.5) * 2.5;
}

/** Mirrors `models::increment_reps` — ranges shift as a whole: "8-10" → "9-11". */
export function incrementReps(reps: string): string {
  const range = /(\d+)(\s*[-–]\s*)(\d+)/.exec(reps);
  if (range) {
    const start = range.index;
    return `${reps.slice(0, start)}${Number(range[1]) + 1}${range[2]}${Number(range[3]) + 1}${
      reps.slice(start + range[0].length)
    }`;
  }
  const match = /\d+/.exec(reps);
  if (!match) return reps;
  const start = match.index;
  const end = start + match[0].length;
  const bumped = Number.parseInt(match[0], 10) + 1;
  return `${reps.slice(0, start)}${bumped}${reps.slice(end)}`;
}

let milestoneSeq = 0;

function pushMilestone(state: AppStateData, text: string, kind: Milestone["kind"]): void {
  milestoneSeq += 1;
  state.milestones.unshift({
    id: `ms-${Date.now()}-${milestoneSeq}`,
    date: localIso(),
    text,
    kind,
  });
  state.milestones = state.milestones.slice(0, 60);
}

export function localApplyOverload(): AppStateData {
  const state = localLoad();
  let changed = 0;

  for (const day of state.days) {
    for (const warmup of day.warmups) warmup.done = false;
    for (const exercise of day.exercises) {
      if (exercise.bodyweight || exercise.targetWeight <= 0) {
        const bumped = incrementReps(exercise.reps);
        if (bumped !== exercise.reps) {
          exercise.reps = bumped;
          changed += 1;
        }
      } else {
        exercise.targetWeight = roundStep(exercise.targetWeight + 2.5);
        changed += 1;
      }
      exercise.logs = [];
      exercise.logs = syncLogs(exercise);
    }
  }

  if (changed === 0) throw new Error("هیچ حرکتی برای افزایش وزنه پیدا نشد.");

  state.lastOverloadDate = localIso();
  state.overloadCount += 1;
  pushMilestone(
    state,
    `چرخه ${fa(state.overloadCount)} افزایش وزنه اعمال شد: ${fa(changed)} حرکت به‌روزرسانی شد (\u200E+۲٫۵ کیلوگرم / \u200E+۱ تکرار).`,
    "overload",
  );
  writeRaw(state);
  return clone(state);
}

export function localLogWeight(weight: number): AppStateData {
  if (!Number.isFinite(weight) || weight < 25 || weight > 300) {
    throw new Error("وزن وارد شده معتبر نیست (بین ۲۵ تا ۳۰۰ کیلوگرم).");
  }
  const state = localLoad();
  const today = localIso();
  const rounded = Math.round(weight * 10) / 10;
  const previous = state.profile.currentWeight;

  state.profile.currentWeight = rounded;
  const existing = state.weightHistory.find((entry) => entry.date === today);
  if (existing) existing.weight = rounded;
  else state.weightHistory.push({ date: today, weight: rounded });
  state.weightHistory.sort((a, b) => a.date.localeCompare(b.date));

  if (rounded >= state.profile.targetWeight && previous < state.profile.targetWeight) {
    pushMilestone(
      state,
      `به هدف ${fa(state.profile.targetWeight)} کیلوگرمی رسیدی! حالا هدف بعدی: کیفیت عضله و حفظ وزن.`,
      "goal",
    );
  } else if (previous !== rounded) {
    const delta = rounded - previous;
    pushMilestone(
      state,
      `وزن امروز ثبت شد: ${fa(rounded)} کیلوگرم (\u200E${delta > 0 ? "+" : "−"}${fa(Math.abs(delta))} کیلوگرم نسبت به ثبت قبلی).`,
      "weight",
    );
  }

  writeRaw(state);
  return clone(state);
}

export function localReset(): AppStateData {
  const current = localLoad();
  const fresh = createSeedState();
  // Only the plan is reset; the profile is the user's own data.
  fresh.profile = { ...current.profile };
  if (current.weightHistory.length > 0) fresh.weightHistory = current.weightHistory;
  fresh.diet = current.diet;
  fresh.milestones = current.milestones;
  fresh.overloadCount = current.overloadCount;
  fresh.lastOverloadDate = current.lastOverloadDate;
  fresh.restSeconds = current.restSeconds;
  fresh.activeDay = Math.min(current.activeDay, fresh.days.length - 1);
  // Only the workout plan is reset: keep theme, modular mode, university,
  // courses, reminders, diet template and all progress the student entered.
  fresh.theme = current.theme;
  fresh.appMode = current.appMode;
  fresh.onboardingCompleted = current.onboardingCompleted;
  fresh.uniReminders = current.uniReminders;
  fresh.courses = current.courses;
  fresh.semesterWeekType = current.semesterWeekType;
  fresh.languageStudy = current.languageStudy;
  fresh.customShuttleJson = current.customShuttleJson;
  fresh.activityHistory = current.activityHistory;
  fresh.personalRecords = current.personalRecords;
  fresh.progressPhotos = current.progressPhotos;
  fresh.deloadActive = current.deloadActive;
  fresh.readiness = current.readiness;
  fresh.profile.workoutProgramId = 'upper-lower-4';
  pushMilestone(fresh, "برنامه تمرینی به حالت پیش‌فرض بازگشت.", "system");
  writeRaw(fresh);
  return clone(fresh);
}

export function clearLocal(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}
