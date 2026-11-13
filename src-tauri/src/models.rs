//! Domain models shared between the Rust backend and the Persian frontend.
//!
//! Every struct is serialised to `camelCase` JSON so the TypeScript layer can
//! consume the payload without an extra mapping layer.

use serde::{Deserialize, Serialize};

/// Bumped whenever the on-disk shape changes in a backwards-incompatible way.
pub const STATE_VERSION: u32 = 1;

/// Default rest timer between sets (seconds).
pub const DEFAULT_REST_SECONDS: u32 = 90;

/// Length of one progressive-overload cycle (days).
pub const OVERLOAD_CYCLE_DAYS: i64 = 14;

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserProfile {
    pub name: String,
    pub age: u32,
    pub height_cm: f32,
    pub start_weight: f32,
    pub current_weight: f32,
    pub target_weight: f32,
    /// e.g. "حجم خشک (Lean Bulk)"
    pub goal: String,
    /// Golden rule: best training window.
    pub training_window: String,
    /// Shown in the university tab — the app is not tied to one campus.
    #[serde(default = "default_uni_name")]
    pub university_name: String,
    /// One of the ids in `src/data/programs.ts`.
    #[serde(default = "default_program_id")]
    pub workout_program_id: String,
}

/// Fallback label for saves that predate the editable university name.
pub fn default_uni_name() -> String {
    "دانشگاه من".to_string()
}

/// The original 4-day upper/lower programme stays the default.
pub fn default_program_id() -> String {
    "upper-lower-4".to_string()
}

impl Default for UserProfile {
    fn default() -> Self {
        Self {
            name: "دانشجوی ورزشکار".to_string(),
            age: 25,
            height_cm: 179.0,
            start_weight: 65.0,
            current_weight: 65.0,
            target_weight: 75.0,
            goal: "افزایش حجم خشک (Lean Bulk)".to_string(),
            training_window: "۱٫۵ ساعت قبل از شام سلف".to_string(),
            university_name: default_uni_name(),
            workout_program_id: default_program_id(),
        }
    }
}

// ---------------------------------------------------------------------------
// Warm-up
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WarmupItem {
    pub id: String,
    pub text: String,
    /// Search phrase used to look up an animated demo.
    pub query: String,
    #[serde(default)]
    pub done: bool,
    /// Direct `.gif` demo. `None` = never set, `Some("")` = removed by the user.
    #[serde(default)]
    pub gif_url: Option<String>,
}

// ---------------------------------------------------------------------------
// Exercises & sets
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetLog {
    /// 1-based set number.
    pub index: u32,
    pub weight: f32,
    pub reps: u32,
    pub done: bool,
}

impl SetLog {
    pub fn new(index: u32, weight: f32, reps: u32) -> Self {
        Self {
            index,
            weight,
            reps,
            done: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Exercise {
    pub id: String,
    pub name: String,
    pub sets: u32,
    /// Free-form Persian rep prescription, e.g. "8-10" or "حداکثر توان".
    pub reps: String,
    /// GIF search query for the in-app viewer.
    pub query: String,
    /// Persian coaching cue.
    pub tip: String,
    /// Optional direct `.gif` URL pasted by the user.
    #[serde(default)]
    pub gif_url: Option<String>,
    /// Working weight in kilograms. `0.0` means bodyweight-only.
    #[serde(default)]
    pub target_weight: f32,
    #[serde(default)]
    pub bodyweight: bool,
    #[serde(default)]
    pub logs: Vec<SetLog>,
    /// ISO date when the exercise was temporarily swapped for a busy machine.
    /// A swap is a one-day override: `normalize` restores the original move as
    /// soon as the calendar day changes.
    #[serde(default)]
    pub swapped_date: Option<String>,
    #[serde(default)]
    pub original_name: Option<String>,
    #[serde(default)]
    pub original_query: Option<String>,
    #[serde(default)]
    pub original_gif_url: Option<String>,
    #[serde(default)]
    pub original_tip: Option<String>,
}

impl Exercise {
    /// Ensure `logs` has exactly `sets` rows, preserving what the user typed.
    pub fn sync_logs(&mut self) {
        let sets = self.sets.max(1);
        let fallback_reps = parse_first_number(&self.reps).unwrap_or(8);
        let mut logs = std::mem::take(&mut self.logs);
        logs.sort_by_key(|l| l.index);

        let mut next: Vec<SetLog> = Vec::with_capacity(sets as usize);
        for i in 1..=sets {
            match logs.iter().find(|l| l.index == i) {
                Some(existing) => next.push(existing.clone()),
                None => next.push(SetLog::new(i, self.target_weight, fallback_reps)),
            }
        }
        self.logs = next;
    }

    /// True while the movement is a one-day substitute for a busy machine.
    pub fn is_swapped(&self) -> bool {
        self.swapped_date.is_some() && self.original_name.is_some()
    }

    /// Puts the programmed movement back and clears every swap field.
    pub fn restore_original(&mut self) {
        if let Some(name) = self.original_name.take() {
            self.name = name;
        }
        if let Some(query) = self.original_query.take() {
            self.query = query;
        }
        // `None` means the programme had no demo for this movement; leaving it
        // empty lets `normalize` re-inject the bundled GIF afterwards.
        self.gif_url = self.original_gif_url.take();
        if let Some(tip) = self.original_tip.take() {
            self.tip = tip;
        }
        self.swapped_date = None;
    }
}

// ---------------------------------------------------------------------------
// Days
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkoutDay {
    pub id: String,
    /// Short pill label, e.g. "روز ۱".
    pub label: String,
    /// e.g. "بالاتنه A".
    pub title: String,
    /// e.g. "سینه، پهنای زیربغل، بازو".
    pub focus: String,
    pub warmups: Vec<WarmupItem>,
    pub exercises: Vec<Exercise>,
}

// ---------------------------------------------------------------------------
// Progress, diet, milestones
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeightEntry {
    /// ISO date, `YYYY-MM-DD`.
    pub date: String,
    pub weight: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DietItem {
    pub id: String,
    pub text: String,
    #[serde(default)]
    pub hint: String,
    #[serde(default)]
    pub done: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DietState {
    pub items: Vec<DietItem>,
    /// ISO date of the last daily reset.
    pub last_reset_date: String,
    /// Glasses of water drunk today (0-20).
    #[serde(default)]
    pub water_glasses: u32,
    /// Smart reminder toggle.
    #[serde(default)]
    pub water_reminder_enabled: bool,
    /// Reminder interval in minutes.
    #[serde(default = "default_water_interval")]
    pub water_reminder_minutes: u32,
    /// Unix timestamp (ms) of the next reminder. 0 = no deadline yet.
    /// Persisted so closing the app never restarts the countdown.
    #[serde(default)]
    pub water_reminder_next_at: i64,
}

/// Default smart-reminder interval (minutes).
pub fn default_water_interval() -> u32 {
    60
}

/// The 3-meal university cafeteria plan (no snacks, no extra groceries).
pub fn default_diet_items() -> Vec<DietItem> {
    [
        (
            "صبحانه سلف: املت دانشگاه + نان کامل",
            "حدود ۱۲ گرم پروتئین و انرژی صبحگاهی",
        ),
        (
            "ناهار سلف آزاد: چلو جوجه کباب یا چلو مرغ کامل تا آخر برنج",
            "حدود ۴۵ گرم پروتئین و کربوهیدرات کافی برای پر شدن ذخایر گلیکوژن",
        ),
        (
            "شام سلف آزاد (بلافاصله بعد از باشگاه): خوراک مرغ، چلو جوجه یا برگر",
            "حدود ۴۰ گرم پروتئین — به عنوان وعده ریکاوری بعد تمرین!",
        ),
        (
            "نوشیدن حداقل ۸ تا ۱۰ لیوان آب در طول روز و در باشگاه",
            "۷۰٪ حجم عضله آب است! هیدراته ماندن برای پمپ عضلانی و ریکاوری حیاتی است",
        ),
        (
            "خواب شبانه ۷ تا ۸ ساعت برای ترشح هورمون رشد",
            "بیشترین ترشح هورمون رشد و عضله‌سازی در خواب عمیق اتفاق می‌افتد",
        ),
    ]
    .into_iter()
    .enumerate()
    .map(|(index, (text, hint))| DietItem {
        id: format!("diet-{}", index + 1),
        text: text.to_string(),
        hint: hint.to_string(),
        done: false,
    })
    .collect()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Milestone {
    pub id: String,
    pub date: String,
    pub text: String,
    /// "overload" | "weight" | "system" | "goal"
    pub kind: String,
}

/// One day's snapshot for the weekly calendar.
///
/// This is derived state: the frontend writes it on every persist so the
/// calendar can show what actually happened on each day of the week.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DailyActivity {
    /// ISO date: YYYY-MM-DD
    pub date: String,
    /// e.g. "روز ۱ — بالاتنه A"
    #[serde(default)]
    pub workout_title: String,
    /// Exercise names with at least one completed set that day.
    #[serde(default)]
    pub completed_exercises: Vec<String>,
    #[serde(default)]
    pub sets_done: u32,
    #[serde(default)]
    pub warmups_done: u32,
    #[serde(default)]
    pub diet_done: u32,
    #[serde(default)]
    pub diet_total: u32,
    #[serde(default)]
    pub water_glasses: u32,
    #[serde(default)]
    pub body_weight: Option<f32>,
}

/// Best lift for one exercise (Epley 1RM is compared, raw values are stored).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PersonalRecord {
    pub weight: f32,
    pub reps: u32,
    pub date: String,
}

/// A compressed body photo stored inline (base64 JPEG data URL).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProgressPhoto {
    pub id: String,
    pub date: String,
    pub weight: f32,
    pub data_url: String,
    #[serde(default)]
    pub note: String,
}

/// Reminders for the university shuttle / cafeteria schedule.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UniReminders {
    #[serde(default = "default_true")]
    pub thursday_food_enabled: bool,
    #[serde(default = "default_thursday_time")]
    pub thursday_food_time: String,
    #[serde(default)]
    pub gym_reminder_enabled: bool,
    #[serde(default = "default_gym_time")]
    pub gym_reminder_time: String,
    #[serde(default)]
    pub active_bus_alarms: Vec<String>,
    /// `Date.getDay()` numbering: 0 = Sunday … 4 = Thursday … 6 = Saturday.
    /// The UI offers Tuesday … Friday, but any weekday is accepted here.
    #[serde(default = "default_food_day")]
    pub food_reminder_day: u32,
}

fn default_true() -> bool {
    true
}

/// Cafeteria reservations traditionally open on Thursday.
pub fn default_food_day() -> u32 {
    4
}

/// Demos bundled with the app; anything else cannot be trusted in the WebView.
///
/// `fitnessprogramer.com` (the old default) is behind Cloudflare and returns
/// 403 to the Android WebView, so every stored hotlink has to be migrated to the
/// offline copy. A blank value is treated the same way — the picture matters
/// more than an old "hide it" intent that the UI no longer offers.
fn gif_needs_replacement(url: Option<&str>) -> bool {
    match url {
        None => true,
        Some(value) => {
            let trimmed = value.trim();
            trimmed.is_empty()
                || trimmed.contains("fitnessprogramer.com")
                || trimmed.contains("giphy.com")
                || trimmed.contains("imgur.com")
                || trimmed.ends_with(".svg")
        }
    }
}

fn default_thursday_time() -> String {
    "12:00".to_string()
}

fn default_gym_time() -> String {
    "16:30".to_string()
}

impl Default for UniReminders {
    fn default() -> Self {
        Self {
            thursday_food_enabled: true,
            thursday_food_time: default_thursday_time(),
            gym_reminder_enabled: false,
            gym_reminder_time: default_gym_time(),
            active_bus_alarms: Vec::new(),
            food_reminder_day: default_food_day(),
        }
    }
}

/// `HH:MM` on a 24-hour clock.
fn is_hhmm(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 5 || bytes[2] != b':' {
        return false;
    }
    let digits_ok = bytes
        .iter()
        .enumerate()
        .all(|(index, byte)| index == 2 || byte.is_ascii_digit());
    if !digits_ok {
        return false;
    }
    let hour = value[0..2].parse::<u32>().unwrap_or(99);
    let minute = value[3..5].parse::<u32>().unwrap_or(99);
    hour < 24 && minute < 60
}

// ---------------------------------------------------------------------------
// MSc class schedule
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CourseSession {
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub professor: String,
    /// `Date::getDay()` numbering: 0 = Sunday … 4 = Thursday, 6 = Saturday.
    #[serde(default)]
    pub day_of_week: u32,
    #[serde(default = "default_course_start")]
    pub start_time: String,
    #[serde(default = "default_course_end")]
    pub end_time: String,
    /// `all` (every week) | `odd` (`*`, first/odd weeks) | `even` (`**`, second/even weeks).
    #[serde(default = "default_week_type")]
    pub week_type: String,
}

fn default_course_start() -> String {
    "09:00".to_string()
}

fn default_course_end() -> String {
    "11:00".to_string()
}

fn default_week_type() -> String {
    "all".to_string()
}

fn default_semester_week() -> String {
    "odd".to_string()
}

/// `hhmm` shifted by `delta` minutes, clamped to the end of the day.
fn plus_minutes(hhmm: &str, delta: u32) -> String {
    let hour = hhmm.get(0..2).and_then(|v| v.parse::<u32>().ok()).unwrap_or(9);
    let minute = hhmm.get(3..5).and_then(|v| v.parse::<u32>().ok()).unwrap_or(0);
    let total = (hour * 60 + minute + delta).min(23 * 60 + 59);
    format!("{:02}:{:02}", total / 60, total % 60)
}

/// The student's current MSc (Electronics) timetable, used when a save predates
/// the editable schedule. An explicitly emptied list stays empty.
pub fn seed_default_courses() -> Vec<CourseSession> {
    let course = |id: &str, name: &str, professor: &str, day: u32, start: &str, end: &str, week: &str| {
        CourseSession {
            id: id.to_string(),
            name: name.to_string(),
            professor: professor.to_string(),
            day_of_week: day,
            start_time: start.to_string(),
            end_time: end.to_string(),
            week_type: week.to_string(),
        }
    };

    vec![
        // یکشنبه
        course("c-1", "VLSI", "د. فرجی", 0, "09:00", "11:00", "all"),
        course("c-2", "معماری کامپیوتر پیشرفته", "د. بدری", 0, "11:00", "13:00", "all"),
        // دوشنبه — یک‌ستاره و دوستاره جای هم می‌نشینند
        course("c-3", "VLSI", "د. فرجی", 1, "11:00", "13:00", "odd"),
        course("c-4", "معماری کامپیوتر پیشرفته", "د. بدری", 1, "11:00", "13:00", "even"),
        course("c-5", "ابزار دقیق پیشرفته", "د. بدری", 1, "16:00", "18:00", "all"),
        // سه‌شنبه
        course("c-6", "ابزار دقیق پیشرفته", "د. بدری", 2, "14:00", "16:00", "even"),
    ]
}

// ---------------------------------------------------------------------------
// Daily language study
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanguageStudyState {
    #[serde(default = "default_true")]
    pub reminder_enabled: bool,
    #[serde(default = "default_lang_time")]
    pub reminder_time: String,
    #[serde(default = "default_lang_minutes")]
    pub target_minutes: u32,
    /// ISO dates with a completed study session (newest kept, max 400).
    #[serde(default)]
    pub completed_dates: Vec<String>,
    /// Student-editable goal: language, programming, thesis, exam prep, …
    #[serde(default = "default_study_title")]
    pub title: String,
}

fn default_lang_time() -> String {
    "20:30".to_string()
}

fn default_lang_minutes() -> u32 {
    60
}

pub fn default_study_title() -> String {
    "مطالعه روزانه زبان".to_string()
}

impl Default for LanguageStudyState {
    fn default() -> Self {
        Self {
            reminder_enabled: true,
            reminder_time: default_lang_time(),
            target_minutes: default_lang_minutes(),
            completed_dates: Vec::new(),
            title: default_study_title(),
        }
    }
}

// ---------------------------------------------------------------------------
// Root state
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppStateData {
    pub version: u32,
    pub profile: UserProfile,
    pub days: Vec<WorkoutDay>,
    pub weight_history: Vec<WeightEntry>,
    pub diet: DietState,
    pub milestones: Vec<Milestone>,
    /// ISO date of the last applied overload cycle.
    pub last_overload_date: String,
    pub overload_count: u32,
    /// Index of the day currently selected in the UI.
    pub active_day: usize,
    pub rest_seconds: u32,
    /// Derived per-day snapshots for the weekly calendar (newest first).
    /// `serde(default)` keeps every older saved file loading unchanged.
    #[serde(default)]
    pub activity_history: Vec<DailyActivity>,
    /// Deload week is on (weights were lowered for recovery).
    #[serde(default)]
    pub deload_active: bool,
    /// "high" | "normal" | "low"
    #[serde(default)]
    pub readiness: String,
    /// Best lift per exercise id.
    #[serde(default)]
    pub personal_records: std::collections::HashMap<String, PersonalRecord>,
    /// Before/after album (newest first).
    #[serde(default)]
    pub progress_photos: Vec<ProgressPhoto>,
    #[serde(default)]
    pub uni_reminders: UniReminders,
    /// Editable MSc timetable (see `seed_default_courses`).
    #[serde(default = "seed_default_courses")]
    pub courses: Vec<CourseSession>,
    /// `odd` (`*`) or `even` (`**`): which half of the fortnight is showing.
    #[serde(default = "default_semester_week")]
    pub semester_week_type: String,
    #[serde(default)]
    pub language_study: LanguageStudyState,
    /// Raw JSON imported from the AI shuttle-schedule template.
    #[serde(default)]
    pub custom_shuttle_json: Option<String>,
    /// `"dark"` | `"light"` — toggled from the header.
    #[serde(default = "default_theme")]
    pub theme: String,
    /// `"full"` (gym + uni) | `"uni_only"` (no workout tabs) | `"gym_only"`.
    #[serde(default = "default_app_mode")]
    pub app_mode: String,
    /// First-run wizard is shown once; explicit `false` in a legacy save too.
    #[serde(default)]
    pub onboarding_completed: bool,
}

pub fn default_theme() -> String {
    "dark".to_string()
}

pub fn default_app_mode() -> String {
    "full".to_string()
}

/// Bounded, trimmed free text so a bad paste cannot bloat the save file.
fn clean_text(value: &str, max_chars: usize) -> String {
    value.trim().chars().take(max_chars).collect::<String>()
}

impl AppStateData {
    /// Keep every exercise's `logs` vector in sync with its `sets` count.
    pub fn normalize(&mut self) {
        // ------------------------------------------------- look & modules
        // These run before the `days.is_empty()` early return: a student who
        // disabled the gym still needs a valid theme, app mode and profile.
        if !matches!(self.theme.as_str(), "dark" | "light") {
            self.theme = default_theme();
        }
        if !matches!(self.app_mode.as_str(), "full" | "uni_only" | "gym_only") {
            self.app_mode = default_app_mode();
        }
        self.profile.university_name = clean_text(&self.profile.university_name, 80);
        if self.profile.university_name.is_empty() {
            self.profile.university_name = default_uni_name();
        }
        self.profile.workout_program_id = clean_text(&self.profile.workout_program_id, 64);
        if self.profile.workout_program_id.is_empty() {
            self.profile.workout_program_id = default_program_id();
        }
        self.uni_reminders.food_reminder_day = self.uni_reminders.food_reminder_day.min(6);
        self.language_study.title = clean_text(&self.language_study.title, 80);
        if self.language_study.title.is_empty() {
            self.language_study.title = default_study_title();
        }

        // Calendar history: drop junk, keep the newest 90 days, clamp counters.
        self.activity_history.retain(|entry| !entry.date.is_empty());
        self.activity_history.sort_by(|a, b| b.date.cmp(&a.date));
        self.activity_history.truncate(90);
        for entry in self.activity_history.iter_mut() {
            entry.water_glasses = entry.water_glasses.min(30);
            entry.diet_total = entry.diet_total.min(20);
            entry.diet_done = entry.diet_done.min(entry.diet_total.max(5));
        }

        if !matches!(self.readiness.as_str(), "high" | "normal" | "low") {
            self.readiness = "normal".to_string();
        }
        self.progress_photos
            .retain(|photo| !photo.data_url.is_empty() && photo.data_url.len() <= 900_000);
        self.progress_photos.sort_by(|a, b| b.date.cmp(&a.date));
        self.progress_photos.truncate(24);

        self.uni_reminders
            .active_bus_alarms
            .retain(|key| !key.is_empty());
        self.uni_reminders.active_bus_alarms.sort();
        self.uni_reminders.active_bus_alarms.dedup();
        self.uni_reminders.active_bus_alarms.truncate(64);
        if !is_hhmm(&self.uni_reminders.thursday_food_time) {
            self.uni_reminders.thursday_food_time = default_thursday_time();
        }
        if !is_hhmm(&self.uni_reminders.gym_reminder_time) {
            self.uni_reminders.gym_reminder_time = default_gym_time();
        }

        // ------------------------------------------------- class schedule
        if !matches!(self.semester_week_type.as_str(), "odd" | "even") {
            self.semester_week_type = default_semester_week();
        }
        self.courses.retain(|course| !course.name.trim().is_empty());
        for course in self.courses.iter_mut() {
            course.name = course.name.trim().to_string();
            course.professor = course.professor.trim().to_string();
            if course.day_of_week > 6 {
                course.day_of_week = 0;
            }
            if !is_hhmm(&course.start_time) {
                course.start_time = default_course_start();
            }
            if !is_hhmm(&course.end_time) {
                course.end_time = default_course_end();
            }
            // An end before the start would render an empty bar: give it the
            // standard 2-hour slot instead of swapping the two values.
            if course.end_time <= course.start_time {
                course.end_time = plus_minutes(&course.start_time, 120);
            }
            if !matches!(course.week_type.as_str(), "all" | "odd" | "even") {
                course.week_type = default_week_type();
            }
            if course.id.trim().is_empty() {
                course.id = format!("c-{}-{}", course.day_of_week, course.start_time);
            }
        }
        self.courses.truncate(60);

        // ------------------------------------------------- language study
        if !is_hhmm(&self.language_study.reminder_time) {
            self.language_study.reminder_time = default_lang_time();
        }
        self.language_study.target_minutes = self.language_study.target_minutes.clamp(10, 180);
        self.language_study
            .completed_dates
            .retain(|date| !date.trim().is_empty());
        self.language_study.completed_dates.sort();
        self.language_study.completed_dates.dedup();
        // Keep the newest dates only; the list is append-only and grows forever.
        let excess = self
            .language_study
            .completed_dates
            .len()
            .saturating_sub(400);
        if excess > 0 {
            self.language_study.completed_dates.drain(0..excess);
        }

        // Imported shuttle JSON: reject anything that is not a small JSON object
        // so a bad paste can never bloat the save file.
        if let Some(raw) = self.custom_shuttle_json.clone() {
            let trimmed = raw.trim();
            let parsed = serde_json::from_str::<serde_json::Value>(trimmed).ok();
            let valid = trimmed.len() <= 20_000
                && parsed.map(|value| value.is_object()).unwrap_or(false);
            self.custom_shuttle_json = if valid {
                Some(trimmed.to_string())
            } else {
                None
            };
        }

        if self.days.is_empty() {
            return;
        }
        if self.active_day >= self.days.len() {
            self.active_day = 0;
        }
        if self.rest_seconds < 15 || self.rest_seconds > 600 {
            self.rest_seconds = DEFAULT_REST_SECONDS;
        }
        if self.profile.target_weight <= 0.0 {
            self.profile.target_weight = 75.0;
        }
        // Older installs carry a 6-item grocery list (egg/budget bulking).
        // Only those exact legacy rows are migrated: a student may now pick a
        // different template, add custom meals or delete rows, and every one of
        // those lists must survive a save/load cycle untouched.
        // Deliberately short, distinctive substrings: matching "تخممرغ" would
        // also nuke a student's own "تخممرغ آبپز" custom meal.
        let legacy_markers = [
            "بمب پروتئین",
            "عدسی یا خوراک سویا",
            "وعده کامل سلف دانشگاه",
        ];
        let legacy_diet = self.diet.items.is_empty()
            || self.diet.items.iter().any(|item| {
                legacy_markers
                    .iter()
                    .any(|marker| item.text.contains(marker))
            });
        if legacy_diet {
            self.diet.items = default_diet_items();
        }
        self.diet.items.retain(|item| !item.text.trim().is_empty());
        self.diet.items.truncate(20);
        for (index, item) in self.diet.items.iter_mut().enumerate() {
            item.text = clean_text(&item.text, 160);
            item.hint = clean_text(&item.hint, 200);
            if item.id.trim().is_empty() {
                item.id = format!("diet-custom-{index}");
            }
        }
        self.diet.water_glasses = self.diet.water_glasses.min(20);
        if self.diet.water_reminder_minutes < 15 || self.diet.water_reminder_minutes > 240 {
            self.diet.water_reminder_minutes = default_water_interval();
        }
        // A disabled reminder carries no deadline; a negative one is junk.
        if !self.diet.water_reminder_enabled || self.diet.water_reminder_next_at < 0 {
            self.diet.water_reminder_next_at = 0;
        }

        let gifs = default_gifs();
        let today = crate::timeutil::today_iso();
        for day in self.days.iter_mut() {
            let day_id = day.id.clone();
            for warmup in day.warmups.iter_mut() {
                // A missing/blank/hotlinked demo is replaced by the bundled
                // file: `fitnessprogramer.com` answers 403 inside the WebView.
                if gif_needs_replacement(warmup.gif_url.as_deref()) {
                    warmup.gif_url = gifs
                        .warmups
                        .get(&format!("{day_id}:{}", warmup.id))
                        .cloned();
                }
            }
            for exercise in day.exercises.iter_mut() {
                // A "machine is busy" swap only covers the day it was made on.
                // Opening the app on a new date restores the programmed move.
                if let Some(swapped_on) = exercise.swapped_date.clone() {
                    if swapped_on != today {
                        exercise.restore_original();
                    }
                }
                exercise.sets = exercise.sets.clamp(1, 12);
                // Users on a Persian/Android keyboard may type "۱۰-۱۲"; keep the
                // stored prescription in ASCII digits so increment_reps works.
                exercise.reps = to_ascii_digits(&exercise.reps);
                if gif_needs_replacement(exercise.gif_url.as_deref()) {
                    // A swapped movement shows its own substitute demo; the
                    // programmed one stays in `original_gif_url` for the reset.
                    exercise.gif_url = if exercise.is_swapped() {
                        Some(format!("/gifs/{}-alt.gif", exercise.id))
                    } else {
                        gifs.exercises.get(&exercise.id).cloned()
                    };
                }
                if exercise.is_swapped()
                    && gif_needs_replacement(exercise.original_gif_url.as_deref())
                {
                    exercise.original_gif_url = Some(format!("/gifs/{}.gif", exercise.id));
                }
                exercise.sync_logs();
            }
        }
    }

    pub fn push_milestone(&mut self, date: &str, text: impl Into<String>, kind: &str) {
        self.milestones.insert(
            0,
            Milestone {
                id: next_milestone_id(),
                date: date.to_string(),
                text: text.into(),
                kind: kind.to_string(),
            },
        );
        // Keep the log tidy; the UI only shows the recent history anyway.
        self.milestones.truncate(60);
    }
}

// ---------------------------------------------------------------------------
// Progressive overload
// ---------------------------------------------------------------------------

/// Weight step applied to every loaded exercise each cycle.
pub const OVERLOAD_STEP_KG: f32 = 2.5;

/// Applies one progressive-overload cycle and returns how many exercises moved.
///
/// * Loaded exercises: `+2.5 kg` on the working weight.
/// * Bodyweight exercises: `+1` rep on the prescribed rep range.
/// * Logged sets are cleared so the new cycle starts from a clean slate.
pub fn apply_overload(state: &mut AppStateData) -> usize {
    let mut changed = 0usize;

    for day in state.days.iter_mut() {
        // A new cycle starts from a clean slate: warm-up checkboxes included.
        for warmup in day.warmups.iter_mut() {
            warmup.done = false;
        }
        for exercise in day.exercises.iter_mut() {
            if exercise.bodyweight || exercise.target_weight <= 0.0 {
                let bumped = increment_reps(&exercise.reps);
                if bumped != exercise.reps {
                    exercise.reps = bumped;
                    changed += 1;
                }
            } else {
                exercise.target_weight = round_step(exercise.target_weight + OVERLOAD_STEP_KG);
                changed += 1;
            }
            // Fresh cycle: clear the per-set checkmarks and pre-fill new targets.
            exercise.logs.clear();
            exercise.sync_logs();
        }
    }

    changed
}

/// Rounds to the nearest 2.5 kg plate step.
pub fn round_step(value: f32) -> f32 {
    let step = OVERLOAD_STEP_KG;
    ((value / step).round() * step * 10.0).round() / 10.0
}

/// Increments the rep prescription found in a string.
///
/// A range shifts as a whole so its width is preserved:
/// `"8-10"` → `"9-11"`, `"12"` → `"13"`, `"10 هر پا"` → `"11 هر پا"`,
/// `"حداکثر توان"` → unchanged.
pub fn increment_reps(reps: &str) -> String {
    let chars: Vec<char> = reps.chars().collect();

    let Some(start) = chars.iter().position(|c| c.is_ascii_digit()) else {
        return reps.to_string();
    };

    let mut end = start;
    while end < chars.len() && chars[end].is_ascii_digit() {
        end += 1;
    }
    let first: u32 = chars[start..end]
        .iter()
        .collect::<String>()
        .parse()
        .unwrap_or(0);

    // Look for a range separator right after the first number ("8-10", "8 - 10").
    let mut cursor = end;
    while cursor < chars.len() && chars[cursor] == ' ' {
        cursor += 1;
    }
    let mut second: Option<(u32, usize, usize)> = None;
    if cursor < chars.len() && (chars[cursor] == '-' || chars[cursor] == '–') {
        let mut second_start = cursor + 1;
        while second_start < chars.len() && chars[second_start] == ' ' {
            second_start += 1;
        }
        let mut second_end = second_start;
        while second_end < chars.len() && chars[second_end].is_ascii_digit() {
            second_end += 1;
        }
        if second_end > second_start {
            let value: u32 = chars[second_start..second_end]
                .iter()
                .collect::<String>()
                .parse()
                .unwrap_or(0);
            second = Some((value, second_start, second_end));
        }
    }

    let mut out: String = chars[..start].iter().collect();
    out.push_str(&(first + 1).to_string());

    match second {
        Some((value, second_start, second_end)) => {
            out.extend(chars[end..second_start].iter());
            out.push_str(&(value + 1).to_string());
            out.extend(chars[second_end..].iter());
        }
        None => out.extend(chars[end..].iter()),
    }

    out
}

/// First integer in a rep prescription, if any.
pub fn parse_first_number(reps: &str) -> Option<u32> {
    let mut digits = String::new();
    for c in reps.chars() {
        if c.is_ascii_digit() {
            digits.push(c);
        } else if !digits.is_empty() {
            break;
        }
    }
    digits.parse().ok()
}

/// Animated demos shipped with the programme (`src/data/default-gifs.json`).
///
/// The same JSON is imported by the frontend, so the two layers cannot drift.
/// Warm-up ids repeat across days, hence the `"<day-id>:<warmup-id>"` key.
const DEFAULT_GIFS_JSON: &str = include_str!("../../src/data/default-gifs.json");

#[derive(Debug, Default, serde::Deserialize)]
struct DefaultGifs {
    #[serde(default)]
    exercises: std::collections::HashMap<String, String>,
    #[serde(default)]
    warmups: std::collections::HashMap<String, String>,
}

fn default_gifs() -> &'static DefaultGifs {
    static CACHE: std::sync::OnceLock<DefaultGifs> = std::sync::OnceLock::new();
    CACHE.get_or_init(|| serde_json::from_str(DEFAULT_GIFS_JSON).unwrap_or_default())
}

/// Converts Persian (`۰-۹`) and Arabic-Indic (`٠-٩`) digits to ASCII digits.
///
/// Android keyboards in Persian mode type those glyphs, and every numeric
/// parser in this crate (`increment_reps`, `parse_first_number`) expects ASCII.
pub fn to_ascii_digits(input: &str) -> String {
    input
        .chars()
        .map(|c| match c {
            '\u{06F0}'..='\u{06F9}' => char::from_u32('0' as u32 + (c as u32 - 0x06F0)).unwrap_or(c),
            '\u{0660}'..='\u{0669}' => char::from_u32('0' as u32 + (c as u32 - 0x0660)).unwrap_or(c),
            other => other,
        })
        .collect()
}

/// Unique milestone id: epoch millis plus a process-local counter, so the
/// `truncate(60)` in `push_milestone` can never produce duplicate ids.
fn next_milestone_id() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);

    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis())
        .unwrap_or(0);
    let seq = COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("ms-{millis}-{seq}")
}

/// Converts latin digits inside a string to Persian digits for display text.
pub fn to_persian_digits(input: &str) -> String {
    input
        .chars()
        .map(|c| match c {
            '0' => '۰',
            '1' => '۱',
            '2' => '۲',
            '3' => '۳',
            '4' => '۴',
            '5' => '۵',
            '6' => '۶',
            '7' => '۷',
            '8' => '۸',
            '9' => '۹',
            other => other,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn increments_rep_ranges() {
        assert_eq!(increment_reps("8-10"), "9-11");
        assert_eq!(increment_reps("12"), "13");
        assert_eq!(increment_reps("10 هر پا"), "11 هر پا");
        assert_eq!(increment_reps("حداکثر توان"), "حداکثر توان");
    }

    #[test]
    fn rounds_to_plate_steps() {
        assert_eq!(round_step(12.5 + 2.5), 15.0);
        assert_eq!(round_step(11.0 + 2.5), 12.5);
    }

    #[test]
    fn normalises_persian_digits() {
        assert_eq!(to_ascii_digits("۱۰-۱۲"), "10-12");
        assert_eq!(to_ascii_digits("٦٧٫٥"), "67٫5");
        assert_eq!(increment_reps(&to_ascii_digits("۱۰-۱۲")), "11-13");
    }

    #[test]
    fn milestone_ids_are_unique() {
        let mut state = AppStateData {
            version: STATE_VERSION,
            profile: UserProfile::default(),
            days: Vec::new(),
            weight_history: Vec::new(),
            diet: DietState {
                items: Vec::new(),
                last_reset_date: String::new(),
                water_glasses: 0,
                water_reminder_enabled: false,
                water_reminder_minutes: default_water_interval(),
                water_reminder_next_at: 0,
            },
            milestones: Vec::new(),
            last_overload_date: String::new(),
            overload_count: 0,
            active_day: 0,
            rest_seconds: DEFAULT_REST_SECONDS,
            activity_history: Vec::new(),
            deload_active: false,
            readiness: String::new(),
            personal_records: std::collections::HashMap::new(),
            progress_photos: Vec::new(),
            uni_reminders: UniReminders::default(),
            courses: Vec::new(),
            semester_week_type: default_semester_week(),
            language_study: LanguageStudyState::default(),
            custom_shuttle_json: None,
            theme: default_theme(),
            app_mode: default_app_mode(),
            onboarding_completed: true,
        };
        for index in 0..80 {
            state.push_milestone("2026-01-01", format!("event {index}"), "system");
        }
        let unique: std::collections::HashSet<&str> =
            state.milestones.iter().map(|m| m.id.as_str()).collect();
        assert_eq!(unique.len(), state.milestones.len());
    }

    #[test]
    fn normalize_injects_bundled_gifs() {
        let mut state = crate::storage::seed();
        state.days[0].exercises[0].gif_url = None;
        state.days[0].warmups[0].gif_url = None;
        state.normalize();

        assert_eq!(
            state.days[0].exercises[0].gif_url.as_deref(),
            Some("/gifs/d1e1.gif")
        );
        // Day 1 warm-ups use the upper-body set.
        assert_eq!(
            state.days[0].warmups[0].gif_url.as_deref(),
            Some("/gifs/wu-u1.gif")
        );
        // Day 4 warm-ups use the lower-body set.
        assert_eq!(
            state.days[3].warmups[0].gif_url.as_deref(),
            Some("/gifs/wu-l1.gif")
        );
    }

    #[test]
    fn cloudflare_blocked_hotlinks_are_migrated_to_the_bundle() {
        // Exactly what a phone that has been running the old build stores.
        let mut state = crate::storage::seed();
        state.days[0].exercises[0].gif_url =
            Some("https://fitnessprogramer.com/wp-content/uploads/2021/02/Incline-Dumbbell-Press.gif".to_string());
        state.days[0].exercises[1].gif_url = Some(String::new());
        state.days[0].exercises[2].gif_url = Some("https://example.com/custom.gif".to_string());
        state.days[1].warmups[0].gif_url =
            Some("https://fitnessprogramer.com/wp-content/uploads/2021/06/Bike.gif".to_string());

        state.normalize();

        assert_eq!(
            state.days[0].exercises[0].gif_url.as_deref(),
            Some("/gifs/d1e1.gif")
        );
        assert_eq!(
            state.days[0].exercises[1].gif_url.as_deref(),
            Some("/gifs/d1e2.gif")
        );
        // A user-supplied direct link is left alone.
        assert_eq!(
            state.days[0].exercises[2].gif_url.as_deref(),
            Some("https://example.com/custom.gif")
        );
        assert_eq!(
            state.days[1].warmups[0].gif_url.as_deref(),
            Some("/gifs/wu-l1.gif")
        );
    }

    #[test]
    fn swapped_exercise_resets_on_a_new_day() {
        let mut state = crate::storage::seed();
        state.normalize(); // bundled GIFs are injected before the swap is made
        let original = state.days[0].exercises[0].clone();

        {
            let exercise = &mut state.days[0].exercises[0];
            exercise.swapped_date = Some("1999-01-01".to_string());
            exercise.original_name = Some(original.name.clone());
            exercise.original_query = Some(original.query.clone());
            exercise.original_gif_url = original.gif_url.clone();
            exercise.original_tip = Some(original.tip.clone());
            exercise.name = "پرس سینه دستگاه (نشسته)".to_string();
            exercise.query = "Chest Press Machine gif".to_string();
            exercise.gif_url = Some("https://example.com/alt.gif".to_string());
            exercise.tip = "نکته جایگزین".to_string();
        }

        state.normalize();

        let exercise = &state.days[0].exercises[0];
        assert_eq!(exercise.name, original.name);
        assert_eq!(exercise.query, original.query);
        assert_eq!(exercise.gif_url, original.gif_url);
        assert_eq!(exercise.tip, original.tip);
        assert!(!exercise.is_swapped());
        assert!(exercise.swapped_date.is_none());
        assert!(exercise.original_name.is_none());
    }

    #[test]
    fn swapped_exercise_shows_the_alternative_demo() {
        let mut state = crate::storage::seed();
        state.normalize();
        let original = state.days[0].exercises[0].clone();
        {
            let exercise = &mut state.days[0].exercises[0];
            exercise.swapped_date = Some(crate::timeutil::today_iso());
            exercise.original_name = Some(original.name.clone());
            exercise.name = "حرکت جایگزین".to_string();
            // A save from the previous (SVG) bundle.
            exercise.gif_url = Some("/gifs/d1e1.svg".to_string());
            exercise.original_gif_url = Some("/gifs/d1e1.svg".to_string());
        }

        state.normalize();

        let exercise = &state.days[0].exercises[0];
        assert_eq!(exercise.gif_url.as_deref(), Some("/gifs/d1e1-alt.gif"));
        assert_eq!(exercise.original_gif_url.as_deref(), Some("/gifs/d1e1.gif"));
    }

    #[test]
    fn swapped_exercise_survives_within_the_same_day() {
        let mut state = crate::storage::seed();
        state.normalize();
        {
            let exercise = &mut state.days[0].exercises[0];
            exercise.swapped_date = Some(crate::timeutil::today_iso());
            exercise.original_name = Some("حرکت اصلی".to_string());
            exercise.name = "حرکت جایگزین".to_string();
        }

        state.normalize();

        let exercise = &state.days[0].exercises[0];
        assert_eq!(exercise.name, "حرکت جایگزین");
        assert!(exercise.is_swapped());
    }

    #[test]
    fn legacy_diet_is_migrated_to_cafeteria_plan() {
        let mut state = crate::storage::seed();
        state.diet.items = vec![DietItem {
            id: "diet-1".to_string(),
            text: "۳ تا ۴ عدد تخم‌مرغ کامل (ارزان‌ترین بمب پروتئین)".to_string(),
            hint: String::new(),
            done: true,
        }];
        state.normalize();

        assert_eq!(state.diet.items.len(), 5);
        assert!(state.diet.items[0].text.contains("صبحانه سلف"));
        assert!(state.diet.items.iter().all(|item| !item.done));
        assert_eq!(state.diet.water_reminder_minutes, 60);
    }

    #[test]
    fn legacy_state_without_activity_history_loads() {
        // Existing gym_state.json files predate the calendar field.
        let mut value = serde_json::to_value(crate::storage::seed()).unwrap();
        value.as_object_mut().unwrap().remove("activityHistory");
        let state: AppStateData = serde_json::from_value(value).unwrap();
        assert!(state.activity_history.is_empty());
    }

    #[test]
    fn legacy_state_gets_the_msc_timetable() {
        // Saves written before the class schedule existed must not open empty.
        let mut value = serde_json::to_value(crate::storage::seed()).unwrap();
        let object = value.as_object_mut().unwrap();
        object.remove("courses");
        object.remove("semesterWeekType");
        object.remove("languageStudy");
        let state: AppStateData = serde_json::from_value(value).unwrap();

        assert_eq!(state.courses.len(), 6);
        assert_eq!(state.semester_week_type, "odd");
        assert!(state.language_study.reminder_enabled);
        assert_eq!(state.language_study.reminder_time, "20:30");
        assert_eq!(state.language_study.target_minutes, 60);
        // The * / ** pair share Monday 11:00 so the switch has something to show.
        let monday: Vec<&CourseSession> = state
            .courses
            .iter()
            .filter(|course| course.day_of_week == 1)
            .collect();
        assert!(monday.iter().any(|course| course.week_type == "odd"));
        assert!(monday.iter().any(|course| course.week_type == "even"));
    }

    #[test]
    fn an_explicitly_empty_timetable_stays_empty() {
        let mut state = crate::storage::seed();
        state.courses.clear();
        state.normalize();
        assert!(state.courses.is_empty());
    }

    #[test]
    fn course_rows_are_sanitised() {
        let mut state = crate::storage::seed();
        state.courses = vec![
            CourseSession {
                id: String::new(),
                name: "  شبکه  ".to_string(),
                professor: " د. احمدی ".to_string(),
                day_of_week: 9,
                start_time: "25:00".to_string(),
                end_time: "08:00".to_string(),
                week_type: "weekly".to_string(),
            },
            CourseSession {
                id: "c-x".to_string(),
                name: "   ".to_string(),
                professor: String::new(),
                day_of_week: 3,
                start_time: "10:00".to_string(),
                end_time: "12:00".to_string(),
                week_type: "all".to_string(),
            },
        ];
        state.semester_week_type = "banana".to_string();
        state.language_study.target_minutes = 5;
        state.language_study.reminder_time = "9:5".to_string();
        state.custom_shuttle_json = Some("  {not json".to_string());

        state.normalize();

        // The nameless row is dropped, the rest is repaired.
        assert_eq!(state.courses.len(), 1);
        let course = &state.courses[0];
        assert_eq!(course.name, "شبکه");
        assert_eq!(course.professor, "د. احمدی");
        assert_eq!(course.day_of_week, 0);
        assert_eq!(course.start_time, "09:00");
        assert_eq!(course.end_time, "11:00");
        assert_eq!(course.week_type, "all");
        assert!(!course.id.is_empty());

        assert_eq!(state.semester_week_type, "odd");
        assert_eq!(state.language_study.target_minutes, 10);
        assert_eq!(state.language_study.reminder_time, "20:30");
        assert!(state.custom_shuttle_json.is_none());
    }

    #[test]
    fn imported_shuttle_json_is_kept_when_it_looks_like_an_object() {
        let mut state = crate::storage::seed();
        let raw = r#"{"effectiveDate":"1405/08/23","railway":{},"suburbs":[]}"#;
        state.custom_shuttle_json = Some(format!("  {raw}  "));
        state.normalize();
        assert_eq!(state.custom_shuttle_json.as_deref(), Some(raw));
    }

    #[test]
    fn activity_history_is_sorted_and_trimmed() {
        let mut state = crate::storage::seed();
        for index in 0..120 {
            state.activity_history.push(DailyActivity {
                date: format!("2026-01-{:02}", (index % 28) + 1),
                ..Default::default()
            });
        }
        state.normalize();

        assert_eq!(state.activity_history.len(), 90);
        assert!(state
            .activity_history
            .windows(2)
            .all(|pair| pair[0].date >= pair[1].date));
    }

    #[test]
    fn legacy_diet_without_next_at_loads() {
        // Saves written before the persistent timer have no waterReminderNextAt.
        let mut value = serde_json::to_value(crate::storage::seed()).unwrap();
        value["diet"]
            .as_object_mut()
            .unwrap()
            .remove("waterReminderNextAt");
        let mut state: AppStateData = serde_json::from_value(value).unwrap();

        assert_eq!(state.diet.water_reminder_next_at, 0);
        state.normalize();
        assert_eq!(state.diet.water_reminder_next_at, 0);
    }

    #[test]
    fn disabled_reminder_drops_stale_deadline() {
        let mut state = crate::storage::seed();
        state.diet.water_reminder_enabled = false;
        state.diet.water_reminder_next_at = 1_900_000_000_000;
        state.normalize();
        assert_eq!(state.diet.water_reminder_next_at, 0);

        state.diet.water_reminder_enabled = true;
        state.diet.water_reminder_next_at = 1_900_000_000_000;
        state.normalize();
        assert_eq!(state.diet.water_reminder_next_at, 1_900_000_000_000);
    }

    #[test]
    fn legacy_state_defaults_new_gym_fields() {
        let mut value = serde_json::to_value(crate::storage::seed()).unwrap();
        for key in [
            "deloadActive",
            "readiness",
            "personalRecords",
            "progressPhotos",
            "uniReminders",
        ] {
            value.as_object_mut().unwrap().remove(key);
        }
        let mut state: AppStateData = serde_json::from_value(value).unwrap();

        assert!(!state.deload_active);
        assert!(state.readiness.is_empty());
        assert!(state.personal_records.is_empty());
        assert!(state.progress_photos.is_empty());
        assert!(state.uni_reminders.thursday_food_enabled);

        state.normalize();
        assert_eq!(state.readiness, "normal");
        assert_eq!(state.uni_reminders.thursday_food_time, "12:00");
    }

    #[test]
    fn uni_reminders_and_photos_are_sanitised() {
        let mut state = crate::storage::seed();
        state.uni_reminders.active_bus_alarms =
            vec!["b".into(), "a".into(), "a".into(), "".into()];
        state.uni_reminders.thursday_food_time = "99:99".into();
        state.uni_reminders.gym_reminder_time = "nope".into();
        state.progress_photos = vec![ProgressPhoto {
            id: "1".into(),
            date: "2026-01-01".into(),
            weight: 65.0,
            data_url: String::new(),
            note: String::new(),
        }];

        state.normalize();

        assert_eq!(
            state.uni_reminders.active_bus_alarms,
            vec!["a".to_string(), "b".to_string()]
        );
        assert_eq!(state.uni_reminders.thursday_food_time, "12:00");
        assert_eq!(state.uni_reminders.gym_reminder_time, "16:30");
        assert!(state.progress_photos.is_empty());
    }

    #[test]
    fn parses_first_number() {
        assert_eq!(parse_first_number("12-15"), Some(12));
        assert_eq!(parse_first_number("حداکثر توان"), None);
    }

    #[test]
    fn legacy_state_gets_theme_modes_and_generic_university() {
        let mut value = serde_json::to_value(crate::storage::seed()).unwrap();
        let object = value.as_object_mut().unwrap();
        for key in [
            "theme",
            "appMode",
            "onboardingCompleted",
            "universityName",
            "workoutProgramId",
            "foodReminderDay",
            "studyTitle",
        ] {
            object.remove(key);
        }
        value["profile"].as_object_mut().unwrap().remove("universityName");
        value["profile"].as_object_mut().unwrap().remove("workoutProgramId");
        value["uniReminders"].as_object_mut().unwrap().remove("foodReminderDay");
        value["languageStudy"].as_object_mut().unwrap().remove("title");

        let state: AppStateData = serde_json::from_value(value).unwrap();
        assert_eq!(state.theme, "dark");
        assert_eq!(state.app_mode, "full");
        assert!(!state.onboarding_completed);
        assert_eq!(state.profile.university_name, "دانشگاه من");
        assert_eq!(state.profile.workout_program_id, "upper-lower-4");
        assert_eq!(state.uni_reminders.food_reminder_day, 4);
        assert_eq!(state.language_study.title, "مطالعه روزانه زبان");
    }

    #[test]
    fn app_settings_are_sanitised() {
        let mut state = crate::storage::seed();
        state.theme = "neon".to_string();
        state.app_mode = "banana".to_string();
        state.profile.university_name = "   ".to_string();
        state.profile.workout_program_id = String::new();
        state.uni_reminders.food_reminder_day = 42;
        state.language_study.title = "  ".to_string();

        state.normalize();

        assert_eq!(state.theme, "dark");
        assert_eq!(state.app_mode, "full");
        assert_eq!(state.profile.university_name, "دانشگاه من");
        assert_eq!(state.profile.workout_program_id, "upper-lower-4");
        assert_eq!(state.uni_reminders.food_reminder_day, 6);
        assert_eq!(state.language_study.title, "مطالعه روزانه زبان");

        state.theme = "light".to_string();
        state.app_mode = "uni_only".to_string();
        state.profile.university_name = "دانشگاه تهران".to_string();
        state.uni_reminders.food_reminder_day = 2;
        state.language_study.title = "پایان\u{200c}نامه".to_string();
        state.normalize();
        assert_eq!(state.theme, "light");
        assert_eq!(state.app_mode, "uni_only");
        assert_eq!(state.profile.university_name, "دانشگاه تهران");
        assert_eq!(state.uni_reminders.food_reminder_day, 2);
        assert_eq!(state.language_study.title, "پایان\u{200c}نامه");
    }

    #[test]
    fn custom_diet_template_survives_a_save_cycle() {
        let mut state = crate::storage::seed();
        state.diet.items = vec![
            DietItem {
                id: "diet-1".to_string(),
                text: "صبحانه خانه: املت و نان".to_string(),
                hint: String::new(),
                done: true,
            },
            DietItem {
                id: "diet-4".to_string(),
                text: "نوشیدن ۸ لیوان آب".to_string(),
                hint: String::new(),
                done: false,
            },
            DietItem {
                id: "custom-1".to_string(),
                text: "تخم\u{200c}مرغ آب\u{200c}پز + کراتین".to_string(),
                hint: "مکمل دلخواه".to_string(),
                done: false,
            },
        ];

        state.normalize();

        assert_eq!(state.diet.items.len(), 3);
        assert_eq!(state.diet.items[0].text, "صبحانه خانه: املت و نان");
        assert_eq!(state.diet.items[2].id, "custom-1");
        assert!(state.diet.items[0].done, "ticks must survive a reload");
    }
}
