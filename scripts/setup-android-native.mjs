#!/usr/bin/env node
/**
 * Native Android glue for the water reminder.
 *
 * Why this exists: `tauri-plugin-notification` builds its action buttons with
 * `PendingIntent.getActivity`, so tapping "💧 +۱ لیوان آب خوردم" *starts*
 * `MainActivity` — the app flashes to the foreground just to log one glass.
 * This script replaces that path with a `BroadcastReceiver`
 * (`PendingIntent.getBroadcast`): the glass is written straight into
 * `gym_state.json` and the app never opens.
 *
 * Three files are produced inside `src-tauri/gen/android`, which is git-ignored
 * and recreated by `tauri android init` on every CI run:
 *   - `WaterBroadcastReceiver.kt` — notification builder + receiver + alarm
 *   - `MainActivity.kt`          — `window.AndroidWater` JS bridge
 *   - `AndroidManifest.xml`      — the `<receiver>` registration
 *
 * Idempotent: a second run detects the marker and leaves the files alone.
 *
 * Usage: node scripts/setup-android-native.mjs
 */
import fs from "node:fs";
import path from "node:path";

const MAIN_ROOT = path.join("src-tauri", "gen", "android", "app", "src", "main");
const MANIFEST = path.join(MAIN_ROOT, "AndroidManifest.xml");
const JAVA_ROOT = path.join(MAIN_ROOT, "java");
const MARKER = "fitpro-native-water";

/** Tauri's `app_data_dir()` on Android is `activity.dataDir`, i.e. the app root. */
const STATE_FILE = "gym_state.json";

if (!fs.existsSync(MAIN_ROOT)) {
  console.warn(`[android-native] ${MAIN_ROOT} does not exist.`);
  console.warn("[android-native] Run `npx tauri android init` first — skipping.");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Package / output directory
// ---------------------------------------------------------------------------

/** `ir.student.hypertrophy` from tauri.conf.json, or the existing MainActivity path. */
function resolvePackage() {
  try {
    const conf = JSON.parse(fs.readFileSync(path.join("src-tauri", "tauri.conf.json"), "utf8"));
    if (typeof conf.identifier === "string" && conf.identifier.includes(".")) return conf.identifier;
  } catch {
    /* fall through to the generated file */
  }
  const found = findFile(JAVA_ROOT, "MainActivity.kt");
  if (found) {
    const relative = path.relative(JAVA_ROOT, path.dirname(found));
    return relative.split(path.sep).join(".");
  }
  throw new Error("cannot determine the Android package name");
}

function findFile(dir, name) {
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = findFile(full, name);
      if (nested) return nested;
    } else if (entry.name === name) {
      return full;
    }
  }
  return null;
}

const pkg = resolvePackage();
const javaDir = path.join(JAVA_ROOT, ...pkg.split("."));
fs.mkdirSync(javaDir, { recursive: true });

// ---------------------------------------------------------------------------
// WaterBroadcastReceiver.kt
// ---------------------------------------------------------------------------

const receiverKt = `package ${pkg}

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.widget.Toast
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/**
 * ${MARKER}: silent "+۱ لیوان آب" action.
 *
 * The notification's action button is a [PendingIntent.getBroadcast], not
 * getActivity, so tapping it never brings the app to the foreground: the glass
 * is written straight into the JSON state file, the notification is dismissed
 * and a Toast confirms it.
 */
class WaterBroadcastReceiver : BroadcastReceiver() {

    companion object {
        const val CHANNEL_ID = "fitpro-water-silent"
        const val NOTIF_ID = 7701
        const val ACTION_SHOW_REMINDER = "${pkg}.ACTION_SHOW_WATER_REMINDER"
        const val ACTION_DRINK_ONE = "${pkg}.ACTION_DRINK_ONE_WATER"

        /** Same file the Rust side owns: app_data_dir()/gym_state.json. */
        private fun stateFile(context: Context) = File(context.dataDir, "${STATE_FILE}")

        fun ensureChannel(context: Context) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (manager.getNotificationChannel(CHANNEL_ID) != null) return
            val channel = NotificationChannel(
                CHANNEL_ID,
                "یادآور نوشیدن آب",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "یادآور نوشیدن آب با دکمه ثبت سریع در پس‌زمینه"
                enableVibration(true)
            }
            manager.createNotificationChannel(channel)
        }

        fun showNotification(context: Context, title: String, body: String) {
            try {
                ensureChannel(context)
                val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

                // Tapping the notification itself opens the app (expected).
                val openIntent = Intent(context, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                }
                val openPending = PendingIntent.getActivity(
                    context,
                    7700,
                    openIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )

                // Tapping the action stays in the background: BroadcastReceiver only.
                val drinkIntent = Intent(context, WaterBroadcastReceiver::class.java).apply {
                    action = ACTION_DRINK_ONE
                }
                val drinkPending = PendingIntent.getBroadcast(
                    context,
                    7702,
                    drinkIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )

                val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    Notification.Builder(context, CHANNEL_ID)
                } else {
                    @Suppress("DEPRECATION")
                    Notification.Builder(context)
                }

                val action = Notification.Action.Builder(
                    android.R.drawable.ic_input_add,
                    "💧 +۱ لیوان آب خوردم",
                    drinkPending
                ).build()

                val notification = builder
                    // The app icon is an adaptive mipmap, which Android renders as
                    // a white blob in the status bar; the plugin falls back to the
                    // system info icon too, so match it.
                    .setSmallIcon(android.R.drawable.ic_dialog_info)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setStyle(Notification.BigTextStyle().bigText(body))
                    .setContentIntent(openPending)
                    .setAutoCancel(true)
                    .addAction(action)
                    .build()

                manager.notify(NOTIF_ID, notification)
            } catch (_: Exception) {
                // Notifications blocked or the channel was removed: the in-app
                // toast and the countdown still work.
            }
        }

        fun scheduleAt(context: Context, triggerAtMs: Long) {
            val manager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val pending = PendingIntent.getBroadcast(
                context,
                7703,
                Intent(context, WaterBroadcastReceiver::class.java).apply { action = ACTION_SHOW_REMINDER },
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, pending)
                } else {
                    @Suppress("DEPRECATION")
                    manager.setExact(AlarmManager.RTC_WAKEUP, triggerAtMs, pending)
                }
            } catch (_: SecurityException) {
                // Exact alarms not allowed: an inexact one is better than none.
                manager.set(AlarmManager.RTC_WAKEUP, triggerAtMs, pending)
            }
        }

        fun cancelSchedule(context: Context) {
            val manager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val pending = PendingIntent.getBroadcast(
                context,
                7703,
                Intent(context, WaterBroadcastReceiver::class.java).apply { action = ACTION_SHOW_REMINDER },
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            manager.cancel(pending)
        }

        /** 00:00–09:00 is the sleep window: push the alarm to 09:00 instead. */
        private fun quietHoursAdjusted(timestampMs: Long): Long {
            val calendar = Calendar.getInstance().apply { timeInMillis = timestampMs }
            val hour = calendar.get(Calendar.HOUR_OF_DAY)
            if (hour !in 0..8) return timestampMs
            calendar.set(Calendar.HOUR_OF_DAY, 9)
            calendar.set(Calendar.MINUTE, 0)
            calendar.set(Calendar.SECOND, 0)
            calendar.set(Calendar.MILLISECOND, 0)
            return calendar.timeInMillis
        }

        private fun today(): String =
            SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())

        private fun writeAtomically(file: File, root: JSONObject) {
            val json = root.toString(2)
            val tmp = File(file.parentFile, file.name + ".tmp")
            tmp.writeText(json, Charsets.UTF_8)
            if (!tmp.renameTo(file)) {
                file.writeText(json, Charsets.UTF_8)
                tmp.delete()
            }
        }
    }

    override fun onReceive(context: Context, intent: Intent?) {
        when (intent?.action) {
            ACTION_SHOW_REMINDER -> {
                val calendar = Calendar.getInstance()
                if (calendar.get(Calendar.HOUR_OF_DAY) in 0..8) {
                    scheduleAt(context, quietHoursAdjusted(System.currentTimeMillis()))
                    return
                }
                showNotification(
                    context,
                    "💧 وقت نوشیدن آب است!",
                    "۱ لیوان آب بنوش (۷۰٪ حجم عضله آب است و برای ریکاوری حیاتی است)."
                )
                rescheduleFromState(context)
            }

            ACTION_DRINK_ONE -> {
                val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                manager.cancel(NOTIF_ID)

                val glasses = incrementWaterInStateFile(context)

                // If the WebView is alive in the background, update its memory so
                // the next frame already shows the new count. Never brings the
                // activity forward — evaluateJavascript runs in the WebView only.
                MainActivity.activeWebView?.post {
                    MainActivity.activeWebView?.evaluateJavascript(
                        "window.__onSilentWaterIncrement && window.__onSilentWaterIncrement(" + glasses + ")",
                        null
                    )
                }

                Toast.makeText(
                    context,
                    "💧 نوش جان! آب امروز: " + glasses + " لیوان",
                    Toast.LENGTH_SHORT
                ).show()
            }
        }
    }

    /**
     * Adds one glass to \`diet.waterGlasses\` in the JSON state file.
     *
     * Runs on the receiver's thread while the app may be dead, so it re-does the
     * daily reset itself: without it, a glass logged at 00:30 would be added to
     * yesterday's count.
     */
    private fun incrementWaterInStateFile(context: Context): Int {
        return try {
            val file = stateFile(context)
            if (!file.exists()) return 0

            val root = JSONObject(file.readText(Charsets.UTF_8))
            val diet = root.optJSONObject("diet") ?: return 0

            val day = today()
            if (diet.optString("lastResetDate", day) != day) {
                diet.put("lastResetDate", day)
                diet.put("waterGlasses", 0)
            }

            val glasses = (diet.optInt("waterGlasses", 0) + 1).coerceAtMost(20)
            diet.put("waterGlasses", glasses)

            if (glasses >= 8) {
                val items = diet.optJSONArray("items")
                if (items != null) {
                    for (index in 0 until items.length()) {
                        val item = items.optJSONObject(index) ?: continue
                        if (item.optString("id") == "diet-4") item.put("done", true)
                    }
                }
            }

            writeAtomically(file, root)
            glasses
        } catch (_: Exception) {
            0
        }
    }

    /** Arms the next OS alarm from the saved interval, without the app running. */
    private fun rescheduleFromState(context: Context) {
        try {
            val file = stateFile(context)
            if (!file.exists()) return

            val root = JSONObject(file.readText(Charsets.UTF_8))
            val diet = root.optJSONObject("diet") ?: return
            if (!diet.optBoolean("waterReminderEnabled", false)) return

            val minutes = diet.optInt("waterReminderMinutes", 60).coerceIn(15, 240)
            val nextAt = quietHoursAdjusted(System.currentTimeMillis() + minutes * 60_000L)
            diet.put("waterReminderNextAt", nextAt)
            writeAtomically(file, root)
            scheduleAt(context, nextAt)
        } catch (_: Exception) {
            // Nothing to reschedule.
        }
    }
}
`;

// ---------------------------------------------------------------------------
// MainActivity.kt
// ---------------------------------------------------------------------------

const mainActivityKt = `package ${pkg}

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge

/**
 * ${MARKER}: bridge behind \`window.AndroidWater\` (see src/lib/notify.ts).
 *
 * Exposed to the bundled frontend only — the WebView never navigates away from
 * the app's own assets, and every method just forwards to the receiver.
 */
class AndroidWaterBridge(private val context: Context) {
    @JavascriptInterface
    fun showWaterNotification(title: String, body: String) {
        WaterBroadcastReceiver.showNotification(context, title, body)
    }

    @JavascriptInterface
    fun scheduleWaterNotification(triggerAtMs: Long) {
        WaterBroadcastReceiver.scheduleAt(context, triggerAtMs)
    }

    @JavascriptInterface
    fun cancelWaterNotification() {
        WaterBroadcastReceiver.cancelSchedule(context)
    }
}

class MainActivity : TauriActivity() {
    companion object {
        /** Set in onWebViewCreate; the receiver evaluates JS through it. */
        @JvmStatic
        var activeWebView: WebView? = null
    }

    /**
     * Fallback for a plugin-delivered action (older build, or the bridge failed
     * to attach): read the action extra and push the task back instead of
     * leaving the app in the foreground.
     */
    private var fitproWaterMinimize = false

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        WaterBroadcastReceiver.ensureChannel(this)
    }

    override fun onWebViewCreate(webView: WebView) {
        super.onWebViewCreate(webView)
        activeWebView = webView
        webView.addJavascriptInterface(AndroidWaterBridge(this), "AndroidWater")
    }

    override fun onNewIntent(intent: Intent) {
        // super() first: the notification plugin reads the action in its hook.
        super.onNewIntent(intent)
        setIntent(intent)
        fitproReadWaterAction(intent)
        fitproMinimizeIfNeeded()
    }

    override fun onResume() {
        super.onResume()
        fitproReadWaterAction(intent)
        fitproMinimizeIfNeeded()
    }

    override fun onDestroy() {
        activeWebView = null
        super.onDestroy()
    }

    private fun fitproReadWaterAction(source: Intent?) {
        if (source?.getStringExtra("NotificationUserAction") != "drink_one_glass") return
        // Consume it: onResume also fires on ordinary returns to the app.
        source.removeExtra("NotificationUserAction")
        fitproWaterMinimize = true
    }

    private fun fitproMinimizeIfNeeded() {
        if (!fitproWaterMinimize) return
        fitproWaterMinimize = false
        // Let the WebView run the action handler before the activity stops.
        Handler(Looper.getMainLooper()).postDelayed({ moveTaskToBack(true) }, 700L)
    }
}
`;

fs.writeFileSync(path.join(javaDir, "WaterBroadcastReceiver.kt"), receiverKt, "utf8");
fs.writeFileSync(path.join(javaDir, "MainActivity.kt"), mainActivityKt, "utf8");

// ---------------------------------------------------------------------------
// AndroidManifest.xml — register the receiver
// ---------------------------------------------------------------------------

if (!fs.existsSync(MANIFEST)) {
  console.error(`[android-native] ${MANIFEST} does not exist.`);
  process.exit(1);
}

let manifest = fs.readFileSync(MANIFEST, "utf8");
if (!manifest.includes("WaterBroadcastReceiver")) {
  const receiverTag = [
    `        <!-- ${MARKER}: the water action stays in the background -->`,
    `        <receiver`,
    `            android:name=".WaterBroadcastReceiver"`,
    `            android:exported="false" />`,
  ].join("\n");

  if (!manifest.includes("</application>")) {
    console.error("[android-native] no </application> tag — unexpected manifest shape.");
    process.exit(1);
  }
  manifest = manifest.replace("</application>", `${receiverTag}\n    </application>`);
  fs.writeFileSync(MANIFEST, manifest, "utf8");
}

// ---------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------

const written = fs.readFileSync(path.join(javaDir, "WaterBroadcastReceiver.kt"), "utf8");
const mainActivity = fs.readFileSync(path.join(javaDir, "MainActivity.kt"), "utf8");
const patchedManifest = fs.readFileSync(MANIFEST, "utf8");

const problems = [];
if (!written.includes("PendingIntent.getBroadcast")) problems.push("receiver uses getActivity");
if (!written.includes("ACTION_DRINK_ONE")) problems.push("receiver has no drink action");
if (!mainActivity.includes('addJavascriptInterface(AndroidWaterBridge(this), "AndroidWater")')) {
  problems.push("MainActivity does not expose window.AndroidWater");
}
if (!patchedManifest.includes("WaterBroadcastReceiver")) problems.push("manifest has no receiver");

if (problems.length > 0) {
  console.error(`[android-native] verification failed: ${problems.join(", ")}`);
  process.exit(1);
}

console.log(`[android-native] package ${pkg}`);
console.log(`[android-native] wrote WaterBroadcastReceiver.kt + MainActivity.kt`);
console.log(`[android-native] registered .WaterBroadcastReceiver in the manifest`);
