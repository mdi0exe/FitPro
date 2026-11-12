/** Timers, Web Audio beeps and Android vibration. */

export type TickHandler = (remaining: number, total: number, running: boolean) => void;

export class CountdownTimer {
  total: number;
  remaining: number;
  running = false;

  private handle: number | null = null;
  private endsAt = 0;

  onTick: TickHandler | null = null;
  onDone: (() => void) | null = null;

  constructor(seconds: number) {
    this.total = seconds;
    this.remaining = seconds;
  }

  get progress(): number {
    if (this.total <= 0) return 0;
    return Math.min(1, Math.max(0, this.remaining / this.total));
  }

  start(): void {
    if (this.remaining <= 0.05) this.remaining = this.total;
    this.endsAt = Date.now() + this.remaining * 1000;
    this.running = true;
    this.startLoop();
    this.paint();
  }

  pause(): void {
    this.running = false;
    this.stopLoop();
    this.paint();
  }

  toggle(): void {
    if (this.running) this.pause();
    else this.start();
  }

  reset(seconds = this.total): void {
    this.stopLoop();
    this.running = false;
    this.total = Math.max(1, seconds);
    this.remaining = this.total;
    this.paint();
  }

  add(delta: number): void {
    this.remaining = Math.min(3600, Math.max(0, this.remaining + delta));
    if (this.running) {
      if (this.remaining <= 0.05) {
        this.finish();
        return;
      }
      this.endsAt = Date.now() + this.remaining * 1000;
    }
    this.paint();
  }

  private startLoop(): void {
    this.stopLoop();
    this.handle = window.setInterval(() => {
      const left = (this.endsAt - Date.now()) / 1000;
      this.remaining = Math.max(0, left);
      this.paint();
      if (left <= 0) this.finish();
    }, 200);
  }

  private stopLoop(): void {
    if (this.handle !== null) {
      window.clearInterval(this.handle);
      this.handle = null;
    }
  }

  private finish(): void {
    this.stopLoop();
    this.running = false;
    this.remaining = 0;
    this.paint();
    this.onDone?.();
  }

  private paint(): void {
    this.onTick?.(this.remaining, this.total, this.running);
  }
}

// ---------------------------------------------------------------------------
// Audio engine — real studio-recorded MP3s bundled into the APK
// ---------------------------------------------------------------------------
//
// `public/sounds/*.mp3` is copied by Vite into dist/sounds/, so every alert is
// fully offline. Playback goes through decodeAudioData → BufferSource → GainNode
// → DynamicsCompressor → destination; the compressor keeps the 1.8x gym alarm
// loud without clipping the phone speaker. If a WebView refuses to decode MP3
// (or Web Audio is throttled), an HTMLAudioElement fallback still routes the
// same file through the hardware media channel. No oscillators, no WAV synth.

import { getState, persist } from "./store";
import {
  WATER_NOTIFICATION_ID,
  cancelScheduledWaterNotification,
  pushSystemNotification,
  scheduleWaterNotificationAt,
} from "./notify";
import { adjustTimestampForWaterQuietHours, isWaterQuietHours } from "./quietHours";

type SoundKey = "alarm" | "success" | "water" | "tap";

/** Absolute paths inside the built frontend (Vite `public/` → `dist/`). */
export const SOUND_FILES: Record<SoundKey, string> = {
  alarm: "/sounds/alarm.mp3",
  success: "/sounds/success.mp3",
  water: "/sounds/water.mp3",
  tap: "/sounds/tap.mp3",
};

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

let audioContext: AudioContext | null = null;
let masterBus: AudioNode | null = null;
const decoded = new Map<SoundKey, AudioBuffer>();
const inflight = new Map<SoundKey, Promise<AudioBuffer | null>>();

function getAudioContext(): AudioContext | null {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;

    if (!audioContext) {
      audioContext = new Ctor();

      // Squash the boosted peaks instead of letting the speaker clip.
      const compressor = audioContext.createDynamicsCompressor();
      compressor.threshold.value = -12;
      compressor.knee.value = 10;
      compressor.ratio.value = 12;
      compressor.attack.value = 0.002;
      compressor.release.value = 0.15;
      compressor.connect(audioContext.destination);

      masterBus = compressor;
    }
    return audioContext;
  } catch (error) {
    console.warn("Web Audio is unavailable", error);
    return null;
  }
}

/** Android WebView starts the context suspended; resume before scheduling. */
async function ensureRunning(ctx: AudioContext): Promise<void> {
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      /* the HTMLAudioElement fallback still fires */
    }
  }
}

/** Fetch + decode once; `null` means "use the media-element fallback". */
function loadBuffer(ctx: AudioContext, key: SoundKey): Promise<AudioBuffer | null> {
  const cached = decoded.get(key);
  if (cached) return Promise.resolve(cached);

  const pending = inflight.get(key);
  if (pending) return pending;

  const job = (async () => {
    try {
      const response = await fetch(SOUND_FILES[key]);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.arrayBuffer();
      const buffer = await ctx.decodeAudioData(data);
      decoded.set(key, buffer);
      return buffer;
    } catch (error) {
      console.warn(`sound "${key}" is not decodable here; using media fallback`, error);
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, job);
  return job;
}

/**
 * Plays a bundled clip at a chosen gain. `rate` gives the same real recording a
 * slightly higher pitch for overload / exercise-completion cues — no synthesis.
 */
async function playClip(key: SoundKey, gainValue: number, rate = 1): Promise<void> {
  const ctx = getAudioContext();
  const buffer = ctx ? await loadBuffer(ctx, key) : null;

  if (ctx && buffer) {
    await ensureRunning(ctx);
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();

    source.buffer = buffer;
    source.playbackRate.value = rate;
    gain.gain.value = gainValue;

    source.connect(gain).connect(masterBus ?? ctx.destination);
    source.start();
    return;
  }

  // Fallback: <audio> uses the media volume channel and needs no decode.
  try {
    const audio = new Audio(SOUND_FILES[key]);
    audio.volume = clamp(gainValue, 0, 1);
    audio.playbackRate = rate;
    void audio.play().catch(() => undefined);
  } catch (error) {
    console.warn("audio playback failed", error);
  }
}

/** Call on the first user gesture: unlock the context and warm all four clips. */
export function unlockAudio(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  void ensureRunning(ctx);
  (Object.keys(SOUND_FILES) as SoundKey[]).forEach((key) => {
    void loadBuffer(ctx, key);
  });
}

// ---------------------------------------------------------------------------
// Alert vocabulary
// ---------------------------------------------------------------------------

/**
 * Rest timer / 5-min cardio timer finished. The real alarm clip is boosted to
 * 1.8x — that "200%" is what cuts through gym music — paired with a long buzz.
 */
export function alarm(): void {
  void playClip("alarm", 1.8);
  vibrate([500, 150, 500, 150, 700]);
}

/**
 * Set completed / progressive overload applied. `frequency` and `times` only
 * nudge the playback rate of the same studio bell, they no longer build a tone.
 */
export function beep(times = 2, frequency = 1200, _duration = 0.14): void {
  const rate = clamp(frequency / 1200 + (times - 2) * 0.03, 0.85, 1.45);
  void playClip("success", 1.0, rate);
  vibrate([120, 50, 150]);
}

/** All sets of an exercise finished: the same success bell, brighter + louder. */
export function chord(): void {
  void playClip("success", 1.15, 1.22);
  vibrate([80, 40, 80, 40, 120]);
}

/** Minor ticks (warm-ups, checklist rows): short, quiet UI pop. */
export function softTap(_frequency = 980, _duration = 0.09): void {
  void playClip("tap", 0.5);
  vibrate(40);
}

/**
 * Water reminder: deliberately soft droplet sound, light buzz and a system
 * notification. Never the gym alarm — and never during the 00:00–09:00 sleep
 * window, where the reminder has to be completely silent.
 */
export function waterAlert(): void {
  if (isWaterQuietHours()) {
    // Silent by design: no sound, no vibration, no status-bar notification.
    return;
  }
  void playClip("water", 0.35);
  vibrate([100, 60, 100]);
  notifyWater("💧 یادآور نوشیدن آب", "وقت نوشیدن ۱ لیوان آب است! (۷۰٪ حجم عضله آب است)");
}

export function vibrate(pattern: number | number[] = [200, 100, 200]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not supported — silently ignore */
  }
}

// ---------------------------------------------------------------------------
// Shared timer instances (survive view re-renders)
// ---------------------------------------------------------------------------

export const restTimer = new CountdownTimer(90);
export const cardioTimer = new CountdownTimer(300);

/** Water notification (shared id so an alert replaces its scheduled twin). */
export function notifyWater(title: string, body: string): void {
  void pushSystemNotification(title, body, WATER_NOTIFICATION_ID);
}

// ---------------------------------------------------------------------------
// Persistent water reminder
// ---------------------------------------------------------------------------
// The deadline lives in `diet.waterReminderNextAt`, which is written to
// gym_state.json (or localStorage in the browser), so closing the app pauses the
// countdown instead of restarting it. A native OS alarm is registered for the
// same instant, which keeps the reminder working while the app is closed.

const WATER_MIRROR_KEY = "persian-hypertrophy::water-next-at";

/** State first, synchronous localStorage mirror as the crash-safe fallback. */
function readWaterNextAt(): number {
  try {
    const fromState = getState().diet.waterReminderNextAt;
    if (Number.isFinite(fromState) && fromState > 0) return fromState;
  } catch {
    /* state not ready yet */
  }
  try {
    const parsed = Number(window.localStorage.getItem(WATER_MIRROR_KEY) ?? "0");
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function writeWaterNextAt(nextAt: number): void {
  const value = Number.isFinite(nextAt) && nextAt > 0 ? Math.trunc(nextAt) : 0;
  try {
    getState().diet.waterReminderNextAt = value;
  } catch {
    /* state not ready */
  }
  // Written synchronously: survives a kill before the debounced save lands.
  try {
    if (value > 0) window.localStorage.setItem(WATER_MIRROR_KEY, String(value));
    else window.localStorage.removeItem(WATER_MIRROR_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Interval in seconds, clamped to the same 15..240 minutes as the UI. */
export function getWaterIntervalSeconds(): number {
  try {
    const minutes = getState().diet.waterReminderMinutes || 60;
    return Math.min(240, Math.max(15, Math.round(minutes))) * 60;
  } catch {
    return 3600;
  }
}

/** Seconds until the next reminder, derived from the persisted deadline. */
export function getWaterRemainingSeconds(): number {
  try {
    if (!getState().diet.waterReminderEnabled) return 0;
  } catch {
    return 0;
  }
  const nextAt = readWaterNextAt();
  if (nextAt <= 0) return getWaterIntervalSeconds();
  return Math.max(0, Math.ceil((nextAt - Date.now()) / 1000));
}

let waterTickListener: ((remainingSec: number, totalSec: number) => void) | null = null;

/**
 * Single-slot tick listener: the nutrition card re-registers on every render,
 * so a growing set of listeners would leak detached nodes.
 */
export function onWaterTimerTick(
  listener: ((remainingSec: number, totalSec: number) => void) | null,
): void {
  waterTickListener = listener;
}

let waterLoop: number | null = null;

function stopWaterLoop(): void {
  if (waterLoop !== null) {
    window.clearInterval(waterLoop);
    waterLoop = null;
  }
}

/** Alerts once, then advances the deadline to the next full interval. */
function fireWaterReminder(advancedTo: number): void {
  writeWaterNextAt(advancedTo);
  persist(0);
  void (async () => {
    // Drop the pending OS alarm first so the alert is not duplicated, then
    // register the next one.
    await cancelScheduledWaterNotification();
    waterAlert();
    await scheduleWaterNotificationAt(advancedTo);
  })();
}

function tickWater(): void {
  let diet;
  try {
    diet = getState().diet;
  } catch {
    return;
  }
  if (!diet.waterReminderEnabled) {
    stopWaterLoop();
    return;
  }

  const totalSec = getWaterIntervalSeconds();
  const nextAt = readWaterNextAt();
  const now = Date.now();

  if (nextAt > 0 && nextAt <= now) {
    // The deadline passed while the app was closed or backgrounded. `waterAlert`
    // stays silent inside the sleep window; the next deadline is pushed to 09:00.
    fireWaterReminder(adjustTimestampForWaterQuietHours(now + totalSec * 1000));
    waterTickListener?.(totalSec, totalSec);
    return;
  }

  waterTickListener?.(Math.max(0, Math.ceil((nextAt - now) / 1000)), totalSec);
}

function ensureWaterLoopRunning(): void {
  stopWaterLoop();
  tickWater();
  waterLoop = window.setInterval(tickWater, 1000);
}

/** Starts a brand-new cycle. Only called from an explicit user action. */
export function startNewWaterReminderCycle(minutes?: number): void {
  let diet;
  try {
    diet = getState().diet;
  } catch {
    return;
  }

  const mins = Math.min(
    240,
    Math.max(15, Math.round(minutes ?? diet.waterReminderMinutes ?? 60)),
  );
  // A deadline inside 00:00–09:00 is pushed to 09:00 so the phone stays silent.
  const nextAt = adjustTimestampForWaterQuietHours(Date.now() + mins * 60_000);

  diet.waterReminderEnabled = true;
  diet.waterReminderMinutes = mins;
  writeWaterNextAt(nextAt);
  persist(0);
  void scheduleWaterNotificationAt(nextAt);
  ensureWaterLoopRunning();
}

/** Turns the reminder off and clears the deadline plus any pending OS alarm. */
export function stopWaterReminder(): void {
  stopWaterLoop();
  try {
    const diet = getState().diet;
    diet.waterReminderEnabled = false;
    writeWaterNextAt(0);
    persist(0);
  } catch {
    /* state not ready */
  }
  void cancelScheduledWaterNotification();
}

/**
 * Resumes the countdown from the saved deadline without resetting it.
 * Call on boot and whenever the app becomes visible again.
 */
export function restoreWaterReminderOnBoot(): void {
  let diet;
  try {
    diet = getState().diet;
  } catch {
    return;
  }

  if (!diet.waterReminderEnabled) {
    stopWaterLoop();
    return;
  }

  const totalSec = getWaterIntervalSeconds();
  const now = Date.now();
  const nextAt = readWaterNextAt();

  if (nextAt <= 0) {
    // Enabled by an older build that had no deadline: start from now once.
    const fresh = adjustTimestampForWaterQuietHours(now + totalSec * 1000);
    writeWaterNextAt(fresh);
    persist(0);
    void scheduleWaterNotificationAt(fresh);
  } else if (nextAt <= now) {
    // Expired while the app was closed: alert once (unless asleep), then continue.
    fireWaterReminder(adjustTimestampForWaterQuietHours(now + totalSec * 1000));
  } else {
    // Still in the future: keep the exact deadline (unless it would ring during
    // the sleep window) and re-arm the OS alarm.
    const safeNextAt = adjustTimestampForWaterQuietHours(nextAt);
    writeWaterNextAt(safeNextAt);
    void scheduleWaterNotificationAt(safeNextAt);
  }

  ensureWaterLoopRunning();
}
