#!/usr/bin/env node
/**
 * Teaches the generated Android `MainActivity` to stay in the background when
 * the water notification's action button is used.
 *
 * Why a script instead of editing the file: `src-tauri/gen/android` is
 * git-ignored and recreated by `tauri android init` on every CI run, so a manual
 * edit would disappear. This runs right after init (locally and in CI) and is
 * idempotent — a second run detects the marker and exits.
 *
 * Why it is needed at all: the notification plugin builds the action button's
 * `PendingIntent` with `Intent(context, activity.javaClass)`, i.e. tapping
 * "💧 +۱ لیوان آب خوردم" *starts the activity*. Android therefore drags the whole
 * app to the foreground just to log one glass. The JS side saves the glass; here
 * we read the action extra, let the plugin deliver the event, then send the task
 * back with `moveTaskToBack(true)` so the user stays wherever they were.
 *
 * Usage: node scripts/inject-main-activity.mjs
 */
import fs from "node:fs";
import path from "node:path";

const JAVA_ROOT = path.join("src-tauri", "gen", "android", "app", "src", "main", "java");
const MARKER = "// fitpro-background-water";

/** Extras written by tauri-plugin-notification (see TauriNotificationManager.kt). */
const ACTION_EXTRA = "NotificationUserAction";
const WATER_ACTION_ID = "drink_one_glass";

const BLOCK = `
  ${MARKER} ---------------------------------------------------------------
  // Tapping the water notification's action starts this activity, which would
  // yank the whole app in front of whatever the user is doing. The glass is
  // logged from JavaScript; all this does is read the action extra, let the
  // plugin deliver it, and then push the task straight back.
  private var fitproWaterMinimize = false

  private fun fitproReadWaterAction(source: Intent?) {
    if (source?.getStringExtra("${ACTION_EXTRA}") != "${WATER_ACTION_ID}") return
    // Consume it: onResume also fires on ordinary returns from the background
    // and must not minimise the app again because of a stale extra.
    source.removeExtra("${ACTION_EXTRA}")
    fitproWaterMinimize = true
  }

  private fun fitproMinimizeIfNeeded() {
    if (!fitproWaterMinimize) return
    fitproWaterMinimize = false
    // Give the WebView a moment to run the action handler and persist the glass
    // before the activity is stopped.
    Handler(Looper.getMainLooper()).postDelayed({ moveTaskToBack(true) }, 700L)
  }

  override fun onNewIntent(intent: Intent) {
    // super() first: the notification plugin reads the action in its own hook.
    super.onNewIntent(intent)
    setIntent(intent)
    fitproReadWaterAction(intent)
    fitproMinimizeIfNeeded()
  }

  override fun onResume() {
    super.onResume()
    // Cold start: the launch intent only exists once the activity is created.
    fitproReadWaterAction(intent)
    fitproMinimizeIfNeeded()
  }
  ${MARKER} ---------------------------------------------------------------
`;

const IMPORTS = [
  "import android.content.Intent",
  "import android.os.Handler",
  "import android.os.Looper",
];

function findMainActivity(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = findMainActivity(full);
      if (nested) return nested;
    } else if (entry.name === "MainActivity.kt") {
      return full;
    }
  }
  return null;
}

if (!fs.existsSync(JAVA_ROOT)) {
  console.error(`[main-activity] ${JAVA_ROOT} does not exist.`);
  console.error("[main-activity] Run `npx tauri android init` first, then re-run this script.");
  process.exit(1);
}

const target = findMainActivity(JAVA_ROOT);
if (!target) {
  console.error(`[main-activity] no MainActivity.kt under ${JAVA_ROOT}.`);
  process.exit(1);
}

const original = fs.readFileSync(target, "utf8");
if (original.includes(MARKER)) {
  console.log(`[main-activity] already patched: ${target}`);
  process.exit(0);
}

// ---------------------------------------------------------------------- imports
let patched = original;
const missingImports = IMPORTS.filter((line) => !patched.split("\n").includes(line));
if (missingImports.length > 0) {
  const lines = patched.split("\n");
  let anchor = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].startsWith("import ")) anchor = i;
  }
  if (anchor === -1) {
    anchor = lines.findIndex((line) => line.startsWith("package "));
    if (anchor === -1) {
      console.error("[main-activity] neither a package nor an import line was found.");
      process.exit(1);
    }
  }
  lines.splice(anchor + 1, 0, ...missingImports);
  patched = lines.join("\n");
}

// --------------------------------------------------------------------- overrides
// The template's class body is the last brace in the file, so inserting just
// before it keeps the existing `onCreate` (with `enableEdgeToEdge()`) intact.
const closing = patched.lastIndexOf("}");
if (closing === -1) {
  console.error("[main-activity] no closing brace found — unexpected template shape.");
  process.exit(1);
}
patched = `${patched.slice(0, closing)}${BLOCK}${patched.slice(closing)}`;

fs.writeFileSync(target, patched, "utf8");

const written = fs.readFileSync(target, "utf8");
for (const needle of [MARKER, "override fun onNewIntent", "override fun onResume", "moveTaskToBack"]) {
  if (!written.includes(needle)) {
    console.error(`[main-activity] patch verification failed: ${needle} is missing.`);
    process.exit(1);
  }
}

console.log(`[main-activity] background water action injected: ${target}`);
console.log(`[main-activity] ${written.split("\n").length} lines total`);
