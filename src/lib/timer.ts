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
 * notification. Never the gym alarm.
 */
export function waterAlert(): void {
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
export const waterReminder = new CountdownTimer(60 * 60);

/** Arms (or re-arms) the repeating water reminder. */
export function startWaterReminder(minutes: number): void {
  const safe = Math.min(240, Math.max(15, Math.round(minutes)));
  waterReminder.reset(safe * 60);
  waterReminder.start();
}

export function stopWaterReminder(): void {
  waterReminder.pause();
  waterReminder.reset(waterReminder.total);
}

/**
 * System notification when the user granted permission, plus an in-app beep and
 * vibration — the WebView on Android may not support Notification at all.
 */
export function notifyWater(title: string, body: string): void {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(title, { body });
    }
  } catch (error) {
    console.warn("notification unavailable", error);
  }
  // No sound/vibration here: the caller decides (waterAlert stays soft).
}

/** Asks for notification permission (no-op when unsupported/denied). */
export function requestNotificationPermission(): void {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  } catch {
    /* unsupported — the in-app toast still works */
  }
}
