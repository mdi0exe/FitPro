/**
 * Android back-button / browser history integration.
 *
 * The system back gesture in a webview is forwarded to `history.back()`. Without
 * history entries it would close the whole app, so every overlay pushes one and
 * every tab switch does the same: back then closes the modal, or returns to the
 * workout tab, before it ever reaches the app itself.
 */

interface Overlay {
  id: string;
  close: () => void;
}

const stack: Overlay[] = [];
let sequence = 0;
let suppressed = 0;

/** Installs the popstate handler and a sentinel entry for the root screen. */
export function installNavigation(onBackAtRoot: () => void): void {
  if (!history.state) {
    // Sentinel: the first back press lands here instead of exiting the app.
    history.pushState({ root: true }, "");
  }

  window.addEventListener("popstate", () => {
    if (suppressed > 0) {
      suppressed -= 1;
      return;
    }

    const overlay = stack.pop();
    if (overlay) {
      overlay.close();
      return;
    }

    onBackAtRoot();
  });
}

/** Pushes a history entry and registers the overlay's close callback. */
export function pushOverlay(close: () => void): string {
  sequence += 1;
  const id = `overlay-${sequence}`;
  stack.push({ id, close });
  history.pushState({ overlay: id }, "");
  return id;
}

/** Releases an overlay that was closed from the UI (X, backdrop, action). */
let pendingReleases = 0;
let releaseScheduled = false;

/** True when `id` is the modal the Escape key should close. */
export function isTopOverlay(id: string): boolean {
  return stack.length > 0 && stack[stack.length - 1].id === id;
}

export function releaseOverlay(id: string): void {
  const index = stack.findIndex((entry) => entry.id === id);
  if (index === -1) return;
  stack.splice(index, 1);

  // Closing two overlays in the same tick (a confirm dialog inside a modal)
  // used to fire two `history.back()` calls, one of which popped the tab.
  // Batch them into a single `history.go(-n)`.
  pendingReleases += 1;
  if (releaseScheduled) return;
  releaseScheduled = true;
  queueMicrotask(() => {
    releaseScheduled = false;
    const steps = pendingReleases;
    pendingReleases = 0;
    if (steps <= 0) return;
    const state = history.state as { overlay?: string } | null;
    if (state?.overlay) {
      suppressed += steps;
      history.go(-steps);
    }
  });
}

/**
 * Records a tab change so back returns to the previous screen.
 *
 * Only the first hop out of the root/home entry is a real navigation. Once the
 * student is already on a non-home tab, replace that entry instead of stacking
 * another one — otherwise a long tab-hopping session leaves dozens of entries
 * and the Android back button appears to "do nothing" several times on the
 * home screen.
 */
export function pushTab(tab: string, homeTabId?: string): void {
  const state = history.state as { tab?: string } | null;
  if (homeTabId && tab === homeTabId) {
    // Going back to the home tab must not add an entry: otherwise one Back
    // press lands on the tab we just left instead of closing the app.
    if (state?.tab) {
      suppressed += 1;
      history.back();
    }
    return;
  }
  if (state?.tab) history.replaceState({ tab }, "");
  else history.pushState({ tab }, "");
}
