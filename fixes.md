این پکیج کامل و جراحی‌شده برای رفع **هر ۳۰ باگ + افزودن ریست خودکار هفتگی تمرینات در شروع هر هفته شمسی (شنبه)** است. فقط بخش‌های تغییرکرده برای هر فایل آورده شده تا مستقیماً بدهی به ایجنت لپ‌تاپت و بدون دست‌کاری اضافه، تمیز اعمال کند. تمام قوانین `strict` تایپ‌اسکریپت، `cargo test` و تست‌های `scripts/e2e-*.mjs` در این تغییرات لحاظ شده‌اند.

---

### دستورالعمل کامل اعمال اصلاحات برای ایجنت

لطفاً تغییرات زیر را دقیقاً روی فایل‌های مشخص‌شده اعمال کن. پس از اتمام، دستورات بررسی انتهای متن (`typecheck`، `build`، `cargo test` و کل تست‌های `e2e`) را اجرا و تأیید کن.

---

#### ۱. بک‌اند Rust: همزمانی، نرمال‌سازی، هدف کاهش وزن و ریست هفتگی

**۱-۱. `src-tauri/src/timeutil.rs`**
تابع محاسبه تاریخ شنبه همین هفته را اضافه کن:
```rust
use chrono::{Datelike, Duration, Local};

/// Today's date in the device's local timezone, e.g. `2026-11-12`.
pub fn today_iso() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

/// Saturday (ISO `YYYY-MM-DD`) that starts the current Persian week.
pub fn current_week_start_iso() -> String {
    let today = Local::now().date_naive();
    let offset = (today.weekday().num_days_from_sunday() + 1) % 7;
    (today - Duration::days(offset as i64))
        .format("%Y-%m-%d")
        .to_string()
}
```

**۱-۲. `src-tauri/src/storage.rs`**
- قفل همزمانی (`IO_LOCK`) و نام فایل موقت یکتا را اضافه کن تا دو ذخیره همزمان یا Kotlin و Rust روی یک `gym_state.json.tmp` تداخل نکنند:
```rust
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};

/// Serialises read-modify-write cycles across concurrent Tauri commands.
pub fn with_state_lock<T>(f: impl FnOnce() -> T) -> T {
    static IO_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    let lock = IO_LOCK.get_or_init(|| Mutex::new(()));
    let _guard = lock.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    f()
}
```
- در `save(app, state)` خط `let tmp = path.with_extension("json.tmp");` را به نام یکتا تغییر بده:
```rust
    static TMP_SEQ: AtomicU64 = AtomicU64::new(0);
    let seq = TMP_SEQ.fetch_add(1, Ordering::Relaxed);
    let tmp = path.with_extension(format!("rs.{}.{seq}.tmp", std::process::id()));
```

**۱-۳. `src-tauri/src/lib.rs`**
- بدنه هر ۶ دستور (`get_app_state`، `save_app_state`، `apply_progressive_overload`، `log_body_weight`، `reset_to_defaults`، `overload_status`) و `storage::load(&handle)` در `setup` را داخل `storage::with_state_lock(|| { ... })` قرار بده.
- در `log_body_weight` شرط رسیدن به هدف را برای هر دو حالت افزایش و کاهش وزن (کات) اصلاح کن:
```rust
    let target = state.profile.target_weight;
    let is_loss = target < state.profile.start_weight;
    let reached_goal = if is_loss {
        rounded <= target && previous > target
    } else {
        rounded >= target && previous < target
    };
    if reached_goal {
        let text = format!(
            "به هدف {} کیلوگرمی رسیدی! حالا هدف بعدی: کیفیت عضله و حفظ وزن.",
            to_persian_digits(&format!("{target:.1}"))
        );
        state.push_milestone(&today, text, "goal");
    } else if previous != rounded {
```

**۱-۴. `src-tauri/src/models.rs`**
- تابع کمکی برای حذف پیشوندهای `ppl4-` و `dorm1-` اضافه کن:
```rust
fn base_exercise_id(id: &str) -> &str {
    if let Some((prefix, rest)) = id.split_once('-') {
        let is_prefixed = (prefix.starts_with("ppl") && prefix.len() > 3 && prefix[3..].bytes().all(|b| b.is_ascii_digit()))
            || (prefix.starts_with("dorm") && prefix.len() > 4 && prefix[4..].bytes().all(|b| b.is_ascii_digit()));
        if is_prefixed && !rest.is_empty() {
            return rest;
        }
    }
    id
}
```
- در `AppStateData::normalize(&mut self)`:
  1. بلوک‌های نرمال‌سازی `rest_seconds`، گاردهای `profile` (`height_cm`, `current_weight`, `start_weight`, `target_weight`, `age`) و کل بلوک `self.diet` را **به بالای** `if self.days.is_empty() { return; }` منتقل کن تا در حالت `days.is_empty()` هم همیشه اجرا شوند.
  2. در حلقه `for day in self.days.iter_mut()`:
     - `let week_start = crate::timeutil::current_week_start_iso();`
     - **ریست خودکار هفتگی (شروع هر شنبه):** برای هر `warmup` اگر `warmup.done` است و `warmup.done_date.as_deref().map(|d| d < week_start.as_str()).unwrap_or(false)` بود، `warmup.done = false; warmup.done_date = None;` بگذار.
     - در حلقه `exercise`: از `let base_id = base_exercise_id(&exercise.id).to_string();` برای بررسی `gifs.exercises.contains_key(&base_id)` و ساخت مسیرهای `/gifs/{base_id}-alt.gif` و `/gifs/{base_id}.gif` استفاده کن.
     - بعد از `exercise.sync_logs();` ریست خودکار ست‌های هفته قبل را اعمال کن:
       ```rust
       let prescribed_reps = parse_first_number(&exercise.reps).unwrap_or(0);
       for log in exercise.logs.iter_mut() {
           if log.done
               && log
                   .done_date
                   .as_deref()
                   .map(|d| d < week_start.as_str())
                   .unwrap_or(false)
           {
               log.done = false;
               log.done_date = None;
               if !exercise.bodyweight && exercise.target_weight > 0.0 && log.weight < exercise.target_weight {
                   log.weight = exercise.target_weight;
                   if prescribed_reps > 0 {
                       log.reps = prescribed_reps;
                   }
               } else if prescribed_reps > log.reps {
                   log.reps = prescribed_reps;
               }
           }
       }
       ```

---

#### ۲. اندروید نیتیو: `scripts/setup-android-native.mjs`

1. **رفع پاک شدن رکورد دیروز در `incrementWaterInStateFile` + آپدیت `dietDone`:**
   به‌جای `history.put(0, todayEntry)` (که ایندکس ۰ یعنی دیروز را بازنویسی می‌کرد!) و برای هماهنگی `dietDone`:
   ```kotlin
   var dietDoneCount = 0
   val allItems = diet.optJSONArray("items")
   if (allItems != null) {
       for (index in 0 until allItems.length()) {
           val item = allItems.optJSONObject(index) ?: continue
           if (glasses >= 8 && item.optString("id") == "diet-4") item.put("done", true)
           if (item.optBoolean("done", false)) dietDoneCount += 1
       }
   }
   ```
   و در ساخت `todayEntry`:
   ```kotlin
   if (todayEntry == null) {
       todayEntry = JSONObject().apply {
           put("date", day)
           put("workoutTitle", "")
           put("completedExercises", org.json.JSONArray())
           put("setsDone", 0)
           put("warmupsDone", 0)
           put("dietDone", dietDoneCount)
           put("dietTotal", allItems?.length() ?: 5)
           put("waterGlasses", glasses)
       }
       val updatedHistory = org.json.JSONArray()
       updatedHistory.put(todayEntry)
       for (i in 0 until history.length().coerceAtMost(89)) {
           updatedHistory.put(history.get(i))
       }
       root.put("activityHistory", updatedHistory)
   } else {
       todayEntry.put("waterGlasses", glasses)
       todayEntry.put("dietDone", dietDoneCount)
   }
   ```
2. **نام فایل موقت یکتا در `writeAtomically`:**
   ```kotlin
   val tmp = File(file.parentFile, file.name + ".kt." + System.nanoTime() + ".tmp")
   ```
3. **امنیت `WaterBroadcastReceiver` و بررسی `waterReminderEnabled` در `ACTION_SHOW_REMINDER`:**
   - یک کلاس مجزا `BootCompletedReceiver : BroadcastReceiver()` در همان فایل `WaterBroadcastReceiver.kt` اضافه کن که فقط `ACTION_BOOT_COMPLETED` و `ACTION_MY_PACKAGE_REPLACED` را بگیرد و `WaterBroadcastReceiver.restoreAlarmOnBoot(context)` را صدا بزند (متد `restoreAlarmOnBoot` را به `companion object` منتقل کن).
   - در `AndroidManifest.xml`: `WaterBroadcastReceiver` را `android:exported="false"` (بدون intent-filter عمومی) ثبت کن و `BootCompletedReceiver` را با `android:exported="true"` و intent-filterهای `BOOT_COMPLETED` و `MY_PACKAGE_REPLACED` ثبت کن.
   - شرط آپگرید مانیفست در `scripts/setup-android-native.mjs` را از `!manifest.includes("BOOT_COMPLETED")` به `!manifest.includes("BootCompletedReceiver")` تغییر بده تا با `RECEIVE_BOOT_COMPLETED` اشتباه نشود.
   - در `ACTION_SHOW_REMINDER`: قبل از هر کاری بررسی کن که `waterReminderEnabled` در `gym_state.json` واقعاً `true` باشد (اگر نبود `cancelSchedule(context); return`). در ساعات خواب (`0..8`) علاوه بر `scheduleAt(context, nextAt)` مقدار `diet.put("waterReminderNextAt", nextAt)` را هم در فایل ذخیره کن.
   - نکته تست: مطمئن شو در `ACTION_DRINK_ONE` فراخوانی `rescheduleFromState(context)` حداکثر تا ۴۰۰ کاراکتر بعد از `ACTION_DRINK_ONE` باشد (تست `e2e-v6.mjs` آن را چک می‌کند).
4. **رنگ آیکون‌های نوار وضعیت در Light Mode و اصلاح `shareBackupFile` در `MainActivity.kt`:**
   - ایمپورت `androidx.core.view.WindowInsetsControllerCompat` و `java.lang.ref.WeakReference` را اضافه کن.
   - در `AndroidWaterBridge(activity: MainActivity)` با `private val context = activity.applicationContext` و `private val activityRef = WeakReference(activity)` متد زیر را اضافه کن:
     ```kotlin
     @JavascriptInterface
     fun setLightStatusBar(light: Boolean) {
         Handler(Looper.getMainLooper()).post {
             val act = activityRef.get() ?: return@post
             WindowInsetsControllerCompat(act.window, act.window.decorView).apply {
                 isAppearanceLightStatusBars = light
                 isAppearanceLightNavigationBars = light
             }
         }
     }
     ```
   - در `shareBackupFile`: خط `if (chooser.resolveActivity(context.packageManager) == null) return false` را حذف کن (چون روی اندروید ۱۱+ با Package Visibility گمراه‌کننده است) و فقط `startActivity(chooser)` را داخل `Handler(Looper.getMainLooper()).post { try { ... } catch (_: Exception) { Toast... } }` اجرا کن.

---

#### ۳. مسیریابی و تاریخچه دکمه Back: `src/lib/navigation.ts`

تابع `pushOverlay` و `releaseOverlay` را به شکل زیر اصلاح کن تا هم `history.go(-steps)` فقط `1` به `suppressed` اضافه کند و هم باز شدن فوری مودال دوم بعد از بستن مودال اول از همان جایگاه history استفاده کند (بدون اینکه مودال جدید را بپَراند):
```typescript
let pendingReleases = 0;
let releaseScheduled = false;

export function pushOverlay(close: () => void): string {
  sequence += 1;
  const id = `overlay-${sequence}`;
  stack.push({ id, close });
  if (pendingReleases > 0) {
    pendingReleases -= 1;
    history.replaceState({ overlay: id }, "");
  } else {
    history.pushState({ overlay: id }, "");
  }
  return id;
}

export function releaseOverlay(id: string): void {
  const index = stack.findIndex((entry) => entry.id === id);
  if (index === -1) return;
  stack.splice(index, 1);

  pendingReleases += 1;
  if (releaseScheduled) return;
  releaseScheduled = true;
  queueMicrotask(() => {
    releaseScheduled = false;
    const steps = pendingReleases;
    pendingReleases = 0;
    if (steps <= 0) return;
    const state = history.state as { overlay?: string } | null;
    if (state?.overlay) {
      // history.go(-steps) dispatches ONE popstate event regardless of steps.
      suppressed += 1;
      history.go(-steps);
    }
  });
}
```

---

#### ۴. استور، ریست خودکار هفتگی، همگام‌سازی پس‌زمینه و تم: `src/lib/store.ts` و `src/main.ts`

**۴-۱. `src/lib/store.ts`**
- شمارنده نسل استیت برای جلوگیری از بازنویسی عکس/بکاپ تازه در `syncAfterBackground`:
  ```typescript
  let stateGeneration = 0;
  export function getStateGeneration(): number {
    return stateGeneration;
  }
  ```
  در `initState`، `setState` و `persist` مقدار `stateGeneration += 1;` را اضافه کن.
- در `applyTheme()`:
  ```typescript
  window.AndroidWater?.setLightStatusBar?.(isLight);
  ```
- در `flushNow()` داخل `catch (error)`: یک توست خطا با محدودیت تکرار (مثلاً هر ۵ ثانیه یک‌بار) به کاربر نشان بده تا خطای پر شدن حافظه بی‌صدا نماند (`import { toast } from "../components/ui";`).
- در `ensureDailyDietReset()` ریست خودکار هفتگی را اضافه کن (`currentPersianWeekIsos`, `firstNumber` را از `./fa` ایمپورت کن):
  ```typescript
  export function ensureDailyDietReset(): boolean {
    const current = getState();
    const today = isoToday();
    const weekStart = currentPersianWeekIsos(today)[0];
    const dietFromEarlierWeek = Boolean(
      current.diet.lastResetDate && current.diet.lastResetDate < weekStart,
    );
    let changed = false;

    if (current.diet.lastResetDate !== today) {
      current.diet.lastResetDate = today;
      for (const item of current.diet.items) item.done = false;
      current.diet.waterGlasses = 0;
      changed = true;
    }

    // Automatic weekly reset on Saturday: clear last week's ticks while keeping
    // weights/reps and applying any Double Progression bumps for the new week.
    const isOldWeek = (done: boolean, doneDate?: string | null) =>
      done && ((Boolean(doneDate) && doneDate! < weekStart) || (!doneDate && dietFromEarlierWeek));

    for (const day of current.days) {
      for (const warmup of day.warmups) {
        if (isOldWeek(warmup.done, warmup.doneDate)) {
          warmup.done = false;
          warmup.doneDate = null;
          changed = true;
        }
      }
      for (const exercise of day.exercises) {
        const prescribedReps = firstNumber(exercise.reps);
        for (const log of exercise.logs) {
          if (isOldWeek(log.done, log.doneDate)) {
            log.done = false;
            log.doneDate = null;
            if (!exercise.bodyweight && exercise.targetWeight > 0 && log.weight < exercise.targetWeight) {
              log.weight = exercise.targetWeight;
              if (prescribedReps > 0) log.reps = prescribedReps;
            } else if (prescribedReps > log.reps) {
              log.reps = prescribedReps;
            }
            changed = true;
          }
        }
      }
    }

    if (ensureDailySwappedExercisesReset()) changed = true;
    return changed;
  }
  ```
- در `clearTodayWorkoutActivity()` شرط را فقط بر اساس **ست‌های امروز** (نه گرم‌کردن‌ها) بگذار تا اگر آخرین ست امروز تیکش برداشته شد ولی گرم‌کردن تیک داشت، رکورد شبح در تقویم نماند:
  ```typescript
  export function clearTodayWorkoutActivity(): void {
    if (!state) return;
    const today = isoToday();
    const anySetDoneToday = state.days.some((day) =>
      day.exercises.some((ex) =>
        ex.logs.some((log) => log.done && log.doneDate === today),
      ),
    );
    if (anySetDoneToday) return;
    const entry = state.activityHistory.find((item) => item.date === today);
    if (!entry) return;
    entry.workoutTitle = "";
    entry.completedExercises = [];
    entry.setsDone = 0;
    entry.warmupsDone = state.days.reduce(
      (sum, day) => sum + day.warmups.filter((wu) => wu.done && wu.doneDate === today).length,
      0,
    );
    persist(0);
  }
  ```
  (کامنت `"restarting a day does not erase"` را داخل `syncTodayActivity` حفظ کن تا تست `e2e-v7` پاس بماند.)

**۴-۲. `src/main.ts`**
- در `renderView()`: وقتی از تبی خارج می‌شوی شنونده‌های `onTick` نودهای DOM جداشده را پاک کن:
  ```typescript
  if (tab !== "nutrition") onWaterTimerTick(null);
  if (tab !== "workout") cardioTimer.onTick = null;
  if (tab !== "uni") languageStudyTimer.onTick = null;
  ```
  (`onWaterTimerTick` و `cardioTimer` را از `./lib/timer` و `languageStudyTimer` را از `./views/uniLanguage` ایمپورت کن.)
- در شنونده `visibilitychange`: وقتی `document.visibilityState === "hidden"` شد، `pauseWaterLoopForBackground()` را صدا بزن تا `tickWater` قبل از `syncAfterBackground()` روی استیت قدیمی اجرا نشود.
- در `syncAfterBackground()` (با حفظ خط دقیق `if (hasPendingSave()) await flushNow();` برای `e2e-v7.mjs`):
  ```typescript
  async function syncAfterBackground(): Promise<void> {
    if (syncingAfterBackground) return;
    syncingAfterBackground = true;
    try {
      let needsRender = false;
      if (hasNativeWaterBridge()) {
        if (hasPendingSave()) await flushNow();
        await waitForInflightFlush();
        const genBefore = getStateGeneration();
        const beforeJson = JSON.stringify(getState());
        const diskState = await loadState();
        // If a foreground picker (photo / backup restore) mutated state while
        // loadState was in flight, never overwrite it with the older snapshot.
        if (getStateGeneration() === genBefore && JSON.stringify(diskState) !== beforeJson) {
          setState(diskState);
          needsRender = true;
        }
        syncWaterMirrorFromState();
      }
      if (ensureDailyDietReset()) {
        persist(0);
        needsRender = true;
      }
      restoreWaterReminderOnBoot();
      if (needsRender) requestRender();
    } catch (error) {
      console.warn("resume sync failed", error);
    } finally {
      syncingAfterBackground = false;
    }
  }
  ```

---

#### ۵. تایمرها و نوتیفیکیشن‌ها: `src/lib/timer.ts`، `src/lib/notify.ts`، `src/components/restTimer.ts`

**۵-۱. `src/lib/timer.ts`**
- `onDone: ((overdueSec?: number) => void) | null = null;`
- در `CountdownTimer.add(delta)`: اگر `this.remaining > this.total` شد، `this.total = this.remaining;` را آپدیت کن تا حلقه پیشرفت گیر نکند.
- در `CountdownTimer.startLoop()` و `finish(overdueSec = 0)`:
  ```typescript
  if (left <= 0) this.finish(Math.max(0, -left));
  ```
  و در `finish`: `this.onDone?.(overdueSec);`
- در `loadBuffer`: `const failedDecode = new Set<SoundKey>();` اضافه کن؛ اگر `failedDecode.has(key)` بود فوراً `Promise.resolve(null)` برگردان و داخل `catch` عبارت `failedDecode.add(key);` بگذار تا فایل خراب در هر تپ دوباره `fetch` نشود.
- توابع کمکی `pauseWaterLoopForBackground()` و `syncWaterMirrorFromState()` را export کن:
  ```typescript
  export function pauseWaterLoopForBackground(): void {
    stopWaterLoop();
  }

  export function syncWaterMirrorFromState(): void {
    try {
      const nextAt = getState().diet?.waterReminderNextAt ?? 0;
      if (nextAt > 0) window.localStorage.setItem(WATER_MIRROR_KEY, String(Math.trunc(nextAt)));
      else window.localStorage.removeItem(WATER_MIRROR_KEY);
    } catch {
      /* storage unavailable */
    }
  }
  ```
- در `tickWater()`:
  - اگر `nextAt <= 0`: به‌جای ماندن روی `۰:۰۰`، یک سررسید تازه با `adjustTimestampForWaterQuietHours(now + totalSec * 1000)` بساز، ذخیره و زمان‌بندی کن.
  - وقتی `nextAt <= now`: `const advancedTo = adjustTimestampForWaterQuietHours(now + totalSec * 1000);` را محاسبه کن، `fireWaterReminder(advancedTo);` را صدا بزن و به `waterTickListener` مقدار واقعی `Math.max(0, Math.ceil((advancedTo - now) / 1000))` را بده (نه `totalSec`).
- در `restoreWaterReminderOnBoot()`: وقتی `!diet.waterReminderEnabled` است، علاوه بر `stopWaterLoop()`، این دو خط را هم اجرا کن:
  ```typescript
  writeWaterNextAt(0);
  void cancelScheduledWaterNotification();
  ```

**۵-۲. `src/lib/notify.ts`**
- در `Window["AndroidWater"]` اضافه کن: `setLightStatusBar?: (light: boolean) => void;`
- شناسه جدا برای آلارم زمان‌بندی‌شده در مسیر پلاگین تا نوتیفیکیشن فوری `7701` را لغو نکند:
  ```typescript
  export const WATER_SCHEDULED_NOTIFICATION_ID = 7704;
  ```
  در `scheduleWaterNotificationAt` (بخش پلاگین) از `WATER_SCHEDULED_NOTIFICATION_ID` استفاده کن و در `cancelScheduledWaterNotification` هر دو `[WATER_NOTIFICATION_ID, WATER_SCHEDULED_NOTIFICATION_ID]` را لغو کن.
- در `window.__onSilentWaterIncrement` (با ایمپورت `isoToday` از `./fa`): قبل از ست کردن `waterGlasses` چک کن:
  ```typescript
  const today = isoToday();
  if (state.diet.lastResetDate !== today) {
    state.diet.lastResetDate = today;
    for (const item of state.diet.items) item.done = false;
  }
  ```

**۵-۳. `src/components/restTimer.ts`**
- در `restTimer.onDone = (overdueSec = 0) => { ... }`: فقط وقتی `overdueSec <= 3` است `alarm()` و `pushSystemNotification(...)` را صدا بزن (اگر در پس‌زمینه تمام شده، OS قبلاً نوتیفیکیشن را داده؛ در این حالت فقط نوار را ببند `stopRest()`).
- در `bumpRest(delta)`: اگر کاربر `−۱۵` زد و تایمر تمام شده یا به صفر می‌رسد، مستقیم `stopRest()` بزن تا نه روی `۰:۰۰` قفل شود و نه آلارم بلند بزند:
  ```typescript
  if (delta < 0 && (!restTimer.running || restTimer.remaining + delta <= 0.5)) {
    stopRest();
    return;
  }
  ```

---

#### ۶. بک‌اند مرورگر و فرمت اعداد: `src/lib/localBackend.ts` و `src/lib/fa.ts`

**۶-۱. `src/lib/localBackend.ts`**
- خط `if (state.days.length === 0) return state;` را از خط ۱۵۴ بردار و فقط دورِ بخش `activeDay` و حلقه `for (const day of state.days)` در انتهای تابع بگذار (`if (state.days.length > 0) { ... }`).
- در همان حلقه `day.exercises` از `const baseId = exercise.id.replace(/^(ppl\d+|dorm\d+)-/, "");` برای `baseId in exerciseGifs` و ساخت `/gifs/${baseId}-alt.gif` و `/gifs/${baseId}.gif` استفاده کن.
- گارد آرایه روی `weightHistory` و `milestones` بگذار:
  ```typescript
  state.weightHistory = Array.isArray(state.weightHistory) ? state.weightHistory.slice(-400) : [];
  state.milestones = Array.isArray(state.milestones) ? state.milestones.slice(0, 60) : [];
  ```
- در `writeRaw(state)`: در `catch (error)` بعد از `console.error` خطا را دوباره `throw error;` کن تا `flushNow()` به کاربر هشدار بدهد.
- در `localLogWeight(weight)` (با ایمپورت `faNum` از `./fa`):
  - شرط هدف کاهش وزن را مثل Rust اضافه کن (`isLoss = state.profile.targetWeight < state.profile.startWeight`).
  - `state.weightHistory = state.weightHistory.slice(-400);`
  - `const delta = Math.round((rounded - previous) * 10) / 10;` و در متن مایلستون از `faNum(rounded, 1)` و `faNum(Math.abs(delta), 1)` استفاده کن.

**۶-۲. `src/lib/fa.ts`**
- در `parseFaFloat`: به‌جای `text.replace(/[^\d.]/g, "")` اولین عدد معتبر را استخراج کن:
  ```typescript
  const match = /\d+(?:\.\d+)?/.exec(text);
  if (!match) return fallback;
  const value = Number.parseFloat(match[0]);
  return Number.isFinite(value) ? value : fallback;
  ```
- در `faReps`: رگولار را به `/^(\d+)\s*[-–—]\s*(\d+)$/` تغییر بده.
- در `makePersianNumericInput`: `else if (decimals && (ch === "." || ch === "٫" || ch === ","))` را بپذیر.

---

#### ۷. ابزارهای باشگاه، تب تمرین، استپر، تاریخچه و گیف

**۷-۱. `src/lib/workoutTools.ts`**
- **Wake Lock (باگ ۲۴):** یک تابع کوچک `paintWakeLockButtons()` اضافه کن که هر دکمه با `[data-wakelock-btn]` را پس از `request("screen")` و در `release` آپدیت کند (و روی دکمه صفحه در `renderReadinessAndToolsBar` صفت `"data-wakelock-btn": "1"` بگذار).
- **پیشنهاد جایگزین برای PPL/خوابگاهی (باگ ۱۲):**
  - در `openSwapExerciseModal`: تغییر خط ۴۵۶ به `const curated = ALTERNATIVE_MOVES[baseExerciseId(exercise.id)];`.
  - در `swapBusyExercise`: وقتی `!(baseId in EXERCISE_GIFS)` بود، `exercise.gifUrl` فعلی را پاک نکن (مثلاً برای `dorm-pushup` و `dorm-squat` گیف قبلی حفظ شود یا `exercise.gifUrl = exercise.gifUrl ?? null`).
- **خروج از هفته ریکاوری (باگ ۲۵):** در `toggleDeloadWeek()`:
  ```typescript
  const hasSnapshot = Object.keys(snapshot).length > 0;
  ...
  } else {
    const original = snapshot[key] ?? snapshot[exercise.id];
    if (original !== undefined) {
      exercise.targetWeight = original;
    } else if (!hasSnapshot) {
      exercise.targetWeight = roundToPlate(exercise.targetWeight * 1.25);
    }
  }
  ```

**۷-۲. `src/views/workout.ts`**
- در تمام ۵ نقطه `setRow` و `applyToAllSets` که `checkAndUpdatePR` صدا زده می‌شود، شرط `!isExerciseSwapped(exercise) &&` را قبلش اضافه کن (دقیقاً مثل خط ۷۴۶؛ خطوط `if (log.done) recordExerciseHistory(exercise);` را دست نزن تا تست `e2e-v7` پاس بماند).
- در untick ست (خط ۷۷۴) و untick گرم‌کردن (خط ۳۲۲): شرط اشتباه `if (dayDone(day) === 0 && !day.warmups.some((w) => w.done))` را حذف کن و مستقیماً `clearTodayWorkoutActivity();` را صدا بزن.
- در `restartDay(day)`: روی هر `log` مقدار `log.doneDate = null;` و روی هر `warmup` مقدار `warmup.doneDate = null;` را ست کن، و شرط `else if` را به `else if (prescribedReps > log.reps) { log.reps = prescribedReps; }` تعمیم بده تا افزایش تکرار Double Progression در حرکات وزنه‌دار هم اعمال شود.
- در `cardioTimer.onDone = (overdueSec = 0) => { ... }`: فقط وقتی `overdueSec <= 3` است `alarm()` و `toast(...)` بزن.

**۷-۳. `src/components/doubleProgression.ts`**
- در `openDoubleProgressionModal`:
  - `const baseWeight = Math.max(exercise.targetWeight, top?.weight ?? 0);` و `const nextWeight = roundStep(baseWeight + WEIGHT_STEP);`
  - به `applyChoice(exercise, option.id, baseWeight)` پاس بده و در `choice === "weight" && !bodyweight` از `roundStep(baseWeight + WEIGHT_STEP)` استفاده کن.
  - اگر `bodyweight && bumpRange(range) === range` بود (مثل `"حداکثر توان"` بدون عدد)، گزینه دوم تکراری را از آرایه `options` حذف کن و برای گزینه اول هنگام انتخاب، پیام مناسب («هدف جلسه بعد: ۱ تکرار بیشتر در هر ست») را بدون مایلستونِ گمراه‌کننده نمایش بده.

**۷-۴. `src/components/exerciseEditor.ts` و `src/components/gifModal.ts`**
- در `exerciseEditor.ts`:
  - مقدار اولیه فیلد: `gifInput.value = initial?.gifUrl === "none" ? "" : (initial?.gifUrl ?? "");`
  - هنگام submit: اگر `gifUrl && gifUrl !== "none" && !/^(https?:\/\/|\/)/i.test(gifUrl)` خطا بده؛ و مقدار ارسالی `gifUrl` را برابر `gifUrl || (initial?.gifUrl === "none" ? "none" : null)` بگذار.
- در `gifModal.ts`:
  - خط ۶۳: کلاس متن خطا را از `text-rose-300` به `text-rose-600 font-bold` تغییر بده تا روی `bg-white` خوانا باشد.
  - خط ۱۱۰ (دکمه «ذخیره گیف»): هنگام خالی بودن `value` به‌جای `null` مقدار `"none"` بفرست (`options.onSaveUrl?.(value || "none")`).

**۷-۵. `src/components/stepper.ts`**
- در `openValuePicker`: در کلیک دکمه `onApplyAll`، بعد از `options.onApplyAll?.(value);` خط `handle.close();` را اضافه کن.

**۷-۶. `src/components/exerciseHistory.ts`**
- `confirmDialog` را از `./ui` ایمپورت کن.
- دکمه «پاک کردن سابقه» را فقط وقتی `entries.length > 0` است نمایش بده و قبل از حذف، با `await confirmDialog({ title: "پاک کردن سابقه", message: "تمام تاریخچه این حرکت پاک شود؟", confirmText: "پاک کن", danger: true })` تأیید بگیر.
- در جدول جلسات اخیر: وقتی `isBodyweight` صادق است، `${fa(row.reps)} تکرار • ${fa(row.setsCompleted)} ست` نمایش بده (به‌جای `۰ کیلو × ...`).

---

#### ۸. تغذیه، AI، پیشرفت، آنبوردینگ، بکاپ و تقویم

**۸-۱. `src/views/nutrition.ts`**
- در `checklist()`: برای ردیف `item.id === "diet-4"` دکمه `✕` حذف را رندر نکن.
- در کلیک روی خود ردیف `item`: اگر `item.id === "diet-4"` بود، به‌جای دست‌کاری مستقل `item.done`، مستقیم `setWaterGlasses(item.done ? 0 : WATER_GOAL); return;` را صدا بزن تا چک‌لیست و شمارنده آب همیشه همگام باشند.

**۸-۲. `src/components/aiDietConfigurator.ts`**
- در `applyAiDietJson`: ردیف‌های دلخواه کاربر (`custom-*`) را مثل `setDietTemplate` حفظ کن:
  ```typescript
  const custom = state.diet.items.filter((item) => item.id.startsWith("custom-"));
  state.diet.items = [ ...aiRows, water, ...custom ];
  ```
- در `openAiDietConfigurator`: کلاس `promptBox` را از `text-left` به `text-right` تغییر بده.

**۸-۳. `src/views/progress.ts`**
- در `weightHero()`: رنگ تغییر وزن را با توجه به هدف کات یا حجم بگذار:
  ```typescript
  const goodChange = isLoss ? gained <= 0 : gained >= 0;
  ```
  و از `goodChange ? "text-emerald-400" : "text-rose-400"` استفاده کن.
- در `submitWeight()`: پیام توست را داینامیک کن:
  ```typescript
  toast(`وزن ثبت شد. مسیر ${faNum(next.profile.startWeight, 1)} ← ${faNum(next.profile.targetWeight, 1)} ادامه دارد! 📈`);
  ```
- در `chartCard()`: صفت `preserveAspectRatio="none"` را از تگ `<svg>` حذف کن تا نقاط دایره‌ای کشیده نشوند.

**۸-۴. `src/components/idealWeight.ts`، `src/components/onboarding.ts` و `src/lib/appSettings.ts`**
- در `idealWeight.ts`: دو گزینه اختیاری `build?: BuildType;` و `onBuildChange?: (next: BuildType) => void;` به `IdealWeightOptions` اضافه کن و `let build: BuildType = options.build ?? "standard";` و هنگام تغییر `options.onBuildChange?.(build)` صدا بزن.
- در `onboarding.ts`:
  - `let idealBuild: BuildType = "standard";` تعریف کن و به `idealWeightCalculatorCard` پاس بده تا با زدن `±۱` انتخاب کاربر ریست نشود.
  - داخل `paintPrograms()` یک هشدار متنی کوتاه نشان بده وقتی `programId !== state.profile.workoutProgramId` (بدون مودال confirm تا تست `e2e-v3` نشکند).
  - در ذخیره ویزارد: فقط وقتی `isFirstRun || state.weightHistory.length === 0 || currentWeight !== state.profile.currentWeight` بود به `weightHistory` اضافه کن.
- در `appSettings.ts` (`applyDeveloperPreset`): اگر `history.weightHistory.length > 0` بود، `state.profile.currentWeight = history.weightHistory[history.weightHistory.length - 1].weight;` بگذار تا با نمودار وزن تناقض نداشته باشد.

**۸-۵. `src/components/progressPhotos.ts` و `src/views/coach.ts`**
- در `progressPhotos.ts`:
  - قبل از بازیابی بکاپ: آلارم‌های سرویس قبلی را با `cancelBusAlarms` (از `../views/uni`) لغو کن و `clearDeloadSnapshot()` بزن؛ همچنین بعد از `setState(restored)` ابتدا `syncWaterMirrorFromState()` (از `../lib/timer`) و سپس `restoreWaterReminderOnBoot()` را صدا بزن.
  - در `shareBackup()`: اگر `isTauri()` صادق است و `nativeBridge.shareBackupFile` موفق نشد، به‌جای فالبک بی‌اثر `downloadBackup` روی Android WebView، توست و `setHint(..., "error")` نشان بده که از «ذخیره مستقیم در پوشه Download» استفاده کند.
- در `coach.ts` (`loadDeveloperPreset`): قبل از `applyDeveloperPreset(getState())` لیست `oldAlarms = [...(getState().uniReminders?.activeBusAlarms ?? [])]` را بردار و `void cancelBusAlarms(oldAlarms);` صدا بزن.

**۸-۶. `src/components/weeklyActivity.ts`**
- در کلیک روی سلول روز در نوار هفته: به‌جای `selectedDateIso = iso;` بنویس `selectedDateIso = iso === today ? null : iso;` تا با عبور از نیمه‌شب روی دیروز قفل نشود.

---

#### ۹. تب دانشگاه، اشتراک‌گذاری، فونت، کتابخانه حرکات و CI

**۹-۱. `src/views/uni.ts`**
- تابع `export async function cancelBusAlarms(keys: string[]): Promise<void>` را export کن تا تمام روزهای هفته (۱ تا ۷) برای کلیدهای داده‌شده لغو شوند.
- در `shiftEarlier(hhmm, delta)`: `dayDelta` را هم برگردان (`const raw = parseMinutes(hhmm) - delta; const dayDelta = raw < 0 ? -1 : 0;`) و در `toggleBusAlarm` و `syncUniAlarms` روز هفته را به `const shiftedDay = ((weekday - 1 + at.dayDelta + 7) % 7) + 1;` شیفت بده (برای سرویس‌های بین `00:00` و `00:14`).
- در `reminderCard()`: فقط وقتی `getState().appMode !== "uni_only"` است `gymBox` را به کارت اضافه کن (`if (getState().appMode === "uni_only") card.append(foodBox); else card.append(foodBox, gymBox);`).

**۹-۲. `src/views/uniCourses.ts`**
- در `weeksSinceAnchor`:
  ```typescript
  const rawAnchor = getState().semesterWeekAnchorDate;
  const anchor = rawAnchor ? currentWeekStartIso(rawAnchor) : currentWeekStartIso(referenceIso);
  return Math.floor(daysBetween(anchor, currentWeekStartIso(referenceIso)) / 7);
  ```

**۹-۳. `src/views/uniLanguage.ts`**
- در کلیک دکمه‌های `PRESET_MINUTES`: خط `void cancelNotifications([LANG_TIMER_NOTIF_ID]);` را همزمان با `languageStudyTimer.reset(...)` اضافه کن.
- در `languageStudyTimer.onDone = (overdueSec = 0) => { ... }`: فقط وقتی `overdueSec <= 3` است `alarm()` بزن.

**۹-۴. `src/lib/uniShare.ts` و `src/views/uniShuttleAi.ts`**
- در `uniShare.ts` (`normalizeCourseDay`):
  - به `COURSE_DAY_MAP` کلیدهای `"1شنبه": 0, "2شنبه": 1, "3شنبه": 2, "4شنبه": 3, "5شنبه": 4` را اضافه کن.
  - به‌جای `Number.parseInt(normalized, 10)` فقط تک‌رقم دقیق را بپذیر: `if (/^[0-6]$/.test(normalized)) return Number(normalized);`.
- در `uniShare.ts` (`applyShareJson`):
  - در شاخه `courses`: اگر `data.courses.length > 0` بود ولی پس از فیلتر `validCourses.length === 0` شد، خطا نشان بده و دروس فعلی را پاک نکن.
  - در شاخه `shuttle` و همچنین در `uniShuttleAi.ts`: اگر طول متن بیش از `20_000` کاراکتر بود با `toast("حجم JSON سرویس‌ها بیش از حد مجاز است (حداکثر ۲۰ کیلوبایت).", "error")` رد کن.

**۹-۵. `index.html`**
- لینک Google Fonts را غیرمسدودکننده (non-render-blocking) کن تا در حالت آفلاین یا اینترنت کند صفحه معطل نماند:
  ```html
  <link
    href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800;900&display=swap"
    rel="stylesheet"
    media="print"
    onload="this.media='all'"
  />
  <noscript>
    <link
      href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800;900&display=swap"
      rel="stylesheet"
    />
  </noscript>
  ```

**۹-۶. `scripts/build-exercise-library.mjs`**
- در `persianName` به‌جای `equipmentFa.includes(label) || label.includes(equipmentFa)` بنویس:
  ```javascript
  const equipWords = equipmentFa.split(/\s+/);
  if (equipmentFa === label || label.includes(equipmentFa) || (label === "هالتر" && equipWords[0] === "هالتر")) continue;
  ```
  تا صفت `"خم"` (`bent over`) برای حرکات `"هالتر خم"` (`ez barbell`) حذف نشود.
- کلید دست‌نیافتنی `"ساق تک‌پا"` را از `MOVEMENT_CUE_FA` حذف کن.

**۹-۷. `.github/workflows/android-apk.yml`**
- در مرحله `Publish direct arm64 APK to GitHub Releases (no ZIP)`: روی آپدیت Release، تگ/توضیحات را هم آپدیت کن و APKهای قدیمیِ معماری‌های دیگر را پاک کن:
  ```yaml
          if gh release view "$TAG" >/dev/null 2>&1; then
            for old in $(gh release view "$TAG" --json assets -q '.assets[].name | select(endswith(".apk"))'); do
              gh release delete-asset "$TAG" "$old" -y || true
            done
            gh release upload "$TAG" artifacts/*.apk artifacts/SHA256SUMS.txt --clobber
            gh release edit "$TAG" \
              --target "${GITHUB_SHA}" \
              --title "Latest Android Debug APK (${TARGET_INPUT:-aarch64})" \
              --notes "Direct APK download (without ZIP). Commit: ${GITHUB_SHA}"
          else
  ```
  (متغیر `TARGET_INPUT: ${{ inputs.target || 'aarch64' }}` را به `env:` همین step هم اضافه کن.)

---

#### ۱۰. دستورات بررسی نهایی پس از اعمال تغییرات

```bash
npm run typecheck
npm run build
cd src-tauri && cargo check --all-targets && cargo test && cd ..
```

سپس سرور استاتیک (`node scripts/serve-dist.mjs`) را بالا بیاور و همه تست‌های `e2e` را اجرا کن (`e2e-check`, `e2e-fixes`, `e2e-water`, `e2e-audio`, `e2e-calendar`, `e2e-uni`, `e2e-uni-v2`, `e2e-swap-quiet`, `e2e-perf`, `e2e-v3`, `e2e-v4`, `e2e-v5`, `e2e-v6`, `e2e-v7`) و مطمئن شو ۱۰۰٪ پاس می‌شوند. در پایان در صورت تمایل `node scripts/dump-code.mjs` را اجرا و کامیت/پوش کن.