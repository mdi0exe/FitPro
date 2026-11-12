/**
 * University tab: Tabriz University of Technology shuttle schedule, next-bus
 * radar, 15-minute bus alarms, Thursday cafeteria reservation and gym reminder.
 */
import { btn, el, escapeHtml, svgIcon } from "../lib/dom";
import { icons } from "../lib/icons";
import { fa } from "../lib/fa";
import { getState, persist, requestRender } from "../lib/store";
import { sectionTitle, toast } from "../components/ui";
import {
  cancelNotifications,
  ensureNotificationPermission,
  scheduleRepeatingNotification,
} from "../lib/notify";
import { softTap } from "../lib/timer";

type ScheduleGroupKey = "sun-wed" | "sat" | "thu" | "fri" | "suburbs";

interface RailwaySchedule {
  title: string;
  fromRailway: string[];
  fromUni: string[];
}

const RAILWAY_SCHEDULES: Record<Exclude<ScheduleGroupKey, "suburbs">, RailwaySchedule> = {
  "sun-wed": {
    title: "یکشنبه تا چهارشنبه",
    fromRailway: ["08:15", "10:00", "13:00", "15:00", "19:15", "21:00"],
    fromUni: ["09:10", "11:15", "14:00", "16:00", "18:00", "20:00"],
  },
  sat: {
    title: "شنبه‌ها",
    fromRailway: ["08:15", "21:00"],
    fromUni: ["09:30", "16:00"],
  },
  thu: {
    title: "پنجشنبه‌ها",
    fromRailway: ["08:15", "21:00"],
    fromUni: ["09:30", "15:00"],
  },
  fri: {
    title: "جمعه‌ها و ایام تعطیل",
    fromRailway: ["09:00", "21:00"],
    fromUni: ["10:00", "15:00"],
  },
};

/** Plugin weekday numbering: 1 = Sunday … 7 = Saturday. */
const GROUP_WEEKDAYS: Record<ScheduleGroupKey, number[]> = {
  "sun-wed": [1, 2, 3, 4],
  sat: [7],
  thu: [5],
  fri: [6],
  suburbs: [1, 2, 3, 4],
};

const SUBURB_ROUTES: Array<{ id: string; route: string; direction: string; times: string[] }> = [
  {
    id: "khosro-to-uni",
    route: "خسروشهر ← دانشگاه",
    direction: "حرکت مینی‌بوس از فلکه اصلی خسروشهر به دانشگاه",
    times: ["08:15"],
  },
  {
    id: "osku-to-uni",
    route: "اسکو ← دانشگاه",
    direction: "حرکت مینی‌بوس از اسکو به دانشگاه",
    times: ["08:25"],
  },
  {
    id: "uni-to-khosro-osku",
    route: "دانشگاه ← خسروشهر و اسکو",
    direction: "حرکت از دانشگاه به خسروشهر و از مسیر اسکو",
    times: ["16:00", "18:00"],
  },
  {
    id: "east-to-uni",
    route: "شرق تبریز ← دانشگاه",
    direction: "حرکت از شرق تبریز به دانشگاه",
    times: ["08:00"],
  },
  {
    id: "uni-to-east",
    route: "دانشگاه ← شرق تبریز",
    direction: "حرکت از دانشگاه به شرق تبریز",
    times: ["16:00", "18:00"],
  },
  {
    id: "fahmideh-to-uni",
    route: "میدان شهید فهمیده ← دانشگاه",
    direction: "حرکت از میدان شهید فهمیده تبریز به دانشگاه",
    times: ["07:45"],
  },
];

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
  };
  return state.uniReminders;
}

export function renderUni(): HTMLElement {
  const view = el("div", "space-y-3 animate-fade-up");
  view.append(uniHeroBanner(), nextBusRadarCard(), reminderCard(), shuttleScheduleCard());
  return view;
}

function uniHeroBanner(): HTMLElement {
  const badge = el("div", "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-300");
  badge.append(svgIcon(icons.bus, "h-6 w-6"));

  const text = el("div", "min-w-0");
  text.append(
    el("p", "text-[10px] font-bold text-cyan-300", "دانشگاه صنعتی تبریز • اداره امور دانشجویان"),
    el("h2", "mt-0.5 text-base font-extrabold text-slate-50", "🚌 سرویس‌ها و رزرو سلف"),
    el(
      "p",
      "mt-1 text-[11px] leading-6 text-slate-400",
      "برنامه رسمی سرویس‌های راه‌آهن، خسروشهر، اسکو، شرق و میدان فهمیده (اجرا از ۱۴۰۵/۰۸/۲۳)",
    ),
  );

  const row = el("div", "card flex items-start gap-3 border-cyan-500/25 bg-cyan-500/5");
  row.append(badge, text);
  return row;
}

function parseMinutes(hhmm: string): number {
  const [hour, minute] = hhmm.split(":").map((part) => Number.parseInt(part, 10) || 0);
  return hour * 60 + minute;
}

function nextBusRadarCard(): HTMLElement {
  const todayKey = detectTodayScheduleKey();
  const schedule = RAILWAY_SCHEDULES[todayKey];
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
  const isThursday = new Date().getDay() === 4;

  const card = el("div", "card space-y-3");
  card.append(
    sectionTitle(
      "🍱 یادآور رزرو سلف و باشگاه",
      el("span", `chip ${isThursday ? "chip-amber" : "chip-cyan"}`, isThursday ? "امروز پنجشنبه!" : "پنجشنبه‌ها"),
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
      `<p class="text-xs font-extrabold text-amber-200">🍱 رزرو غذای هفته بعد (پنجشنبه‌ها)</p>
       <p class="mt-0.5 text-[10px] leading-5 text-slate-300">
         هر پنجشنبه یادآوری می‌کند تا سلف هفته بعد را رزرو کنی (اولویت: جوجه و مرغ برای پروتئین).
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

  const tabs: Array<{ id: ScheduleGroupKey; label: string }> = [
    { id: "sun-wed", label: "یکشنبه تا چهارشنبه" },
    { id: "sat", label: "شنبه" },
    { id: "thu", label: "پنجشنبه" },
    { id: "fri", label: "جمعه/تعطیل" },
    { id: "suburbs", label: "خسروشهر / اسکو / شرق / فهمیده" },
  ];

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

    for (const item of SUBURB_ROUTES) {
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

  const schedule = RAILWAY_SCHEDULES[activeGroup];
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

async function toggleThursdayFood(): Promise<void> {
  const reminders = ensureUniReminders();
  reminders.thursdayFoodEnabled = !reminders.thursdayFoodEnabled;
  softTap();
  persist(0);

  if (reminders.thursdayFoodEnabled) {
    const granted = await ensureNotificationPermission();
    const at = shiftEarlier(reminders.thursdayFoodTime, 0);
    const ok =
      granted &&
      (await scheduleRepeatingNotification(
        7901,
        "🍱 یادآور رزرو غذای سلف",
        "پنجشنبه است! غذای هفته بعد سلف را رزرو کن (اولویت: چلو جوجه و مرغ).",
        { hour: at.hour, minute: at.minute, weekday: 5 },
      ));
    toast(ok ? "یادآور پنجشنبه‌ها فعال شد 🍱" : "یادآور داخل برنامه فعال شد (اعلان سیستمی در دسترس نیست).", ok ? "ok" : "info");
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

  const granted = await ensureNotificationPermission();
  const at = shiftEarlier(time, 0);
  const ok =
    granted &&
    (await scheduleRepeatingNotification(
      7901,
      "🍱 یادآور رزرو غذای سلف",
      "پنجشنبه است! غذای هفته بعد سلف را رزرو کن (اولویت: چلو جوجه و مرغ).",
      { hour: at.hour, minute: at.minute, weekday: 5 },
    ));
  toast(ok ? `یادآور پنجشنبه ساعت ${fa(time)} تنظیم شد ✅` : `ساعت ${fa(time)} ذخیره شد.`, ok ? "ok" : "info");
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
