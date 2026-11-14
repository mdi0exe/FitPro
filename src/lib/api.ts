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

/**
 * Registered by `store.ts`. Backend commands read the JSON file from disk, so
 * any debounced frontend change has to be flushed before invoking them.
 */
let flushHook: (() => Promise<void>) | null = null;

export function setFlushHook(fn: () => Promise<void>): void {
  flushHook = fn;
}

async function ensureFlushed(): Promise<void> {
  if (flushHook) await flushHook();
}

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
  await ensureFlushed();
  if (isTauri()) {
    const state = await invoke<AppStateData>("apply_progressive_overload");
    return normalizeState(state);
  }
  return localApplyOverload();
}

export async function logBodyWeight(weight: number): Promise<AppStateData> {
  await ensureFlushed();
  if (isTauri()) {
    const state = await invoke<AppStateData>("log_body_weight", { weight });
    return normalizeState(state);
  }
  return localLogWeight(weight);
}

export async function resetToDefaults(): Promise<AppStateData> {
  await ensureFlushed();
  if (isTauri()) {
    const state = await invoke<AppStateData>("reset_to_defaults");
    return normalizeState(state);
  }
  return localReset();
}

/** Where the native backup writer put the file. */
export interface SavedBackup {
  /** Absolute path of the written file. */
  path: string;
  /** `downloads` for the shared Download folder, `app` for the private copy. */
  directory: "downloads" | "app" | string;
}

/**
 * Writes a backup JSON straight to the filesystem.
 *
 * A WebView can only *download* a blob, and on Android that lands in a sandbox
 * the file manager never shows — so the Rust side writes it instead. Returns
 * `null` in the browser, where the caller falls back to a normal download.
 */
export async function saveBackupFile(
  fileName: string,
  contents: string,
): Promise<SavedBackup | null> {
  if (!isTauri()) return null;
  return invoke<SavedBackup>("save_backup_file", { fileName, contents });
}

// ---------------------------------------------------------------------------
// Android backup bridge (see scripts/setup-android-native.mjs)
// ---------------------------------------------------------------------------
// An Android WebView has no `navigator.share`, and since Android 10 scoped
// storage forbids `std::fs::write` into the public Download folder. Both entry
// points therefore have to go through Kotlin. `window.AndroidWater` is declared
// in notify.ts; accessing it here (no import) avoids an import cycle.

interface AndroidBackupBridge {
  saveBackupToDownloads?: (fileName: string, contents: string) => string;
  shareBackupFile?: (fileName: string, contents: string) => boolean;
}

function backupBridge(): AndroidBackupBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return window.AndroidWater as AndroidBackupBridge | undefined;
}

/** True when this Android build can write to Downloads / open the share sheet. */
export function hasNativeBackupBridge(): boolean {
  const bridge = backupBridge();
  return Boolean(bridge && (bridge.saveBackupToDownloads || bridge.shareBackupFile));
}

/**
 * Writes through MediaStore.Downloads and returns the public path.
 * `null` means "no native bridge" (desktop/browser); a thrown error means the
 * OS refused the write, so the caller can fall back to the Rust command.
 */
export function nativeSaveBackupToDownloads(fileName: string, contents: string): string | null {
  const save = backupBridge()?.saveBackupToDownloads;
  if (!save) return null;
  return save(fileName, contents);
}

/** Opens the native ACTION_SEND chooser. `null` = no bridge, `false` = failed. */
export function nativeShareBackupFile(fileName: string, contents: string): boolean | null {
  const share = backupBridge()?.shareBackupFile;
  if (!share) return null;
  return share(fileName, contents);
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
