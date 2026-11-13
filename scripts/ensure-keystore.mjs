/**
 * Creates the *stable* Android debug signing key that lives in the repository.
 *
 * Why this exists: every GitHub Actions runner generates a brand-new
 * `~/.android/debug.keystore` on first use, so every CI APK was signed with a
 * different certificate. Android refuses to install an update over an existing
 * app when the signing certificate changes ("App not installed" /
 * INSTALL_FAILED_UPDATE_INCOMPATIBLE), which forced a full uninstall — and that
 * wipes `gym_state.json` and every progress photo with it.
 *
 * Committing one fixed debug keystore and copying it to `~/.android/` before the
 * Gradle build keeps the certificate identical across runs, so new APKs install
 * straight over the old ones and the user keeps all of their data.
 *
 * Security note: this is a **debug** key with the well-known password `android`.
 * It is public by design and only suitable for sideloading. A Play Store release
 * must use a private upload key instead.
 *
 * Output (committed): src-tauri/keystore/debug.keystore
 *
 * Usage: node scripts/ensure-keystore.mjs [--force]
 *   --force  recreate the keystore even when one already exists
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "src-tauri", "keystore");
const OUT_FILE = path.join(OUT_DIR, "debug.keystore");

const STORE_PASS = "android";
const KEY_PASS = "android";
const ALIAS = "androiddebugkey";
const DNAME = "CN=Android Debug,O=Android,C=US";
/** ~27 years: the debug key must outlive any plausible sideload session. */
const VALIDITY_DAYS = "10000";

const force = process.argv.includes("--force");

/**
 * Finds a usable `keytool`. JAVA_HOME wins because the Android Gradle build uses
 * that JDK, and the key format must match the one Gradle expects.
 */
function findKeytool() {
  const exe = process.platform === "win32" ? "keytool.exe" : "keytool";
  const candidates = [];
  if (process.env.JAVA_HOME) {
    candidates.push(path.join(process.env.JAVA_HOME, "bin", exe));
  }
  candidates.push(exe); // PATH lookup

  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["-help"], { stdio: "ignore" });
    if (!probe.error && probe.status === 0) return candidate;
  }
  return null;
}

function humanSize(bytes) {
  return bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} kB` : `${bytes} B`;
}

if (fs.existsSync(OUT_FILE) && !force) {
  const size = fs.statSync(OUT_FILE).size;
  console.log(`[keystore] already present: ${path.relative(ROOT, OUT_FILE)} (${humanSize(size)})`);
  console.log("[keystore] re-run with --force to regenerate it");
  process.exit(0);
}

const keytool = findKeytool();
if (!keytool) {
  console.error("[keystore] keytool not found.");
  console.error("[keystore] Install a JDK 17+ and either set JAVA_HOME or put keytool on PATH.");
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
if (fs.existsSync(OUT_FILE)) fs.rmSync(OUT_FILE, { force: true });

const args = [
  "-genkeypair",
  "-v",
  "-keystore",
  OUT_FILE,
  // PKCS12 is the default in JDK 9+; stating it keeps old and new JDKs identical.
  "-storetype",
  "PKCS12",
  "-storepass",
  STORE_PASS,
  "-keypass",
  KEY_PASS,
  "-alias",
  ALIAS,
  "-keyalg",
  "RSA",
  "-keysize",
  "2048",
  "-validity",
  VALIDITY_DAYS,
  "-dname",
  DNAME,
];

console.log(`[keystore] keytool: ${keytool}`);
console.log(`[keystore] writing ${path.relative(ROOT, OUT_FILE)}`);

const result = spawnSync(keytool, args, { stdio: "inherit" });
if (result.error) {
  console.error(`[keystore] failed to run keytool: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) {
  console.error(`[keystore] keytool exited with code ${result.status}`);
  process.exit(result.status ?? 1);
}

if (!fs.existsSync(OUT_FILE)) {
  console.error("[keystore] keytool reported success but the file is missing");
  process.exit(1);
}

const size = fs.statSync(OUT_FILE).size;
console.log(`[keystore] done: ${path.relative(ROOT, OUT_FILE)} (${humanSize(size)})`);
console.log(`[keystore] alias=${ALIAS} storepass=${STORE_PASS} keypass=${KEY_PASS} validity=${VALIDITY_DAYS}d`);
console.log("[keystore] commit this file — CI copies it to ~/.android/debug.keystore before building");
console.log(`[keystore] local installs: cp "${OUT_FILE}" "${path.join(os.homedir(), ".android", "debug.keystore")}"`);
