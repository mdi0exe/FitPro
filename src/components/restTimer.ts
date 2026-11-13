/**
 * Floating 90-second rest timer.
 *
 * Mounted once into `#overlay-root` so it keeps running while the workout view
 * re-renders underneath it.
 */
import { btn, el, svgIcon } from "../lib/dom";
import { icons } from "../lib/icons";
import { clock, fa } from "../lib/fa";
import { pushSystemNotification } from "../lib/notify";
import { alarm, restTimer } from "../lib/timer";
import { getState } from "../lib/store";

const RADIUS = 20;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

let container: HTMLElement | null = null;
let ring: SVGCircleElement | null = null;
let timeLabel: HTMLElement | null = null;
let caption: HTMLElement | null = null;
let hideHandle: number | null = null;

export function mountRestTimer(): void {
  if (container) return;

  container = el(
    "div",
    "pointer-events-none fixed inset-x-0 bottom-0 z-[60] hidden px-3 pb-[calc(var(--safe-bottom)+5.25rem)]",
  );
  container.id = "rest-timer";

  const card = el(
    "div",
    "pointer-events-auto mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-emerald-500/30 bg-slate-900/95 p-3 shadow-[0_18px_45px_-12px_rgba(16,185,129,0.45)] backdrop-blur-xl",
  );
  card.style.animation = "fade-up 0.25s ease-out both";

  const ringWrap = el("div", "relative h-12 w-12 shrink-0");
  ringWrap.innerHTML = `
    <svg viewBox="0 0 48 48" class="h-12 w-12 -rotate-90">
      <circle cx="24" cy="24" r="${RADIUS}" fill="none" stroke="rgba(148,163,184,0.18)" stroke-width="4" />
      <circle cx="24" cy="24" r="${RADIUS}" fill="none" stroke="url(#restGrad)" stroke-width="4"
        stroke-linecap="round" stroke-dasharray="${CIRCUMFERENCE}" stroke-dashoffset="0" />
      <defs>
        <linearGradient id="restGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#34d399" />
          <stop offset="100%" stop-color="#22d3ee" />
        </linearGradient>
      </defs>
    </svg>`;
  ring = ringWrap.querySelector("circle:nth-of-type(2)") as SVGCircleElement;

  const labels = el("div", "min-w-0 flex-1");
  caption = el("p", "text-[10px] font-medium text-emerald-300/90", "استراحت بین ست‌ها");
  timeLabel = el("p", "font-vazir text-2xl font-extrabold leading-tight tabular-nums text-slate-50", "۱:۳۰");
  labels.append(caption, timeLabel);

  const actions = el("div", "flex shrink-0 items-center gap-1");
  actions.append(
    btn("btn-icon", svgIcon(icons.minus, "h-4 w-4"), () => restTimer.add(-15), {
      "aria-label": "کاهش ۱۵ ثانیه",
      title: "−۱۵ ثانیه",
    }),
    btn("btn-icon", svgIcon(icons.plus, "h-4 w-4"), () => bumpRest(15), {
      "aria-label": "افزایش ۱۵ ثانیه",
      title: "+۱۵ ثانیه",
    }),
    btn(
      "rounded-xl border border-slate-700/70 bg-slate-800/80 px-2.5 py-2 text-[11px] font-bold text-slate-300 transition active:scale-95",
      "رد کردن",
      () => stopRest(),
      { title: "پایان استراحت" },
    ),
  );

  card.append(ringWrap, labels, actions);
  container.append(card);
  document.getElementById("overlay-root")?.append(container);

  restTimer.onTick = (remaining, total) => {
    if (!ring || !timeLabel) return;
    const progress = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
    ring.style.strokeDashoffset = `${CIRCUMFERENCE * (1 - progress)}`;
    timeLabel.textContent = fa(clock(remaining));
  };
  restTimer.onDone = () => {
    if (caption) {
      caption.textContent = "استراحت تمام شد. ست بعدی را آغاز کنید.";
      caption.className = "text-[10px] font-bold text-emerald-300";
    }
    if (timeLabel) timeLabel.textContent = "ست بعدی";
    alarm();
    // Reach the user even when the screen is off or another app is open.
    void pushSystemNotification("استراحت تمام شد", "زمان اجرای ست بعدی است.");
    hideHandle = window.setTimeout(() => stopRest(), 3200);
  };

  restTimer.onTick?.(restTimer.remaining, restTimer.total, restTimer.running);
}

function show(): void {
  if (!container) return;
  if (hideHandle !== null) {
    window.clearTimeout(hideHandle);
    hideHandle = null;
  }
  container.classList.remove("hidden");
  if (caption) {
    caption.textContent = "استراحت بین ست‌ها";
    caption.className = "text-[10px] font-medium text-emerald-300/90";
  }
}

/** Starts (or restarts) the rest countdown. */
export function startRest(seconds?: number): void {
  if (!container) mountRestTimer();
  const total = seconds ?? getState().restSeconds;
  restTimer.reset(total);
  show();
  restTimer.start();
}

export function stopRest(): void {
  restTimer.reset(restTimer.total);
  restTimer.pause();
  if (hideHandle !== null) {
    window.clearTimeout(hideHandle);
    hideHandle = null;
  }
  container?.classList.add("hidden");
}

/**
 * Adds (or removes) time. When the alarm already fired the timer is stopped but
 * the banner is still on screen, so a "+15" has to revive it instead of letting
 * the auto-hide swallow it.
 */
export function bumpRest(delta: number): void {
  if (hideHandle !== null) {
    window.clearTimeout(hideHandle);
    hideHandle = null;
  }
  if (caption) {
    caption.textContent = "استراحت بین ست‌ها";
    caption.className = "text-[10px] font-medium text-emerald-300/90";
  }

  restTimer.add(delta);

  if (delta > 0 && !restTimer.running) {
    restTimer.start();
  }
}
