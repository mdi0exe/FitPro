/**
 * Ideal-weight calculator.
 *
 * A single "ideal weight" number is a lie, so the card offers two honest
 * targets instead of one:
 *
 *   استاندارد → BMI 22   (middle of the healthy 18.5–24.9 band)
 *   ورزشکار  → BMI 23.4 (the upper end of "healthy" for a lifter, where the
 *                        extra kilos are muscle, not fat)
 *
 * Height is adjustable in place, and one tap writes the result into
 * `profile.targetWeight` so the weight logger and the hero bar pick it up.
 */
import { btn, el } from "../lib/dom";
import { faNum } from "../lib/fa";
import { getState, persist, requestRender } from "../lib/store";
import { openValuePicker, stepper } from "../components/stepper";
import { sectionTitle, toast } from "../components/ui";

/** BMI used for each build. */
export const IDEAL_BMI = { standard: 22, athletic: 23.4 } as const;
/** Healthy band from the WHO table, used for the "range" line. */
const HEALTHY_BMI = { min: 18.5, max: 24.9 };

export type BuildType = keyof typeof IDEAL_BMI;

/** `idealWeight(178, "athletic")` → `74.1` */
export function idealWeight(heightCm: number, build: BuildType = "standard"): number {
  const meters = Math.max(1, heightCm) / 100;
  return Math.round(IDEAL_BMI[build] * meters * meters * 10) / 10;
}

/** Healthy weight range for a height, rounded to 0.1 kg. */
export function healthyRange(heightCm: number): { min: number; max: number } {
  const meters = Math.max(1, heightCm) / 100;
  const round = (value: number) => Math.round(value * 10) / 10;
  return {
    min: round(HEALTHY_BMI.min * meters * meters),
    max: round(HEALTHY_BMI.max * meters * meters),
  };
}

export interface IdealWeightOptions {
  /** Hides the closing footnote (the onboarding wizard is already long). */
  compact?: boolean;
  /** Height to start from — the wizard passes its unsaved draft. */
  height?: number;
  /** Keeps an outer draft in sync when the height changes. */
  onHeightChange?: (heightCm: number) => void;
  /** Current weight to compare against — the wizard passes its draft. */
  currentWeight?: number;
  /** Replaces the default "write to profile.targetWeight" behaviour. */
  onApply?: (target: number) => void;
}

export function idealWeightCalculatorCard(options: IdealWeightOptions = {}): HTMLElement {
  const state = getState();

  let heightCm = Math.min(
    230,
    Math.max(120, Math.round(options.height ?? state.profile.heightCm ?? 175)),
  );
  let build: BuildType = "standard";

  const card = el("div", "card space-y-3");
  card.setAttribute("data-ideal-weight", "card");
  const heightChip = el("span", "chip chip-cyan", `${faNum(heightCm, 0)} سانتی‌متر`);
  card.append(sectionTitle("⚖️ وزن ایده‌آل من", heightChip));

  // ------------------------------------------------------------------ height
  const heightStepper = stepper({
    value: heightCm,
    step: 1,
    min: 120,
    max: 230,
    ariaLabel: "قد",
    format: (value) => `${faNum(value, 0)}`,
    onChange: (value) => {
      heightCm = value;
      options.onHeightChange?.(value);
      paint();
    },
    onOpenPicker: (current, setValue) =>
      openValuePicker({
        title: "قد",
        subtitle: "قد بدون کفش",
        value: current,
        unit: "سانتی‌متر",
        format: (value) => faNum(value, 0),
        deltas: [-5, -1, 1, 5],
        presets: [150, 155, 160, 165, 170, 175, 180, 185, 190, 195],
        onChange: (value) => {
          heightCm = value;
          options.onHeightChange?.(value);
          setValue(value);
          paint();
        },
      }),
  });
  const heightRow = el("div", "flex items-center gap-2");
  heightRow.append(
    el("span", "shrink-0 text-[11px] font-bold text-slate-400", "قد"),
    heightStepper.element,
  );

  // ------------------------------------------------------------------- build
  const buildRow = el("div", "grid grid-cols-2 gap-1.5");
  const buildButtons: HTMLButtonElement[] = [];
  const builds: { key: BuildType; label: string; hint: string }[] = [
    { key: "standard", label: "استاندارد", hint: "BMI ۲۲" },
    { key: "athletic", label: "ورزشکار", hint: "BMI ۲۳٫۴" },
  ];

  builds.forEach((item, index) => {
    const button = btn("", "", () => {
      build = item.key;
      paint();
    });
    buildButtons[index] = button;
    buildRow.append(button);
  });

  // ------------------------------------------------------------------ result
  const value = el("p", "text-3xl font-black text-emerald-300");
  value.setAttribute("data-ideal-value", "1");
  const unit = el("span", "mr-1 text-xs font-bold text-slate-400", "کیلوگرم");
  const formula = el("p", "mt-0.5 text-[10px] text-slate-500");
  const range = el("p", "text-[10px] leading-5 text-slate-400");
  const delta = el("p", "text-[10px] leading-5 text-amber-300");
  const resultBox = el("div", "rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-3 text-center");
  const valueRow = el("div", "flex items-end justify-center gap-1");
  valueRow.append(value, unit);
  resultBox.append(valueRow, formula, range, delta);

  // ------------------------------------------------------------------- apply
  const applyBtn = btn("btn-primary w-full text-xs", "🎯 همین را هدف بگذار", () => {
    const target = idealWeight(heightCm, build);
    if (options.onApply) {
      options.onApply(target);
      toast(`وزن هدف روی ${faNum(target, 1)} کیلو تنظیم شد 🎯`);
      return;
    }
    const current = getState();
    current.profile.heightCm = heightCm;
    current.profile.targetWeight = target;
    persist(0);
    toast(`وزن هدف روی ${faNum(target, 1)} کیلو تنظیم شد 🎯`);
    requestRender();
  });

  card.append(heightRow, buildRow, resultBox, applyBtn);
  if (!options.compact) {
    card.append(
      el(
        "p",
        "text-[10px] leading-5 text-slate-500",
        "این عدد یک محدوده است، نه یک قانون: اگر تمرین قدرتی می‌کنی، وزن بالاتر از این هم سالم است.",
      ),
    );
  }

  const paint = () => {
    buildButtons.forEach((button, index) => {
      const active = builds[index].key === build;
      button.className = `rounded-xl border px-2 py-2 text-xs font-bold transition active:scale-95 ${
        active
          ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-300"
          : "border-slate-800 bg-slate-900/60 text-slate-300"
      }`;
      button.innerHTML = `${builds[index].label}<span class="mt-0.5 block text-[9px] font-normal opacity-70">${builds[index].hint}</span>`;
    });

    const ideal = idealWeight(heightCm, build);
    const { min, max } = healthyRange(heightCm);
    const currentWeight = options.currentWeight ?? getState().profile.currentWeight;
    const diff = ideal - currentWeight;

    value.textContent = faNum(ideal, 1);
    heightChip.textContent = `${faNum(heightCm, 0)} سانتی‌متر`;
    formula.textContent =
      build === "athletic"
        ? `شاخص توده بدنی ${faNum(IDEAL_BMI.athletic, 1)} — مناسب بدنسازها`
        : `شاخص توده بدنی ${faNum(IDEAL_BMI.standard, 1)} — میانه بازه سالم`;
    range.textContent = `بازه سالم برای این قد: ${faNum(min, 1)} تا ${faNum(max, 1)} کیلوگرم`;
    delta.textContent =
      Math.abs(diff) < 0.6
        ? "الان روی همین وزنی ✅"
        : diff > 0
          ? `${faNum(Math.abs(diff), 1)} کیلو باید اضافه کنی`
          : `${faNum(Math.abs(diff), 1)} کیلو باید کم کنی`;
  };

  paint();
  return card;
}
