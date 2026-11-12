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

const STORAGE_KEY = "persian-hypertrophy::state::v1";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function normalizeState(input: AppStateData): AppStateData {
  const state = input;
  state.days = state.days ?? [];
  // Older localStorage snapshots predate the weekly calendar.
  state.activityHistory = Array.isArray(state.activityHistory) ? state.activityHistory : [];
  state.activityHistory = state.activityHistory
    .filter((entry) => entry && typeof entry.date === "string" && entry.date.length > 0)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 90);
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
  };
  state.activeDay = Math.min(Math.max(0, state.activeDay ?? 0), state.days.length - 1);
  if (!state.restSeconds || state.restSeconds < 15 || state.restSeconds > 600) {
    state.restSeconds = 90;
  }
  // Same migration as models.rs: old installs carry the 6-item grocery list.
  const seedDiet = createSeedState().diet;
  if (!state.diet) {
    state.diet = seedDiet;
  } else {
    const items = state.diet.items;
    if (!Array.isArray(items) || items.length !== 5 || items.some((item) => item.text.includes("تخم‌مرغ"))) {
      state.diet.items = seedDiet.items;
    }
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
      // null/undefined = never set, "" = the user removed it on purpose.
      if (warmup.gifUrl == null) {
        warmup.gifUrl = warmupGifs[`${day.id}:${warmup.id}`] ?? null;
      }
    }
    for (const exercise of day.exercises) {
      exercise.sets = Math.min(12, Math.max(1, exercise.sets || 1));
      // Same rule as models.rs: keep prescriptions in ASCII digits.
      exercise.reps = en(exercise.reps ?? "");
      if (exercise.gifUrl == null) {
        exercise.gifUrl = exerciseGifs[exercise.id] ?? null;
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
    const seed = createSeedState();
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
  pushMilestone(fresh, "برنامه تمرینی به حالت پیش‌فرض بازگشت.", "system");
  writeRaw(fresh);
  return clone(fresh);
}

export function clearLocal(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}
