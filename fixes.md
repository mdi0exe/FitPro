در ادامه، تمام تغییرات لازم به صورت بلوک‌های دقیق **پیدا کن (`SEARCH`) / جایگزین کن (`REPLACE`)** به تفکیک هر فایل آماده شده است. کافی است همین متن را به هوش مصنوعی کامپیوترتان بدهید تا فقط همین قسمت‌ها را در فایل‌های مربوطه ویرایش کند (تمام تست‌های E2E و Cargo هم در نظر گرفته شده‌اند تا هیچ تستی نشکند).

---

### ۱. فایل `src/main.ts`
**رفع باگ:** ادغام دو لیسنر `visibilitychange` تا هنگام بازگشت به برنامه، ابتدا فایل `gym_state.json` از دیسک خوانده شود و سپس تایمر آب بررسی شود (جلوگیری از زنگ خوردن تکراری یادآور آب).

```typescript
<<<<<<< SEARCH
    // Coming back from the background can be hours later — recompute the
    // remaining time (and fire once if the deadline passed meanwhile).
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") restoreWaterReminderOnBoot();
    });

    // Android requires a user gesture before audio playback is allowed.
=======
    // Android requires a user gesture before audio playback is allowed.
>>>>>>> REPLACE
```

```typescript
<<<<<<< SEARCH
async function syncAfterBackground(): Promise<void> {
  if (syncingAfterBackground) return;
  syncingAfterBackground = true;
  try {
    if (hasNativeWaterBridge()) {
      // A debounced save queued just before the app was backgrounded must land
      // first, otherwise setState(loadState()) silently discards it.
      if (hasPendingSave()) await flushNow();
      setState(await loadState());
    }
    if (ensureDailyDietReset()) persist(0);
    requestRender();
  } catch (error) {
    console.warn("resume sync failed", error);
  } finally {
    syncingAfterBackground = false;
  }
}
=======
async function syncAfterBackground(): Promise<void> {
  if (syncingAfterBackground) return;
  syncingAfterBackground = true;
  try {
    if (hasNativeWaterBridge()) {
      // A debounced save queued just before the app was backgrounded must land
      // first, otherwise setState(loadState()) silently discards it.
      if (hasPendingSave()) await flushNow();
      const diskState = await loadState();
      setState(diskState);
      // Sync the localStorage mirror with the deadline updated by Kotlin's
      // WaterBroadcastReceiver so restoreWaterReminderOnBoot doesn't read a stale timestamp.
      try {
        const nextAt = diskState.diet?.waterReminderNextAt ?? 0;
        if (nextAt > 0) {
          window.localStorage.setItem("persian-hypertrophy::water-next-at", String(nextAt));
        } else {
          window.localStorage.removeItem("persian-hypertrophy::water-next-at");
        }
      } catch {
        /* storage unavailable */
      }
    }
    if (ensureDailyDietReset()) persist(0);
    restoreWaterReminderOnBoot();
    requestRender();
  } catch (error) {
    console.warn("resume sync failed", error);
  } finally {
    syncingAfterBackground = false;
  }
}
>>>>>>> REPLACE
```

---

### ۲. فایل `src/views/workout.ts`
**رفع باگ‌ها:**
1. اعمال شدن `targetWeight` و `reps` جدید در استپرهای ست‌ها هنگام زدن «شروع مجدد این روز» (`restartDay`).
2. ثبت رکورد شخصی (`checkAndUpdatePR`) حتی زمانی که کاربر بعد از تیک زدنِ ست، وزنه یا تکرار را با استپر تغییر می‌دهد.
3. جلوگیری از باز شدن همزمان دو مودال (`openDoubleProgressionModal` و `openWorkoutFinishModal`) در آخرین ستِ روز.
4. پاک کردن متادیتای جایگزینی موقت (`swappedDate`) در صورتی که کاربر حرکت را دستی ویرایش کند.

```typescript
<<<<<<< SEARCH
  for (const exercise of day.exercises) {
    for (const log of exercise.logs) log.done = false;
  }
  for (const warmup of day.warmups) warmup.done = false;
=======
  for (const exercise of day.exercises) {
    const prescribedReps = firstNumber(exercise.reps);
    for (const log of exercise.logs) {
      log.done = false;
      // If Double Progression raised the prescription, bring the set up to the new target.
      if (!exercise.bodyweight && exercise.targetWeight > 0 && log.weight < exercise.targetWeight) {
        log.weight = exercise.targetWeight;
        if (prescribedReps > 0) log.reps = prescribedReps;
      } else if ((exercise.bodyweight || exercise.targetWeight <= 0) && prescribedReps > log.reps) {
        log.reps = prescribedReps;
      }
    }
  }
  for (const warmup of day.warmups) warmup.done = false;
>>>>>>> REPLACE
```

```typescript
<<<<<<< SEARCH
    onChange: (value) => {
      log.weight = value;
      if (log.done) recordExerciseHistory(exercise);
      persist();
    },
    onOpenPicker: (current, setValue) =>
      openValuePicker({
        title: `وزنه ست ${fa(log.index)}`,
        subtitle: exercise.name,
        value: current,
        unit: "کیلوگرم",
        format: (value) => faNum(value, 1),
        deltas: [-5, -2.5, -1.25, 1.25, 2.5, 5],
        presets: [0, 2.5, 5, 7.5, 10, 12.5, 15, 17.5, 20, 22.5, 25, 30, 35, 40, 50, 60, 70, 80, 100],
        onChange: (value) => {
          log.weight = value;
          if (log.done) recordExerciseHistory(exercise);
          setValue(value);
          persist();
        },
        onApplyAll: (value) => applyToAllSets(exercise, "weight", value),
      }),
  });

  const reps = stepper({
    value: log.reps,
    step: 1,
    min: 1,
    ariaLabel: `تکرار ست ${log.index}`,
    onChange: (value) => {
      log.reps = value;
      if (log.done) recordExerciseHistory(exercise);
      persist();
    },
    onOpenPicker: (current, setValue) =>
      openValuePicker({
        title: `تکرار ست ${fa(log.index)}`,
        subtitle: exercise.name,
        value: current,
        unit: "تکرار",
        min: 1,
        format: (value) => fa(value),
        deltas: [-2, -1, 1, 2],
        presets: [6, 8, 10, 12, 15, 20, 25],
        onChange: (value) => {
          log.reps = value;
          if (log.done) recordExerciseHistory(exercise);
          setValue(value);
          persist();
        },
        onApplyAll: (value) => applyToAllSets(exercise, "reps", value),
      }),
  });
=======
    onChange: (value) => {
      log.weight = value;
      if (log.done) recordExerciseHistory(exercise);
      if (log.done && checkAndUpdatePR(exercise, log.weight, log.reps)) requestRender();
      persist();
    },
    onOpenPicker: (current, setValue) =>
      openValuePicker({
        title: `وزنه ست ${fa(log.index)}`,
        subtitle: exercise.name,
        value: current,
        unit: "کیلوگرم",
        format: (value) => faNum(value, 1),
        deltas: [-5, -2.5, -1.25, 1.25, 2.5, 5],
        presets: [0, 2.5, 5, 7.5, 10, 12.5, 15, 17.5, 20, 22.5, 25, 30, 35, 40, 50, 60, 70, 80, 100],
        onChange: (value) => {
          log.weight = value;
          if (log.done) recordExerciseHistory(exercise);
          if (log.done && checkAndUpdatePR(exercise, log.weight, log.reps)) requestRender();
          setValue(value);
          persist();
        },
        onApplyAll: (value) => applyToAllSets(exercise, "weight", value),
      }),
  });

  const reps = stepper({
    value: log.reps,
    step: 1,
    min: 1,
    ariaLabel: `تکرار ست ${log.index}`,
    onChange: (value) => {
      log.reps = value;
      if (log.done) recordExerciseHistory(exercise);
      if (log.done && checkAndUpdatePR(exercise, log.weight, log.reps)) requestRender();
      persist();
    },
    onOpenPicker: (current, setValue) =>
      openValuePicker({
        title: `تکرار ست ${fa(log.index)}`,
        subtitle: exercise.name,
        value: current,
        unit: "تکرار",
        min: 1,
        format: (value) => fa(value),
        deltas: [-2, -1, 1, 2],
        presets: [6, 8, 10, 12, 15, 20, 25],
        onChange: (value) => {
          log.reps = value;
          if (log.done) recordExerciseHistory(exercise);
          if (log.done && checkAndUpdatePR(exercise, log.weight, log.reps)) requestRender();
          setValue(value);
          persist();
        },
        onApplyAll: (value) => applyToAllSets(exercise, "reps", value),
      }),
  });
>>>>>>> REPLACE
```

```typescript
<<<<<<< SEARCH
      const allDone =
        exercise.logs.length > 0 && exercise.logs.every((entry) => entry.done);
      if (allDone) {
        chord();
        // Once per exercise per day: ask what the next session should be.
        offerDoubleProgression(exercise);
      } else beep(2, 1320, 0.12);
      startRest();
    } else if (exercise.logs.some((entry) => entry.done)) {
      // Other sets are still ticked: recompute setsCompleted and the top set.
      recordExerciseHistory(exercise);
    } else {
      // Last tick was undone: today's row would be a phantom point.
      clearTodayExerciseHistory(exercise.id);
    }
    refreshProgress(day, exercise);

    // Celebrate once, on the tick that finishes the whole day.
    if (!wasComplete && dayTotal(day) > 0 && dayDone(day) === dayTotal(day)) {
      openWorkoutFinishModal(day);
    }
=======
      const dayFinishedNow = !wasComplete && dayTotal(day) > 0 && dayDone(day) === dayTotal(day);
      const allDone =
        exercise.logs.length > 0 && exercise.logs.every((entry) => entry.done);
      if (allDone) {
        chord();
        // Only open the progression modal if the day-finish celebration isn't
        // about to open on the exact same tap (avoids two stacked modals).
        if (!dayFinishedNow) offerDoubleProgression(exercise);
      } else beep(2, 1320, 0.12);
      startRest();
    } else if (exercise.logs.some((entry) => entry.done)) {
      // Other sets are still ticked: recompute setsCompleted and the top set.
      recordExerciseHistory(exercise);
    } else {
      // Last tick was undone: today's row would be a phantom point.
      clearTodayExerciseHistory(exercise.id);
    }
    refreshProgress(day, exercise);

    // Celebrate once, on the tick that finishes the whole day.
    if (!wasComplete && dayTotal(day) > 0 && dayDone(day) === dayTotal(day)) {
      openWorkoutFinishModal(day);
    }
>>>>>>> REPLACE
```

```typescript
<<<<<<< SEARCH
function applyToAllSets(exercise: Exercise, field: "weight" | "reps", value: number): void {
  for (const log of exercise.logs) {
    if (field === "weight") log.weight = value;
    else log.reps = value;
  }
  // Editing a finished set must move today's chart point as well.
  if (exercise.logs.some((log) => log.done)) recordExerciseHistory(exercise);
=======
function applyToAllSets(exercise: Exercise, field: "weight" | "reps", value: number): void {
  for (const log of exercise.logs) {
    if (field === "weight") log.weight = value;
    else log.reps = value;
    if (log.done) checkAndUpdatePR(exercise, log.weight, log.reps);
  }
  // Editing a finished set must move today's chart point as well.
  if (exercise.logs.some((log) => log.done)) recordExerciseHistory(exercise);
>>>>>>> REPLACE
```

```typescript
<<<<<<< SEARCH
      exercise.name = draft.name;
      exercise.reps = draft.reps;
      exercise.tip = draft.tip;
      exercise.query = draft.query;
      exercise.gifUrl = draft.gifUrl;
      exercise.targetWeight = draft.targetWeight;
      exercise.bodyweight = draft.targetWeight <= 0;
      exercise.sets = draft.sets;
=======
      const identityEdited =
        exercise.name !== draft.name ||
        exercise.tip !== draft.tip ||
        exercise.gifUrl !== draft.gifUrl;

      exercise.name = draft.name;
      exercise.reps = draft.reps;
      exercise.tip = draft.tip;
      exercise.query = draft.query;
      exercise.gifUrl = draft.gifUrl;
      exercise.targetWeight = draft.targetWeight;
      exercise.bodyweight = draft.targetWeight <= 0;
      exercise.sets = draft.sets;

      // If the user manually edited a swapped exercise, make the edit permanent
      // instead of overwriting it tomorrow morning with the old originalName.
      if (identityEdited && exercise.swappedDate) {
        exercise.swappedDate = null;
        exercise.originalName = null;
        exercise.originalQuery = null;
        exercise.originalGifUrl = null;
        exercise.originalTip = null;
      }
>>>>>>> REPLACE
```

---

### ۳. فایل `src/components/exerciseHistory.ts`
**رفع باگ:** پشتیبانی کامل از حرکات «وزن بدن» (`weight === 0`) در انتخاب بهترین ست روز و رسم نمودار بر اساس تکرارها (وقتی وزنه صفر است).

```typescript
<<<<<<< SEARCH
  const top = done.reduce(
    (best, log) => (log.weight * log.reps > best.weight * best.reps ? log : best),
    done[0],
  );
=======
  const top = done.reduce((best, log) => {
    const score = log.weight > 0 ? log.weight * log.reps : log.reps;
    const bestScore = best.weight > 0 ? best.weight * best.reps : best.reps;
    return score > bestScore ? log : best;
  }, done[0]);
>>>>>>> REPLACE
```

```typescript
<<<<<<< SEARCH
/** Inline SVG sparkline: weight over time, with a soft area fill. */
function chartSvg(entries: ExerciseHistoryEntry[]): string {
  const width = 300;
  const height = 120;
  const pad = 10;
  const weights = entries.map((row) => row.weight);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  // A flat series still needs a band, otherwise every point lands on the axis.
  const span = max - min < 0.01 ? 1 : max - min;
  const stepX = entries.length > 1 ? (width - pad * 2) / (entries.length - 1) : 0;

  const points = entries.map((row, index) => {
    const x = pad + index * stepX;
    const y = height - pad - ((row.weight - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });
=======
/** Inline SVG sparkline: weight (or reps for bodyweight moves) over time. */
function chartSvg(entries: ExerciseHistoryEntry[], useReps = false): string {
  const width = 300;
  const height = 120;
  const pad = 10;
  const values = entries.map((row) => (useReps ? row.reps : row.weight));
  const min = Math.min(...values);
  const max = Math.max(...values);
  // A flat series still needs a band, otherwise every point lands on the axis.
  const span = max - min < 0.01 ? 1 : max - min;
  const stepX = entries.length > 1 ? (width - pad * 2) / (entries.length - 1) : 0;

  const points = entries.map((row, index) => {
    const val = useReps ? row.reps : row.weight;
    const x = pad + index * stepX;
    const y = height - pad - ((val - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });
>>>>>>> REPLACE
```

```typescript
<<<<<<< SEARCH
    const first = entries[0];
    const last = entries[entries.length - 1];
    const delta = last.weight - first.weight;

    const summary = el("div", "grid grid-cols-3 gap-2");
    const cell = (label: string, value: string, tone: string) => {
      const box = el("div", "rounded-xl border border-slate-800 bg-slate-950/50 px-2 py-2 text-center");
      box.append(el("p", `text-sm font-extrabold ${tone}`, value), el("p", "mt-0.5 text-[9px] text-slate-500", label));
      return box;
    };
    summary.append(
      cell("بهترین وزن", `${faNum(Math.max(...entries.map((r) => r.weight)), 1)}`, "text-emerald-300"),
      cell("جلسات", fa(entries.length), "text-slate-100"),
      cell(
        "تغییر وزن",
        `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${faNum(Math.abs(delta), 1)}`,
        delta > 0 ? "text-emerald-300" : delta < 0 ? "text-rose-300" : "text-slate-400",
      ),
    );
    body.append(summary);

    if (entries.length < 2) {
      // A single point has nothing to draw — a line needs two sessions. Saying so
      // is far clearer than an empty 120px box that looks like a broken chart.
      body.append(
        el(
          "div",
          "rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 px-3 py-4 text-center text-[10px] leading-5 text-slate-500",
          "نمودار بعد از دومین جلسه رسم می‌شود. امروز اولین نقطه ثبت شد.",
        ),
      );
    } else {
      const chart = el("div", "rounded-2xl border border-slate-800 bg-slate-950/60 p-2");
      chart.innerHTML = chartSvg(entries);
      body.append(chart);
    }
=======
    const isBodyweight = entries.every((r) => r.weight <= 0);
    const first = entries[0];
    const last = entries[entries.length - 1];
    const delta = isBodyweight ? last.reps - first.reps : last.weight - first.weight;

    const summary = el("div", "grid grid-cols-3 gap-2");
    const cell = (label: string, value: string, tone: string) => {
      const box = el("div", "rounded-xl border border-slate-800 bg-slate-950/50 px-2 py-2 text-center");
      box.append(el("p", `text-sm font-extrabold ${tone}`, value), el("p", "mt-0.5 text-[9px] text-slate-500", label));
      return box;
    };
    summary.append(
      cell(
        isBodyweight ? "بیشترین تکرار" : "بهترین وزن",
        isBodyweight
          ? fa(Math.max(...entries.map((r) => r.reps)))
          : `${faNum(Math.max(...entries.map((r) => r.weight)), 1)}`,
        "text-emerald-300",
      ),
      cell("جلسات", fa(entries.length), "text-slate-100"),
      cell(
        isBodyweight ? "تغییر تکرار" : "تغییر وزن",
        `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${faNum(Math.abs(delta), isBodyweight ? 0 : 1)}`,
        delta > 0 ? "text-emerald-300" : delta < 0 ? "text-rose-300" : "text-slate-400",
      ),
    );
    body.append(summary);

    if (entries.length < 2) {
      // A single point has nothing to draw — a line needs two sessions. Saying so
      // is far clearer than an empty 120px box that looks like a broken chart.
      body.append(
        el(
          "div",
          "rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 px-3 py-4 text-center text-[10px] leading-5 text-slate-500",
          "نمودار بعد از دومین جلسه رسم می‌شود. امروز اولین نقطه ثبت شد.",
        ),
      );
    } else {
      const chart = el("div", "rounded-2xl border border-slate-800 bg-slate-950/60 p-2");
      chart.innerHTML = chartSvg(entries, isBodyweight);
      body.append(chart);
    }
>>>>>>> REPLACE
```

---

### ۴. فایل `src/data/programs.ts` و `src/lib/workoutTools.ts`
**رفع باگ:** اختصاص شناسه مستقل (`dorm-pushup` و `dorm-squat`) به حرکات خوابگاهی تا با پرس بالا سینه دمبل و اسکات اسمیت قاطی نشوند، و اصلاح محاسبه تاریخ در `getWorkoutStreak`.

**در فایل `src/data/programs.ts`:**
```typescript
<<<<<<< SEARCH
      const pushUp: Exercise = {
        id: "d1e1",
        name: "شنا سوئدی استاندارد (یا دست روی تخت)",
        sets: 4,
        reps: "12-15",
        query: "Push-up gif",
        tip: "بدن در یک خط صاف، سینه تا نزدیک زمین پایین بیاید",
        gifUrl: "/gifs/wu-u3.gif",
        targetWeight: 0,
        bodyweight: true,
        logs: [],
      };
      pushUp.logs = syncLogs(pushUp);

      const squat: Exercise = {
        id: "d2e2",
        name: "اسکات وزن بدن (یا گابلت اسکات با دمبل/کوله)",
        sets: 4,
        reps: "15-20",
        query: "Bodyweight Squat gif",
        tip: "مکث ۱ ثانیهای در پایینترین نقطه",
        gifUrl: "/gifs/wu-l3.gif",
        targetWeight: 0,
        bodyweight: true,
        logs: [],
      };
=======
      const pushUp: Exercise = {
        id: "dorm-pushup",
        name: "شنا سوئدی استاندارد (یا دست روی تخت)",
        sets: 4,
        reps: "12-15",
        query: "Push-up gif",
        tip: "بدن در یک خط صاف، سینه تا نزدیک زمین پایین بیاید",
        gifUrl: "/gifs/wu-u3.gif",
        targetWeight: 0,
        bodyweight: true,
        logs: [],
      };
      pushUp.logs = syncLogs(pushUp);

      const squat: Exercise = {
        id: "dorm-squat",
        name: "اسکات وزن بدن (یا گابلت اسکات با دمبل/کوله)",
        sets: 4,
        reps: "15-20",
        query: "Bodyweight Squat gif",
        tip: "مکث ۱ ثانیه‌ای در پایین‌ترین نقطه",
        gifUrl: "/gifs/wu-l3.gif",
        targetWeight: 0,
        bodyweight: true,
        logs: [],
      };
>>>>>>> REPLACE
```

**در فایل `src/lib/workoutTools.ts`:**
```typescript
<<<<<<< SEARCH
import { fa, faNum, isoToday } from "./fa";
=======
import { fa, faNum, isoAddDays, isoToday } from "./fa";
>>>>>>> REPLACE
```

```typescript
<<<<<<< SEARCH
  d4e6: {
    name: "ساعد با دمبل (یا هالتر از پشت)",
    query: "Dumbbell Wrist Curl gif",
    tip: "مچ را کامل باز و جمع کنید تا ساعد به سوزش بیفتد",
  },
};

/** Exact muscle group for every movement in the bundled 4-day programme. */
const EXERCISE_MUSCLE_MAP: Record<string, string> = {
=======
  d4e6: {
    name: "ساعد با دمبل (یا هالتر از پشت)",
    query: "Dumbbell Wrist Curl gif",
    tip: "مچ را کامل باز و جمع کنید تا ساعد به سوزش بیفتد",
  },
  "dorm-pushup": {
    name: "شنا سوئدی دست جمع (الماسی) یا پرس دمبل روی زمین",
    query: "Diamond Push-up gif",
    tip: "آرنج‌ها نزدیک پهلو، فشار عالی روی سینه و پشت بازو بدون دستگاه",
  },
  "dorm-squat": {
    name: "گابلت اسکات با دمبل (یا اسکات پرشی)",
    query: "Dumbbell Goblet Squat gif",
    tip: "دمبل یا کوله را نزدیک سینه نگه دارید و کمر را صاف حفظ کنید",
  },
};

/** Exact muscle group for every movement in the bundled 4-day programme. */
const EXERCISE_MUSCLE_MAP: Record<string, string> = {
  "dorm-pushup": "chest",
  "dorm-squat": "quads",
>>>>>>> REPLACE
```

```typescript
<<<<<<< SEARCH
  if (alt) {
    exercise.name = alt.name;
    exercise.query = alt.query;
    // The substitute movement has its own bundled demo, so the card keeps
    // showing the movement that is actually on the screen.
    exercise.gifUrl = `/gifs/${exercise.id}-alt.gif`;
    exercise.tip = alt.tip;
  } else {
=======
  if (alt) {
    exercise.name = alt.name;
    exercise.query = alt.query;
    // The substitute movement has its own bundled demo for d1..d4; dorm moves keep their gif.
    if (EXERCISE_GIFS[exercise.id]) {
      exercise.gifUrl = `/gifs/${exercise.id}-alt.gif`;
    }
    exercise.tip = alt.tip;
  } else {
>>>>>>> REPLACE
```

```typescript
<<<<<<< SEARCH
  const iso = (offset: number) => {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  };
=======
  const today = isoToday();
  const iso = (offset: number) => isoAddDays(today, -offset);
>>>>>>> REPLACE
```

---

### ۵. فایل‌های `src/lib/appSettings.ts` و `src/views/coach.ts`
**رفع باگ:** پاک کردن فلگ `deloadActive` و اسنپ‌شات `persian-hypertrophy::deload-snapshot` هنگام تعویض برنامه تمرینی، اعمال پروفایل توسعه‌دهنده و ریست برنامه در حالت Native.

**در فایل `src/lib/appSettings.ts`:**
```typescript
<<<<<<< SEARCH
  state.days = program.buildDays();
  state.activeDay = 0;
  state.restSeconds = program.restSeconds;
  state.profile.goal = program.goalLabel;
  state.profile.workoutProgramId = program.id;
  return true;
=======
  state.days = program.buildDays();
  state.activeDay = 0;
  state.restSeconds = program.restSeconds;
  state.profile.goal = program.goalLabel;
  state.profile.workoutProgramId = program.id;
  state.deloadActive = false;
  try {
    window.localStorage.removeItem("persian-hypertrophy::deload-snapshot");
  } catch {
    /* storage unavailable */
  }
  return true;
>>>>>>> REPLACE
```

```typescript
<<<<<<< SEARCH
  state.appMode = "full";
  state.onboardingCompleted = true;

  state.theme = history.theme;
=======
  state.appMode = "full";
  state.onboardingCompleted = true;
  state.deloadActive = false;
  try {
    window.localStorage.removeItem("persian-hypertrophy::deload-snapshot");
  } catch {
    /* storage unavailable */
  }

  state.theme = history.theme;
>>>>>>> REPLACE
```

**در فایل `src/views/coach.ts`:**
```typescript
<<<<<<< SEARCH
  try {
    const next = await resetToDefaults();
    setState(next);
    toast("برنامه به حالت پیش‌فرض بازگشت.", "info");
    requestRender();
=======
  try {
    const next = await resetToDefaults();
    try {
      window.localStorage.removeItem("persian-hypertrophy::deload-snapshot");
    } catch {
      /* storage unavailable */
    }
    setState(next);
    toast("برنامه به حالت پیش‌فرض بازگشت.", "info");
    requestRender();
>>>>>>> REPLACE
```

---

### ۶. فایل `src/components/gifModal.ts`
**رفع باگ:** پذیرفتن مسیرهای محلی (`/gifs/...`) هنگام ذخیره گیف در مودال نمایش حرکت.

```typescript
<<<<<<< SEARCH
      btn("btn-primary", "ذخیره گیف", () => {
        const value = input.value.trim();
        if (value && !/^https?:\/\//i.test(value)) {
          toast("لینک باید با http یا https شروع شود.", "error");
          return;
        }
        options.onSaveUrl?.(value || null);
        renderPreview(value || null);
        toast(value ? "گیف ذخیره شد و در کارت حرکت نمایش داده می‌شود." : "گیف حذف شد.");
      }),
=======
      btn("btn-primary", "ذخیره گیف", () => {
        const value = input.value.trim();
        if (value && !/^(https?:\/\/|\/)/i.test(value)) {
          toast("لینک باید با http یا https شروع شود.", "error");
          return;
        }
        options.onSaveUrl?.(value || null);
        renderPreview(value || null);
        toast(value ? "گیف ذخیره شد و در کارت حرکت نمایش داده می‌شود." : "گیف حذف شد.");
      }),
>>>>>>> REPLACE
```

---

### ۷. فایل‌های `src-tauri/src/models.rs` و `src/lib/localBackend.ts`
**رفع باگ‌ها:**
1. اعتبارسنجی `height_cm`، `current_weight`، `start_weight` و `age` برای جلوگیری از تقسیم بر صفر در فرمول BMI.
2. اضافه شدن کنترل `endTime <= startTime` برای دروس در `localBackend.ts` (مشابه Rust).
3. جلوگیری از قرار گرفتن لینک 404 روی حرکات سفارشیِ کاربر هنگام بازگشت از جایگزینی روزانه.

**در فایل `src-tauri/src/models.rs`:**
```rust
<<<<<<< SEARCH
        if self.profile.target_weight <= 0.0 {
            self.profile.target_weight = 75.0;
        }
=======
        if !self.profile.target_weight.is_finite() || self.profile.target_weight <= 0.0 {
            self.profile.target_weight = 75.0;
        }
        if !self.profile.current_weight.is_finite() || self.profile.current_weight <= 0.0 {
            self.profile.current_weight = 65.0;
        }
        if !self.profile.start_weight.is_finite() || self.profile.start_weight <= 0.0 {
            self.profile.start_weight = self.profile.current_weight;
        }
        if !self.profile.height_cm.is_finite() || self.profile.height_cm < 100.0 || self.profile.height_cm > 250.0 {
            self.profile.height_cm = 179.0;
        }
        self.profile.age = self.profile.age.clamp(10, 100);
>>>>>>> REPLACE
```

**در فایل `src/lib/localBackend.ts`:**
```typescript
<<<<<<< SEARCH
  state.profile = state.profile ?? createSeedState().profile;
  state.profile.universityName = cleanText(state.profile.universityName, 80, "دانشگاه من");
=======
  state.profile = state.profile ?? createSeedState().profile;
  if (!Number.isFinite(state.profile.targetWeight) || state.profile.targetWeight <= 0) {
    state.profile.targetWeight = 75;
  }
  if (!Number.isFinite(state.profile.currentWeight) || state.profile.currentWeight <= 0) {
    state.profile.currentWeight = 65;
  }
  if (!Number.isFinite(state.profile.startWeight) || state.profile.startWeight <= 0) {
    state.profile.startWeight = state.profile.currentWeight;
  }
  if (!Number.isFinite(state.profile.heightCm) || state.profile.heightCm < 100 || state.profile.heightCm > 250) {
    state.profile.heightCm = 179;
  }
  state.profile.age = Math.min(100, Math.max(10, Math.round(Number(state.profile.age) || 25)));
  state.profile.universityName = cleanText(state.profile.universityName, 80, "دانشگاه من");
>>>>>>> REPLACE
```

```typescript
<<<<<<< SEARCH
        startTime: hhmm(course.startTime, "09:00"),
        endTime: hhmm(course.endTime, "11:00"),
        weekType: (["all", "odd", "even"] as const).includes(course.weekType) ? course.weekType : "all",
      }))
=======
        startTime: hhmm(course.startTime, "09:00"),
        endTime: (() => {
          const start = hhmm(course.startTime, "09:00");
          const end = hhmm(course.endTime, "11:00");
          if (end > start) return end;
          const [h, m] = start.split(":").map((n) => Number.parseInt(n, 10) || 0);
          const total = Math.min(23 * 60 + 59, h * 60 + m + 120);
          return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
        })(),
        weekType: (["all", "odd", "even"] as const).includes(course.weekType) ? course.weekType : "all",
      }))
>>>>>>> REPLACE
```

```typescript
<<<<<<< SEARCH
      if (exercise.swappedDate && exercise.swappedDate !== localIso()) {
        if (exercise.originalName) exercise.name = exercise.originalName;
        if (exercise.originalQuery) exercise.query = exercise.originalQuery;
        exercise.gifUrl = exercise.originalGifUrl ?? `/gifs/${exercise.id}.gif`;
=======
      if (exercise.swappedDate && exercise.swappedDate !== localIso()) {
        if (exercise.originalName) exercise.name = exercise.originalName;
        if (exercise.originalQuery) exercise.query = exercise.originalQuery;
        exercise.gifUrl = exercise.originalGifUrl ?? exerciseGifs[exercise.id] ?? null;
>>>>>>> REPLACE
```

---

### ۸. فایل `src/lib/timer.ts`
**رفع باگ:** محاسبه زمان باقی‌مانده واقعی در لحظه `pause()` کردن تایمرها.

```typescript
<<<<<<< SEARCH
  pause(): void {
    this.running = false;
    this.stopLoop();
    this.paint();
  }
=======
  pause(): void {
    if (this.running && this.endsAt > 0) {
      this.remaining = Math.max(0, (this.endsAt - Date.now()) / 1000);
    }
    this.running = false;
    this.stopLoop();
    this.paint();
  }
>>>>>>> REPLACE
```

---

### ۹. فایل‌های `src/views/uniLanguage.ts`، `src/views/uniCourses.ts`، `src/views/uni.ts` و `src/lib/uniShare.ts`
**رفع باگ‌ها:**
1. اضافه شدن `dir="ltr"` روی تایمر تمرکز زبان، استفاده از `isoAddDays` در استریک زبان، و به‌روزرسانی آلارم هنگام تغییر عنوان مطالعه.
2. جلوگیری از رد شدن ساعت پایان کلاس از نیمه‌شب (`00:00`) در دکمه‌های جابه‌جایی نیم‌ساعتی.
3. اعتبارسنجی ساعت شروع و پایان دروس هنگام دریافت JSON از هم‌دانشگاهی.

**در فایل `src/views/uniLanguage.ts`:**
```typescript
<<<<<<< SEARCH
import { fa, faClock, isoToday } from "../lib/fa";
=======
import { fa, faClock, isoAddDays, isoToday } from "../lib/fa";
>>>>>>> REPLACE
```

```typescript
<<<<<<< SEARCH
export function languageStreak(dates: string[]): number {
  const set = new Set(dates);
  const iso = (offset: number) => {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  };
=======
export function languageStreak(dates: string[]): number {
  const set = new Set(dates);
  const today = isoToday();
  const iso = (offset: number) => isoAddDays(today, -offset);
>>>>>>> REPLACE
```

```typescript
<<<<<<< SEARCH
        () => {
          if (lang.title === subject.value) return;
          lang.title = subject.value;
          softTap();
          persist(0);
          toast(`هدف مطالعه روزانه: ${subject.value} 📚`);
          requestRender();
        },
=======
        () => {
          if (lang.title === subject.value) return;
          lang.title = subject.value;
          softTap();
          persist(0);
          if (lang.reminderEnabled) void scheduleLanguageAlarm(lang.reminderTime);
          toast(`هدف مطالعه روزانه: ${subject.value} 📚`);
          requestRender();
        },
>>>>>>> REPLACE
```

```typescript
<<<<<<< SEARCH
    `<p class="text-[10px] text-slate-400">تایمر تمرکز • ${fa(target)} دقیقه</p>
     <p data-lang-clock class="mt-0.5 text-center text-xl font-extrabold leading-tight text-cyan-300">${faClock(languageStudyTimer.remaining)}</p>`,
=======
    `<p class="text-[10px] text-slate-400">تایمر تمرکز • ${fa(target)} دقیقه</p>
     <p data-lang-clock dir="ltr" class="mt-0.5 text-center text-xl font-extrabold leading-tight text-cyan-300">${faClock(languageStudyTimer.remaining)}</p>`,
>>>>>>> REPLACE
```

**در فایل `src/views/uniCourses.ts`:**
```typescript
<<<<<<< SEARCH
  const shift = (delta: number) => {
    const length = Math.max(30, toMinutes(endTime) - toMinutes(startTime));
    startTime = toHhmm(toMinutes(startTime) + delta);
    endTime = toHhmm(toMinutes(startTime) + length);
    softTap();
    paintSlots();
    paintShift();
  };
=======
  const shift = (delta: number) => {
    const length = Math.max(30, toMinutes(endTime) - toMinutes(startTime));
    const maxStart = 23 * 60 + 30 - length;
    const nextStart = Math.min(Math.max(6 * 60, toMinutes(startTime) + delta), Math.max(6 * 60, maxStart));
    startTime = toHhmm(nextStart);
    endTime = toHhmm(nextStart + length);
    softTap();
    paintSlots();
    paintShift();
  };
>>>>>>> REPLACE
```

**در فایل `src/lib/uniShare.ts`:**
```typescript
<<<<<<< SEARCH
    if (Array.isArray(data.courses)) {
      const weekTypes = ["all", "odd", "even"];
      state.courses = data.courses
        .filter((course) => course && typeof course.name === "string" && course.name.trim())
        .slice(0, 60)
        .map((course) => ({
          id: typeof course.id === "string" && course.id ? course.id : uid("course"),
          name: String(course.name).trim().slice(0, 80),
          professor: typeof course.professor === "string" ? course.professor.trim().slice(0, 80) : "",
          dayOfWeek: Number.isInteger(course.dayOfWeek)
            ? Math.min(6, Math.max(0, course.dayOfWeek))
            : 0,
          startTime: typeof course.startTime === "string" ? course.startTime : "09:00",
          endTime: typeof course.endTime === "string" ? course.endTime : "11:00",
          weekType: (weekTypes.includes(String(course.weekType))
            ? course.weekType
            : "all") as CourseSession["weekType"],
        }));
      changed = true;
    }
=======
    if (Array.isArray(data.courses)) {
      const weekTypes = ["all", "odd", "even"];
      const hhmm = (v: unknown, fb: string) =>
        typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v.trim()) ? v.trim() : fb;
      state.courses = data.courses
        .filter((course) => course && typeof course.name === "string" && course.name.trim())
        .slice(0, 60)
        .map((course) => {
          const startTime = hhmm(course.startTime, "09:00");
          let endTime = hhmm(course.endTime, "11:00");
          if (endTime <= startTime) {
            const [h, m] = startTime.split(":").map((n) => Number.parseInt(n, 10) || 0);
            const total = Math.min(23 * 60 + 59, h * 60 + m + 120);
            endTime = `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
          }
          return {
            id: typeof course.id === "string" && course.id ? course.id : uid("course"),
            name: String(course.name).trim().slice(0, 80),
            professor: typeof course.professor === "string" ? course.professor.trim().slice(0, 80) : "",
            dayOfWeek: Number.isInteger(course.dayOfWeek)
              ? Math.min(6, Math.max(0, course.dayOfWeek))
              : 0,
            startTime,
            endTime,
            weekType: (weekTypes.includes(String(course.weekType))
              ? course.weekType
              : "all") as CourseSession["weekType"],
          };
        });
      changed = true;
    }
>>>>>>> REPLACE
```

---

### ۱۰. فایل‌های `scripts/patch-android-manifest.mjs` و `scripts/setup-android-native.mjs`
**رفع باگ‌ها:**
1. حفظ آلارم یادآور آب بعد از ری‌استارت گوشی (`RECEIVE_BOOT_COMPLETED`).
2. ثبت شدن لیوان آبِ نوتیفیکیشن در کارنامه روزانه (`activityHistory`) داخل فایل `gym_state.json` حتی وقتی اپ بسته است.
3. ایمن‌سازی `startActivity` در ترد اصلی و پاک‌سازی کش بکاپ‌های قدیمی در `BackupFileProvider`.

**در فایل `scripts/patch-android-manifest.mjs`:**
```javascript
<<<<<<< SEARCH
const PERMISSIONS = [
  "android.permission.POST_NOTIFICATIONS",
  "android.permission.SCHEDULE_EXACT_ALARM",
  "android.permission.USE_EXACT_ALARM",
  "android.permission.WAKE_LOCK",
];
=======
const PERMISSIONS = [
  "android.permission.POST_NOTIFICATIONS",
  "android.permission.SCHEDULE_EXACT_ALARM",
  "android.permission.USE_EXACT_ALARM",
  "android.permission.WAKE_LOCK",
  "android.permission.RECEIVE_BOOT_COMPLETED",
];
>>>>>>> REPLACE
```

**در فایل `scripts/setup-android-native.mjs`:**
```javascript
<<<<<<< SEARCH
    override fun onReceive(context: Context, intent: Intent?) {
        when (intent?.action) {
            ACTION_SHOW_REMINDER -> {
=======
    override fun onReceive(context: Context, intent: Intent?) {
        when (intent?.action) {
            Intent.ACTION_BOOT_COMPLETED -> {
                rescheduleFromState(context)
            }

            ACTION_SHOW_REMINDER -> {
>>>>>>> REPLACE
```

```javascript
<<<<<<< SEARCH
            writeAtomically(file, root)
            glasses
        } catch (_: Exception) {
            0
        }
    }
=======
            // Keep today's entry in activityHistory in sync even if the user
            // doesn't open the app before midnight.
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
>>>>>>> REPLACE
```

```javascript
<<<<<<< SEARCH
    @JavascriptInterface
    fun shareBackupFile(fileName: String, contents: String): Boolean {
        return try {
            val safeName = BackupFileProvider.sanitizeName(fileName)
            val file = File(BackupFileProvider.backupCacheDir(context), safeName)
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
            Handler(Looper.getMainLooper()).post {
                context.startActivity(chooser)
            }
            true
        } catch (_: Exception) {
            false
        }
    }
=======
    @JavascriptInterface
    fun shareBackupFile(fileName: String, contents: String): Boolean {
        return try {
            val safeName = BackupFileProvider.sanitizeName(fileName)
            val cacheDir = BackupFileProvider.backupCacheDir(context)
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
            Handler(Looper.getMainLooper()).post {
                try {
                    context.startActivity(chooser)
                } catch (_: Exception) {
                }
            }
            true
        } catch (_: Exception) {
            false
        }
    }
>>>>>>> REPLACE
```

```javascript
<<<<<<< SEARCH
if (!manifest.includes("WaterBroadcastReceiver")) {
  const receiverTag = [
    `        <!-- ${MARKER}: the water action stays in the background -->`,
    `        <receiver`,
    `            android:name=".WaterBroadcastReceiver"`,
    `            android:exported="false" />`,
  ].join("\n");
  manifest = manifest.replace("</application>", `${receiverTag}\n    </application>`);
  manifestChanged = true;
}
=======
if (!manifest.includes("WaterBroadcastReceiver")) {
  const receiverTag = [
    `        <!-- ${MARKER}: the water action stays in the background -->`,
    `        <receiver`,
    `            android:name=".WaterBroadcastReceiver"`,
    `            android:exported="false">`,
    `            <intent-filter>`,
    `                <action android:name="android.intent.action.BOOT_COMPLETED" />`,
    `            </intent-filter>`,
    `        </receiver>`,
  ].join("\n");
  manifest = manifest.replace("</application>", `${receiverTag}\n    </application>`);
  manifestChanged = true;
}
>>>>>>> REPLACE
```

---

### ۱۱. فایل `src/views/nutrition.ts`
**رفع باگ:** اصلاح کلمات فارسی به هم چسبیده (مثل «اضافه کردهای» ← «اضافه کرده‌ای») بدون تغییر دادن `aria-label`هایی که تست‌های E2E دنبالشان می‌گردند.

```typescript
<<<<<<< SEARCH
  card.append(
    el(
      "p",
      "text-[10px] leading-5 text-slate-500",
      "آیتمهای دلخواهی که خودت اضافه کردهای هنگام تغییر الگو حفظ میشوند.",
    ),
  );
=======
  card.append(
    el(
      "p",
      "text-[10px] leading-5 text-slate-500",
      "آیتم‌های دلخواهی که خودت اضافه کرده‌ای هنگام تغییر الگو حفظ می‌شوند.",
    ),
  );
>>>>>>> REPLACE
```

```typescript
<<<<<<< SEARCH
function openAddDietItemModal(): void {
  let handle: ModalHandle;
  const body = el("div", "space-y-3");
  body.append(
    el(
      "p",
      "text-[11px] leading-6 text-slate-400",
      "یک گزینه آماده لمس کن یا عنوان دلخواهت را بنویس (مثل کراتین، پروتئین وی یا میانوعده).",
    ),
  );
=======
function openAddDietItemModal(): void {
  let handle: ModalHandle;
  const body = el("div", "space-y-3");
  body.append(
    el(
      "p",
      "text-[11px] leading-6 text-slate-400",
      "یک گزینه آماده لمس کن یا عنوان دلخواهت را بنویس (مثل کراتین، پروتئین وی یا میان‌وعده).",
    ),
  );
>>>>>>> REPLACE
```

```typescript
<<<<<<< SEARCH
function removeDietItem(id: string): void {
  const state = getState();
  if (id === "diet-4") {
    toast("ردیف آب با شمارنده همگام است و حذف نمیشود.", "info");
    return;
  }
=======
function removeDietItem(id: string): void {
  const state = getState();
  if (id === "diet-4") {
    toast("ردیف آب با شمارنده همگام است و حذف نمی‌شود.", "info");
    return;
  }
>>>>>>> REPLACE
```


در ادامه تمام تغییرات لازم برای رفع ۳۳ ایراد شناسایی‌شده، **به‌صورت دقیق، فایل‌به‌فایل و فقط برای بخش‌هایی که نیاز به ویرایش دارند** آماده شده است تا هوش مصنوعی کامپیوترتان بتواند آن‌ها را به‌راحتی و بدون خطا اعمال کند.

---

### بخش ۱: بک‌اند Rust (`src-tauri/src/`)

#### ۱.۱. فایل `src-tauri/src/models.rs`

**تغییر ۱ — افزودن `done_date` به `WarmupItem` و `SetLog` و رفع رفتار دیفالت `onboarding_completed`:**
در `WarmupItem`:
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WarmupItem {
    pub id: String,
    pub text: String,
    /// Search phrase used to look up an animated demo.
    pub query: String,
    #[serde(default)]
    pub done: bool,
    /// ISO date when this warm-up item was checked off.
    #[serde(default)]
    pub done_date: Option<String>,
    /// Direct `.gif` demo. `None` = never set, `Some("")` = removed by the user.
    #[serde(default)]
    pub gif_url: Option<String>,
}
```
در `SetLog` و `impl SetLog`:
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetLog {
    /// 1-based set number.
    pub index: u32,
    pub weight: f32,
    pub reps: u32,
    pub done: bool,
    /// ISO date when this set was completed (prevents past workouts from leaking into today).
    #[serde(default)]
    pub done_date: Option<String>,
}

impl SetLog {
    pub fn new(index: u32, weight: f32, reps: u32) -> Self {
        Self {
            index,
            weight,
            reps,
            done: false,
            done_date: None,
        }
    }
}
```
در `AppStateData`:
```rust
    /// Controls the first-run setup wizard. Legacy files missing this key default to `true`.
    #[serde(default = "default_true")]
    pub onboarding_completed: bool,
```

**تغییر ۲ — اجازه حذف دائمی گیف با `"none"` و اعتبارسنجی دقیق تاریخ ISO:**
در `gif_needs_replacement`:
```rust
fn gif_needs_replacement(url: Option<&str>) -> bool {
    match url {
        None => true,
        Some(value) => {
            let trimmed = value.trim();
            if trimmed == "none" {
                return false;
            }
            trimmed.is_empty()
                || trimmed.contains("fitnessprogramer.com")
                || trimmed.contains("giphy.com")
                || trimmed.contains("imgur.com")
                || trimmed.ends_with(".svg")
        }
    }
}
```
در `is_iso_date`:
```rust
/// `YYYY-MM-DD`, validated against the real calendar.
fn is_iso_date(value: &str) -> bool {
    value.len() == 10 && chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d").is_ok()
}
```

**تغییر ۳ — رفع باگ‌های `AppStateData::normalize` و `apply_overload`:**
در `AppStateData::normalize(&mut self)`:
```rust
        // پروفایل قد و وزن‌ها (جلوگیری از تقسیم بر صفر در BMI)
        if !self.profile.height_cm.is_finite() || self.profile.height_cm <= 0.0 {
            self.profile.height_cm = 179.0;
        } else {
            self.profile.height_cm = self.profile.height_cm.clamp(120.0, 230.0);
        }
        if !self.profile.start_weight.is_finite() || self.profile.start_weight <= 0.0 {
            self.profile.start_weight = 65.0;
        }
        if !self.profile.current_weight.is_finite() || self.profile.current_weight <= 0.0 {
            self.profile.current_weight = 65.0;
        }
        if self.profile.target_weight <= 0.0 || !self.profile.target_weight.is_finite() {
            self.profile.target_weight = 75.0;
        }
```
در بخش `self.activity_history` داخل `normalize()`:
```rust
        self.activity_history.retain(|entry| !entry.date.is_empty());
        self.activity_history.sort_by(|a, b| b.date.cmp(&a.date));
        // یکتاسازی بر اساس تاریخ
        let mut seen_dates = std::collections::HashSet::new();
        self.activity_history.retain(|entry| seen_dates.insert(entry.date.clone()));
        self.activity_history.truncate(90);
        for entry in self.activity_history.iter_mut() {
            entry.water_glasses = entry.water_glasses.min(30);
            entry.diet_total = entry.diet_total.min(20);
            let max_done = if entry.diet_total == 0 { 5 } else { entry.diet_total };
            entry.diet_done = entry.diet_done.min(max_done);
        }
```
در بخش تشخیص رژیم قدیمی داخل `normalize()`:
```rust
        let legacy_exact = [
            "۳ تا ۴ عدد تخم‌مرغ کامل (ارزان‌ترین بمب پروتئین)",
            "وعده کامل سلف دانشگاه (با برنج و نان اضافه)",
        ];
        let legacy_diet = self.diet.items.is_empty()
            || self.diet.items.iter().any(|item| {
                !item.id.starts_with("ai-")
                    && !item.id.starts_with("custom-")
                    && (legacy_exact.iter().any(|exact| item.text.trim() == *exact)
                        || item.text.contains("عدسی یا خوراک سویا")
                        || item.text.contains("بمب پروتئین"))
            });
```
در حلقه `for exercise in day.exercises.iter_mut()` داخل `normalize()`:
```rust
                if gif_needs_replacement(exercise.gif_url.as_deref()) {
                    // فقط برای حرکات پیش‌فرضِ دارای فایل در بسته آفلاین مسیر ساخته شود، نه حرکات دلخواه کاربر
                    exercise.gif_url = if exercise.is_swapped() && gifs.exercises.contains_key(&exercise.id) {
                        Some(format!("/gifs/{}-alt.gif", exercise.id))
                    } else {
                        gifs.exercises.get(&exercise.id).cloned()
                    };
                }
                if exercise.is_swapped()
                    && gif_needs_replacement(exercise.original_gif_url.as_deref())
                    && gifs.exercises.contains_key(&exercise.id)
                {
                    exercise.original_gif_url = Some(format!("/gifs/{}.gif", exercise.id));
                }
```
در `apply_overload(state: &mut AppStateData)`:
```rust
pub fn apply_overload(state: &mut AppStateData) -> usize {
    let mut changed = 0usize;
    // شروع چرخه جدید افزایش وزنه، هفته ریکاوری را پایان می‌دهد تا خاموش کردن بعدی وزنه‌ها را برنگرداند
    state.deload_active = false;

    for day in state.days.iter_mut() {
        for warmup in day.warmups.iter_mut() {
            warmup.done = false;
            warmup.done_date = None;
        }
        ...
```

---

#### ۱.۲. فایل `src-tauri/src/storage.rs`

در تابع `warmup(...)`:
```rust
fn warmup(id: &str, text: &str, query: &str) -> WarmupItem {
    WarmupItem {
        id: id.to_string(),
        text: text.to_string(),
        query: query.to_string(),
        done: false,
        done_date: None,
        gif_url: None,
    }
}
```

---

#### ۱.۳. فایل `src-tauri/src/lib.rs`

در تابع `reset_to_defaults` بعد از خط `fresh.profile.workout_program_id = ...`:
```rust
    fresh.profile.workout_program_id = crate::models::default_program_id();
    fresh.profile.goal = crate::models::UserProfile::default().goal;
```

---

### بخش ۲: اسکریپت‌های نیتیو اندروید و تست‌ها (`scripts/`)

#### ۲.۱. فایل `scripts/patch-android-manifest.mjs`

اضافه کردن مجوز `RECEIVE_BOOT_COMPLETED` به آرایه `PERMISSIONS`:
```javascript
const PERMISSIONS = [
  "android.permission.POST_NOTIFICATIONS",
  "android.permission.SCHEDULE_EXACT_ALARM",
  "android.permission.USE_EXACT_ALARM",
  "android.permission.WAKE_LOCK",
  "android.permission.RECEIVE_BOOT_COMPLETED",
];
```

---

#### ۲.۲. فایل `scripts/setup-android-native.mjs`

**تغییر ۱ — رسیدگی به `BOOT_COMPLETED` و پاک کردن تیک غذاهای دیروز در `WaterBroadcastReceiver.kt`:**
در `onReceive`:
```kotlin
    override fun onReceive(context: Context, intent: Intent?) {
        when (intent?.action) {
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED -> {
                restoreAlarmOnBoot(context)
            }

            ACTION_SHOW_REMINDER -> {
                ...
```
افزودن متد `restoreAlarmOnBoot(context)` کنار `rescheduleFromState(context)`:
```kotlin
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
```
و در `incrementWaterInStateFile(context)` هنگام تغییر روز (ریست نیمه‌شب):
```kotlin
            val day = today()
            if (diet.optString("lastResetDate", day) != day) {
                diet.put("lastResetDate", day)
                diet.put("waterGlasses", 0)
                // تیک وعده‌های دیروز هم باید پاک شود تا ensureDailyDietReset بعداً گمراه نشود
                val items = diet.optJSONArray("items")
                if (items != null) {
                    for (index in 0 until items.length()) {
                        items.optJSONObject(index)?.put("done", false)
                    }
                }
            }
```

**تغییر ۲ — رجیستر کردن `BOOT_COMPLETED` برای `WaterBroadcastReceiver` در `AndroidManifest.xml` (بخش تولید مانیفست):**
در قسمت `if (!manifest.includes("WaterBroadcastReceiver"))`:
```javascript
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
```
*(نکته: اگر در CI وجود داشت یا از قبل با `exported="false"` بود، می‌توان چک کرد اگر `BOOT_COMPLETED` نبود آن تگ را به‌روزرسانی کند).*

**تغییر ۳ — بازگرداندن نام واقعی فایل در `saveBackupToDownloads` و ایمن‌سازی `shareBackupFile` در `MainActivity.kt`:**
در `saveBackupToDownloads`:
```kotlin
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
            return "/storage/emulated/0/Download/$actualName"
```
در `shareBackupFile`:
```kotlin
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
```

---

#### ۲.۳. فایل `scripts/gen-android-icons.mjs`

قبل از نوشتن PNGها در حلقه `for (const dir of targets)`:
```javascript
for (const dir of targets) {
  for (const { name, launcher, round, foreground } of results) {
    // حذف فایل‌های webp قبلی تauri تا aapt2 خطای Duplicate resource ندهد
    for (const oldFile of ["ic_launcher.webp", "ic_launcher_round.webp", "ic_launcher_foreground.webp"]) {
      const p = path.join(dir, `mipmap-${name}`, oldFile);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    writeRes(dir, path.join(`mipmap-${name}`, "ic_launcher.png"), encodePng(launcher));
    writeRes(dir, path.join(`mipmap-${name}`, "ic_launcher_round.png"), encodePng(round));
    writeRes(dir, path.join(`mipmap-${name}`, "ic_launcher_foreground.png"), encodePng(foreground));
  }
  const legacyFgXml = path.join(dir, "drawable-v24", "ic_launcher_foreground.xml");
  if (fs.existsSync(legacyFgXml)) fs.unlinkSync(legacyFgXml);
  ...
```

---

#### ۲.۴. اصلاح اسکریپت‌های `scripts/serve-dist.mjs`, `scripts/verify-ui.mjs`, `scripts/dump-code.mjs`, `scripts/e2e-swap-quiet.mjs`, `scripts/e2e-v5.mjs`, `scripts/e2e-water.mjs`

1. **`scripts/serve-dist.mjs`:**
```javascript
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".gif": "image/gif",
  ".mp3": "audio/mpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".json": "application/json",
};
```
و خط ۲۲:
```javascript
if (file !== root && !file.startsWith(root + path.sep)) file = path.join(root, "index.html");
```

2. **`scripts/verify-ui.mjs`:**
بخش تب‌ها و منوی حرکت:
```javascript
// Tab navigation (5 tabs)
for (const [index, name] of ["02-progress", "03-nutrition", "04-uni", "05-coach"].entries()) {
  const buttons = await page.$$("#nav-slot nav button");
  await buttons[index + 1].click();
  await new Promise((r) => setTimeout(r, 600));
  await shot(name);
}
```
و بخش منوی حرکت:
```javascript
const cards = await page.$$("[data-exercise]");
if (cards.length > 0) {
  const menuBtn = await cards[0].$('.btn-icon[aria-label="گزینه‌های حرکت"]');
  if (menuBtn) {
    await menuBtn.click();
    await new Promise((r) => setTimeout(r, 500));
    await shot("07-exercise-menu");
    await page.keyboard.press("Escape");
  }
}
```

3. **`scripts/dump-code.mjs`:**
در تابع `collect`:
```javascript
      if (entry.isDirectory()) {
        if (inExcludedDir(rel)) continue;
        walk(abs);
        continue;
      }
      // داخل src-tauri/icons فقط فایل‌های باینری را نادیده بگیر و icon.svg را نگه دار
      if (rel.startsWith("src-tauri/icons/") && path.extname(rel).toLowerCase() !== ".svg") continue;
```

4. **`scripts/e2e-swap-quiet.mjs`:**
در خط ۱۳۹ (بعد از باز کردن مودال جایگزین):
```javascript
  // Swap again, then pretend it happened yesterday.
  await (await page.$('button[aria-label="حرکت جایگزین"]')).click();
  await wait(500);
  const quickAgain = await page.$('button[aria-label="جایگزین پیشنهادی"]');
  if (quickAgain) await quickAgain.click();
  await wait(700);
  await patchStateOnReload(page, 'state.days[0].exercises[0].swappedDate = "2020-01-01";');
```

5. **`scripts/e2e-water.mjs`:**
در تابع `countdownSeconds` (پشتیبانی از `H:MM:SS` در بازه خواب شبانه):
```javascript
    const match = /(?:(\d+):)?(\d+):(\d+)/.exec(text);
    if (!match) return -1;
    const hours = match[1] ? Number(match[1]) : 0;
    return hours * 3600 + Number(match[2]) * 60 + Number(match[3]);
```

6. **`scripts/e2e-v5.mjs`:**
- در بخش ۳ (هفته خودکار، خط ۲۱۱): به‌جای `before.semesterWeekAnchorDate === null`, بررسی کند که مقدار به شنبه همین هفته مقداردهی شده است (`typeof before.semesterWeekAnchorDate === "string" && before.semesterWeekAnchorDate.length === 10`).
- در بخش ۷ (Double Progression، خط ۴۹۶): بررسی کند که بازه تکرار حفظ شده است (`String(after.reps) === String(beforeExercise.reps)`) به‌جای حذف خط تیره.

---

### بخش ۳: لایه تایپ‌ها، داده‌ها و پایه فرانت‌اند (`src/types.ts`, `src/data/`, `src/lib/`)

#### ۳.۱. فایل `src/types.ts`

به `WarmupItem` و `SetLog` فیلد تاریخ اضافه کنید:
```typescript
export interface WarmupItem {
  id: string;
  text: string;
  query: string;
  done: boolean;
  doneDate?: string | null;
  gifUrl?: string | null;
}

export interface SetLog {
  index: number;
  weight: number;
  reps: number;
  done: boolean;
  doneDate?: string | null;
}
```

---

#### ۳.۲. فایل `src/data/seed.ts`

در `w(...)` و `ex(...)`:
```typescript
const w = (id: string, text: string, query: string): WarmupItem => ({
  id,
  text,
  query,
  done: false,
  doneDate: null,
  gifUrl: null,
});
```
و داخل `ex(...)`:
```typescript
  const logs: SetLog[] = Array.from({ length: sets }, (_, i) => ({
    index: i + 1,
    weight: targetWeight,
    reps: firstReps,
    done: false,
    doneDate: null,
  }));
```

---

#### ۳.۳. فایل `src/data/programs.ts`

**رفع تکرار ID حرکات بین روزها در `ppl-6` و `dorm-daily`:**
افزودن یک پارامتر اختیاری `idOverride` به تابع `pick`:
```typescript
function pick(base: WorkoutDay[], dayIndex: number, exIndex: number, idOverride?: string): Exercise {
  const exercise = clone(base[dayIndex].exercises[exIndex]);
  exercise.gifUrl = exercise.gifUrl || exerciseGifs[exercise.id] || null;
  if (idOverride) exercise.id = idOverride;
  exercise.logs = syncLogs(exercise);
  return exercise;
}
```
در برنامه `ppl-6`:
- در `ppl-4` (Push B):
  `pick(base, 2, 0, "ppl4-d3e1")`, `pick(base, 2, 2)`, `pick(base, 0, 0, "ppl4-d1e1")`, `pick(base, 0, 4, "ppl4-d1e5")`, `pick(base, 2, 6)`
- در `ppl-5` (Pull B):
  `pick(base, 2, 3)`, `pick(base, 2, 1)`, `pick(base, 2, 4, "ppl5-d3e5")`, `pick(base, 2, 5)`, `pick(base, 1, 5)`

در برنامه `dorm-daily`:
- `pushUp.id = "dorm-pushup";`
- `squat.id = "dorm-squat";`
- در `dorm-1`: `pick(base, 1, 5, "dorm1-d2e6")`
- در `dorm-2`: `pick(base, 1, 5, "dorm2-d2e6")`

---

#### ۳.۴. فایل `src/data/dietTemplates.ts`

رفع تشخیص الگوی فعال در `activeDietTemplateId(items)`:
```typescript
/** Identifies the active template even when a student deletes one meal (e.g. breakfast). */
export function activeDietTemplateId(items: DietItem[]): string {
  const coreTexts = items
    .filter((entry) => !entry.id.startsWith("custom-") && entry.id !== "diet-4" && entry.id !== "diet-5")
    .map((entry) => entry.text.trim())
    .filter(Boolean);
  if (coreTexts.length === 0) return "custom";

  for (const template of DIET_TEMPLATES) {
    const templateTexts = new Set(
      template
        .build()
        .filter((entry) => entry.id !== "diet-4" && entry.id !== "diet-5")
        .map((entry) => entry.text.trim()),
    );
    if (coreTexts.every((text) => templateTexts.has(text))) return template.id;
  }
  return "custom";
}
```

---

#### ۳.۵. فایل `src/lib/fa.ts`

**تغییر ۱ — رفع صفر اضافی در `faNum` و علامت `۰` در `faSigned`:**
```typescript
export function faNum(value: number, digits = 0): string {
  const fixed = digits > 0 ? value.toFixed(digits) : String(Math.round(value));
  const trimmed =
    digits > 0
      ? fixed.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "")
      : fixed;
  return fa(trimmed.replace(".", "٫"));
}
```
```typescript
export function faSigned(value: number, digits = 1): string {
  if (Math.abs(value) < (digits > 0 ? 0.05 : 0.5)) return "۰";
  const sign = value > 0 ? "+" : "−";
  return `\u200E${sign}${faNum(Math.abs(value), digits)}`;
}
```

**تغییر ۲ — نمایش ساعت در `clock(totalSeconds)` وقتی بالای ۶۰ دقیقه است:**
```typescript
export function clock(totalSeconds: number): string {
  const safe = Math.max(0, Math.ceil(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
```

**تغییر ۳ — تبدیل ارقام عربی `٠-٩` در `makePersianNumericInput`:**
داخل حلقه `for` در `rewrite`:
```typescript
      if (ch >= "0" && ch <= "9") kept = FA_DIGITS[Number(ch)];
      else if (/[۰-۹]/.test(ch)) kept = ch;
      else if (/[٠-٩]/.test(ch)) kept = FA_DIGITS[ch.charCodeAt(0) - 0x0660];
      else if (decimals && (ch === "." || ch === "٫")) {
```

---

#### ۳.۶. فایل `src/lib/api.ts`

در `loadState()` حذف fallback خطرناک به `localLoad()` در خطای Tauri:
```typescript
export async function loadState(): Promise<AppStateData> {
  if (isTauri()) {
    const state = await invoke<AppStateData>("get_app_state");
    return normalizeState(state);
  }
  return localLoad();
}
```

---

#### ۳.۷. فایل `src/lib/localBackend.ts`

1. در ایمپورت‌ها: `import { en, fa, firstNumber, localDateFromIso } from "./fa";`
2. در `gifNeedsReplacement`:
```typescript
function gifNeedsReplacement(url: string | null | undefined): boolean {
  if (!url) return true;
  const value = url.trim();
  if (value === "none") return false;
  return (
    value.length === 0 ||
    value.includes("fitnessprogramer.com") ||
    value.includes("giphy.com") ||
    value.includes("imgur.com") ||
    value.endsWith(".svg")
  );
}
```
3. در `isLegacyDiet`:
```typescript
export function isLegacyDiet(items: unknown): boolean {
  if (!Array.isArray(items) || items.length === 0) return true;
  const exactLegacy = new Set([
    "۳ تا ۴ عدد تخم‌مرغ کامل (ارزان‌ترین بمب پروتئین)",
    "وعده کامل سلف دانشگاه (با برنج و نان اضافه)",
  ]);
  return items.some((row) => {
    if (!row || typeof row.text !== "string") return false;
    const id = typeof row.id === "string" ? row.id : "";
    if (id.startsWith("ai-") || id.startsWith("custom-")) return false;
    const text = row.text.trim();
    return (
      exactLegacy.has(text) ||
      text.includes("بمب پروتئین") ||
      text.includes("عدسی یا خوراک سویا")
    );
  });
}
```
4. در `normalizeState(input)`:
   - یکتاسازی و clamp `activityHistory`:
     ```typescript
     const seenActivityDates = new Set<string>();
     state.activityHistory = (Array.isArray(state.activityHistory) ? state.activityHistory : [])
       .filter((entry) => entry && typeof entry.date === "string" && entry.date.length > 0)
       .sort((a, b) => b.date.localeCompare(a.date))
       .filter((entry) => {
         if (seenActivityDates.has(entry.date)) return false;
         seenActivityDates.add(entry.date);
         return true;
       })
       .slice(0, 90)
       .map((entry) => {
         const dietTotal = Math.min(20, Math.max(0, Number(entry.dietTotal) || 0));
         const maxDone = dietTotal === 0 ? 5 : dietTotal;
         return {
           ...entry,
           waterGlasses: Math.min(30, Math.max(0, Number(entry.waterGlasses) || 0)),
           dietTotal,
           dietDone: Math.min(maxDone, Math.max(0, Number(entry.dietDone) || 0)),
         };
       });
     ```
   - اعتبارسنجی قد و وزن‌ها در `state.profile`:
     ```typescript
     if (!Number.isFinite(state.profile.heightCm) || state.profile.heightCm <= 0) {
       state.profile.heightCm = 179;
     } else {
       state.profile.heightCm = Math.min(230, Math.max(120, state.profile.heightCm));
     }
     if (!Number.isFinite(state.profile.targetWeight) || state.profile.targetWeight <= 0) {
       state.profile.targetWeight = 75;
     }
     ```
   - اگر `state.days.length === 0` باشد مثل Rust فقط `return state;` (یا در `if (state.days.length === 0) return state;`) تا کل اطلاعات کاربر در حالت `uni_only` پاک نشود.
   - اعتبارسنجی دقیق‌تر تاریخ و اصلاح `endTime <= startTime` در دروس:
     ```typescript
     const isIsoCalendarDate = (val: unknown): val is string => {
       if (typeof val !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(val)) return false;
       const [y, m, d] = val.split("-").map(Number);
       const dt = localDateFromIso(val);
       return dt.getFullYear() === y && dt.getMonth() + 1 === m && dt.getDate() === d;
     };
     ```
     (استفاده از `isIsoCalendarDate(state.semesterWeekAnchorDate)` به جای چک ساده regex).
     و در بخش `state.courses`:
     ```typescript
     const start = hhmm(course.startTime, "09:00");
     let end = hhmm(course.endTime, "11:00");
     if (end <= start) {
       const [sh, sm] = start.split(":").map(Number);
       const total = Math.min(23 * 60 + 59, sh * 60 + sm + 120);
       end = `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
     }
     ```
   - در حلقه `exercise` داخل `normalizeState`:
     فقط وقتی `exercise.id in exerciseGifs` باشد مسیر `/gifs/${exercise.id}-alt.gif` یا `/gifs/${exercise.id}.gif` ساخته شود:
     ```typescript
     if (gifNeedsReplacement(exercise.gifUrl)) {
       const swapped = Boolean(exercise.swappedDate && exercise.originalName);
       exercise.gifUrl =
         swapped && exercise.id in exerciseGifs
           ? `/gifs/${exercise.id}-alt.gif`
           : (exerciseGifs[exercise.id] ?? null);
     }
     if (
       exercise.swappedDate &&
       exercise.originalName &&
       gifNeedsReplacement(exercise.originalGifUrl) &&
       exercise.id in exerciseGifs
     ) {
       exercise.originalGifUrl = `/gifs/${exercise.id}.gif`;
     }
     ```
   - در `syncLogs`:
     ```typescript
     rows.push(
       found ?? {
         index: i,
         weight: exercise.targetWeight,
         reps: fallbackReps,
         done: false,
         doneDate: null,
       },
     );
     ```
   - در `localApplyOverload`:
     ```typescript
     state.deloadActive = false;
     for (const day of state.days) {
       for (const warmup of day.warmups) {
         warmup.done = false;
         warmup.doneDate = null;
       }
     ```
   - در `localReset`:
     ```typescript
     fresh.profile.workoutProgramId = "upper-lower-4";
     fresh.profile.goal = createSeedState().profile.goal;
     ```

---

#### ۳.۸. فایل `src/lib/store.ts`

1. رفع Race Condition در `flushNow()`:
```typescript
let saveTimer: number | null = null;
let inflightFlush: Promise<void> | null = null;
let queued = false;
```
```typescript
export async function flushNow(): Promise<void> {
  if (!state) return;
  if (inflightFlush) {
    queued = true;
    await inflightFlush;
    if (inflightFlush) await inflightFlush;
    return;
  }
  inflightFlush = (async () => {
    try {
      await saveState(state!);
    } catch (error) {
      console.error("failed to persist app state", error);
    } finally {
      inflightFlush = null;
    }
  })();
  await inflightFlush;
  if (queued) {
    queued = false;
    await flushNow();
  }
}
```
2. رفع نشت تمرین روزهای قبل در `syncTodayActivity()` و افزودن `clearTodayWorkoutActivity()`:
```typescript
export function syncTodayActivity(): boolean {
  if (!state) return false;
  const current = state;
  const today = isoToday();

  if (!Array.isArray(current.activityHistory)) current.activityHistory = [];

  const activeDayObj = current.days[current.activeDay];
  const isDoneToday = (done: boolean, doneDate?: string | null) =>
    done && doneDate === today;

  const workedDays = current.days.filter(
    (day) =>
      day.exercises.some((exercise) =>
        exercise.logs.some((log) => isDoneToday(log.done, log.doneDate)),
      ) || day.warmups.some((warmup) => isDoneToday(warmup.done, warmup.doneDate)),
  );
  const targetDay =
    workedDays.find((day) => day.id === activeDayObj?.id) ?? workedDays[0] ?? activeDayObj;

  const completedExercises: string[] = [];
  let setsDone = 0;
  let warmupsDone = 0;

  for (const day of workedDays) {
    warmupsDone += day.warmups.filter((warmup) =>
      isDoneToday(warmup.done, warmup.doneDate),
    ).length;
    for (const exercise of day.exercises) {
      const doneCount = exercise.logs.filter((log) =>
        isDoneToday(log.done, log.doneDate),
      ).length;
      if (doneCount === 0) continue;
      setsDone += doneCount;
      const prefix = workedDays.length > 1 ? `${day.label} • ` : "";
      completedExercises.push(`${prefix}${exercise.name} (${fa(doneCount)} ست)`);
    }
  }
  ...
```
و پس از `syncTodayActivity()`, تابع زیر را هم export کنید تا در صورت برداشتن دستی همه تیک‌های امروز (برخلاف `restartDay`), رکورد شبح روی تقویم نماند:
```typescript
/** Clears today's workout block only when the user manually unticked every set/warmup done today. */
export function clearTodayWorkoutActivity(): void {
  if (!state) return;
  const today = isoToday();
  const anyDoneToday = state.days.some(
    (day) =>
      day.exercises.some((ex) => ex.logs.some((log) => log.done && log.doneDate === today)) ||
      day.warmups.some((wu) => wu.done && wu.doneDate === today),
  );
  if (anyDoneToday) return;
  const entry = state.activityHistory.find((item) => item.date === today);
  if (!entry) return;
  entry.workoutTitle = "";
  entry.completedExercises = [];
  entry.setsDone = 0;
  entry.warmupsDone = 0;
  persist(0);
}
```

---

#### ۳.۹. فایل `src/lib/appSettings.ts`

ایمپورت و پاک‌سازی حالت دلود هنگام تغییر برنامه یا پروفایل پیش‌فرض:
```typescript
import { clearDeloadSnapshot } from "./workoutTools";
```
در `applyProgram`:
```typescript
  state.days = program.buildDays();
  state.activeDay = 0;
  state.restSeconds = program.restSeconds;
  state.profile.goal = program.goalLabel;
  state.profile.workoutProgramId = program.id;
  state.deloadActive = false;
  clearDeloadSnapshot();
  return true;
```
در `applyDeveloperPreset`:
```typescript
  state.appMode = "full";
  state.onboardingCompleted = true;
  state.deloadActive = false;
  state.readiness = "normal";
  clearDeloadSnapshot();
```

---

#### ۳.۱۰. فایل `src/lib/notify.ts`

1. Export کردن تابع غیرتعاملی بررسی مجوز:
```typescript
export async function hasNotificationPermission(): Promise<boolean> {
  return canPost();
}
```
2. افزودن زمان‌بندی نوتیفیکیشن یک‌باره برای تایمرهای استراحت، هوازی و مطالعه (وقتی صفحه قفل می‌شود):
```typescript
export const REST_TIMER_NOTIF_ID = 7801;
export const CARDIO_TIMER_NOTIF_ID = 7802;
export const LANG_TIMER_NOTIF_ID = 7803;

export async function scheduleOneShotNotification(
  id: number,
  title: string,
  body: string,
  triggerAtMs: number,
): Promise<void> {
  if (!isTauri() || !Number.isFinite(triggerAtMs) || triggerAtMs <= Date.now() + 1000) return;
  if (!(await canPost())) return;
  try {
    await ensureChannel();
    await cancel([id]).catch(() => undefined);
    sendNotification({
      id,
      channelId: CHANNEL_ID,
      title,
      body,
      schedule: Schedule.at(new Date(triggerAtMs), false, true),
    });
  } catch (error) {
    console.warn("one-shot notification unavailable", error);
  }
}
```
3. در `initNotificationActions`: برگرداندن کانال بعد از آماده شدن و اطمینان از عدم تداخل (کافی است در `main.ts` قبل از `restoreWaterReminderOnBoot` صبر کنیم تا تمام شود).

---

#### ۳.۱۱. فایل `src/lib/navigation.ts`

رفع باگ‌های مودال‌های تودرتو و دابل‌کلیک برگشت به تب خانه:
```typescript
let pendingReleases = 0;
let releaseScheduled = false;

export function isTopOverlay(id: string): boolean {
  return stack.length > 0 && stack[stack.length - 1].id === id;
}

export function releaseOverlay(id: string): void {
  const index = stack.findIndex((entry) => entry.id === id);
  if (index === -1) return;
  stack.splice(index, 1);

  pendingReleases += 1;
  if (!releaseScheduled) {
    releaseScheduled = true;
    queueMicrotask(() => {
      releaseScheduled = false;
      const steps = pendingReleases;
      pendingReleases = 0;
      if (steps <= 0) return;
      const st = history.state as { overlay?: string } | null;
      if (st?.overlay) {
        suppressed += 1;
        history.go(-steps);
      }
    });
  }
}

export function pushTab(tab: string, homeTabId?: string): void {
  const state = history.state as { tab?: string } | null;
  if (homeTabId && tab === homeTabId) {
    if (state?.tab) {
      suppressed += 1;
      history.back();
    }
    return;
  }
  if (state?.tab) history.replaceState({ tab }, "");
  else history.pushState({ tab }, "");
}
```

---

#### ۳.۱۲. فایل `src/lib/workoutTools.ts`

**تغییر ۱ — محدود کردن WakeLock به حالت ورزشی (غیرفعال در `uni_only`):**
```typescript
export async function requestGymWakeLock(): Promise<void> {
  try {
    if (getState().appMode === "uni_only") return;
  } catch {
    /* before initState */
  }
  if (!wakeLockDesired || wakeLockSentinel) return;
  ...
```
افزودن تابع همگام‌سازی WakeLock هنگام تغییر `appMode`:
```typescript
export async function syncWakeLockWithMode(): Promise<void> {
  try {
    if (getState().appMode === "uni_only") {
      try {
        await wakeLockSentinel?.release();
      } catch {
        /* already released */
      }
      wakeLockSentinel = null;
      return;
    }
  } catch {
    return;
  }
  await requestGymWakeLock();
}
```

**تغییر ۲ — رفع باگ تشخیص عضله `d3e5` (`پشت سرشانه` -> `shoulders` نه `triceps`) و پشتیبانی از prefixهای `ppl4-`/`ppl5-`/`dorm1-`/`dorm2-`:**
1. در `MUSCLE_KEYWORDS` در بخش `triceps`, `"پشت سر"` را به `"از پشت سر"` تغییر دهید:
```typescript
  [
    "triceps",
    [
      "پشت بازو",
      "پشت\u200cبازو",
      "دیپ پشت بازو",
      "دیپ",
      "از پشت سر",
      "tricep",
      "pushdown",
      "skull crusher",
    ],
  ],
```
2. در `EXERCISE_MUSCLE_MAP` IDهای برنامه خوابگاهی را هم اضافه کنید و تابع کمک‌کننده `baseExerciseId` بسازید:
```typescript
const baseExerciseId = (id: string): string =>
  id.replace(/^(ppl\d+|dorm\d+)-/, "");
```
و در `EXERCISE_MUSCLE_MAP`:
```typescript
  "dorm-pushup": "chest",
  "dorm-squat": "quads",
```
3. در `originalGifFor`, `swapBusyExercise`, و `guessMuscleKey` از `const baseId = baseExerciseId(exercise.id);` استفاده کنید:
- در `originalGifFor`: `return EXERCISE_GIFS[baseId] ?? null;`
- در `swapBusyExercise`: `const alt = ALTERNATIVE_MOVES[baseId];` و فقط اگر `baseId in EXERCISE_GIFS` بود `exercise.gifUrl = "/gifs/${baseId}-alt.gif";` (وگرنه `exercise.gifUrl = null` برای حرکات دلخواه بدون گیف).
- در `guessMuscleKey`: `if (EXERCISE_MUSCLE_MAP[baseId]) return EXERCISE_MUSCLE_MAP[baseId];`.

**تغییر ۳ — export کردن `clearDeloadSnapshot`:**
```typescript
export function clearDeloadSnapshot(): void {
  writeDeloadSnapshot(null);
}
```

---

#### ۳.۱۳. فایل `src/lib/uniShare.ts`

1. جایگزینی کپی دستی با `copyText` از `./clipboard`:
```typescript
import { copyText } from "./clipboard";
import { pruneBusAlarms } from "../views/uni";
```
در `copyShareJson`:
```typescript
export async function copyShareJson(scope: UniShareScope): Promise<void> {
  const json = JSON.stringify(sharePayload(scope));
  const copied = await copyText(json);
  if (copied) toast(`JSON ${scopeNoun(scope)} کپی شد؛ برای هم‌دانشگاهی‌ها بفرست.`);
  else openShareJsonModal(json, "export", scope);
}
```
2. در `applyShareJson`:
- اعتبارسنجی `startTime` و `endTime` دروس با `/^([01]\d|2[0-3]):[0-5]\d$/` و اصلاح `endTime <= startTime`.
- در شاخه `"shuttle"` پذیرش هم فرمت `{ customShuttleJson }` و هم فرمت خام `{ railway, suburbs }` (خروجی AI)، و اجرای `void pruneBusAlarms()` پس از تغییر سرویس‌ها:
```typescript
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
```
داخل `courses.map`:
```typescript
          const startTime = HHMM_RE.test(String(course.startTime)) ? String(course.startTime) : "09:00";
          let endTime = HHMM_RE.test(String(course.endTime)) ? String(course.endTime) : "11:00";
          if (endTime <= startTime) {
            const [sh, sm] = startTime.split(":").map(Number);
            const total = Math.min(23 * 60 + 59, sh * 60 + sm + 120);
            endTime = `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
          }
```
در بخش `else if` مربوط به `shuttle`:
```typescript
  } else if (data.customShuttleJson === null) {
    state.customShuttleJson = null;
    changed = true;
  } else if (
    typeof data.customShuttleJson === "string" &&
    parseShuttleJson(data.customShuttleJson)
  ) {
    state.customShuttleJson = data.customShuttleJson.trim();
    changed = true;
  } else if (parseShuttleJson(raw)) {
    state.customShuttleJson = raw.trim();
    changed = true;
  }
```
و بعد از `persist(0);`:
```typescript
  if (scope === "shuttle") void pruneBusAlarms();
```

---

### بخش ۴: کامپوننت‌ها (`src/components/`)

#### ۴.۱. فایل `src/components/ui.ts`

رفع باگ کلید `Escape` برای مودال‌های تودرتو با بررسی `isTopOverlay`:
```typescript
import { isTopOverlay, pushOverlay, releaseOverlay } from "../lib/navigation";
```
در `openModal`:
```typescript
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape" && isTopOverlay(overlayId)) handle.close();
  };
```

---

#### ۴.۲. فایل `src/components/restTimer.ts`

زمان‌بندی و لغو نوتیفیکیشن پس‌زمینه برای تایمر استراحت (`REST_TIMER_NOTIF_ID`):
```typescript
import {
  REST_TIMER_NOTIF_ID,
  cancelNotifications,
  pushSystemNotification,
  scheduleOneShotNotification,
} from "../lib/notify";
```
- در `restTimer.onDone`:
  `void cancelNotifications([REST_TIMER_NOTIF_ID]);` (قبل از `pushSystemNotification` تا تکراری نشود).
- در `startRest`:
  `void scheduleOneShotNotification(REST_TIMER_NOTIF_ID, "استراحت تمام شد", "زمان اجرای ست بعدی است.", Date.now() + total * 1000);`
- در `stopRest`:
  `void cancelNotifications([REST_TIMER_NOTIF_ID]);`
- در `bumpRest`:
  اگر `restTimer.running` است و `restTimer.remaining > 1`:
  `void scheduleOneShotNotification(REST_TIMER_NOTIF_ID, "استراحت تمام شد", "زمان اجرای ست بعدی است.", Date.now() + restTimer.remaining * 1000);`

---

#### ۴.۳. فایل `src/components/shell.ts`

1. رفع نوار پیشرفت بالای هدر برای هدف کاهش وزن (`targetWeight < startWeight`):
```typescript
  const isLoss = profile.targetWeight < profile.startWeight;
  const span = Math.abs(profile.targetWeight - profile.startWeight);
  const changed = isLoss
    ? profile.startWeight - profile.currentWeight
    : profile.currentWeight - profile.startWeight;
  const percent = span < 0.1 ? 100 : Math.min(100, Math.max(0, (changed / span) * 100));
```
2. در `renderNav()` به `pushTab` تب خانه را هم بدهید و اسکرول را `instant` کنید:
```typescript
import { getActiveTab, getState, homeTab, persist, requestRender, setActiveTab, setState, visibleTabs } from "../lib/store";
```
```typescript
    button.addEventListener("click", () => {
      if (getActiveTab() === item.id) return;
      pushTab(item.id, homeTab(getState().appMode));
      setActiveTab(item.id);
      requestRender();
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    });
```

---

#### ۴.۴. فایل `src/components/onboarding.ts`

1. هنگام ذخیره در ویزارد، `startWeight` کاربر قدیمی بازنویسی نشود (فقط در نصب اول ست شود)، تغییر وزن در `weightHistory` بنشیند و WakeLock همگام شود:
```typescript
import { isoToday } from "../lib/fa";
import { syncWakeLockWithMode } from "../lib/workoutTools";
```
در `saveBtn`:
```typescript
      const isFirstRun = !state.onboardingCompleted;
      state.appMode = appMode;
      state.profile.name = nameInput.value.trim() || "کاربر";
      state.profile.universityName = uniInput.value.trim() || "دانشگاه من";
      state.profile.currentWeight = currentWeight;
      if (isFirstRun) {
        state.profile.startWeight = currentWeight;
      }
      state.profile.targetWeight = targetWeight;
      state.profile.heightCm = heightCm;
      state.profile.age = age;

      const today = isoToday();
      const existingWeight = state.weightHistory.find((entry) => entry.date === today);
      if (existingWeight) existingWeight.weight = currentWeight;
      else if (state.weightHistory.length === 0 || isFirstRun) {
        state.weightHistory = [{ date: today, weight: currentWeight }];
      } else {
        state.weightHistory.push({ date: today, weight: currentWeight });
      }
```
و پس از `persist(0);`:
```typescript
      void syncWakeLockWithMode();
```
و در دکمه پیش‌فرض توسعه‌دهنده (`applyDeveloperPreset`):
```typescript
        void syncWakeLockWithMode();
```

---

#### ۴.۵. فایل `src/components/doubleProgression.ts`

1. حفظ بازه تکرار هنگام افزایش وزنه + امتیازدهی درست حرکات وزن بدن در `topSet` + پشتیبانی از `onAfterClose`:
```typescript
function topSet(exercise: Exercise): { weight: number; reps: number } | null {
  const done = exercise.logs.filter((log) => log.done);
  if (done.length === 0) return null;
  const score = (log: { weight: number; reps: number }) =>
    log.weight > 0 ? log.weight * log.reps : log.reps;
  const best = done.reduce((acc, log) => (score(log) > score(acc) ? log : acc), done[0]);
  return { weight: best.weight, reps: best.reps };
}
```
در `applyChoice`:
```typescript
  if (choice === "weight" && !bodyweight) {
    exercise.targetWeight = roundStep(exercise.targetWeight + WEIGHT_STEP);
    // حفظ دامنه تکرار (مثلاً ۸ تا ۱۲) به‌جای پاک کردن سقف دامنه
    const floorReps = bottomOfRange(range);
    for (const log of exercise.logs) {
      if (!log.done) log.reps = floorReps;
    }
    logMilestone(
      `${exercise.name}: وزنه به ${faNum(exercise.targetWeight, 1)} کیلوگرم رفت (بازه ${faReps(range)}، شروع از ${fa(floorReps)}).`,
    );
    toast(`${exercise.name}: ${faNum(exercise.targetWeight, 1)} کیلو × ${fa(floorReps)} تکرار برای جلسه بعد.`);
  }
```
در `openDoubleProgressionModal`:
```typescript
export function openDoubleProgressionModal(
  exercise: Exercise,
  suggestWeight: boolean,
  onAfterClose?: () => void,
): void {
```
در تنظیمات `openModal` داخل آن:
```typescript
  let choseOption = false;
  ...
  // هنگام کلیک روی option: choseOption = true; applyChoice(...); handle.close();
  const handle = openModal({
    title: "پله بعدی این حرکت",
    subtitle: "افزایش تدریجی دو مرحله‌ای",
    body,
    footer: btn("btn-ghost w-full", "بعداً", () => handle.close()),
    onClose: () => onAfterClose?.(),
  });
```
*(توجه: متغیر `choseOption` لازم نیست اگر `onAfterClose` در هر صورت بعد از بستن مودال اجرا شود تا جشن پایان تمرین نمایش داده شود).*

---

#### ۴.۶. فایل `src/components/exerciseHistory.ts`

1. در `recordExerciseHistory`: امتیازدهی درست حرکات وزن بدن (`weight <= 0`):
```typescript
  const score = (log: { weight: number; reps: number }) =>
    log.weight > 0 ? log.weight * log.reps : log.reps;
  const top = done.reduce((best, log) => (score(log) > score(best) ? log : best), done[0]);
```
2. در `chartSvg` و `openExerciseHistoryModal`: رسم تکرارها به‌جای صفر برای حرکات وزن بدن:
```typescript
function chartSvg(entries: ExerciseHistoryEntry[], useReps = false): string {
  ...
  const values = entries.map((row) => (useReps ? row.reps : row.weight));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min < 0.01 ? 1 : max - min;
  const stepX = entries.length > 1 ? (width - pad * 2) / (entries.length - 1) : 0;

  const points = entries.map((row, index) => {
    const val = useReps ? row.reps : row.weight;
    const x = pad + index * stepX;
    const y = height - pad - ((val - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });
```
در `openExerciseHistoryModal`:
```typescript
  const isBodyweight = exercise.bodyweight || entries.every((row) => row.weight <= 0);
  if (entries.length > 0) {
    const first = entries[0];
    const last = entries[entries.length - 1];
    const delta = isBodyweight ? last.reps - first.reps : last.weight - first.weight;
    ...
    summary.append(
      cell(
        isBodyweight ? "بهترین تکرار" : "بهترین وزن",
        isBodyweight
          ? fa(Math.max(...entries.map((r) => r.reps)))
          : `${faNum(Math.max(...entries.map((r) => r.weight)), 1)}`,
        "text-emerald-300",
      ),
      cell("جلسات", fa(entries.length), "text-slate-100"),
      cell(
        isBodyweight ? "تغییر تکرار" : "تغییر وزن",
        `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${isBodyweight ? fa(Math.abs(delta)) : faNum(Math.abs(delta), 1)}`,
        delta > 0 ? "text-emerald-300" : delta < 0 ? "text-rose-300" : "text-slate-400",
      ),
    );
```
و هنگام ساخت نمودار:
```typescript
      chart.innerHTML = chartSvg(entries, isBodyweight);
```

---

#### ۴.۷. فایل `src/components/exerciseCatalogPicker.ts`

نرمال‌سازی نیم‌فاصله و حروف عربی در جستجو:
```typescript
const normalizeSearch = (value: string): string =>
  value
    .toLowerCase()
    .replace(/\u200c/g, " ")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\s+/g, " ")
    .trim();
```
در `searchInput.addEventListener("input", ...)`:
```typescript
  searchInput.addEventListener("input", () => {
    query = normalizeSearch(searchInput.value);
    paintGrid();
  });
```
در `matches(item)`:
```typescript
  const matches = (item: CatalogExercise) => {
    if (muscle !== ALL_KEY && item.muscleKey !== muscle) return false;
    if (!query) return true;
    return (
      normalizeSearch(item.name).includes(query) ||
      item.english.toLowerCase().includes(query) ||
      normalizeSearch(item.equipment).includes(query) ||
      normalizeSearch(item.muscle).includes(query)
    );
  };
```

---

#### ۴.۸. فایل `src/components/gifModal.ts`

پشتیبانی از حذف دائمی گیف (`"none"`):
```typescript
  const initialUrl = options.gifUrl === "none" ? null : options.gifUrl;
  renderPreview(initialUrl);
```
در `input.value` و دکمه «حذف گیف»:
```typescript
    input.value = initialUrl ?? "";
    ...
      btn("btn-ghost", "حذف گیف", () => {
        input.value = "";
        options.onSaveUrl?.("none");
        renderPreview(null);
        toast("گیف حذف شد.", "info");
      }),
```

---

#### ۴.۹. فایل `src/components/aiDietConfigurator.ts`

1. جلوگیری از تکرار ردیف آب در `applyAiDietJson`:
```typescript
  if (plan.checklist.length > 0) {
    const water: DietItem = state.diet.items.find((item) => item.id === "diet-4") ?? waterRow();
    const isWaterRow = (text: string) =>
      /(لیوان\s*آب|نوشیدن\s*آب|آب\s*(کافی|روزانه|بنوش|بخور))/.test(text);
    state.diet.items = [
      ...plan.checklist
        .filter((entry) => !isWaterRow(entry.text))
        .map((entry, index) => ({
          id: `ai-${index + 1}`,
          text: entry.text,
          hint: entry.hint,
          done: false,
        })),
      water,
    ];
    syncWaterChecklist();
    applied.push("چک‌لیست");
  }
```
2. بهبود پیام خطای کلیپ‌بورد در `openAiDietConfigurator`:
```typescript
        if (!text.trim()) {
          toast("دسترسی کلیپ‌بورد در دسترس نیست یا خالی است؛ پاسخ را دستی بچسبان.", "info");
          return;
        }
```

---

#### ۴.۱۰. فایل `src/components/progressPhotos.ts`

1. افزودن دکمه نمایش همه عکس‌ها وقتی بیش از ۶ عکس وجود دارد:
در بالای فایل:
```typescript
import { faDate, faNum, faSigned, isoToday } from "../lib/fa";
import { restoreWaterReminderOnBoot } from "../lib/timer";
import { syncWakeLockWithMode } from "../lib/workoutTools";
import { syncUniAlarms } from "../views/uni";
import { syncLanguageStudyAlarm } from "../views/uniLanguage";

let showAllPhotos = false;
```
در `renderProgressPhotosCard()`:
```typescript
  const visiblePhotos = showAllPhotos ? photos : photos.slice(0, 6);
  const grid = el("div", "grid grid-cols-2 gap-2.5");
  for (const photo of visiblePhotos) {
    ...
  }
  card.append(grid);

  if (photos.length > 6) {
    card.append(
      btn("btn-ghost w-full text-xs", showAllPhotos ? "نمایش کمتر" : `مشاهده همه عکس‌ها (${faNum(photos.length, 0)})`, () => {
        showAllPhotos = !showAllPhotos;
        requestRender();
      }),
    );
  }
```
2. در `openCompareModal`:
```typescript
    subtitle: `تغییر وزن: ${faSigned(delta, 1)} کیلوگرم`,
```
3. در بازیابی فایل پشتیبان (`fileInput.addEventListener("change", ...)`):
```typescript
        const restored = normalizeState(parsed as AppStateData);
        setState(restored);
        persist(0);
        restoreWaterReminderOnBoot();
        void syncUniAlarms();
        void syncLanguageStudyAlarm();
        void syncWakeLockWithMode();
        toast("پشتیبان با موفقیت بازیابی شد ✅");
        requestRender();
```

---

### بخش ۵: ویوها (`src/views/`) و فایل اصلی (`src/main.ts`, `src/styles.css`)

#### ۵.۱. فایل `src/views/workout.ts`

1. ایمپورت‌های جدید:
```typescript
import {
  clearTodayWorkoutActivity,
  getState,
  mutate,
  persist,
  requestRender,
  setState,
  syncWaterChecklist,
  WATER_GOAL,
} from "../lib/store";
import { CARDIO_TIMER_NOTIF_ID, cancelNotifications, scheduleOneShotNotification } from "../lib/notify";
```
2. اضافه کردن `data-day-pill-status` به هر تب روز در `dayStrip()`:
```typescript
       `<span class="flex w-full items-center justify-between gap-1 text-[10px] opacity-80">
         <span>${escapeHtml(day.label)}</span>
         <span data-day-pill-status="${day.id}" class="${finished ? "text-emerald-400" : ""}">${
           finished ? "✓" : `${fa(done)}/${fa(total)}`
         }</span>
       </span>
       ...`
```
3. در `runOverload`: پاک کردن اسنپ‌شات دلود بعد از اتمام موفق:
```typescript
import { clearDeloadSnapshot, ... } from "../lib/workoutTools";
```
```typescript
    const next = await applyProgressiveOverload();
    clearDeloadSnapshot();
    setState(next);
```
4. در `warmupCard`: ثبت `item.doneDate`, به‌روزرسانی تقویم هفتگی و پاک کردن رکورد خالی امروز هنگام برداشتن تیک‌ها:
```typescript
    check.addEventListener("click", () => {
      item.done = !item.done;
      item.doneDate = item.done ? isoToday() : null;
      persist(0);
      if (item.done) {
        softTap();
      } else if (dayDone(day) === 0 && !day.warmups.some((w) => w.done)) {
        clearTodayWorkoutActivity();
      }
      ...
      refreshWeeklyActivityCard();
    });
```
5. در `cardioTimerBlock`: زمان‌بندی نوتیفیکیشن پس‌زمینه `CARDIO_TIMER_NOTIF_ID`:
```typescript
  const playPause = btn(
    "flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400 text-slate-950 transition active:scale-90",
    svgIcon(icons.play, "h-4 w-4"),
    () => {
      cardioTimer.toggle();
      if (cardioTimer.running) {
        void scheduleOneShotNotification(
          CARDIO_TIMER_NOTIF_ID,
          "🔥 هوازی تمام شد",
          "۵ دقیقه هوازی تمام شد. حالا گرم کردن پویا!",
          Date.now() + cardioTimer.remaining * 1000,
        );
      } else {
        void cancelNotifications([CARDIO_TIMER_NOTIF_ID]);
      }
      paintCardio();
    },
    { "aria-label": "شروع یا توقف" },
  );

  const resetButton = btn("btn-icon", svgIcon(icons.reset, "h-4 w-4"), () => {
    cardioTimer.reset(300);
    void cancelNotifications([CARDIO_TIMER_NOTIF_ID]);
    paintCardio();
  }, { "aria-label": "بازنشانی" });
```
و در `cardioTimer.onDone`:
```typescript
  cardioTimer.onDone = () => {
    void cancelNotifications([CARDIO_TIMER_NOTIF_ID]);
    alarm();
    toast("۵ دقیقه هوازی تمام شد. حالا گرم کردن پویا! 🔥");
    paintCardio();
  };
```
6. در `exerciseCard`:
   - محاسبه وجود گیف پیش‌فرض واقعی (`hasDefaultDemo`) و پشتیبانی از `"none"`:
```typescript
  const exerciseGifMap = defaultGifs.exercises as Record<string, string>;
  const baseId = exercise.id.replace(/^(ppl\d+|dorm\d+)-/, "");
  const hasDefaultDemo = baseId in exerciseGifMap;
  const fallbackDemo = hasDefaultDemo
    ? swapped
      ? `/gifs/${baseId}-alt.gif`
      : `/gifs/${baseId}.gif`
    : null;
```
   - در `openGifModal`: `fallbackUrl: fallbackDemo`.
   - در بخش رندر تصویر:
```typescript
  if (exercise.gifUrl && exercise.gifUrl !== "none") {
    ...
    let fellBack = !fallbackDemo || exercise.gifUrl === fallbackDemo;
    img.addEventListener("error", () => {
      if (!fellBack && fallbackDemo) {
        fellBack = true;
        img.src = fallbackDemo;
        return;
      }
      ...
```
7. در `setRow`:
   - ثبت `log.doneDate`, جلوگیری از ثبت PR در حرکت جایگزین‌شده، و جلوگیری از باز شدن هم‌زمان دو مودال / دو صدا در آخرین ست روز:
```typescript
  check.addEventListener("click", () => {
    const wasComplete = dayTotal(day) > 0 && dayDone(day) === dayTotal(day);
    log.done = !log.done;
    log.doneDate = log.done ? isoToday() : null;
    persist(0);
    ...
    if (log.done) {
      recordExerciseHistory(exercise);

      if (!isExerciseSwapped(exercise) && checkAndUpdatePR(exercise, log.weight, log.reps)) {
        persist(0);
        requestRender();
      }

      const allDone =
        exercise.logs.length > 0 && exercise.logs.every((entry) => entry.done);
      const dayFinished =
        !wasComplete && dayTotal(day) > 0 && dayDone(day) === dayTotal(day);

      if (dayFinished && allDone) {
        // ابتدا مودال پله بعدی و پس از بسته شدن آن، جشن پایان تمرین بدون تداخل صدا
        const key = `${exercise.id}:${isoToday()}`;
        if (!progressionAsked.has(key)) {
          progressionAsked.add(key);
          openDoubleProgressionModal(exercise, reachedTopOfRange(exercise), () =>
            openWorkoutFinishModal(day),
          );
        } else {
          openWorkoutFinishModal(day);
        }
      } else if (dayFinished) {
        openWorkoutFinishModal(day);
      } else {
        if (allDone) {
          chord();
          offerDoubleProgression(exercise);
        } else {
          beep(2, 1320, 0.12);
        }
        startRest();
      }
    } else {
      if (exercise.logs.some((entry) => entry.done)) {
        recordExerciseHistory(exercise);
      } else {
        clearTodayExerciseHistory(exercise.id);
      }
      if (dayDone(day) === 0 && !day.warmups.some((w) => w.done)) {
        clearTodayWorkoutActivity();
      }
    }
    refreshProgress(day, exercise);
  });
```
8. در `refreshProgress(day, exercise)`: به‌روزرسانی کپسول `dayStrip`:
```typescript
  const pillStatus = root.querySelector<HTMLElement>(`[data-day-pill-status="${day.id}"]`);
  if (pillStatus) {
    const finished = total > 0 && dayDoneCount === total;
    pillStatus.textContent = finished ? "✓" : `${fa(dayDoneCount)}/${fa(total)}`;
    pillStatus.className = finished ? "text-emerald-400" : "";
  }
```
9. در `editExercise`: پاک کردن وضعیت swap اگر کاربر حرکت را دستی ویرایش کرد:
```typescript
      exercise.sets = draft.sets;
      if (isExerciseSwapped(exercise)) {
        exercise.swappedDate = null;
        exercise.originalName = null;
        exercise.originalQuery = null;
        exercise.originalGifUrl = null;
        exercise.originalTip = null;
      }
```

---

#### ۵.۲. فایل `src/views/nutrition.ts`

در `proteinCard()` (خط ۳۳۷):
```typescript
  grid.append(
    cell(
      "پروتئین روزانه",
      `${fa(proteinTarget)} گرم`,
      aiProtein !== null ? "هوش مصنوعی" : cutting ? "۱٫۸ گرم بر کیلو" : "۱٫۵۵ گرم بر کیلو",
    ),
    cell("کالری روزانه", `${fa(calories)} کالری`, aiCalories !== null ? "هوش مصنوعی" : "از وزن بدن"),
  );
```

---

#### ۵.۳. فایل `src/views/progress.ts`

در `weightHero()` (اصلاح محاسبه درصد و باقی‌مانده برای کاهش وزن و محافظت BMI):
```typescript
function weightHero(): HTMLElement {
  const { profile, weightHistory } = getState();
  const gained = profile.currentWeight - profile.startWeight;
  const isLoss = profile.targetWeight < profile.startWeight;
  const span = Math.abs(profile.targetWeight - profile.startWeight);
  const progressDone = isLoss
    ? profile.startWeight - profile.currentWeight
    : profile.currentWeight - profile.startWeight;
  const remaining = isLoss
    ? Math.max(0, profile.currentWeight - profile.targetWeight)
    : Math.max(0, profile.targetWeight - profile.currentWeight);
  const percent = span < 0.1 ? 100 : Math.min(100, Math.max(0, (progressDone / span) * 100));
  const heightM = Math.max(1, profile.heightCm) / 100;
  const bmi = profile.currentWeight / (heightM * heightM);
```
و در `foot`:
```typescript
  foot.append(
    el("span", "", remaining < 0.1 ? "به وزن هدف رسیدی ✓" : `${faNum(remaining, 1)} کیلو تا هدف`),
    el("span", "", `${fa(weightHistory.length)} ثبت وزن`),
  );
```

---

#### ۵.۴. فایل `src/views/coach.ts`

1. در `profileEditor` (برخورد درست با نام خالی):
```typescript
  const save = btn("btn-ghost w-full py-2 text-xs", "ذخیره مشخصات", () => {
    const name = nameInput.value.trim();
    if (!name) {
      toast("نام نمی‌تواند خالی باشد.", "error");
      nameInput.focus();
      return;
    }
    state.profile.name = name;
    ...
```
2. در `loadDeveloperPreset`: همگام‌سازی تایمر آب، آلارم‌های دانشگاه/زبان و WakeLock بعد از ریست پروفایل:
```typescript
import { alarm, stopWaterReminder, waterAlert } from "../lib/timer";
import { syncWakeLockWithMode } from "../lib/workoutTools";
import { syncUniAlarms } from "./uni";
import { syncLanguageStudyAlarm } from "./uniLanguage";
```
```typescript
  stopWaterReminder();
  applyDeveloperPreset(getState());
  applyTheme();
  persist(0);
  void syncUniAlarms();
  void syncLanguageStudyAlarm();
  void syncWakeLockWithMode();
  toast("پروفایل پیش‌فرض توسعه‌دهنده بارگذاری شد ⚡");
  requestRender();
```

---

#### ۵.۵. فایل `src/views/uni.ts`

1. Escape کردن `effectiveDate` و به‌روزرسانی خودکار روز و رادار:
```typescript
let activeGroup: ScheduleGroupKey = detectTodayScheduleKey();
let activeGroupDate = isoToday();
let radarTickHandle: number | null = null;
```
در `renderUni()`:
```typescript
export function renderUni(): HTMLElement {
  const todayIso = isoToday();
  if (activeGroupDate !== todayIso) {
    activeGroupDate = todayIso;
    activeGroup = detectTodayScheduleKey();
  }

  const view = el("div", "space-y-3 animate-fade-up");
  ...
  if (radarTickHandle === null) {
    radarTickHandle = window.setInterval(() => {
      const node = document.querySelector("[data-uni-radar]");
      if (!node) {
        if (radarTickHandle !== null) {
          window.clearInterval(radarTickHandle);
          radarTickHandle = null;
        }
        return;
      }
      node.replaceWith(nextBusRadarCard());
    }, 30_000);
  }
  return view;
}
```
در `uniHeroBanner`:
```typescript
      `برنامه سرویس‌های راه‌آهن، خسروشهر، اسکو، شرق و میدان فهمیده (اجرا از ${escapeHtml(shuttle().effectiveDate)})`,
```
در `nextBusRadarCard`:
```typescript
  const card = el("div", "card space-y-2.5 border-emerald-500/25 bg-emerald-500/5");
  card.setAttribute("data-uni-radar", "1");
```
2. همگام‌سازی آلارم‌های دانشگاه در بوت/بازیابی بکاپ + پاک‌سازی آلارم‌های سرویس‌های قدیمی هنگام تغییر جدول سرویس‌ها:
```typescript
import {
  cancelNotifications,
  ensureNotificationPermission,
  hasNotificationPermission,
  scheduleRepeatingNotification,
} from "../lib/notify";
```
در انتهای `uni.ts`:
```typescript
function allKnownBusKeys(): Set<string> {
  const table = shuttle();
  const keys = new Set<string>();
  (["sun-wed", "sat", "thu", "fri"] as const).forEach((group) => {
    table.railway[group].fromUni.forEach((time) => keys.add(`${group}-uni-${time}`));
    table.railway[group].fromRailway.forEach((time) => keys.add(`${group}-rail-${time}`));
  });
  table.suburbs.forEach((item) => {
    item.times.forEach((time) => keys.add(`suburb-${item.id}-${time}`));
  });
  return keys;
}

/** Removes & cancels bus alarms whose departure times no longer exist after an AI timetable update. */
export async function pruneBusAlarms(): Promise<void> {
  const reminders = ensureUniReminders();
  const valid = allKnownBusKeys();
  const obsolete = reminders.activeBusAlarms.filter((key) => !valid.has(key));
  if (obsolete.length === 0) return;

  const idsToCancel: number[] = [];
  for (const key of obsolete) {
    for (let weekday = 1; weekday <= 7; weekday += 1) idsToCancel.push(busAlarmId(key, weekday));
  }
  await cancelNotifications(idsToCancel);
  reminders.activeBusAlarms = reminders.activeBusAlarms.filter((key) => valid.has(key));
  persist(0);
}

/** Re-registers repeating university alarms silently on boot / backup restore when permission exists. */
export async function syncUniAlarms(): Promise<void> {
  if (!(await hasNotificationPermission())) return;
  const reminders = ensureUniReminders();

  if (reminders.thursdayFoodEnabled) {
    const at = shiftEarlier(reminders.thursdayFoodTime, 0);
    const label = foodDayLabel(reminders.foodReminderDay);
    await scheduleRepeatingNotification(
      7901,
      "🍱 یادآور رزرو غذای سلف",
      `امروز ${label} است! غذای هفته بعد سلف را رزرو کن (اولویت: چلو جوجه و مرغ).`,
      { hour: at.hour, minute: at.minute, weekday: foodAlarmWeekday(reminders.foodReminderDay) },
    );
  } else {
    await cancelNotifications([7901]);
  }

  if (reminders.gymReminderEnabled) {
    const at = shiftEarlier(reminders.gymReminderTime, 0);
    await scheduleRepeatingNotification(
      7902,
      "🎒 وقت رفتن به باشگاه!",
      "۱٫۵ ساعت قبل از شام سلف تمرین کن تا شامت وعده ریکاوری بعد تمرین شود 💪",
      { hour: at.hour, minute: at.minute },
    );
  } else {
    await cancelNotifications([7902]);
  }

  const table = shuttle();
  for (const key of reminders.activeBusAlarms) {
    let group: ScheduleGroupKey = "sun-wed";
    let time = "";
    let title = "سرویس دانشگاه";
    if (key.startsWith("suburb-")) {
      const lastDash = key.lastIndexOf("-");
      time = key.slice(lastDash + 1);
      group = "suburbs";
      const id = key.slice("suburb-".length, lastDash);
      title = table.suburbs.find((s) => s.id === id)?.route ?? title;
    } else {
      const m = /^(sun-wed|sat|thu|fri)-(uni|rail)-(\d{2}:\d{2})$/.exec(key);
      if (!m) continue;
      group = m[1] as ScheduleGroupKey;
      time = m[3];
      title = m[2] === "uni" ? "دانشگاه ← راه‌آهن" : "راه‌آهن ← دانشگاه";
    }
    if (!time) continue;
    const at = shiftEarlier(time, 15);
    for (const weekday of GROUP_WEEKDAYS[group]) {
      await scheduleRepeatingNotification(
        busAlarmId(key, weekday),
        `🚌 ۱۵ دقیقه تا سرویس ${fa(time)}`,
        `${title} ساعت ${fa(time)} حرکت می‌کند. آماده باش!`,
        { hour: at.hour, minute: at.minute, weekday },
      );
    }
  }
}
```

---

#### ۵.۶. فایل `src/views/uniCourses.ts`

1. مقداردهی خودکار `semesterWeekAnchorDate` وقتی `null` است تا هفته‌های زوج و فرد واقعاً هر هفته جلو بروند:
در `renderClassScheduleCard()`:
```typescript
  const fortnightly = hasFortnightlyCourses();
  if (fortnightly && !state.semesterWeekAnchorDate) {
    state.semesterWeekAnchorDate = currentWeekStartIso();
    state.semesterWeekType = effectiveSemesterWeekType();
    persist(0);
  }
```
2. جلوگیری از عبور از نیمه‌شب هنگام جابه‌جایی ساعت کلاس در `openCourseModal`:
```typescript
  const shift = (delta: number) => {
    const length = Math.max(30, toMinutes(endTime) - toMinutes(startTime));
    const maxStart = 23 * 60 + 59 - length;
    const clampedStart = Math.min(maxStart, Math.max(0, toMinutes(startTime) + delta));
    startTime = toHhmm(clampedStart);
    endTime = toHhmm(clampedStart + length);
    softTap();
    paintSlots();
    paintShift();
  };
```

---

#### ۵.۷. فایل `src/views/uniLanguage.ts`

1. رفع باگ محاسبه ساعت و دقیقه در `setTime`:
```typescript
  const setTime = async (hour: number, minute: number) => {
    const totalMinutes = (((hour * 60 + minute) % 1440) + 1440) % 1440;
    const hh = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
    const mm = String(totalMinutes % 60).padStart(2, "0");
    lang.reminderTime = `${hh}:${mm}`;
    lang.reminderEnabled = true;
    softTap();
    persist(0);
    await scheduleLanguageAlarm(lang.reminderTime);
    requestRender();
  };
```
2. اضافه کردن `syncLanguageStudyAlarm` (برای بوت/بکاپ) و نوتیفیکیشن پس‌زمینه `LANG_TIMER_NOTIF_ID` برای تایمر تمرکز:
```typescript
import {
  LANG_TIMER_NOTIF_ID,
  cancelNotifications,
  ensureNotificationPermission,
  hasNotificationPermission,
  scheduleOneShotNotification,
  scheduleRepeatingNotification,
} from "../lib/notify";
```
در انتهای فایل یا کنار `scheduleLanguageAlarm`:
```typescript
export async function syncLanguageStudyAlarm(): Promise<void> {
  if (!(await hasNotificationPermission())) return;
  const lang = languageState();
  if (!lang.reminderEnabled) {
    await cancelNotifications([LANGUAGE_ALARM_ID]);
    return;
  }
  const [hour, minute] = lang.reminderTime.split(":").map((part) => Number.parseInt(part, 10) || 0);
  const title = lang.title || "مطالعه روزانه زبان";
  await scheduleRepeatingNotification(
    LANGUAGE_ALARM_ID,
    `📚 وقت ${title} است!`,
    "یک جلسه تمرکز = سرمایه‌گذاری روی آینده تحصیلی و شغلی. همین حالا شروع کن 🔥",
    { hour, minute },
  );
}
```
در دکمه‌های `toggleTimer`, `reset` و `languageStudyTimer.onDone`:
```typescript
  const toggleTimer = btn(
    "btn-primary px-3 py-2 text-xs",
    languageStudyTimer.running ? "توقف ⏸" : "شروع ▶",
    () => {
      if (!languageStudyTimer.running && languageStudyTimer.remaining <= 0.05) {
        languageStudyTimer.reset(target * 60);
      }
      languageStudyTimer.toggle();
      if (languageStudyTimer.running) {
        void scheduleOneShotNotification(
          LANG_TIMER_NOTIF_ID,
          `📚 پایان جلسه ${lang.title}`,
          "وقت مطالعه امروز تمام شد و ثبت گردید ✅",
          Date.now() + languageStudyTimer.remaining * 1000,
        );
      } else {
        void cancelNotifications([LANG_TIMER_NOTIF_ID]);
      }
      softTap();
      requestRender();
    },
    { "aria-label": "شروع یا توقف تایمر زبان" },
  );
  controls.append(
    toggleTimer,
    btn("btn-icon", svgIcon(icons.reset, "h-4 w-4"), () => {
      languageStudyTimer.reset(target * 60);
      void cancelNotifications([LANG_TIMER_NOTIF_ID]);
      softTap();
      requestRender();
    }, { "aria-label": "ریست تایمر زبان" }),
  );
```
و در `languageStudyTimer.onDone`:
```typescript
  languageStudyTimer.onDone = () => {
    void cancelNotifications([LANG_TIMER_NOTIF_ID]);
    alarm();
    ...
```

---

#### ۵.۸. فایل `src/views/uniShuttleAi.ts`

1. استفاده از `copyText`، نمایش متن پرامپت در صورت عدم دسترسی کلیپ‌بورد و پاک‌سازی آلارم‌های منسوخ:
```typescript
import { copyText } from "../lib/clipboard";
import { pruneBusAlarms } from "./uni";
```
```typescript
async function copyPrompt(fallbackWrap: HTMLElement): Promise<void> {
  const copied = await copyText(SHUTTLE_AI_PROMPT_TEMPLATE);
  if (copied) {
    toast("پرامپت و تمپلیت JSON کپی شد؛ حالا همراه عکس سرویس‌ها به هوش مصنوعی بده 📋");
  } else {
    fallbackWrap.classList.remove("hidden");
    const box = fallbackWrap.querySelector("textarea");
    box?.select();
    toast("دسترسی کلیپ‌بورد بسته است؛ متن پرامپت را از کادر زیر کپی کن.", "info");
  }
}
```
در `openShuttleAiImportModal()`:
```typescript
  const promptFallback = el("div", "hidden space-y-1");
  const promptBox = el("textarea", "field h-28 w-full resize-none text-left font-mono text-[10px] leading-5");
  promptBox.dir = "ltr";
  promptBox.readOnly = true;
  promptBox.value = SHUTTLE_AI_PROMPT_TEMPLATE;
  promptFallback.append(el("label", "label", "متن پرامپت برای کپی دستی"), promptBox);

  body.append(
    btn("btn-ghost w-full text-xs", "📋 ۱. کپی پرامپت و تمپلیت آماده", () => void copyPrompt(promptFallback), {
      "aria-label": "کپی پرامپت تمپلیت سرویس‌ها",
    }),
    promptFallback,
  );
```
و در دکمه‌های ذخیره و بازگردانی پس از تغییر `state.customShuttleJson`:
```typescript
      void pruneBusAlarms();
```

---

#### ۵.۹. فایل `src/main.ts`

1. ایمپورت‌های جدید:
```typescript
import { installWakeLockLifecycle, syncWakeLockWithMode } from "./lib/workoutTools";
import { syncUniAlarms } from "./views/uni";
import { syncLanguageStudyAlarm } from "./views/uniLanguage";
```
2. در `boot()`:
   - تغییر `behavior: "smooth"` به `behavior: "instant" as ScrollBehavior`.
   - هماهنگ‌سازی `initNotificationActions`, `syncUniAlarms`, `syncLanguageStudyAlarm`, `syncWakeLockWithMode` و حذف شنونده اول `visibilitychange` (ادغام در `syncAfterBackground`):
```typescript
    await initNotificationActions();
    setRenderHook(() => renderView(true));

    installNavigation(() => {
      const home = homeTab(getState().appMode);
      if (getActiveTab() !== home) {
        setActiveTab(home);
        requestRender();
        window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
      }
    });

    renderView();
    ...
    restoreWaterReminderOnBoot();
    void syncUniAlarms();
    void syncLanguageStudyAlarm();
    void syncWakeLockWithMode();
```
*(خط `document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") restoreWaterReminderOnBoot(); });` در خطوط ۲۳۹-۲۴۱ را حذف کنید).*
3. در `syncAfterBackground()`:
```typescript
async function syncAfterBackground(): Promise<void> {
  if (syncingAfterBackground) return;
  syncingAfterBackground = true;
  try {
    if (hasNativeWaterBridge()) {
      if (hasPendingSave()) await flushNow();
      setState(await loadState());
    }
    if (ensureDailyDietReset()) persist(0);
    // تنها بعد از خواندن آخرین وضعیت فایل از دیسک، یادآور آب همگام‌سازی شود
    restoreWaterReminderOnBoot();
    requestRender();
  } catch (error) {
    console.warn("resume sync failed", error);
  } finally {
    syncingAfterBackground = false;
  }
}
```

---

#### ۵.۱۰. فایل `src/styles.css`

اضافه کردن کلاس‌های جاافتاده `bg-slate-900/95`، `bg-slate-900/40`، `bg-slate-950/80` و `bg-slate-950/85` در بخش `html.theme-light` تا تایمر استراحت شناور (`#rest-timer`) و کادرهای خالی در تم روشن ناخوانا نشوند:
```css
html.theme-light .bg-slate-950,
html.theme-light .bg-slate-950\/40,
html.theme-light .bg-slate-950\/50,
html.theme-light .bg-slate-950\/60,
html.theme-light .bg-slate-950\/70,
html.theme-light .bg-slate-950\/80,
html.theme-light .bg-slate-950\/85,
html.theme-light .bg-slate-900,
html.theme-light .bg-slate-900\/40,
html.theme-light .bg-slate-900\/50,
html.theme-light .bg-slate-900\/60,
html.theme-light .bg-slate-900\/70,
html.theme-light .bg-slate-900\/80,
html.theme-light .bg-slate-900\/90,
html.theme-light .bg-slate-900\/95,
html.theme-light .bg-slate-800,
html.theme-light .bg-slate-800\/30,
html.theme-light .bg-slate-800\/50,
html.theme-light .bg-slate-800\/60,
html.theme-light .bg-slate-800\/80 {
  background-color: #f8fafc !important;
  border-color: #cbd5e1 !important;
}
```

---

### دستورالعمل بررسی بعد از اعمال تغییرات
پس از اعمال تغییرات بالا توسط هوش مصنوعی کامپیوترتان، دستورات زیر را برای اطمینان از نبودن خطای تایپ یا تست اجرا کنید:
1. `npm run typecheck`
2. `npm run build`
3. `cd src-tauri && cargo test`
4. اجرای سرور `node scripts/serve-dist.mjs` و اجرای تست‌های `e2e-check.mjs`, `e2e-fixes.mjs`, `e2e-water.mjs`, `e2e-calendar.mjs`, `e2e-uni.mjs`, `e2e-uni-v2.mjs`, `e2e-swap-quiet.mjs`, `e2e-v3.mjs`, `e2e-v4.mjs`, `e2e-v5.mjs`, `e2e-v6.mjs`, `e2e-v7.mjs`.