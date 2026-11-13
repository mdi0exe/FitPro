/**
 * University tab: Tabriz University of Technology shuttle schedule, next-bus
 * radar, 15-minute bus alarms, Thursday cafeteria reservation and gym reminder.
 */
import { btn, el, escapeHtml, svgIcon, uid } from "../lib/dom";
import { icons } from "../lib/icons";
import { fa } from "../lib/fa";
import { getState, persist, requestRender } from "../lib/store";
import { openModal, sectionTitle, toast } from "../components/ui";
import type { CourseSession } from "../types";
import {
  cancelNotifications,
  ensureNotificationPermission,
  scheduleRepeatingNotification,
} from "../lib/notify";
import { softTap } from "../lib/timer";
import { parseShuttleJson, resolveShuttle, type ScheduleGroupKey } from "../data/shuttle";
import { renderClassScheduleCard } from "./uniCourses";
import { renderLanguageStudyCard } from "./uniLanguage";
import { openShuttleAiImportModal } from "./uniShuttleAi";

/** Active timetable: imported JSON when present, else the published table. */
function shuttle() {
  return resolveShuttle(getState().customShuttleJson);
}

/** Plugin weekday numbering: 1 = Sunday … 7 = Saturday. */
const GROUP_WEEKDAYS: Record<ScheduleGroupKey, number[]> = {
  "sun-wed": [1, 2, 3, 4],
  sat: [7],
  thu: [5],
  fri: [6],
  suburbs: [1, 2, 3, 4],
};

function detectTodayScheduleKey(): Exclude<ScheduleGroupKey, "suburbs"> {
  const day = new Date().getDay(); // 0 = Sunday … 6 = Saturday
  if (day === 6) return "sat";
  if (day === 4) return "thu";
  if (day === 5) return "fri";
  return "sun-wed";
}

let activeGroup: ScheduleGroupKey = detectTodayScheduleKey();

function ensureUniReminders() {
  const state = getState();
  state.uniReminders = state.uniReminders ?? {
    thursdayFoodEnabled: true,
    thursdayFoodTime: "12:00",
    gymReminderEnabled: false,
    gymReminderTime: "16:30",
    activeBusAlarms: [],
    foodReminderDay: 4,
  };
  if (!Number.isInteger(state.uniReminders.foodReminderDay)) {
    state.uniReminders.foodReminderDay = 4;
  }
  return state.uniReminders;
}

/** `Date.getDay()` → notification plugin weekday (1 = Sunday … 7 = Saturday). */
function foodAlarmWeekday(day: number): number {
  return Math.min(6, Math.max(0, day)) + 1;
}

export const FOOD_DAY_OPTIONS: Array<{ day: number; label: string }> = [
  { day: 2, label: "سهشنبه" },
  { day: 3, label: "چهارشنبه" },
  { day: 4, label: "پنجشنبه" },
  { day: 5, label: "جمعه" },
];

export function foodDayLabel(day: number): string {
  return FOOD_DAY_OPTIONS.find((option) => option.day === day)?.label ?? "پنجشنبه";
}

export function renderUni(): HTMLElement {
  const view = el("div", "space-y-3 animate-fade-up");
  view.append(
    uniHeroBanner(),
    shareUniversityCard(),
    nextBusRadarCard(),
    renderClassScheduleCard(),
    renderLanguageStudyCard(),
    reminderCard(),
    shuttleScheduleCard(),
  );
  return view;
}

function uniHeroBanner(): HTMLElement {
  const badge = el("div", "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-300");
  badge.append(svgIcon(icons.bus, "h-6 w-6"));

  const text = el("div", "min-w-0");
  text.append(
    el("p", "text-[10px] font-bold text-cyan-300", `${escapeHtml(getState().profile.universityName)} • اداره امور دانشجویان`),
    el("h2", "mt-0.5 text-base font-extrabold text-slate-50", "🚌 سرویس‌ها و رزرو سلف"),
    el(
      "p",
      "mt-1 text-[11px] leading-6 text-slate-400",
      `برنامه سرویس‌های راه‌آهن، خسروشهر، اسکو، شرق و میدان فهمیده (اجرا از ${shuttle().effectiveDate})`,
    ),
  );

  const row = el("div", "card flex items-start gap-3 border-cyan-500/25 bg-cyan-500/5");
  row.append(badge, text);
  return row;
}

// ---------------------------------------------------------------------------
// Share / import the university setup with classmates
// ---------------------------------------------------------------------------

interface UniSharePayload {
  universityName: string;
  courses: CourseSession[];
  customShuttleJson: string | null;
}

function sharePayload(): UniSharePayload {
  const state = getState();
  return {
    universityName: state.profile.universityName,
    courses: state.courses,
    customShuttleJson: state.customShuttleJson,
  };
}

function shareUniversityCard(): HTMLElement {
  const card = el("div", "card space-y-2 border-cyan-500/25 bg-cyan-500/5");
  card.append(
    el("p", "text-xs font-extrabold text-slate-100", "📤 اشتراکگذاری سرویس و دروس با همدانشگاهیها"),
    el(
      "p",
      "text-[10px] leading-5 text-slate-400",
      "جدول سرویسها و برنامه کلاسهای دانشگاهت را بهصورت یک JSON فشرده توی پیامرسان بفرست یا از پیام دوستت دریافت کن.",
    ),
  );
  const row = el("div", "grid grid-cols-2 gap-2");
  row.append(
    btn("btn-ghost py-2 text-[11px]", "📋 کپی JSON", () => void copyShareJson(), {
      "aria-label": "کپی JSON سرویس و دروس",
    }),
    btn("btn-ghost py-2 text-[11px]", "📥 دریافت و اعمال", () => void openShareImportModal(), {
      "aria-label": "دریافت برنامه سرویس و دروس",
    }),
  );
  card.append(row);
  return card;
}

async function copyShareJson(): Promise<void> {
  const json = JSON.stringify(sharePayload());
  let copied = false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(json);
      copied = true;
    }
  } catch {
    /* the WebView may deny clipboard access */
  }
  if (!copied) {
    const temp = el("textarea", "sr-only");
    temp.value = json;
    document.body.append(temp);
    temp.select();
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    temp.remove();
  }
  if (copied) toast("JSON سرویسها و دروس کپی شد؛ برای همدانشگاهیها بفرست 📤");
  else openShareJsonModal(json, "export");
}

async function openShareImportModal(): Promise<void> {
  let text = "";
  try {
    if (navigator.clipboard?.readText) text = await navigator.clipboard.readText();
  } catch {
    /* manual paste below */
  }
  openShareJsonModal(text, "import");
}

function openShareJsonModal(initial: string, mode: "export" | "import"): void {
  const body = el("div", "space-y-2");
  body.append(
    el(
      "p",
      "text-[11px] leading-6 text-slate-400",
      mode === "export"
        ? "دسترسی کلیپبورد در دسترس نیست؛ متن زیر را انتخاب و بهصورت دستی کپی کن."
        : "JSON دریافتی از همهرشتهایات را اینجا بچسبان (شامل نام دانشگاه، دروس و جدول سرویسها).",
    ),
  );
  const area = el("textarea", "field h-40 w-full resize-none text-left text-[10px] leading-5");
  area.value = initial;
  area.readOnly = mode === "export";
  area.setAttribute("dir", "ltr");
  if (mode === "import") area.placeholder = '{ "universityName": "...", "courses": [], "customShuttleJson": null }';
  body.append(area);

  const footer =
    mode === "export"
      ? btn(
          "btn-primary w-full",
          "📋 انتخاب کل متن",
          () => {
            area.select();
            toast("متن انتخاب شد؛ با Ctrl+C یا لمس طولانی کپی کن.");
          },
          { "aria-label": "انتخاب کل متن JSON" },
        )
      : btn(
          "btn-primary w-full",
          "✅ اعمال برنامه دانشگاه",
          () => applyShareJson(area.value, () => handle.close()),
          { "aria-label": "اعمال برنامه دانشگاه" },
        );

  const handle = openModal({
    title: mode === "export" ? "📤 JSON سرویسها و دروس" : "📥 دریافت برنامه دانشگاه",
    body,
    footer,
  });
}

/** Validates and applies a shared payload; a bad paste never corrupts state. */
function applyShareJson(raw: string, close: () => void): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    toast("متن واردشده JSON معتبر نیست.", "error");
    return;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    toast("ساختار JSON باید یک شیء باشد.", "error");
    return;
  }
  const data = parsed as Partial<UniSharePayload>;
  const state = getState();

  if (typeof data.universityName === "string" && data.universityName.trim()) {
    state.profile.universityName = data.universityName.trim().slice(0, 80);
  }

  if (Array.isArray(data.courses)) {
    const weekTypes = ["all", "odd", "even"];
    state.courses = data.courses
      .filter((course) => course && typeof course.name === "string" && course.name.trim())
      .slice(0, 60)
      .map((course) => ({
        id: typeof course.id === "string" && course.id ? course.id : uid("course"),
        name: String(course.name).trim().slice(0, 80),
        professor: typeof course.professor === "string" ? course.professor.trim().slice(0, 80) : "",
        dayOfWeek: Number.isInteger(course.dayOfWeek) ? Math.min(6, Math.max(0, course.dayOfWeek)) : 0,
        startTime: typeof course.startTime === "string" ? course.startTime : "09:00",
        endTime: typeof course.endTime === "string" ? course.endTime : "11:00",
        weekType: (weekTypes.includes(String(course.weekType)) ? course.weekType : "all") as CourseSession["weekType"],
      }));
  }

  if (data.customShuttleJson === null || data.customShuttleJson === undefined) {
    state.customShuttleJson = null;
  } else if (typeof data.customShuttleJson === "string" && parseShuttleJson(data.customShuttleJson)) {
    state.customShuttleJson = data.customShuttleJson.trim();
  }

  persist(0);
  close();
  toast("برنامه سرویسها و دروس دانشگاه اعمال شد 🎓");
  requestRender();
}

function parseMinutes(hhmm: string): number {
  const [hour, minute] = hhmm.split(":").map((part) => Number.parseInt(part, 10) || 0);
  return hour * 60 + minute;
}

function nextBusRadarCard(): HTMLElement {
  const todayKey = detectTodayScheduleKey();
  const schedule = shuttle().railway[todayKey];
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const findNext = (times: string[]) => {
    for (const time of times) {
      const diff = parseMinutes(time) - nowMinutes;
      if (diff >= 0) return { time, diff };
    }
    return null;
  };

  const card = el("div", "card space-y-2.5 border-emerald-500/25 bg-emerald-500/5");
  card.append(
    sectionTitle(
      `⏳ رادار سرویس امروز (${schedule.title})`,
      el(
        "span",
        "chip chip-emerald",
        fa(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`),
      ),
    ),
  );

  const radarBox = (label: string, next: { time: string; diff: number } | null, accent: string) => {
    const box = el("div", "rounded-2xl border border-slate-800 bg-slate-950/70 p-3 text-center");
    if (!next) {
      box.append(
        el("p", "text-[10px] text-slate-400", label),
        el("p", "mt-1 text-xs font-bold text-slate-500", "سرویس‌های امروز تمام شد"),
      );
    } else {
      const hours = Math.floor(next.diff / 60);
      const mins = next.diff % 60;
      const remain =
        hours > 0 ? `${fa(hours)} ساعت و ${fa(mins)} دقیقه دیگر` : `${fa(mins)} دقیقه دیگر`;
      box.append(
        el("p", "text-[10px] text-slate-400", label),
        el("p", `mt-1 text-xl font-black ${accent}`, fa(next.time)),
        el("p", "mt-0.5 text-[10px] font-bold text-slate-300", remain),
      );
    }
    return box;
  };

  const grid = el("div", "grid grid-cols-2 gap-2");
  grid.append(
    radarBox("از دانشگاه", findNext(schedule.fromUni), "text-emerald-400"),
    radarBox("از راه‌آهن", findNext(schedule.fromRailway), "text-cyan-400"),
  );
  card.append(grid);

  const tomorrow = detectTodayScheduleKey();
  if (tomorrow === "fri") {
    card.append(
      el("p", "text-center text-[10px] text-amber-300", "فردا جمعه است؛ برنامه تعطیلات اعمال می‌شود."),
    );
  }

  return card;
}

function reminderCard(): HTMLElement {
  const reminders = ensureUniReminders();
  const foodDay = reminders.foodReminderDay;
  const dayLabel = foodDayLabel(foodDay);
  const isFoodDay = new Date().getDay() === foodDay;

  const card = el("div", "card space-y-3");
  card.append(
    sectionTitle(
      "🍱 یادآور رزرو سلف و باشگاه",
      el(
        "span",
        `chip ${isFoodDay ? "chip-amber" : "chip-cyan"}`,
        isFoodDay ? `امروز ${dayLabel}!` : `${dayLabel}‌ها`,
      ),
    ),
  );

  // ---------------------------------------------------------- Thursday food
  const foodBox = el(
    "div",
    `space-y-2.5 rounded-2xl border p-3 ${
      reminders.thursdayFoodEnabled
        ? "border-amber-500/35 bg-amber-500/10"
        : "border-slate-800 bg-slate-950/50"
    }`,
  );

  const foodHead = el("div", "flex items-start justify-between gap-2");
  foodHead.append(
    el(
      "div",
      "min-w-0 flex-1",
      `<p class="text-xs font-extrabold text-amber-200">🍱 رزرو غذای هفته بعد (${dayLabel}‌ها)</p>
       <p class="mt-0.5 text-[10px] leading-5 text-slate-300">
         هر ${dayLabel} یادآوری می‌کند تا سلف هفته بعد را رزرو کنی (اولویت: جوجه و مرغ برای پروتئین).
       </p>`,
    ),
    btn(
      reminders.thursdayFoodEnabled ? "btn-primary shrink-0 px-3 py-1.5 text-xs" : "btn-ghost shrink-0 px-3 py-1.5 text-xs",
      reminders.thursdayFoodEnabled ? "🔔 فعال" : "خاموش",
      () => void toggleThursdayFood(),
      { "aria-pressed": String(reminders.thursdayFoodEnabled), "aria-label": "یادآور رزرو سلف" },
    ),
  );
  foodBox.append(foodHead);

  // Not every campus opens reservations on Thursday: the day is per-student.
  const foodDays = el("div", "flex flex-wrap items-center gap-1.5");
  foodDays.append(el("span", "text-[10px] text-slate-400", "روز رزرو:"));
  FOOD_DAY_OPTIONS.forEach(({ day, label }) => {
    const active = foodDay === day;
    foodDays.append(
      btn(
        `rounded-xl border px-2.5 py-1 text-[11px] font-bold transition ${
          active
            ? "border-amber-400 bg-amber-400/20 text-amber-200"
            : "border-slate-800 bg-slate-900 text-slate-400"
        }`,
        label,
        () => void setFoodReminderDay(day),
        { "aria-label": `روز رزرو سلف ${label}`, "aria-pressed": String(active) },
      ),
    );
  });
  foodBox.append(foodDays);

  const foodTimes = el("div", "flex flex-wrap items-center gap-1.5");
  foodTimes.append(el("span", "text-[10px] text-slate-400", "ساعت یادآوری:"));
  ["10:00", "12:00", "16:00", "20:00"].forEach((time) => {
    const active = reminders.thursdayFoodTime === time;
    foodTimes.append(
      btn(
        `rounded-xl border px-2.5 py-1 text-[11px] font-bold transition ${
          active
            ? "border-amber-400 bg-amber-400/20 text-amber-200"
            : "border-slate-800 bg-slate-900 text-slate-400"
        }`,
        `ساعت ${fa(time)}`,
        () => void setThursdayFoodTime(time),
        { "aria-label": `ساعت یادآوری سلف ${fa(time)}` },
      ),
    );
  });
  foodBox.append(foodTimes);

  // --------------------------------------------------------------- gym time
  const gymBox = el(
    "div",
    `space-y-2.5 rounded-2xl border p-3 ${
      reminders.gymReminderEnabled
        ? "border-emerald-500/35 bg-emerald-500/10"
        : "border-slate-800 bg-slate-950/50"
    }`,
  );
  const gymHead = el("div", "flex items-start justify-between gap-2");
  gymHead.append(
    el(
      "div",
      "min-w-0 flex-1",
      `<p class="text-xs font-extrabold text-emerald-200">🎒 یادآور رفتن به باشگاه</p>
       <p class="mt-0.5 text-[10px] leading-5 text-slate-300">
         ۱٫۵ ساعت قبل از شام سلف برو باشگاه تا شامت وعده ریکاوری بعد تمرین شود.
       </p>`,
    ),
    btn(
      reminders.gymReminderEnabled ? "btn-primary shrink-0 px-3 py-1.5 text-xs" : "btn-ghost shrink-0 px-3 py-1.5 text-xs",
      reminders.gymReminderEnabled ? "🔔 فعال" : "خاموش",
      () => void toggleGymReminder(),
      { "aria-pressed": String(reminders.gymReminderEnabled), "aria-label": "یادآور باشگاه" },
    ),
  );
  gymBox.append(gymHead);

  const gymTimes = el("div", "flex flex-wrap items-center gap-1.5");
  gymTimes.append(el("span", "text-[10px] text-slate-400", "ساعت یادآوری:"));
  ["15:30", "16:00", "16:30", "17:00"].forEach((time) => {
    const active = reminders.gymReminderTime === time;
    gymTimes.append(
      btn(
        `rounded-xl border px-2.5 py-1 text-[11px] font-bold transition ${
          active
            ? "border-emerald-400 bg-emerald-400/20 text-emerald-200"
            : "border-slate-800 bg-slate-900 text-slate-400"
        }`,
        `ساعت ${fa(time)}`,
        () => void setGymTime(time),
        { "aria-label": `ساعت یادآوری باشگاه ${fa(time)}` },
      ),
    );
  });
  gymBox.append(gymTimes);

  card.append(foodBox, gymBox);
  return card;
}

function shuttleScheduleCard(): HTMLElement {
  const reminders = ensureUniReminders();
  const card = el("div", "card space-y-3");
  card.append(
    sectionTitle(
      "🚌 جدول کامل سرویس‌ها",
      el("span", "chip", "🔔 = یادآور ۱۵ دقیقه قبل"),
    ),
  );

  // Future semesters: replace the whole table from an AI-extracted JSON.
  card.append(
    btn(
      "btn-ghost w-full border-dashed text-[11px] text-slate-300",
      "🤖 تغییر برنامه سرویس‌ها با هوش مصنوعی",
      () => openShuttleAiImportModal(),
      { "aria-label": "بروزرسانی سرویس‌ها با هوش مصنوعی" },
    ),
  );

  const tabs: Array<{ id: ScheduleGroupKey; label: string }> = [
    { id: "sun-wed", label: "یکشنبه تا چهارشنبه" },
    { id: "sat", label: "شنبه" },
    { id: "thu", label: "پنجشنبه" },
    { id: "fri", label: "جمعه/تعطیل" },
    { id: "suburbs", label: "خسروشهر / اسکو / شرق / فهمیده" },
  ];

  const timetable = shuttle();
  const tabBar = el("div", "flex flex-wrap gap-1.5");
  for (const tab of tabs) {
    const active = activeGroup === tab.id;
    tabBar.append(
      btn(
        `rounded-xl border px-2.5 py-1.5 text-[11px] font-extrabold transition ${
          active
            ? "border-emerald-400 bg-emerald-500/15 text-emerald-300"
            : "border-slate-800 bg-slate-950/60 text-slate-400"
        }`,
        tab.label,
        () => {
          activeGroup = tab.id;
          softTap();
          requestRender();
        },
        { "aria-pressed": String(active) },
      ),
    );
  }
  card.append(tabBar);

  if (activeGroup === "suburbs") {
    const list = el("div", "space-y-2");
    list.append(
      el(
        "p",
        "text-[11px] font-bold text-amber-300",
        "مسیرهای خسروشهر، اسکو، شرق و میدان شهید فهمیده (یکشنبه تا چهارشنبه):",
      ),
    );

    for (const item of timetable.suburbs) {
      const box = el("div", "space-y-2 rounded-2xl border border-slate-800 bg-slate-950/60 p-3");
      box.append(
        el("p", "text-xs font-extrabold text-slate-100", escapeHtml(item.route)),
        el("p", "text-[10px] text-slate-400", escapeHtml(item.direction)),
      );
      const row = el("div", "flex flex-wrap gap-2");
      for (const time of item.times) {
        row.append(
          renderBusTimeChip("suburbs", `suburb-${item.id}-${time}`, time, item.route),
        );
      }
      box.append(row);
      list.append(box);
    }
    card.append(list);
    return card;
  }

  const schedule = timetable.railway[activeGroup];
  const grid = el("div", "grid grid-cols-2 gap-2.5");

  const column = (title: string, times: string[], direction: "uni" | "rail", accent: string) => {
    const col = el("div", `space-y-2 rounded-2xl border p-3 ${accent}`);
    col.append(
      el(
        "p",
        "border-b border-slate-800 pb-1.5 text-center text-xs font-extrabold text-slate-200",
        title,
      ),
    );
    const list = el("div", "flex flex-col gap-1.5");
    for (const time of times) {
      const key = `${activeGroup}-${direction}-${time}`;
      list.append(
        renderBusTimeChip(
          activeGroup,
          key,
          time,
          direction === "uni" ? `دانشگاه ← راه‌آهن (${schedule.title})` : `راه‌آهن ← دانشگاه (${schedule.title})`,
        ),
      );
    }
    col.append(list);
    return col;
  };

  grid.append(
    column("از دانشگاه", schedule.fromUni, "uni", "border-emerald-500/25 bg-slate-950/60"),
    column("از راه‌آهن", schedule.fromRailway, "rail", "border-cyan-500/25 bg-slate-950/60"),
  );
  card.append(grid);

  if (reminders.activeBusAlarms.length > 0) {
    card.append(
      el(
        "p",
        "pt-1 text-center text-[10px] text-emerald-300/90",
        `🔔 ${fa(reminders.activeBusAlarms.length)} یادآور سرویس فعال است.`,
      ),
    );
  }

  return card;
}

function renderBusTimeChip(
  group: ScheduleGroupKey,
  alarmKey: string,
  time: string,
  routeTitle: string,
): HTMLElement {
  const reminders = ensureUniReminders();
  const active = reminders.activeBusAlarms.includes(alarmKey);

  return btn(
    `flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs font-extrabold transition active:scale-95 ${
      active
        ? "border-emerald-400 bg-emerald-500/20 text-emerald-200"
        : "border-slate-800 bg-slate-900/80 text-slate-200"
    }`,
    `<span class="tabular-nums">${fa(time)}</span>
     <span class="text-[10px] ${active ? "text-emerald-300" : "text-slate-500"}">
       ${active ? "🔔 فعال" : "🔕"}
     </span>`,
    () => void toggleBusAlarm(group, alarmKey, time, routeTitle),
    {
      "aria-label": `یادآور سرویس ${fa(time)}`,
      "aria-pressed": String(active),
    },
  );
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

function hashCode(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (Math.imul(31, hash) + value.charCodeAt(index)) | 0;
  }
  return hash;
}

/** 8100..8739, one id per (alarm key, weekday); never collides with water 7701. */
function busAlarmId(key: string, weekday: number): number {
  return 8100 + (Math.abs(hashCode(key)) % 80) * 8 + weekday;
}

/** Moves `hhmm` earlier by `delta` minutes (same day for every published time). */
function shiftEarlier(hhmm: string, delta: number): { hour: number; minute: number } {
  const total = ((parseMinutes(hhmm) - delta) % 1440 + 1440) % 1440;
  return { hour: Math.floor(total / 60), minute: total % 60 };
}

async function toggleBusAlarm(
  group: ScheduleGroupKey,
  key: string,
  time: string,
  routeTitle: string,
): Promise<void> {
  const reminders = ensureUniReminders();
  const index = reminders.activeBusAlarms.indexOf(key);
  softTap();

  if (index >= 0) {
    reminders.activeBusAlarms.splice(index, 1);
    persist(0);
    await cancelNotifications([1, 2, 3, 4, 5, 6, 7].map((weekday) => busAlarmId(key, weekday)));
    toast(`یادآور سرویس ${fa(time)} خاموش شد.`, "info");
    requestRender();
    return;
  }

  const at = shiftEarlier(time, 15);
  // Ask for permission from this tap, but never lose the user's choice if the
  // OS says no — the in-app radar still works.
  const granted = await ensureNotificationPermission();
  let scheduled = false;
  if (granted) {
    for (const weekday of GROUP_WEEKDAYS[group]) {
      scheduled =
        (await scheduleRepeatingNotification(
          busAlarmId(key, weekday),
          `🚌 ۱۵ دقیقه تا سرویس ${fa(time)}`,
          `${routeTitle} ساعت ${fa(time)} حرکت می‌کند. آماده باش!`,
          { hour: at.hour, minute: at.minute, weekday },
        )) || scheduled;
    }
  }

  reminders.activeBusAlarms.push(key);
  persist(0);
  toast(
    scheduled
      ? `یادآور ۱۵ دقیقه قبل از سرویس ${fa(time)} تنظیم شد 🚌`
      : `یادآور داخل برنامه برای ${fa(time)} ثبت شد (اعلان سیستمی در دسترس نیست).`,
    scheduled ? "ok" : "info",
  );
  requestRender();
}

/** Weekly cafeteria alarm on the student-selected weekday. */
async function scheduleFoodAlarm(): Promise<boolean> {
  const reminders = ensureUniReminders();
  const granted = await ensureNotificationPermission();
  if (!granted) return false;
  const at = shiftEarlier(reminders.thursdayFoodTime, 0);
  const label = foodDayLabel(reminders.foodReminderDay);
  return scheduleRepeatingNotification(
    7901,
    "🍱 یادآور رزرو غذای سلف",
    `امروز ${label} است! غذای هفته بعد سلف را رزرو کن (اولویت: چلو جوجه و مرغ).`,
    { hour: at.hour, minute: at.minute, weekday: foodAlarmWeekday(reminders.foodReminderDay) },
  );
}

async function toggleThursdayFood(): Promise<void> {
  const reminders = ensureUniReminders();
  reminders.thursdayFoodEnabled = !reminders.thursdayFoodEnabled;
  softTap();
  persist(0);

  if (reminders.thursdayFoodEnabled) {
    const ok = await scheduleFoodAlarm();
    toast(ok ? "یادآور رزرو سلف فعال شد 🍱" : "یادآور داخل برنامه فعال شد (اعلان سیستمی در دسترس نیست).", ok ? "ok" : "info");
  } else {
    await cancelNotifications([7901]);
    toast("یادآور رزرو سلف خاموش شد.", "info");
  }
  requestRender();
}

async function setThursdayFoodTime(time: string): Promise<void> {
  const reminders = ensureUniReminders();
  reminders.thursdayFoodTime = time;
  reminders.thursdayFoodEnabled = true;
  softTap();
  persist(0);

  const ok = await scheduleFoodAlarm();
  toast(ok ? `یادآور ${foodDayLabel(reminders.foodReminderDay)} ساعت ${fa(time)} تنظیم شد ✅` : `ساعت ${fa(time)} ذخیره شد.`, ok ? "ok" : "info");
  requestRender();
}

async function setFoodReminderDay(day: number): Promise<void> {
  const reminders = ensureUniReminders();
  reminders.foodReminderDay = day;
  softTap();
  persist(0);

  if (reminders.thursdayFoodEnabled) await scheduleFoodAlarm();
  toast(`روز رزرو سلف: ${foodDayLabel(day)} 🍱`);
  requestRender();
}

async function toggleGymReminder(): Promise<void> {
  const reminders = ensureUniReminders();
  reminders.gymReminderEnabled = !reminders.gymReminderEnabled;
  softTap();
  persist(0);

  if (reminders.gymReminderEnabled) {
    const granted = await ensureNotificationPermission();
    const at = shiftEarlier(reminders.gymReminderTime, 0);
    const ok =
      granted &&
      (await scheduleRepeatingNotification(
        7902,
        "🎒 وقت رفتن به باشگاه!",
        "۱٫۵ ساعت قبل از شام سلف تمرین کن تا شامت وعده ریکاوری بعد تمرین شود 💪",
        { hour: at.hour, minute: at.minute },
      ));
    toast(ok ? `یادآور باشگاه برای ${fa(reminders.gymReminderTime)} فعال شد 💪` : "یادآور داخل برنامه فعال شد.", ok ? "ok" : "info");
  } else {
    await cancelNotifications([7902]);
    toast("یادآور باشگاه خاموش شد.", "info");
  }
  requestRender();
}

async function setGymTime(time: string): Promise<void> {
  const reminders = ensureUniReminders();
  reminders.gymReminderTime = time;
  reminders.gymReminderEnabled = true;
  softTap();
  persist(0);

  const granted = await ensureNotificationPermission();
  const at = shiftEarlier(time, 0);
  const ok =
    granted &&
    (await scheduleRepeatingNotification(
      7902,
      "🎒 وقت رفتن به باشگاه!",
      "۱٫۵ ساعت قبل از شام سلف تمرین کن تا شامت وعده ریکاوری بعد تمرین شود 💪",
      { hour: at.hour, minute: at.minute },
    ));
  toast(ok ? `یادآور باشگاه روی ${fa(time)} تنظیم شد 💪` : `ساعت ${fa(time)} ذخیره شد.`, ok ? "ok" : "info");
  requestRender();
}
