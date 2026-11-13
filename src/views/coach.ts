/** Coach tab: golden rules, overload science and app settings. */
import { btn, clamp, el, escapeHtml, svgIcon } from "../lib/dom";
import { icons } from "../lib/icons";
import { fa, faNum, parseNum } from "../lib/fa";
import { resetToDefaults, storageMode } from "../lib/api";
import { ensureNotificationPermission, pushSystemNotification } from "../lib/notify";
import { alarm, waterAlert } from "../lib/timer";
import { applyTheme, getState, persist, requestRender, setState } from "../lib/store";
import { applyDeveloperPreset } from "../lib/appSettings";
import type { AppStateData } from "../types";
import { confirmDialog, sectionTitle, toast } from "../components/ui";
import { renderBackupRestoreCard } from "../components/progressPhotos";
import { openOnboardingModal } from "../components/onboarding";

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

  view.append(ruleCard("⏰", "بهترین زمان تمرین", "۱٫۵ ساعت قبل از شام سلف", [
    "چون میان‌وعده نداری، بهترین تایم باشگاه ۱.۵ ساعت قبل از شام سلف است تا شامِ مرغ یا جوجه‌ات دقیقاً نقش وعده بعد از تمرین را بازی کند!",
    "با این تایم، ناهار سلف هم گلیکوژن لازم برای تمرین را تامین می‌کند.",
    "صبح ناشتا تمرین نکن؛ بدن در آن حالت برای تامین انرژی سراغ عضله می‌رود.",
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
  view.append(renderBackupRestoreCard());

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
  grid.append(
    cell("\u200E+۲٫۵", "کیلوگرم هر چرخه"),
    cell("\u200E+۱", "تکرار وزن بدن"),
    cell("۱۴", "روز هر چرخه"),
  );
  card.append(grid);
  return card;
}

/** Editable profile: name, age, height and the start/target weights. */
function profileEditor(state: AppStateData): HTMLElement {
  const wrap = el("div", "space-y-2");

  const nameWrap = el("div", "space-y-1");
  nameWrap.append(el("label", "label", "نام"));
  const nameInput = el("input", "field field-sm text-right");
  nameInput.type = "text";
  nameInput.value = state.profile.name;
  nameWrap.append(nameInput);

  const numberField = (label: string, value: number, step = "1") => {
    const box = el("div", "space-y-1");
    box.append(el("label", "label", label));
    const input = el("input", "field field-sm");
    input.type = "text";
    input.step = step;
    input.inputMode = "decimal";
    input.autocomplete = "off";
    input.value = faNum(value, 1);
    box.append(input);
    return { box, input };
  };

  const age = numberField("سن", state.profile.age);
  const height = numberField("قد (سانتی‌متر)", state.profile.heightCm);
  const start = numberField("وزن شروع (کیلو)", state.profile.startWeight, "0.1");
  const target = numberField("وزن هدف (کیلو)", state.profile.targetWeight, "0.1");

  const grid = el("div", "grid grid-cols-2 gap-2");
  grid.append(age.box, height.box, start.box, target.box);

  const save = btn("btn-ghost w-full py-2 text-xs", "ذخیره مشخصات", () => {
    const name = nameInput.value.trim();
    if (name) state.profile.name = name;
    state.profile.age = clamp(Math.round(parseNum(age.input.value)) || state.profile.age, 12, 99);
    state.profile.heightCm = clamp(parseNum(height.input.value) || state.profile.heightCm, 120, 230);
    state.profile.startWeight = clamp(parseNum(start.input.value) || state.profile.startWeight, 30, 300);
    state.profile.targetWeight = clamp(parseNum(target.input.value) || state.profile.targetWeight, 30, 300);

    persist(0);
    toast("مشخصات ذخیره شد.");
    requestRender();
  });

  wrap.append(
    el("p", "text-xs font-extrabold text-slate-200", "مشخصات من"),
    el(
      "p",
      "text-[10px] leading-5 text-slate-500",
      "قد و وزن‌ها در نمودار پیشرفت و محاسبه پروتئین روزانه استفاده می‌شوند.",
    ),
    nameWrap,
    grid,
    save,
    el("div", "divider"),
  );

  return wrap;
}

function settingsCard(): HTMLElement {
  const state = getState();
  const card = el("div", "card space-y-3");
  card.append(sectionTitle("تنظیمات", el("span", "chip", storageMode() === "native" ? "ذخیره بومی" : "مرورگر")));

  // Modular setup: same wizard as the first run, plus the one-tap dev preset.
  const setupRow = el("div", "space-y-2");
  setupRow.append(
    el("label", "label", "حالت برنامه، دانشگاه و برنامه تمرینی"),
    btn(
      "btn-ghost w-full py-2 text-right text-xs",
      "⚙️ تغییر پروفایل، حالت برنامه (دانشگاه/ورزش) و برنامه تمرینی",
      () => openOnboardingModal(),
      { "aria-label": "تغییر پروفایل و حالت برنامه" },
    ),
    btn(
      "btn-ghost w-full py-2 text-right text-xs",
      "⚡ بارگذاری پروفایل پیشفرض (برای توسعه دهنده)",
      () => void loadDeveloperPreset(),
      { "aria-label": "بارگذاری پروفایل پیشفرض توسعه دهنده" },
    ),
  );
  card.append(setupRow, el("div", "divider"));
  card.append(profileEditor(state));

  const restRow = el("div", "space-y-2");
  restRow.append(
    el("label", "label", "مدت استراحت بین ست‌ها"),
    el("p", "text-[10px] leading-5 text-slate-500", "پیشنهاد: ۹۰ ثانیه برای هایپرتروفی، ۱۲۰ ثانیه برای حرکات سنگین پایین‌تنه."),
  );

  const setRest = (seconds: number) => {
    const value = Math.min(300, Math.max(30, seconds));
    state.restSeconds = value;
    persist(0);
    toast(`استراحت روی ${fa(value)} ثانیه تنظیم شد.`);
    requestRender();
  };

  // Preset chips instead of a number input — one tap, saved immediately.
  const restChips = el("div", "flex flex-wrap gap-2");
  [60, 90, 120, 150, 180].forEach((seconds) => {
    const active = state.restSeconds === seconds;
    restChips.append(
      btn(
        `flex-1 basis-[28%] rounded-xl border px-2 py-2 text-xs font-bold transition active:scale-95 ${
          active
            ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-300"
            : "border-slate-800 bg-slate-900/60 text-slate-300"
        }`,
        `${fa(seconds)} ثانیه`,
        () => setRest(seconds),
      ),
    );
  });
  restRow.append(restChips);

  const restAdjust = el("div", "flex gap-2");
  restAdjust.append(
    btn("btn-ghost flex-1 py-2 text-xs", "\u200E−۱۵ ثانیه", () => setRest(state.restSeconds - 15)),
    btn("btn-ghost flex-1 py-2 text-xs", "\u200E+۱۵ ثانیه", () => setRest(state.restSeconds + 15)),
  );
  restRow.append(restAdjust);
  card.append(restRow);

  const divider = el("div", "divider");
  card.append(divider);

  // Sound check: lets the user verify volume in the gym before relying on it.
  const soundTests = el("div", "space-y-2");
  soundTests.append(
    el("label", "label", "تست صدا و لرزش"),
    btn("btn-ghost w-full py-2 text-xs", "🔊 تست صدای هشدار استراحت (بلند)", () => {
      alarm();
      toast("تست صدای هشدار باشگاه و ویبره قوی انجام شد 💪");
    }),
    btn("btn-ghost w-full py-2 text-xs", "💧 تست یادآور آب (ملایم)", () => {
      waterAlert();
      toast("تست صدای ملایم و نوتیفیکیشن آب انجام شد 💧");
    }),
    btn("btn-ghost w-full py-2 text-xs", "🔔 تست نوتیفیکیشن در نوار اعلان", () => {
      // First tap also asks for the Android 13+ POST_NOTIFICATIONS permission.
      void ensureNotificationPermission().then(async (granted) => {
        if (!granted) {
          toast("اجازه اعلان داده نشد. از تنظیمات گوشی فعالش کن.", "error");
          return;
        }
        await pushSystemNotification(
          "🔔 اعلان فیت‌پرو فعال است",
          "این پیام باید در نوار اعلان‌های گوشی دیده شود.",
        );
        toast("اگر نوتیفیکیشن را دیدی، همه‌چیز درست است ✅");
      });
    }),
  );
  card.append(soundTests);

  card.append(el("div", "divider"));

  const info = el("div", "space-y-1 text-[10px] leading-5 text-slate-500");
  info.append(
    el("p", "", `نسخه داده: ${fa(state.version)}`),
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

async function loadDeveloperPreset(): Promise<void> {
  const confirmed = await confirmDialog({
    title: 'پروفایل پیش‌فرض توسعه‌دهنده',
    message:
      'برنامه ۴ روزه حجم (۶۵ به ۷۵ کیلو)، تغذیه ۳ وعده سلف، دروس ارشد الکترونیک و سرویس‌های دانشگاه صنعتی تبریز بارگذاری می‌شود. تاریخچه وزن، رویدادها و عکس‌ها حفظ می‌شوند. ادامه می‌دهی؟',
    confirmText: 'بارگذاری',
    danger: true,
  });
  if (!confirmed) return;

  applyDeveloperPreset(getState());
  applyTheme();
  persist(0);
  toast('پروفایل پیش‌فرض توسعه‌دهنده بارگذاری شد ⚡');
  requestRender();
}

async function resetPlan(): Promise<void> {
  const confirmed = await confirmDialog({
    title: "بازگردانی برنامه",
    message:
      "برنامه تمرینی به حالت اولیه برمی‌گردد (حرکات، ست‌ها و تیک‌ها پاک می‌شوند). تنظیمات، تم، دانشگاه و تاریخچه وزن حفظ می‌شود. ادامه می‌دهی؟",
    confirmText: "بازگردانی",
    danger: true,
  });
  if (!confirmed) return;

  try {
    const next = await resetToDefaults();
    setState(next);
    toast("برنامه به حالت پیش‌فرض بازگشت.", "info");
    requestRender();
  } catch (error) {
    toast(error instanceof Error ? error.message : "بازگردانی ناموفق بود.", "error");
  }
}
