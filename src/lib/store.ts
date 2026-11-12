/** Application state container + debounced persistence. */
import type { AppStateData, TabId } from "../types";
import { saveState, setFlushHook } from "./api";
import { isoToday } from "./fa";

let state: AppStateData | null = null;
let activeTab: TabId = "workout";

const listeners = new Set<() => void>();

let saveTimer: number | null = null;
let flushing = false;
let queued = false;

export function initState(next: AppStateData): void {
  state = next;
  activeTab = "workout";
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
  if (saveTimer !== null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    void flushNow();
  }, delay);
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
  if (current.diet.lastResetDate === today) return false;
  current.diet.lastResetDate = today;
  for (const item of current.diet.items) item.done = false;
  current.diet.waterGlasses = 0;
  return true;
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
  const item = current.diet.items.find((entry) => entry.id === "diet-4");
  if (!item) return;
  item.done = current.diet.waterGlasses >= WATER_GOAL;
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
