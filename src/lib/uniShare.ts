/**
 * Share / import of the university data, split by topic.
 *
 * The old card bundled the class timetable and the shuttle schedule into one
 * "کپی JSON" button. In practice people only ever want one of the two — a
 * classmate needs the timetable, a fellow commuter needs the bus times — and a
 * combined payload silently overwrote the other half on import. So each side
 * now owns its own copy/receive pair, and an import only touches the fields
 * that are actually present in the JSON.
 */
import { parseShuttleJson, resolveShuttle } from "../data/shuttle";
import { btn, el, svgIcon, uid } from "../lib/dom";
import { icons } from "../lib/icons";
import { openModal, toast } from "../components/ui";
import type { CourseSession } from "../types";
import { getState, persist, requestRender } from "./store";
import { copyText } from "./clipboard";
import { pruneBusAlarms } from "../views/uni";

/** Which half of the university data a share action moves around. */
export type UniShareScope = "courses" | "shuttle";

interface UniSharePayload {
  /** Present in a timetable share; tells the receiver what it got. */
  kind?: string;
  universityName?: string;
  courses?: CourseSession[];
  customShuttleJson?: string | null;
}

function scopeNoun(scope: UniShareScope): string {
  return scope === "courses" ? "دروس" : "سرویس‌ها";
}

/**
 * Builds the payload for one scope.
 *
 * Only the relevant keys are emitted, so importing a timetable share can never
 * clobber the recipient's bus schedule (and vice versa). The shuttle half always
 * exports the *resolved* table, which means it is useful even for someone who
 * never imported a custom one.
 */
export function sharePayload(scope: UniShareScope): UniSharePayload {
  const state = getState();
  if (scope === "courses") {
    return {
      kind: "fitpro-uni-courses",
      universityName: state.profile.universityName,
      courses: state.courses,
    };
  }
  return {
    kind: "fitpro-uni-shuttle",
    customShuttleJson: JSON.stringify(resolveShuttle(state.customShuttleJson)),
  };
}

/**
 * Ghost button with the share glyph, used by both share rows so the two halves
 * of the university data look and behave identically.
 */
export function shareButton(label: string, aria: string, onClick: () => void): HTMLButtonElement {
  const node = btn(
    "btn-ghost flex items-center justify-center gap-1.5 py-2 text-[11px]",
    "",
    onClick,
    { "aria-label": aria },
  );
  node.append(svgIcon(icons.share, "h-3.5 w-3.5 shrink-0"), el("span", "", label));
  return node;
}

/** Copies the scope's JSON to the clipboard, with a manual fallback modal. */
export async function copyShareJson(scope: UniShareScope): Promise<void> {
  const json = JSON.stringify(sharePayload(scope));
  // One clipboard implementation for the whole app (hidden-textarea fallback
  // included), instead of a second copy that drifted from it.
  const copied = await copyText(json);
  if (copied) toast(`JSON ${scopeNoun(scope)} کپی شد؛ برای هم‌دانشگاهی‌ها بفرست.`);
  else openShareJsonModal(json, "export", scope);
}

/** Opens the paste dialog, pre-filled from the clipboard when allowed. */
export async function openShareImportModal(scope: UniShareScope): Promise<void> {
  let text = "";
  try {
    if (navigator.clipboard?.readText) text = await navigator.clipboard.readText();
  } catch {
    /* manual paste below */
  }
  openShareJsonModal(text, "import", scope);
}

function openShareJsonModal(initial: string, mode: "export" | "import", scope: UniShareScope): void {
  const noun = scopeNoun(scope);
  const body = el("div", "space-y-2");
  body.append(
    el(
      "p",
      "text-[11px] leading-6 text-slate-400",
      mode === "export"
        ? `دسترسی کلیپ‌بورد در دسترس نیست؛ متن ${noun} را انتخاب و به‌صورت دستی کپی کن.`
        : `JSON ${noun} دریافتی از هم‌دانشگاهی‌ات را اینجا بچسبان. فقط بخش ${noun} جایگزین می‌شود و بقیه اطلاعات دست‌نخورده می‌ماند.`,
    ),
  );
  const area = el("textarea", "field h-40 w-full resize-none text-left text-[10px] leading-5");
  area.value = initial;
  area.readOnly = mode === "export";
  area.setAttribute("dir", "ltr");
  if (mode === "import") {
    area.placeholder =
      scope === "courses"
        ? '{ "universityName": "...", "courses": [] }'
        : '{ "customShuttleJson": "…" }';
  }
  body.append(area);

  const footer =
    mode === "export"
      ? btn(
          "btn-primary w-full",
          "انتخاب کل متن",
          () => {
            area.select();
            toast("متن انتخاب شد؛ با Ctrl+C یا لمس طولانی کپی کن.");
          },
          { "aria-label": "انتخاب کل متن JSON" },
        )
      : btn(
          "btn-primary w-full",
          `اعمال ${noun}`,
          () => applyShareJson(area.value, () => handle.close(), scope),
          { "aria-label": `اعمال ${noun}` },
        );

  const handle = openModal({
    title: mode === "export" ? `JSON ${noun}` : `دریافت ${noun}`,
    body,
    footer,
  });
}

/**
 * Validates and applies a shared payload. Every field is optional and a bad
 * paste never corrupts state: unknown shapes are ignored, out-of-range numbers
 * are clamped, and only the scope's own keys are written.
 */
export function applyShareJson(raw: string, close: () => void, scope: UniShareScope): void {
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
  let changed = false;

  if (scope === "courses") {
    if (typeof data.universityName === "string" && data.universityName.trim()) {
      state.profile.universityName = data.universityName.trim().slice(0, 80);
      changed = true;
    }
    if (Array.isArray(data.courses)) {
      const weekTypes = ["all", "odd", "even"];
      // Imported JSON can carry "9:5" or an end time before the start; validate
      // both so a shared timetable never renders an inverted slot.
      const hhmm = (v: unknown, fb: string) =>
        typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v.trim()) ? v.trim() : fb;
      state.courses = data.courses
        .filter((course) => course && typeof course.name === "string" && course.name.trim())
        .slice(0, 60)
        .map((course) => {
          const startTime = hhmm(course.startTime, "09:00");
          let endTime = hhmm(course.endTime, "11:00");
          if (endTime <= startTime) {
            const [h, m] = startTime.split(":").map((n) => Number.parseInt(n, 10) || 0);
            const total = Math.min(23 * 60 + 59, h * 60 + m + 120);
            endTime = `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
          }
          return {
            id: typeof course.id === "string" && course.id ? course.id : uid("course"),
            name: String(course.name).trim().slice(0, 80),
            professor: typeof course.professor === "string" ? course.professor.trim().slice(0, 80) : "",
            dayOfWeek: Number.isInteger(course.dayOfWeek)
              ? Math.min(6, Math.max(0, course.dayOfWeek))
              : 0,
            startTime,
            endTime,
            weekType: (weekTypes.includes(String(course.weekType))
              ? course.weekType
              : "all") as CourseSession["weekType"],
          };
        });
      changed = true;
    }
  } else if (data.customShuttleJson === null) {
    // An explicit `null` means "go back to the published table".
    state.customShuttleJson = null;
    changed = true;
  } else if (
    typeof data.customShuttleJson === "string" &&
    parseShuttleJson(data.customShuttleJson)
  ) {
    state.customShuttleJson = data.customShuttleJson.trim();
    changed = true;
  } else if (parseShuttleJson(raw)) {
    // Some AI answers return the raw `{ railway, suburbs }` object instead of
    // wrapping it in `{ customShuttleJson }`; accept both shapes.
    state.customShuttleJson = raw.trim();
    changed = true;
  }

  if (!changed) {
    toast(`در این JSON چیزی برای ${scopeNoun(scope)} پیدا نشد.`, "error");
    return;
  }

  persist(0);
  // A new timetable invalidates alarms for departures that no longer exist.
  if (scope === "shuttle") void pruneBusAlarms();
  close();
  toast(
    scope === "courses"
      ? "برنامه دروس اعمال شد."
      : "جدول سرویس‌ها اعمال شد.",
  );
  requestRender();
}
