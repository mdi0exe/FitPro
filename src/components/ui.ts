/** Shared UI primitives: modal sheet, confirm dialog, toasts, progress bars. */
import { btn, el, escapeHtml, svgIcon } from "../lib/dom";
import { icons } from "../lib/icons";
import { pushOverlay, releaseOverlay } from "../lib/navigation";

const overlayRoot = () => document.getElementById("overlay-root") as HTMLElement;
const toastRoot = () => document.getElementById("toast-root") as HTMLElement;

let scrollLocks = 0;

function lockScroll(): void {
  scrollLocks += 1;
  document.body.style.overflow = "hidden";
}

function unlockScroll(): void {
  scrollLocks = Math.max(0, scrollLocks - 1);
  if (scrollLocks === 0) document.body.style.overflow = "";
}

export interface ModalOptions {
  title: string;
  subtitle?: string;
  body: HTMLElement;
  footer?: HTMLElement;
  onClose?: () => void;
}

export interface ModalHandle {
  close: () => void;
  element: HTMLElement;
}

/** Bottom-sheet style modal that works on phones and desktop. */
export function openModal(options: ModalOptions): ModalHandle {
  const backdrop = el(
    "div",
    "fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/75 p-0 backdrop-blur-sm sm:items-center sm:p-6",
  );
  backdrop.style.animation = "fade-up 0.18s ease-out both";

  const sheet = el(
    "div",
    "flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-3xl border border-slate-800 bg-slate-900 shadow-2xl animate-pop-in sm:max-w-lg sm:rounded-3xl",
  );

  const header = el("div", "flex items-start justify-between gap-3 border-b border-slate-800/80 px-5 py-4");
  const titles = el("div", "min-w-0");
  titles.append(el("h2", "truncate text-base font-extrabold text-slate-50", escapeHtml(options.title)));
  if (options.subtitle) {
    titles.append(el("p", "mt-0.5 text-[11px] leading-5 text-slate-400", escapeHtml(options.subtitle)));
  }
  const closeButton = btn("btn-icon shrink-0", svgIcon(icons.x, "h-4 w-4"), () => handle.close(), {
    "aria-label": "بستن",
  });
  header.append(titles, closeButton);

  const body = el("div", "min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(var(--safe-bottom)+1.25rem)] pt-4");
  body.append(options.body);

  sheet.append(header, body);
  if (options.footer) {
    const footer = el("div", "border-t border-slate-800/80 bg-slate-900/80 px-5 py-3");
    footer.append(options.footer);
    sheet.append(footer);
  }

  backdrop.append(sheet);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) handle.close();
  });

  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") handle.close();
  };

  let closed = false;

  const closeDom = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKey);
    backdrop.remove();
    unlockScroll();
    options.onClose?.();
  };

  // The Android back gesture pops this entry and closes the sheet.
  const overlayId = pushOverlay(closeDom);

  const handle: ModalHandle = {
    element: sheet,
    close() {
      releaseOverlay(overlayId);
      closeDom();
    },
  };

  document.addEventListener("keydown", onKey);
  overlayRoot().append(backdrop);
  lockScroll();
  return handle;
}

/** Promise-based confirmation sheet (no native `confirm()` in a webview). */
export function confirmDialog(options: {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;

    const body = el("div", "space-y-4");
    body.append(el("p", "tip-text text-sm leading-7 text-slate-300", escapeHtml(options.message)));

    const actions = el("div", "grid grid-cols-2 gap-2");
    const cancel = btn("btn-ghost", options.cancelText ?? "انصراف", () => {
      if (settled) return;
      settled = true;
      handle.close();
      resolve(false);
    });
    const confirm = btn(options.danger ? "btn-danger" : "btn-primary", options.confirmText ?? "تایید", () => {
      if (settled) return;
      settled = true;
      handle.close();
      resolve(true);
    });
    actions.append(confirm, cancel);
    body.append(actions);

    const handle = openModal({
      title: options.title,
      body,
      onClose: () => {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      },
    });
  });
}

export type ToastKind = "ok" | "error" | "info";

const toastStyles: Record<ToastKind, string> = {
  ok: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
  error: "border-rose-500/40 bg-rose-500/15 text-rose-200",
  info: "border-cyan-500/40 bg-cyan-500/15 text-cyan-200",
};

export function toast(message: string, kind: ToastKind = "ok"): void {
  const root = toastRoot();
  if (!root) return;
  const node = el(
    "div",
    `pointer-events-auto flex w-full max-w-sm items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-xs font-bold shadow-xl backdrop-blur-md ${toastStyles[kind]}`,
  );
  node.append(svgIcon(kind === "error" ? icons.x : icons.check, "h-4 w-4 shrink-0"));
  node.append(el("span", "leading-6", escapeHtml(message)));
  node.style.animation = "fade-up 0.25s ease-out both";
  root.append(node);

  window.setTimeout(() => {
    node.style.transition = "opacity 0.3s ease, transform 0.3s ease";
    node.style.opacity = "0";
    node.style.transform = "translateY(-8px)";
    window.setTimeout(() => node.remove(), 320);
  }, 2600);
}

/**
 * Toast with one inline action button.
 *
 * Used by the water reminder so a glass can be logged straight from the banner
 * (the Android notification carries the same action). Stays up longer than a
 * plain toast because it needs a decision.
 */
export function toastWithAction(
  message: string,
  actionLabel: string,
  onAction: () => void,
  kind: ToastKind = "info",
): void {
  const root = toastRoot();
  if (!root) return;

  const node = el(
    "div",
    `pointer-events-auto flex w-full max-w-sm items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-bold shadow-xl backdrop-blur-md ${toastStyles[kind]}`,
  );
  node.append(svgIcon(icons.drop, "h-4 w-4 shrink-0"));
  node.append(el("span", "min-w-0 flex-1 leading-6", escapeHtml(message)));

  const action = btn(
    "shrink-0 rounded-xl bg-cyan-400 px-2.5 py-1.5 text-[11px] font-black text-slate-950 transition active:scale-95",
    actionLabel,
    () => {
      dismiss();
      onAction();
    },
    { "aria-label": actionLabel },
  );
  node.append(action);
  node.style.animation = "fade-up 0.25s ease-out both";
  root.append(node);

  let removed = false;
  const dismiss = () => {
    if (removed) return;
    removed = true;
    window.clearTimeout(timer);
    node.style.transition = "opacity 0.3s ease, transform 0.3s ease";
    node.style.opacity = "0";
    node.style.transform = "translateY(-8px)";
    window.setTimeout(() => node.remove(), 320);
  };
  const timer = window.setTimeout(dismiss, 7000);
}

/** Slim gradient progress bar (0-100). */export function progressBar(percent: number, extraClass = ""): HTMLElement {
  const track = el("div", `h-2 w-full overflow-hidden rounded-full bg-slate-800/80 ${extraClass}`);
  const fill = el(
    "div",
    "h-full rounded-full bg-gradient-to-l from-emerald-400 via-emerald-400 to-cyan-400 transition-[width] duration-500",
  );
  fill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
  track.append(fill);
  return track;
}

/** Section heading with an optional trailing element. */
export function sectionTitle(text: string, trailing?: HTMLElement): HTMLElement {
  const row = el("div", "mb-2 flex items-center justify-between gap-2 px-1");
  row.append(el("h2", "text-sm font-extrabold text-slate-200", escapeHtml(text)));
  if (trailing) row.append(trailing);
  return row;
}

export function emptyState(text: string): HTMLElement {
  return el(
    "div",
    "rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 px-4 py-6 text-center text-xs text-slate-500",
    escapeHtml(text),
  );
}
