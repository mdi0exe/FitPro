//! Local-time helpers.
//!
//! Dates are stored as ISO `YYYY-MM-DD` strings; the Persian (Jalali) rendering
//! happens in the frontend so the backend stays timezone/calendar agnostic.

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
