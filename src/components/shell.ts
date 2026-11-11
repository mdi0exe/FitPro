/** App shell: sticky header, bottom navigation and quick weight sheet. */
import { btn, el, escapeHtml, svgIcon } from "../lib/dom";
import { icons } from "../lib/icons";
import { pushTab } from "../lib/navigation";
import { fa, faDate, faNum, faSigned, isoToday, parseNum } from "../lib/fa";
import { logBodyWeight } from "../lib/api";
import { getActiveTab, getState, requestRender, setActiveTab, setState } from "../lib/store";
import type { TabId } from "../types";
import { openModal, progressBar, toast } from "./ui";

const NAV_ITEMS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: "workout", label: "تمرین", icon: icons.dumbbell },
  { id: "progress", label: "پیشرفت", icon: icons.chart },
  { id: "nutrition", label: "تغذیه", icon: icons.salad },
  { id: "coach", label: "مربی", icon: icons.sparkles },
];

export function renderHeader(): HTMLElement {
  const { profile } = getState();
  const gained = profile.currentWeight - profile.startWeight;
  const span = Math.max(0.1, profile.targetWeight - profile.startWeight);
  const percent = Math.min(100, Math.max(0, (gained / span) * 100));

  const header = el(
    "header",
    "sticky top-0 z-40 border-b border-slate-800/70 bg-slate-950/85 backdrop-blur-xl",
  );
  const inner = el("div", "mx-auto max-w-2xl px-4 pb-2.5 pt-[calc(var(--safe-top)+0.5rem)]");

  const row = el("div", "flex items-center justify-between gap-3");
  const titles = el("div", "min-w-0");
  titles.append(
    el("p", "text-[10px] font-medium text-emerald-400/80", "هایپرتروفی دانشجویی • ۴ روز در هفته"),
    el("h1", "truncate text-base font-extrabold text-slate-50", `سلام ${escapeHtml(profile.name)} 💪`),
  );

  const weightChip = btn(
    "flex shrink-0 flex-col items-center rounded-2xl border border-slate-800 bg-slate-900/70 px-3 py-1.5 transition active:scale-95",
    `<span class="text-[9px] text-slate-500">وزن فعلی</span>
     <span class="text-sm font-extrabold text-emerald-400">${faNum(profile.currentWeight, 1)}</span>`,
    () => openWeightSheet(),
    { title: "ثبت وزن" },
  );

  row.append(titles, weightChip);

  const goalRow = el("div", "mt-2 flex items-center gap-2");
  const bar = progressBar(percent, "flex-1");
  const goalText = el("span", "shrink-0 text-[9px] text-slate-500", `${fa(Math.round(percent))}٪ تا ${faNum(profile.targetWeight, 0)} کیلو`);
  goalRow.append(bar, goalText);

  inner.append(row, goalRow);
  header.append(inner);
  return header;
}

export function renderNav(): HTMLElement {
  const active = getActiveTab();
  const nav = el(
    "nav",
    "fixed inset-x-0 bottom-0 z-50 border-t border-slate-800/80 bg-slate-950/95 backdrop-blur-xl",
  );
  const inner = el(
    "div",
    "mx-auto flex max-w-2xl items-stretch justify-around px-2 pb-[calc(var(--safe-bottom)+0.25rem)] pt-2",
  );

  NAV_ITEMS.forEach((item) => {
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
      pushTab(item.id);
      setActiveTab(item.id);
      requestRender();
      window.scrollTo({ top: 0, behavior: "smooth" });
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

  const input = el("input", "field text-lg");
  input.type = "text";
  input.inputMode = "decimal";
  input.autocomplete = "off";
  input.value = faNum(state.profile.currentWeight, 1);

  const label = el("div", "space-y-1");
  label.append(el("label", "label", "وزن امروز (کیلوگرم)"), input);
  body.append(label);

  const quick = el("div", "grid grid-cols-3 gap-2");
  [-0.5, +0.5, +1].forEach((delta) => {
    quick.append(
      btn(
        "btn-ghost py-2 text-xs",
        faSigned(delta),
        () => {
          const current = parseNum(input.value) || state.profile.currentWeight;
          input.value = String(Math.round((current + delta) * 10) / 10);
        },
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
  const save = btn("btn-primary", "ثبت وزن", () => void submit(input.value, handle.close));
  footer.append(save, btn("btn-ghost", "بستن", () => handle.close()));

  const handle = openModal({
    title: "ثبت وزن",
    subtitle: `امروز ${faDate(isoToday(), { withWeekday: true })}`,
    body,
    footer,
  });
}

async function submit(raw: string, close: () => void): Promise<void> {
  const value = parseNum(raw);
  if (value <= 0) {
    toast("یک عدد معتبر وارد کن.", "error");
    return;
  }
  try {
    const next = await logBodyWeight(value);
    setState(next);
    close();
    toast("وزن ثبت شد ✅");
    requestRender();
  } catch (error) {
    toast(error instanceof Error ? error.message : "ثبت وزن ناموفق بود.", "error");
  }
}
