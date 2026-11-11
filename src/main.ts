/** Application bootstrap: loads state, builds the shell and wires rendering. */
import "./styles.css";

import { loadState } from "./lib/api";
import { clear, el, escapeHtml, preserveScroll } from "./lib/dom";
import { installNavigation } from "./lib/navigation";
import { unlockAudio } from "./lib/timer";
import {
  ensureDailyDietReset,
  getActiveTab,
  initState,
  installLifecycleFlush,
  persist,
  requestRender,
  setActiveTab,
  setRenderHook,
} from "./lib/store";
import { mountRestTimer } from "./components/restTimer";
import { renderHeader, renderNav } from "./components/shell";
import { toast } from "./components/ui";
import { renderWorkout } from "./views/workout";
import { renderProgress } from "./views/progress";
import { renderNutrition } from "./views/nutrition";
import { renderCoach } from "./views/coach";

const app = document.getElementById("app") as HTMLElement;

// Android WebView paints edge-to-edge but reports 0 for env(safe-area-*), so the
// CSS variables fall back to fixed minima on that platform only.
if (/Android/i.test(navigator.userAgent)) {
  document.documentElement.classList.add("is-android");
}

function buildShell(): void {
  clear(app);
  app.className = "mx-auto min-h-screen w-full max-w-2xl pb-36";

  const headerSlot = el("div");
  headerSlot.id = "header-slot";

  const view = el("main", "px-4 pb-4 pt-3");
  view.id = "view";

  const navSlot = el("div");
  navSlot.id = "nav-slot";

  app.append(headerSlot, view, navSlot);
}

function renderChrome(): void {
  const headerSlot = document.getElementById("header-slot");
  const navSlot = document.getElementById("nav-slot");
  if (headerSlot) {
    clear(headerSlot);
    headerSlot.append(renderHeader());
  }
  if (navSlot) {
    clear(navSlot);
    navSlot.append(renderNav());
  }
}

function currentView(): HTMLElement {
  switch (getActiveTab()) {
    case "progress":
      return renderProgress();
    case "nutrition":
      return renderNutrition();
    case "coach":
      return renderCoach();
    case "workout":
    default:
      return renderWorkout();
  }
}

/** Re-renders the active tab and the chrome. */
function renderView(keepScroll = false): void {
  const view = document.getElementById("view");
  if (!view) return;

  const paint = () => {
    clear(view);
    view.append(currentView());
  };

  if (keepScroll) preserveScroll(paint);
  else paint();

  renderChrome();
}

function renderFatal(error: unknown): void {
  clear(app);
  app.className = "flex min-h-screen items-center justify-center px-6";
  const box = el("div", "w-full max-w-md rounded-3xl border border-rose-500/30 bg-rose-500/5 p-6 text-center");
  box.append(
    el("p", "text-3xl", "⚠️"),
    el("h1", "mt-2 text-base font-extrabold text-rose-200", "برنامه بارگذاری نشد"),
    el(
      "p",
      "mt-2 text-[11px] leading-6 text-rose-200/70",
      escapeHtml(error instanceof Error ? error.message : String(error)),
    ),
  );
  const retry = el("button", "btn-primary mt-4 w-full", "تلاش دوباره");
  retry.type = "button";
  retry.addEventListener("click", () => window.location.reload());
  box.append(retry);
  app.append(box);
}

async function boot(): Promise<void> {
  try {
    const state = await loadState();
    initState(state);

    // A new calendar day starts with an empty nutrition checklist.
    if (ensureDailyDietReset()) persist(0);

    buildShell();
    mountRestTimer();
    installLifecycleFlush();
    setRenderHook(() => renderView(true));

    // Android back: close the open overlay first, otherwise return to the
    // workout tab instead of letting the OS kill the app.
    installNavigation(() => {
      if (getActiveTab() !== "workout") {
        setActiveTab("workout");
        requestRender();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });

    renderView();

    // Android requires a user gesture before audio playback is allowed.
    const unlock = () => {
      unlockAudio();
      window.removeEventListener("pointerdown", unlock);
    };
    window.addEventListener("pointerdown", unlock, { once: true });

    window.addEventListener("unhandledrejection", (event) => {
      console.error("unhandled rejection", event.reason);
      toast(event.reason instanceof Error ? event.reason.message : "خطای غیرمنتظره رخ داد.", "error");
    });
  } catch (error) {
    console.error("boot failed", error);
    renderFatal(error);
  }
}

void boot();

// Keep the UI in sync if the app is resumed on a new day.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  try {
    if (ensureDailyDietReset()) {
      persist(0);
      requestRender();
    }
  } catch {
    /* state not ready yet */
  }
});
