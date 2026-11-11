//! Tauri v2 command surface for the Persian hypertrophy tracker.
//!
//! All commands take an `AppHandle` so the storage layer can resolve the
//! per-platform app-data directory, and every command returns the full
//! `AppStateData` (except `save_app_state`) so the UI can stay in sync with a
//! single round-trip.

mod models;
mod storage;
mod timeutil;

use tauri::AppHandle;

use models::{
    apply_overload, to_persian_digits, AppStateData, WeightEntry, OVERLOAD_CYCLE_DAYS,
};

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Loads the persisted state, seeding the 4-day Persian programme on first run.
#[tauri::command]
fn get_app_state(app: AppHandle) -> Result<AppStateData, String> {
    storage::load(&app)
}

/// Persists the whole state. Called by the UI after every meaningful mutation.
#[tauri::command]
fn save_app_state(app: AppHandle, state: AppStateData) -> Result<(), String> {
    let mut state = state;
    state.normalize();
    storage::save(&app, &state)
}

/// Applies the 2-week progressive-overload rule.
///
/// Loaded lifts get `+2.5 kg`, bodyweight lifts get `+1` prescribed rep,
/// `last_overload_date` moves to today, a milestone is logged and the state is
/// written back to disk before being returned.
#[tauri::command]
fn apply_progressive_overload(app: AppHandle) -> Result<AppStateData, String> {
    let mut state = storage::load(&app)?;
    let today = timeutil::today_iso();

    let changed = apply_overload(&mut state);
    if changed == 0 {
        return Err("هیچ حرکتی برای افزایش وزنه پیدا نشد.".to_string());
    }

    state.last_overload_date = today.clone();
    state.overload_count = state.overload_count.saturating_add(1);

    let text = format!(
        "چرخه {} افزایش وزنه اعمال شد: {} حرکت به‌روزرسانی شد (\u{200E}+۲٫۵ کیلوگرم / \u{200E}+۱ تکرار).",
        to_persian_digits(&state.overload_count.to_string()),
        to_persian_digits(&changed.to_string())
    );
    state.push_milestone(&today, text, "overload");

    storage::save(&app, &state)?;
    Ok(state)
}

/// Records today's body weight and appends it to the 65 → 75 kg history.
#[tauri::command]
fn log_body_weight(app: AppHandle, weight: f32) -> Result<AppStateData, String> {
    if !weight.is_finite() || !(25.0..=300.0).contains(&weight) {
        return Err("وزن وارد شده معتبر نیست (بین ۲۵ تا ۳۰۰ کیلوگرم).".to_string());
    }

    let mut state = storage::load(&app)?;
    let today = timeutil::today_iso();
    let rounded = (weight * 10.0).round() / 10.0;
    let previous = state.profile.current_weight;

    state.profile.current_weight = rounded;

    match state.weight_history.iter_mut().find(|entry| entry.date == today) {
        Some(entry) => entry.weight = rounded,
        None => state.weight_history.push(WeightEntry {
            date: today.clone(),
            weight: rounded,
        }),
    }
    state
        .weight_history
        .sort_by(|a, b| a.date.cmp(&b.date));
    // Keep the history bounded (roughly a year of daily entries).
    if state.weight_history.len() > 400 {
        let overflow = state.weight_history.len() - 400;
        state.weight_history.drain(0..overflow);
    }

    let target = state.profile.target_weight;
    if rounded >= target && previous < target {
        let text = format!(
            "به هدف {} کیلوگرمی رسیدی! حالا هدف بعدی: کیفیت عضله و حفظ وزن.",
            to_persian_digits(&format!("{target:.1}"))
        );
        state.push_milestone(&today, text, "goal");
    } else if previous != rounded {
        let text = format!(
            "وزن امروز ثبت شد: {} کیلوگرم ({} کیلوگرم نسبت به ثبت قبلی).",
            to_persian_digits(&format!("{rounded:.1}")),
            to_persian_digits(&format!("\u{200E}{:+.1}", rounded - previous))
        );
        state.push_milestone(&today, text, "weight");
    }

    storage::save(&app, &state)?;
    Ok(state)
}

/// Restores the default 4-day plan while keeping the user's progress history.
#[tauri::command]
fn reset_to_defaults(app: AppHandle) -> Result<AppStateData, String> {
    let current = storage::load(&app)?;
    let mut fresh = storage::seed();
    let today = timeutil::today_iso();

    // Keep the whole profile — only the workout plan is reset.
    fresh.profile = current.profile.clone();
    if !current.weight_history.is_empty() {
        fresh.weight_history = current.weight_history;
    }
    fresh.diet = current.diet;
    fresh.milestones = current.milestones;
    fresh.overload_count = current.overload_count;
    fresh.last_overload_date = current.last_overload_date;
    fresh.rest_seconds = current.rest_seconds;
    fresh.active_day = current.active_day.min(fresh.days.len().saturating_sub(1));

    fresh.push_milestone(&today, "برنامه تمرینی به حالت پیش‌فرض بازگشت.", "system");

    storage::save(&app, &fresh)?;
    Ok(fresh)
}

/// Days remaining until the next 2-week overload cycle (handy for widgets).
#[tauri::command]
fn overload_status(app: AppHandle) -> Result<i64, String> {
    let state = storage::load(&app)?;
    let today = timeutil::today_iso();
    let elapsed = chrono::NaiveDate::parse_from_str(&state.last_overload_date, "%Y-%m-%d")
        .ok()
        .and_then(|last| {
            chrono::NaiveDate::parse_from_str(&today, "%Y-%m-%d")
                .ok()
                .map(|now| (now - last).num_days())
        })
        .unwrap_or(OVERLOAD_CYCLE_DAYS);
    Ok((OVERLOAD_CYCLE_DAYS - elapsed).max(0))
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_app_state,
            save_app_state,
            apply_progressive_overload,
            log_body_weight,
            reset_to_defaults,
            overload_status
        ])
        .setup(|app| {
            // Seed the state file on first launch so the UI never has to wait.
            let handle = app.handle().clone();
            if let Err(err) = storage::load(&handle) {
                eprintln!("failed to initialise app state: {err}");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running the hypertrophy tracker");
}
