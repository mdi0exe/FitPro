#!/usr/bin/env node
/**
 * Native Android glue for:
 *   1. Silent water reminder action ("+۱ لیوان آب" via BroadcastReceiver)
 *      with a full-interval reschedule whenever a glass is logged.
 *   2. Saving backup JSON into the public Download folder via MediaStore.
 *   3. The native Android Share Sheet (ACTION_SEND) for real .json files.
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

        /**
         * Same file the Rust side owns: app_data_dir()/gym_state.json.
         * Tauri 2.x resolves app_data_dir() to activity.dataDir on Android
         * (PathPlugin.kt -> getDataDir), NOT context.filesDir. Both paths are
         * checked for tolerance, but dataDir wins when both exist because
         * that is where Rust actually writes. Callers bail out if neither
         * file exists, so the fallback path is never used for a new write.
         */
        private fun stateFile(context: Context): File {
            val inData = File(context.dataDir, "${STATE_FILE}")
            if (inData.exists()) return inData
            val inFiles = File(context.filesDir, "${STATE_FILE}")
            return if (inFiles.exists()) inFiles else inData
        }

        private fun toPersianDigits(value: Int): String {
            val map = charArrayOf('۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹')
            return value.toString().map { ch ->
                if (ch in '0'..'9') map[ch - '0'] else ch
            }.joinToString("")
        }

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
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED -> {
                restoreAlarmOnBoot(context)
            }

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
                // Drinking from the action button must restart the countdown,
                // otherwise the pending alarm rings again moments later.
                rescheduleFromState(context)

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
                    "💧 نوش جان! آب امروز: " + toPersianDigits(glasses) + " لیوان",
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
                // Yesterday's meal ticks must go too, otherwise the JS
                // ensureDailyDietReset() sees a "reset" date that is already
                // today and leaves the stale ticks in place.
                val dayItems = diet.optJSONArray("items")
                if (dayItems != null) {
                    for (index in 0 until dayItems.length()) {
                        dayItems.optJSONObject(index)?.put("done", false)
                    }
                }
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

            // Keep today's calendar entry in sync even if the student never
            // opens the app before midnight.
            val history = root.optJSONArray("activityHistory") ?: org.json.JSONArray().also {
                root.put("activityHistory", it)
            }
            var todayEntry: JSONObject? = null
            for (i in 0 until history.length()) {
                val entry = history.optJSONObject(i) ?: continue
                if (entry.optString("date") == day) {
                    todayEntry = entry
                    break
                }
            }
            if (todayEntry == null) {
                todayEntry = JSONObject().apply {
                    put("date", day)
                    put("workoutTitle", "")
                    put("completedExercises", org.json.JSONArray())
                    put("setsDone", 0)
                    put("warmupsDone", 0)
                    put("dietDone", 0)
                    put("dietTotal", diet.optJSONArray("items")?.length() ?: 5)
                    put("waterGlasses", glasses)
                }
                history.put(0, todayEntry)
            } else {
                todayEntry.put("waterGlasses", glasses)
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

    /** Re-arms the water alarm after a reboot or an app update. */
    private fun restoreAlarmOnBoot(context: Context) {
        try {
            val file = stateFile(context)
            if (!file.exists()) return
            val root = JSONObject(file.readText(Charsets.UTF_8))
            val diet = root.optJSONObject("diet") ?: return
            if (!diet.optBoolean("waterReminderEnabled", false)) return
            val savedNext = diet.optLong("waterReminderNextAt", 0L)
            val now = System.currentTimeMillis()
            if (savedNext > now + 1000L) {
                scheduleAt(context, quietHoursAdjusted(savedNext))
            } else {
                rescheduleFromState(context)
            }
        } catch (_: Exception) {
        }
    }
}
`;

// ---------------------------------------------------------------------------
// MainActivity.kt
// ---------------------------------------------------------------------------

const mainActivityKt = `package ${pkg}

import android.content.ClipData
import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import java.io.File
import java.io.FileNotFoundException

/**
 * Zero-XML ContentProvider so the app can attach a real .json file to the
 * native share sheet (Telegram, WhatsApp, Drive, ...) on every Android
 * version without tripping FileUriExposedException.
 */
class BackupFileProvider : ContentProvider() {
    companion object {
        const val AUTHORITY = "${pkg}.backup"

        fun sanitizeName(raw: String): String {
            val cleaned = raw.take(80).map { ch ->
                if (ch.isLetterOrDigit() || ch == '.' || ch == '-' || ch == '_') ch else '-'
            }.joinToString("").trim('-', '.')
            val base = if (cleaned.isEmpty()) "hypertrophy-backup.json" else cleaned
            return if (base.endsWith(".json")) base else "\$base.json"
        }

        fun backupCacheDir(context: Context): File =
            File(context.cacheDir, "shared_backups").apply { mkdirs() }
    }

    override fun onCreate(): Boolean = true

    override fun getType(uri: Uri): String = "application/json"

    override fun query(
        uri: Uri,
        projection: Array<out String>?,
        selection: String?,
        selectionArgs: Array<out String>?,
        sortOrder: String?
    ): Cursor? {
        val ctx = context ?: return null
        val name = sanitizeName(uri.lastPathSegment ?: return null)
        val file = File(backupCacheDir(ctx), name)
        if (!file.exists()) return null
        val cols = projection ?: arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE)
        val row = Array<Any?>(cols.size) { i ->
            when (cols[i]) {
                OpenableColumns.DISPLAY_NAME -> file.name
                OpenableColumns.SIZE -> file.length()
                else -> null
            }
        }
        return MatrixCursor(cols, 1).apply { addRow(row) }
    }

    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor? {
        val ctx = context ?: throw FileNotFoundException("No context")
        val name = sanitizeName(uri.lastPathSegment ?: throw FileNotFoundException("No filename"))
        val file = File(backupCacheDir(ctx), name)
        if (!file.exists()) throw FileNotFoundException(file.absolutePath)
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
    }

    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = 0
    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?): Int = 0
}

/**
 * ${MARKER}: bridge behind \`window.AndroidWater\` (see src/lib/notify.ts).
 *
 * Exposed to the bundled frontend only — the WebView never navigates away from
 * the app's own assets. Besides the water alarm it now owns the two backup
 * entry points, which cannot be implemented from Rust or a WebView alone.
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

    /**
     * Writes the backup straight into the phone's public Download folder.
     * Android 10+ scoped storage blocks plain file writes there, so it goes
     * through MediaStore.Downloads, which needs no runtime permission.
     */
    @JavascriptInterface
    fun saveBackupToDownloads(fileName: String, contents: String): String {
        val safeName = BackupFileProvider.sanitizeName(fileName)
        val bytes = contents.toByteArray(Charsets.UTF_8)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val resolver = context.contentResolver
            try {
                resolver.delete(
                    MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                    "\${MediaStore.MediaColumns.DISPLAY_NAME} = ?",
                    arrayOf(safeName)
                )
            } catch (_: Exception) {
            }
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, safeName)
                put(MediaStore.MediaColumns.MIME_TYPE, "application/json")
                put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
            }
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: throw IllegalStateException("MediaStore insert returned null")
            resolver.openOutputStream(uri)?.use { out ->
                out.write(bytes)
                out.flush()
            } ?: throw IllegalStateException("openOutputStream returned null")
            var actualName = safeName
            try {
                resolver.query(uri, arrayOf(MediaStore.MediaColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                    if (cursor.moveToFirst()) {
                        val idx = cursor.getColumnIndex(MediaStore.MediaColumns.DISPLAY_NAME)
                        if (idx >= 0 && !cursor.isNull(idx)) actualName = cursor.getString(idx)
                    }
                }
            } catch (_: Exception) {
            }
            return "/storage/emulated/0/Download/\$actualName"
        }

        @Suppress("DEPRECATION")
        val publicDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        return try {
            if (!publicDir.exists()) publicDir.mkdirs()
            val target = File(publicDir, safeName)
            target.writeBytes(bytes)
            target.absolutePath
        } catch (_: Exception) {
            val fallbackDir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
                ?: File(context.filesDir, "backups")
            if (!fallbackDir.exists()) fallbackDir.mkdirs()
            val target = File(fallbackDir, safeName)
            target.writeBytes(bytes)
            target.absolutePath
        }
    }

    /** Opens the native Share Sheet with the real .json file attached. */
    @JavascriptInterface
    fun shareBackupFile(fileName: String, contents: String): Boolean {
        return try {
            val safeName = BackupFileProvider.sanitizeName(fileName)
            val cacheDir = BackupFileProvider.backupCacheDir(context)
            // Drop older backups so the cache cannot grow without bound.
            cacheDir.listFiles()?.forEach { old ->
                if (old.name != safeName) old.delete()
            }
            val file = File(cacheDir, safeName)
            file.writeText(contents, Charsets.UTF_8)

            val uri = Uri.parse("content://\${BackupFileProvider.AUTHORITY}/\$safeName")
            val sendIntent = Intent(Intent.ACTION_SEND).apply {
                type = "application/json"
                putExtra(Intent.EXTRA_STREAM, uri)
                putExtra(Intent.EXTRA_SUBJECT, safeName)
                putExtra(Intent.EXTRA_TITLE, safeName)
                clipData = ClipData.newRawUri(safeName, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            val chooser = Intent.createChooser(sendIntent, "ارسال فایل پشتیبان").apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            if (chooser.resolveActivity(context.packageManager) == null) return false
            Handler(Looper.getMainLooper()).post {
                try {
                    context.startActivity(chooser)
                } catch (_: Exception) {
                    android.widget.Toast.makeText(
                        context,
                        "برنامه‌ای برای اشتراک‌گذاری پیدا نشد.",
                        android.widget.Toast.LENGTH_SHORT
                    ).show()
                }
            }
            true
        } catch (_: Exception) {
            false
        }
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
if (!manifest.includes("</application>")) {
  console.error("[android-native] no </application> tag — unexpected manifest shape.");
  process.exit(1);
}
let manifestChanged = false;

if (!manifest.includes("WaterBroadcastReceiver")) {
  const receiverTag = [
    `        <!-- ${MARKER}: the water action stays in the background -->`,
    `        <receiver`,
    `            android:name=".WaterBroadcastReceiver"`,
    `            android:exported="true">`,
    `            <intent-filter>`,
    `                <action android:name="android.intent.action.BOOT_COMPLETED" />`,
    `                <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />`,
    `            </intent-filter>`,
    `        </receiver>`,
  ].join("\n");
  manifest = manifest.replace("</application>", `${receiverTag}\n    </application>`);
  manifestChanged = true;
}

if (!manifest.includes("BackupFileProvider")) {
  const providerTag = [
    `        <!-- ${MARKER}: granted content Uri for the native share sheet -->`,
    `        <provider`,
    `            android:name=".BackupFileProvider"`,
    `            android:authorities="${pkg}.backup"`,
    `            android:exported="false"`,
    `            android:grantUriPermissions="true" />`,
  ].join("\n");
  manifest = manifest.replace("</application>", `${providerTag}\n    </application>`);
  manifestChanged = true;
}

if (manifestChanged) fs.writeFileSync(MANIFEST, manifest, "utf8");

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
if (!mainActivity.includes("MediaStore.Downloads.EXTERNAL_CONTENT_URI")) {
  problems.push("backup save does not use MediaStore.Downloads");
}
if (!mainActivity.includes("Intent.ACTION_SEND")) problems.push("native share sheet is missing");
if (!mainActivity.includes("class BackupFileProvider")) problems.push("BackupFileProvider is missing");
if (!patchedManifest.includes("BackupFileProvider")) problems.push("manifest has no file provider");
if (!written.includes("rescheduleFromState(context)")) {
  problems.push("drink action does not restart the water timer");
}

if (problems.length > 0) {
  console.error(`[android-native] verification failed: ${problems.join(", ")}`);
  process.exit(1);
}

console.log(`[android-native] package ${pkg}`);
console.log(`[android-native] wrote WaterBroadcastReceiver.kt + MainActivity.kt`);
console.log(`[android-native] registered .WaterBroadcastReceiver + .BackupFileProvider in the manifest`);
console.log("[android-native] enabled MediaStore Downloads save + native share sheet");
