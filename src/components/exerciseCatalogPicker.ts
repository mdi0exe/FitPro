/**
 * Searchable exercise library ("کتابخانه حرکات").
 *
 * Backed by `src/data/exerciseCatalog.ts`, which is generated from
 * `hasaneyldrm/exercises-dataset` by `scripts/build-exercise-library.mjs`: 120
 * movements with Persian names, a muscle group and a bundled GIF. Picking one
 * fills the editor's name, GIF and search phrase, so a new exercise arrives with
 * its demo animation instead of an empty box.
 */
import { btn, el, escapeHtml } from "../lib/dom";
import { fa } from "../lib/fa";
import {
  CATALOG_MUSCLES,
  EXERCISE_CATALOG,
  type CatalogExercise,
} from "../data/exerciseCatalog";

const ALL_KEY = "all";

export interface CatalogPickerOptions {
  /** Called with the chosen movement; the caller closes the panel itself. */
  onPick: (item: CatalogExercise) => void;
  /** Pre-selects the muscle tab (e.g. the day's focus). */
  initialMuscle?: string;
}

export interface CatalogPicker {
  element: HTMLElement;
  /** Collapses the panel (after a pick, or when the user is done). */
  close: () => void;
}

export function catalogPicker(options: CatalogPickerOptions): CatalogPicker {
  const wrap = el("div", "space-y-2");

  const toggle = btn("btn-ghost w-full text-xs", "", () => setOpen(!open));
  const panel = el("div", "hidden space-y-2 rounded-2xl border border-slate-800 bg-slate-950/50 p-2");

  let open = false;
  let muscle = options.initialMuscle ?? ALL_KEY;
  let query = "";

  const setOpen = (next: boolean) => {
    open = next;
    panel.className = next
      ? "space-y-2 rounded-2xl border border-slate-800 bg-slate-950/50 p-2"
      : "hidden space-y-2 rounded-2xl border border-slate-800 bg-slate-950/50 p-2";
    toggle.innerHTML = next
      ? "✕ بستن کتابخانه"
      : `📚 انتخاب از کتابخانه حرکات (${fa(EXERCISE_CATALOG.length)} حرکت)`;
    if (next) searchInput.focus();
  };

  // ------------------------------------------------------------------ search
  const searchInput = el("input", "field field-sm text-right");
  searchInput.type = "search";
  searchInput.placeholder = "جستجو: پرس سینه، دمبل، اسکوات…";
  searchInput.addEventListener("input", () => {
    query = searchInput.value.trim().toLowerCase();
    paintGrid();
  });

  // ------------------------------------------------------------- muscle tabs
  const muscleRow = el("div", "flex flex-wrap gap-1.5");
  const muscleButtons: HTMLButtonElement[] = [];
  const tabs = [{ key: ALL_KEY, label: "همه" }, ...CATALOG_MUSCLES];

  const paintTabs = () => {
    muscleButtons.forEach((button, index) => {
      const active = tabs[index].key === muscle;
      button.className = `rounded-lg border px-2 py-1 text-[10px] font-bold transition active:scale-95 ${
        active
          ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-300"
          : "border-slate-800 bg-slate-900/60 text-slate-300"
      }`;
    });
  };

  tabs.forEach((tab, index) => {
    const button = btn("", tab.label, () => {
      muscle = tab.key;
      paintTabs();
      paintGrid();
    });
    muscleButtons[index] = button;
    muscleRow.append(button);
  });
  paintTabs();

  // -------------------------------------------------------------------- grid
  const grid = el("div", "grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto pl-0.5");
  const empty = el("p", "hidden py-4 text-center text-[11px] text-slate-500", "حرکتی با این فیلتر پیدا نشد.");

  const matches = (item: CatalogExercise) => {
    if (muscle !== ALL_KEY && item.muscleKey !== muscle) return false;
    if (!query) return true;
    return (
      item.name.toLowerCase().includes(query) ||
      item.english.toLowerCase().includes(query) ||
      item.equipment.includes(query) ||
      item.muscle.includes(query)
    );
  };

  const paintGrid = () => {
    const items = EXERCISE_CATALOG.filter(matches);
    grid.replaceChildren();
    empty.className = items.length
      ? "hidden py-4 text-center text-[11px] text-slate-500"
      : "py-4 text-center text-[11px] text-slate-500";

    // All 120 fit in the scroll box; the GIFs are lazy-loaded thumbnails.
    for (const item of items) {
      const card = btn(
        "flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/50 p-1.5 text-right transition active:scale-[0.98]",
        "",
        () => {
          options.onPick(item);
          setOpen(false);
        },
        { "data-catalog-id": item.id, "aria-label": item.name },
      );
      const img = el("img", "h-11 w-11 shrink-0 rounded-lg bg-white object-contain");
      img.src = item.gif;
      img.alt = "";
      img.loading = "lazy";
      img.width = 44;
      img.height = 44;
      const text = el("span", "min-w-0 flex-1");
      text.append(
        el("span", "block truncate text-[11px] font-bold text-slate-100", escapeHtml(item.name)),
        el("span", "mt-0.5 block truncate text-[9px] text-slate-500", escapeHtml(item.equipment)),
      );
      card.append(img, text);
      grid.append(card);
    }
  };

  paintGrid();

  panel.append(searchInput, muscleRow, grid, empty);
  setOpen(false);
  wrap.append(toggle, panel);

  return { element: wrap, close: () => setOpen(false) };
}
