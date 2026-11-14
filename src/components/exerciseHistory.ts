/**
 * Per-exercise training history + progress chart.
 *
 * `activityHistory` only remembers the whole day ("did I train?"). That is
 * enough for the calendar and the streak, but it cannot answer the only
 * question that matters for progression: *what did I actually lift on this
 * movement last time?* So every time a set is ticked, the top set of that
 * exercise is folded into `exerciseHistory[exerciseId]` — one row per day.
 *
 * The row is keyed on the exercise id, not the name: a busy-machine substitute
 * is a one-day overlay on the same slot, so its numbers belong to the same
 * progression line.
 */
import { btn, el, escapeHtml } from "../lib/dom";
import { fa, faDate, faNum, isoToday } from "../lib/fa";
import { getState, persist, requestRender } from "../lib/store";
import type { Exercise, ExerciseHistoryEntry } from "../types";
import { openModal, toast } from "./ui";

/** Keeps the state file small: ~4 months of daily rows per movement. */
const MAX_ENTRIES = 120;

/** Entries for one exercise, oldest first (chart order). */
export function exerciseHistoryFor(exerciseId: string): ExerciseHistoryEntry[] {
  const map = getState().exerciseHistory ?? {};
  return [...(map[exerciseId] ?? [])].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Folds the current tick state of an exercise into today's history row.
 *
 * Uses the *top* completed set (weight × reps) so the chart follows the working
 * set rather than a warm-up, and stores how many sets were finished so a
 * half-session is distinguishable from a full one.
 */
export function recordExerciseHistory(exercise: Exercise): void {
  const done = exercise.logs.filter((log) => log.done);
  if (done.length === 0) return;

  const top = done.reduce(
    (best, log) => (log.weight * log.reps > best.weight * best.reps ? log : best),
    done[0],
  );
  const today = isoToday();
  const state = getState();
  state.exerciseHistory = state.exerciseHistory ?? {};
  const history = state.exerciseHistory[exercise.id] ?? [];

  const entry: ExerciseHistoryEntry = {
    date: today,
    weight: top.weight,
    reps: top.reps,
    setsCompleted: done.length,
  };
  const existing = history.find((row) => row.date === today);
  if (existing) Object.assign(existing, entry);
  else history.push(entry);

  history.sort((a, b) => a.date.localeCompare(b.date));
  state.exerciseHistory[exercise.id] = history.slice(-MAX_ENTRIES);
}

/**
 * Drops today's row when the last tick of a movement is undone.
 * A session with zero completed sets must not leave a phantom point on the
 * chart or inflate the "sessions" count.
 */
export function clearTodayExerciseHistory(exerciseId: string): void {
  const state = getState();
  const map = state.exerciseHistory;
  if (!map || !Array.isArray(map[exerciseId])) return;
  const today = isoToday();
  const remaining = map[exerciseId].filter((row) => row.date !== today);
  if (remaining.length > 0) map[exerciseId] = remaining;
  else delete map[exerciseId];
}

/** Last recorded row, or `null` when the movement has never been ticked. */
export function lastExerciseEntry(exerciseId: string): ExerciseHistoryEntry | null {
  const entries = exerciseHistoryFor(exerciseId);
  return entries.length > 0 ? entries[entries.length - 1] : null;
}

/** Inline SVG sparkline: weight over time, with a soft area fill. */
function chartSvg(entries: ExerciseHistoryEntry[]): string {
  const width = 300;
  const height = 120;
  const pad = 10;
  const weights = entries.map((row) => row.weight);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  // A flat series still needs a band, otherwise every point lands on the axis.
  const span = max - min < 0.01 ? 1 : max - min;
  const stepX = entries.length > 1 ? (width - pad * 2) / (entries.length - 1) : 0;

  const points = entries.map((row, index) => {
    const x = pad + index * stepX;
    const y = height - pad - ((row.weight - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });

  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${pad},${height - pad} ${line} ${(pad + (entries.length - 1) * stepX).toFixed(1)},${height - pad}`;
  const dots = points
    .map(
      ([x, y]) =>
        `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="#34d399" stroke="#0f172a" stroke-width="1" />`,
    )
    .join("");

  return `<svg viewBox="0 0 ${width} ${height}" class="h-32 w-full" aria-hidden="true">
    <defs>
      <linearGradient id="histFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#34d399" stop-opacity="0.35" />
        <stop offset="100%" stop-color="#34d399" stop-opacity="0" />
      </linearGradient>
    </defs>
    <polygon points="${area}" fill="url(#histFill)" />
    <polyline points="${line}" fill="none" stroke="#34d399" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
    ${dots}
  </svg>`;
}

/** Full progress modal: chart + a compact table of the recent sessions. */
export function openExerciseHistoryModal(exercise: Exercise): void {
  const entries = exerciseHistoryFor(exercise.id);
  const body = el("div", "space-y-3");

  if (entries.length === 0) {
    body.append(
      el(
        "div",
        "rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 px-4 py-6 text-center text-[11px] leading-6 text-slate-500",
        "برای این حرکت هنوز ستی ثبت نشده. اولین ستی که تیک بزنی، همین‌جا نمودارش ساخته می‌شود.",
      ),
    );
  } else {
    const first = entries[0];
    const last = entries[entries.length - 1];
    const delta = last.weight - first.weight;

    const summary = el("div", "grid grid-cols-3 gap-2");
    const cell = (label: string, value: string, tone: string) => {
      const box = el("div", "rounded-xl border border-slate-800 bg-slate-950/50 px-2 py-2 text-center");
      box.append(el("p", `text-sm font-extrabold ${tone}`, value), el("p", "mt-0.5 text-[9px] text-slate-500", label));
      return box;
    };
    summary.append(
      cell("بهترین وزن", `${faNum(Math.max(...entries.map((r) => r.weight)), 1)}`, "text-emerald-300"),
      cell("جلسات", fa(entries.length), "text-slate-100"),
      cell(
        "تغییر وزن",
        `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${faNum(Math.abs(delta), 1)}`,
        delta > 0 ? "text-emerald-300" : delta < 0 ? "text-rose-300" : "text-slate-400",
      ),
    );
    body.append(summary);

    if (entries.length < 2) {
      // A single point has nothing to draw — a line needs two sessions. Saying so
      // is far clearer than an empty 120px box that looks like a broken chart.
      body.append(
        el(
          "div",
          "rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 px-3 py-4 text-center text-[10px] leading-5 text-slate-500",
          "نمودار بعد از دومین جلسه رسم می‌شود. امروز اولین نقطه ثبت شد.",
        ),
      );
    } else {
      const chart = el("div", "rounded-2xl border border-slate-800 bg-slate-950/60 p-2");
      chart.innerHTML = chartSvg(entries);
      body.append(chart);
    }

    const table = el("div", "space-y-1");
    [...entries]
      .slice(-6)
      .reverse()
      .forEach((row) => {
        const line = el("div", "flex items-center justify-between rounded-lg bg-slate-950/50 px-2.5 py-1.5 text-[10px]");
        line.append(
          el("span", "text-slate-400", faDate(row.date, { withYear: false })),
          el(
            "span",
            "font-bold text-slate-200",
            `${faNum(row.weight, 1)} کیلو × ${fa(row.reps)} • ${fa(row.setsCompleted)} ست`,
          ),
        );
        table.append(line);
      });
    body.append(table);

    body.append(
      el(
        "p",
        "text-[10px] leading-5 text-slate-500",
        `بهترین ست هر جلسه ثبت می‌شود؛ ${escapeHtml(exercise.name)} تا امروز ${fa(entries.length)} جلسه سابقه دارد.`,
      ),
    );
  }

  const footer = el("div", "grid grid-cols-2 gap-2");
  const handle = openModal({
    title: "روند این حرکت",
    subtitle: exercise.name,
    body,
    footer,
  });
  footer.append(
    btn(
      "btn-primary",
      "بستن",
      () => handle.close(),
    ),
    btn("btn-ghost", "پاک کردن سابقه", () => {
      const state = getState();
      delete state.exerciseHistory[exercise.id];
      persist(0);
      handle.close();
      toast("سابقه این حرکت پاک شد.", "info");
      requestRender();
    }),
  );
}
