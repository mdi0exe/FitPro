/**
 * Browser-fallback seed programme.
 *
 * This mirrors `src-tauri/src/storage.rs::seed()` exactly. It is only used when
 * the app runs outside Tauri (plain `npm run dev` in a browser), so the whole
 * UI stays testable without a native shell.
 */
import { defaultCourses } from "./courses";
import { cafeteriaItems } from "./dietTemplates";
import type {
  AppStateData,
  Exercise,
  SetLog,
  WarmupItem,
  WorkoutDay,
} from "../types";

export function localIso(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const w = (id: string, text: string, query: string): WarmupItem => ({
  id,
  text,
  query,
  done: false,
  // Filled from default-gifs.json by normalizeState()/normalize().
  gifUrl: null,
});

function ex(
  id: string,
  name: string,
  sets: number,
  reps: string,
  query: string,
  tip: string,
  targetWeight: number,
): Exercise {
  const firstReps = Number.parseInt(reps.replace(/^[^\d]*/, ""), 10) || 8;
  const logs: SetLog[] = Array.from({ length: sets }, (_, i) => ({
    index: i + 1,
    weight: targetWeight,
    reps: firstReps,
    done: false,
  }));
  return {
    id,
    name,
    sets,
    reps,
    query,
    tip,
    gifUrl: null,
    targetWeight,
    bodyweight: targetWeight <= 0,
    logs,
  };
}

const upperWarmups = (): WarmupItem[] => [
  w(
    "wu-1",
    "۵ دقیقه تردمیل یا الپتیکال با سرعت متوسط (افزایش دمای بدن و ضربان قلب)",
    "Treadmill Walk warmup gif",
  ),
  w(
    "wu-2",
    "چرخش دست‌ها و مفصل شانه به جلو و عقب (۲ ست ۲۰ ثانیه‌ای)",
    "Arm Circles dynamic warmup gif",
  ),
  w("wu-3", "باز و بسته کردن پویا قفسه سینه (۱۵ تکرار)", "Dynamic Chest Stretch warmup gif"),
  w(
    "wu-4",
    "گرم کردن روتاتور کاف شانه با دمبل ۱ یا ۲ کیلویی (۱۵ تکرار)",
    "External Rotation Shoulder Warmup gif",
  ),
  w(
    "wu-5",
    "اجرای ۲ ست گرم‌کردنی از اولین حرکت امروز با ۵۰٪ وزنه کاری (بدون خستگی)",
    "Incline Dumbbell Press warmup",
  ),
];

const lowerWarmups = (): WarmupItem[] => [
  w(
    "wu-1",
    "۵ دقیقه دوچرخه ثابت با مقاومت سبک (خون‌رسانی به مفصل زانو و ران)",
    "Stationary Bike warmup gif",
  ),
  w(
    "wu-2",
    "تاب دادن پا به جلو، عقب و طرفین برای باز شدن لگن (۱۰ بار هر پا)",
    "Leg Swings dynamic warmup gif",
  ),
  w("wu-3", "اسکات با وزن بدن با مکث ۲ ثانیه‌ای در پایین (۱۲ تکرار)", "Bodyweight Squat warmup gif"),
  w("wu-4", "چرخش مچ پا و گرم کردن مفصل زانو (۲۰ ثانیه)", "Ankle Mobility warmup gif"),
  w("wu-5", "اجرای ۲ ست گرم‌کردنی روی دستگاه اول پا با وزنه سبک", "Leg Press warmup gif"),
];

function seedDays(): WorkoutDay[] {
  return [
    {
      id: "day-1",
      label: "روز ۱",
      title: "بالاتنه A",
      focus: "سینه، پهنای زیربغل، بازو",
      warmups: upperWarmups(),
      exercises: [
        ex(
          "d1e1",
          "پرس بالا سینه دمبل (یا دستگاه)",
          3,
          "8-10",
          "Incline Dumbbell Press gif",
          "زاویه نیمکت ۳۰ تا ۴۵ درجه، کنترل کامل در پایین آوردن وزنه",
          12.5,
        ),
        ex(
          "d1e2",
          "زیربغل سیم‌کش از جلو (دست باز)",
          3,
          "10-12",
          "Wide Grip Lat Pulldown gif",
          "سینه را بالا نگه دارید و میله را به بالای سینه بکشید",
          30,
        ),
        ex(
          "d1e3",
          "پرس سینه با دستگاه (نشسته)",
          3,
          "10-12",
          "Seated Chest Press Machine gif",
          "شانه را به نشیمنگاه بچسبانید و آرنج‌ها را قفل نکنید",
          25,
        ),
        ex(
          "d1e4",
          "زیربغل قایقی سیم‌کش (دست جمع)",
          3,
          "10-12",
          "Seated Cable Row gif",
          "کمر کاملاً صاف، در انتهای حرکت کتف‌ها را به هم نزدیک کنید",
          30,
        ),
        ex(
          "d1e5",
          "نشر جانب با دمبل (ایستاده)",
          4,
          "12-15",
          "Dumbbell Lateral Raise gif",
          "حیاتی برای پهن شدن سرشانه! با وزنه سبک و بدون تقلب کمر بزنید",
          5,
        ),
        ex(
          "d1e6",
          "جلوبازو با هالتر خم (EZ)",
          3,
          "10-12",
          "EZ Bar Curl gif",
          "آرنج‌ها ثابت کنار پهلو، تمرکز روی انقباض جلوبازو",
          15,
        ),
        ex(
          "d1e7",
          "پشت بازو سیم‌کش (با طناب)",
          3,
          "12",
          "Rope Tricep Pushdown gif",
          "در پایین‌ترین نقطه طناب را به طرفین باز کنید و ۱ ثانیه مکث کنید",
          15,
        ),
      ],
    },
    {
      id: "day-2",
      label: "روز ۲",
      title: "پایین‌تنه A + شکم",
      focus: "چهارسر ران و ساق",
      warmups: lowerWarmups(),
      exercises: [
        ex(
          "d2e1",
          "پرس پا دستگاه (Leg Press)",
          4,
          "10-12",
          "Leg Press gif",
          "زیر کمر از تشک جدا نشود، زانوها را در بالا قفل نکنید",
          60,
        ),
        ex(
          "d2e2",
          "اسکات با دستگاه اسمیت (یا گابلت اسکات)",
          3,
          "10",
          "Smith Machine Squat gif",
          "نشستن تا موازی شدن ران با زمین، فشار روی پاشنه پا",
          30,
        ),
        ex(
          "d2e3",
          "جلو پا دستگاه (Leg Extension)",
          3,
          "12-15",
          "Leg Extension gif",
          "در بالاترین نقطه ۱ ثانیه مکث کنید تا چهارسر ران کاملاً منقبض شود",
          25,
        ),
        ex(
          "d2e4",
          "پشت پا دستگاه (خوابیده یا نشسته)",
          3,
          "12",
          "Leg Curl Machine gif",
          "لگن را از تشک جدا نکنید، پایین بردن وزنه با کنترل",
          20,
        ),
        ex(
          "d2e5",
          "ساق پا دستگاه (ایستاده یا نشسته)",
          4,
          "15-20",
          "Calf Raise Machine gif",
          "کشش کامل در پایین و مکث ۱ ثانیه‌ای روی پنجه در بالا",
          30,
        ),
        ex(
          "d2e6",
          "زیرشکم آویزان از بارفیکس (یا میز شیب‌دار)",
          3,
          "حداکثر توان",
          "Hanging Knee Raise gif",
          "لگن را به سمت سینه جمع کنید تا شکم درگیر شود نه فقط پای شما",
          0,
        ),
      ],
    },
    {
      id: "day-3",
      label: "روز ۳",
      title: "بالاتنه B",
      focus: "سرشانه، ضخامت پشت، بازو",
      warmups: upperWarmups(),
      exercises: [
        ex(
          "d3e1",
          "پرس سرشانه با دمبل (نشسته) یا دستگاه",
          3,
          "8-10",
          "Seated Dumbbell Shoulder Press gif",
          "دمبل‌ها را تا کنار گوش پایین بیاورید، کمر گود نشود",
          10,
        ),
        ex(
          "d3e2",
          "زیربغل سیم‌کش دست برعکس (مچ به سمت صورت)",
          3,
          "10-12",
          "Reverse Grip Lat Pulldown gif",
          "کشش عالی روی بخش پایینی زیربغل و جلوبازو",
          25,
        ),
        ex(
          "d3e3",
          "قفسه سینه دستگاه (پروانه / Pec Deck)",
          3,
          "12-15",
          "Pec Deck Fly gif",
          "آرنج‌ها کمی خم، تمرکز روی نزدیک کردن عضلات سینه به هم",
          20,
        ),
        ex(
          "d3e4",
          "زیربغل تی‌بار دستگاه (یا روئینگ دستگاه)",
          3,
          "10-12",
          "T-Bar Row Machine gif",
          "عالی برای ضخامت و پر شدن عضلات پشت",
          25,
        ),
        ex(
          "d3e5",
          "فلای معکوس دستگاه (پشت سرشانه)",
          3,
          "12-15",
          "Rear Delt Fly Machine gif",
          "با وزنه متوسط بزنید تا پشت سرشانه بسوزد",
          15,
        ),
        ex(
          "d3e6",
          "جلوبازو لاری دستگاه (یا روی میز شیب‌دار)",
          3,
          "10-12",
          "Preacher Curl Machine gif",
          "حذف کامل تقلب، فوق‌العاده برای پیک جلوبازو",
          15,
        ),
        ex(
          "d3e7",
          "پشت بازو دستگاه دیپ (یا سیم‌کش از پشت سر)",
          3,
          "10-12",
          "Tricep Dip Machine gif",
          "بدن را کمی به جلو متمایل کنید و کامل پشت بازو را منقبض کنید",
          25,
        ),
      ],
    },
    {
      id: "day-4",
      label: "روز ۴",
      title: "پایین‌تنه B + ساعد",
      focus: "پشت پا، باسن و ساعد",
      warmups: lowerWarmups(),
      exercises: [
        ex(
          "d4e1",
          "ددلیفت رومانیایی با دمبل",
          3,
          "10-12",
          "Dumbbell Romanian Deadlift gif",
          "زانوها کمی خم و ثابت، باسن را به عقب بدهید تا کشش در پشت پا حس شود",
          15,
        ),
        ex(
          "d4e2",
          "هاگ پا دستگاه (یا پرس پا پاباز)",
          3,
          "10-12",
          "Hack Squat Machine gif",
          "کمر کاملاً چسبیده به پشتی دستگاه",
          40,
        ),
        ex(
          "d4e3",
          "لانگز (قیچی) با دمبل درجا",
          3,
          "10 هر پا",
          "Dumbbell Lunges gif",
          "تعادل را حفظ کنید و تنه را صاف نگه دارید",
          10,
        ),
        ex(
          "d4e4",
          "پشت پا دستگاه",
          3,
          "12-15",
          "Seated Leg Curl gif",
          "تمرکز کامل روی عضلات همسترینگ",
          20,
        ),
        ex(
          "d4e5",
          "ساق پا دستگاه",
          4,
          "15-20",
          "Standing Calf Raise gif",
          "ساق پا با تکرار بالا و مکث رشد می‌کند",
          35,
        ),
        ex(
          "d4e6",
          "ساعد با هالتر (نشسته مچ روی زانو)",
          3,
          "15",
          "Barbell Wrist Curl gif",
          "برای کلفت شدن ساعد و پر شدن دست‌ها عالی است",
          10,
        ),
      ],
    },
  ];
}

export function createSeedState(): AppStateData {
  const today = localIso();
  return {
    version: 1,
    profile: {
      name: "کاربر",
      age: 25,
      heightCm: 179,
      startWeight: 65,
      currentWeight: 65,
      targetWeight: 75,
      goal: "افزایش حجم خشک (Lean Bulk)",
      trainingWindow: "۱٫۵ ساعت قبل از شام سلف",
      universityName: "دانشگاه من",
      workoutProgramId: "upper-lower-4",
    },
    days: seedDays(),
    weightHistory: [{ date: today, weight: 65 }],
    diet: {
      items: cafeteriaItems(),
      lastResetDate: today,
      waterGlasses: 0,
      waterReminderEnabled: false,
      waterReminderMinutes: 60,
      waterReminderNextAt: 0,
      customCalories: null,
      customProtein: null,
      mealTable: [],
      coachRules: [],
    },
    milestones: [
      {
        id: "ms-1",
        date: today,
        text: "برنامه ۴ روزه هایپرتروفی آماده شد؛ مسیر از ۶۵ به ۷۵ کیلوگرم.",
        kind: "system",
      },
    ],
    lastOverloadDate: today,
    overloadCount: 0,
    activeDay: 0,
    restSeconds: 90,
    activityHistory: [],
    exerciseHistory: {},
    deloadActive: false,
    readiness: "normal",
    personalRecords: {},
    progressPhotos: [],
    uniReminders: {
      thursdayFoodEnabled: true,
      thursdayFoodTime: "12:00",
      gymReminderEnabled: false,
      gymReminderTime: "16:30",
      activeBusAlarms: [],
      foodReminderDay: 4,
    },
    courses: defaultCourses(),
    semesterWeekType: "odd",
    // `null` = the current week is semester week 1.
    semesterWeekAnchorDate: null,
    languageStudy: {
      reminderEnabled: true,
      reminderTime: "20:30",
      targetMinutes: 60,
      completedDates: [],
      title: "مطالعه روزانه زبان",
    },
    customShuttleJson: null,
    theme: "dark",
    appMode: "full",
    // The browser fallback is a dev/e2e surface: skip the first-run wizard so
    // scripted pages stay usable. The native Rust seed uses `false`.
    onboardingCompleted: true,
  };
}
