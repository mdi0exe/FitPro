/**
 * Sleep window for the water reminder.
 *
 * Between 00:00 and 09:00 the reminder stays completely silent: no sound, no
 * vibration and no status-bar notification. A deadline that would land inside
 * the window is pushed forward to 09:00 of the same morning, both in the JS
 * countdown and in the native Android alarm.
 *
 * Kept in its own module so `timer.ts` and `notify.ts` can share it without an
 * import cycle.
 */

export const WATER_QUIET_START_HOUR = 0; // 00:00 (midnight)
export const WATER_QUIET_END_HOUR = 9; // 09:00

/** True when the local time is inside the 00:00–09:00 sleep window. */
export function isWaterQuietHours(date = new Date()): boolean {
  const hour = date.getHours();
  return hour >= WATER_QUIET_START_HOUR && hour < WATER_QUIET_END_HOUR;
}

/**
 * Moves a deadline that falls inside the sleep window to 09:00 of that same
 * morning. Timestamps outside the window are returned untouched.
 */
export function adjustTimestampForWaterQuietHours(targetMs: number): number {
  if (!Number.isFinite(targetMs) || targetMs <= 0) return targetMs;
  const date = new Date(targetMs);
  if (!isWaterQuietHours(date)) return targetMs;
  date.setHours(WATER_QUIET_END_HOUR, 0, 0, 0);
  return date.getTime();
}

/** Persian copy shared by the nutrition card and the toasts. */
export const WATER_QUIET_LABEL = "🌙 حالت خواب (۱۲ شب تا ۹ صبح غیرفعال)";
