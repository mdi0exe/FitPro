/** Application state container + debounced persistence. */
import type { AppMode, AppStateData, DailyActivity, TabId } from "../types";
import { saveState, setFlushHook } from "./api";
import { fa, isoToday } from "./fa";
import { ensureDailySwappedExercisesReset } from "./workoutTools";

let state: AppStateData | null = null;
let activeTab: TabId = "workout";

const listeners = new Set<() => void>();

let saveTimer: number | null = null;
let flushing = false;
let queued = false;

/** Tabs visible in each modular layout, in bottom-nav order. */
export function visibleTabs(mode: AppMode | undefined): TabId[] {
  if (mode === "uni_only") return ["uni", "nutrition", "coach"];
  if (mode === "gym_only") return ["workout", "progress", "nutrition", "coach"];
  return ["workout", "progress", "nutrition", "uni", "coach"];
}

/** First tab to open for a given mode (also the Android back destination). */
export function homeTab(mode: AppMode | undefined): TabId {
  return visibleTabs(mode)[0];
}

/**
 * Mirrors the saved theme onto `<html>`. Called on boot, on every state swap
 * and right after the header toggle — CSS does the rest via `html.theme-light`.
 */
export function applyTheme(): void {
  if (typeof document === "undefined" || !state) return;
  const isLight = state.theme === "light";
  document.documentElement.classList.toggle("theme-light", isLight);
  // Android paints the status bar from this meta tag; keep it in step with the
  // theme so a light app does not sit under a near-black system bar.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", isLight ? "#f1f5f9" : "#020617");
}

export function initState(next: AppStateData): void {
  state = next;
  activeTab = homeTab(next.appMode);
  applyTheme();
}

export function getState(): AppStateData {
  if (!state) throw new Error("State accessed before initState()");
  return state;
}

export function setState(next: AppStateData): void {
  // The backend command that produced `next` already wrote it to disk; dropping
  // the pending debounce prevents an older snapshot from overwriting it.
  cancelPendingSave();
  state = next;
  applyTheme();
  if (!visibleTabs(next.appMode).includes(activeTab)) activeTab = homeTab(next.appMode);
  // Keep the weekly calendar in step with data that came from Rust (e.g. a new
  // body weight) and save the derived snapshot when it actually changed.
  if (syncTodayActivity()) persist(0);
  emit();
}

/** Drops a queued write (used when a Rust command just persisted the state). */
export function cancelPendingSave(): void {
  if (saveTimer !== null) {
    window.clearTimeout(saveTimer);
    saveTimer = null;
  }
}

export function mutate(fn: (state: AppStateData) => void): void {
  if (!state) return;
  fn(state);
}

export function getActiveTab(): TabId {
  return activeTab;
}

export function setActiveTab(tab: TabId): void {
  activeTab = tab;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emit(): void {
  for (const listener of listeners) listener();
}

let renderHook: (() => void) | null = null;

/** Registered by `main.ts`; views call `requestRender()` after CRUD changes. */
export function setRenderHook(fn: () => void): void {
  renderHook = fn;
}

export function requestRender(): void {
  renderHook?.();
}

/** Debounced write-through to Rust (or localStorage). */
export function persist(delay = 350): void {
  // Every user action funnels through here, so this is the one place that has
  // to keep today's calendar entry truthful.
  syncTodayActivity();
  if (saveTimer !== null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    void flushNow();
  }, delay);
}

/** True when a debounced `persist()` write is still queued. */
export function hasPendingSave(): boolean {
  return saveTimer !== null;
}

export async function flushNow(): Promise<void> {
  if (!state) return;
  if (flushing) {
    queued = true;
    return;
  }
  flushing = true;
  try {
    await saveState(state);
  } catch (error) {
    console.error("failed to persist app state", error);
  } finally {
    flushing = false;
    if (queued) {
      queued = false;
      void flushNow();
    }
  }
}

/**
 * Clears the nutrition checklist once per calendar day.
 * Returns `true` when a reset happened (so the caller can re-render/persist).
 */
export function ensureDailyDietReset(): boolean {
  const current = getState();
  const today = isoToday();
  let changed = false;

  if (current.diet.lastResetDate !== today) {
    current.diet.lastResetDate = today;
    for (const item of current.diet.items) item.done = false;
    current.diet.waterGlasses = 0;
    // `waterReminderNextAt` is deliberately untouched: the reminder cycle has to
    // survive midnight (and app restarts) instead of starting over.
    changed = true;
  }

  // A "machine is busy" swap is a one-day override, so a new calendar day puts
  // every substituted movement back on the programme.
  if (ensureDailySwappedExercisesReset()) changed = true;

  return changed;
}

// Backend commands (overload / log weight / reset) read the JSON file directly,
// so they must flush any debounced change first — otherwise Rust sees stale data
// and the late timer would then overwrite the fresh file.
setFlushHook(flushNow);

/** Daily water goal (glasses). */
export const WATER_GOAL = 8;

/**
 * Keeps the "drink 8-10 glasses" checklist row in sync with the water counter.
 * Called whenever `waterGlasses` changes.
 */
export function syncWaterChecklist(): void {
  const current = getState();
  // The water row keeps its id in every template, but a student may have
  // deleted/reordered it — fall back to the text so the tick never disappears.
  const item =
    current.diet.items.find((entry) => entry.id === "diet-4") ??
    current.diet.items.find((entry) => entry.text.includes("لیوان آب"));
  if (!item) return;
  item.done = current.diet.waterGlasses >= WATER_GOAL;
}

/**
 * Rebuilds today's entry in `activityHistory` from the live workout/diet state.
 *
 * The app has no per-set timestamps, so "what happened today" is derived from
 * the ticks that are currently set: the active day (or the first day with any
 * progress) supplies the workout, and diet/water/weight are copied as-is.
 * Past entries are never touched. Returns `true` when today's entry changed.
 */
export function syncTodayActivity(): boolean {
  if (!state) return false;
  const current = state;
  const today = isoToday();

  if (!Array.isArray(current.activityHistory)) current.activityHistory = [];

  const activeDayObj = current.days[current.activeDay];
  const workedDays = current.days.filter(
    (day) =>
      day.exercises.some((exercise) => exercise.logs.some((log) => log.done)) ||
      day.warmups.some((warmup) => warmup.done),
  );
  const targetDay =
    workedDays.find((day) => day.id === activeDayObj?.id) ?? workedDays[0] ?? activeDayObj;

  const completedExercises: string[] = [];
  let setsDone = 0;
  let warmupsDone = 0;

  for (const day of workedDays) {
    warmupsDone += day.warmups.filter((warmup) => warmup.done).length;
    for (const exercise of day.exercises) {
      const doneCount = exercise.logs.filter((log) => log.done).length;
      if (doneCount === 0) continue;
      setsDone += doneCount;
      // With more than one day ticked, say which day each exercise came from.
      const prefix = workedDays.length > 1 ? `${day.label} • ` : "";
      completedExercises.push(`${prefix}${exercise.name} (${fa(doneCount)} ست)`);
    }
  }

  const dietDone = current.diet.items.filter((item) => item.done).length;
  const dietTotal = current.diet.items.length;
  const waterGlasses = current.diet.waterGlasses ?? 0;
  const todayWeight =
    current.weightHistory.find((entry) => entry.date === today)?.weight ?? null;

  const existing = current.activityHistory.find((entry) => entry.date === today);
  const entry: DailyActivity =
    existing ?? {
      date: today,
      workoutTitle: "",
      completedExercises: [],
      setsDone: 0,
      warmupsDone: 0,
      dietDone: 0,
      dietTotal,
      waterGlasses: 0,
      bodyWeight: null,
    };

  const before = JSON.stringify(entry);

  // Only overwrite the workout block when there is progress to record, so
  // restarting a day does not erase what was already logged today. When the
  // student unticks the last set (setsDone === 0) the existing row is kept
  // deliberately: `restartDay`, the overload cycle and a manual untick all
  // converge here, and dropping the row would make the calendar flash empty
  // (and break the calendar/history e2e suites). Diet, water and weight are
  // still refreshed on every sync.
  if (setsDone > 0 && targetDay) {
    entry.workoutTitle = `${targetDay.label} — ${targetDay.title}`;
    entry.completedExercises = completedExercises;
    entry.setsDone = setsDone;
    entry.warmupsDone = warmupsDone;
  }
  entry.dietDone = dietDone;
  entry.dietTotal = dietTotal;
  entry.waterGlasses = waterGlasses;
  if (todayWeight !== null) entry.bodyWeight = todayWeight;

  if (!existing) current.activityHistory.push(entry);

  current.activityHistory.sort((a, b) => b.date.localeCompare(a.date));
  if (current.activityHistory.length > 90) current.activityHistory.length = 90;

  return JSON.stringify(entry) !== before;
}

/** Flush pending writes when the app is backgrounded (Android included). */
export function installLifecycleFlush(): void {
  const flush = () => {
    if (saveTimer !== null) {
      window.clearTimeout(saveTimer);
      saveTimer = null;
    }
    void flushNow();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush);
  window.addEventListener("beforeunload", flush);
}
