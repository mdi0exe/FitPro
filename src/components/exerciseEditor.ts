/** Add / edit exercise form — steppers + presets, no typing for numbers. */
import { btn, el, escapeHtml } from "../lib/dom";
import { en, fa, faNum, faReps } from "../lib/fa";
import type { Exercise } from "../types";
import { catalogPicker } from "./exerciseCatalogPicker";
import { openValuePicker, stepper } from "./stepper";
import { openModal, toast } from "./ui";

export interface ExerciseDraft {
  name: string;
  sets: number;
  reps: string;
  targetWeight: number;
  tip: string;
  query: string;
  gifUrl: string | null;
}

const REP_PRESETS = ["6-8", "8-10", "10-12", "12-15", "15-20", "حداکثر توان"];
const SET_PRESETS = [2, 3, 4, 5];
const WEIGHT_PRESETS = [0, 5, 10, 12.5, 15, 20, 25, 30, 40, 50, 60];

/** Equal-width chip grid that keeps the selected value highlighted. */
function chipGrid<T>(options: {
  values: T[];
  label: (value: T) => string;
  isActive: (value: T) => boolean;
  onPick: (value: T) => void;
}): { element: HTMLElement; paint: () => void } {
  const row = el("div", "flex flex-wrap gap-2");
  const buttons: HTMLButtonElement[] = [];

  const paint = () => {
    buttons.forEach((button, index) => {
      const active = options.isActive(options.values[index]);
      button.className = `flex-1 basis-[28%] rounded-xl border px-2 py-2 text-xs font-bold transition active:scale-95 ${
        active
          ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-300"
          : "border-slate-800 bg-slate-900/60 text-slate-300"
      }`;
    });
  };

  options.values.forEach((value, index) => {
    const button = btn("", options.label(value), () => {
      options.onPick(value);
      paint();
    });
    buttons[index] = button;
    row.append(button);
  });

  paint();
  return { element: row, paint };
}

export function openExerciseEditor(options: {
  mode: "add" | "edit";
  initial?: Exercise;
  onSubmit: (draft: ExerciseDraft) => void;
}): void {
  const initial = options.initial;

  let sets = initial?.sets ?? 3;
  let reps = initial?.reps ?? "8-10";
  let targetWeight = initial?.targetWeight ?? 0;

  const body = el("form", "space-y-4");
  body.addEventListener("submit", (event) => event.preventDefault());

  const field = (label: string, hint?: string): HTMLElement => {
    const wrap = el("div", "space-y-1");
    wrap.append(el("label", "label", escapeHtml(label)));
    if (hint) wrap.append(el("p", "text-[10px] leading-5 text-slate-500", escapeHtml(hint)));
    return wrap;
  };

  // ------------------------------------------------------------------ name
  const nameInput = el("input", "field text-right");
  nameInput.type = "text";
  nameInput.placeholder = "مثلاً: پرس بالا سینه دمبل";
  nameInput.value = initial?.name ?? "";
  const nameField = field("نام حرکت");
  nameField.append(nameInput);

  // ------------------------------------------------------------------ sets
  const setsStepper = stepper({
    value: sets,
    step: 1,
    min: 1,
    max: 12,
    ariaLabel: "تعداد ست",
    onChange: (value) => {
      sets = value;
      setsChips.paint();
    },
  });
  const setsChips = chipGrid<number>({
    values: SET_PRESETS,
    label: (value) => `${fa(value)} ست`,
    isActive: (value) => value === sets,
    onPick: (value) => {
      sets = value;
      setsStepper.set(value);
    },
  });
  const setsField = field("تعداد ست");
  setsField.append(setsStepper.element, el("div", "mt-2"), setsChips.element);

  // ------------------------------------------------------------------ reps
  const repsInput = el("input", "field text-center");
  repsInput.type = "text";
  repsInput.placeholder = "8-10";
  repsInput.value = reps;
  repsInput.addEventListener("input", () => {
    reps = repsInput.value;
    repsChips.paint();
  });

  const repsChips = chipGrid<string>({
    values: REP_PRESETS,
    label: (value) => (value === "حداکثر توان" ? value : faReps(value)),
    isActive: (value) => value === reps,
    onPick: (value) => {
      reps = value;
      repsInput.value = value;
    },
  });

  const repsField = field("تکرار هدف", "یکی از گزینه‌ها را بزن یا برای بازه دلخواه دستی بنویس.");
  repsField.append(repsChips.element, el("div", "mt-2"), repsInput);

  // ---------------------------------------------------------------- weight
  const weightStepper = stepper({
    value: targetWeight,
    step: 2.5,
    min: 0,
    max: 400,
    format: (value) => faNum(value, 1),
    ariaLabel: "وزنه کاری",
    onChange: (value) => {
      targetWeight = value;
      weightChips.paint();
    },
    onOpenPicker: (current, setValue) =>
      openValuePicker({
        title: "وزنه کاری",
        subtitle: "وزنه‌ای که با آن تمرین می‌کنی",
        value: current,
        unit: "کیلوگرم",
        format: (value) => faNum(value, 1),
        deltas: [-5, -2.5, 2.5, 5],
        presets: [0, 2.5, 5, 7.5, 10, 12.5, 15, 20, 25, 30, 40, 50, 60, 70, 80, 100],
        onChange: (value) => {
          targetWeight = value;
          setValue(value);
          weightChips.paint();
        },
      }),
  });
  const weightChips = chipGrid<number>({
    values: WEIGHT_PRESETS,
    label: (value) => (value === 0 ? "وزن بدن" : faNum(value, 1)),
    isActive: (value) => value === targetWeight,
    onPick: (value) => {
      targetWeight = value;
      weightStepper.set(value);
    },
  });
  const weightField = field("وزنه کاری (کیلوگرم)", "صفر بگذارید اگر حرکت با وزن بدن است.");
  weightField.append(weightStepper.element, el("div", "mt-2"), weightChips.element);

  // ------------------------------------------------------------ tip / gif
  const tipInput = el("textarea", "field min-h-[72px] resize-none text-right text-sm leading-7");
  tipInput.placeholder = "نکته مربی برای اجرای صحیح…";
  tipInput.value = initial?.tip ?? "";
  const tipField = field("نکته اجرای حرکت");
  tipField.append(tipInput);

  const queryInput = el("input", "field text-left font-mono text-xs");
  queryInput.type = "text";
  queryInput.dir = "ltr";
  queryInput.placeholder = "Incline Dumbbell Press gif";
  queryInput.value = initial?.query ?? "";
  const queryField = field("عبارت جستجوی گیف", "برای پیدا کردن گیف متحرک در گوگل استفاده می‌شود.");
  queryField.append(queryInput);

  const gifInput = el("input", "field text-left font-mono text-xs");
  gifInput.type = "url";
  gifInput.dir = "ltr";
  gifInput.placeholder = "https://…/move.gif";
  gifInput.value = initial?.gifUrl ?? "";
  const gifField = field("لینک مستقیم گیف (اختیاری)");
  gifField.append(gifInput);

  // -------------------------------------------------------- library picker
  // Inserted before the name field so the obvious first action is "pick a
  // movement" — tapping one fills the name, the GIF and the search phrase.
  const catalog = catalogPicker({
    onPick: (item) => {
      nameInput.value = item.name;
      gifInput.value = item.gif;
      queryInput.value = `${item.english} gif`;
      if (!tipInput.value.trim()) tipInput.value = item.muscle;
      nameInput.focus();
    },
  });
  const catalogField = field(
    "کتابخانه حرکات",
    "حرکت را از کتابخانه انتخاب کن تا گیف و نامش خودکار پر شود.",
  );
  catalogField.append(catalog.element);

  body.append(
    catalogField,
    nameField,
    setsField,
    repsField,
    weightField,
    tipField,
    queryField,
    gifField,
  );

  const submit = () => {
    const name = nameInput.value.trim();
    if (!name) {
      toast("نام حرکت را وارد کنید.", "error");
      nameInput.focus();
      return;
    }

    const gifUrl = gifInput.value.trim();
    // Bundled demos are app paths (`/gifs/d1e1.svg`); custom links must be http(s).
    if (gifUrl && !/^(https?:\/\/|\/)/i.test(gifUrl)) {
      toast("لینک تصویر باید با http یا https شروع شود.", "error");
      return;
    }

    options.onSubmit({
      name,
      sets: Math.min(12, Math.max(1, Math.round(sets))),
      reps: en(repsInput.value.trim()) || "8-10",
      targetWeight: Math.max(0, targetWeight),
      tip: tipInput.value.trim(),
      query: queryInput.value.trim() || `${name} gif`,
      gifUrl: gifUrl || null,
    });
    handle.close();
  };

  const footer = el("div", "grid grid-cols-2 gap-2");
  footer.append(
    btn("btn-primary", options.mode === "add" ? "افزودن حرکت" : "ذخیره تغییرات", submit),
    btn("btn-ghost", "انصراف", () => handle.close()),
  );

  const handle = openModal({
    title: options.mode === "add" ? "افزودن حرکت جدید" : "ویرایش حرکت",
    subtitle: "ست، تکرار، وزنه و نکته مربی را می‌توانی هر زمان تغییر دهی",
    body,
    footer,
  });
}
