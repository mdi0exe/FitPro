/**
 * First-run setup wizard (also reachable from the coach tab).
 *
 * Picks the modular layout, university name and workout template, and offers
 * the one-tap developer preset. Every numeric field uses touch steppers so a
 * Persian/Android keyboard is never required.
 */
import { btn, el } from "../lib/dom";
import { faNum } from "../lib/fa";
import {
  applyTheme,
  getActiveTab,
  getState,
  homeTab,
  persist,
  requestRender,
  setActiveTab,
  visibleTabs,
} from "../lib/store";
import { WORKOUT_PROGRAMS } from "../data/programs";
import { applyDeveloperPreset, applyProgram } from "../lib/appSettings";
import { openModal, toast, type ModalHandle } from "./ui";
import { softTap } from "../lib/timer";
import type { AppMode } from "../types";

const POPULAR_UNIS = [
  "دانشگاه صنعتی تبریز",
  "دانشگاه صنعتی شریف",
  "دانشگاه تهران",
  "دانشگاه صنعتی امیرکبیر",
  "دانشگاه صنعتی اصفهان",
  "دانشگاه فردوسی مشهد",
  "دانشگاه شیراز",
  "دانشگاه آزاد اسلامی",
];

const MODE_OPTIONS: Array<{ id: AppMode; title: string; desc: string }> = [
  {
    id: "full",
    title: "🎓💪 حالت کامل (دانشگاه + ورزش و تغذیه)",
    desc: "برنامه بدنسازی، تغذیه و آب، سرویس‌های دانشگاه، کلاس‌ها و مطالعه",
  },
  {
    id: "uni_only",
    title: "🎓 فقط دانشگاه و برنامهریزی (بدون بدنسازی)",
    desc: "مخفی کردن تب‌های تمرین و پیشرفت • فقط سرویس‌ها، کلاس‌ها، رزرو سلف، مطالعه و آب",
  },
  {
    id: "gym_only",
    title: "💪 فقط ورزش و تغذیه (مناسب تابستان یا غیردانشجو)",
    desc: "مخفی کردن تب دانشگاه • تمرکز خالص روی تمرین و تغذیه",
  },
];

export function openOnboardingModal(): void {
  const state = getState();

  let appMode: AppMode = state.appMode ?? "full";
  let programId = state.profile.workoutProgramId || "upper-lower-4";
  let currentWeight = state.profile.currentWeight || 65;
  let targetWeight = state.profile.targetWeight || 75;
  const heightCm = state.profile.heightCm || 179;
  const age = state.profile.age || 25;

  const body = el("div", "space-y-4");

  // The handle is declared up-front: both the preset and the save button close
  // the sheet from inside their click handlers.
  let handle: ModalHandle;

  // ------------------------------------------------------- developer preset
  body.append(
    btn(
      "flex w-full items-center justify-between gap-2 rounded-2xl border border-amber-400/50 bg-amber-500/15 px-3.5 py-3 text-right transition active:scale-95",
      `<div class="min-w-0">
         <p class="text-xs font-black text-amber-300">⚡ پروفایل پیشفرض (برای توسعه دهنده)</p>
         <p class="mt-0.5 text-[10px] leading-5 text-amber-100/80">بارگذاری سریع تنظیمات پیشفرض (۴ روزه حجم ۶۵←۷۵، سلف، دروس ارشد و سرویسها)</p>
       </div>
       <span class="chip chip-amber shrink-0">۱ لمس</span>`,
      () => {
        applyDeveloperPreset(state);
        softTap();
        applyTheme();
        setActiveTab(homeTab(state.appMode));
        persist(0);
        handle.close();
        toast("پروفایل پیشفرض توسعهدهنده با موفقیت بارگذاری شد ⚡");
        requestRender();
      },
      { "aria-label": "پروفایل پیشفرض توسعه دهنده" },
    ),
  );

  body.append(el("div", "divider"));

  // ------------------------------------------------------------- app mode
  const modeWrap = el("div", "space-y-1.5");
  modeWrap.append(el("label", "label", "۱. از چه بخشهای برنامه میخواهی استفاده کنی؟"));
  const modeGrid = el("div", "grid grid-cols-1 gap-1.5");

  const gymSection = el("div", "space-y-3");
  const paintProgramVisibility = () => {
    gymSection.classList.toggle("hidden", appMode === "uni_only");
  };

  const paintModes = () => {
    modeGrid.innerHTML = "";
    MODE_OPTIONS.forEach((mode) => {
      const active = appMode === mode.id;
      modeGrid.append(
        btn(
          `flex w-full flex-col items-start rounded-2xl border p-2.5 text-right transition ${
            active
              ? "border-emerald-400 bg-emerald-500/15 text-emerald-200 shadow-glow"
              : "border-slate-800 bg-slate-950/60 text-slate-300"
          }`,
          `<span class="text-xs font-extrabold">${mode.title}</span>
           <span class="mt-0.5 text-[10px] leading-5 opacity-80">${mode.desc}</span>`,
          () => {
            appMode = mode.id;
            softTap();
            paintModes();
            paintProgramVisibility();
          },
          { "aria-pressed": String(active) },
        ),
      );
    });
  };
  paintModes();
  modeWrap.append(modeGrid);
  body.append(modeWrap);

  // ------------------------------------------------- name + university name
  const nameInput = el("input", "field text-right text-sm");
  nameInput.type = "text";
  nameInput.placeholder = "نام شما (مثلاً: مهدی)";
  nameInput.value = state.profile.name || "دانشجوی ورزشکار";

  const uniInput = el("input", "field text-right text-sm");
  uniInput.type = "text";
  uniInput.placeholder = "نام دانشگاه (مثلاً: دانشگاه تهران)";
  uniInput.value = state.profile.universityName || "دانشگاه من";

  const uniChips = el("div", "flex flex-wrap gap-1 pt-1");
  POPULAR_UNIS.forEach((name) => {
    uniChips.append(
      btn(
        "rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-[10px] font-bold text-slate-300",
        name,
        () => {
          uniInput.value = name;
          softTap();
        },
      ),
    );
  });

  const infoWrap = el("div", "space-y-2");
  infoWrap.append(el("label", "label", "۲. نام شما و نام دانشگاه"), nameInput, uniInput, uniChips);
  body.append(infoWrap);

  // ------------------------------------------------------ workout templates
  const progList = el("div", "space-y-1.5");
  const paintPrograms = () => {
    progList.innerHTML = "";
    WORKOUT_PROGRAMS.forEach((program) => {
      const active = programId === program.id;
      progList.append(
        btn(
          `flex w-full flex-col items-start rounded-2xl border p-2.5 text-right transition ${
            active
              ? "border-cyan-400 bg-cyan-500/15 text-cyan-200 shadow-glow"
              : "border-slate-800 bg-slate-950/60 text-slate-300"
          }`,
          `<span class="text-xs font-extrabold">${program.title}</span>
           <span class="mt-0.5 text-[10px] leading-5 opacity-80">${program.subtitle}</span>`,
          () => {
            programId = program.id;
            softTap();
            paintPrograms();
          },
          { "aria-pressed": String(active) },
        ),
      );
    });
  };
  paintPrograms();

  // Touch steppers for current / target weight.
  const weightBox = el("div", "grid grid-cols-2 gap-2");
  const paintWeights = () => {
    weightBox.innerHTML = "";
    const makeStepper = (label: string, value: number, onChange: (next: number) => void) => {
      const box = el("div", "rounded-2xl border border-slate-800 bg-slate-950/60 p-2.5 text-center space-y-1.5");
      box.append(
        el("p", "text-[10px] text-slate-400", label),
        el("p", "text-base font-black text-emerald-400", `${faNum(value, 1)} کیلو`),
      );
      const row = el("div", "grid grid-cols-2 gap-1");
      row.append(
        btn("btn-ghost py-1 text-xs", "−۱", () => {
          onChange(Math.max(35, value - 1));
          softTap();
          paintWeights();
        }),
        btn("btn-ghost py-1 text-xs", "\u200E+۱", () => {
          onChange(Math.min(180, value + 1));
          softTap();
          paintWeights();
        }),
      );
      box.append(row);
      return box;
    };

    weightBox.append(
      makeStepper("وزن فعلی", currentWeight, (value) => (currentWeight = value)),
      makeStepper("وزن هدف", targetWeight, (value) => (targetWeight = value)),
    );
  };
  paintWeights();

  gymSection.append(
    el("label", "label", "۳. انتخاب برنامه تمرینی و وزن هدف"),
    progList,
    weightBox,
  );
  paintProgramVisibility();
  body.append(gymSection);

  // ------------------------------------------------------------------ save
  const saveBtn = btn(
    "btn-primary w-full",
    "✅ ذخیره و ورود به برنامه",
    () => {
      state.appMode = appMode;
      state.profile.name = nameInput.value.trim() || "دانشجوی ورزشکار";
      state.profile.universityName = uniInput.value.trim() || "دانشگاه من";
      state.profile.currentWeight = currentWeight;
      state.profile.startWeight = currentWeight;
      state.profile.targetWeight = targetWeight;
      state.profile.heightCm = heightCm;
      state.profile.age = age;

      if (appMode !== "uni_only") applyProgram(state, programId);

      if (appMode === "uni_only") setActiveTab("uni");
      else if (appMode === "gym_only") setActiveTab("workout");
      else if (!visibleTabs(appMode).includes(getActiveTab())) {
        setActiveTab(homeTab(appMode));
      }

      state.onboardingCompleted = true;
      applyTheme();
      persist(0);
      handle.close();
      toast("تنظیمات شخصی شما ذخیره شد 🎉");
      requestRender();
    },
    { "aria-label": "ذخیره و ورود به برنامه" },
  );

  handle = openModal({
    title: "🎓 خوش آمدی! تنظیم سریع برنامه",
    subtitle: "متناسب با دانشگاه، هدف و برنامه هفتگی خودت تنظیم کن",
    body,
    footer: saveBtn,
  });
}
