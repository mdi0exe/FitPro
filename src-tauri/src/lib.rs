//! Tauri v2 command surface for the Persian hypertrophy tracker.
//!
//! All commands take an `AppHandle` so the storage layer can resolve the
//! per-platform app-data directory, and every command returns the full
//! `AppStateData` (except `save_app_state`) so the UI can stay in sync with a
//! single round-trip.

mod models;
mod storage;
mod timeutil;

use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use models::{
    apply_overload, to_persian_digits, AppStateData, WeightEntry, OVERLOAD_CYCLE_DAYS,
};

/// Where `save_backup_file` managed to put the JSON.
#[derive(serde::Serialize)]
pub struct SavedBackup {
    /// Absolute path of the written file.
    pub path: String,
    /// `downloads` when it landed in the shared Download folder, `app` when the
    /// OS refused that and the app-private backup folder was used instead.
    pub directory: String,
}

/// Keeps a user-supplied file name safe for the filesystem.
///
/// The name comes from the WebView, so `..`, `/` and every non-ASCII byte are
/// replaced: a backup must never be able to escape the folder it is written to.
fn sanitize_backup_name(raw: &str) -> String {
    let cleaned: String = raw
        .chars()
        .take(80)
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect();
    let trimmed = cleaned.trim_matches(&['-', '.'][..]).to_string();
    if trimmed.is_empty() {
        return "hypertrophy-backup.json".to_string();
    }
    if trimmed.ends_with(".json") {
        trimmed
    } else {
        format!("{trimmed}.json")
    }
}

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

    // Only the workout plan is reset. Everything the student configured —
    // theme, modular mode, university, courses, reminders, diet template and
    // progress history — has to survive a "reset plan" tap.
    fresh.profile = current.profile.clone();
    // "Reset plan" must also re-select the default template on the native side
    // (the browser equivalent lives in localBackend.ts::localReset).
    fresh.profile.workout_program_id = crate::models::default_program_id();
    if !current.weight_history.is_empty() {
        fresh.weight_history = current.weight_history;
    }
    fresh.diet = current.diet;
    fresh.milestones = current.milestones;
    fresh.overload_count = current.overload_count;
    fresh.last_overload_date = current.last_overload_date;
    fresh.rest_seconds = current.rest_seconds;
    fresh.active_day = current.active_day.min(fresh.days.len().saturating_sub(1));
    fresh.theme = current.theme;
    fresh.app_mode = current.app_mode;
    fresh.onboarding_completed = current.onboarding_completed;
    fresh.uni_reminders = current.uni_reminders;
    fresh.courses = current.courses;
    fresh.semester_week_type = current.semester_week_type;
    fresh.semester_week_anchor_date = current.semester_week_anchor_date;
    fresh.language_study = current.language_study;
    fresh.custom_shuttle_json = current.custom_shuttle_json;
    fresh.activity_history = current.activity_history;
    fresh.personal_records = current.personal_records;
    fresh.progress_photos = current.progress_photos;
    // Progression charts belong to the student, not to the workout plan.
    fresh.exercise_history = current.exercise_history;
    // `fresh` carries 100% default weights. Leaving recovery week on would
    // multiply those defaults by 1.25 when the student later toggles it off,
    // so the flag is cleared here (the browser side also drops its snapshot).
    fresh.deload_active = false;
    fresh.readiness = current.readiness;

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
// Backup file
// ---------------------------------------------------------------------------

/// Writes a JSON backup the user can actually find on their phone.
///
/// The WebView can only *download* a blob, which on Android lands in a sandbox
/// the file manager never shows. This command writes the file with `std::fs`
/// instead, trying the shared `Download` folder first and falling back to the
/// app's own `backups/` directory when the OS refuses (Android 10+ scoped
/// storage blocks writes into `Download` unless the app owns the file).
#[tauri::command]
fn save_backup_file(
    app: AppHandle,
    file_name: String,
    contents: String,
) -> Result<SavedBackup, String> {
    if contents.trim().is_empty() {
        return Err("محتوای فایل پشتیبان خالی است.".to_string());
    }

    let safe_name = sanitize_backup_name(&file_name);

    let mut candidates: Vec<(PathBuf, &str)> = Vec::new();
    if let Ok(dir) = app.path().download_dir() {
        candidates.push((dir, "downloads"));
    }
    if let Ok(dir) = app.path().document_dir() {
        candidates.push((dir, "downloads"));
    }
    if let Ok(dir) = app.path().app_data_dir() {
        candidates.push((dir.join("backups"), "app"));
    }

    let mut last_error = String::new();
    for (dir, kind) in candidates {
        if let Err(err) = std::fs::create_dir_all(&dir) {
            last_error = format!("{}: {err}", dir.display());
            continue;
        }
        let target = dir.join(&safe_name);
        match std::fs::write(&target, contents.as_bytes()) {
            Ok(()) => {
                return Ok(SavedBackup {
                    path: target.display().to_string(),
                    directory: kind.to_string(),
                })
            }
            Err(err) => last_error = format!("{}: {err}", target.display()),
        }
    }

    Err(format!("ذخیره فایل پشتیبان ناموفق بود ({last_error})"))
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            get_app_state,
            save_app_state,
            apply_progressive_overload,
            log_body_weight,
            reset_to_defaults,
            overload_status,
            save_backup_file
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

#[cfg(test)]
mod backup_tests {
    use super::sanitize_backup_name;

    #[test]
    fn keeps_a_normal_backup_name() {
        assert_eq!(
            sanitize_backup_name("hypertrophy-backup-2026-11-13.json"),
            "hypertrophy-backup-2026-11-13.json"
        );
    }

    #[test]
    fn strips_path_traversal_and_unicode() {
        let name = sanitize_backup_name("../../etc/passwd");
        assert!(!name.contains('/'), "slash survived: {name}");
        assert!(!name.starts_with('.'), "leading dot survived: {name}");
        assert!(name.ends_with(".json"), "missing extension: {name}");
    }

    #[test]
    fn always_ends_up_with_a_json_file() {
        // A fully non-ASCII name collapses to nothing, so the default is used.
        assert_eq!(sanitize_backup_name("پشتیبان من"), "hypertrophy-backup.json");
        assert_eq!(sanitize_backup_name(""), "hypertrophy-backup.json");
        assert_eq!(sanitize_backup_name("backup"), "backup.json");
    }
}
