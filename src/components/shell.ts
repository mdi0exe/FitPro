/** App shell: sticky header, bottom navigation and quick weight sheet. */
import { btn, el, escapeHtml, svgIcon } from "../lib/dom";
import { icons } from "../lib/icons";
import { pushTab } from "../lib/navigation";
import { fa, faDate, faNum, faSigned, isoToday } from "../lib/fa";
import { logBodyWeight } from "../lib/api";
import {
  applyTheme,
  getActiveTab,
  getState,
  homeTab,
  persist,
  requestRender,
  setActiveTab,
  setState,
  visibleTabs,
} from "../lib/store";
import { findProgram } from "../data/programs";
import type { TabId } from "../types";
import { openModal, progressBar, toast } from "./ui";
import { openOnboardingModal } from "./onboarding";

const NAV_ITEMS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: "workout", label: "تمرین", icon: icons.dumbbell },
  { id: "progress", label: "پیشرفت", icon: icons.chart },
  { id: "nutrition", label: "تغذیه", icon: icons.salad },
  { id: "uni", label: "دانشگاه", icon: icons.bus },
  { id: "coach", label: "مربی", icon: icons.sparkles },
];

export function renderHeader(): HTMLElement {
  const state = getState();
  const { profile } = state;
  const isLoss = profile.targetWeight < profile.startWeight;
  const span = Math.abs(profile.targetWeight - profile.startWeight);
  const changed = isLoss
    ? profile.startWeight - profile.currentWeight
    : profile.currentWeight - profile.startWeight;
  const percent = span < 0.1 ? 100 : Math.min(100, Math.max(0, (changed / span) * 100));
  const uniOnly = state.appMode === "uni_only";
  const program = findProgram(profile.workoutProgramId);

  const header = el(
    "header",
    "sticky top-0 z-40 border-b border-slate-800/70 bg-slate-950/95",
  );
  const inner = el("div", "mx-auto max-w-2xl px-4 pb-2.5 pt-[calc(var(--safe-top)+0.5rem)]");

  const row = el("div", "flex items-center justify-between gap-2");
  const titles = el("div", "min-w-0 flex-1");
  // Formal header: no emoji in the greeting. The active mode is carried by the
  // subtitle line, which uses a real stroke icon instead of a pictogram.
  const subtitle = el(
    "p",
    "flex items-center gap-1.5 truncate text-[10px] font-medium text-emerald-400/80",
  );
  subtitle.append(svgIcon(uniOnly ? icons.graduation : icons.dumbbell, "h-3 w-3 shrink-0"));
  subtitle.append(
    el(
      "span",
      "truncate",
      uniOnly
        ? `${escapeHtml(profile.universityName)} • برنامه‌ریزی دانشگاه`
        : `هایپرتروفی دانشجویی • ${program.daysPerWeekLabel}`,
    ),
  );
  titles.append(
    subtitle,
    el(
      "h1",
      "truncate text-base font-extrabold text-slate-50",
      `سلام ${escapeHtml(profile.name)}`,
    ),
  );

  const actions = el("div", "flex shrink-0 items-center gap-1.5");
  const weightChip = btn(
    "flex shrink-0 flex-col items-center rounded-2xl border border-slate-800 bg-slate-900/70 px-2.5 py-1.5 transition active:scale-95",
    `<span class="text-[9px] text-slate-500">وزن فعلی</span>
     <span class="text-sm font-extrabold text-emerald-400">${faNum(profile.currentWeight, 1)}</span>`,
    () => openWeightSheet(),
    { title: "ثبت وزن", "aria-label": "ثبت وزن" },
  );
  const themeBtn = btn(
    "btn-icon shrink-0",
    svgIcon(state.theme === "light" ? icons.moon : icons.sun, "h-5 w-5"),
    () => {
      state.theme = state.theme === "light" ? "dark" : "light";
      applyTheme();
      persist(0);
      requestRender();
    },
    { title: "تغییر حالت روشن / تیره", "aria-label": "تغییر حالت روشن یا تیره" },
  );
  const settingsBtn = btn(
    "btn-icon shrink-0",
    svgIcon(icons.settings, "h-5 w-5"),
    () => openOnboardingModal(),
    { title: "تنظیم پروفایل و حالت برنامه", "aria-label": "تنظیم پروفایل و حالت برنامه" },
  );
  actions.append(weightChip, themeBtn, settingsBtn);
  row.append(titles, actions);

  if (uniOnly) {
    // No weight progress bar in university-only mode: show the campus and
    // today's study goal instead.
    const lang = state.languageStudy;
    const doneToday = lang.completedDates.includes(isoToday());
    const infoRow = el(
      "div",
      "mt-2 flex items-center justify-between gap-2 rounded-xl border border-cyan-500/25 bg-cyan-500/5 px-2.5 py-1.5",
    );
    const langTitle = el(
      "span",
      "flex min-w-0 items-center gap-1.5 text-[10px] font-bold text-cyan-300",
    );
    langTitle.append(
      svgIcon(icons.book, "h-3 w-3 shrink-0"),
      el("span", "truncate", escapeHtml(lang.title)),
    );
    infoRow.append(
      langTitle,
      el(
        "span",
        "shrink-0 text-[9px] text-slate-400",
        `${doneToday ? "انجام شد" : "امروز"} • ${fa(lang.targetMinutes)} دقیقه`,
      ),
    );
    inner.append(row, infoRow);
  } else {
    const goalRow = el("div", "mt-2 flex items-center gap-2");
    const bar = progressBar(percent, "flex-1");
    const goalText = el(
      "span",
      "shrink-0 text-[9px] text-slate-500",
      `${fa(Math.round(percent))}٪ تا ${faNum(profile.targetWeight, 0)} کیلو`,
    );
    goalRow.append(bar, goalText);
    inner.append(row, goalRow);
  }

  header.append(inner);
  return header;
}

export function renderNav(): HTMLElement {
  const active = getActiveTab();
  const allowed = visibleTabs(getState().appMode);
  const nav = el(
    "nav",
    "fixed inset-x-0 bottom-0 z-50 border-t border-slate-800/80 bg-slate-950/95",
  );
  const inner = el(
    "div",
    "mx-auto flex max-w-2xl items-stretch justify-around px-2 pb-[calc(var(--safe-bottom)+0.25rem)] pt-2",
  );

  NAV_ITEMS.filter((item) => allowed.includes(item.id)).forEach((item) => {
    const isActive = item.id === active;
    const button = el(
      "button",
      `relative flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-1.5 transition active:scale-95 ${
        isActive ? "text-emerald-400" : "text-slate-500"
      }`,
    );
    button.type = "button";
    button.append(svgIcon(item.icon, "h-5 w-5"));
    button.append(el("span", "text-[10px] font-bold", item.label));
    if (isActive) {
      const dot = el("span", "absolute top-0 h-1 w-6 rounded-full bg-emerald-400");
      button.append(dot);
    }
    button.addEventListener("click", () => {
      if (getActiveTab() === item.id) return;
      pushTab(item.id, homeTab(getState().appMode));
      setActiveTab(item.id);
      requestRender();
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    });
    inner.append(button);
  });

  nav.append(inner);
  return nav;
}

/** Quick weight entry from the header chip. */
export function openWeightSheet(): void {
  const state = getState();
  const body = el("div", "space-y-4");

  body.append(
    el(
      "div",
      "rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 text-[11px] leading-6 text-emerald-100/80",
      `وزن فعلی: <b>${faNum(state.profile.currentWeight, 1)}</b> کیلوگرم • هدف: <b>${faNum(state.profile.targetWeight, 1)}</b> کیلوگرم`,
    ),
  );

  let draft = Math.round(state.profile.currentWeight * 10) / 10;

  const display = el(
    "p",
    "text-center text-4xl font-black leading-none tabular-nums text-slate-50",
    faNum(draft, 1),
  );
  const displayWrap = el("div", "rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-4");
  displayWrap.append(display, el("p", "mt-1 text-center text-[10px] text-slate-500", "کیلوگرم"));
  body.append(displayWrap);

  const bump = (delta: number) => {
    draft = Math.min(300, Math.max(30, Math.round((draft + delta) * 10) / 10));
    display.textContent = faNum(draft, 1);
  };

  // Six one-tap steps instead of a keyboard.
  const quick = el("div", "flex flex-wrap gap-2");
  [-1, -0.5, -0.1, 0.1, 0.5, 1].forEach((delta) => {
    quick.append(
      btn(
        `flex-1 basis-[28%] rounded-xl border py-2 text-xs font-bold transition active:scale-95 ${
          delta > 0
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
            : "border-slate-700 bg-slate-900/70 text-slate-300"
        }`,
        faSigned(delta),
        () => bump(delta),
      ),
    );
  });
  body.append(quick);

  const recent = state.weightHistory.slice(-3).reverse();
  if (recent.length > 0) {
    const list = el("div", "space-y-1");
    recent.forEach((entry) => {
      const row = el("div", "flex items-center justify-between rounded-lg bg-slate-950/50 px-2.5 py-1.5 text-[10px]");
      row.append(
        el("span", "text-slate-400", faDate(entry.date, { withYear: false })),
        el("span", "font-bold text-slate-200", `${faNum(entry.weight, 1)} کیلو`),
      );
      list.append(row);
    });
    body.append(list);
  }

  const footer = el("div", "grid grid-cols-2 gap-2");
  const save = btn("btn-primary", "ثبت وزن", () => void submit(draft, handle.close));
  footer.append(save, btn("btn-ghost", "بستن", () => handle.close()));

  const handle = openModal({
    title: "ثبت وزن",
    subtitle: `امروز ${faDate(isoToday(), { withWeekday: true })}`,
    body,
    footer,
  });
}

async function submit(value: number, close: () => void): Promise<void> {
  if (value <= 0) {
    toast("یک عدد معتبر وارد کن.", "error");
    return;
  }
  try {
    const next = await logBodyWeight(value);
    setState(next);
    close();
    toast("وزن ثبت شد.");
    requestRender();
  } catch (error) {
    toast(error instanceof Error ? error.message : "ثبت وزن ناموفق بود.", "error");
  }
}
