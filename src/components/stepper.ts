/**
 * Touch-first number input: `[−] ۱۲٫۵ [+]` with an optional quick-picker sheet.
 *
 * Typing numbers on a phone in the gym is painful, so the logger uses these
 * instead of `<input>` elements (no keyboard ever opens).
 */
import { btn, clamp, el, svgIcon } from "../lib/dom";
import { icons } from "../lib/icons";
import { faNum } from "../lib/fa";
import { openModal } from "./ui";

const defaultFormat = (value: number): string =>
  Number.isInteger(value) ? faNum(value, 0) : faNum(value, 1);

export interface StepperOptions {
  value: number;
  step: number;
  min?: number;
  max?: number;
  format?: (value: number) => string;
  onChange: (value: number) => void;
  /** Tapping the number opens a picker; receives the current value + a setter. */
  onOpenPicker?: (value: number, setValue: (value: number) => void) => void;
  ariaLabel?: string;
}

export interface StepperHandle {
  element: HTMLElement;
  get: () => number;
  set: (value: number) => void;
}

export function stepper(options: StepperOptions): StepperHandle {
  const format = options.format ?? defaultFormat;
  const min = options.min ?? 0;
  const max = options.max ?? 999;
  let value = clamp(options.value, min, max);

  const wrap = el(
    "div",
    "flex min-w-0 flex-1 items-center gap-0.5 rounded-xl border border-slate-700/60 bg-slate-950/60 p-0.5",
  );

  const display = btn(
    "min-w-0 flex-1 truncate rounded-lg px-1 py-1 text-center text-sm font-extrabold text-slate-100 transition active:bg-slate-800",
    format(value),
    () => options.onOpenPicker?.(value, set),
    { "aria-label": options.ariaLabel ?? "تغییر مقدار" },
  );

  const commit = (next: number) => {
    const clamped = clamp(Number(next.toFixed(2)), min, max);
    if (clamped === value) return;
    value = clamped;
    display.textContent = format(value);
    options.onChange(value);
  };

  const minus = btn(
    "flex h-8 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition active:scale-90 active:bg-slate-800",
    svgIcon(icons.minus, "h-3.5 w-3.5"),
    () => commit(value - options.step),
    { "aria-label": "کاهش" },
  );

  const plus = btn(
    "flex h-8 w-7 shrink-0 items-center justify-center rounded-lg text-emerald-300 transition active:scale-90 active:bg-slate-800",
    svgIcon(icons.plus, "h-3.5 w-3.5"),
    () => commit(value + options.step),
    { "aria-label": "افزایش" },
  );

  wrap.append(minus, display, plus);

  function set(next: number): void {
    value = clamp(Number(next.toFixed(2)), min, max);
    display.textContent = format(value);
  }

  return { element: wrap, get: () => value, set };
}

export interface PickerOptions {
  title: string;
  subtitle?: string;
  value: number;
  format: (value: number) => string;
  /** Quick ± steps shown under the big number. */
  deltas: number[];
  presets: number[];
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  /** "Apply to every set of this exercise". */
  onApplyAll?: (value: number) => void;
  applyAllLabel?: string;
  unit?: string;
}

/** Bottom-sheet picker: big number, ± steps, preset grid, apply-to-all. */
export function openValuePicker(options: PickerOptions): void {
  const min = options.min ?? 0;
  const max = options.max ?? 999;
  let value = clamp(options.value, min, max);

  const body = el("div", "space-y-4");

  const bigValue = el(
    "p",
    "text-center text-4xl font-black leading-none text-slate-50",
    options.format(value),
  );
  const bigWrap = el("div", "rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-4");
  bigWrap.append(bigValue);
  if (options.unit) {
    bigWrap.append(el("p", "mt-1 text-center text-[10px] text-slate-500", options.unit));
  }
  body.append(bigWrap);

  const apply = (next: number) => {
    value = clamp(Number(next.toFixed(2)), min, max);
    bigValue.textContent = options.format(value);
    options.onChange(value);
  };

  // ± quick steps
  const deltaRow = el("div", "flex flex-wrap gap-2");
  options.deltas.forEach((delta) => {
    deltaRow.append(
      btn(
        "btn-ghost flex-1 basis-[30%] py-2 text-xs font-bold",
        `\u200E${delta > 0 ? "+" : "−"}${options.format(Math.abs(delta))}`,
        () => apply(value + delta),
      ),
    );
  });
  body.append(deltaRow);

  // preset grid
  const grid = el("div", "grid grid-cols-4 gap-2");
  options.presets.forEach((preset) => {
    const chip = btn(
      `rounded-xl border px-2 py-2.5 text-sm font-bold transition active:scale-95 ${
        preset === value
          ? "border-emerald-400/70 bg-emerald-400/15 text-emerald-300"
          : "border-slate-800 bg-slate-900/70 text-slate-200"
      }`,
      options.format(preset),
      () => {
        apply(preset);
        grid.querySelectorAll("button").forEach((node) => {
          node.className =
            "rounded-xl border border-slate-800 bg-slate-900/70 px-2 py-2.5 text-sm font-bold text-slate-200 transition active:scale-95";
        });
        chip.className =
          "rounded-xl border border-emerald-400/70 bg-emerald-400/15 px-2 py-2.5 text-sm font-bold text-emerald-300 transition active:scale-95";
      },
    );
    grid.append(chip);
  });
  body.append(grid);

  if (options.onApplyAll) {
    body.append(
      btn(
        "btn-ghost w-full text-xs",
        options.applyAllLabel ?? "اعمال برای همه ست‌های این حرکت",
        () => {
          options.onApplyAll?.(value);
        },
      ),
    );
  }

  body.append(btn("btn-primary w-full", "تایید", () => handle.close()));

  const handle = openModal({
    title: options.title,
    subtitle: options.subtitle,
    body,
  });
}
