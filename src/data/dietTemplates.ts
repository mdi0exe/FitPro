/**
 * Ready-made student nutrition templates.
 *
 * Every template keeps the `diet-4` water row: `syncWaterChecklist()` uses that
 * id to tick "drink 8 glasses" automatically, and deleting it would silently
 * break the water tracker. Extra meals the student adds get `custom-*` ids and
 * are never overwritten by a save/load cycle (see `normalizeState`).
 */
import type { DietItem } from "../types";

export interface DietTemplate {
  id: string;
  label: string;
  hint: string;
  build: () => DietItem[];
}

const item = (id: string, text: string, hint: string): DietItem => ({
  id,
  text,
  hint,
  done: false,
});

/** Exported so the AI configurator can re-append the water row. */
export const waterRow = () =>
  item(
    "diet-4",
    "نوشیدن حداقل ۸ تا ۱۰ لیوان آب در طول روز و در باشگاه",
    "۷۰٪ حجم عضله آب است! هیدراته ماندن برای پمپ عضلانی و ریکاوری حیاتی است",
  );

const sleepRow = () =>
  item(
    "diet-5",
    "خواب شبانه ۷ تا ۸ ساعت برای ترشح هورمون رشد",
    "بیشترین ترشح هورمون رشد و عضله‌سازی در خواب عمیق اتفاق می‌افتد",
  );

/** The original 3-meal cafeteria plan (also the Rust `default_diet_items`). */
export function cafeteriaItems(): DietItem[] {
  return [
    item("diet-1", "صبحانه سلف: املت دانشگاه + نان کامل", "حدود ۱۲ گرم پروتئین و انرژی صبحگاهی"),
    item(
      "diet-2",
      "ناهار سلف آزاد: چلو جوجه کباب یا چلو مرغ کامل تا آخر برنج",
      "حدود ۴۵ گرم پروتئین و کربوهیدرات کافی برای پر شدن ذخایر گلیکوژن",
    ),
    item(
      "diet-3",
      "شام سلف آزاد (بلافاصله بعد از باشگاه): خوراک مرغ، چلو جوجه یا برگر",
      "حدود ۴۰ گرم پروتئین — به عنوان وعده ریکاوری بعد تمرین!",
    ),
    waterRow(),
    sleepRow(),
  ];
}

export const DIET_TEMPLATES: DietTemplate[] = [
  {
    id: "dorm",
    label: "🍱 خوابگاهی (۳ وعده سلف)",
    hint: "همان برنامه اقتصادی سلف: صبحانه، ناهار و شام دانشگاه",
    build: cafeteriaItems,
  },
  {
    id: "home",
    label: "🏠 ناهار دانشگاه + خانه",
    hint: "صبحانه و شام در خانه، فقط ناهار از سلف دانشگاه",
    build: () => [
      item("diet-1", "صبحانه در خانه: تخممرغ، نان کامل و پنیر", "پروتئین کامل و ارزان قبل از کلاسها"),
      item("diet-2", "ناهار سلف دانشگاه (چلو مرغ یا جوجه)", "وعده اصلی روز؛ برنج کامل برای انرژی کلاس و تمرین"),
      item("diet-3", "شام خانگی: خوراک مرغ، عدس یا تخممرغ", "پروتئین ریکاوری شب بدون هزینه اضافه"),
      waterRow(),
      sleepRow(),
    ],
  },
  {
    id: "cut",
    label: "🔥 کاهش وزن و کات",
    hint: "کالری کنترلشده و پروتئین بالا (هدف کمتر از وزن فعلی)",
    build: () => [
      item("diet-1", "صبحانه سبک: جو دوسر + ماست کمچرب", "فیبر بالا و سیری طولانی با کالری کم"),
      item("diet-2", "ناهار سلف: نصف برنج + مرغ یا جوجه بدون سس", "پروتئین کامل، کربوهیدرات نصف شده"),
      item("diet-3", "شام سبک: سالاد + تن ماهی یا تخممرغ", "پروتئین بالا قبل از خواب، بدون غذای سنگین"),
      waterRow(),
      sleepRow(),
    ],
  },
];

export function dietTemplateItems(id: string): DietItem[] {
  return (DIET_TEMPLATES.find((template) => template.id === id) ?? DIET_TEMPLATES[0]).build();
}

/** The first row identifies the active template even after custom rows are added. */
export function activeDietTemplateId(items: DietItem[]): string {
  const first = items[0]?.text ?? "";
  return (
    DIET_TEMPLATES.find((template) => template.build()[0].text === first)?.id ?? "custom"
  );
}

/** One-tap custom rows: no keyboard needed for the common supplements. */
export const CUSTOM_DIET_PRESETS: Array<{ text: string; hint: string }> = [
  { text: "کراتین ۵ گرم بعد از تمرین", hint: "با یک لیوان آب یا نوشیدنی کربوهیدراتدار" },
  { text: "پروتئین وی (یک پیمانه)", hint: "فقط وقتی پروتئین سه وعده کافی نیست" },
  { text: "تخممرغ آبپز (۲ عدد)", hint: "میانوعده ارزان و کمحجم بین کلاسها" },
  { text: "میانوعده: موز + بادام", hint: "پتاسیم و کالری سریع قبل از باشگاه" },
  { text: "مکمل دلخواه (امگا ۳ / ویتامین D)", hint: "طبق نظر پزشک یا مربی" },
];
