/**
 * Editable MSc (Electronics) class timetable for the university tab.
 *
 * Persian week starts on Saturday. `*` courses run on odd weeks, `**` on even
 * weeks, and the card has a switch for which half of the fortnight is showing —
 * so the same Monday 11:00 slot can hold two different classes.
 */
import { WEEK_DAYS } from "../data/courses";
import { btn, el, escapeHtml, svgIcon, uid } from "../lib/dom";
import { fa } from "../lib/fa";
import { icons } from "../lib/icons";
import { getState, persist, requestRender } from "../lib/store";
import { softTap } from "../lib/timer";
import type { CourseSession, SemesterWeekType } from "../types";
import { confirmDialog, openModal, sectionTitle, toast } from "../components/ui";

const WEEK_TYPE_LABEL: Record<CourseSession["weekType"], string> = {
  all: "هر هفته",
  odd: "* یک‌ستاره",
  even: "** دوستاره",
};

const WEEK_TYPE_CHIP: Record<CourseSession["weekType"], string> = {
  all: "chip-emerald",
  odd: "chip-cyan",
  even: "chip-amber",
};

/** Time presets: the 2-hour blocks the faculty actually uses. */
const SLOT_PRESETS: Array<[string, string]> = [
  ["08:00", "10:00"],
  ["09:00", "11:00"],
  ["11:00", "13:00"],
  ["14:00", "16:00"],
  ["16:00", "18:00"],
  ["18:00", "20:00"],
];

const toMinutes = (hhmm: string): number => {
  const [hour, minute] = hhmm.split(":").map((part) => Number.parseInt(part, 10) || 0);
  return hour * 60 + minute;
};

const toHhmm = (minutes: number): string => {
  const clamped = ((minutes % 1440) + 1440) % 1440;
  const hour = Math.floor(clamped / 60);
  const minute = clamped % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

/** True when the course runs in the given fortnight half. */
export function courseActiveThisWeek(course: CourseSession, week: SemesterWeekType): boolean {
  return course.weekType === "all" || course.weekType === week;
}

function coursesForDay(day: number): CourseSession[] {
  return (getState().courses ?? [])
    .filter((course) => course.dayOfWeek === day)
    .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
}

export function renderClassScheduleCard(): HTMLElement {
  const state = getState();
  const week: SemesterWeekType = state.semesterWeekType === "even" ? "even" : "odd";
  const today = new Date().getDay();

  const card = el("div", "card space-y-3");
  card.append(
    sectionTitle(
      "🎓 برنامه هفتگی کلاس‌ها",
      btn("btn-primary px-2.5 py-1 text-[11px]", "➕ افزودن درس", () => openCourseModal(), {
        "aria-label": "افزودن درس",
      }),
    ),
  );

  // ------------------------------------------------------- week switch
  const switchWrap = el(
    "div",
    "grid grid-cols-2 gap-1.5 rounded-2xl border border-slate-800 bg-slate-950/60 p-1.5",
  );
  const weekOptions: Array<{ id: SemesterWeekType; label: string }> = [
    { id: "odd", label: "★ هفته یک‌ستاره (*)" },
    { id: "even", label: "★★ هفته دوستاره (**)" },
  ];
  for (const option of weekOptions) {
    const active = week === option.id;
    switchWrap.append(
      btn(
        `rounded-xl border py-2 text-[11px] font-extrabold transition active:scale-95 ${
          active
            ? "border-emerald-400 bg-emerald-500/15 text-emerald-200"
            : "border-transparent text-slate-400"
        }`,
        option.label,
        () => {
          if (state.semesterWeekType === option.id) return;
          state.semesterWeekType = option.id;
          softTap();
          persist(0);
          requestRender();
        },
        { "aria-pressed": String(active) },
      ),
    );
  }
  card.append(switchWrap);

  // ------------------------------------------------------- day groups
  const list = el("div", "space-y-2");
  let rendered = 0;

  for (const day of WEEK_DAYS) {
    const courses = coursesForDay(day.day);
    if (courses.length === 0) continue;
    rendered += 1;

    const isToday = day.day === today;
    const box = el(
      "div",
      `space-y-2 rounded-2xl border p-2.5 ${
        isToday ? "border-emerald-500/40 bg-emerald-500/5" : "border-slate-800 bg-slate-950/50"
      }`,
    );

    const head = el("div", "flex items-center justify-between gap-2 border-b border-slate-800/70 pb-1.5");
    head.append(
      el(
        "p",
        `text-[11px] font-extrabold ${isToday ? "text-emerald-300" : "text-slate-200"}`,
        `${day.label}${isToday ? " • امروز" : ""}`,
      ),
      el("span", "text-[9px] text-slate-500", `${fa(courses.length)} جلسه`),
    );
    box.append(head);

    for (const course of courses) {
      box.append(courseRow(course, week));
    }
    list.append(box);
  }

  if (rendered === 0) {
    card.append(
      el(
        "div",
        "rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 px-4 py-5 text-center text-[11px] leading-6 text-slate-500",
        "هنوز درسی ثبت نشده. با «➕ افزودن درس» برنامه ترم را وارد کن.",
      ),
    );
  } else {
    card.append(list);
  }

  const total = (state.courses ?? []).filter((course) => courseActiveThisWeek(course, week)).length;
  card.append(
    el(
      "p",
      "text-center text-[10px] text-slate-500",
      `این هفته ${fa(total)} جلسه داری • * و ** یعنی هفته‌های فرد و زوج`,
    ),
  );

  return card;
}

function courseRow(course: CourseSession, week: SemesterWeekType): HTMLElement {
  const active = courseActiveThisWeek(course, week);

  const row = el(
    "div",
    `flex items-center gap-2 rounded-xl border px-2.5 py-2 transition ${
      active ? "border-slate-700/70 bg-slate-900/80" : "border-slate-800/40 bg-slate-950/40 opacity-45"
    }`,
  );

  const info = el("div", "min-w-0 flex-1");
  const titleRow = el("div", "flex flex-wrap items-center gap-1.5");
  titleRow.append(
    el("span", "text-[11px] font-extrabold leading-5 text-slate-100", escapeHtml(course.name)),
    el("span", `chip ${WEEK_TYPE_CHIP[course.weekType]}`, WEEK_TYPE_LABEL[course.weekType]),
  );
  info.append(titleRow);
  info.append(
    el(
      "p",
      "mt-1 text-[10px] leading-5 text-slate-400",
      `👨‍🏫 ${escapeHtml(course.professor || "—")} • ⏰ ${fa(course.startTime)} تا ${fa(course.endTime)}${
        active ? "" : " • این هفته تشکیل نمی‌شود"
      }`,
    ),
  );

  row.append(info);
  row.append(
    btn("btn-icon h-8 w-8 shrink-0", svgIcon(icons.edit, "h-3.5 w-3.5"), () => openCourseModal(course), {
      "aria-label": `ویرایش ${course.name}`,
    }),
  );
  return row;
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

function openCourseModal(existing?: CourseSession): void {
  const state = getState();
  let dayOfWeek = existing?.dayOfWeek ?? 0;
  let weekType: CourseSession["weekType"] = existing?.weekType ?? "all";
  let startTime = existing?.startTime ?? "09:00";
  let endTime = existing?.endTime ?? "11:00";

  const body = el("div", "space-y-3");

  const nameInput = el("input", "field text-right");
  nameInput.type = "text";
  nameInput.placeholder = "مثلاً: VLSI";
  nameInput.value = existing?.name ?? "";

  const profInput = el("input", "field text-right");
  profInput.type = "text";
  profInput.placeholder = "مثلاً: د. فرجی";
  profInput.value = existing?.professor ?? "";

  const textField = (label: string, input: HTMLElement): HTMLElement => {
    const wrap = el("div", "space-y-1");
    wrap.append(el("label", "label", escapeHtml(label)), input);
    return wrap;
  };
  body.append(textField("نام درس", nameInput), textField("نام استاد", profInput));

  // ------------------------------------------------------------------- day
  const dayWrap = el("div", "space-y-1");
  dayWrap.append(el("label", "label", "روز هفته"));
  const dayGrid = el("div", "grid grid-cols-4 gap-1.5");
  const paintDays = () => {
    dayGrid.replaceChildren();
    for (const day of WEEK_DAYS) {
      const active = dayOfWeek === day.day;
      dayGrid.append(
        btn(
          `rounded-xl border py-1.5 text-[11px] font-bold transition active:scale-95 ${
            active
              ? "border-emerald-400 bg-emerald-500/20 text-emerald-200"
              : "border-slate-800 bg-slate-950 text-slate-400"
          }`,
          day.label,
          () => {
            dayOfWeek = day.day;
            softTap();
            paintDays();
          },
          { "aria-pressed": String(active) },
        ),
      );
    }
  };
  paintDays();
  dayWrap.append(dayGrid);
  body.append(dayWrap);

  // ------------------------------------------------------------------ time
  const timeWrap = el("div", "space-y-1");
  timeWrap.append(el("label", "label", "ساعت کلاس"));

  const slotGrid = el("div", "grid grid-cols-3 gap-1.5");
  const paintSlots = () => {
    slotGrid.replaceChildren();
    for (const [start, end] of SLOT_PRESETS) {
      const active = startTime === start && endTime === end;
      slotGrid.append(
        btn(
          `rounded-xl border py-1.5 text-[10px] font-bold tabular-nums transition active:scale-95 ${
            active
              ? "border-cyan-400 bg-cyan-500/20 text-cyan-200"
              : "border-slate-800 bg-slate-950 text-slate-400"
          }`,
          `${fa(start)}–${fa(end)}`,
          () => {
            startTime = start;
            endTime = end;
            softTap();
            paintSlots();
            paintShift();
          },
          { "aria-pressed": String(active) },
        ),
      );
    }
  };

  // Half-hour shift keeps the lesson length, so odd start times stay reachable
  // without a keyboard.
  const shiftRow = el("div", "mt-1.5 flex items-center justify-between gap-2");
  const shiftLabel = el("p", "text-[10px] font-bold tabular-nums text-slate-300");
  const paintShift = () => {
    shiftLabel.textContent = `جابه‌جایی نیم‌ساعتی: ${fa(startTime)} تا ${fa(endTime)}`;
  };
  const shift = (delta: number) => {
    const length = Math.max(30, toMinutes(endTime) - toMinutes(startTime));
    startTime = toHhmm(toMinutes(startTime) + delta);
    endTime = toHhmm(toMinutes(startTime) + length);
    softTap();
    paintSlots();
    paintShift();
  };
  shiftRow.append(
    btn("btn-ghost px-2.5 py-1 text-[11px]", "‎−۳۰ دقیقه", () => shift(-30)),
    shiftLabel,
    btn("btn-ghost px-2.5 py-1 text-[11px]", "‎+۳۰ دقیقه", () => shift(30)),
  );

  paintSlots();
  paintShift();
  timeWrap.append(slotGrid, shiftRow);
  body.append(timeWrap);

  // ------------------------------------------------------------------ week
  const weekWrap = el("div", "space-y-1");
  weekWrap.append(el("label", "label", "نوع ارائه در هفته‌های زوج و فرد"));
  const weekGrid = el("div", "grid grid-cols-3 gap-1.5");
  const weekOptions: Array<{ id: CourseSession["weekType"]; label: string }> = [
    { id: "all", label: "هر هفته" },
    { id: "odd", label: "* هفته فرد" },
    { id: "even", label: "** هفته زوج" },
  ];
  const paintWeeks = () => {
    weekGrid.replaceChildren();
    for (const option of weekOptions) {
      const active = weekType === option.id;
      weekGrid.append(
        btn(
          `rounded-xl border py-1.5 text-[11px] font-bold transition active:scale-95 ${
            active
              ? "border-amber-400 bg-amber-500/20 text-amber-200"
              : "border-slate-800 bg-slate-950 text-slate-400"
          }`,
          option.label,
          () => {
            weekType = option.id;
            softTap();
            paintWeeks();
          },
          { "aria-pressed": String(active) },
        ),
      );
    }
  };
  paintWeeks();
  weekWrap.append(weekGrid);
  body.append(weekWrap);

  // ---------------------------------------------------------------- footer
  const footer = el("div", "flex items-center gap-2");

  const save = () => {
    const name = nameInput.value.trim();
    if (!name) {
      toast("نام درس را وارد کن.", "error");
      nameInput.focus();
      return;
    }
    const professor = profInput.value.trim() || "—";

    if (existing) {
      existing.name = name;
      existing.professor = professor;
      existing.dayOfWeek = dayOfWeek;
      existing.startTime = startTime;
      existing.endTime = endTime;
      existing.weekType = weekType;
    } else {
      state.courses = state.courses ?? [];
      state.courses.push({
        id: uid("course"),
        name,
        professor,
        dayOfWeek,
        startTime,
        endTime,
        weekType,
      });
    }

    softTap();
    persist(0);
    handle.close();
    toast(existing ? "درس بروزرسانی شد 🎓" : "درس به برنامه اضافه شد 🎓");
    requestRender();
  };

  footer.append(btn("btn-primary flex-1", existing ? "ذخیره تغییرات" : "افزودن درس", save));

  if (existing) {
    footer.append(
      btn("btn-danger px-3", "حذف", async () => {
        const ok = await confirmDialog({
          title: "حذف درس",
          message: `«${existing.name}» از برنامه هفتگی حذف شود؟`,
          confirmText: "حذف کن",
          danger: true,
        });
        if (!ok) return;
        state.courses = (state.courses ?? []).filter((course) => course.id !== existing.id);
        persist(0);
        handle.close();
        toast("درس حذف شد.", "info");
        requestRender();
      }),
    );
  }

  const handle = openModal({
    title: existing ? "ویرایش درس" : "افزودن درس جدید",
    subtitle: "برای ترم‌های بعد هم قابل تغییر است",
    body,
    footer,
  });
}
