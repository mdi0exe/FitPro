/**
 * Double Progression — the "what next?" step for a single movement.
 *
 * The rule: work in a rep range (say 8–12). When every set reaches the top of
 * the range with clean form, add weight and drop the reps back to the bottom of
 * the range. Until then, add reps at the same weight. This is the cheapest way
 * to progress without a coach, and it is exactly the decision a student is
 * standing in front of the rack trying to make.
 *
 * The dialog appears once per exercise per session, right after the last set is
 * ticked, and only offers the three answers that actually exist.
 */
import { btn, el, escapeHtml } from "../lib/dom";
import { fa, faNum, faReps, firstNumber, isoToday } from "../lib/fa";
import { getState, persist, requestRender } from "../lib/store";
import type { Exercise } from "../types";
import { openModal, toast } from "./ui";

/** 2.5 kg is the smallest pair of plates in every university gym. */
const WEIGHT_STEP = 2.5;

const roundStep = (value: number): number => Math.round(value / WEIGHT_STEP) * WEIGHT_STEP;

/** `"۸-۱۲"` → `8`. Falls back to `1` when the prescription has no number. */
function bottomOfRange(reps: string): number {
  const value = firstNumber(reps);
  return value > 0 ? value : 1;
}

/** Adds one rep to every number in a rep prescription (`۸-۱۲` → `۹-۱۳`). */
function bumpRange(reps: string): string {
  let touched = false;
  const bumped = reps.replace(/\d+/g, (digits) => {
    touched = true;
    return String(Number.parseInt(digits, 10) + 1);
  });
  return touched ? bumped : reps;
}

/** Top completed set of today, used to describe what just happened. */
function topSet(exercise: Exercise): { weight: number; reps: number } | null {
  const done = exercise.logs.filter((log) => log.done);
  if (done.length === 0) return null;
  const best = done.reduce(
    (acc, log) => (log.weight * log.reps > acc.weight * acc.reps ? log : acc),
    done[0],
  );
  return { weight: best.weight, reps: best.reps };
}

function logMilestone(text: string): void {
  const state = getState();
  state.milestones.unshift({
    id: `ms-${Date.now()}-dp`,
    date: isoToday(),
    text,
    kind: "overload",
  });
  state.milestones = state.milestones.slice(0, 60);
}

/**
 * Applies one progression choice to the *prescription* (target weight and rep
 * range), never to today's ticked sets — the workout is already done, and
 * rewriting it would misreport what was lifted.
 */
function applyChoice(exercise: Exercise, choice: "weight" | "rep" | "hold"): void {
  const bodyweight = exercise.bodyweight || exercise.targetWeight <= 0;
  const range = exercise.reps;

  if (choice === "weight" && !bodyweight) {
    exercise.targetWeight = roundStep(exercise.targetWeight + WEIGHT_STEP);
    // Drop the reps back to the bottom of the range: that is the second half of
    // double progression, and it is what makes the new weight survivable.
    exercise.reps = String(bottomOfRange(range));
    logMilestone(
      `${exercise.name}: وزنه به ${faNum(exercise.targetWeight, 1)} کیلوگرم رفت و تکرارها از ${fa(bottomOfRange(range))} شروع می‌شود.`,
    );
    toast(`${exercise.name}: ${faNum(exercise.targetWeight, 1)} کیلو × ${fa(bottomOfRange(range))} تکرار برای جلسه بعد.`);
  } else if (choice === "weight") {
    // Bodyweight movements progress by reps only.
    exercise.reps = bumpRange(range);
    logMilestone(`${exercise.name}: دامنه تکرارها به ${faReps(exercise.reps)} رفت.`);
    toast(`${exercise.name}: دامنه تکرارها به ${faReps(exercise.reps)} رفت.`);
  } else if (choice === "rep") {
    exercise.reps = bumpRange(range);
    logMilestone(`${exercise.name}: یک تکرار به دامنه اضافه شد (${faReps(exercise.reps)}).`);
    toast(`${exercise.name}: دامنه تکرارها ${faReps(exercise.reps)} شد.`);
  } else {
    toast("همان وزن و تکرارها برای جلسه بعد حفظ شد.", "info");
  }

  persist(0);
  requestRender();
}

/**
 * Opens the chooser. `suggestWeight` is `true` when every set already reached
 * the top of the rep range, which is the signal to add plates.
 */
export function openDoubleProgressionModal(exercise: Exercise, suggestWeight: boolean): void {
  const top = topSet(exercise);
  const bodyweight = exercise.bodyweight || exercise.targetWeight <= 0;
  const range = exercise.reps;
  const nextWeight = roundStep(exercise.targetWeight + WEIGHT_STEP);

  const body = el("div", "space-y-3");
  body.append(
    el(
      "p",
      "text-[11px] leading-6 text-slate-400",
      `«${escapeHtml(exercise.name)}» تمام شد. قدم بعدی را انتخاب کن؛ فقط برنامه جلسه بعد عوض می‌شود و ست‌های امروز دست‌نخورده می‌مانند.`,
    ),
  );

  if (top) {
    const summary = el("div", "rounded-2xl border border-emerald-500/25 bg-emerald-500/5 px-3 py-2.5 text-center");
    summary.append(
      el("p", "text-sm font-extrabold text-emerald-300", `${faNum(top.weight, 1)} کیلو × ${fa(top.reps)} تکرار`),
      el("p", "mt-0.5 text-[10px] text-emerald-100/60", "بهترین ست امروز"),
    );
    body.append(summary);
  }

  const options: Array<{
    id: "weight" | "rep" | "hold";
    title: string;
    hint: string;
    tone: string;
  }> = [
    {
      id: "weight",
      title: bodyweight
        ? `دامنه تکرارها: ${faReps(bumpRange(range))}`
        : `${faNum(nextWeight, 1)} کیلوگرم × ${fa(bottomOfRange(range))} تکرار`,
      hint: bodyweight
        ? "حرکت وزن بدن است؛ پیشرفت با تکرار انجام می‌شود."
        : `‎+${faNum(WEIGHT_STEP, 1)} کیلو و برگشت تکرارها به کف دامنه (${fa(bottomOfRange(range))}).`,
      tone: suggestWeight ? "border-emerald-400 bg-emerald-500/15" : "border-slate-800 bg-slate-950/50",
    },
    {
      id: "rep",
      title: `دامنه تکرارها: ${faReps(bumpRange(range))}`,
      hint: "همان وزن، یک تکرار بیشتر در همه ست‌ها.",
      tone: "border-slate-800 bg-slate-950/50",
    },
    {
      id: "hold",
      title: "همین بار بماند",
      hint: "وقتی فرم یا خواب و تغذیه هنوز آماده نیست.",
      tone: "border-slate-800 bg-slate-950/50",
    },
  ];

  const list = el("div", "space-y-1.5");
  options.forEach((option, index) => {
    const card = btn(
      `flex w-full flex-col items-start rounded-2xl border p-2.5 text-right transition active:scale-[0.99] ${option.tone}`,
      `<span class="text-[11px] font-extrabold text-slate-100">${escapeHtml(option.title)}</span>
       <span class="mt-0.5 text-[10px] leading-5 text-slate-400">${escapeHtml(option.hint)}</span>`,
      () => {
        applyChoice(exercise, option.id);
        handle.close();
      },
      { "aria-label": `انتخاب گزینه ${index + 1}` },
    );
    if (suggestWeight && index === 0) {
      card.append(el("span", "mt-1 text-[9px] font-bold text-emerald-300", "پیشنهاد امروز"));
    }
    list.append(card);
  });
  body.append(list);

  const handle = openModal({
    title: "پله بعدی این حرکت",
    subtitle: "افزایش تدریجی دو مرحله‌ای",
    body,
    footer: btn("btn-ghost w-full", "بعداً", () => handle.close()),
  });
}

/**
 * True when every set of the exercise reached the top of its rep range, which
 * is the moment double progression says "add weight".
 */
export function reachedTopOfRange(exercise: Exercise): boolean {
  const top = firstNumber(exercise.reps.split(/[-–—]/).pop() ?? exercise.reps) || firstNumber(exercise.reps);
  if (top <= 0) return false;
  const done = exercise.logs.filter((log) => log.done);
  if (done.length === 0) return false;
  return done.every((log) => log.reps >= top);
}
