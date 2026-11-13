/** Workout tab: day switcher, warm-up card, overload banner and set logger. */
import { btn, el, escapeHtml, svgIcon, uid } from "../lib/dom";
import { icons } from "../lib/icons";
import { daysBetween, fa, faDate, faNum, faReps, firstNumber, isoToday } from "../lib/fa";
import { alarm, beep, cardioTimer, chord, softTap } from "../lib/timer";
import { applyProgressiveOverload } from "../lib/api";
import {
  getState,
  mutate,
  persist,
  requestRender,
  setState,
  syncWaterChecklist,
  WATER_GOAL,
} from "../lib/store";
import type { Exercise, SetLog, WorkoutDay } from "../types";
import { confirmDialog, openModal, progressBar, toast } from "../components/ui";
import { openGifModal } from "../components/gifModal";
import defaultGifs from "../data/default-gifs.json";
import { openExerciseEditor, type ExerciseDraft } from "../components/exerciseEditor";
import { startRest } from "../components/restTimer";
import { openValuePicker, stepper } from "../components/stepper";
import { refreshWeeklyActivityCard, renderWeeklyActivityCard } from "../components/weeklyActivity";
import {
  checkAndUpdatePR,
  isExerciseSwapped,
  openPlateCalculatorModal,
  openWorkoutFinishModal,
  personalRecordFor,
  renderReadinessAndToolsBar,
  restoreOriginalExercise,
  openSwapExerciseModal,
} from "../lib/workoutTools";
import { syncLogs } from "../lib/localBackend";
import { openExerciseHistoryModal, recordExerciseHistory } from "../components/exerciseHistory";
import {
  openDoubleProgressionModal,
  reachedTopOfRange,
} from "../components/doubleProgression";

const OVERLOAD_CYCLE_DAYS = 14;
const collapsedDays = new Set<string>();
const CARDIO_RING_RADIUS = 22;
const CARDIO_RING_LENGTH = 2 * Math.PI * CARDIO_RING_RADIUS;

export function renderWorkout(): HTMLElement {
  const state = getState();
  const day = state.days[state.activeDay];
  const view = el("div", "space-y-3 animate-fade-up");

  view.append(dayStrip());
  if (!day) return view;

  view.append(renderReadinessAndToolsBar());
  view.append(waterBar());
  view.append(overloadBanner());
  view.append(warmupCard(day));
  view.append(daySummary(day));
  view.append(
    btn(
      "btn-ghost w-full border-emerald-500/25 text-xs text-emerald-300",
      "🏁 ثبت پایان تمرین امروز",
      () => openWorkoutFinishModal(day),
    ),
  );

  day.exercises.forEach((exercise, index) => {
    view.append(exerciseCard(day, exercise, index));
  });

  view.append(
    btn(
      "btn-ghost w-full border-dashed text-slate-400",
      `${svgIcon(icons.plus, "h-4 w-4").outerHTML} افزودن حرکت به این روز`,
      () => addExercise(day),
    ),
  );

  // Same weekly calendar as the progress tab, so the day's log is one scroll away.
  view.append(renderWeeklyActivityCard());

  return view;
}

/** Compact water counter so you can log glasses mid-workout. */
function waterBar(): HTMLElement {
  const state = getState();
  const glasses = state.diet.waterGlasses;
  const reachedGoal = glasses >= WATER_GOAL;

  const row = el(
    "div",
    `flex items-center gap-2 rounded-2xl border px-3 py-2 ${
      reachedGoal ? "border-emerald-500/30 bg-emerald-500/10" : "border-cyan-500/20 bg-cyan-500/5"
    }`,
  );

  const drop = el("span", reachedGoal ? "text-emerald-300" : "text-cyan-300");
  drop.append(svgIcon(icons.drop, "h-4 w-4"));

  row.append(
    drop,
    el(
      "span",
      "min-w-0 flex-1 text-[11px] font-bold text-slate-200",
      `آب امروز: ${fa(glasses)} از ${fa(WATER_GOAL)} لیوان`,
    ),
  );

  row.append(
    btn(
      "shrink-0 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1.5 text-[10px] font-bold text-cyan-200 transition active:scale-95",
      "💧 ‎+۱ لیوان",
      () => {
        state.diet.waterGlasses = Math.min(20, state.diet.waterGlasses + 1);
        syncWaterChecklist();
        persist(0);
        if (state.diet.waterGlasses === WATER_GOAL) {
          toast("💧 ۸ لیوان کامل شد! پمپ و ریکاوری بهتر.", "ok");
          beep(2, 1320, 0.12);
        } else {
          softTap();
        }
        requestRender();
      },
      { "aria-label": "افزودن یک لیوان آب" },
    ),
  );

  return row;
}

// ---------------------------------------------------------------------------
// Day strip
// ---------------------------------------------------------------------------

function dayStrip(): HTMLElement {
  const state = getState();
  // Four fixed days fit a 2x2 grid: no horizontal scrolling, no clipped labels.
  const strip = el("div", "grid grid-cols-2 gap-2 pb-1 pt-0.5");

  state.days.forEach((day, index) => {
    const active = index === state.activeDay;
    const done = day.exercises.reduce((sum, exercise) => sum + exercise.logs.filter((l) => l.done).length, 0);
    const total = day.exercises.reduce((sum, exercise) => sum + exercise.logs.length, 0);
    const finished = total > 0 && done === total;

    const pill = btn(
      `pill flex w-full min-w-0 flex-col items-start gap-0.5 ${
        active
          ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-300 shadow-glow"
          : "border-slate-800 bg-slate-900/60 text-slate-400"
      }`,
      `<span class="flex w-full items-center justify-between gap-1 text-[10px] opacity-80">
         <span>${escapeHtml(day.label)}</span>
         ${finished ? '<span class="text-emerald-400">✓</span>' : `<span>${fa(done)}/${fa(total)}</span>`}
       </span>
       <span class="w-full truncate text-right text-xs font-extrabold">${escapeHtml(day.title)}</span>`,
      () => {
        if (getState().activeDay === index) return;
        mutate((state) => {
          state.activeDay = index;
        });
        persist(0);
        requestRender();
      },
    );
    strip.append(pill);
  });

  return strip;
}

// ---------------------------------------------------------------------------
// Progressive overload banner
// ---------------------------------------------------------------------------

function overloadBanner(): HTMLElement {
  const state = getState();
  const elapsed = Math.max(0, daysBetween(state.lastOverloadDate, isoToday()));
  const remaining = Math.max(0, OVERLOAD_CYCLE_DAYS - elapsed);
  const due = remaining === 0;
  const percent = Math.min(100, (elapsed / OVERLOAD_CYCLE_DAYS) * 100);

  const card = el(
    "div",
    `card relative overflow-hidden border ${
      due ? "border-emerald-400/50" : "border-emerald-500/15"
    } bg-gradient-to-bl from-emerald-500/10 via-slate-900/70 to-cyan-500/5`,
  );

  const top = el("div", "flex items-start justify-between gap-3");
  const info = el("div", "min-w-0");
  info.append(
    el("p", "text-[10px] font-medium tracking-wide text-emerald-300/80", "قانون افزایش وزنه دو هفته‌ای"),
    el(
      "p",
      "mt-1 text-sm font-extrabold text-slate-50",
      due ? "⚡ وقتش رسیده؛ وزنه‌ها را زیاد کن!" : `${fa(remaining)} روز تا چرخه بعدی`,
    ),
    el(
      "p",
      "mt-1 text-[10px] leading-5 text-slate-400",
      `آخرین چرخه: ${faDate(state.lastOverloadDate, { withYear: false })} • ${fa(state.overloadCount)} بار اعمال شده`,
    ),
  );
  top.append(info, el("span", "chip chip-emerald shrink-0", "\u200E+۲٫۵ کیلو"));

  const bar = progressBar(percent, "mt-3");
  bar.setAttribute("data-overload-bar", "1");

  const action = btn(
    "btn-primary mt-3 w-full",
    "⚡ اعمال افزایش وزنه دو هفته‌ای (\u200E+۲٫۵ کیلوگرم)",
    () => void runOverload(),
  );

  card.append(top, bar, action);
  return card;
}

async function runOverload(): Promise<void> {
  const state = getState();
  const elapsed = Math.max(0, daysBetween(state.lastOverloadDate, isoToday()));
  const remaining = Math.max(0, OVERLOAD_CYCLE_DAYS - elapsed);

  const confirmed = await confirmDialog({
    title: "افزایش وزنه چرخه جدید",
    message:
      remaining > 0
        ? `هنوز ${fa(remaining)} روز تا پایان چرخه مانده. اگر مطمئنی، وزنه همه حرکات \u200E+۲٫۵ کیلوگرم زیاد می‌شود (حرکات وزن بدن: \u200E+۱ تکرار) و تیک ست‌های فعلی پاک می‌شود.`
        : "وزنه همه حرکات \u200E+۲٫۵ کیلوگرم زیاد می‌شود (حرکات وزن بدن: \u200E+۱ تکرار) و تیک ست‌های فعلی پاک می‌شود.",
    confirmText: "اعمال افزایش",
  });
  if (!confirmed) return;

  try {
    const next = await applyProgressiveOverload();
    setState(next);
    toast("چرخه افزایش وزنه اعمال شد.");
    // beep() owns its vibration now; no second vibrate() here.
    beep(3, 1480, 0.15);
    requestRender();
  } catch (error) {
    toast(error instanceof Error ? error.message : "اعمال افزایش وزنه ناموفق بود.", "error");
  }
}

// ---------------------------------------------------------------------------
// Warm-up card
// ---------------------------------------------------------------------------

function warmupCard(day: WorkoutDay): HTMLElement {
  const card = el("div", "card");
  const collapsed = collapsedDays.has(day.id);
  const doneCount = day.warmups.filter((item) => item.done).length;
  const total = day.warmups.length;

  const header = el("button", "flex w-full items-center justify-between gap-2 text-right");
  header.type = "button";
  const titleWrap = el("div", "flex items-center gap-2");
  const flame = el(
    "span",
    "flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-300",
  );
  flame.append(svgIcon(icons.flame, "h-5 w-5"));
  titleWrap.append(flame);
  const titles = el("div");
  titles.append(
    el("p", "text-sm font-extrabold text-slate-100", "گرم کردن قبل از تمرین"),
    el("p", "mt-0.5 text-[10px] text-slate-400", `${fa(doneCount)} از ${fa(total)} مرحله انجام شد`),
  );
  titleWrap.append(titles);
  header.append(titleWrap, svgIcon(collapsed ? icons.chevronDown : icons.chevronUp, "h-4 w-4 text-slate-500"));
  header.addEventListener("click", () => {
    if (collapsedDays.has(day.id)) collapsedDays.delete(day.id);
    else collapsedDays.add(day.id);
    requestRender();
  });

  card.append(header);
  if (collapsed) return card;

  card.append(cardioTimerBlock());

  const list = el("div", "mt-2 space-y-1");
  day.warmups.forEach((item) => {
    const row = el(
      "div",
      "flex items-start gap-2.5 rounded-xl px-1.5 py-1.5 transition hover:bg-slate-800/30",
    );

    const check = el(
      "button",
      `mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border transition active:scale-90 ${
        item.done
          ? "border-emerald-400 bg-emerald-400 text-slate-950"
          : "border-slate-700 bg-slate-900 text-transparent"
      }`,
    );
    check.type = "button";
    check.setAttribute("aria-label", "انجام شد");
    check.innerHTML = svgIcon(icons.check, "h-3.5 w-3.5").outerHTML;

    const text = el(
      "p",
      `flex-1 text-[11px] leading-6 ${
        item.done ? "text-slate-500 line-through decoration-slate-600" : "text-slate-300"
      }`,
      escapeHtml(item.text),
    );

    const gifButton = btn(
      "shrink-0 rounded-lg border border-slate-700/70 bg-slate-900/70 px-2 py-1 text-[10px] font-bold text-cyan-300 transition active:scale-95",
      "🎬 گیف",
      () =>
        openGifModal({
          title: item.text,
          query: item.query,
          gifUrl: item.gifUrl,
          fallbackUrl: bundledWarmupDemo(day.id, item.id),
          onSaveUrl: (url) => {
            item.gifUrl = url;
            persist(0);
            requestRender();
          },
        }),
    );

    check.addEventListener("click", () => {
      item.done = !item.done;
      persist(0);
      if (item.done) {
        softTap();
      }
      const nowDone = day.warmups.filter((w) => w.done).length;
      titles.querySelector("p:last-child")!.textContent = `${fa(nowDone)} از ${fa(total)} مرحله انجام شد`;
      document
        .querySelector<HTMLElement>("[data-day-restart]")
        ?.classList.toggle("hidden", !dayHasProgress(day));
      check.className = `mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border transition active:scale-90 ${
        item.done
          ? "border-emerald-400 bg-emerald-400 text-slate-950"
          : "border-slate-700 bg-slate-900 text-transparent"
      }`;
      text.className = `flex-1 text-[11px] leading-6 ${
        item.done ? "text-slate-500 line-through decoration-slate-600" : "text-slate-300"
      }`;
    });

    row.append(check, text, gifButton);
    list.append(row);
  });

  card.append(list);
  return card;
}

function cardioTimerBlock(): HTMLElement {
  const wrap = el(
    "div",
    "mt-3 flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-3",
  );

  const ringWrap = el("div", "relative h-14 w-14 shrink-0");
  ringWrap.innerHTML = `
    <svg viewBox="0 0 56 56" class="h-14 w-14 -rotate-90">
      <circle cx="28" cy="28" r="${CARDIO_RING_RADIUS}" fill="none" stroke="rgba(148,163,184,0.16)" stroke-width="5" />
      <circle data-cardio-ring cx="28" cy="28" r="${CARDIO_RING_RADIUS}" fill="none" stroke="url(#cardioGrad)"
        stroke-width="5" stroke-linecap="round" stroke-dasharray="${CARDIO_RING_LENGTH}" stroke-dashoffset="0" />
      <defs>
        <linearGradient id="cardioGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#fbbf24" />
          <stop offset="100%" stop-color="#34d399" />
        </linearGradient>
      </defs>
    </svg>`;
  const timeText = el(
    "span",
    "absolute inset-0 flex items-center justify-center font-vazir text-[13px] font-black tabular-nums leading-none text-slate-50",
    "۵:۰۰",
  );
  ringWrap.append(timeText);

  const info = el("div", "min-w-0 flex-1");
  info.append(
    el("p", "text-[11px] font-extrabold text-slate-100", "تایمر ۵ دقیقه هوازی"),
    el("p", "mt-0.5 text-[10px] leading-5 text-slate-400", "دمای بدن و ضربان را بالا ببر، بعد وزنه بزن"),
  );

  const playPause = btn(
    "flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400 text-slate-950 transition active:scale-90",
    svgIcon(icons.play, "h-4 w-4"),
    () => {
      cardioTimer.toggle();
      paintCardio();
    },
    { "aria-label": "شروع یا توقف" },
  );

  const resetButton = btn("btn-icon", svgIcon(icons.reset, "h-4 w-4"), () => {
    cardioTimer.reset(300);
    paintCardio();
  }, { "aria-label": "بازنشانی" });

  const paintCardio = () => {
    const ring = ringWrap.querySelector<SVGCircleElement>("[data-cardio-ring]");
    if (ring) {
      ring.style.strokeDashoffset = `${CARDIO_RING_LENGTH * (1 - cardioTimer.progress)}`;
    }
    timeText.textContent = fa(formatClock(cardioTimer.remaining));
    playPause.innerHTML = "";
    playPause.append(svgIcon(cardioTimer.running ? icons.pause : icons.play, "h-4 w-4"));
  };

  cardioTimer.onTick = () => paintCardio();
  cardioTimer.onDone = () => {
    alarm();
    toast("۵ دقیقه هوازی تمام شد. حالا گرم کردن پویا! 🔥");
    paintCardio();
  };

  wrap.append(ringWrap, info, playPause, resetButton);
  paintCardio();
  return wrap;
}

function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Day summary
// ---------------------------------------------------------------------------

function daySummary(day: WorkoutDay): HTMLElement {
  const card = el("div", "card flex items-center gap-3");
  const left = el("div", "min-w-0 flex-1");
  const labelRow = el("div", "flex items-center justify-between text-[10px] text-slate-400");
  labelRow.append(el("span", "", "پیشرفت امروز"), el("span", "font-bold text-slate-300"));
  const count = labelRow.lastElementChild as HTMLElement;
  count.setAttribute("data-day-count", "1");
  count.textContent = `${fa(dayDone(day))} از ${fa(dayTotal(day))} ست`;

  const bar = progressBar(dayPercent(day), "mt-1.5");
  const fill = bar.firstElementChild as HTMLElement;
  fill.setAttribute("data-day-bar", "1");

  left.append(labelRow, bar);

  const percent = el("div", "shrink-0 text-center");
  percent.append(
    el("p", "text-lg font-extrabold leading-none text-emerald-400", `${fa(dayPercent(day))}٪`),
    el("p", "mt-1 text-[9px] text-slate-500", "امروز"),
  );
  percent.firstElementChild?.setAttribute("data-day-percent", "1");

  card.append(left, percent);

  // A 2-week cycle means every training day is repeated; once it is finished the
  // user needs a way to clear the ticks (without losing the logged weights).
  const restart = btn("btn-icon shrink-0", svgIcon(icons.reset, "h-4 w-4"), () => void restartDay(day), {
    "aria-label": "شروع مجدد این روز",
    title: "شروع مجدد این روز",
  });
  restart.setAttribute("data-day-restart", "1");
  if (!dayHasProgress(day)) restart.classList.add("hidden");
  card.append(restart);

  return card;
}

/** Clears every tick of the day, keeping the weights/reps the user typed. */
async function restartDay(day: WorkoutDay): Promise<void> {
  const doneSets = dayDone(day);
  const confirmed = await confirmDialog({
    title: "شروع مجدد این روز",
    message: `تیک ${fa(doneSets)} ست و همه مراحل گرم کردن این روز پاک شود؟ وزنه‌ها و تکرارهایی که وارد کرده‌ای حفظ می‌شوند.`,
    confirmText: "شروع مجدد",
  });
  if (!confirmed) return;

  for (const exercise of day.exercises) {
    for (const log of exercise.logs) log.done = false;
  }
  for (const warmup of day.warmups) warmup.done = false;

  persist(0);
  toast("این روز از نو آماده شد. برو سنگین بزن! 💪", "info");
  requestRender();
}

const dayHasProgress = (day: WorkoutDay) =>
  dayDone(day) > 0 || day.warmups.some((warmup) => warmup.done);

const dayTotal = (day: WorkoutDay) => day.exercises.reduce((sum, e) => sum + e.logs.length, 0);
const dayDone = (day: WorkoutDay) => day.exercises.reduce((sum, e) => sum + e.logs.filter((l) => l.done).length, 0);
const dayPercent = (day: WorkoutDay) => {
  const total = dayTotal(day);
  return total === 0 ? 0 : Math.round((dayDone(day) / total) * 100);
};

// ---------------------------------------------------------------------------
// Exercise cards
// ---------------------------------------------------------------------------

/** `/gifs/wu-upper-3.svg` — the bundled demo for a day's warm-up row. */
function bundledWarmupDemo(dayId: string, warmupId: string): string | null {
  const map = defaultGifs.warmups as Record<string, string>;
  return map[`${dayId}:${warmupId}`] ?? null;
}

function exerciseCard(day: WorkoutDay, exercise: Exercise, index: number): HTMLElement {
  const card = el("article", "card space-y-3");
  card.setAttribute("data-exercise", exercise.id);

  const header = el("div", "flex items-start gap-3");
  const badge = el(
    "div",
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-800/80 text-xs font-extrabold text-emerald-300",
    fa(index + 1),
  );

  const info = el("div", "min-w-0 flex-1");
  info.append(el("h3", "text-sm font-extrabold leading-6 text-slate-50", escapeHtml(exercise.name)));

  const swapped = isExerciseSwapped(exercise);

  const chips = el("div", "mt-1.5 flex flex-wrap items-center gap-1.5");
  chips.append(
    el("span", "chip", `${fa(exercise.sets)} ست`),
    el("span", "chip", `${escapeHtml(faReps(exercise.reps))} تکرار`),
  );
  if (swapped) {
    // Amber: this row is a one-day substitute, not the programmed movement.
    chips.append(el("span", "chip chip-amber", "🔄 جایگزین امروز"));
  }
  if (exercise.bodyweight || exercise.targetWeight <= 0) {
    chips.append(el("span", "chip chip-cyan", "وزن بدن"));
  } else {
    chips.append(el("span", "chip chip-emerald", `${faNum(exercise.targetWeight, 1)} کیلو`));
  }
  const doneChip = el("span", "chip", `${fa(exercise.logs.filter((l) => l.done).length)}/${fa(exercise.logs.length)}`);
  doneChip.setAttribute("data-ex-count", exercise.id);
  chips.append(doneChip);
  const record = personalRecordFor(exercise.id);
  if (record) {
    chips.append(el("span", "chip chip-amber", `🏆 ${faNum(record.weight, 1)}`));
  }
  info.append(chips);

  const actions = el("div", "flex flex-col gap-1");
  actions.append(
    btn("btn-icon", svgIcon(icons.film, "h-4 w-4"), () =>
      openGifModal({
        title: exercise.name,
        query: exercise.query,
        gifUrl: exercise.gifUrl,
        fallbackUrl: `/gifs/${exercise.id}.svg`,
        onSaveUrl: (url) => {
          exercise.gifUrl = url;
          persist(0);
          requestRender();
        },
      }),
    ),
    btn("btn-icon", svgIcon(icons.chart, "h-4 w-4"), () => openExerciseHistoryModal(exercise), {
      "aria-label": "تاریخچه این حرکت",
      title: "روند وزن و تکرار این حرکت",
    }),
    btn("btn-icon", svgIcon(icons.more, "h-4 w-4"), () => openExerciseMenu(day, exercise, index), {
      "aria-label": "گزینه‌های حرکت",
    }),
  );

  header.append(badge, info, actions);
  card.append(header);

  const tools = el("div", "grid grid-cols-2 gap-1.5");
  tools.append(
    swapped
      ? btn(
          "rounded-xl border border-amber-400/60 bg-amber-500/15 px-2 py-1.5 text-[10px] font-extrabold text-amber-200 transition active:scale-95",
          "↩️ برگشت به حرکت اصلی",
          () => restoreOriginalExercise(exercise),
          { "aria-label": "برگشت به حرکت اصلی" },
        )
      : btn(
          "rounded-xl border border-slate-800 bg-slate-950 px-2 py-1.5 text-[10px] font-bold text-slate-300 transition active:scale-95",
          "🔄 دستگاه شلوغه / جایگزین",
          () => openSwapExerciseModal(exercise),
          { "aria-label": "حرکت جایگزین" },
        ),
    btn(
      "rounded-xl border border-slate-800 bg-slate-950 px-2 py-1.5 text-[10px] font-bold text-slate-300 transition active:scale-95",
      "🏋️ صفحه‌های هالتر",
      () => openPlateCalculatorModal(exercise.targetWeight || 40),
      { "aria-label": "ماشین‌حساب صفحه‌های هالتر" },
    ),
  );
  card.append(tools);

  if (exercise.gifUrl) {
    // The dataset GIFs are 180×180 on a white background, so they sit in a white
    // card at their natural square size instead of being stretched full width.
    // Hug the artwork: a full-width white bar leaves ~100px of empty white on
    // each side of the 180px GIF.
    const wrap = el(
      "div",
      "mx-auto flex w-fit items-center justify-center overflow-hidden rounded-2xl border border-slate-800 bg-white p-2",
    );
    const img = el("img", "h-44 w-44 object-contain");
    img.src = exercise.gifUrl;
    img.alt = exercise.name;
    // `lazy` keeps off-screen GIFs from downloading; `async` keeps the GIF
    // frame decode off the main thread so it never stutters a scroll.
    img.loading = "lazy";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";

    // Stored demo → its own offline file → plain explanation. The picture is
    // never deleted from the card.
    const localDemo = exercise.swappedDate && exercise.originalName
      ? `/gifs/${exercise.id}-alt.gif`
      : `/gifs/${exercise.id}.gif`;
    let fellBack = exercise.gifUrl === localDemo;
    img.addEventListener("error", () => {
      if (!fellBack) {
        fellBack = true;
        img.src = localDemo;
        return;
      }
      wrap.replaceWith(
        el(
          "div",
          "flex h-48 w-full items-center justify-center rounded-2xl border border-slate-800 bg-slate-950 px-4 text-center text-[11px] leading-6 text-slate-500",
          "نمایش حرکت در دسترس نیست.",
        ),
      );
    });

    wrap.append(img);
    card.append(wrap);
  }

  if (exercise.tip) {
    const details = el("details", "rounded-xl border border-amber-500/15 bg-amber-500/5 px-3 py-2");
    details.append(
      el("summary", "cursor-pointer list-none text-[11px] font-bold text-amber-300", "💡 نکته اجرای حرکت"),
      el("p", "mt-1 text-[11px] leading-6 text-amber-100/80", escapeHtml(exercise.tip)),
    );
    card.append(details);
  }

  const rows = el("div", "space-y-2");
  const columnHeader = el("div", "flex items-center gap-1.5 px-2 text-[9px] text-slate-500");
  columnHeader.append(
    el("span", "w-9 shrink-0", "ست"),
    el("span", "flex-1 text-center", "وزنه (kg)"),
    el("span", "flex-1 text-center", "تکرار"),
    el("span", "w-9 shrink-0 text-center", "انجام"),
  );
  rows.append(columnHeader);
  exercise.logs.forEach((log) => rows.append(setRow(day, exercise, log)));
  card.append(rows);

  return card;
}

function setRow(day: WorkoutDay, exercise: Exercise, log: SetLog): HTMLElement {
  const row = el(
    "div",
    `flex items-center gap-1.5 rounded-xl border px-1.5 py-1.5 transition ${
      log.done ? "border-emerald-500/40 bg-emerald-500/10" : "border-slate-800 bg-slate-950/40"
    }`,
  );
  row.setAttribute("data-row", `${exercise.id}-${log.index}`);

  const label = el(
    "span",
    `w-9 shrink-0 text-[11px] font-bold ${log.done ? "text-emerald-300" : "text-slate-400"}`,
    `ست ${fa(log.index)}`,
  );

  // No <input> anywhere: the gym keyboard is the enemy.
  const weight = stepper({
    value: log.weight,
    step: 2.5,
    min: 0,
    ariaLabel: `وزنه ست ${log.index}`,
    onChange: (value) => {
      log.weight = value;
      persist();
    },
    onOpenPicker: (current, setValue) =>
      openValuePicker({
        title: `وزنه ست ${fa(log.index)}`,
        subtitle: exercise.name,
        value: current,
        unit: "کیلوگرم",
        format: (value) => faNum(value, 1),
        deltas: [-5, -2.5, -1.25, 1.25, 2.5, 5],
        presets: [0, 2.5, 5, 7.5, 10, 12.5, 15, 17.5, 20, 22.5, 25, 30, 35, 40, 50, 60, 70, 80, 100],
        onChange: (value) => {
          log.weight = value;
          setValue(value);
          persist();
        },
        onApplyAll: (value) => applyToAllSets(exercise, "weight", value),
      }),
  });

  const reps = stepper({
    value: log.reps,
    step: 1,
    min: 1,
    ariaLabel: `تکرار ست ${log.index}`,
    onChange: (value) => {
      log.reps = value;
      persist();
    },
    onOpenPicker: (current, setValue) =>
      openValuePicker({
        title: `تکرار ست ${fa(log.index)}`,
        subtitle: exercise.name,
        value: current,
        unit: "تکرار",
        min: 1,
        format: (value) => fa(value),
        deltas: [-2, -1, 1, 2],
        presets: [6, 8, 10, 12, 15, 20, 25],
        onChange: (value) => {
          log.reps = value;
          setValue(value);
          persist();
        },
        onApplyAll: (value) => applyToAllSets(exercise, "reps", value),
      }),
  });

  const check = el(
    "button",
    `flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition active:scale-90 ${
      log.done
        ? "border-emerald-400 bg-emerald-400 text-slate-950"
        : "border-slate-700 bg-slate-900 text-slate-500"
    }`,
  );
  check.type = "button";
  check.setAttribute("aria-label", "تکمیل ست");
  check.innerHTML = svgIcon(icons.check, "h-4 w-4").outerHTML;

  check.addEventListener("click", () => {
    const wasComplete = dayTotal(day) > 0 && dayDone(day) === dayTotal(day);
    log.done = !log.done;
    persist(0);

    row.className = `flex items-center gap-1.5 rounded-xl border px-1.5 py-1.5 transition ${
      log.done ? "border-emerald-500/40 bg-emerald-500/10" : "border-slate-800 bg-slate-950/40"
    }`;
    check.className = `flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition active:scale-90 ${
      log.done ? "border-emerald-400 bg-emerald-400 text-slate-950" : "border-slate-700 bg-slate-900 text-slate-500"
    }`;
    label.className = `w-9 shrink-0 text-[11px] font-bold ${
      log.done ? "text-emerald-300" : "text-slate-400"
    }`;

    if (log.done) {
      // Fold today's top set into the per-exercise progression log before the
      // audio cue: the chart and the double-progression step both read it.
      recordExerciseHistory(exercise);

      // Record the PR before the audio cue; a re-render puts the 🏆 chip up.
      if (checkAndUpdatePR(exercise, log.weight, log.reps)) {
        persist(0);
        requestRender();
      }

      // One clip per tap: the final set plays the brighter "chord" instead of
      // the regular bell, so the two real MP3s never overlap.
      const allDone =
        exercise.logs.length > 0 && exercise.logs.every((entry) => entry.done);
      if (allDone) {
        chord();
        // Once per exercise per day: ask what the next session should be.
        offerDoubleProgression(exercise);
      } else beep(2, 1320, 0.12);
      startRest();
    }
    refreshProgress(day, exercise);

    // Celebrate once, on the tick that finishes the whole day.
    if (!wasComplete && dayTotal(day) > 0 && dayDone(day) === dayTotal(day)) {
      openWorkoutFinishModal(day);
    }
  });

  row.append(label, weight.element, reps.element, check);
  return row;
}

/** Exercises already asked about today (in-memory: one prompt per session). */
const progressionAsked = new Set<string>();

/** Asks the double-progression question once per exercise per day. */
function offerDoubleProgression(exercise: Exercise): void {
  const key = `${exercise.id}:${isoToday()}`;
  if (progressionAsked.has(key)) return;
  progressionAsked.add(key);
  openDoubleProgressionModal(exercise, reachedTopOfRange(exercise));
}

/** One tap sets the same weight (or reps) for every set of the exercise. */
function applyToAllSets(exercise: Exercise, field: "weight" | "reps", value: number): void {
  for (const log of exercise.logs) {
    if (field === "weight") log.weight = value;
    else log.reps = value;
  }
  persist(0);
  toast(
    field === "weight"
      ? `وزنه ${faNum(value, 1)} کیلوگرم برای همه ست‌ها اعمال شد.`
      : `تکرار ${fa(value)} برای همه ست‌ها اعمال شد.`,
  );
  requestRender();
}

/** Targeted DOM updates so the inputs keep focus and the page does not jump. */
function refreshProgress(day: WorkoutDay, exercise: Exercise): void {
  const root = document.getElementById("view");
  if (!root) return;

  const done = exercise.logs.filter((l) => l.done).length;
  const chip = root.querySelector<HTMLElement>(`[data-ex-count="${exercise.id}"]`);
  if (chip) chip.textContent = `${fa(done)}/${fa(exercise.logs.length)}`;

  const total = dayTotal(day);
  const dayDoneCount = dayDone(day);
  const percent = total === 0 ? 0 : Math.round((dayDoneCount / total) * 100);

  const countLabel = root.querySelector<HTMLElement>("[data-day-count]");
  if (countLabel) countLabel.textContent = `${fa(dayDoneCount)} از ${fa(total)} ست`;

  const bar = root.querySelector<HTMLElement>("[data-day-bar]");
  if (bar) bar.style.width = `${percent}%`;

  const percentLabel = root.querySelector<HTMLElement>("[data-day-percent]");
  if (percentLabel) percentLabel.textContent = `${fa(percent)}٪`;

  const restart = root.querySelector<HTMLElement>("[data-day-restart]");
  if (restart) restart.classList.toggle("hidden", !dayHasProgress(day));

  if (exercise.logs.length > 0 && done === exercise.logs.length) {
    toast(`حرکت «${exercise.name}» کامل شد ✅`, "ok");
  }

  // The calendar at the bottom of this tab is derived from the same ticks.
  refreshWeeklyActivityCard();
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

function openExerciseMenu(day: WorkoutDay, exercise: Exercise, index: number): void {
  const body = el("div", "space-y-2");

  const item = (label: string, icon: string, onClick: () => void, danger = false) => {
    const button = btn(
      `flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-xs font-bold transition active:scale-[0.98] ${
        danger
          ? "border-rose-500/30 bg-rose-500/5 text-rose-300"
          : "border-slate-800 bg-slate-950/50 text-slate-200"
      }`,
      `${svgIcon(icon, "h-4 w-4").outerHTML}<span>${escapeHtml(label)}</span>`,
      () => {
        handle.close();
        onClick();
      },
    );
    return button;
  };

  body.append(
    item("ویرایش حرکت", icons.edit, () => editExercise(exercise)),
    item("جابه‌جایی به بالا", icons.arrowUp, () => moveExercise(day, index, -1)),
    item("جابه‌جایی به پایین", icons.arrowDown, () => moveExercise(day, index, 1)),
    item("افزودن حرکت بعد از این", icons.plus, () => addExercise(day, index + 1)),
    item("حذف حرکت", icons.trash, () => void removeExercise(day, exercise), true),
  );

  const handle = openModal({
    title: exercise.name,
    subtitle: `${fa(exercise.sets)} ست × ${escapeHtml(faReps(exercise.reps))} تکرار`,
    body,
  });
}

function editExercise(exercise: Exercise): void {
  openExerciseEditor({
    mode: "edit",
    initial: exercise,
    onSubmit: (draft: ExerciseDraft) => {
      const repsChanged = exercise.reps !== draft.reps;
      const weightChanged = exercise.targetWeight !== draft.targetWeight;

      exercise.name = draft.name;
      exercise.reps = draft.reps;
      exercise.tip = draft.tip;
      exercise.query = draft.query;
      exercise.gifUrl = draft.gifUrl;
      exercise.targetWeight = draft.targetWeight;
      exercise.bodyweight = draft.targetWeight <= 0;
      exercise.sets = draft.sets;

      // Rows that are not checked yet follow the new prescription; completed
      // sets are history and keep what was actually lifted.
      for (const log of exercise.logs) {
        if (log.done) continue;
        if (weightChanged) log.weight = draft.targetWeight;
        if (repsChanged) {
          const targetReps = firstNumber(draft.reps);
          if (targetReps > 0) log.reps = targetReps;
        }
      }
      exercise.logs = syncLogs(exercise);
      persist(0);
      toast("حرکت به‌روزرسانی شد.");
      requestRender();
    },
  });
}

function addExercise(day: WorkoutDay, position?: number): void {
  openExerciseEditor({
    mode: "add",
    onSubmit: (draft: ExerciseDraft) => {
      const created: Exercise = {
        id: uid("ex"),
        name: draft.name,
        sets: draft.sets,
        reps: draft.reps,
        query: draft.query,
        tip: draft.tip,
        gifUrl: draft.gifUrl,
        targetWeight: draft.targetWeight,
        bodyweight: draft.targetWeight <= 0,
        logs: [],
      };
      created.logs = syncLogs(created);
      const at = position ?? day.exercises.length;
      day.exercises.splice(Math.min(at, day.exercises.length), 0, created);
      persist(0);
      toast("حرکت جدید اضافه شد.");
      requestRender();
    },
  });
}

function moveExercise(day: WorkoutDay, index: number, delta: number): void {
  const target = index + delta;
  if (target < 0 || target >= day.exercises.length) {
    toast("بیشتر از این نمی‌شود جابه‌جا کرد.", "info");
    return;
  }
  const [moved] = day.exercises.splice(index, 1);
  day.exercises.splice(target, 0, moved);
  persist(0);
  requestRender();
}

async function removeExercise(day: WorkoutDay, exercise: Exercise): Promise<void> {
  const confirmed = await confirmDialog({
    title: "حذف حرکت",
    message: `حرکت «${exercise.name}» از برنامه این روز حذف شود؟ این کار قابل بازگشت نیست.`,
    confirmText: "حذف کن",
    danger: true,
  });
  if (!confirmed) return;
  const index = day.exercises.findIndex((item) => item.id === exercise.id);
  if (index >= 0) day.exercises.splice(index, 1);
  persist(0);
  toast("حرکت حذف شد.", "info");
  requestRender();
}
