//! Local-time helpers.
//!
//! Dates are stored as ISO `YYYY-MM-DD` strings; the Persian (Jalali) rendering
//! happens in the frontend so the backend stays timezone/calendar agnostic.

use chrono::Local;

/// Today's date in the device's local timezone, e.g. `2026-11-12`.
pub fn today_iso() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}
