#!/usr/bin/env node
/**
 * Adds the exact-alarm permissions to the generated Android manifest.
 *
 * Why a script instead of editing the file: `src-tauri/gen/android` is
 * git-ignored and recreated by `tauri android init` on every CI run, so a manual
 * edit would disappear. This runs right after init (locally and in CI) and is
 * idempotent.
 *
 * The notification plugin checks `AlarmManager.canScheduleExactAlarms()` and
 * only then uses `setExactAndAllowWhileIdle`; without these permissions Android
 * falls back to an inexact alarm that Doze can delay by minutes.
 *
 * Usage: node scripts/patch-android-manifest.mjs
 */
import fs from "node:fs";
import path from "node:path";

const MANIFEST = path.join(
  "src-tauri",
  "gen",
  "android",
  "app",
  "src",
  "main",
  "AndroidManifest.xml",
);

const PERMISSIONS = [
  "android.permission.POST_NOTIFICATIONS",
  "android.permission.SCHEDULE_EXACT_ALARM",
  "android.permission.USE_EXACT_ALARM",
  "android.permission.WAKE_LOCK",
];

const MARKER = "<!-- exact-alarm-reminders -->";

if (!fs.existsSync(MANIFEST)) {
  console.error(`[manifest] ${MANIFEST} does not exist.`);
  console.error("[manifest] Run `npx tauri android init` first, then re-run this script.");
  process.exit(1);
}

const original = fs.readFileSync(MANIFEST, "utf8");
const missing = PERMISSIONS.filter(
  (permission) => !original.includes(`android:name="${permission}"`),
);

if (missing.length === 0) {
  console.log("[manifest] all exact-alarm permissions are already present.");
  process.exit(0);
}

const lines = original.split("\n");
const applicationIndex = lines.findIndex((line) => line.trimStart().startsWith("<application"));
if (applicationIndex === -1) {
  console.error("[manifest] no <application> tag found — unexpected template shape.");
  process.exit(1);
}

const indent = lines[applicationIndex].match(/^\s*/)?.[0] ?? "    ";
const markerIndex = lines.findIndex((line) => line.includes(MARKER));

const block = missing.map(
  (permission) => `${indent}<uses-permission android:name="${permission}" />`,
);

if (markerIndex === -1) {
  // Keep the block together, just above <application>.
  lines.splice(applicationIndex, 0, `${indent}${MARKER}`, ...block);
} else {
  lines.splice(markerIndex + 1, 0, ...block);
}

const patched = lines.join("\n");
fs.writeFileSync(MANIFEST, patched, "utf8");

const stillMissing = PERMISSIONS.filter(
  (permission) => !patched.includes(`android:name="${permission}"`),
);
if (stillMissing.length > 0) {
  console.error(`[manifest] failed to add: ${stillMissing.join(", ")}`);
  process.exit(1);
}

const shortNames = missing.map((permission) => permission.split(".").pop());
console.log(`[manifest] added ${missing.length} permission(s): ${shortNames.join(", ")}`);
console.log(`[manifest] ${MANIFEST}`);
