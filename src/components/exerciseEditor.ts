/** Add / edit exercise form. */
import { btn, el, escapeHtml } from "../lib/dom";
import { en, fa, faNum, parseNum } from "../lib/fa";
import type { Exercise } from "../types";
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

export function openExerciseEditor(options: {
  mode: "add" | "edit";
  initial?: Exercise;
  onSubmit: (draft: ExerciseDraft) => void;
}): void {
  const initial = options.initial;
  const body = el("form", "space-y-3");
  body.addEventListener("submit", (event) => event.preventDefault());

  const field = (label: string, hint?: string) => {
    const wrap = el("div", "space-y-1");
    wrap.append(el("label", "label", escapeHtml(label)));
    if (hint) wrap.append(el("p", "text-[10px] leading-5 text-slate-500", escapeHtml(hint)));
    return wrap;
  };

  const nameInput = el("input", "field text-right");
  nameInput.type = "text";
  nameInput.placeholder = "مثلاً: پرس بالا سینه دمبل";
  nameInput.value = initial?.name ?? "";
  const nameField = field("نام حرکت");
  nameField.append(nameInput);

  const setsInput = el("input", "field");
  setsInput.type = "text";
  setsInput.inputMode = "numeric";
  setsInput.autocomplete = "off";
  setsInput.value = fa(initial?.sets ?? 3);
  const setsField = field("تعداد ست");
  setsField.append(setsInput);

  const repsInput = el("input", "field");
  repsInput.type = "text";
  repsInput.placeholder = "8-10";
  repsInput.value = initial?.reps ?? "8-10";
  const repsField = field("تکرار هدف");
  repsField.append(repsInput);

  const weightInput = el("input", "field");
  weightInput.type = "text";
  weightInput.inputMode = "decimal";
  weightInput.autocomplete = "off";
  weightInput.value = faNum(initial?.targetWeight ?? 0, 1);
  const weightField = field("وزنه کاری (کیلوگرم)", "صفر بگذارید اگر حرکت با وزن بدن است.");
  weightField.append(weightInput);

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

  const grid = el("div", "grid grid-cols-3 gap-2");
  grid.append(setsField, repsField, weightField);

  body.append(nameField, grid, tipField, queryField, gifField);

  const submit = () => {
    const name = nameInput.value.trim();
    if (!name) {
      toast("نام حرکت را وارد کنید.", "error");
      nameInput.focus();
      return;
    }
    const sets = Math.min(12, Math.max(1, Math.round(parseNum(setsInput.value)) || 3));
    const targetWeight = Math.max(0, parseNum(weightInput.value));
    const gifUrl = gifInput.value.trim();
    if (gifUrl && !/^https?:\/\//i.test(gifUrl)) {
      toast("لینک گیف باید با http یا https شروع شود.", "error");
      return;
    }

    options.onSubmit({
      name,
      sets,
      reps: en(repsInput.value.trim()) || "8-10",
      targetWeight,
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
