/**
 * Hybrid storage service.
 *
 * Inside Tauri (Android or desktop) every call goes through `invoke` into the
 * Rust backend, which owns the JSON file. In a plain browser it transparently
 * falls back to `localStorage` so `npm run dev` is fully usable.
 */
import { invoke } from "@tauri-apps/api/core";
import type { AppStateData } from "../types";
import {
  localApplyOverload,
  localLoad,
  localLogWeight,
  localReset,
  localSave,
  normalizeState,
} from "./localBackend";

/** True when the page runs inside a Tauri webview. */
export function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
}

export type StorageMode = "native" | "browser";

export function storageMode(): StorageMode {
  return isTauri() ? "native" : "browser";
}

export async function loadState(): Promise<AppStateData> {
  if (isTauri()) {
    try {
      const state = await invoke<AppStateData>("get_app_state");
      return normalizeState(state);
    } catch (error) {
      console.error("get_app_state failed, falling back to localStorage", error);
      return localLoad();
    }
  }
  return localLoad();
}

export async function saveState(state: AppStateData): Promise<void> {
  if (isTauri()) {
    try {
      await invoke("save_app_state", { state });
      return;
    } catch (error) {
      console.error("save_app_state failed", error);
      throw error;
    }
  }
  localSave(state);
}

export async function applyProgressiveOverload(): Promise<AppStateData> {
  if (isTauri()) {
    const state = await invoke<AppStateData>("apply_progressive_overload");
    return normalizeState(state);
  }
  return localApplyOverload();
}

export async function logBodyWeight(weight: number): Promise<AppStateData> {
  if (isTauri()) {
    const state = await invoke<AppStateData>("log_body_weight", { weight });
    return normalizeState(state);
  }
  return localLogWeight(weight);
}

export async function resetToDefaults(): Promise<AppStateData> {
  if (isTauri()) {
    const state = await invoke<AppStateData>("reset_to_defaults");
    return normalizeState(state);
  }
  return localReset();
}

/**
 * Opens an external URL in the system browser.
 *
 * Uses the shell plugin command directly so no extra npm package is required;
 * falls back to `window.open` in the browser.
 */
export async function openExternal(url: string): Promise<void> {
  if (isTauri()) {
    try {
      await invoke("plugin:shell|open", { path: url, with: null });
      return;
    } catch (error) {
      console.warn("shell open failed, trying window.open", error);
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

/** Google Images search restricted to animated GIFs. */
export function gifSearchUrl(query: string): string {
  const q = `${query} fitnessprogramer`.trim();
  return `https://www.google.com/search?tbm=isch&tbs=itp:animated&q=${encodeURIComponent(q)}`;
}

/** MuscleWiki search (site-restricted Google search is the reliable entry point). */
export function muscleWikiUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`site:musclewiki.com ${query}`)}`;
}

/** YouTube demo search for movements that need a full video. */
export function youtubeUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${query} فرم صحیح`)}`;
}
