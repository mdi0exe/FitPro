/**
 * TypeScript mirror of the Rust models (`src-tauri/src/models.rs`).
 * Field names are camelCase because the backend serialises with
 * `#[serde(rename_all = "camelCase")]`.
 */

export interface UserProfile {
  name: string;
  age: number;
  heightCm: number;
  startWeight: number;
  currentWeight: number;
  targetWeight: number;
  goal: string;
  trainingWindow: string;
  /** Editable — the app is generic for every university, not one campus. */
  universityName: string;
  /** Id of the active template in `src/data/programs.ts`. */
  workoutProgramId: string;
}

export interface WarmupItem {
  id: string;
  text: string;
  query: string;
  done: boolean;
  /** Direct .gif demo; `null` = not set yet, `""` = deliberately removed. */
  gifUrl?: string | null;
}

export interface SetLog {
  index: number;
  weight: number;
  reps: number;
  done: boolean;
}

export interface Exercise {
  id: string;
  name: string;
  sets: number;
  reps: string;
  query: string;
  tip: string;
  gifUrl?: string | null;
  targetWeight: number;
  bodyweight: boolean;
  logs: SetLog[];
  /** ISO date of the "machine is busy" swap; resets automatically next day. */
  swappedDate?: string | null;
  originalName?: string | null;
  originalQuery?: string | null;
  originalGifUrl?: string | null;
  originalTip?: string | null;
}

export interface WorkoutDay {
  id: string;
  label: string;
  title: string;
  focus: string;
  warmups: WarmupItem[];
  exercises: Exercise[];
}

export interface WeightEntry {
  date: string;
  weight: number;
}

export interface DietItem {
  id: string;
  text: string;
  hint: string;
  done: boolean;
}

export interface DietState {
  items: DietItem[];
  lastResetDate: string;
  /** Glasses of water drunk today. */
  waterGlasses: number;
  waterReminderEnabled: boolean;
  waterReminderMinutes: number;
  /**
   * Unix timestamp (ms) of the next reminder; `0` when no deadline is set.
   * Persisted so closing the app resumes the same countdown.
   */
  waterReminderNextAt: number;
}

export type MilestoneKind = "overload" | "weight" | "system" | "goal";

export interface Milestone {
  id: string;
  date: string;
  text: string;
  kind: MilestoneKind | string;
}

/** One day's snapshot for the weekly calendar (derived, not user-entered). */
export interface DailyActivity {
  /** ISO date: YYYY-MM-DD */
  date: string;
  workoutTitle: string;
  completedExercises: string[];
  setsDone: number;
  warmupsDone: number;
  dietDone: number;
  dietTotal: number;
  waterGlasses: number;
  bodyWeight?: number | null;
}

export interface PersonalRecord {
  weight: number;
  reps: number;
  date: string;
}

export interface ProgressPhoto {
  id: string;
  date: string;
  weight: number;
  dataUrl: string;
  note?: string;
}

export interface UniReminders {
  thursdayFoodEnabled: boolean;
  thursdayFoodTime: string;
  gymReminderEnabled: boolean;
  gymReminderTime: string;
  activeBusAlarms: string[];
  /** `Date.getDay()` numbering: 0 = Sunday … 4 = Thursday … 6 = Saturday. */
  foodReminderDay: number;
}

export type Readiness = "high" | "normal" | "low";

/** One row of the MSc timetable. */
export interface CourseSession {
  id: string;
  name: string;
  professor: string;
  /** `Date.getDay()` numbering: 6 = Saturday, 0 = Sunday … 4 = Thursday. */
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  /** `all` = every week, `odd` = `*` (first/odd), `even` = `**` (second/even). */
  weekType: "all" | "odd" | "even";
}

/** Which half of the fortnight the timetable is showing. */
export type SemesterWeekType = "odd" | "even";

export interface LanguageStudyState {
  reminderEnabled: boolean;
  reminderTime: string;
  targetMinutes: number;
  /** ISO dates with a completed session. */
  completedDates: string[];
  /** Editable goal: language, programming, exam prep, thesis, … */
  title: string;
}

export interface AppStateData {
  version: number;
  profile: UserProfile;
  days: WorkoutDay[];
  weightHistory: WeightEntry[];
  diet: DietState;
  milestones: Milestone[];
  lastOverloadDate: string;
  overloadCount: number;
  activeDay: number;
  restSeconds: number;
  /** Derived per-day snapshots for the weekly calendar (newest first). */
  activityHistory: DailyActivity[];
  deloadActive: boolean;
  readiness: Readiness;
  personalRecords: Record<string, PersonalRecord>;
  progressPhotos: ProgressPhoto[];
  uniReminders: UniReminders;
  /** Editable MSc timetable; seeded for saves that predate it. */
  courses: CourseSession[];
  semesterWeekType: SemesterWeekType;
  languageStudy: LanguageStudyState;
  /** Raw JSON imported from the AI shuttle template (null = built-in table). */
  customShuttleJson: string | null;
  /** `"dark" | "light"` — toggled from the header. */
  theme: Theme;
  /** Modular layout: both sections, university only, or gym only. */
  appMode: AppMode;
  /** Controls the first-run setup wizard. */
  onboardingCompleted: boolean;
}

export type Theme = "dark" | "light";
/** `"full"` = gym + university, `"uni_only"` hides workout/progress. */
export type AppMode = "full" | "uni_only" | "gym_only";

export type TabId = "workout" | "progress" | "nutrition" | "uni" | "coach";
