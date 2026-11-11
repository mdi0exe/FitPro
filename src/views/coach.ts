/** Coach tab: golden rules, overload science and app settings. */
import { btn, el, escapeHtml, svgIcon } from "../lib/dom";
import { icons } from "../lib/icons";
import { fa } from "../lib/fa";
import { resetToDefaults, storageMode } from "../lib/api";
import { getState, persist, requestRender, setState } from "../lib/store";
import { confirmDialog, sectionTitle, toast } from "../components/ui";

export function renderCoach(): HTMLElement {
  const view = el("div", "space-y-3 animate-fade-up");

  view.append(
    el(
      "div",
      "card border-amber-500/25 bg-gradient-to-bl from-amber-500/10 via-slate-900/60 to-transparent",
      `<p class="text-[10px] font-bold text-amber-300/90">دفترچه مربی</p>
       <p class="mt-1 text-base font-extrabold text-slate-50">۳ قانون طلایی که رشدت را تعیین می‌کند</p>
       <p class="mt-1 text-[11px] leading-6 text-slate-400">
         تمرین فقط محرک است؛ رشد در تغذیه، خواب و ریکاوری اتفاق می‌افتد. این سه قانون را هر روز رعایت کن.
       </p>`,
    ),
  );

  view.append(ruleCard("⏰", "بهترین زمان تمرین", "۴ عصر تا ۷ شب", [
    "بعد از ناهار سلف که ذخایر گلیکوژن پر است، قدرت و پمپ بهتری خواهی داشت.",
    "صبح ناشتا تمرین نکن؛ بدن در آن حالت برای تامین انرژی سراغ عضله می‌رود.",
    "اگر مجبوری صبح بزنی، حداقل یک وعده کربوهیدرات (نان و خرما یا برنج) قبلش بخور.",
  ], "amber"));

  view.append(ruleCard("🚿", "قانون دوش بعد از تمرین", "فقط آب ولرم رو به گرم", [
    "دوش آب سرد یا یخ بعد از بدنسازی، التهاب مفید عضله را خاموش می‌کند.",
    "همین التهاب کنترل‌شده موتور هایپرتروفی است؛ با سرما آن را می‌کشی.",
    "آب گرم عضلات را شل می‌کند، کوفتگی را کم می‌کند و خواب را بهتر می‌کند.",
  ], "cyan"));

  view.append(ruleCard("🔥", "قانون گرم کردن", "پویا، نه کشش ایستا", [
    "هرگز قبل از وزنه زدن، کشش ایستا (ثابت نگه داشتن عضله) انجام نده؛ قدرت را کم می‌کند.",
    "فقط گرم کردن پویا که بالای هر روز تمرینی برایت گذاشته شده را اجرا کن.",
    "۲ ست گرم‌کردنی از حرکت اول با ۵۰٪ وزنه کاری، بهترین محافظ مفاصل است.",
  ], "emerald"));

  view.append(overloadCard());
  view.append(settingsCard());

  return view;
}

function ruleCard(
  emoji: string,
  title: string,
  headline: string,
  points: string[],
  tone: "amber" | "cyan" | "emerald",
): HTMLElement {
  const toneMap = {
    amber: "border-amber-500/20 bg-amber-500/5",
    cyan: "border-cyan-500/20 bg-cyan-500/5",
    emerald: "border-emerald-500/20 bg-emerald-500/5",
  } as const;
  const headMap = {
    amber: "text-amber-300",
    cyan: "text-cyan-300",
    emerald: "text-emerald-300",
  } as const;

  const card = el("div", `card ${toneMap[tone]}`);
  const head = el("div", "flex items-start gap-3");
  head.append(
    el("span", "text-xl leading-none", emoji),
    el("div", "min-w-0 flex-1", `<p class="text-xs font-extrabold text-slate-100">${escapeHtml(title)}</p>
       <p class="mt-1 text-[11px] font-bold ${headMap[tone]}">${escapeHtml(headline)}</p>`),
  );
  card.append(head);

  const list = el("ul", "mt-2 space-y-1.5");
  points.forEach((point) => {
    const item = el("li", "flex items-start gap-2 text-[11px] leading-6 text-slate-300");
    item.append(el("span", `mt-2 h-1 w-1 shrink-0 rounded-full ${headMap[tone]} bg-current`));
    item.append(el("span", "flex-1", escapeHtml(point)));
    list.append(item);
  });
  card.append(list);
  return card;
}

function overloadCard(): HTMLElement {
  const state = getState();
  const card = el("div", "card");
  card.append(
    sectionTitle("علم افزایش تدریجی بار", el("span", "chip chip-emerald", `${fa(state.overloadCount)} چرخه`)),
  );

  card.append(
    el(
      "p",
      "text-[11px] leading-7 text-slate-300",
      "عضله به باری که به آن عادت کرده جواب نمی‌دهد. هر ۲ هفته یک پله سنگین‌تر شو: به حرکات وزنه‌دار ۲٫۵ کیلوگرم و به حرکات وزن بدن یک تکرار اضافه کن. دکمه «⚡ اعمال افزایش وزنه» در تب تمرین همین کار را یک‌جا انجام می‌دهد.",
    ),
  );

  const grid = el("div", "mt-3 grid grid-cols-3 gap-2 text-center");
  const cell = (value: string, label: string) => {
    const box = el("div", "rounded-xl bg-slate-950/50 px-2 py-2");
    box.append(el("p", "text-sm font-extrabold text-emerald-300", value), el("p", "mt-0.5 text-[9px] text-slate-500", label));
    return box;
  };
  grid.append(cell("+۲٫۵", "کیلوگرم هر چرخه"), cell("+۱", "تکرار وزن بدن"), cell("۱۴", "روز هر چرخه"));
  card.append(grid);
  return card;
}

function settingsCard(): HTMLElement {
  const state = getState();
  const card = el("div", "card space-y-3");
  card.append(sectionTitle("تنظیمات", el("span", "chip", storageMode() === "native" ? "ذخیره بومی" : "مرورگر")));

  const restRow = el("div", "space-y-1");
  restRow.append(
    el("label", "label", "مدت استراحت بین ست‌ها (ثانیه)"),
    el("p", "text-[10px] leading-5 text-slate-500", "پیشنهاد: ۹۰ ثانیه برای هایپرتروفی، ۱۲۰ ثانیه برای حرکات سنگین پایین‌تنه."),
  );
  const restForm = el("div", "mt-1 flex items-center gap-2");
  const restInput = el("input", "field flex-1");
  restInput.type = "number";
  restInput.min = "30";
  restInput.max = "300";
  restInput.step = "15";
  restInput.value = String(state.restSeconds);
  restForm.append(
    restInput,
    btn("btn-primary shrink-0 px-4", "ذخیره", () => {
      const value = Math.min(300, Math.max(30, Number.parseInt(restInput.value, 10) || 90));
      state.restSeconds = value;
      persist(0);
      toast(`استراحت روی ${fa(value)} ثانیه تنظیم شد.`);
    }),
  );
  restRow.append(restForm);
  card.append(restRow);

  const divider = el("div", "divider");
  card.append(divider);

  const info = el("div", "space-y-1 text-[10px] leading-5 text-slate-500");
  info.append(
    el("p", "", `نسخه برنامه: ${fa(state.version)} • نسخه اسکیما: ${fa(state.version)}`),
    el(
      "p",
      "",
      storageMode() === "native"
        ? "داده‌ها در فایل gym_state.json داخل پوشه داده اپ ذخیره می‌شوند (نوشتن اتمیک)."
        : "در حالت مرورگر، داده‌ها در localStorage ذخیره می‌شوند. داخل اپ اندروید/دسکتاپ فایل JSON بومی استفاده می‌شود.",
    ),
  );
  card.append(info);

  card.append(
    btn(
      "btn-danger w-full",
      `${svgIcon(icons.reset, "h-4 w-4").outerHTML} بازگردانی برنامه تمرینی به حالت پیش‌فرض`,
      () => void resetPlan(),
    ),
  );

  return card;
}

async function resetPlan(): Promise<void> {
  const confirmed = await confirmDialog({
    title: "بازگردانی برنامه",
    message:
      "برنامه ۴ روزه به حالت اولیه برمی‌گردد (حرکات، ست‌ها و تیک‌ها پاک می‌شوند). تاریخچه وزن و رویدادها حفظ می‌شود. ادامه می‌دهی؟",
    confirmText: "بازگردانی",
    danger: true,
  });
  if (!confirmed) return;

  try {
    const next = await resetToDefaults();
    setState(next);
    persist(0);
    toast("برنامه به حالت پیش‌فرض بازگشت.", "info");
    requestRender();
  } catch (error) {
    toast(error instanceof Error ? error.message : "بازگردانی ناموفق بود.", "error");
  }
}
