/**
 * Shared mutations for the modular setup wizard / coach settings.
 *
 * Kept out of `components/onboarding.ts` so the developer preset button in the
 * coach tab and the wizard use exactly the same code path.
 */
import type { AppStateData } from "../types";
import { createSeedState } from "../data/seed";
import { findProgram, WORKOUT_PROGRAMS } from "../data/programs";

export const DEVELOPER_UNIVERSITY = "دانشگاه صنعتی تبریز";
export const DEVELOPER_PROGRAM_ID = "upper-lower-4";

/**
 * Swaps the workout plan. Returns `false` when the requested template is
 * already active, so a student's set logs are never wiped by re-saving the
 * wizard without changing anything.
 */
export function applyProgram(state: AppStateData, programId: string): boolean {
  const program = WORKOUT_PROGRAMS.find((entry) => entry.id === programId);
  if (!program || state.profile.workoutProgramId === program.id) return false;

  state.days = program.buildDays();
  state.activeDay = 0;
  state.restSeconds = program.restSeconds;
  state.profile.goal = program.goalLabel;
  state.profile.workoutProgramId = program.id;
  return true;
}

/**
 * One-tap developer profile: 65 → 75 kg, 4-day lean bulk, 3 cafeteria meals,
 * the three MSc electronics subjects and the published Tabriz shuttle table.
 * The current theme and the user's progress history are deliberately kept.
 */
export function applyDeveloperPreset(state: AppStateData): void {
  const seed = createSeedState();
  const history = {
    theme: state.theme,
    weightHistory: state.weightHistory,
    activityHistory: state.activityHistory,
    milestones: state.milestones,
    personalRecords: state.personalRecords,
    progressPhotos: state.progressPhotos,
    name: state.profile.name,
  };

  state.profile = {
    ...seed.profile,
    name: history.name || seed.profile.name,
    universityName: DEVELOPER_UNIVERSITY,
    workoutProgramId: DEVELOPER_PROGRAM_ID,
  };
  state.days = findProgram(DEVELOPER_PROGRAM_ID).buildDays();
  state.activeDay = 0;
  state.restSeconds = seed.restSeconds;
  state.diet = seed.diet;
  state.courses = seed.courses;
  state.semesterWeekType = seed.semesterWeekType;
  state.semesterWeekAnchorDate = seed.semesterWeekAnchorDate;
  state.languageStudy = seed.languageStudy;
  state.uniReminders = seed.uniReminders;
  state.customShuttleJson = null;
  state.appMode = "full";
  state.onboardingCompleted = true;

  state.theme = history.theme;
  state.weightHistory = history.weightHistory;
  state.activityHistory = history.activityHistory;
  state.milestones = history.milestones;
  state.personalRecords = history.personalRecords;
  state.progressPhotos = history.progressPhotos;
}
