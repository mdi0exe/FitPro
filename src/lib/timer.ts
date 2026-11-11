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
// Audio
// ---------------------------------------------------------------------------

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!audioContext) audioContext = new Ctor();
    if (audioContext.state === "suspended") void audioContext.resume();
    return audioContext;
  } catch (error) {
    console.warn("Web Audio is unavailable", error);
    return null;
  }
}

/** Android/iOS only allow audio after a user gesture — call this once. */
export function unlockAudio(): void {
  getAudioContext();
}

/** Short confirmation beeps (default: two high beeps). */
export function beep(times = 2, frequency = 880, duration = 0.16): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const schedule = () => {
    for (let i = 0; i < times; i += 1) {
      const startAt = ctx.currentTime + i * (duration + 0.1);
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.22, startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + duration + 0.02);
    }
  };

  // Android WebView starts the context suspended; scheduling before it resumes
  // silently drops the first beeps (or stacks them on resume).
  if (ctx.state === "suspended") {
    void ctx
      .resume()
      .then(schedule)
      .catch(() => undefined);
  } else {
    schedule();
  }
}

/** End-of-rest alarm: three rising beeps. */
export function alarm(): void {
  beep(1, 660, 0.14);
  window.setTimeout(() => beep(1, 880, 0.14), 180);
  window.setTimeout(() => beep(1, 1100, 0.2), 360);
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
