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
}

export type Readiness = "high" | "normal" | "low";

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
}

export type TabId = "workout" | "progress" | "nutrition" | "uni" | "coach";
