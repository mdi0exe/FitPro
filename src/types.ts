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
}

export type MilestoneKind = "overload" | "weight" | "system" | "goal";

export interface Milestone {
  id: string;
  date: string;
  text: string;
  kind: MilestoneKind | string;
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
}

export type TabId = "workout" | "progress" | "nutrition" | "coach";
