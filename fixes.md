این پکیجِ کامل و یکپارچه شامل **تمام اصلاحات** (هر ۳۳ باگ بررسی‌شده + اصلاحات موبایلی و کیبورد که خودت فرستادی)، به همراه تنظیم ورک‌فلو برای **بیلد پیش‌فرض `arm64` (`aarch64`)**، **انتشار مستقیم فایل `.apk` بدون ZIP در GitHub Releases** (چون بخش Artifacts خود گیت‌هاب همیشه خروجی را زیپ می‌کند، پس انتشار در Releases تنها راه دانلود مستقیم خودِ فایل `.apk` است)، و در نهایت **آپدیت دامپ و پوش به گیت‌هاب** است.

متن زیر را کامل برای هوش مصنوعی کامپیوترت بفرست تا اعمال و اجرا کند:

---

### دستورالعمل کامل اعمال تغییرات برای هوش مصنوعی کامپیوتر

لطفاً تغییرات زیر را با دقت روی فایل‌های پروژه اعمال کن. تمام نکات `strict` تایپ‌اسکریپت (`noUnusedLocals`, `noUnusedParameters`) و `cargo test` و سازگاری با تست‌های `scripts/e2e-*.mjs` در آن‌ها رعایت شده است.

---

#### ۱. تغییر ورک‌فلو برای بیلد `arm64` و دانلود مستقیم `.apk` بدون ZIP: `.github/workflows/android-apk.yml`

1. در بخش `workflow_dispatch.inputs.target` مقدار `default` را به `aarch64` تغییر بده:
   - `default: aarch64`
2. در بخش `permissions:` سطح دسترسی را برای انتشار Release تغییر بده:
   - `contents: write`
3. در مرحله `Build debug APK`:
   - خط `TARGET_INPUT: ${{ inputs.target || 'armv7' }}` را به `TARGET_INPUT: ${{ inputs.target || 'aarch64' }}` تغییر بده.
4. بلافاصله بعد از مرحله `Verify permissions inside the APK` (و قبل از `Upload APK artifact`) مرحله زیر را اضافه کن تا فایل `.apk` مستقیماً و بدون `.zip` در GitHub Releases منتشر شود:

```yaml
      - name: Publish direct arm64 APK to GitHub Releases (no ZIP)
        if: github.event_name != 'pull_request'
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          set -euo pipefail
          TAG="apk-latest"
          if gh release view "$TAG" >/dev/null 2>&1; then
            gh release upload "$TAG" artifacts/*.apk artifacts/SHA256SUMS.txt --clobber
          else
            gh release create "$TAG" artifacts/*.apk artifacts/SHA256SUMS.txt \
              --target "${GITHUB_SHA}" \
              --title "Latest Android Debug APK (arm64)" \
              --notes "Direct arm64-v8a APK download (without ZIP). Commit: ${GITHUB_SHA}"
          fi
```

5. در مرحله `Write job summary` لینک دانلود مستقیم Release (بدون ZIP) را هم به خلاصه اضافه کن:
   ```bash
   echo "📥 **Direct APK download (no ZIP):** ${{ github.server_url }}/${{ github.repository }}/releases/tag/apk-latest"
   ```

---

#### ۲. بک‌اند Rust: `src-tauri/src/models.rs`، `src-tauri/src/storage.rs`، `src-tauri/src/lib.rs`

**در `src-tauri/src/models.rs`:**
1. به `WarmupItem` فیلد `done_date` اضافه کن:
   ```rust
   #[serde(default)]
   pub done_date: Option<String>,
   ```
2. به `SetLog` فیلد `done_date` اضافه کن و در `SetLog::new` مقدار `done_date: None` بگذار:
   ```rust
   #[serde(default)]
   pub done_date: Option<String>,
   ```
3. در `CourseSession` روی `pub id: String` ویژگی `#[serde(default)]` بگذار تا JSON بدون `id` فایل ذخیره را خراب نکند.
4. در `AppStateData` روی `pub onboarding_completed: bool` ویژگی `#[serde(default = "default_true")]` بگذار (تا فایل‌های قدیمی دوباره وارد ویزارد نشوند؛ نصب تازه در `storage.rs::seed()` مقدار `false` می‌گیرد).
5. در `gif_needs_replacement`: اگر `trimmed == "none"` بود `return false;` برگردان (تا حذف دستی گیف دائمی بماند).
6. در `is_iso_date`:
   ```rust
   fn is_iso_date(value: &str) -> bool {
       value.len() == 10 && chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d").is_ok()
   }
   ```
7. در `AppStateData::normalize(&mut self)`:
   - قد و وزن‌های نامعتبر یا صفر را اصلاح کن (`height_cm` اگر `!is_finite() || <= 0.0` شود `179.0` وگرنه `clamp(120.0, 230.0)`؛ `start_weight` و `current_weight` و `target_weight` اگر `!is_finite() || <= 0.0` مقدار پیش‌فرض بگیرند).
   - `activity_history` را بعد از مرتب‌سازی بر اساس `date` یکتا (`HashSet`) کن و `diet_done` را به `if entry.diet_total == 0 { 5 } else { entry.diet_total }` محدود کن.
   - در چک رژیم قدیمی (`legacy_diet`) ردیف‌های `ai-*` و `custom-*` را مستثنا کن و فقط جملات دقیق قدیمی (`"۳ تا ۴ عدد تخم‌مرغ کامل (ارزان‌ترین بمب پروتئین)"` و `"وعده کامل سلف دانشگاه (با برنج و نان اضافه)"` یا `"بمب پروتئین"` / `"عدسی یا خوراک سویا"`) را چک کن.
   - در حلقه `exercise`: فقط وقتی `gifs.exercises.contains_key(&exercise.id)` صادق باشد مسیر `/gifs/{id}-alt.gif` یا `/gifs/{id}.gif` بساز تا برای حرکات دلخواه `ex-...` لینک خراب نسازد.
8. در `apply_overload`: در ابتدای تابع `state.deload_active = false;` و برای هر `warmup` مقدار `warmup.done_date = None;` را ست کن.

**در `src-tauri/src/storage.rs`:**
- در تابع `warmup(...)` مقدار `done_date: None,` را به `WarmupItem` اضافه کن.

**در `src-tauri/src/lib.rs`:**
- در `reset_to_defaults` بعد از بازگردانی `workout_program_id`، خط زیر را اضافه کن:
  ```rust
  fresh.profile.goal = crate::models::UserProfile::default().goal;
  ```

---

#### ۳. اسکریپت‌های اندروید نیتیو و دامپ/تست (`scripts/`)

1. **`scripts/patch-android-manifest.mjs`:**
   - `"android.permission.RECEIVE_BOOT_COMPLETED"` را به آرایه `PERMISSIONS` اضافه کن.

2. **`scripts/setup-android-native.mjs`:**
   - در `WaterBroadcastReceiver.kt`:
     - در `onReceive` برای `Intent.ACTION_BOOT_COMPLETED` و `Intent.ACTION_MY_PACKAGE_REPLACED` متد `restoreAlarmOnBoot(context)` را صدا بزن (که اگر `waterReminderEnabled` روشن است، بر اساس `waterReminderNextAt` یا `rescheduleFromState(context)` آلارم را دوباره تنظیم کند).
     - در `incrementWaterInStateFile(context)` وقتی `diet.optString("lastResetDate", day) != day` شد، علاوه بر صفر کردن `waterGlasses` و نوشتن `lastResetDate = day`، روی `diet.optJSONArray("items")` حلقه بزن و `done = false` بگذار.
   - در بخش `AndroidManifest.xml`: تگ `<receiver android:name=".WaterBroadcastReceiver" ...>` را با `android:exported="true"` و `<intent-filter>` برای `BOOT_COMPLETED` و `MY_PACKAGE_REPLACED` ثبت کن (در بررسی وجود، `grep` روی `WaterBroadcastReceiver` همچنان پاس می‌شود).
   - در `MainActivity.kt`:
     - در `saveBackupToDownloads`: بعد از نوشتن در `MediaStore`, با `resolver.query(uri, arrayOf(MediaStore.MediaColumns.DISPLAY_NAME), ...)` نام واقعی فایل ساخته‌شده را بخوان و در مسیر برگشتی قرار بده.
     - در `shareBackupFile`: قبل از `Handler.post` با `if (chooser.resolveActivity(context.packageManager) == null) return false` چک کن و داخل `Handler.post` کل `context.startActivity(chooser)` را داخل `try/catch` بگذار تا اپ کرش نکند.

3. **`scripts/gen-android-icons.mjs`:**
   - در حلقه `for (const dir of targets)` قبل از نوشتن PNGها، فایل‌های قدیمی `ic_launcher.webp`، `ic_launcher_round.webp`، `ic_launcher_foreground.webp` (داخل `mipmap-${name}`) و `drawable-v24/ic_launcher_foreground.xml` را اگر وجود دارند حذف کن تا تداخل منابع در `aapt2` پیش نیاید.

4. **`scripts/dump-code.mjs`:**
   - خط `if (rel === "src-tauri/icons") continue;` را به `if (rel === "src-tauri/icons/android") continue;` تغییر بده و داخل حلقه `walk` برای فایل‌ها اضافه کن:
     ```javascript
     if (rel.startsWith("src-tauri/icons/") && path.extname(rel).toLowerCase() !== ".svg") continue;
     ```
     تا `icon.svg` و `foreground.svg` در دامپ بیایند و باینری‌ها رد شوند.

5. **`scripts/serve-dist.mjs`:**
   - در `types` موارد `".gif": "image/gif"` و `".mp3": "audio/mpeg"` را اضافه کن و خط چک مسیر را به `if (file !== root && !file.startsWith(root + path.sep))` اصلاح کن.

6. **`scripts/verify-ui.mjs`:**
   - آرایه تب‌ها را به `["02-progress", "03-nutrition", "04-uni", "05-coach"]` تغییر بده و منوی حرکت را با `cards[0].$('.btn-icon[aria-label="گزینه‌های حرکت"]')` باز کن.

7. **`scripts/e2e-swap-quiet.mjs`:**
   - در خط ۱۳۹ بعد از باز کردن مودال جایگزین، روی `button[aria-label="جایگزین پیشنهادی"]` کلیک کن تا واقعاً جایگزینی قبل از تستِ ریست روز بعد انجام شود.

8. **`scripts/e2e-water.mjs`:**
   - در `countdownSeconds` رگولار اکسپرشن را به `/(?:(\d+):)?(\d+):(\d+)/` تغییر بده تا فرمت `H:MM:SS` در ساعات خواب شبانه هم درست پارس شود.

9. **`scripts/e2e-v5.mjs`:**
   - در بخش ۳ (هفته خودکار): به‌جای چک `semesterWeekAnchorDate === null`, بررسی کن `typeof before.semesterWeekAnchorDate === "string" && before.semesterWeekAnchorDate.length === 10`.
   - در بخش ۷ (Double Progression): بررسی کن بازه تکرار حفظ شده است (`String(after.reps) === String(beforeExercise.reps)`).

---

#### ۴. تایپ‌ها، داده‌ها و منطق پایه (`src/types.ts`, `src/data/`, `src/lib/`)

1. **`src/types.ts` و `src/data/seed.ts`:**
   - به `WarmupItem` و `SetLog` فیلد `doneDate?: string | null;` اضافه کن و در `seed.ts` مقدار `doneDate: null` بگذار.

2. **`src/data/programs.ts`:**
   - به `pick(base, dayIndex, exIndex, idOverride?: string)` پارامتر `idOverride` اضافه کن تا هیچ `exercise.id` در یک برنامه دو بار تکرار نشود:
     - در `ppl-6`: روی `ppl-4` مقادیر `"ppl4-d3e1"`، `"ppl4-d1e1"`، `"ppl4-d1e5"` و روی `ppl-5` مقدار `"ppl5-d3e5"` بده.
     - در `dorm-daily`: شنا سوئدی `"dorm-pushup"`، اسکوات `"dorm-squat"`، و شکم روز ۱ و ۲ را `"dorm1-d2e6"` و `"dorm2-d2e6"` بگذار.

3. **`src/data/dietTemplates.ts`:**
   - `activeDietTemplateId(items)` را طوری بنویس که تمام ردیف‌های غیر از `custom-*` و `diet-4` و `diet-5` را با ردیف‌های هر الگو چک کند تا با حذف یک وعده (مثل صبحانه) هنوز الگوی درست تشخیص داده شود.

4. **`src/lib/fa.ts`:**
   - در `faNum`: خط `trimmed` را با `.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "")` اصلاح کن تا `faNum(2.5, 2)` شود `"۲٫۵"`.
   - در `faSigned`: وقتی `Math.abs(value) < (digits > 0 ? 0.05 : 0.5)` است `"۰"` برگردان.
   - در `clock`: برای زمان‌های `>= 3600` ثانیه فرمت `H:MM:SS` برگردان.
   - در `makePersianNumericInput`: ارقام عربی `٠-٩` (`0x0660..0x0669`) را هم به `FA_DIGITS` تبدیل کن.

5. **`src/lib/api.ts`:**
   - در `loadState()` درون `if (isTauri())`، `try/catch` با fallback به `localLoad()` را حذف کن تا خطای موقت IPC فایل واقعی گوشی را با داده خام `localStorage` بازنویسی نکند.

6. **`src/lib/localBackend.ts`:**
   - در `gifNeedsReplacement`: برای `"none"` مقدار `false` برگردان.
   - در `isLegacyDiet`: مثل `models.rs` ردیف‌های `ai-*` و `custom-*` را مستثنا کن و جملات دقیق قدیمی را چک کن.
   - در `normalizeState`:
     - `activityHistory` را بر اساس `date` یکتا و `waterGlasses`/`dietTotal`/`dietDone` را clamp کن.
     - `profile.heightCm` را به `[120, 230]` (پیش‌فرض `179`) و `targetWeight <= 0` را به `75` اصلاح کن.
     - اگر `state.days.length === 0` بود `return state;` (مثل Rust، تا سایر اطلاعات در حالت `uni_only` پاک نشوند).
     - تاریخ `semesterWeekAnchorDate` را با تقویم واقعی (`localDateFromIso`) چک کن.
     - در `courses`: اگر `endTime <= startTime` شد ۲ ساعت به `startTime` اضافه کن (سقف `23:59`).
     - در حلقه `exercise`: فقط اگر `exercise.id in exerciseGifs` باشد `/gifs/${exercise.id}-alt.gif` یا `/gifs/${exercise.id}.gif` بساز.
     - در `syncLogs`: `doneDate: found.doneDate ?? null`.
     - در `localApplyOverload`: `state.deloadActive = false;` و `warmup.doneDate = null;`.
     - در `localReset`: `fresh.profile.goal = createSeedState().profile.goal;`.

7. **`src/lib/store.ts`:**
   - نسخه ادغام‌شده `flushNow()` با `activeFlushPromise` و حلقه `while` + `hasPendingSave()` که `saveTimer !== null || flushing || queued` را برگرداند + export کردن `waitForInflightFlush()`:
     ```typescript
     let saveTimer: number | null = null;
     let flushing = false;
     let queued = false;
     let activeFlushPromise: Promise<void> | null = null;

     export function hasPendingSave(): boolean {
       return saveTimer !== null || flushing || queued;
     }

     export async function waitForInflightFlush(): Promise<void> {
       while (activeFlushPromise) await activeFlushPromise;
     }

     export async function flushNow(): Promise<void> {
       if (!state) return;
       if (saveTimer !== null) {
         window.clearTimeout(saveTimer);
         saveTimer = null;
       }
       if (flushing) {
         queued = true;
         if (activeFlushPromise) await activeFlushPromise;
         return;
       }
       flushing = true;
       activeFlushPromise = (async () => {
         try {
           while (state) {
             queued = false;
             await saveState(state);
             if (!queued) break;
           }
         } catch (error) {
           console.error("failed to persist app state", error);
         } finally {
           flushing = false;
           activeFlushPromise = null;
         }
       })();
       await activeFlushPromise;
     }
     ```
   - در `syncTodayActivity()`: فقط ست‌ها و گرم‌کردن‌هایی را بشمار که `done && doneDate === today` دارند (تا تمرین دیروز به کارنامه امروز نشت نکند). کامنت `"restarting a day does not erase"` را حتماً نگه دار.
   - تابع `clearTodayWorkoutActivity()` را export کن تا اگر کاربر به‌صورت دستی همه تیک‌های امروز را برداشت، رکورد خالی/شبح روی تقویم پاک شود.

8. **`src/lib/appSettings.ts`:**
   - `clearDeloadSnapshot` را از `./workoutTools` ایمپورت کن و هم در `applyProgram` و هم در `applyDeveloperPreset` مقدار `state.deloadActive = false;` و `clearDeloadSnapshot()` (و در پیش‌فرض `state.readiness = "normal"`) را اجرا کن.

9. **`src/lib/notify.ts`:**
   - `hasNotificationPermission()`, `REST_TIMER_NOTIF_ID = 7801`, `CARDIO_TIMER_NOTIF_ID = 7802`, `LANG_TIMER_NOTIF_ID = 7803` و `scheduleOneShotNotification(id, title, body, triggerAtMs)` را اضافه و export کن.

10. **`src/lib/navigation.ts`:**
    - `isTopOverlay(id)` را export کن.
    - در `releaseOverlay(id)` از `queueMicrotask` با شمارنده `pendingReleases` و `history.go(-steps)` استفاده کن تا بستن هم‌زمان دو مودال تودرتو entry شبح در history نگذارد.
    - به `pushTab(tab: string, homeTabId?: string)` پشتیبانی برگشت به ریشه با کلیک روی تب خانه را اضافه کن (`if (homeTabId && tab === homeTabId) { if (state?.tab) { suppressed += 1; history.back(); } return; }`).

11. **`src/lib/workoutTools.ts`:**
    - در `requestGymWakeLock()` اگر `getState().appMode === "uni_only"` بود قفل نگیر؛ و `syncWakeLockWithMode()` را export کن (در `uni_only` قفل را آزاد کند و در حالت ورزشی بگیرد).
    - `clearDeloadSnapshot()` را export کن.
    - در `MUSCLE_KEYWORDS` گروه `triceps` عبارت `"پشت سر"` را به `"از پشت سر"` تغییر بده تا حرکت `d3e5` («فلای معکوس دستگاه (پشت سرشانه)») درست در `shoulders` قرار بگیرد.
    - یک helper مثل `const baseExerciseId = (id: string) => id.replace(/^(ppl\d+|dorm\d+)-/, "");` بساز و در `originalGifFor`, `swapBusyExercise`, `guessMuscleKey` استفاده کن؛ در `EXERCISE_MUSCLE_MAP` هم `"dorm-pushup": "chest"` و `"dorm-squat": "quads"` را اضافه کن. در `swapBusyExercise` فقط وقتی `baseId in EXERCISE_GIFS` است `/gifs/${baseId}-alt.gif` بگذار.

12. **`src/lib/uniShare.ts`:**
    - کدهای خوبِ پاک‌سازی ````json`, آرایه مستقیم `[...]`، `normalizeCourseTime` و `normalizeCourseDay` (به همراه `"یک‌شنبه"` و `"یک شنبه"` در نقشه و تبدیل ارقام/حروف عربی، و گذاشتن fallback خالی `""` برای `endTime` تا +۲ ساعت محاسبه شود) را اعمال کن.
    - در شاخه `"shuttle"` علاوه بر `data.customShuttleJson`, اگر خود `raw` به‌صورت مستقیم با `parseShuttleJson(raw)` معتبر بود هم آن را بپذیر.
    - از `copyText` در `./clipboard` استفاده کن، بعد از تغییر `"shuttle"` تابع `void pruneBusAlarms()` را صدا بزن و در پایان `void flushNow()` بزن.

---

#### ۵. کامپوننت‌ها و ویوها (`src/components/`, `src/views/`, `src/main.ts`, `src/styles.css`)

1. **`src/components/ui.ts`:**
   - در `openModal`:
     - جلوگیری از بسته شدن تصادفی مودال هنگام جمع شدن کیبورد اندروید با `pointerDownOnBackdrop`.
     - در `onKey`: `if (event.key === "Escape" && isTopOverlay(overlayId)) handle.close();`.
     - به `footer` کلاس `shrink-0` و `pb-[calc(var(--safe-bottom)+0.75rem)]` اضافه کن (و در `body` وقتی `footer` هست `pb-4` و وقتی نیست `pb-[calc(var(--safe-bottom)+1.25rem)]`).

2. **`src/components/restTimer.ts`:**
   - زمان‌بندی و لغو نوتیفیکیشن پس‌زمینه `REST_TIMER_NOTIF_ID` در `startRest`، `bumpRest`، `stopRest` و `restTimer.onDone`.

3. **`src/components/shell.ts`:**
   - محاسبه درصد پیشرفت هدر برای هدف کاهش وزن (`isLoss = profile.targetWeight < profile.startWeight`).
   - در `renderNav`: ارسال `homeTab(getState().appMode)` به `pushTab` و تغییر `"smooth"` به `"instant" as ScrollBehavior`.

4. **`src/components/onboarding.ts`:**
   - `startWeight` را فقط در بار اول (`!state.onboardingCompleted`) مساوی `currentWeight` بگذار، تغییر وزن را در `weightHistory` ثبت کن و `void syncWakeLockWithMode()` را هم در Save و هم در Developer Preset صدا بزن.

5. **`src/components/doubleProgression.ts`:**
   - در `topSet` امتیاز ست‌های وزن بدن (`weight <= 0`) را بر اساس `reps` حساب کن.
   - در `applyChoice` هنگام `choice === "weight"` بازه تکرار (`exercise.reps`) را نگه دار و فقط `reps` ست‌های تیک‌نخورده را به `floorReps` برگردان.
   - پارامتر اختیاری `onAfterClose?: () => void` را به `openDoubleProgressionModal` اضافه کن.

6. **`src/components/exerciseHistory.ts`:**
   - در `recordExerciseHistory` ست برتر حرکات وزن بدن را بر اساس `reps` پیدا کن.
   - در `chartSvg` و `openExerciseHistoryModal` اگر حرکت وزن بدن است (`exercise.bodyweight || entries.every(r => r.weight <= 0)`), نمودار را بر اساس `reps` و برچسب‌های «بهترین تکرار» / «تغییر تکرار» رسم کن.

7. **`src/components/exerciseCatalogPicker.ts`:**
   - جستجو را با نرمال‌سازی نیم‌فاصله (`\u200c`) و `ي`/`ك` عربی انجام بده.

8. **`src/components/gifModal.ts`:**
   - `"none"` را به‌عنوان نبود تصویر نمایش بده و در دکمه «حذف گیف» مقدار `"none"` را ذخیره کن.

9. **`src/components/aiDietConfigurator.ts`:**
   - در `applyAiDietJson` ردیف‌های آبِ تکراریِ برگشتی از AI را قبل از اضافه کردن `waterRow()` فیلتر کن.
   - پیام خطای خالی بودن کلیپ‌بورد را به `"دسترسی کلیپ‌بورد در دسترس نیست یا خالی است؛ پاسخ را دستی بچسبان."` اصلاح کن.

10. **`src/components/progressPhotos.ts`:**
    - دکمه «مشاهده همه عکس‌ها» را وقتی بیش از ۶ عکس هست اضافه کن.
    - در `openCompareModal` از `faSigned(delta, 1)` استفاده کن.
    - بعد از بازیابی بکاپ: `restoreWaterReminderOnBoot()`, `void syncUniAlarms()`, `void syncLanguageStudyAlarm()`, `void syncWakeLockWithMode()`.

11. **`src/views/uniCourses.ts`:**
    - در `renderClassScheduleCard`: اگر `fortnightly && !state.semesterWeekAnchorDate` بود آن را روی `currentWeekStartIso()` مقداردهی و ذخیره کن.
    - در `openCourseModal`:
      - تبدیل `body` به `<form>` + `enterKeyHint="done"` + رویداد `submit`.
      - روی `body` با `mousedown` (نه `pointerdown`, تا اسکرول لمسی قفل نشود) و روی `saveBtn` / `deleteBtn` با `mousedown` جلوی `blur` شدن کیبورد هنگام تپ دکمه‌ها را بگیر.
      - گارد `savedAlready`, خواندن زنده `getState()` درون `save` و `delete` (و پیدا کردن درس با `existing.id`), ذخیره فوری با `persist(0); void flushNow();`.
      - محدود کردن `shift` در بازه `0` تا `23 * 60 + 59 - length`.

12. **`src/views/uni.ts`:**
    - `escapeHtml(shuttle().effectiveDate)` در `uniHeroBanner`.
    - به‌روزرسانی خودکار `activeGroup` با عبور از نیمه‌شب و آپدیت هر ۳۰ ثانیه رادار تا زمانی که `[data-uni-radar]` در DOM است.
    - اضافه و export کردن `pruneBusAlarms()` و `syncUniAlarms()` (بر اساس کد پیام قبلی).

13. **`src/views/uniLanguage.ts`:**
    - اصلاح `setTime` با محاسبه کل دقیقه‌ها `(((hour * 60 + minute) % 1440) + 1440) % 1440`.
    - اضافه و export کردن `syncLanguageStudyAlarm()` و زمان‌بندی/لغو `LANG_TIMER_NOTIF_ID` روی شروع، توقف، ریست و پایان تایمر تمرکز.

14. **`src/views/uniShuttleAi.ts`:**
    - استفاده از `copyText`, افزودن کادر متنی fallback برای کپی دستی پرامپت در WebView و فراخوانی `void pruneBusAlarms()` بعد از تغییر جدول سرویس‌ها.

15. **`src/views/workout.ts`:**
    - در `dayStrip` المان `data-day-pill-status="${day.id}"` بگذار و در `refreshProgress` آپدیتش کن.
    - در `warmupCard`: ثبت `item.doneDate`, فراخوانی `refreshWeeklyActivityCard()` و `clearTodayWorkoutActivity()` در صورت خالی شدن تیک‌های امروز.
    - در `cardioTimerBlock`: زمان‌بندی و لغو `CARDIO_TIMER_NOTIF_ID`.
    - در `exerciseCard`: عدم رندر وقتی `gifUrl === "none"`, استفاده از `baseId = exercise.id.replace(/^(ppl\d+|dorm\d+)-/, "")` و حفظ عبارت `` `/gifs/${exercise.id}.gif` `` برای تست `e2e-v6.mjs`.
    - در `setRow`: ثبت `log.doneDate`, ثبت PR فقط وقتی `!isExerciseSwapped(exercise)`, جلوگیری از روی‌هم افتادن مودال Double Progression و Finish (اجرای مودال پایان تمرین داخل `onAfterClose` و بدون پخش هم‌زمان `chord()` + `beep()`), و فراخوانی `clearTodayWorkoutActivity()` اگر تمام تیک‌های امروز برداشته شد.
    - در `runOverload`: فراخوانی `clearDeloadSnapshot()`.
    - در `editExercise`: پاک کردن فیلدهای `swappedDate`/`original*` اگر کاربر حرکت جایگزین‌شده را دستی ویرایش کرد.

16. **`src/views/nutrition.ts`, `src/views/progress.ts`, `src/views/coach.ts`:**
    - در `nutrition.ts`: اصلاح متن `"۱٫۸ گرم بر کیلو"` وقتی `cutting` فعال است.
    - در `progress.ts`: اصلاح `weightHero()` برای هدف کاهش وزن و محافظت BMI در برابر `heightCm <= 0`.
    - در `coach.ts`: نمایش پیام خطا وقتی فیلد نام خالی است، و در `loadDeveloperPreset` اجرای `stopWaterReminder()`, `syncUniAlarms()`, `syncLanguageStudyAlarm()`, `syncWakeLockWithMode()`.

17. **`src/main.ts` و `src/styles.css`:**
    - در `main.ts`: انتظار برای `await initNotificationActions()`, اجرای `syncUniAlarms()`, `syncLanguageStudyAlarm()`, `syncWakeLockWithMode()`, استفاده از `behavior: "instant" as ScrollBehavior`, حذف شنونده اول `visibilitychange`, و داخل `syncAfterBackground()` اجرای `await waitForInflightFlush()` (بعد از `if (hasPendingSave()) await flushNow();`) و سپس `loadState()`, `ensureDailyDietReset()` و `restoreWaterReminderOnBoot()`.
    - در `styles.css`: اضافه کردن `.bg-slate-900\/40`, `.bg-slate-900\/95`, `.bg-slate-950\/80`, `.bg-slate-950\/85` به قوانین `html.theme-light`.

---

#### ۶. تست، دامپ نهایی و پوش به گیت‌هاب

پس از اعمال تمام تغییرات بالا، به‌ترتیب این دستورات را در ترمینال اجرا کن و اگر خطایی دیدی برطرفش کن:

```bash
npm run typecheck
npm run build
cd src-tauri && cargo check --all-targets && cargo test && cd ..
node scripts/dump-code.mjs
```

سپس تست‌های E2E را روی سرور محلی (`node scripts/serve-dist.mjs`) چک کن:
- `e2e-check.mjs`, `e2e-fixes.mjs`, `e2e-water.mjs`, `e2e-audio.mjs`, `e2e-calendar.mjs`, `e2e-uni.mjs`, `e2e-uni-v2.mjs`, `e2e-swap-quiet.mjs`, `e2e-perf.mjs`, `e2e-v3.mjs`, `e2e-v4.mjs`, `e2e-v5.mjs`, `e2e-v6.mjs`, `e2e-v7.mjs`.

اگر تمام تست‌ها پاس شدند، فایل `project-code-dump.txt` (حاصل از `node scripts/dump-code.mjs`) و کل کدهای اصلاح‌شده را کامیت و پوش کن تا ورک‌فلو بیلد `arm64` را بسازد و فایل مستقیم `.apk` (بدون ZIP) را در GitHub Releases قرار دهد:

```bash
git status
git add -A
git commit -m "fix: resolve all workout, university course saving, android native, and UI bugs; default CI to arm64 direct APK release"
git push
```