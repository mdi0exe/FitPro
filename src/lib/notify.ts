/**
 * Native notifications.
 *
 * Android WebViews cannot raise a status-bar notification from plain JS, so the
 * Tauri notification plugin (Android `NotificationManager` under the hood) is
 * used there. In a plain browser we fall back to the Web Notification API.
 */
import {
  Importance,
  Visibility,
  createChannel,
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { isTauri } from "./api";

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
export async function pushSystemNotification(title: string, body: string): Promise<void> {
  if (!(await canPost())) return;

  if (isTauri()) {
    try {
      await ensureChannel();
      sendNotification({ title, body, channelId: CHANNEL_ID });
      return;
    } catch (error) {
      console.warn("native notification failed", error);
    }
  }

  try {
    new Notification(title, { body });
  } catch {
    /* unsupported browser — the in-app toast still shows */
  }
}
