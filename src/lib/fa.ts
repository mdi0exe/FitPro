/**
 * Persian (Farsi) formatting helpers: digits, Jalali calendar, weights.
 */

const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

const JALALI_MONTHS = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];

const WEEKDAYS = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];

/** Converts every latin digit inside a string to its Persian counterpart. */
export function fa(input: string | number): string {
  return String(input).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

/** Persian → latin digits (used when reading typed input). */
export function en(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

/**
 * Parses a number typed on any keyboard: Persian (`۶۷٫۵`), Arabic-Indic
 * (`٦٧.٥`) or latin (`67.5`). Returns `0` for anything unparseable.
 */
export function parseNum(raw: string | number | null | undefined): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  if (!raw) return 0;
  const normalized = en(String(raw))
    .replace(/[٫,]/g, ".") // ٫ Persian decimal, , latin decimal
    .replace(/[٬\s]/g, "") // ٬ Persian thousands, spaces
    .replace(/\.(?=.*\.)/g, ""); // keep only the last dot
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Float from a numeric field: Persian (`۶۷٫۵`), Arabic-Indic (`٦٧.٥`), latin
 * (`67.5`) and unit-suffixed text (`۶۷ کیلو`) all collapse to a number.
 *
 * `٬` (Persian thousands) and ZWNJ are stripped, and `fallback` is returned
 * when the field holds no digit at all — that is what keeps an emptied input
 * from silently saving `0` over the user's real weight.
 */
export function parseFaFloat(raw: string | null | undefined, fallback = 0): number {
  if (raw === null || raw === undefined) return fallback;
  const text = en(String(raw))
    .replace(/[٬\s\u200c]/g, "")
    .replace(/٫/g, ".");
  if (!/\d/.test(text)) return fallback;
  const value = Number.parseFloat(text.replace(/[^\d.]/g, ""));
  return Number.isFinite(value) ? value : fallback;
}

/** First integer inside a rep prescription, after digit normalisation. */
export function firstNumber(raw: string | null | undefined): number {
  const match = /\d+/.exec(en(raw ?? ""));
  return match ? Number.parseInt(match[0], 10) : 0;
}

/** `65` → `"۶۵"`, `67.5` → `"۶۷٫۵"` (Persian decimal separator). */
export function faNum(value: number, digits = 0): string {
  const fixed = digits > 0 ? value.toFixed(digits) : String(Math.round(value));
  // Drop trailing zeros ("12.50" -> "12.5", "12.00" -> "12") so a 2-decimal
  // plate label does not read "۲٫۵۰".
  const trimmed =
    digits > 0
      ? fixed.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "")
      : fixed;
  return fa(trimmed.replace(".", "٫"));
}

/** Weight chip label, e.g. `۶۷٫۵ کیلو`. */
export function faWeight(value: number): string {
  return `${faNum(value, 1)} کیلو`;
}

/**
 * Signed number for RTL text. Without the leading Left-to-Right Mark the bidi
 * algorithm pushes the sign to the wrong side (`۲٫۵+` instead of `+۲٫۵`).
 */
export function faSigned(value: number, digits = 1): string {
  // A near-zero delta must read "۰", not "+۰" / "−۰٫۰".
  if (Math.abs(value) < (digits > 0 ? 0.05 : 0.5)) return "۰";
  const sign = value > 0 ? "+" : "−";
  return `\u200E${sign}${faNum(Math.abs(value), digits)}`;
}

/**
 * Rep prescription for display, fixing RTL range flipping:
 * `"8-10"` → `"۸ تا ۱۰"`, `"10 هر پا"` → `"۱۰ هر پا"`.
 */
export function faReps(reps: string): string {
  const range = /^(\d+)\s*-\s*(\d+)$/.exec(reps.trim());
  if (range) return `${fa(range[1])} تا ${fa(range[2])}`;
  return fa(reps);
}

/** `"2026-11-12"` → `{ jy, jm, jd }` */
export function toJalali(iso: string): { jy: number; jm: number; jd: number } {
  const [gy, gm, gd] = isoParts(iso);
  return gregorianToJalali(gy, gm, gd);
}

/** `"2026-11-12"` → `"۲۱ آبان ۱۴۰۵"` */
export function faDate(iso: string, opts: { withYear?: boolean; withWeekday?: boolean } = {}): string {
  const { withYear = true, withWeekday = false } = opts;
  if (!iso) return "";
  const { jy, jm, jd } = toJalali(iso);
  const base = `${fa(jd)} ${JALALI_MONTHS[Math.min(11, Math.max(0, jm - 1))]}${
    withYear ? ` ${fa(jy)}` : ""
  }`;
  if (!withWeekday) return base;
  return `${faWeekdayName(iso)}، ${base}`;
}

/** Short numeric Jalali date: `"۱۴۰۵/۰۸/۲۱"` */
export function faDateShort(iso: string): string {
  if (!iso) return "";
  const { jy, jm, jd } = toJalali(iso);
  return fa(`${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`);
}

export function isoToday(): string {
  return isoFromDate(new Date());
}

/**
 * `"2026-11-13"` → a Date on the **local** calendar (noon, so a DST shift can
 * never roll the day over).
 *
 * `new Date("2026-11-13")` is parsed as UTC midnight by the language spec: in
 * Tehran that is 03:30 of the same day, but anywhere west of Greenwich it is
 * still the *previous* day — which is exactly how the app ended up announcing
 * "tomorrow is Friday" on a Friday. Building the date from its parts keeps
 * every weekday / "N days ago" calculation on the user's own calendar.
 */
export function localDateFromIso(iso: string): Date {
  const [y, m, d] = isoParts(iso);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/** Inverse of `localDateFromIso`: a Date → local `YYYY-MM-DD`. */
export function isoFromDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Shifts an ISO date by whole days on the local calendar. */
export function isoAddDays(iso: string, days: number): string {
  const date = localDateFromIso(iso);
  date.setDate(date.getDate() + days);
  return isoFromDate(date);
}

/** Tomorrow's local ISO date (the shuttle radar's "what runs next" input). */
export function isoTomorrow(referenceIso = isoToday()): string {
  return isoAddDays(referenceIso, 1);
}

/** `0` = Sunday … `6` = Saturday, resolved in the user's own timezone. */
export function faWeekdayIndex(iso: string): number {
  return localDateFromIso(iso).getDay();
}

/** Compact weekday labels for the 7-column calendar strip (Sunday first). */
const WEEKDAY_SHORT = ["یک", "دو", "سه", "چهار", "پنج", "جم", "شن"];

/** Persian weekday name for an ISO date. */
export function faWeekdayName(iso: string): string {
  if (!iso) return "";
  return WEEKDAYS[faWeekdayIndex(iso)] ?? "";
}

/** Compact weekday label for narrow calendar cells. */
export function faWeekdayShort(iso: string): string {
  if (!iso) return "";
  return WEEKDAY_SHORT[faWeekdayIndex(iso)] ?? "";
}

/**
 * The 7 ISO dates (Saturday → Friday) of the Iranian week containing
 * `referenceIso`. `getDay()` is Sunday-based, so Saturday is offset 0.
 */
export function currentPersianWeekIsos(referenceIso = isoToday()): string[] {
  const ref = localDateFromIso(referenceIso);
  const offsetFromSaturday = (ref.getDay() + 1) % 7;
  const saturday = new Date(ref);
  saturday.setDate(ref.getDate() - offsetFromSaturday);

  const days: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    const cur = new Date(saturday);
    cur.setDate(saturday.getDate() + i);
    days.push(isoFromDate(cur));
  }
  return days;
}

/** Whole days from `fromIso` to `toIso` (positive when `toIso` is later). */
export function daysBetween(fromIso: string, toIso: string): number {
  const from = localDateFromIso(fromIso).getTime();
  const to = localDateFromIso(toIso).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

/** `"2026-11-05"` → `"۷ روز پیش"` */
export function faRelative(iso: string): string {
  const diff = daysBetween(iso, isoToday());
  if (diff === 0) return "امروز";
  if (diff === 1) return "دیروز";
  if (diff > 1) return `${fa(diff)} روز پیش`;
  if (diff === -1) return "فردا";
  return `${fa(Math.abs(diff))} روز آینده`;
}

/** `90` → `"۱:۳۰"` */
export function faClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${fa(minutes)}:${fa(String(seconds).padStart(2, "0"))}`;
}

/** Plain `mm:ss` clock (latin digits) for timer rings where width matters. */
export function clock(totalSeconds: number): string {
  const safe = Math.max(0, Math.ceil(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  // The water reminder can sit a whole night away, so >59 min needs hours.
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Live Persian digits in text inputs
// ---------------------------------------------------------------------------

export interface PersianNumericInputOptions {
  /** Allow one decimal separator (`٫`). Defaults to `true`. */
  decimals?: boolean;
  /** Called after every accepted keystroke with the parsed value. */
  onValue?: (value: number) => void;
}

/**
 * Makes a plain text input show **Persian digits while typing**, keeping the
 * caret where the user left it.
 *
 * Why not `type="number"`: an Android numeric keyboard always emits latin
 * digits, the element refuses `٫`, and `input.value` comes back empty for
 * anything it considers invalid — the app then reads `0` and overwrites a real
 * weight. A text input with `inputMode="decimal"` still opens the numeric
 * keypad, but we own the value, so Backspace, selection, paste and the caret
 * all behave exactly like a normal field.
 *
 * Invalid characters are dropped rather than the whole value being rejected:
 * the caret is moved left by the number of dropped characters before it, which
 * is the part naive implementations get wrong (restoring the caret by raw
 * string length jumps to the end whenever a letter is deleted).
 */
export function makePersianNumericInput(
  input: HTMLInputElement,
  options: PersianNumericInputOptions = {},
): HTMLInputElement {
  const { decimals = true, onValue } = options;

  input.type = "text";
  input.inputMode = decimals ? "decimal" : "numeric";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.dir = "ltr";

  const rewrite = (notify: boolean) => {
    const raw = input.value;
    const caret = input.selectionStart ?? raw.length;
    let out = "";
    let nextCaret = caret;
    let seenSeparator = false;

    for (let i = 0; i < raw.length; i += 1) {
      const ch = raw[i];
      let kept: string | null = null;

      if (ch >= "0" && ch <= "9") kept = FA_DIGITS[Number(ch)];
      else if (/[۰-۹]/.test(ch)) kept = ch;
      else if (/[٠-٩]/.test(ch)) kept = FA_DIGITS[ch.charCodeAt(0) - 0x0660];
      else if (decimals && (ch === "." || ch === "٫")) {
        if (!seenSeparator) {
          seenSeparator = true;
          kept = "٫";
        }
      }

      if (kept === null) {
        if (i < caret) nextCaret -= 1;
        continue;
      }
      out += kept;
    }

    if (out !== raw) {
      input.value = out;
      const safe = Math.max(0, Math.min(out.length, nextCaret));
      try {
        input.setSelectionRange(safe, safe);
      } catch {
        /* detached or non-focusable element — the value is still correct */
      }
    }

    if (notify) onValue?.(parseFaFloat(out));
  };

  input.addEventListener("input", () => rewrite(true));
  // Normalise a value that was written programmatically (e.g. `faNum`), but do
  // not fire `onValue` for it: callers usually already know the initial value.
  rewrite(false);

  return input;
}

/**
 * Alias kept for call sites that read better as "attach a behaviour to an
 * input I already created".
 */
export const attachPersianNumericInput = makePersianNumericInput;

function isoParts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map((part) => Number.parseInt(part, 10));
  if (!y || !m || !d) {
    const now = new Date();
    return [now.getFullYear(), now.getMonth() + 1, now.getDate()];
  }
  return [y, m, d];
}

// ---------------------------------------------------------------------------
// Jalali conversion (port of the well-tested `jalaali-js` algorithm)
// ---------------------------------------------------------------------------

const div = (a: number, b: number) => Math.trunc(a / b);
const mod = (a: number, b: number) => a - Math.trunc(a / b) * b;

function g2d(gy: number, gm: number, gd: number): number {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408;
  d = d - div(div(gy + div(gm - 8, 6) + 100100, 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn: number): { gy: number; gm: number; gd: number } {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

function jalCal(jy: number): { leap: number; gy: number; march: number } {
  const breaks = [
    -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324,
    2394, 2456, 3178,
  ];
  const bl = breaks.length;
  const gy = jy + 621;
  let leapJ = -14;
  let jp = breaks[0];
  let jm = 0;
  let jump = 0;

  for (let i = 1; i < bl; i += 1) {
    jm = breaks[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }

  let n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;

  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;

  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;

  return { leap, gy, march };
}

function gregorianToJalali(gy: number, gm: number, gd: number) {
  const jdn = g2d(gy, gm, gd);
  const g = d2g(jdn);
  let jy = g.gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(g.gy, 3, r.march);
  let k = jdn - jdn1f;

  if (k >= 0) {
    if (k <= 185) {
      return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
    }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }

  return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
}
