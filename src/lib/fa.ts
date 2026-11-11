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

/** First integer inside a rep prescription, after digit normalisation. */
export function firstNumber(raw: string | null | undefined): number {
  const match = /\d+/.exec(en(raw ?? ""));
  return match ? Number.parseInt(match[0], 10) : 0;
}

/** `65` → `"۶۵"`, `67.5` → `"۶۷٫۵"` (Persian decimal separator). */
export function faNum(value: number, digits = 0): string {
  const fixed = digits > 0 ? value.toFixed(digits) : String(Math.round(value));
  const trimmed = digits > 0 ? fixed.replace(/\.0+$/, "") : fixed;
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
  const sign = value >= 0 ? "+" : "−";
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
  const weekday = WEEKDAYS[new Date(`${iso}T12:00:00`).getDay()] ?? "";
  return `${weekday}، ${base}`;
}

/** Short numeric Jalali date: `"۱۴۰۵/۰۸/۲۱"` */
export function faDateShort(iso: string): string {
  if (!iso) return "";
  const { jy, jm, jd } = toJalali(iso);
  return fa(`${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`);
}

export function isoToday(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Whole days from `fromIso` to `toIso` (positive when `toIso` is later). */
export function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00`);
  const to = Date.parse(`${toIso}T00:00:00`);
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
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

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
