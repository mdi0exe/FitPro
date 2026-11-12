/** Progress tab: body-weight tracking, chart, stats and milestones. */
import { btn, el, escapeHtml, svgIcon } from "../lib/dom";
import { icons } from "../lib/icons";
import { daysBetween, fa, faDate, faNum, faRelative, faSigned, isoToday } from "../lib/fa";
import { logBodyWeight } from "../lib/api";
import { getState, requestRender, setState } from "../lib/store";
import type { Milestone, WeightEntry } from "../types";
import { progressBar, sectionTitle, toast } from "../components/ui";

export function renderProgress(): HTMLElement {
  const state = getState();
  const view = el("div", "space-y-3 animate-fade-up");

  view.append(weightHero());
  view.append(weightLogger());
  view.append(chartCard(state.weightHistory));
  view.append(statsGrid());
  view.append(milestonesCard(state.milestones));

  return view;
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function weightHero(): HTMLElement {
  const { profile, weightHistory } = getState();
  const gained = profile.currentWeight - profile.startWeight;
  const remaining = Math.max(0, profile.targetWeight - profile.currentWeight);
  const span = Math.max(0.1, profile.targetWeight - profile.startWeight);
  const percent = Math.min(100, Math.max(0, (gained / span) * 100));
  const heightM = profile.heightCm / 100;
  const bmi = profile.currentWeight / (heightM * heightM);

  const card = el(
    "div",
    "card relative overflow-hidden border-emerald-500/20 bg-gradient-to-bl from-emerald-500/12 via-slate-900/70 to-cyan-500/5",
  );

  const top = el("div", "flex items-start justify-between gap-3");
  const main = el("div", "min-w-0");
  main.append(
    el("p", "text-[10px] font-medium text-emerald-300/80", "وزن فعلی"),
    el(
      "p",
      "mt-1 flex items-baseline gap-1.5 text-3xl font-black leading-none text-slate-50",
      `${faNum(profile.currentWeight, 1)}<span class="text-xs font-bold text-slate-400">کیلوگرم</span>`,
    ),
    el(
      "p",
      "mt-2 text-[10px] leading-5 text-slate-400",
      `شروع: ${faNum(profile.startWeight, 1)} • هدف: ${faNum(profile.targetWeight, 1)} کیلوگرم`,
    ),
  );

  const badge = el("div", "shrink-0 text-center");
  badge.append(
    el(
      "p",
      `text-sm font-extrabold ${gained >= 0 ? "text-emerald-400" : "text-rose-400"}`,
      faSigned(gained),
    ),
    el("p", "mt-0.5 text-[9px] text-slate-500", "تغییر از شروع"),
  );
  top.append(main, badge);

  const bar = progressBar(percent, "mt-3");
  const foot = el("div", "mt-1.5 flex items-center justify-between text-[10px] text-slate-400");
  foot.append(
    el("span", "", `${faNum(remaining, 1)} کیلو تا هدف`),
    el("span", "", `${fa(weightHistory.length)} ثبت وزن`),
  );

  const meta = el("div", "mt-3 grid grid-cols-3 gap-2 border-t border-slate-800/70 pt-3");
  const cell = (label: string, value: string, accent = "text-slate-100") => {
    const box = el("div", "rounded-xl bg-slate-950/40 px-2 py-1.5 text-center");
    box.append(
      el("p", `text-xs font-extrabold ${accent}`, value),
      el("p", "mt-0.5 text-[9px] text-slate-500", label),
    );
    return box;
  };
  meta.append(
    cell("شاخص BMI", faNum(bmi, 1), bmi < 25 ? "text-emerald-400" : "text-amber-400"),
    cell("قد", `${fa(profile.heightCm)} سانت`, "text-slate-100"),
    cell("سن", `${fa(profile.age)} سال`, "text-slate-100"),
  );

  card.append(top, bar, foot, meta);
  return card;
}

// ---------------------------------------------------------------------------
// Weight logger
// ---------------------------------------------------------------------------

function weightLogger(): HTMLElement {
  const card = el("div", "card");
  card.append(
    el("p", "text-xs font-extrabold text-slate-200", "ثبت وزن امروز"),
    el(
      "p",
      "mt-0.5 text-[10px] leading-5 text-slate-500",
      "صبح، بعد از دستشویی و قبل از صبحانه وزن کن؛ شرایط یکسان = داده دقیق‌تر.",
    ),
  );

  let draft = Math.round(getState().profile.currentWeight * 10) / 10;

  const display = el(
    "p",
    "mt-3 text-center text-4xl font-black leading-none tabular-nums text-slate-50",
    faNum(draft, 1),
  );
  card.append(display, el("p", "mt-1 text-center text-[10px] text-slate-500", "کیلوگرم"));

  const bump = (delta: number) => {
    draft = Math.min(300, Math.max(30, Math.round((draft + delta) * 10) / 10));
    display.textContent = faNum(draft, 1);
  };

  // No keyboard: six one-tap steps around the current weight.
  const steps = el("div", "mt-3 flex flex-wrap gap-2");
  [-1, -0.5, -0.1, 0.1, 0.5, 1].forEach((delta) => {
    steps.append(
      btn(
        `flex-1 basis-[28%] rounded-xl border py-2 text-xs font-bold transition active:scale-95 ${
          delta > 0
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
            : "border-slate-700 bg-slate-900/70 text-slate-300"
        }`,
        `\u200E${delta > 0 ? "+" : "−"}${faNum(Math.abs(delta), 1)}`,
        () => bump(delta),
      ),
    );
  });
  card.append(steps);

  card.append(btn("btn-primary mt-2 w-full", "ثبت وزن امروز", () => void submitWeight(draft)));
  return card;
}

async function submitWeight(weight: number): Promise<void> {
  try {
    const next = await logBodyWeight(weight);
    setState(next);
    toast("وزن ثبت شد. مسیر ۶۵ → ۷۵ ادامه دارد! 📈");
    requestRender();
  } catch (error) {
    toast(error instanceof Error ? error.message : "ثبت وزن ناموفق بود.", "error");
  }
}

// ---------------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------------

function chartCard(history: WeightEntry[]): HTMLElement {
  const card = el("div", "card");
  const { profile } = getState();
  const entries = history.slice(-16);

  card.append(
    sectionTitle(
      "نمودار وزن",
      el("span", "chip chip-cyan", `${fa(entries.length)} نقطه`),
    ),
  );

  if (entries.length < 2) {
    card.append(
      el(
        "div",
        "rounded-xl border border-dashed border-slate-800 px-4 py-8 text-center text-[11px] leading-6 text-slate-500",
        "برای دیدن نمودار حداقل دو ثبت وزن لازم است. فردا دوباره وزن کن!",
      ),
    );
    return card;
  }

  const width = 320;
  const height = 140;
  const padX = 10;
  const padY = 14;
  const values = entries.map((entry) => entry.weight);
  const rawMin = Math.min(...values, profile.targetWeight);
  const rawMax = Math.max(...values, profile.targetWeight);
  const min = Math.floor(rawMin - 1);
  const max = Math.ceil(rawMax + 1);

  const xAt = (index: number) => padX + (index * (width - padX * 2)) / (entries.length - 1);
  const yAt = (value: number) => height - padY - ((value - min) / Math.max(0.1, max - min)) * (height - padY * 2);

  const points = entries.map((entry, index) => `${xAt(index).toFixed(1)},${yAt(entry.weight).toFixed(1)}`);
  const linePath = `M ${points.join(" L ")}`;
  const areaPath = `${linePath} L ${xAt(entries.length - 1).toFixed(1)},${height - padY} L ${xAt(0).toFixed(1)},${height - padY} Z`;
  const targetY = yAt(profile.targetWeight).toFixed(1);

  const chart = el("div", "mt-2");
  chart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" class="h-40 w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="weightFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(52,211,153,0.35)" />
          <stop offset="100%" stop-color="rgba(52,211,153,0)" />
        </linearGradient>
        <linearGradient id="weightStroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#22d3ee" />
          <stop offset="100%" stop-color="#34d399" />
        </linearGradient>
      </defs>
      <line x1="0" y1="${targetY}" x2="${width}" y2="${targetY}" stroke="rgba(34,211,238,0.45)" stroke-width="1" stroke-dasharray="5 5" />
      <path d="${areaPath}" fill="url(#weightFill)" />
      <path d="${linePath}" fill="none" stroke="url(#weightStroke)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
      ${entries
        .map(
          (entry, index) =>
            `<circle cx="${xAt(index).toFixed(1)}" cy="${yAt(entry.weight).toFixed(1)}" r="${
              index === entries.length - 1 ? 4 : 2.6
            }" fill="#020617" stroke="#34d399" stroke-width="2" />`,
        )
        .join("")}
    </svg>`;

  const axis = el("div", "mt-1 flex items-center justify-between text-[9px] text-slate-500");
  // The SVG plots oldest→newest left→right; force LTR so the labels match.
  axis.setAttribute("dir", "ltr");
  axis.append(
    el("span", "", faDate(entries[0].date, { withYear: false })),
    el("span", "text-cyan-400/80", `هدف ${faNum(profile.targetWeight, 1)}`),
    el("span", "", faDate(entries[entries.length - 1].date, { withYear: false })),
  );

  card.append(chart, axis);
  return card;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

function statsGrid(): HTMLElement {
  const state = getState();
  const elapsed = Math.max(0, daysBetween(state.lastOverloadDate, isoToday()));
  const remaining = Math.max(0, 14 - elapsed);
  const totalSets = state.days.reduce((sum, day) => sum + day.exercises.reduce((s, e) => s + e.logs.length, 0), 0);
  const exercises = state.days.reduce((sum, day) => sum + day.exercises.length, 0);

  const grid = el("div", "grid grid-cols-2 gap-2");

  const tile = (icon: string, label: string, value: string, hint: string, accent: string) => {
    const box = el("div", "card-tight flex flex-col gap-1");
    const head = el("div", "flex items-center gap-1.5");
    const iconWrap = el("span", accent);
    iconWrap.append(svgIcon(icon, "h-4 w-4"));
    head.append(iconWrap, el("span", "text-[10px] text-slate-400", label));
    box.append(
      head,
      el("p", "text-lg font-extrabold leading-none text-slate-50", value),
      el("p", "text-[9px] leading-4 text-slate-500", hint),
    );
    return box;
  };

  grid.append(
    tile(icons.bolt, "چرخه‌های افزایش", `${fa(state.overloadCount)} بار`, "هر ۲ هفته یک پله سنگین‌تر", "text-emerald-400"),
    tile(
      icons.clock,
      "چرخه فعلی",
      remaining === 0 ? "آماده" : `${fa(remaining)} روز`,
      "تا افزایش وزنه بعدی",
      "text-cyan-400",
    ),
    tile(icons.dumbbell, "کل ست‌های برنامه", `${fa(totalSets)} ست`, `${fa(exercises)} حرکت در ۴ روز`, "text-emerald-400"),
    tile(icons.target, "روزهای تمرین", "۴ روز", "بالاتنه / پایین‌تنه", "text-cyan-400"),
  );

  return grid;
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

const milestoneIcon: Record<string, string> = {
  overload: icons.bolt,
  weight: icons.scale,
  goal: icons.trophy,
  system: icons.settings,
};

function milestonesCard(milestones: Milestone[]): HTMLElement {
  const card = el("div", "card");
  card.append(
    sectionTitle("دفتر پیشرفت", el("span", "chip", `${fa(milestones.length)} رویداد`)),
  );

  if (milestones.length === 0) {
    card.append(el("p", "py-4 text-center text-[11px] text-slate-500", "هنوز رویدادی ثبت نشده."));
    return card;
  }

  const list = el("div", "mt-1 space-y-2");
  milestones.slice(0, 12).forEach((milestone) => {
    const row = el("div", "flex items-start gap-2.5 rounded-xl border border-slate-800/70 bg-slate-950/40 px-2.5 py-2");
    const iconWrap = el(
      "span",
      `mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
        milestone.kind === "goal"
          ? "bg-amber-500/15 text-amber-300"
          : milestone.kind === "overload"
            ? "bg-emerald-500/15 text-emerald-300"
            : milestone.kind === "weight"
              ? "bg-cyan-500/15 text-cyan-300"
              : "bg-slate-800 text-slate-400"
      }`,
    );
    iconWrap.append(svgIcon(milestoneIcon[milestone.kind] ?? icons.sparkles, "h-3.5 w-3.5"));
    const body = el("div", "min-w-0 flex-1");
    body.append(
      el("p", "text-[11px] leading-6 text-slate-200", escapeHtml(milestone.text)),
      el("p", "mt-0.5 text-[9px] text-slate-500", `${faRelative(milestone.date)} • ${faDate(milestone.date)}`),
    );
    row.append(iconWrap, body);
    list.append(row);
  });

  card.append(list);
  return card;
}
