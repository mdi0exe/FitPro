/** Nutrition tab: student-budget checklist, protein target and cheap calorie table. */
import { btn, el, escapeHtml, svgIcon } from "../lib/dom";
import { icons } from "../lib/icons";
import { clock, fa, faDate, isoToday } from "../lib/fa";
import { getState, persist, requestRender, syncWaterChecklist, WATER_GOAL } from "../lib/store";
import {
  beep,
  requestNotificationPermission,
  startWaterReminder,
  stopWaterReminder,
  vibrate,
  waterReminder,
} from "../lib/timer";
import { progressBar, sectionTitle, toast } from "../components/ui";

const RING_RADIUS = 26;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

export function renderNutrition(): HTMLElement {
  const view = el("div", "space-y-3 animate-fade-up");

  view.append(nutritionHero());
  view.append(waterTrackerCard());
  view.append(checklist());
  view.append(proteinCard());
  view.append(coachTipCard());
  view.append(cafeteriaTable());

  return view;
}

function nutritionHero(): HTMLElement {
  const state = getState();
  const done = state.diet.items.filter((item) => item.done).length;
  const total = state.diet.items.length || 1;
  const percent = Math.round((done / total) * 100);

  const card = el("div", "card flex items-center gap-4");

  const ringWrap = el("div", "relative h-[68px] w-[68px] shrink-0");
  ringWrap.innerHTML = `
    <svg viewBox="0 0 64 64" class="h-[68px] w-[68px] -rotate-90">
      <circle cx="32" cy="32" r="${RING_RADIUS}" fill="none" stroke="rgba(148,163,184,0.16)" stroke-width="6" />
      <circle cx="32" cy="32" r="${RING_RADIUS}" fill="none" stroke="url(#dietGrad)" stroke-width="6"
        stroke-linecap="round" stroke-dasharray="${RING_LENGTH}"
        stroke-dashoffset="${RING_LENGTH * (1 - done / total)}" />
      <defs>
        <linearGradient id="dietGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#34d399" />
          <stop offset="100%" stop-color="#22d3ee" />
        </linearGradient>
      </defs>
    </svg>
    <span class="absolute inset-0 flex flex-col items-center justify-center">
      <span class="text-sm font-extrabold text-slate-50">${fa(percent)}٪</span>
    </span>`;

  const info = el("div", "min-w-0 flex-1");
  info.append(
    el("p", "text-[10px] text-emerald-300/80", "چک‌لیست تغذیه دانشجویی"),
    el("p", "mt-1 text-sm font-extrabold text-slate-50", `${fa(done)} از ${fa(total)} مورد انجام شد`),
    el("p", "mt-1 text-[10px] leading-5 text-slate-400", faDate(isoToday(), { withWeekday: true })),
  );

  const reset = btn("btn-icon shrink-0", svgIcon(icons.reset, "h-4 w-4"), () => resetDay(), {
    "aria-label": "شروع روز جدید",
    title: "شروع روز جدید",
  });

  card.append(ringWrap, info, reset);
  return card;
}

function checklist(): HTMLElement {
  const state = getState();
  const card = el("div", "card space-y-1");
  card.append(
    sectionTitle(
      "امروز چی خوردی؟",
      el("span", "chip chip-emerald", `${fa(state.diet.items.filter((i) => i.done).length)}/${fa(state.diet.items.length)}`),
    ),
  );

  state.diet.items.forEach((item) => {
    const row = el(
      "button",
      `flex w-full items-start gap-3 rounded-xl border px-2.5 py-2.5 text-right transition active:scale-[0.99] ${
        item.done ? "border-emerald-500/30 bg-emerald-500/5" : "border-slate-800 bg-slate-950/40"
      }`,
    );
    row.type = "button";

    const box = el(
      "span",
      `mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
        item.done ? "border-emerald-400 bg-emerald-400 text-slate-950" : "border-slate-600 bg-slate-900 text-transparent"
      }`,
    );
    box.innerHTML = svgIcon(icons.check, "h-3 w-3").outerHTML;

    const textWrap = el("span", "min-w-0 flex-1");
    textWrap.append(
      el(
        "span",
        `block text-[11px] font-bold leading-6 ${
          item.done ? "text-slate-500 line-through decoration-slate-600" : "text-slate-200"
        }`,
        escapeHtml(item.text),
      ),
      el("span", "mt-0.5 block text-[10px] leading-5 text-slate-500", escapeHtml(item.hint)),
    );

    row.append(box, textWrap);

    row.addEventListener("click", () => {
      item.done = !item.done;
      persist(0);
      if (item.done) {
        beep(1, 760, 0.08);
        vibrate(30);
      }
      const nowDone = state.diet.items.filter((i) => i.done).length;
      if (nowDone === state.diet.items.length) {
        toast("چک‌لیست امروز کامل شد! کالری و پروتئین تامین شد 💪");
      }
      requestRender();
    });

    card.append(row);
  });

  const bar = progressBar((state.diet.items.filter((i) => i.done).length / Math.max(1, state.diet.items.length)) * 100, "mt-2");
  card.append(bar);
  return card;
}

async function resetDay(): Promise<void> {
  const state = getState();
  if (
    state.diet.lastResetDate === isoToday() &&
    state.diet.items.every((item) => !item.done) &&
    state.diet.waterGlasses === 0
  ) {
    toast("چک‌لیست امروز خالی است.", "info");
    return;
  }
  state.diet.lastResetDate = isoToday();
  for (const item of state.diet.items) item.done = false;
  state.diet.waterGlasses = 0;
  persist(0);
  toast("چک‌لیست امروز از نو شروع شد.", "info");
  requestRender();
}

function proteinCard(): HTMLElement {
  const { profile } = getState();
  const proteinTarget = Math.round(profile.currentWeight * 1.54);
  const calories = Math.round(profile.currentWeight * 37);

  const card = el("div", "card border-emerald-500/20 bg-emerald-500/5");
  card.append(
    el("p", "text-xs font-extrabold text-emerald-200", "🎯 هدف روزانه تقریبی تو"),
    el(
      "p",
      "mt-1 text-[10px] leading-5 text-emerald-100/60",
      "قابل تامین با ۳ وعده سلف دانشگاه (بدون نیاز به میان‌وعده یا خرید اضافی).",
    ),
  );

  const grid = el("div", "mt-3 grid grid-cols-2 gap-2");
  const cell = (label: string, value: string) => {
    const box = el("div", "rounded-xl bg-slate-950/50 px-3 py-2 text-center");
    box.append(el("p", "text-base font-extrabold text-emerald-300", value), el("p", "mt-0.5 text-[9px] text-slate-500", label));
    return box;
  };
  grid.append(cell("پروتئین روزانه", `${fa(proteinTarget)} گرم`), cell("کالری روزانه", `${fa(calories)} کالری`));
  card.append(grid);
  return card;
}

function cafeteriaTable(): HTMLElement {
  const rows: Array<[string, string, string]> = [
    ["صبحانه سلف (املت + نان کامل)", "~۴۵۰ کالری", "~۱۲ گرم"],
    ["ناهار سلف (چلو جوجه کباب کامل)", "~۹۵۰ کالری", "~۴۵ گرم"],
    ["ناهار سلف (چلو مرغ کامل)", "~۹۰۰ کالری", "~۴۲ گرم"],
    ["شام سلف بعد تمرین (مرغ / جوجه / برگر)", "~۸۵۰ کالری", "~۴۰ گرم"],
    ["مجموع ۳ وعده سلف در روز", "~۲۴۰۰ کالری", "~۱۰۰ گرم"],
  ];

  const card = el("div", "card");
  card.append(sectionTitle("جدول ارزش غذایی وعده‌های سلف دانشگاه"));

  const head = el("div", "grid grid-cols-3 gap-2 border-b border-slate-800/80 pb-1.5 text-[9px] text-slate-500");
  head.append(el("span", "", "وعده"), el("span", "text-center", "کالری"), el("span", "text-center", "پروتئین"));
  card.append(head);

  rows.forEach(([name, kcal, protein], index) => {
    const isTotal = index === rows.length - 1;
    const row = el(
      "div",
      `grid grid-cols-3 gap-2 border-b py-2 text-[11px] ${
        isTotal ? "mt-1 rounded-lg border-emerald-500/25 bg-emerald-500/10 px-1" : "border-slate-800/40"
      }`,
    );
    row.append(
      el("span", isTotal ? "font-extrabold text-emerald-200" : "text-slate-200", name),
      el("span", `text-center ${isTotal ? "font-bold text-emerald-300" : "text-slate-400"}`, kcal),
      el("span", "text-center font-bold text-emerald-300", protein),
    );
    card.append(row);
  });

  card.append(
    el(
      "p",
      "mt-2 text-[10px] leading-5 text-slate-500",
      "بدون میان‌وعده و بدون خرید اضافه؛ همین سه وعده سلف هدف روزانه‌ات را پوشش می‌دهد.",
    ),
  );
  return card;
}

/** Interactive water counter + smart reminder. */
function waterTrackerCard(): HTMLElement {
  const state = getState();
  const glasses = state.diet.waterGlasses;
  const reachedGoal = glasses >= WATER_GOAL;

  const card = el("div", "card border-cyan-500/25 bg-cyan-500/5");

  const header = el("div", "flex items-center justify-between gap-2");
  const titleWrap = el("div", "flex items-center gap-2");
  const drop = el("span", "flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-300");
  drop.append(svgIcon(icons.drop, "h-5 w-5"));
  const titles = el("div");
  titles.append(
    el("p", "text-sm font-extrabold text-slate-100", "شمارنده آب امروز"),
    el("p", "mt-0.5 text-[10px] text-slate-400", `${fa(glasses)} از ${fa(WATER_GOAL)} لیوان`),
  );
  titleWrap.append(drop, titles);
  header.append(
    titleWrap,
    el(
      "span",
      `chip ${reachedGoal ? "chip-emerald" : "chip-cyan"}`,
      reachedGoal ? "هدف انجام شد ✓" : `${fa(WATER_GOAL - glasses)} لیوان مانده`,
    ),
  );
  card.append(header);

  // Ten tappable glasses: tap number N to record N glasses.
  const grid = el("div", "mt-3 grid grid-cols-10 gap-1");
  for (let index = 1; index <= 10; index += 1) {
    const filled = index <= glasses;
    grid.append(
      btn(
        `flex aspect-square items-center justify-center rounded-lg border text-[10px] font-bold transition active:scale-90 ${
          filled
            ? "border-cyan-400/70 bg-cyan-400/20 text-cyan-200"
            : "border-slate-800 bg-slate-950/50 text-slate-500"
        }`,
        fa(index),
        () => setWaterGlasses(index),
        { "aria-label": `${fa(index)} لیوان آب` },
      ),
    );
  }
  card.append(grid);

  const actions = el("div", "mt-2 grid grid-cols-2 gap-2");
  actions.append(
    btn("btn-ghost py-2 text-xs", "\u200E−۱ لیوان", () => setWaterGlasses(glasses - 1)),
    btn("btn-primary py-2 text-xs", "💧 ‎+۱ لیوان آب خوردم", () => setWaterGlasses(glasses + 1)),
  );
  card.append(actions);

  card.append(el("div", "divider my-3"));

  // ---------------------------------------------------------- reminder
  const enabled = state.diet.waterReminderEnabled;
  const toggleRow = el("div", "flex items-center justify-between gap-3");
  const toggleText = el("div", "min-w-0");
  toggleText.append(
    el("p", "text-[11px] font-bold text-slate-200", "🔔 یادآور هوشمند نوشیدن آب"),
    el(
      "p",
      "mt-0.5 text-[10px] text-slate-500",
      enabled ? `هر ${fa(state.diet.waterReminderMinutes)} دقیقه` : "خاموش است",
    ),
  );

  const knob = el("span", "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all");
  knob.style[enabled ? "left" : "right"] = "0.125rem";
  const toggle = btn(
    `relative h-7 w-12 shrink-0 rounded-full border transition ${
      enabled ? "border-emerald-400/60 bg-emerald-400/40" : "border-slate-700 bg-slate-800"
    }`,
    "",
    () => toggleWaterReminder(),
    { "aria-label": "یادآور آب", "aria-pressed": String(enabled) },
  );
  toggle.append(knob);

  toggleRow.append(toggleText, toggle);
  card.append(toggleRow);

  const intervals = el("div", "mt-2 flex gap-2");
  [45, 60, 90].forEach((minutes) => {
    const active = state.diet.waterReminderMinutes === minutes;
    intervals.append(
      btn(
        `flex-1 rounded-xl border py-2 text-[11px] font-bold transition active:scale-95 ${
          active
            ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-300"
            : "border-slate-800 bg-slate-900/60 text-slate-300"
        }`,
        `${fa(minutes)} دقیقه`,
        () => setWaterInterval(minutes),
      ),
    );
  });
  card.append(intervals);

  if (enabled) {
    const countdown = el(
      "p",
      "mt-2 text-center text-[11px] font-bold tabular-nums text-cyan-300",
      `یادآوری بعدی: ${fa(clock(waterReminder.remaining))}`,
    );
    waterReminder.onTick = () => {
      countdown.textContent = `یادآوری بعدی: ${fa(clock(waterReminder.remaining))}`;
    };
    card.append(countdown);
  }

  return card;
}

/** Records the water count, keeps the checklist row in sync and celebrates. */
function setWaterGlasses(value: number): void {
  const state = getState();
  const previous = state.diet.waterGlasses;
  const next = Math.max(0, Math.min(20, value));
  if (next === previous) return;

  state.diet.waterGlasses = next;
  syncWaterChecklist();
  persist(0);

  if (next >= WATER_GOAL && previous < WATER_GOAL) {
    toast("💧 ۸ لیوان کامل شد! هیدراته ماندن = پمپ بهتر و ریکاوری سریع‌تر.", "ok");
    beep(2, 980, 0.12);
    vibrate([80, 60, 80]);
  }
  requestRender();
}

function toggleWaterReminder(): void {
  const state = getState();
  state.diet.waterReminderEnabled = !state.diet.waterReminderEnabled;
  persist(0);

  if (state.diet.waterReminderEnabled) {
    startWaterReminder(state.diet.waterReminderMinutes);
    requestNotificationPermission();
    toast(`یادآور آب هر ${fa(state.diet.waterReminderMinutes)} دقیقه روشن شد.`, "info");
  } else {
    stopWaterReminder();
    toast("یادآور آب خاموش شد.", "info");
  }
  requestRender();
}

function setWaterInterval(minutes: number): void {
  const state = getState();
  state.diet.waterReminderMinutes = minutes;
  persist(0);
  if (state.diet.waterReminderEnabled) {
    startWaterReminder(minutes);
  }
  toast(`فاصله یادآوری روی ${fa(minutes)} دقیقه تنظیم شد.`, "info");
  requestRender();
}

/** Why the workout slot matters when there are only three meals. */
function coachTipCard(): HTMLElement {
  const card = el("div", "card border-amber-500/25 bg-amber-500/5");
  card.append(
    el("p", "text-xs font-extrabold text-amber-200", "⏰ نکته مربی: بهترین ساعت باشگاه"),
    el(
      "p",
      "mt-1 text-[11px] leading-6 text-amber-100/80",
      "چون میان‌وعده نداری، بهترین تایم باشگاه ۱.۵ ساعت قبل از شام سلف است تا شامِ مرغ یا جوجه‌ات دقیقاً نقش وعده بعد از تمرین را بازی کند!",
    ),
  );
  return card;
}
