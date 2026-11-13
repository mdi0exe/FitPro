/**
 * Default MSc (Electronics) timetable for the university tab.
 *
 * Mirrors `seed_default_courses()` in `src-tauri/src/models.rs`; the Rust side
 * seeds legacy saves, this copy seeds the browser backend and the "reset"
 * action. `*` = odd weeks, `**` = even weeks.
 */
import type { CourseSession } from "../types";

export function defaultCourses(): CourseSession[] {
  return [
    // یکشنبه
    { id: "c-1", name: "VLSI", professor: "د. فرجی", dayOfWeek: 0, startTime: "09:00", endTime: "11:00", weekType: "all" },
    { id: "c-2", name: "معماری کامپیوتر پیشرفته", professor: "د. بدری", dayOfWeek: 0, startTime: "11:00", endTime: "13:00", weekType: "all" },
    // دوشنبه — جفت یک‌ستاره / دوستاره
    { id: "c-3", name: "VLSI", professor: "د. فرجی", dayOfWeek: 1, startTime: "11:00", endTime: "13:00", weekType: "odd" },
    { id: "c-4", name: "معماری کامپیوتر پیشرفته", professor: "د. بدری", dayOfWeek: 1, startTime: "11:00", endTime: "13:00", weekType: "even" },
    { id: "c-5", name: "ابزار دقیق پیشرفته", professor: "د. بدری", dayOfWeek: 1, startTime: "16:00", endTime: "18:00", weekType: "all" },
    // سه‌شنبه
    { id: "c-6", name: "ابزار دقیق پیشرفته", professor: "د. بدری", dayOfWeek: 2, startTime: "14:00", endTime: "16:00", weekType: "even" },
  ];
}

/** Saturday-first ordering used by the schedule card (Persian week). */
export const WEEK_DAYS: Array<{ day: number; label: string; short: string }> = [
  { day: 6, label: "شنبه", short: "ش" },
  { day: 0, label: "یکشنبه", short: "ی" },
  { day: 1, label: "دوشنبه", short: "د" },
  { day: 2, label: "سه‌شنبه", short: "س" },
  { day: 3, label: "چهارشنبه", short: "چ" },
  { day: 4, label: "پنجشنبه", short: "پ" },
  { day: 5, label: "جمعه", short: "ج" },
];
