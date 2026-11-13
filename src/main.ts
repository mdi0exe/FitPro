/** Application bootstrap: loads state, builds the shell and wires rendering. */
import "./styles.css";

import { loadState } from "./lib/api";
import { clear, el, escapeHtml } from "./lib/dom";
import { installNavigation } from "./lib/navigation";
import { restoreWaterReminderOnBoot, unlockAudio } from "./lib/timer";
import {
  applyTheme,
  ensureDailyDietReset,
  getActiveTab,
  getState,
  homeTab,
  initState,
  installLifecycleFlush,
  persist,
  requestRender,
  setActiveTab,
  setRenderHook,
  visibleTabs,
} from "./lib/store";
import { mountRestTimer } from "./components/restTimer";
import { installWakeLockLifecycle } from "./lib/workoutTools";
import { renderUni } from "./views/uni";
import { renderHeader, renderNav } from "./components/shell";
import { toast } from "./components/ui";
import { initNotificationActions } from "./lib/notify";
import { renderWorkout } from "./views/workout";
import { renderProgress } from "./views/progress";
import { renderNutrition } from "./views/nutrition";
import { renderCoach } from "./views/coach";
import { openOnboardingModal } from "./components/onboarding";
import type { TabId } from "./types";

const app = document.getElementById("app") as HTMLElement;

let lastRenderedTab: TabId | null = null;
let lastNavKey = "";
let lastHeaderKey = "";

/** Cheap fingerprint of everything `renderHeader` draws. */
function headerSignature(): string {
  try {
    const state = getState();
    const { profile } = state;
    return [
      profile.name,
      profile.currentWeight,
      profile.targetWeight,
      profile.startWeight,
      profile.workoutProgramId,
      profile.universityName,
      state.theme,
      state.appMode,
      state.languageStudy.title,
      state.languageStudy.targetMinutes,
      state.languageStudy.completedDates.length,
    ].join("|");
  } catch {
    return "";
  }
}

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

function renderChrome(force = false): void {
  const headerSlot = document.getElementById("header-slot");
  const navSlot = document.getElementById("nav-slot");
  const tab = getActiveTab();

  // The header only depends on the profile numbers, and the bottom nav only on
  // the active tab. Replacing them on every tick made the whole page flash, so
  // each slot is rebuilt only when its own data actually changed.
  const headerKey = headerSignature();
  if (force || headerKey !== lastHeaderKey) {
    lastHeaderKey = headerKey;
    if (headerSlot) {
      clear(headerSlot);
      headerSlot.append(renderHeader());
    }
  }
  // The nav also has to rebuild when the modular mode changes: switching to
  // "university only" removes two tabs without changing the active tab.
  const navKey = `${tab}|${getState().appMode}`;
  if (force || navKey !== lastNavKey) {
    lastNavKey = navKey;
    if (navSlot) {
      clear(navSlot);
      navSlot.append(renderNav());
    }
  }
}

function currentView(): HTMLElement {
  switch (getActiveTab()) {
    case "progress":
      return renderProgress();
    case "nutrition":
      return renderNutrition();
    case "uni":
      return renderUni();
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

  const tab = getActiveTab();
  // Switching tabs is the only moment the entrance animation should replay.
  // Re-rendering after a tap inside the same tab must not restart it.
  const sameTab = lastRenderedTab === tab;
  lastRenderedTab = tab;

  const next = currentView();
  if (sameTab) next.classList.remove("animate-fade-up");

  if (keepScroll) {
    const y = window.scrollY;
    view.replaceChildren(next);
    // Two frames: the browser applies the layout before the restore, so the
    // scroll position never jumps (iOS/Android webviews included).
    window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior });
    requestAnimationFrame(() => window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior }));
  } else {
    view.replaceChildren(next);
  }

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
    // Paint the saved theme before the first frame so a light-mode user never
    // sees a dark flash on cold start.
    applyTheme();

    // A new calendar day starts with an empty nutrition checklist.
    if (ensureDailyDietReset()) persist(0);

    buildShell();
    mountRestTimer();
    installLifecycleFlush();
    // Keep the screen awake while training (re-acquired on resume).
    installWakeLockLifecycle();
    // Android action button: "+1 glass" straight from the notification shade.
    void initNotificationActions();
    setRenderHook(() => renderView(true));

    // Android back: close the open overlay first, otherwise return to the
    // workout tab instead of letting the OS kill the app.
    installNavigation(() => {
      const home = homeTab(getState().appMode);
      if (getActiveTab() !== home) {
        setActiveTab(home);
        requestRender();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });

    renderView();

    // First run (or `?onboarding=1` for previews/e2e) opens the setup wizard.
    // The browser fallback seed already marks itself configured so scripted
    // dev pages are not blocked by a modal.
    const forceWizard = new URLSearchParams(window.location.search).has("onboarding");
    if (!state.onboardingCompleted || forceWizard) {
      if (!visibleTabs(state.appMode).includes(getActiveTab())) {
        setActiveTab(homeTab(state.appMode));
        requestRender();
      }
      openOnboardingModal();
    }

    // Resume the water reminder from its persisted deadline. This never resets
    // the countdown: closing the app only pauses it.
    restoreWaterReminderOnBoot();

    // Coming back from the background can be hours later — recompute the
    // remaining time (and fire once if the deadline passed meanwhile).
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") restoreWaterReminderOnBoot();
    });

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

// A late session can run past midnight with the app still in the foreground, so
// the calendar is re-checked every minute: the nutrition checklist and any
// "machine is busy" swap reset without needing a restart.
window.setInterval(() => {
  try {
    if (ensureDailyDietReset()) {
      persist(0);
      requestRender();
    }
  } catch {
    /* state not ready yet */
  }
}, 60_000);
