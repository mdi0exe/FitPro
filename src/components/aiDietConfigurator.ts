/**
 * AI diet & coach configurator.
 *
 * The app cannot ship a nutrition plan that fits every student, and a hardcoded
 * "eat 3 cafeteria meals" table stops being true the moment someone changes
 * campus, budget or goal. So the numbers come from an AI the user already has
 * (ChatGPT, Gemini, Claude…), and the app only does what it is good at:
 * building a precise prompt from the real profile, then validating and applying
 * the JSON that comes back.
 *
 * Flow: «ساخت پرامپت» → copy → paste into any chat → «اعمال» with the reply.
 * Nothing leaves the device: the prompt is copied, never uploaded.
 */
import { waterRow } from "../data/dietTemplates";
import { copyText, readClipboardText } from "../lib/clipboard";
import { btn, el } from "../lib/dom";
import { faNum, parseFaFloat } from "../lib/fa";
import { getState, persist, requestRender, syncWaterChecklist } from "../lib/store";
import type { CoachRule, DietItem, MealRow } from "../types";
import { openModal, toast } from "./ui";

/** Upper bounds keep a bad paste from bloating `gym_state.json`. */
const LIMITS = {
  calories: [1200, 5000],
  protein: [60, 320],
  meals: 10,
  checklist: 12,
  rules: 4,
  points: 6,
} as const;

const round = (value: number): number => Math.round(value);

function clampNumber(value: unknown, min: number, max: number): number | null {
  const raw =
    typeof value === "number" ? value : parseFaFloat(typeof value === "string" ? value : null, Number.NaN);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return round(Math.min(max, Math.max(min, raw)));
}

function cleanText(value: unknown, maxChars = 160): string {
  return typeof value === "string" ? value.trim().slice(0, maxChars) : "";
}

/** The exact prompt the user pastes into their AI chat. */
export function buildDietPrompt(): string {
  const state = getState();
  const { profile } = state;
  const cutting = profile.targetWeight < profile.currentWeight;
  const direction = cutting ? "کاهش چربی با حفظ عضله" : "افزایش وزن و عضله";

  const foods = state.diet.items.map((item) => `- ${item.text}`).join("\n");

  return `تو یک متخصص تغذیه ورزشی و مربی بدنسازی هستی. برای من یک برنامه غذایی روزانه و قواعد مربی طراحی کن.

## مشخصات من
- سن: ${faNum(profile.age, 0)} سال
- قد: ${faNum(profile.heightCm, 0)} سانتی‌متر
- وزن فعلی: ${faNum(profile.currentWeight, 1)} کیلوگرم
- وزن شروع: ${faNum(profile.startWeight, 1)} کیلوگرم
- وزن هدف: ${faNum(profile.targetWeight, 1)} کیلوگرم
- جهت برنامه: ${direction}
- هدف اعلام‌شده: ${profile.goal}
- ساعت تمرین فعلی: ${profile.trainingWindow}
- بودجه و دسترسی: غذای سلف دانشگاه + خرید ساده و ارزان سوپرمارکت؛ بدون مکمل گران.

## غذاهایی که در دسترس من است
${foods || "- (چیزی ثبت نشده)"}

## خروجی
فقط و فقط یک شیء JSON معتبر برگردان؛ بدون توضیح، بدون بلوک کد، بدون متن اضافه. دقیقاً با این کلیدها:
{
  "calories": 2600,
  "protein": 150,
  "trainingWindow": "۱٫۵ ساعت قبل از شام سلف",
  "meals": [{ "name": "ناهار سلف: چلو مرغ کامل", "kcal": 900, "protein": 42 }],
  "checklist": [{ "text": "کارهایی که امروز باید انجام دهم", "hint": "یک جمله کوتاه دلیل یا مقدار" }],
  "coachRules": [{ "title": "عنوان قاعده", "headline": "خلاصه یک‌خطی", "points": ["نکته اول", "نکته دوم"] }]
}

## محدودیت‌ها
- "calories" عددی بین ۱۲۰۰ تا ۵۰۰۰ (کالری روزانه).
- "protein" عددی بین ۶۰ تا ۳۲۰ (گرم پروتئین روزانه).
- "meals" بین ۳ تا ۸ ردیف؛ جمع کالری‌ها نزدیک به "calories" باشد.
- "checklist" بین ۳ تا ۸ مورد؛ هر مورد کاری که واقعاً می‌توانم انجام دهم (نه توصیه کلی).
- "coachRules" بین ۱ تا ۳ قاعده، هر کدام حداکثر ۴ نکته.
- همه متن‌ها فارسی و کوتاه باشند.`;
}

/** Normalises whatever the AI returned into the exact shape the app stores. */
interface ParsedPlan {
  calories: number | null;
  protein: number | null;
  trainingWindow: string;
  meals: MealRow[];
  checklist: Array<{ text: string; hint: string }>;
  coachRules: CoachRule[];
}

function parsePlan(raw: string): ParsedPlan | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    // Models love wrapping JSON in a ```json fence; retry on the inner object.
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      parsed = JSON.parse(raw.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const data = parsed as Record<string, unknown>;

  const meals: MealRow[] = Array.isArray(data.meals)
    ? data.meals
        .slice(0, LIMITS.meals)
        .map((row) => {
          const entry = (row ?? {}) as Record<string, unknown>;
          const name = cleanText(entry.name, 80);
          if (!name) return null;
          return {
            name,
            kcal: clampNumber(entry.kcal, 0, 3000) ?? 0,
            protein: clampNumber(entry.protein, 0, 200) ?? 0,
          };
        })
        .filter((row): row is MealRow => row !== null)
    : [];

  const checklist = Array.isArray(data.checklist)
    ? data.checklist
        .slice(0, LIMITS.checklist)
        .map((row) => {
          const entry = (row ?? {}) as Record<string, unknown>;
          const text = cleanText(entry.text, 160);
          if (!text) return null;
          return { text, hint: cleanText(entry.hint, 120) || "برنامه هوش مصنوعی" };
        })
        .filter((row): row is { text: string; hint: string } => row !== null)
    : [];

  const coachRules: CoachRule[] = Array.isArray(data.coachRules)
    ? data.coachRules
        .slice(0, LIMITS.rules)
        .map((row) => {
          const entry = (row ?? {}) as Record<string, unknown>;
          const title = cleanText(entry.title, 60);
          const headline = cleanText(entry.headline, 120);
          const points = Array.isArray(entry.points)
            ? entry.points
                .slice(0, LIMITS.points)
                .map((point) => cleanText(point, 220))
                .filter(Boolean)
            : [];
          if (!title || points.length === 0) return null;
          return { title, headline: headline || title, points };
        })
        .filter((rule): rule is CoachRule => rule !== null)
    : [];

  return {
    calories: clampNumber(data.calories, LIMITS.calories[0], LIMITS.calories[1]),
    protein: clampNumber(data.protein, LIMITS.protein[0], LIMITS.protein[1]),
    trainingWindow: cleanText(data.trainingWindow, 80),
    meals,
    checklist,
    coachRules,
  };
}

/**
 * Applies an AI reply. Returns a short Persian status so the caller can show it
 * without duplicating the validation messages.
 */
export function applyAiDietJson(raw: string): { ok: boolean; message: string } {
  const plan = parsePlan(raw);
  if (!plan) return { ok: false, message: "JSON معتبر نبود؛ کل پاسخ هوش مصنوعی را کپی کن." };

  const applied: string[] = [];
  const state = getState();

  if (plan.calories !== null) {
    state.diet.customCalories = plan.calories;
    applied.push("کالری");
  }
  if (plan.protein !== null) {
    state.diet.customProtein = plan.protein;
    applied.push("پروتئین");
  }
  if (plan.trainingWindow) {
    state.profile.trainingWindow = plan.trainingWindow;
    applied.push("ساعت تمرین");
  }
  if (plan.meals.length > 0) {
    state.diet.mealTable = plan.meals;
    applied.push("جدول وعده‌ها");
  }
  if (plan.checklist.length > 0) {
    // The `diet-4` water row drives the glass counter, so it is re-appended and
    // keeps its tick instead of disappearing with the old checklist.
    const water: DietItem = state.diet.items.find((item) => item.id === "diet-4") ?? waterRow();
    const isWaterRow = (text: string) =>
      /(۸\s*لیوان|نوشیدن\s*۸|آب\s*کافی\s*روزانه)/.test(text);
    state.diet.items = [
      ...plan.checklist
        .filter((entry) => !isWaterRow(entry.text))
        .map((entry, index) => ({
          id: `ai-${index + 1}`,
          text: entry.text,
          hint: entry.hint,
          done: false,
        })),
      water,
    ];
    syncWaterChecklist();
    applied.push("چک‌لیست");
  }
  if (plan.coachRules.length > 0) {
    state.diet.coachRules = plan.coachRules;
    applied.push("قواعد مربی");
  }

  if (applied.length === 0) {
    return { ok: false, message: "در این JSON هیچ کلید شناخته‌شده‌ای نبود." };
  }

  persist(0);
  return { ok: true, message: `اعمال شد: ${applied.join("، ")}` };
}

/** True when an AI plan is already stored (drives the card badge). */
export function hasAiDietPlan(): boolean {
  const diet = getState().diet;
  return Boolean(
    diet.customCalories ||
      diet.customProtein ||
      (diet.mealTable?.length ?? 0) > 0 ||
      (diet.coachRules?.length ?? 0) > 0,
  );
}

/** The two-step modal: copy the prompt, then paste the reply back. */
export function openAiDietConfigurator(): void {
  const body = el("div", "space-y-3");
  const prompt = buildDietPrompt();

  body.append(
    el(
      "p",
      "text-[11px] leading-6 text-slate-400",
      "۱) پرامپت را کپی کن و در چت هوش مصنوعی بفرست. ۲) پاسخ JSON را پایین بچسبان و اعمال کن. هیچ اطلاعاتی از گوشی خارج نمی‌شود.",
    ),
  );

  const promptBox = el("textarea", "field h-28 w-full resize-none text-left text-[10px] leading-5");
  promptBox.value = prompt;
  promptBox.readOnly = true;
  promptBox.setAttribute("dir", "rtl");
  body.append(promptBox);

  const copyBtn = btn(
    "btn-ghost w-full py-2 text-[11px]",
    "کپی پرامپت",
    () => {
      void copyText(prompt).then((ok) => {
        toast(ok ? "پرامپت کپی شد؛ در چت هوش مصنوعی بچسبان." : "کپی نشد؛ متن را دستی انتخاب کن.");
        if (!ok) promptBox.select();
      });
    },
    { "aria-label": "کپی پرامپت هوش مصنوعی" },
  );
  body.append(copyBtn);

  const answerBox = el("textarea", "field h-32 w-full resize-none text-left text-[10px] leading-5");
  answerBox.setAttribute("dir", "ltr");
  answerBox.placeholder = '{ "calories": 2600, "protein": 150, "meals": [], "checklist": [], "coachRules": [] }';
  body.append(
    el("p", "text-[10px] font-bold text-slate-300", "پاسخ JSON هوش مصنوعی"),
    answerBox,
  );

  const pasteBtn = btn(
    "btn-ghost w-full py-2 text-[11px]",
    "چسباندن از کلیپ‌بورد",
    () => {
      void readClipboardText().then((text) => {
        if (!text.trim()) {
          toast("دسترسی کلیپ‌بورد در دسترس نیست یا خالی است؛ پاسخ را دستی بچسبان.", "info");
          return;
        }
        answerBox.value = text;
      });
    },
    { "aria-label": "چسباندن پاسخ از کلیپ‌بورد" },
  );
  body.append(pasteBtn);

  const footer = el("div", "grid grid-cols-2 gap-2");
  const handle = openModal({
    title: "ساخت برنامه تغذیه با هوش مصنوعی",
    subtitle: "پرامپت آماده + وارد کردن پاسخ",
    body,
    footer,
  });
  footer.append(
    btn(
      "btn-primary",
      "اعمال برنامه",
      () => {
        const result = applyAiDietJson(answerBox.value);
        toast(result.message, result.ok ? "ok" : "error");
        if (!result.ok) return;
        handle.close();
        requestRender();
      },
      { "aria-label": "اعمال برنامه هوش مصنوعی" },
    ),
    btn("btn-ghost", "بستن", () => handle.close()),
  );
}

/** Compact summary row for the nutrition tab (rendered only when a plan exists). */
export function aiPlanBadge(): HTMLElement | null {
  const diet = getState().diet;
  if (!hasAiDietPlan()) return null;
  const parts: string[] = [];
  if (diet.customCalories) parts.push(`${faNum(diet.customCalories, 0)} کالری`);
  if (diet.customProtein) parts.push(`${faNum(diet.customProtein, 0)} گرم پروتئین`);
  const badge = el(
    "div",
    "flex items-center justify-between gap-2 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 px-2.5 py-1.5",
  );
  badge.append(
    el("span", "text-[10px] font-bold text-emerald-300", "برنامه هوش مصنوعی فعال"),
    el("span", "shrink-0 text-[9px] text-emerald-200/70", parts.join(" • ") || "فعال"),
  );
  return badge;
}
