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
// Audio engine
// ---------------------------------------------------------------------------
//
// Phone speakers in a noisy gym need every bit of help they can get, so the
// chain is: layered oscillators → DynamicsCompressor → destination, plus a
// generated PCM/WAV <audio> player (Android routes <audio> through the media
// channel at full speaker volume even when Web Audio gets throttled) and an
// optional online alarm clip that degrades gracefully when offline.

interface TonePulse {
  freq: number;
  durationMs: number;
  pauseMs: number;
}

const ONLINE_SOUNDS = {
  alarm: "https://actions.google.com/sounds/v1/alarms/digital_watch_alarm_long.ogg",
  water: "https://actions.google.com/sounds/v1/water/water_drop.ogg",
} as const;

let audioContext: AudioContext | null = null;
let masterBus: AudioNode | null = null;
const onlineCache = new Map<string, HTMLAudioElement>();

function getAudioContext(): AudioContext | null {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;

    if (!audioContext) {
      audioContext = new Ctor();

      // Squash peaks instead of letting the speaker clip at full volume.
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

/** Android WebView starts the context suspended; always resume before scheduling. */
async function ensureRunning(ctx: AudioContext): Promise<void> {
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      /* the WAV player still fires */
    }
  }
}

/** One layered pulse: square for cut-through + triangle for body. */
function scheduleTone(
  ctx: AudioContext,
  at: number,
  frequency: number,
  duration: number,
  gainValue: number,
): void {
  const bus = masterBus ?? ctx.destination;

  (["square", "triangle"] as OscillatorType[]).forEach((type, index) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const level = Math.min(1, gainValue * (index === 0 ? 0.7 : 0.55));

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);

    // Short attack (no click), flat sustain, quick release at the very end.
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(level, at + 0.006);
    gain.gain.setValueAtTime(level, at + duration * 0.86);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);

    oscillator.connect(gain).connect(bus);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.02);
  });
}

// --------------------------------------------------------------------- WAV
function writeAscii(bytes: Uint8Array, offset: number, text: string): void {
  for (let index = 0; index < text.length; index += 1) {
    bytes[offset + index] = text.charCodeAt(index);
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

/** 16-bit / 44.1 kHz mono PCM rendered in memory as a data URL. */
function buildWavDataUrl(pulses: TonePulse[]): string {
  const sampleRate = 44100;
  const totalMs = pulses.reduce((sum, pulse) => sum + pulse.durationMs + pulse.pauseMs, 0);
  const frames = Math.max(1, Math.ceil((totalMs / 1000) * sampleRate));
  const samples = new Int16Array(frames);

  let cursor = 0;
  for (const pulse of pulses) {
    const count = Math.floor((pulse.durationMs / 1000) * sampleRate);
    for (let index = 0; index < count && cursor + index < frames; index += 1) {
      const t = index / sampleRate;
      const attack = Math.min(1, index / 200);
      const release = Math.min(1, (count - index) / 240);
      const wave =
        Math.sin(2 * Math.PI * pulse.freq * t) * 0.65 +
        Math.sin(4 * Math.PI * pulse.freq * t) * 0.25;
      samples[cursor + index] = Math.round(Math.max(-1, Math.min(1, wave * attack * release)) * 32767);
    }
    cursor += Math.floor(((pulse.durationMs + pulse.pauseMs) / 1000) * sampleRate);
  }

  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);

  writeAscii(bytes, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeAscii(bytes, 8, "WAVE");
  writeAscii(bytes, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(bytes, 36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) {
    view.setInt16(44 + index * 2, samples[index], true);
  }

  return `data:audio/wav;base64,${toBase64(bytes)}`;
}

/**
 * Plays a synthesized pattern through an `<audio>` element. This is the layer
 * that still reaches the hardware media channel when Web Audio is throttled.
 */
export function playWavTonePattern(pulses: TonePulse[], volume = 1): void {
  try {
    const audio = new Audio(buildWavDataUrl(pulses));
    audio.volume = Math.min(1, Math.max(0, volume));
    void audio.play().catch(() => undefined);
  } catch (error) {
    console.warn("wav playback failed", error);
  }
}

function getOnlineAudio(key: keyof typeof ONLINE_SOUNDS): HTMLAudioElement | null {
  const cached = onlineCache.get(key);
  if (cached) return cached;

  try {
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.preload = "auto";
    audio.src = ONLINE_SOUNDS[key];
    onlineCache.set(key, audio);
    return audio;
  } catch {
    return null;
  }
}

/** Online clip when it loads, generated WAV pattern otherwise. */
function playOnlineOrWav(key: keyof typeof ONLINE_SOUNDS, volume: number, fallback: TonePulse[]): void {
  const source = getOnlineAudio(key);
  if (!source) {
    playWavTonePattern(fallback, volume);
    return;
  }

  try {
    const clip = source.cloneNode(true) as HTMLAudioElement;
    clip.volume = Math.min(1, Math.max(0, volume));
    void clip
      .play()
      .then(() => undefined)
      .catch(() => playWavTonePattern(fallback, volume));
  } catch {
    playWavTonePattern(fallback, volume);
  }
}

/** Android/iOS only allow audio after a user gesture — call this once. */
export function unlockAudio(): void {
  getAudioContext();
  // Warm the optional online clips so the first alarm is instant.
  getOnlineAudio("alarm");
  getOnlineAudio("water");
}

// ---------------------------------------------------------------------------
// Alert vocabulary
// ---------------------------------------------------------------------------

const ALARM_PATTERN: TonePulse[] = [
  { freq: 2400, durationMs: 90, pauseMs: 45 },
  { freq: 1200, durationMs: 90, pauseMs: 45 },
  { freq: 2400, durationMs: 90, pauseMs: 45 },
  { freq: 1200, durationMs: 110, pauseMs: 260 },
  { freq: 2400, durationMs: 90, pauseMs: 45 },
  { freq: 1200, durationMs: 90, pauseMs: 45 },
  { freq: 2400, durationMs: 90, pauseMs: 45 },
  { freq: 1200, durationMs: 130, pauseMs: 0 },
];

const RISING_BEEP = [1046, 1318, 1568];

/**
 * Rest timer / cardio timer finished: double burst at full level + strong buzz.
 * This has to cut through gym music, so every layer plays at once.
 */
export function alarm(): void {
  const ctx = getAudioContext();

  void (async () => {
    if (ctx) {
      await ensureRunning(ctx);
      let at = ctx.currentTime + 0.01;
      for (const pulse of ALARM_PATTERN) {
        scheduleTone(ctx, at, pulse.freq, pulse.durationMs / 1000, 1);
        at += (pulse.durationMs + pulse.pauseMs) / 1000;
      }
    }
    playOnlineOrWav("alarm", 1, ALARM_PATTERN);
  })();

  vibrate([500, 150, 500, 150, 700]);
}

/**
 * Set completed / overload applied: crisp rising beeps at 0.85 level.
 */
export function beep(times = 2, frequency = 1200, duration = 0.14): void {
  const ctx = getAudioContext();
  const pulses: TonePulse[] = [];

  for (let index = 0; index < times; index += 1) {
    const freq = frequency === 1200
      ? RISING_BEEP[Math.min(index, RISING_BEEP.length - 1)]
      : frequency * (1 + index * 0.08);
    pulses.push({ freq, durationMs: duration * 1000, pauseMs: 60 });
  }

  void (async () => {
    if (ctx) {
      await ensureRunning(ctx);
      let at = ctx.currentTime + 0.01;
      for (const pulse of pulses) {
        scheduleTone(ctx, at, pulse.freq, duration, 0.85);
        at += (pulse.durationMs + pulse.pauseMs) / 1000;
      }
    }
    playWavTonePattern(pulses, 0.85);
  })();

  vibrate([120, 60, 180]);
}

/** Whole exercise finished: quick rising arpeggio. */
export function chord(): void {
  const ctx = getAudioContext();
  const notes = [523.25, 659.25, 783.99, 1046.5];

  void (async () => {
    if (!ctx) return;
    await ensureRunning(ctx);
    const start = ctx.currentTime + 0.01;
    notes.forEach((freq, index) => {
      scheduleTone(ctx, start + index * 0.085, freq, 0.32, 0.7);
    });
  })();

  vibrate([80, 40, 80, 40, 120]);
}

/** Minor ticks (warm-up, checklist rows): short and polite. */
export function softTap(frequency = 980, duration = 0.09): void {
  const ctx = getAudioContext();

  void (async () => {
    if (!ctx) return;
    await ensureRunning(ctx);
    scheduleTone(ctx, ctx.currentTime + 0.01, frequency, duration, 0.45);
  })();

  vibrate(50);
}

/**
 * Water reminder: deliberately soft — a droplet chime, a light buzz and a
 * system notification when the user allowed them.
 */
export function waterAlert(): void {
  const ctx = getAudioContext();

  void (async () => {
    if (ctx) {
      await ensureRunning(ctx);
      const at = ctx.currentTime + 0.01;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(600, at);
      oscillator.frequency.exponentialRampToValueAtTime(1100, at + 0.18);

      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.22, at + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);

      oscillator.connect(gain).connect(masterBus ?? ctx.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.2);
    }
    playOnlineOrWav("water", 0.25, [{ freq: 900, durationMs: 180, pauseMs: 0 }]);
  })();

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
