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
export function releaseOverlay(id: string): void {
  const index = stack.findIndex((entry) => entry.id === id);
  if (index === -1) return;
  stack.splice(index, 1);

  const state = history.state as { overlay?: string } | null;
  if (state?.overlay === id) {
    // Our entry is still current: step back, and swallow the resulting event so
    // it does not also pop a tab.
    suppressed += 1;
    history.back();
  }
}

/** Records a tab change so back returns to the previous screen. */
export function pushTab(tab: string): void {
  history.pushState({ tab }, "");
}
