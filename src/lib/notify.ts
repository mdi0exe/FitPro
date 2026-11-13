/**
 * Native notifications.
 *
 * Android WebViews cannot raise a status-bar notification from plain JS, so the
 * Tauri notification plugin (Android `NotificationManager` under the hood) is
 * used there. In a plain browser we fall back to the Web Notification API.
 */
import {
  Importance,
  Schedule,
  Visibility,
  cancel,
  createChannel,
  isPermissionGranted,
  onAction,
  registerActionTypes,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { toast } from "../components/ui";
import { isTauri } from "./api";
import { fa } from "./fa";
import { adjustTimestampForWaterQuietHours } from "./quietHours";
import { getState, persist, requestRender, syncTodayActivity, syncWaterChecklist } from "./store";

/** Android 8+ needs a channel; High importance gives a heads-up banner. */
const CHANNEL_ID = "fitpro-alerts";
let channelReady = false;

async function ensureChannel(): Promise<void> {
  if (channelReady || !isTauri()) return;
  channelReady = true;
  try {
    await createChannel({
      id: CHANNEL_ID,
      name: "یادآورهای فیت‌پرو",
      description: "یادآور نوشیدن آب و پایان استراحت بین ست‌ها",
      importance: Importance.High,
      visibility: Visibility.Public,
      vibration: true,
    });
  } catch (error) {
    // Desktop platforms have no channels; this is expected there.
    console.warn("notification channel unavailable", error);
  }
}

/**
 * Asks for permission. On Android 13+ this shows the system
 * "allow notifications?" dialog, so only call it from a user gesture.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (isTauri()) {
    try {
      if (await isPermissionGranted()) {
        await ensureChannel();
        return true;
      }
      const status = await requestPermission();
      if (status === "granted") await ensureChannel();
      return status === "granted";
    } catch (error) {
      console.warn("Tauri notification permission check failed", error);
      return false;
    }
  }

  if (typeof Notification !== "undefined") {
    if (Notification.permission === "granted") return true;
    if (Notification.permission !== "denied") {
      try {
        return (await Notification.requestPermission()) === "granted";
      } catch {
        return false;
      }
    }
  }
  return false;
}

/** Non-prompting check — safe to call from timers. */
async function canPost(): Promise<boolean> {
  if (isTauri()) {
    try {
      return await isPermissionGranted();
    } catch {
      return false;
    }
  }
  return typeof Notification !== "undefined" && Notification.permission === "granted";
}

/**
 * Posts a real OS notification (Android status bar / lock screen).
 *
 * Never prompts: call `ensureNotificationPermission()` from a user gesture
 * (the water-reminder toggle or the settings test button) first.
 */
export async function pushSystemNotification(
  title: string,
  body: string,
  id?: number,
  actionTypeId?: string,
): Promise<void> {
  if (!(await canPost())) return;

  if (isTauri()) {
    try {
      await ensureChannel();
      sendNotification({
        title,
        body,
        channelId: CHANNEL_ID,
        ...(id === undefined ? {} : { id }),
        ...(actionTypeId === undefined ? {} : { actionTypeId }),
      });
      return;
    } catch (error) {
      console.warn("native notification failed", error);
    }
  }

  try {
    // `tag` gives the same replace-instead-of-duplicate behaviour as `id`.
    new Notification(title, { body, tag: id === undefined ? undefined : `fitpro-${id}` });
  } catch {
    /* unsupported browser — the in-app toast still shows */
  }
}

/** Fixed id so an immediate alert replaces its scheduled twin. */
export const WATER_NOTIFICATION_ID = 7701;

/** Action group shown under the water notification on Android. */
export const WATER_ACTION_TYPE_ID = "water-reminder-actions";
/** The single "I drank a glass" button inside that group. */
export const WATER_ACTION_ID = "drink_one_glass";

let actionsInitialized = false;

/**
 * Registers the water notification's action button and listens for taps.
 *
 * Android draws the button under the notification, so a glass can be logged
 * without opening the app — the tap is delivered here even from a cold start
 * (the plugin replays it once the listener is attached).
 */
export async function initNotificationActions(): Promise<void> {
  if (!isTauri() || actionsInitialized) return;
  actionsInitialized = true;

  try {
    await registerActionTypes([
      {
        id: WATER_ACTION_TYPE_ID,
        actions: [{ id: WATER_ACTION_ID, title: "💧 +۱ لیوان آب خوردم" }],
      },
    ]);

    await onAction((event) => {
      // `tap` is a plain notification tap (just opens the app), not the button.
      if (event.actionId !== WATER_ACTION_ID) return;
      incrementWaterGlassFromNotification();
    });
  } catch (error) {
    // Desktop and browsers have no notification actions; the in-app button and
    // the toast action still work.
    console.warn("notification actions unavailable", error);
  }
}

/**
 * Logs one glass straight from the notification (or the toast action).
 * Returns the new count so callers can show a message.
 */
export function addWaterGlass(count = 1): number {
  const state = getState();
  const next = Math.min(20, Math.max(0, (state.diet.waterGlasses ?? 0) + count));
  state.diet.waterGlasses = next;
  syncWaterChecklist();
  syncTodayActivity();
  persist(0);
  return next;
}

/**
 * Action-button handler: adds a glass and refreshes whatever tab is open.
 *
 * Android delivers the tap while the app is in the background (the activity is
 * pushed back by `moveTaskToBack`, see `scripts/inject-main-activity.mjs`), so a
 * toast would never be seen and a full re-render would only burn battery. When
 * the document is hidden the glass is simply saved; the next time the app comes
 * forward it renders the new count anyway.
 */
export function incrementWaterGlassFromNotification(): void {
  try {
    const glasses = addWaterGlass(1);
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    toast(`💧 نوش جان! آب امروز: ${fa(glasses)} لیوان`);
    requestRender();
  } catch (error) {
    console.warn("failed to log water from the notification", error);
  }
}

/**
 * Registers a native OS alarm at `nextAtMs`.
 *
 * This is what keeps the reminder working while the app is closed: the deadline
 * is handed to Android's AlarmManager instead of a JS timer.
 */
export async function scheduleWaterNotificationAt(nextAtMs: number): Promise<void> {
  // Android's AlarmManager would happily ring at 03:00 — shift the OS alarm out
  // of the 00:00–09:00 sleep window as well, not just the JS countdown.
  const safeNextAt = adjustTimestampForWaterQuietHours(nextAtMs);
  if (!isTauri() || !Number.isFinite(safeNextAt) || safeNextAt <= Date.now() + 1000) return;
  // Never prompt here — scheduling also runs on boot.
  if (!(await canPost())) return;

  try {
    await ensureChannel();
    await cancel([WATER_NOTIFICATION_ID]).catch(() => undefined);
    sendNotification({
      id: WATER_NOTIFICATION_ID,
      channelId: CHANNEL_ID,
      title: "💧 وقت نوشیدن آب است!",
      body: "۱ لیوان آب بنوش (۷۰٪ حجم عضله آب است و برای ریکاوری حیاتی است).",
      actionTypeId: WATER_ACTION_TYPE_ID,
      // `allowWhileIdle` keeps Doze from swallowing the alarm.
      schedule: Schedule.at(new Date(safeNextAt), false, true),
    });
  } catch (error) {
    console.warn("scheduled notification unavailable", error);
  }
}

/** Drops the pending OS alarm (reminder disabled or already fired). */
export async function cancelScheduledWaterNotification(): Promise<void> {
  if (!isTauri()) return;
  try {
    await cancel([WATER_NOTIFICATION_ID]);
  } catch {
    /* nothing scheduled */
  }
}

/** One repeating slot: `weekday` uses the plugin's 1=Sunday … 7=Saturday. */
export interface RepeatingSlot {
  hour: number;
  minute: number;
  weekday?: number;
}

/**
 * Registers a repeating weekly (or daily when `weekday` is omitted) alarm.
 * Returns `true` when the OS accepted it.
 */
export async function scheduleRepeatingNotification(
  id: number,
  title: string,
  body: string,
  slot: RepeatingSlot,
): Promise<boolean> {
  if (!isTauri() || !(await canPost())) return false;

  try {
    await ensureChannel();
    await cancel([id]).catch(() => undefined);
    sendNotification({
      id,
      channelId: CHANNEL_ID,
      title,
      body,
      schedule: Schedule.interval(
        {
          hour: slot.hour,
          minute: slot.minute,
          ...(slot.weekday === undefined ? {} : { weekday: slot.weekday }),
        },
        true,
      ),
    });
    return true;
  } catch (error) {
    console.warn("repeating notification unavailable", error);
    return false;
  }
}

/** Cancels a batch of pending alarms (bus times use one id per weekday). */
export async function cancelNotifications(ids: number[]): Promise<void> {
  if (!isTauri() || ids.length === 0) return;
  try {
    await cancel(ids);
  } catch {
    /* nothing scheduled */
  }
}
