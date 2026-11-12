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
}

fn default_true() -> bool {
    true
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
}

impl AppStateData {
    /// Keep every exercise's `logs` vector in sync with its `sets` count.
    pub fn normalize(&mut self) {
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
        // Older installs carry the 6-item grocery list; swap it for the 3-meal
        // cafeteria plan without asking the user to reset anything.
        let legacy_diet = self.diet.items.len() != 5
            || self
                .diet
                .items
                .iter()
                .any(|item| item.text.contains("تخم‌مرغ"));
        if legacy_diet {
            self.diet.items = default_diet_items();
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
        for day in self.days.iter_mut() {
            let day_id = day.id.clone();
            for warmup in day.warmups.iter_mut() {
                if warmup.gif_url.is_none() {
                    warmup.gif_url = gifs
                        .warmups
                        .get(&format!("{day_id}:{}", warmup.id))
                        .cloned();
                }
            }
            for exercise in day.exercises.iter_mut() {
                exercise.sets = exercise.sets.clamp(1, 12);
                // Users on a Persian/Android keyboard may type "۱۰-۱۲"; keep the
                // stored prescription in ASCII digits so increment_reps works.
                exercise.reps = to_ascii_digits(&exercise.reps);
                if exercise.gif_url.is_none() {
                    exercise.gif_url = gifs.exercises.get(&exercise.id).cloned();
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
        };
        for index in 0..80 {
            state.push_milestone("2026-01-01", format!("event {index}"), "system");
        }
        let unique: std::collections::HashSet<&str> =
            state.milestones.iter().map(|m| m.id.as_str()).collect();
        assert_eq!(unique.len(), state.milestones.len());
    }

    #[test]
    fn normalize_injects_default_gifs() {
        let mut state = crate::storage::seed();
        state.days[0].exercises[0].gif_url = None;
        state.days[0].warmups[0].gif_url = None;
        state.normalize();

        assert!(state.days[0].exercises[0].gif_url.is_some());
        assert!(state.days[0].warmups[0].gif_url.is_some());
        // An explicitly cleared gif (empty string) must stay cleared.
        state.days[0].exercises[1].gif_url = Some(String::new());
        state.normalize();
        assert_eq!(state.days[0].exercises[1].gif_url.as_deref(), Some(""));
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
}
