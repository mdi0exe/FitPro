/**
 * Tabriz University of Technology shuttle data.
 *
 * The published table (effective 1405/08/23) lives here as the fallback. When
 * the student imports a new timetable from the AI template, the raw JSON is
 * stored in `state.customShuttleJson` and parsed through `resolveShuttle()`, so
 * the radar and the table never disagree about which schedule is active.
 */
export type ScheduleGroupKey = "sun-wed" | "sat" | "thu" | "fri" | "suburbs";
export type RailwayKey = Exclude<ScheduleGroupKey, "suburbs">;

export interface RailwaySchedule {
  title: string;
  fromRailway: string[];
  fromUni: string[];
}

export interface SuburbRoute {
  id: string;
  route: string;
  direction: string;
  times: string[];
}

export interface ShuttleData {
  effectiveDate: string;
  railway: Record<RailwayKey, RailwaySchedule>;
  suburbs: SuburbRoute[];
}

export const DEFAULT_EFFECTIVE_DATE = "۱۴۰۵/۰۸/۲۳";

export const DEFAULT_SHUTTLE: ShuttleData = {
  effectiveDate: DEFAULT_EFFECTIVE_DATE,
  railway: {
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
  },
  suburbs: [
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
  ],
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Sorted, de-duplicated `HH:MM` list; anything else is dropped. */
function cleanTimes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const times = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => HHMM.test(entry));
  return [...new Set(times)].sort();
}

function cleanSchedule(value: unknown, fallback: RailwaySchedule): RailwaySchedule {
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Partial<RailwaySchedule>;
  const fromRailway = cleanTimes(raw.fromRailway);
  const fromUni = cleanTimes(raw.fromUni);
  if (fromRailway.length === 0 && fromUni.length === 0) return fallback;
  return {
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : fallback.title,
    fromRailway: fromRailway.length ? fromRailway : fallback.fromRailway,
    fromUni: fromUni.length ? fromUni : fallback.fromUni,
  };
}

/**
 * Parses an imported timetable. Returns `null` when the text is not a usable
 * shuttle object, so callers can show a clear error instead of an empty table.
 */
export function parseShuttleJson(raw: string): ShuttleData | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  const source = parsed as {
    effectiveDate?: unknown;
    railway?: Record<string, unknown>;
    suburbs?: unknown;
  };
  if (!source.railway && !Array.isArray(source.suburbs)) return null;

  const railway = source.railway ?? {};
  const suburbs: SuburbRoute[] = Array.isArray(source.suburbs)
    ? source.suburbs
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const item = entry as Partial<SuburbRoute>;
          const times = cleanTimes(item.times);
          const route = typeof item.route === "string" ? item.route.trim() : "";
          if (!route || times.length === 0) return null;
          return {
            id: typeof item.id === "string" && item.id.trim() ? item.id.trim() : route,
            route,
            direction: typeof item.direction === "string" ? item.direction.trim() : "",
            times,
          } satisfies SuburbRoute;
        })
        .filter((entry): entry is SuburbRoute => entry !== null)
    : DEFAULT_SHUTTLE.suburbs;

  return {
    effectiveDate:
      typeof source.effectiveDate === "string" && source.effectiveDate.trim()
        ? source.effectiveDate.trim()
        : DEFAULT_EFFECTIVE_DATE,
    railway: {
      "sun-wed": cleanSchedule(railway["sun-wed"], DEFAULT_SHUTTLE.railway["sun-wed"]),
      sat: cleanSchedule(railway.sat, DEFAULT_SHUTTLE.railway.sat),
      thu: cleanSchedule(railway.thu, DEFAULT_SHUTTLE.railway.thu),
      fri: cleanSchedule(railway.fri, DEFAULT_SHUTTLE.railway.fri),
    },
    suburbs: suburbs.length ? suburbs : DEFAULT_SHUTTLE.suburbs,
  };
}

/** Active timetable: the imported one when it parses, otherwise the built-in. */
export function resolveShuttle(raw: string | null | undefined): ShuttleData {
  if (!raw) return DEFAULT_SHUTTLE;
  return parseShuttleJson(raw) ?? DEFAULT_SHUTTLE;
}

/** Prompt + JSON skeleton handed to any AI together with the new timetable photo. */
export const SHUTTLE_AI_PROMPT_TEMPLATE = `این عکس جدید برنامه سرویس‌های دانشگاه صنعتی تبریز است. لطفاً تمام ساعت‌ها و مسیرهای داخل عکس را استخراج کن و دقیقاً در قالب JSON زیر (بدون هیچ توضیح اضافه‌ای) به من بده تا در اپلیکیشنم ایمپورت کنم:

{
  "effectiveDate": "1405/08/23",
  "railway": {
    "sun-wed": {
      "title": "یکشنبه تا چهارشنبه",
      "fromRailway": ["08:15", "10:00", "13:00", "15:00", "19:15", "21:00"],
      "fromUni": ["09:10", "11:15", "14:00", "16:00", "18:00", "20:00"]
    },
    "sat": {
      "title": "شنبه‌ها",
      "fromRailway": ["08:15", "21:00"],
      "fromUni": ["09:30", "16:00"]
    },
    "thu": {
      "title": "پنجشنبه‌ها",
      "fromRailway": ["08:15", "21:00"],
      "fromUni": ["09:30", "15:00"]
    },
    "fri": {
      "title": "جمعه‌ها و ایام تعطیل",
      "fromRailway": ["09:00", "21:00"],
      "fromUni": ["10:00", "15:00"]
    }
  },
  "suburbs": [
    {
      "id": "khosro-to-uni",
      "route": "خسروشهر ← دانشگاه",
      "direction": "حرکت مینی‌بوس از فلکه اصلی خسروشهر به دانشگاه",
      "times": ["08:15"]
    },
    {
      "id": "osku-to-uni",
      "route": "اسکو ← دانشگاه",
      "direction": "حرکت مینی‌بوس از اسکو به دانشگاه",
      "times": ["08:25"]
    },
    {
      "id": "uni-to-khosro-osku",
      "route": "دانشگاه ← خسروشهر و اسکو",
      "direction": "حرکت از دانشگاه به خسروشهر و از مسیر اسکو",
      "times": ["16:00", "18:00"]
    },
    {
      "id": "east-to-uni",
      "route": "شرق تبریز ← دانشگاه",
      "direction": "حرکت از شرق تبریز به دانشگاه",
      "times": ["08:00"]
    },
    {
      "id": "uni-to-east",
      "route": "دانشگاه ← شرق تبریز",
      "direction": "حرکت از دانشگاه به شرق تبریز",
      "times": ["16:00", "18:00"]
    },
    {
      "id": "fahmideh-to-uni",
      "route": "میدان شهید فهمیده ← دانشگاه",
      "direction": "حرکت از میدان شهید فهمیده تبریز به دانشگاه",
      "times": ["07:45"]
    }
  ]
}`;
