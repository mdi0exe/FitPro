/** Nutrition tab: student-budget checklist, protein target and cheap calorie table. */
import { btn, el, escapeHtml, svgIcon } from "../lib/dom";
import { icons } from "../lib/icons";
import { fa, faDate, isoToday } from "../lib/fa";
import { getState, persist, requestRender } from "../lib/store";
import { beep, vibrate } from "../lib/timer";
import { progressBar, sectionTitle, toast } from "../components/ui";

const RING_RADIUS = 26;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

export function renderNutrition(): HTMLElement {
  const view = el("div", "space-y-3 animate-fade-up");

  view.append(nutritionHero());
  view.append(checklist());
  view.append(proteinCard());
  view.append(budgetTable());
  view.append(
    el(
      "div",
      "card border-cyan-500/20 bg-cyan-500/5",
      `<p class="text-xs font-extrabold text-cyan-200">💧 آب را فراموش نکن</p>
       <p class="mt-1 text-[11px] leading-6 text-cyan-100/70">
         روزی ۲.۵ تا ۳ لیتر آب. آب قبل از هر وعده (۱ لیوان) هم اشتها را کنترل می‌کند و هم جذب پروتئین را بهتر می‌کند.
       </p>`,
    ),
  );

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
  if (state.diet.lastResetDate === isoToday() && state.diet.items.every((item) => !item.done)) {
    toast("چک‌لیست امروز خالی است.", "info");
    return;
  }
  state.diet.lastResetDate = isoToday();
  for (const item of state.diet.items) item.done = false;
  persist(0);
  toast("چک‌لیست امروز از نو شروع شد.", "info");
  requestRender();
}

function proteinCard(): HTMLElement {
  const { profile } = getState();
  const proteinTarget = Math.round(profile.currentWeight * 1.8);
  const calories = Math.round(profile.currentWeight * 40);

  const card = el("div", "card border-emerald-500/20 bg-emerald-500/5");
  card.append(
    el("p", "text-xs font-extrabold text-emerald-200", "🎯 هدف روزانه تقریبی تو"),
    el(
      "p",
      "mt-1 text-[10px] leading-5 text-emerald-100/60",
      "برای افزایش حجم خشک: ۱٫۸ گرم پروتئین به ازای هر کیلو وزن + کالری مازاد کنترل‌شده.",
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

function budgetTable(): HTMLElement {
  const rows: Array<[string, string, string]> = [
    ["تخم‌مرغ (۱ عدد)", "۷۰ کالری", "۶ گرم"],
    ["بادام‌زمینی (۳۰ گرم)", "۱۷۰ کالری", "۷ گرم"],
    ["عدس پخته (۱ کاسه)", "۲۳۰ کالری", "۱۸ گرم"],
    ["سیب‌زمینی آب‌پز (۱ عدد)", "۱۶۰ کالری", "۴ گرم"],
    ["شیر (۱ لیوان)", "۱۵۰ کالری", "۸ گرم"],
    ["سینه مرغ (۱۰۰ گرم)", "۱۶۵ کالری", "۳۱ گرم"],
  ];

  const card = el("div", "card");
  card.append(sectionTitle("منابع ارزان پروتئین و کالری"));

  const head = el("div", "grid grid-cols-3 gap-2 border-b border-slate-800/80 pb-1.5 text-[9px] text-slate-500");
  head.append(el("span", "", "خوراکی"), el("span", "text-center", "کالری"), el("span", "text-center", "پروتئین"));
  card.append(head);

  rows.forEach(([name, kcal, protein]) => {
    const row = el("div", "grid grid-cols-3 gap-2 border-b border-slate-800/40 py-2 text-[11px]");
    row.append(
      el("span", "text-slate-200", name),
      el("span", "text-center text-slate-400", kcal),
      el("span", "text-center font-bold text-emerald-300", protein),
    );
    card.append(row);
  });

  card.append(
    el(
      "p",
      "mt-2 text-[10px] leading-5 text-slate-500",
      "قیمت‌ها را لازم نیست حساب کنی؛ این‌ها ارزان‌ترین گزینه‌های سلف و بقالی سر کوچه هستند.",
    ),
  );
  return card;
}
