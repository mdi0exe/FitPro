/** Nutrition tab: student-budget checklist, protein target and cheap calorie table. */
import { btn, el, escapeHtml, svgIcon, uid } from "../lib/dom";
import { icons } from "../lib/icons";
import { clock, fa, faDate, faNum, isoToday } from "../lib/fa";
import {
  activeDietTemplateId,
  CUSTOM_DIET_PRESETS,
  DIET_TEMPLATES,
  dietTemplateItems,
} from "../data/dietTemplates";
import { getState, persist, requestRender, syncWaterChecklist, WATER_GOAL } from "../lib/store";
import { ensureNotificationPermission } from "../lib/notify";
import { isWaterQuietHours, WATER_QUIET_LABEL } from "../lib/quietHours";
import {
  beep,
  getWaterRemainingSeconds,
  onWaterTimerTick,
  softTap,
  startNewWaterReminderCycle,
  stopWaterReminder,
} from "../lib/timer";
import { openModal, progressBar, sectionTitle, toast, type ModalHandle } from "../components/ui";
import { aiPlanBadge, openAiDietConfigurator } from "../components/aiDietConfigurator";

const RING_RADIUS = 26;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

export function renderNutrition(): HTMLElement {
  const view = el("div", "space-y-3 animate-fade-up");

  view.append(nutritionHero());
  const planBadge = aiPlanBadge();
  if (planBadge) view.append(planBadge);
  view.append(waterTrackerCard());
  view.append(dietTemplateCard());
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

/** Three one-tap student meal patterns, shown above the daily checklist. */
function dietTemplateCard(): HTMLElement {
  const state = getState();
  const active = activeDietTemplateId(state.diet.items);
  const card = el("div", "card space-y-2");
  card.append(
    sectionTitle(
      "الگوی تغذیه دانشجویی",
      el("span", "chip chip-emerald", `${fa(state.diet.items.length)} مورد`),
    ),
  );

  const list = el("div", "space-y-1.5");
  DIET_TEMPLATES.forEach((template) => {
    const isActive = active === template.id;
    list.append(
      btn(
        `flex w-full flex-col items-start rounded-2xl border p-2.5 text-right transition active:scale-[0.99] ${
          isActive
            ? "border-emerald-400 bg-emerald-500/15 text-emerald-200"
            : "border-slate-800 bg-slate-950/50 text-slate-300"
        }`,
        `<span class="text-[11px] font-extrabold">${template.label}</span>
         <span class="mt-0.5 text-[10px] leading-5 opacity-80">${template.hint}</span>`,
        () => setDietTemplate(template.id),
        { "aria-pressed": String(isActive), "aria-label": template.label },
      ),
    );
  });
  card.append(list);
  card.append(
    el(
      "p",
      "text-[10px] leading-5 text-slate-500",
      "آیتم‌های دلخواهی که خودت اضافه کرده‌ای هنگام تغییر الگو حفظ می‌شوند.",
    ),
  );
  return card;
}

function setDietTemplate(id: string): void {
  const state = getState();
  // An AI plan locks calories/protein/meals/rules. Choosing a standard template
  // is an explicit override, so clear those locks or the pick has no visible
  // effect on the protein card and the meal table.
  const hadAiOverrides = Boolean(
    state.diet.customCalories ||
      state.diet.customProtein ||
      (state.diet.mealTable?.length ?? 0) > 0 ||
      (state.diet.coachRules?.length ?? 0) > 0,
  );
  if (activeDietTemplateId(state.diet.items) === id && !hadAiOverrides) {
    toast("همین الگوی تغذیه فعال است.", "info");
    return;
  }
  const custom = state.diet.items.filter((entry) => entry.id.startsWith("custom-"));
  state.diet.items = [...dietTemplateItems(id), ...custom];
  state.diet.customCalories = null;
  state.diet.customProtein = null;
  state.diet.mealTable = [];
  state.diet.coachRules = [];
  syncWaterChecklist();
  softTap();
  persist(0);
  toast("الگوی تغذیه تغییر کرد 🍱");
  requestRender();
}

/** Adds a user-defined meal / supplement row without forcing a keyboard. */
function openAddDietItemModal(): void {
  let handle: ModalHandle;
  const body = el("div", "space-y-3");
  body.append(
    el(
      "p",
      "text-[11px] leading-6 text-slate-400",
      "یک گزینه آماده لمس کن یا عنوان دلخواهت را بنویس (مثل کراتین، پروتئین وی یا میان‌وعده).",
    ),
  );

  const input = el("input", "field text-right text-sm");
  input.type = "text";
  input.placeholder = "مثلاً: کراتین ۵ گرم بعد از تمرین";
  body.append(input);

  const presets = el("div", "space-y-1.5");
  CUSTOM_DIET_PRESETS.forEach((preset) => {
    presets.append(
      btn(
        "btn-ghost w-full justify-start py-2 text-right text-[11px]",
        escapeHtml(preset.text),
        () => {
          input.value = preset.text;
          softTap();
        },
      ),
    );
  });
  body.append(presets);

  const save = btn(
    "btn-primary w-full",
    "➕ افزودن به چکلیست",
    () => {
      const text = input.value.trim().slice(0, 160);
      if (!text) {
        toast("ابتدا یک عنوان وارد کن.", "error");
        return;
      }
      const preset = CUSTOM_DIET_PRESETS.find((entry) => entry.text === text);
      getState().diet.items.push({
        id: uid("custom"),
        text,
        hint: preset?.hint ?? "وعده یا مکمل دلخواه",
        done: false,
      });
      persist(0);
      handle.close();
      toast("آیتم دلخواه به چکلیست اضافه شد ✅");
      requestRender();
    },
    { "aria-label": "تایید افزودن وعده دلخواه" },
  );

  handle = openModal({
    title: "➕ افزودن وعده یا مکمل دلخواه",
    subtitle: "مخصوص شرایط خودت؛ قابل حذف از کنار هر ردیف",
    body,
    footer: save,
  });
}

/** The `diet-4` row drives the water counter, so it is never removable. */
function removeDietItem(id: string): void {
  const state = getState();
  if (id === "diet-4") {
    toast("ردیف آب با شمارنده همگام است و حذف نمی‌شود.", "info");
    return;
  }
  const index = state.diet.items.findIndex((entry) => entry.id === id);
  if (index < 0) return;
  state.diet.items.splice(index, 1);
  softTap();
  persist(0);
  toast("آیتم حذف شد.", "info");
  requestRender();
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
      `flex min-w-0 flex-1 items-start gap-3 rounded-xl border px-2.5 py-2.5 text-right transition active:scale-[0.99] ${
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
        softTap();
      }
      const nowDone = state.diet.items.filter((i) => i.done).length;
      if (nowDone === state.diet.items.length) {
        toast("چک‌لیست امروز کامل شد! کالری و پروتئین تامین شد 💪");
      }
      requestRender();
    });

    const rowWrap = el("div", "flex items-stretch gap-1.5");
    rowWrap.append(row);
    rowWrap.append(
      btn(
        "btn-icon h-9 w-9 shrink-0 text-[11px]",
        "✕",
        () => removeDietItem(item.id),
        { "aria-label": `حذف ${item.text}`, title: "حذف این ردیف" },
      ),
    );
    card.append(rowWrap);
  });

  card.append(
    btn(
      "btn-ghost mt-1 w-full border-dashed py-2 text-[11px]",
      "➕ افزودن وعده یا مکمل دلخواه",
      () => openAddDietItemModal(),
      { "aria-label": "افزودن وعده یا مکمل دلخواه" },
    ),
  );

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
  const { profile, diet } = getState();
  // A target below the current weight means a cut: fewer calories, more
  // protein per kilo to keep the muscle while losing fat.
  const cutting = profile.targetWeight < profile.currentWeight;
  // An AI-built plan wins over the body-weight formula: it knows the goal, the
  // training window and what the student can actually buy on campus.
  const aiProtein = diet.customProtein ?? null;
  const aiCalories = diet.customCalories ?? null;
  const proteinTarget = aiProtein ?? Math.round(profile.currentWeight * (cutting ? 1.8 : 1.55));
  const calories = aiCalories ?? Math.round(profile.currentWeight * (cutting ? 28 : 37));
  const fromAi = aiProtein !== null || aiCalories !== null;

  const card = el("div", "card border-emerald-500/20 bg-emerald-500/5");
  const head = el("div", "flex items-start justify-between gap-2");
  head.append(
    el(
      "p",
      "text-xs font-extrabold text-emerald-200",
      fromAi ? "هدف روزانه (برنامه هوش مصنوعی)" : "هدف روزانه تقریبی تو",
    ),
    btn("btn-icon shrink-0", svgIcon(icons.cpu, "h-4 w-4"), () => openAiDietConfigurator(), {
      "aria-label": "ساخت برنامه تغذیه با هوش مصنوعی",
      title: "ساخت برنامه با هوش مصنوعی",
    }),
  );
  card.append(head);
  card.append(
    el(
      "p",
      "mt-1 text-[10px] leading-5 text-emerald-100/60",
      fromAi
        ? "این اعداد را هوش مصنوعی بر اساس پروفایل، هدف و غذاهای در دسترس تو ساخته است."
        : cutting
          ? `هدف کاهش وزن (${faNum(profile.currentWeight, 0)} ← ${faNum(profile.targetWeight, 0)} کیلو): کالری کنترل‌شده و پروتئین بالاتر برای حفظ عضله.`
          : "قابل تامین با ۳ وعده سلف دانشگاه (بدون نیاز به میان‌وعده یا خرید اضافی).",
    ),
  );

  const grid = el("div", "mt-3 grid grid-cols-2 gap-2");
  const cell = (label: string, value: string, hint: string) => {
    const box = el("div", "rounded-xl bg-slate-950/50 px-3 py-2 text-center");
    box.append(
      el("p", "text-base font-extrabold text-emerald-300", value),
      el("p", "mt-0.5 text-[9px] text-slate-500", label),
      el("p", "mt-0.5 text-[8px] text-emerald-200/50", hint),
    );
    return box;
  };
  grid.append(
    cell(
      "پروتئین روزانه",
      `${fa(proteinTarget)} گرم`,
      aiProtein !== null ? "هوش مصنوعی" : cutting ? "۱٫۸ گرم بر کیلو" : "۱٫۵۵ گرم بر کیلو",
    ),
    cell("کالری روزانه", `${fa(calories)} کالری`, aiCalories !== null ? "هوش مصنوعی" : "از وزن بدن"),
  );
  card.append(grid);
  return card;
}

function cafeteriaTable(): HTMLElement {
  const { diet } = getState();
  const aiRows = diet.mealTable ?? [];

  // Built-in fallback: the published 3-meal cafeteria plan.
  const rows: Array<[string, string, string]> = [
    ["صبحانه سلف (املت + نان کامل)", "~۴۵۰ کالری", "~۱۲ گرم"],
    ["ناهار سلف (چلو جوجه کباب کامل)", "~۹۵۰ کالری", "~۴۵ گرم"],
    ["ناهار سلف (چلو مرغ کامل)", "~۹۰۰ کالری", "~۴۲ گرم"],
    ["شام سلف بعد تمرین (مرغ / جوجه / برگر)", "~۸۵۰ کالری", "~۴۰ گرم"],
    ["مجموع ۳ وعده سلف در روز", "~۲۴۰۰ کالری", "~۱۰۰ گرم"],
  ];

  const card = el("div", "card");
  card.append(
    sectionTitle(
      aiRows.length > 0 ? "جدول وعده‌های برنامه هوش مصنوعی" : "جدول ارزش غذایی وعده‌های سلف دانشگاه",
      aiRows.length > 0
        ? btn("btn-ghost px-2 py-1 text-[10px]", "ویرایش با AI", () => openAiDietConfigurator(), {
            "aria-label": "ویرایش جدول وعده‌ها با هوش مصنوعی",
          })
        : undefined,
    ),
  );

  const head = el("div", "grid grid-cols-3 gap-2 border-b border-slate-800/80 pb-1.5 text-[9px] text-slate-500");
  head.append(el("span", "", "وعده"), el("span", "text-center", "کالری"), el("span", "text-center", "پروتئین"));
  card.append(head);

  if (aiRows.length > 0) {
    const totalKcal = aiRows.reduce((sum, row) => sum + row.kcal, 0);
    const totalProtein = aiRows.reduce((sum, row) => sum + row.protein, 0);
    aiRows.forEach((row) => {
      const line = el("div", "grid grid-cols-3 gap-2 border-b border-slate-800/40 py-2 text-[11px]");
      line.append(
        el("span", "text-slate-200", escapeHtml(row.name)),
        el("span", "text-center text-slate-400", fa(row.kcal)),
        el("span", "text-center font-bold text-emerald-300", `${fa(row.protein)} گرم`),
      );
      card.append(line);
    });
    const total = el(
      "div",
      "mt-1 grid grid-cols-3 gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-1 py-2 text-[11px]",
    );
    total.append(
      el("span", "font-extrabold text-emerald-200", "مجموع روز"),
      el("span", "text-center font-bold text-emerald-300", fa(totalKcal)),
      el("span", "text-center font-bold text-emerald-300", `${fa(totalProtein)} گرم`),
    );
    card.append(total);
    card.append(
      el(
        "p",
        "mt-2 text-[10px] leading-5 text-slate-500",
        "این جدول از پاسخ هوش مصنوعی ساخته شده و با هر بار اعمال برنامه جایگزین می‌شود.",
      ),
    );
    return card;
  }

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
  // A real flex switch pill: no absolutely-positioned knob, so RTL can never
  // skew or overlap it (the old h-7/w-12 toggle did on narrow WebViews).
  const enabled = state.diet.waterReminderEnabled;
  const minutes = state.diet.waterReminderMinutes || 60;
  const toggleRow = el(
    'div',
    `flex items-center justify-between gap-3 rounded-2xl border p-3 transition ${
      enabled ? 'border-cyan-500/40 bg-cyan-500/10' : 'border-slate-800 bg-slate-950/50'
    }`,
  );
  const toggleText = el(
    'div',
    'min-w-0 flex-1 text-right',
    `<p class="text-xs font-extrabold text-slate-100">🔔 یادآور هوشمند نوشیدن آب</p>
     <p class="mt-0.5 text-[10px] leading-5 text-slate-400">
       ${
         enabled
           ? `فعال • هر ${fa(minutes)} دقیقه (۱۲ شب تا ۹ صبح بی‌صدا)`
           : 'برای دریافت نوتیفیکیشن منظم نوشیدن آب روشن کن'
       }
     </p>`,
  );

  const switchBtn = el('button', `toggle-switch border ${enabled ? 'is-on' : 'is-off'}`);
  switchBtn.type = 'button';
  switchBtn.setAttribute('role', 'switch');
  switchBtn.setAttribute('aria-checked', String(enabled));
  switchBtn.setAttribute('aria-pressed', String(enabled));
  switchBtn.setAttribute('aria-label', 'یادآور آب');
  switchBtn.append(el('span', 'toggle-switch-thumb'));
  switchBtn.addEventListener('click', () => toggleWaterReminder());

  toggleRow.append(toggleText, switchBtn);
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
    // Read the remaining time from the persisted deadline — never from a local
    // counter, otherwise a re-render or restart would look like a reset.
    const countdownText = (remainingSec: number) =>
      isWaterQuietHours()
        ? `🌙 در حالت خواب — یادآوری بعدی: ${fa(clock(remainingSec))}`
        : `یادآوری بعدی: ${fa(clock(remainingSec))}`;

    const countdown = el(
      "p",
      "mt-2 text-center text-[11px] font-bold tabular-nums text-cyan-300",
      countdownText(getWaterRemainingSeconds()),
    );
    onWaterTimerTick((remainingSec) => {
      countdown.textContent = countdownText(remainingSec);
    });
    card.append(countdown);
  } else {
    // Release the listener held by the previous render.
    onWaterTimerTick(null);
  }

  // Sleep window: the reminder never makes a sound between midnight and 09:00.
  card.append(
    el(
      "p",
      "mt-2 rounded-xl border border-slate-800 bg-slate-950/60 px-2.5 py-2 text-center text-[10px] leading-5 text-slate-400",
      `${WATER_QUIET_LABEL} — یادآور آب در این بازه کاملاً بی‌صدا است و سررسید بعدی به ساعت ۹ صبح منتقل می‌شود.`,
    ),
  );

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

  // Drinking a glass starts a fresh interval from NOW. Without this the
  // pending alarm would still ring a few seconds later even though the
  // student just had water.
  if (next > previous && state.diet.waterReminderEnabled) {
    startNewWaterReminderCycle(state.diet.waterReminderMinutes);
  } else {
    persist(0);
  }

  if (next >= WATER_GOAL && previous < WATER_GOAL) {
    toast("💧 ۸ لیوان کامل شد! هیدراته ماندن = پمپ بهتر و ریکاوری سریع‌تر.", "ok");
    beep(2, 1320, 0.12);
  } else {
    softTap();
  }
  requestRender();
}

function toggleWaterReminder(): void {
  const state = getState();

  if (state.diet.waterReminderEnabled) {
    stopWaterReminder();
    toast("یادآور آب خاموش شد.", "info");
    requestRender();
    return;
  }

  startNewWaterReminderCycle(state.diet.waterReminderMinutes);
  // Ask for the OS permission while we still have the tap (Android 13+).
  void ensureNotificationPermission().then((granted) => {
    if (!granted) {
      toast("اجازه اعلان داده نشد؛ یادآور فقط داخل برنامه نمایش داده می‌شود.", "info");
    }
  });
  toast(
    isWaterQuietHours()
      ? "یادآور آب روشن شد؛ چون الان در بازه خواب هستیم، اولین یادآور ساعت ۹ صبح است 🌙"
      : `یادآور آب هر ${fa(state.diet.waterReminderMinutes)} دقیقه روشن شد.`,
    "info",
  );
  requestRender();
}

function setWaterInterval(minutes: number): void {
  const state = getState();
  state.diet.waterReminderMinutes = minutes;

  if (state.diet.waterReminderEnabled) {
    // An explicit interval change is a deliberate restart of the cycle.
    startNewWaterReminderCycle(minutes);
  } else {
    persist(0);
  }
  toast(`فاصله یادآوری روی ${fa(minutes)} دقیقه تنظیم شد.`, "info");
  requestRender();
}

/** Why the workout slot matters when there are only three meals. */
function coachTipCard(): HTMLElement {
  const { profile, diet } = getState();
  const rules = diet.coachRules ?? [];
  const card = el("div", "card border-amber-500/25 bg-amber-500/5");

  if (rules.length > 0) {
    card.append(
      el("p", "text-xs font-extrabold text-amber-200", "قواعد مربی (برنامه هوش مصنوعی)"),
      el("p", "mt-1 text-[11px] font-bold leading-6 text-amber-100", escapeHtml(rules[0].headline)),
    );
    const list = el("ul", "mt-1.5 space-y-1");
    rules[0].points.slice(0, 4).forEach((point) => {
      list.append(el("li", "text-[10px] leading-5 text-amber-100/80", `• ${escapeHtml(point)}`));
    });
    card.append(list);
  } else {
    card.append(
      el("p", "text-xs font-extrabold text-amber-200", "نکته مربی: بهترین ساعت باشگاه"),
      el(
        "p",
        "mt-1 text-[11px] leading-6 text-amber-100/80",
        `ساعت تمرین تو: ${escapeHtml(profile.trainingWindow)}. وعده بعد از تمرین همان شام سلف است، پس کالری و پروتئین روز را روی همین تایم بچین.`,
      ),
    );
  }

  card.append(
    btn(
      "btn-ghost mt-2 w-full border-dashed py-2 text-[10px]",
      "ساخت برنامه تغذیه با هوش مصنوعی",
      () => openAiDietConfigurator(),
      { "aria-label": "ساخت برنامه تغذیه با هوش مصنوعی" },
    ),
  );
  return card;
}
