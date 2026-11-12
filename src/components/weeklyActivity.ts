/**
 * Weekly calendar (Saturday → Friday) plus a per-day activity report.
 *
 * Everything here reads the derived `activityHistory` snapshots written by
 * `syncTodayActivity()` in `store.ts`; nothing in this component mutates state
 * except the currently selected day.
 */
import { btn, el, escapeHtml } from "../lib/dom";
import {
  currentPersianWeekIsos,
  fa,
  faDate,
  faNum,
  faWeekdayName,
  faWeekdayShort,
  faWeight,
  isoToday,
  toJalali,
} from "../lib/fa";
import { getState, requestRender } from "../lib/store";
import type { DailyActivity } from "../types";
import { sectionTitle } from "./ui";

/** `null` means "follow today", so the card survives midnight rollover. */
let selectedDateIso: string | null = null;

export function renderWeeklyActivityCard(): HTMLElement {
  const state = getState();
  const today = isoToday();
  const selected = selectedDateIso ?? today;

  const weekIsos = currentPersianWeekIsos(today);
  const historyMap = new Map<string, DailyActivity>();
  for (const item of state.activityHistory ?? []) historyMap.set(item.date, item);

  const card = el("div", "card space-y-3");
  // Lets targeted DOM updates (set ticks) swap just this card back in.
  card.setAttribute("data-weekly-activity", "1");

  const todayChip = el(
    "span",
    "chip chip-emerald shrink-0",
    faDate(today, { withYear: false, withWeekday: true }),
  );
  card.append(sectionTitle("📅 تقویم هفته و کارنامه روزانه", todayChip));

  // ------------------------------------------------------------- week strip
  const strip = el("div", "grid grid-cols-7 gap-1");
  for (const iso of weekIsos) {
    const { jd } = toJalali(iso);
    const activity = historyMap.get(iso);
    const isSelected = iso === selected;
    const isToday = iso === today;
    const hasWorkout = (activity?.setsDone ?? 0) > 0;
    const hasDiet =
      (activity?.dietDone ?? 0) > 0 || (activity?.waterGlasses ?? 0) > 0;

    const cell = btn(
      `flex flex-col items-center justify-center rounded-xl border px-0.5 py-1.5 transition active:scale-95 ${
        isSelected
          ? "border-emerald-400/80 bg-emerald-400/15 text-emerald-200"
          : isToday
            ? "border-cyan-500/40 bg-slate-900/90 text-cyan-300"
            : "border-slate-800 bg-slate-950/50 text-slate-400"
      }`,
      `<span class="text-[9px] font-bold opacity-90">${faWeekdayShort(iso)}</span>
       <span class="mt-0.5 text-[13px] font-extrabold leading-none text-slate-100">${fa(jd)}</span>
       <span class="mt-1 flex h-1.5 items-center justify-center gap-0.5">
         ${hasWorkout ? '<span class="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>' : ""}
         ${hasDiet ? '<span class="h-1.5 w-1.5 rounded-full bg-cyan-400"></span>' : ""}
       </span>`,
      () => {
        selectedDateIso = iso;
        requestRender();
      },
      {
        "aria-label": `${faWeekdayName(iso)} ${faDate(iso)}`,
        "aria-pressed": String(isSelected),
      },
    );
    strip.append(cell);
  }
  card.append(strip);

  // ------------------------------------------------------------ day detail
  const activity = historyMap.get(selected);
  const detail = el(
    "div",
    "space-y-2.5 rounded-2xl border border-slate-800/90 bg-slate-950/60 p-3",
  );

  const headerRow = el(
    "div",
    "flex items-center justify-between gap-2 border-b border-slate-800/80 pb-2",
  );
  const titleWrap = el("div", "min-w-0");
  titleWrap.append(
    el(
      "p",
      "truncate text-[11px] font-extrabold text-slate-100",
      `${faWeekdayName(selected)}، ${faDate(selected, { withYear: false })}${
        selected === today ? " (امروز)" : ""
      }`,
    ),
  );

  const actions = el("div", "flex shrink-0 items-center gap-1");
  if ((activity?.setsDone ?? 0) > 0) {
    actions.append(el("span", "chip chip-emerald", "💪 روز تمرین"));
  } else {
    actions.append(el("span", "chip", "استراحت"));
  }
  if (selected !== today) {
    actions.append(
      btn(
        "rounded-lg border border-slate-700 bg-slate-900/70 px-2 py-1 text-[9px] font-bold text-slate-300 transition active:scale-95",
        "امروز",
        () => {
          selectedDateIso = null;
          requestRender();
        },
        { "aria-label": "بازگشت به امروز" },
      ),
    );
  }
  headerRow.append(titleWrap, actions);
  detail.append(headerRow);

  const hasAnything =
    activity &&
    (activity.setsDone > 0 ||
      activity.dietDone > 0 ||
      activity.waterGlasses > 0 ||
      (activity.bodyWeight ?? 0) > 0);

  if (!hasAnything) {
    detail.append(
      el(
        "p",
        "py-2 text-center text-[11px] text-slate-500",
        "در این روز هنوز تمرینی یا فعالیتی ثبت نشده است.",
      ),
    );
  } else {
    const workoutRow = el("div", "space-y-1.5");
    if (activity.setsDone > 0) {
      workoutRow.append(
        el(
          "p",
          "text-[11px] font-extrabold text-emerald-300",
          `🏋️ ${escapeHtml(activity.workoutTitle || "تمرین انجام شد")} — ${fa(
            activity.setsDone,
          )} ست`,
        ),
      );
      if (activity.warmupsDone > 0) {
        workoutRow.append(
          el(
            "p",
            "text-[10px] text-slate-400",
            `🔥 ${fa(activity.warmupsDone)} مرحله گرم‌کردن هم انجام شد`,
          ),
        );
      }
      if (activity.completedExercises.length > 0) {
        const tags = el("div", "flex flex-wrap gap-1 pt-0.5");
        for (const name of activity.completedExercises) {
          tags.append(
            el(
              "span",
              "rounded-lg border border-slate-800 bg-slate-900 px-2 py-0.5 text-[10px] text-slate-300",
              escapeHtml(name),
            ),
          );
        }
        workoutRow.append(tags);
      }
    } else {
      workoutRow.append(
        el("p", "text-[11px] text-slate-400", "🏋️ تمرین: روز استراحت (بدون ست ثبت‌شده)"),
      );
    }
    detail.append(workoutRow);

    const metrics = el("div", "grid grid-cols-3 gap-2 pt-0.5 text-center");
    const pill = (label: string, value: string, colorClass: string) => {
      const box = el("div", "rounded-xl border border-slate-800/70 bg-slate-900/60 p-2");
      box.append(
        el("p", `text-xs font-extrabold ${colorClass}`, value),
        el("p", "mt-0.5 text-[9px] text-slate-500", label),
      );
      return box;
    };
    metrics.append(
      pill("💧 آب", `${fa(activity.waterGlasses ?? 0)} لیوان`, "text-cyan-300"),
      pill(
        "🥗 تغذیه",
        `${fa(activity.dietDone)} از ${fa(activity.dietTotal || 5)}`,
        "text-emerald-300",
      ),
      pill(
        "⚖️ وزن",
        activity.bodyWeight ? faWeight(activity.bodyWeight) : "—",
        "text-amber-300",
      ),
    );
    detail.append(metrics);
  }

  card.append(detail);

  // -------------------------------------------------------- recent history
  const pastDays = (state.activityHistory ?? []).filter(
    (entry) => entry.setsDone > 0 || entry.dietDone > 0 || entry.waterGlasses > 0,
  );

  if (pastDays.length > 0) {
    const historyWrap = el("div", "space-y-1.5");
    historyWrap.append(el("p", "text-[11px] font-bold text-slate-400", "📋 روزهای فعال اخیر"));

    for (const item of pastDays.slice(0, 7)) {
      const summary =
        item.setsDone > 0
          ? `${escapeHtml(item.workoutTitle || "تمرین")} (${fa(item.setsDone)} ست)`
          : "روز استراحت";

      const row = btn(
        `flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-right transition active:scale-[0.99] ${
          item.date === selected
            ? "border-emerald-500/50 bg-emerald-500/10"
            : "border-slate-800/70 bg-slate-950/40"
        }`,
        `<div class="min-w-0 flex-1">
           <p class="text-[11px] font-extrabold text-slate-200">
             ${faWeekdayName(item.date)} ${faDate(item.date, { withYear: false })}
           </p>
           <p class="truncate text-[10px] text-slate-400">
             ${summary} • 💧 ${fa(item.waterGlasses)} • 🥗 ${fa(item.dietDone)}/${fa(
               item.dietTotal || 5,
             )}${item.bodyWeight ? ` • ⚖️ ${faNum(item.bodyWeight, 1)}` : ""}
           </p>
         </div>
         <span class="chip ${item.setsDone > 0 ? "chip-emerald" : ""}">
           ${item.setsDone > 0 ? "✓ تمرین" : "استراحت"}
         </span>`,
        () => {
          selectedDateIso = item.date;
          requestRender();
        },
        { "aria-label": `نمایش فعالیت ${faDate(item.date)}` },
      );
      historyWrap.append(row);
    }
    card.append(historyWrap);
  }

  return card;
}

/**
 * Re-renders the calendar in place.
 *
 * Set/warm-up ticks update only a few nodes (so inputs keep focus), which would
 * otherwise leave the calendar showing the snapshot from page load.
 */
export function refreshWeeklyActivityCard(): void {
  const current = document.querySelector("[data-weekly-activity]");
  if (!current) return;
  current.replaceWith(renderWeeklyActivityCard());
}
