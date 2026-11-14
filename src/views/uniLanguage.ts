/**
 * Daily language-study card: focus timer, daily reminder time and streak.
 *
 * The reminder is a repeating OS alarm (id 7905) at a fixed local time, so it
 * keeps firing while the app is closed — no JS timer involved.
 */
import { btn, el, svgIcon } from "../lib/dom";
import { fa, faClock, isoAddDays, isoToday } from "../lib/fa";
import { icons } from "../lib/icons";
import {
  LANG_TIMER_NOTIF_ID,
  cancelNotifications,
  ensureNotificationPermission,
  hasNotificationPermission,
  scheduleOneShotNotification,
  scheduleRepeatingNotification,
} from "../lib/notify";
import { getState, persist, requestRender } from "../lib/store";
import { CountdownTimer, alarm, softTap } from "../lib/timer";
import type { LanguageStudyState } from "../types";
import { sectionTitle, toast } from "../components/ui";

/** Repeating daily alarm id (7905 is free: water 7701, food 7901, gym 7902). */
export const LANGUAGE_ALARM_ID = 7905;

/** Survives tab switches and re-renders, like `restTimer`. */
export const languageStudyTimer = new CountdownTimer(60 * 60);

const PRESET_TIMES = ["10:00", "14:00", "19:00", "20:30", "21:30", "22:30"];
const PRESET_MINUTES = [30, 45, 60, 90, 120];

/** Quick subject chips — the daily goal is not language-only any more. */
const STUDY_TITLES = [
  { label: "📚 مطالعه زبان", value: "مطالعه روزانه زبان" },
  { label: "💻 برنامهنویسی", value: "تمرین برنامهنویسی" },
  { label: "📖 مطالعه کنکور", value: "مطالعه کنکور" },
  { label: "📝 پایاننامه", value: "پژوهش و پایاننامه" },
];

function languageState(): LanguageStudyState {
  const state = getState();
  if (!state.languageStudy) {
    state.languageStudy = {
      reminderEnabled: true,
      reminderTime: "20:30",
      targetMinutes: 60,
      completedDates: [],
      title: "مطالعه روزانه زبان",
    };
  }
  if (!state.languageStudy.title) state.languageStudy.title = "مطالعه روزانه زبان";
  return state.languageStudy;
}

/** Consecutive days ending today (or yesterday, so an evening session counts). */
export function languageStreak(dates: string[]): number {
  const set = new Set(dates);
  const today = isoToday();
  const iso = (offset: number) => isoAddDays(today, -offset);
  let cursor = set.has(iso(0)) ? 0 : set.has(iso(1)) ? 1 : -1;
  if (cursor === -1) return 0;
  let streak = 0;
  while (set.has(iso(cursor))) {
    streak += 1;
    cursor += 1;
  }
  return streak;
}

async function scheduleLanguageAlarm(hhmm: string): Promise<boolean> {
  const [hour, minute] = hhmm.split(":").map((part) => Number.parseInt(part, 10) || 0);
  const granted = await ensureNotificationPermission();
  if (!granted) return false;
  const title = languageState().title || "مطالعه روزانه زبان";
  return scheduleRepeatingNotification(
    LANGUAGE_ALARM_ID,
    `📚 وقت ${title} است!`,
    "یک جلسه تمرکز = سرمایه‌گذاری روی آینده تحصیلی و شغلی. همین حالا شروع کن 🔥",
    { hour, minute },
  );
}

export async function syncLanguageStudyAlarm(): Promise<void> {
  if (!(await hasNotificationPermission())) return;
  const lang = languageState();
  if (!lang.reminderEnabled) {
    await cancelNotifications([LANGUAGE_ALARM_ID]);
    return;
  }
  const [hour, minute] = lang.reminderTime.split(":").map((part) => Number.parseInt(part, 10) || 0);
  const title = lang.title || "مطالعه روزانه زبان";
  await scheduleRepeatingNotification(
    LANGUAGE_ALARM_ID,
    `📚 وقت ${title} است!`,
    "یک جلسه تمرکز = سرمایه‌گذاری روی آینده تحصیلی و شغلی. همین حالا شروع کن 🔥",
    { hour, minute },
  );
}

export function renderLanguageStudyCard(): HTMLElement {
  const lang = languageState();
  const today = isoToday();
  const doneToday = lang.completedDates.includes(today);
  const streak = languageStreak(lang.completedDates);
  const target = Math.max(10, lang.targetMinutes || 60);

  // A changed target resets a stopped timer so the label and the countdown agree.
  if (!languageStudyTimer.running && Math.round(languageStudyTimer.total) !== target * 60) {
    languageStudyTimer.reset(target * 60);
  }

  const card = el(
    "div",
    "card space-y-3 border-indigo-500/25 bg-gradient-to-bl from-indigo-500/10 via-slate-900/70 to-cyan-500/5",
  );

  card.append(
    sectionTitle(
      `📚 ${lang.title}`,
      el("span", `chip ${streak > 0 ? "chip-amber" : "chip-cyan"}`, streak > 0 ? `🔥 ${fa(streak)} روز پیوسته` : `📅 ${fa(lang.completedDates.length)} روز`),
    ),
  );

  // --------------------------------------------- editable study subject
  const subjects = el("div", "flex flex-wrap gap-1.5");
  STUDY_TITLES.forEach((subject) => {
    const active = lang.title === subject.value;
    subjects.append(
      btn(
        `rounded-xl border px-2.5 py-1 text-[10px] font-bold transition active:scale-95 ${
          active
            ? "border-indigo-400 bg-indigo-500/20 text-indigo-200"
            : "border-slate-800 bg-slate-950/60 text-slate-400"
        }`,
        subject.label,
        () => {
          if (lang.title === subject.value) return;
          lang.title = subject.value;
          softTap();
          persist(0);
          if (lang.reminderEnabled) void scheduleLanguageAlarm(lang.reminderTime);
          toast(`هدف مطالعه روزانه: ${subject.value} 📚`);
          requestRender();
        },
        { "aria-pressed": String(active), "aria-label": `هدف مطالعه ${subject.label}` },
      ),
    );
  });
  card.append(subjects);

  // ------------------------------------------------------- daily checkmark
  card.append(
    btn(
      `flex w-full items-center justify-between gap-2 rounded-2xl border p-3 text-right transition active:scale-[0.99] ${
        doneToday
          ? "border-emerald-400/70 bg-emerald-500/15"
          : "border-slate-800 bg-slate-950/60"
      }`,
      `<div class="min-w-0">
         <p class="text-xs font-extrabold ${doneToday ? "text-emerald-200" : "text-slate-200"}">
           ${doneToday ? "✅ مطالعه امروز ثبت شد" : "⬜ ثبت مطالعه امروز"}
         </p>
         <p class="mt-0.5 text-[10px] text-slate-400">استمرار روزانه در زبان = اپلای و کار تخصصی</p>
       </div>
       <span class="chip ${doneToday ? "chip-emerald" : ""}">${doneToday ? "انجام شد ✓" : "ثبت کن"}</span>`,
      () => {
        const index = lang.completedDates.indexOf(today);
        if (index >= 0) {
          lang.completedDates.splice(index, 1);
          toast("تیک امروز برداشته شد.", "info");
        } else {
          lang.completedDates.push(today);
          toast(`عالی! ${lang.title} امروز ثبت شد 📚🔥`);
        }
        softTap();
        persist(0);
        requestRender();
      },
      { "aria-pressed": String(doneToday), "aria-label": "ثبت مطالعه زبان امروز" },
    ),
  );

  // --------------------------------------------------------------- timer
  const timerBox = el(
    "div",
    "flex items-center justify-between gap-2 rounded-2xl border border-slate-800 bg-slate-950/70 p-3",
  );
  const timerText = el(
    "div",
    "min-w-0",
    // `dir="ltr"` isolates the clock: otherwise the colon makes RTL reorder the digits.
    `<p class="text-[10px] text-slate-400">تایمر تمرکز • ${fa(target)} دقیقه</p>
     <p data-lang-clock dir="ltr" class="mt-0.5 text-center text-xl font-extrabold leading-tight text-cyan-300">${faClock(languageStudyTimer.remaining)}</p>`,
  );

  const controls = el("div", "flex shrink-0 items-center gap-1.5");
  const toggleTimer = btn(
    "btn-primary px-3 py-2 text-xs",
    languageStudyTimer.running ? "توقف ⏸" : "شروع ▶",
    () => {
      if (!languageStudyTimer.running && languageStudyTimer.remaining <= 0.05) {
        languageStudyTimer.reset(target * 60);
      }
      languageStudyTimer.toggle();
      if (languageStudyTimer.running) {
        void scheduleOneShotNotification(
          LANG_TIMER_NOTIF_ID,
          `📚 پایان جلسه ${lang.title}`,
          "وقت مطالعه امروز تمام شد و ثبت گردید ✅",
          Date.now() + languageStudyTimer.remaining * 1000,
        );
      } else {
        void cancelNotifications([LANG_TIMER_NOTIF_ID]);
      }
      softTap();
      requestRender();
    },
    { "aria-label": "شروع یا توقف تایمر زبان" },
  );
  controls.append(
    toggleTimer,
    btn("btn-icon", svgIcon(icons.reset, "h-4 w-4"), () => {
      languageStudyTimer.reset(target * 60);
      void cancelNotifications([LANG_TIMER_NOTIF_ID]);
      softTap();
      requestRender();
    }, { "aria-label": "ریست تایمر زبان" }),
  );
  timerBox.append(timerText, controls);

  languageStudyTimer.onTick = (remaining) => {
    const node = timerBox.querySelector("[data-lang-clock]");
    if (node) node.textContent = faClock(remaining);
  };
  languageStudyTimer.onDone = () => {
    void cancelNotifications([LANG_TIMER_NOTIF_ID]);
    alarm();
    const current = languageState();
    const day = isoToday();
    if (!current.completedDates.includes(day)) {
      current.completedDates.push(day);
      persist(0);
    }
    toast(`جلسه ${current.title} ثبت شد.`);
    requestRender();
  };
  card.append(timerBox);

  // ------------------------------------------------------------- target
  const targetRow = el("div", "flex flex-wrap items-center gap-1.5");
  targetRow.append(el("span", "w-full shrink-0 text-[10px] text-slate-400", "مدت جلسه:"));
  for (const minutes of PRESET_MINUTES) {
    const active = target === minutes;
    targetRow.append(
      btn(
        `flex-1 basis-[30%] rounded-xl border py-1.5 text-[10px] font-bold transition active:scale-95 ${
          active
            ? "border-cyan-400 bg-cyan-500/15 text-cyan-200"
            : "border-slate-800 bg-slate-950 text-slate-400"
        }`,
        `${fa(minutes)} دقیقه`,
        () => {
          if (lang.targetMinutes === minutes) return;
          lang.targetMinutes = minutes;
          languageStudyTimer.reset(minutes * 60);
          softTap();
          persist(0);
          requestRender();
        },
        { "aria-pressed": String(active) },
      ),
    );
  }
  card.append(targetRow);

  // ----------------------------------------------------------- reminder
  const reminderBox = el("div", "space-y-2 rounded-2xl border border-slate-800 bg-slate-950/50 p-3");

  const head = el("div", "flex items-center justify-between gap-2");
  head.append(
    el(
      "p",
      "min-w-0 text-[11px] font-extrabold text-slate-200",
      `🔔 یادآور روزانه: ${fa(lang.reminderTime)}`,
    ),
    btn(
      lang.reminderEnabled ? "btn-primary shrink-0 px-3 py-1 text-[10px]" : "btn-ghost shrink-0 px-3 py-1 text-[10px]",
      lang.reminderEnabled ? "فعال 🔔" : "خاموش",
      async () => {
        lang.reminderEnabled = !lang.reminderEnabled;
        softTap();
        persist(0);
        if (lang.reminderEnabled) {
          const ok = await scheduleLanguageAlarm(lang.reminderTime);
          toast(
            ok
              ? `یادآور زبان برای ${fa(lang.reminderTime)} فعال شد 📚`
              : "یادآور داخل برنامه فعال شد (اعلان سیستمی در دسترس نیست).",
            ok ? "ok" : "info",
          );
        } else {
          await cancelNotifications([LANGUAGE_ALARM_ID]);
          toast("یادآور زبان خاموش شد.", "info");
        }
        requestRender();
      },
      { "aria-pressed": String(lang.reminderEnabled), "aria-label": "یادآور مطالعه زبان" },
    ),
  );
  reminderBox.append(head);

  const setTime = async (hour: number, minute: number) => {
    const totalMinutes = (((hour * 60 + minute) % 1440) + 1440) % 1440;
    const hh = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
    const mm = String(totalMinutes % 60).padStart(2, "0");
    lang.reminderTime = `${hh}:${mm}`;
    lang.reminderEnabled = true;
    softTap();
    persist(0);
    await scheduleLanguageAlarm(lang.reminderTime);
    requestRender();
  };

  const [currentHour, currentMinute] = lang.reminderTime.split(":").map((part) => Number.parseInt(part, 10) || 0);
  const stepperRow = el("div", "grid grid-cols-4 gap-1.5");
  stepperRow.append(
    btn("btn-ghost py-1.5 text-[10px]", "‎−۱ ساعت", () => void setTime(currentHour - 1, currentMinute)),
    btn("btn-ghost py-1.5 text-[10px]", "‎+۱ ساعت", () => void setTime(currentHour + 1, currentMinute)),
    btn("btn-ghost py-1.5 text-[10px]", "‎−۱۵ دقیقه", () => void setTime(currentHour, currentMinute - 15)),
    btn("btn-ghost py-1.5 text-[10px]", "‎+۱۵ دقیقه", () => void setTime(currentHour, currentMinute + 15)),
  );
  reminderBox.append(stepperRow);

  const presets = el("div", "flex flex-wrap gap-1.5");
  for (const time of PRESET_TIMES) {
    const active = lang.reminderTime === time;
    presets.append(
      btn(
        `rounded-xl border px-2.5 py-1 text-[10px] font-bold tabular-nums transition active:scale-95 ${
          active
            ? "border-cyan-400 bg-cyan-500/20 text-cyan-200"
            : "border-slate-800 bg-slate-900 text-slate-400"
        }`,
        `ساعت ${fa(time)}`,
        () => {
          const [hour, minute] = time.split(":").map((part) => Number.parseInt(part, 10));
          void setTime(hour, minute);
        },
        { "aria-pressed": String(active) },
      ),
    );
  }
  reminderBox.append(presets);
  card.append(reminderBox);

  return card;
}
