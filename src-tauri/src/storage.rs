//! Atomic JSON persistence plus the default 4-day Persian seed programme.
//!
//! The state lives in `app.path().app_data_dir()/gym_state.json`.
//! Writes are atomic: a temporary file is flushed to disk and then renamed over
//! the real file, so a crash mid-write can never truncate the user's data.

use std::fs;
use std::io::Write;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::models::{
    AppStateData, DietItem, DietState, Exercise, Milestone, UserProfile, WarmupItem, WeightEntry,
    WorkoutDay, DEFAULT_REST_SECONDS, STATE_VERSION,
};
use crate::timeutil;

const STATE_FILE: &str = "gym_state.json";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/// Absolute path of the state file, creating the data directory when missing.
pub fn state_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("مسیر ذخیره‌سازی برنامه پیدا نشد: {err}"))?;
    fs::create_dir_all(&dir).map_err(|err| format!("ساخت پوشه داده ناموفق بود: {err}"))?;
    Ok(dir.join(STATE_FILE))
}

// ---------------------------------------------------------------------------
// Load / save
// ---------------------------------------------------------------------------

/// Loads the state from disk, seeding a fresh programme on first launch.
pub fn load(app: &AppHandle) -> Result<AppStateData, String> {
    let path = state_path(app)?;

    if !path.exists() {
        let state = seed();
        save(app, &state)?;
        return Ok(state);
    }

    let raw = fs::read_to_string(&path)
        .map_err(|err| format!("خواندن فایل برنامه ناموفق بود: {err}"))?;

    match serde_json::from_str::<AppStateData>(&raw) {
        Ok(mut state) => {
            state.normalize();
            Ok(state)
        }
        Err(err) => {
            // Never lose the user's file: keep a timestamped copy, then reseed.
            let backup = path.with_extension(format!("corrupt-{}.json", timeutil::today_iso()));
            let _ = fs::rename(&path, &backup);

            let mut state = seed();
            state.push_milestone(
                &timeutil::today_iso(),
                "فایل ذخیره‌سازی قابل خواندن نبود؛ برنامه با داده‌های پیش‌فرض بازسازی شد.",
                "system",
            );
            state.normalize();
            let _ = save(app, &state);
            eprintln!("gym_state.json was corrupt and has been reseeded: {err}");
            Ok(state)
        }
    }
}

/// Persists the state atomically (temp file + rename).
pub fn save(app: &AppHandle, state: &AppStateData) -> Result<(), String> {
    let path = state_path(app)?;
    let tmp = path.with_extension("json.tmp");
    let json = serde_json::to_string_pretty(state)
        .map_err(|err| format!("تبدیل داده به JSON ناموفق بود: {err}"))?;

    {
        let mut file = fs::File::create(&tmp)
            .map_err(|err| format!("ساخت فایل موقت ناموفق بود: {err}"))?;
        file.write_all(json.as_bytes())
            .map_err(|err| format!("نوشتن فایل موقت ناموفق بود: {err}"))?;
        file.sync_all()
            .map_err(|err| format!("همگام‌سازی فایل موقت ناموفق بود: {err}"))?;
    }

    if fs::rename(&tmp, &path).is_err() {
        // Some Windows configurations refuse to replace an existing file.
        let _ = fs::remove_file(&path);
        fs::rename(&tmp, &path).map_err(|err| format!("جایگزینی فایل برنامه ناموفق بود: {err}"))?;
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

fn warmup(id: &str, text: &str, query: &str) -> WarmupItem {
    WarmupItem {
        id: id.to_string(),
        text: text.to_string(),
        query: query.to_string(),
        done: false,
        // Filled from default-gifs.json by AppStateData::normalize().
        gif_url: None,
    }
}

fn exercise(
    id: &str,
    name: &str,
    sets: u32,
    reps: &str,
    query: &str,
    tip: &str,
    target_weight: f32,
) -> Exercise {
    let mut exercise = Exercise {
        id: id.to_string(),
        name: name.to_string(),
        sets,
        reps: reps.to_string(),
        query: query.to_string(),
        tip: tip.to_string(),
        gif_url: None,
        target_weight,
        bodyweight: target_weight <= 0.0,
        logs: Vec::new(),
    };
    exercise.sync_logs();
    exercise
}

fn upper_body_warmups() -> Vec<WarmupItem> {
    vec![
        warmup(
            "wu-1",
            "۵ دقیقه تردمیل یا الپتیکال با سرعت متوسط (افزایش دمای بدن و ضربان قلب)",
            "Treadmill Walk warmup gif",
        ),
        warmup(
            "wu-2",
            "چرخش دست‌ها و مفصل شانه به جلو و عقب (۲ ست ۲۰ ثانیه‌ای)",
            "Arm Circles dynamic warmup gif",
        ),
        warmup(
            "wu-3",
            "باز و بسته کردن پویا قفسه سینه (۱۵ تکرار)",
            "Dynamic Chest Stretch warmup gif",
        ),
        warmup(
            "wu-4",
            "گرم کردن روتاتور کاف شانه با دمبل ۱ یا ۲ کیلویی (۱۵ تکرار)",
            "External Rotation Shoulder Warmup gif",
        ),
        warmup(
            "wu-5",
            "اجرای ۲ ست گرم‌کردنی از اولین حرکت امروز با ۵۰٪ وزنه کاری (بدون خستگی)",
            "Incline Dumbbell Press warmup",
        ),
    ]
}

fn lower_body_warmups() -> Vec<WarmupItem> {
    vec![
        warmup(
            "wu-1",
            "۵ دقیقه دوچرخه ثابت با مقاومت سبک (خون‌رسانی به مفصل زانو و ران)",
            "Stationary Bike warmup gif",
        ),
        warmup(
            "wu-2",
            "تاب دادن پا به جلو، عقب و طرفین برای باز شدن لگن (۱۰ بار هر پا)",
            "Leg Swings dynamic warmup gif",
        ),
        warmup(
            "wu-3",
            "اسکات با وزن بدن با مکث ۲ ثانیه‌ای در پایین (۱۲ تکرار)",
            "Bodyweight Squat warmup gif",
        ),
        warmup(
            "wu-4",
            "چرخش مچ پا و گرم کردن مفصل زانو (۲۰ ثانیه)",
            "Ankle Mobility warmup gif",
        ),
        warmup(
            "wu-5",
            "اجرای ۲ ست گرم‌کردنی روی دستگاه اول پا با وزنه سبک",
            "Leg Press warmup gif",
        ),
    ]
}

fn seed_days() -> Vec<WorkoutDay> {
    vec![
        // ------------------------------ Day 1 ------------------------------
        WorkoutDay {
            id: "day-1".to_string(),
            label: "روز ۱".to_string(),
            title: "بالاتنه A".to_string(),
            focus: "سینه، پهنای زیربغل، بازو".to_string(),
            warmups: upper_body_warmups(),
            exercises: vec![
                exercise(
                    "d1e1",
                    "پرس بالا سینه دمبل (یا دستگاه)",
                    3,
                    "8-10",
                    "Incline Dumbbell Press gif",
                    "زاویه نیمکت ۳۰ تا ۴۵ درجه، کنترل کامل در پایین آوردن وزنه",
                    12.5,
                ),
                exercise(
                    "d1e2",
                    "زیربغل سیم‌کش از جلو (دست باز)",
                    3,
                    "10-12",
                    "Wide Grip Lat Pulldown gif",
                    "سینه را بالا نگه دارید و میله را به بالای سینه بکشید",
                    30.0,
                ),
                exercise(
                    "d1e3",
                    "پرس سینه با دستگاه (نشسته)",
                    3,
                    "10-12",
                    "Seated Chest Press Machine gif",
                    "شانه را به نشیمنگاه بچسبانید و آرنج‌ها را قفل نکنید",
                    25.0,
                ),
                exercise(
                    "d1e4",
                    "زیربغل قایقی سیم‌کش (دست جمع)",
                    3,
                    "10-12",
                    "Seated Cable Row gif",
                    "کمر کاملاً صاف، در انتهای حرکت کتف‌ها را به هم نزدیک کنید",
                    30.0,
                ),
                exercise(
                    "d1e5",
                    "نشر جانب با دمبل (ایستاده)",
                    4,
                    "12-15",
                    "Dumbbell Lateral Raise gif",
                    "حیاتی برای پهن شدن سرشانه! با وزنه سبک و بدون تقلب کمر بزنید",
                    5.0,
                ),
                exercise(
                    "d1e6",
                    "جلوبازو با هالتر خم (EZ)",
                    3,
                    "10-12",
                    "EZ Bar Curl gif",
                    "آرنج‌ها ثابت کنار پهلو، تمرکز روی انقباض جلوبازو",
                    15.0,
                ),
                exercise(
                    "d1e7",
                    "پشت بازو سیم‌کش (با طناب)",
                    3,
                    "12",
                    "Rope Tricep Pushdown gif",
                    "در پایین‌ترین نقطه طناب را به طرفین باز کنید و ۱ ثانیه مکث کنید",
                    15.0,
                ),
            ],
        },
        // ------------------------------ Day 2 ------------------------------
        WorkoutDay {
            id: "day-2".to_string(),
            label: "روز ۲".to_string(),
            title: "پایین‌تنه A + شکم".to_string(),
            focus: "چهارسر ران و ساق".to_string(),
            warmups: lower_body_warmups(),
            exercises: vec![
                exercise(
                    "d2e1",
                    "پرس پا دستگاه (Leg Press)",
                    4,
                    "10-12",
                    "Leg Press gif",
                    "زیر کمر از تشک جدا نشود، زانوها را در بالا قفل نکنید",
                    60.0,
                ),
                exercise(
                    "d2e2",
                    "اسکات با دستگاه اسمیت (یا گابلت اسکات)",
                    3,
                    "10",
                    "Smith Machine Squat gif",
                    "نشستن تا موازی شدن ران با زمین، فشار روی پاشنه پا",
                    30.0,
                ),
                exercise(
                    "d2e3",
                    "جلو پا دستگاه (Leg Extension)",
                    3,
                    "12-15",
                    "Leg Extension gif",
                    "در بالاترین نقطه ۱ ثانیه مکث کنید تا چهارسر ران کاملاً منقبض شود",
                    25.0,
                ),
                exercise(
                    "d2e4",
                    "پشت پا دستگاه (خوابیده یا نشسته)",
                    3,
                    "12",
                    "Leg Curl Machine gif",
                    "لگن را از تشک جدا نکنید، پایین بردن وزنه با کنترل",
                    20.0,
                ),
                exercise(
                    "d2e5",
                    "ساق پا دستگاه (ایستاده یا نشسته)",
                    4,
                    "15-20",
                    "Calf Raise Machine gif",
                    "کشش کامل در پایین و مکث ۱ ثانیه‌ای روی پنجه در بالا",
                    30.0,
                ),
                exercise(
                    "d2e6",
                    "زیرشکم آویزان از بارفیکس (یا میز شیب‌دار)",
                    3,
                    "حداکثر توان",
                    "Hanging Knee Raise gif",
                    "لگن را به سمت سینه جمع کنید تا شکم درگیر شود نه فقط پای شما",
                    0.0,
                ),
            ],
        },
        // ------------------------------ Day 3 ------------------------------
        WorkoutDay {
            id: "day-3".to_string(),
            label: "روز ۳".to_string(),
            title: "بالاتنه B".to_string(),
            focus: "سرشانه، ضخامت پشت، بازو".to_string(),
            warmups: upper_body_warmups(),
            exercises: vec![
                exercise(
                    "d3e1",
                    "پرس سرشانه با دمبل (نشسته) یا دستگاه",
                    3,
                    "8-10",
                    "Seated Dumbbell Shoulder Press gif",
                    "دمبل‌ها را تا کنار گوش پایین بیاورید، کمر گود نشود",
                    10.0,
                ),
                exercise(
                    "d3e2",
                    "زیربغل سیم‌کش دست برعکس (مچ به سمت صورت)",
                    3,
                    "10-12",
                    "Reverse Grip Lat Pulldown gif",
                    "کشش عالی روی بخش پایینی زیربغل و جلوبازو",
                    25.0,
                ),
                exercise(
                    "d3e3",
                    "قفسه سینه دستگاه (پروانه / Pec Deck)",
                    3,
                    "12-15",
                    "Pec Deck Fly gif",
                    "آرنج‌ها کمی خم، تمرکز روی نزدیک کردن عضلات سینه به هم",
                    20.0,
                ),
                exercise(
                    "d3e4",
                    "زیربغل تی‌بار دستگاه (یا روئینگ دستگاه)",
                    3,
                    "10-12",
                    "T-Bar Row Machine gif",
                    "عالی برای ضخامت و پر شدن عضلات پشت",
                    25.0,
                ),
                exercise(
                    "d3e5",
                    "فلای معکوس دستگاه (پشت سرشانه)",
                    3,
                    "12-15",
                    "Rear Delt Fly Machine gif",
                    "با وزنه متوسط بزنید تا پشت سرشانه بسوزد",
                    15.0,
                ),
                exercise(
                    "d3e6",
                    "جلوبازو لاری دستگاه (یا روی میز شیب‌دار)",
                    3,
                    "10-12",
                    "Preacher Curl Machine gif",
                    "حذف کامل تقلب، فوق‌العاده برای پیک جلوبازو",
                    15.0,
                ),
                exercise(
                    "d3e7",
                    "پشت بازو دستگاه دیپ (یا سیم‌کش از پشت سر)",
                    3,
                    "10-12",
                    "Tricep Dip Machine gif",
                    "بدن را کمی به جلو متمایل کنید و کامل پشت بازو را منقبض کنید",
                    25.0,
                ),
            ],
        },
        // ------------------------------ Day 4 ------------------------------
        WorkoutDay {
            id: "day-4".to_string(),
            label: "روز ۴".to_string(),
            title: "پایین‌تنه B + ساعد".to_string(),
            focus: "پشت پا، باسن و ساعد".to_string(),
            warmups: lower_body_warmups(),
            exercises: vec![
                exercise(
                    "d4e1",
                    "ددلیفت رومانیایی با دمبل",
                    3,
                    "10-12",
                    "Dumbbell Romanian Deadlift gif",
                    "زانوها کمی خم و ثابت، باسن را به عقب بدهید تا کشش در پشت پا حس شود",
                    15.0,
                ),
                exercise(
                    "d4e2",
                    "هاگ پا دستگاه (یا پرس پا پاباز)",
                    3,
                    "10-12",
                    "Hack Squat Machine gif",
                    "کمر کاملاً چسبیده به پشتی دستگاه",
                    40.0,
                ),
                exercise(
                    "d4e3",
                    "لانگز (قیچی) با دمبل درجا",
                    3,
                    "10 هر پا",
                    "Dumbbell Lunges gif",
                    "تعادل را حفظ کنید و تنه را صاف نگه دارید",
                    10.0,
                ),
                exercise(
                    "d4e4",
                    "پشت پا دستگاه",
                    3,
                    "12-15",
                    "Seated Leg Curl gif",
                    "تمرکز کامل روی عضلات همسترینگ",
                    20.0,
                ),
                exercise(
                    "d4e5",
                    "ساق پا دستگاه",
                    4,
                    "15-20",
                    "Standing Calf Raise gif",
                    "ساق پا با تکرار بالا و مکث رشد می‌کند",
                    35.0,
                ),
                exercise(
                    "d4e6",
                    "ساعد با هالتر (نشسته مچ روی زانو)",
                    3,
                    "15",
                    "Barbell Wrist Curl gif",
                    "برای کلفت شدن ساعد و پر شدن دست‌ها عالی است",
                    10.0,
                ),
            ],
        },
    ]
}

fn seed_diet() -> DietState {
    let items = vec![
        (
            "۳ تا ۴ عدد تخم‌مرغ کامل (ارزان‌ترین بمب پروتئین)",
            "حدود ۲۰ گرم پروتئین با کیفیت بالا و کولین",
        ),
        (
            "وعده کامل سلف دانشگاه (با برنج و نان اضافه)",
            "کربوهیدرات کافی برای پر شدن ذخایر گلیکوژن",
        ),
        (
            "۲ عدد سیب‌زمینی آب‌پز بعد از تمرین",
            "کربوهیدرات سریع برای ریکاوری و بازسازی عضله",
        ),
        (
            "۱ مشت بادام‌زمینی فله‌ای (بمب کالری ارزان)",
            "حدود ۲۵۰ کالری و چربی مفید؛ کلید افزایش وزن",
        ),
        (
            "۱ کاسه عدسی یا خوراک سویا",
            "پروتئین گیاهی ارزان همراه با فیبر",
        ),
        (
            "حداقل ۷ الی ۸ ساعت خواب شبانه (ترشح هورمون رشد)",
            "بیشترین ترشح هورمون رشد در خواب عمیق اتفاق می‌افتد",
        ),
    ];

    DietState {
        items: items
            .into_iter()
            .enumerate()
            .map(|(index, (text, hint))| DietItem {
                id: format!("diet-{}", index + 1),
                text: text.to_string(),
                hint: hint.to_string(),
                done: false,
            })
            .collect(),
        last_reset_date: timeutil::today_iso(),
    }
}

/// Full default programme (fresh install / reset).
pub fn seed() -> AppStateData {
    let today = timeutil::today_iso();
    let mut state = AppStateData {
        version: STATE_VERSION,
        profile: UserProfile::default(),
        days: seed_days(),
        weight_history: vec![WeightEntry {
            date: today.clone(),
            weight: 65.0,
        }],
        diet: seed_diet(),
        milestones: vec![Milestone {
            id: "ms-1".to_string(),
            date: today.clone(),
            text: "برنامه ۴ روزه هایپرتروفی آماده شد؛ مسیر از ۶۵ به ۷۵ کیلوگرم.".to_string(),
            kind: "system".to_string(),
        }],
        last_overload_date: today,
        overload_count: 0,
        active_day: 0,
        rest_seconds: DEFAULT_REST_SECONDS,
    };
    state.normalize();
    state
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seed_has_four_days_and_warmups() {
        let state = seed();
        assert_eq!(state.days.len(), 4);
        for day in &state.days {
            assert_eq!(day.warmups.len(), 5, "each day needs 5 warm-up items");
            assert!(!day.exercises.is_empty());
        }
    }

    #[test]
    fn seed_logs_match_set_counts() {
        let state = seed();
        for day in &state.days {
            for exercise in &day.exercises {
                assert_eq!(exercise.logs.len() as u32, exercise.sets);
                assert!(exercise.logs.iter().all(|l| !l.done));
            }
        }
    }
}
