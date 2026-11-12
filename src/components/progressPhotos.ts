/**
 * Before/after progress photo album and JSON backup/restore.
 */
import { btn, el, svgIcon, uid } from "../lib/dom";
import { icons } from "../lib/icons";
import { faDate, faNum, isoToday } from "../lib/fa";
import { getState, persist, requestRender, setState } from "../lib/store";
import { normalizeState } from "../lib/localBackend";
import type { AppStateData, ProgressPhoto } from "../types";
import { confirmDialog, openModal, sectionTitle, toast } from "../components/ui";

const MAX_PHOTOS = 24;

export function renderProgressPhotosCard(): HTMLElement {
  const state = getState();
  const photos = state.progressPhotos ?? [];

  const card = el("div", "card space-y-3");

  const fileInput = el("input", "hidden");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    void compressImageFile(file, 560, 0.72)
      .then((dataUrl) => {
        const current = getState();
        current.progressPhotos = [
          {
            id: uid("photo"),
            date: isoToday(),
            weight: current.profile.currentWeight,
            dataUrl,
          },
          ...(current.progressPhotos ?? []),
        ].slice(0, MAX_PHOTOS);
        persist(0);
        toast("عکس پیشرفت ذخیره شد 📸");
        requestRender();
      })
      .catch(() => toast("خواندن عکس ناموفق بود.", "error"))
      .finally(() => {
        fileInput.value = "";
      });
  });

  const addButton = btn(
    "btn-primary shrink-0 px-3 py-1.5 text-xs",
    `${svgIcon(icons.camera, "h-4 w-4").outerHTML} ثبت عکس`,
    () => fileInput.click(),
  );

  card.append(sectionTitle("📸 آلبوم تغییرات بدن", addButton), fileInput);

  if (photos.length === 0) {
    card.append(
      el(
        "p",
        "rounded-2xl border border-dashed border-slate-800 py-6 text-center text-[11px] leading-6 text-slate-500",
        "هر ماه یک عکس جلوی آینه ثبت کن تا تغییرات بدنت را کنار هم ببینی. عکس‌ها فقط روی همین گوشی ذخیره می‌شوند.",
      ),
    );
    return card;
  }

  if (photos.length >= 2) {
    card.append(
      btn(
        "btn-ghost w-full text-xs",
        "🔍 مقایسه قدیمی‌ترین و جدیدترین عکس",
        () => openCompareModal(photos[photos.length - 1], photos[0]),
      ),
    );
  }

  const grid = el("div", "grid grid-cols-2 gap-2.5");
  for (const photo of photos.slice(0, 6)) {
    const item = el("div", "relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950");
    const img = el("img", "h-44 w-full object-cover");
    img.src = photo.dataUrl;
    img.alt = `عکس ${faDate(photo.date, { withYear: false })}`;

    const overlay = el("div", "flex items-center justify-between bg-slate-950/85 px-2.5 py-1.5 text-[10px]");
    overlay.append(
      el("span", "font-bold text-slate-200", faDate(photo.date, { withYear: false })),
      el("span", "font-extrabold text-emerald-400", `${faNum(photo.weight, 1)} کیلو`),
    );

    const remove = btn(
      "absolute left-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-slate-950/80 text-rose-400",
      svgIcon(icons.trash, "h-3.5 w-3.5"),
      () => void removePhoto(photo),
      { "aria-label": "حذف عکس" },
    );

    item.append(img, overlay, remove);
    grid.append(item);
  }
  card.append(grid);

  return card;
}

async function removePhoto(photo: ProgressPhoto): Promise<void> {
  const confirmed = await confirmDialog({
    title: "حذف عکس",
    message: "این عکس از آلبوم پیشرفت حذف شود؟",
    confirmText: "حذف",
    danger: true,
  });
  if (!confirmed) return;

  const state = getState();
  state.progressPhotos = (state.progressPhotos ?? []).filter((entry) => entry.id !== photo.id);
  persist(0);
  requestRender();
}

function openCompareModal(before: ProgressPhoto, after: ProgressPhoto): void {
  const body = el("div", "grid grid-cols-2 gap-2");

  const column = (title: string, photo: ProgressPhoto, accent: string) => {
    const box = el("div", "overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 text-center");
    box.append(el("p", `bg-slate-900 py-1 text-[11px] font-extrabold ${accent}`, title));
    const img = el("img", "h-60 w-full object-cover");
    img.src = photo.dataUrl;
    img.alt = title;
    box.append(
      img,
      el(
        "p",
        "py-1.5 text-[10px] font-bold text-slate-300",
        `${faDate(photo.date, { withYear: false })} • ${faNum(photo.weight, 1)} کیلو`,
      ),
    );
    return box;
  };

  body.append(
    column("قبل", before, "text-cyan-300"),
    column("بعد", after, "text-emerald-300"),
  );

  const delta = Math.round((after.weight - before.weight) * 10) / 10;
  openModal({
    title: "مقایسه تغییرات بدن",
    subtitle: `تغییر وزن: ${faNum(delta, 1)} کیلوگرم`,
    body,
  });
}

function compressImageFile(file: File, maxDim: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("canvas unavailable"));
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      image.onerror = () => reject(new Error("image decode failed"));
      image.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------------------
// Backup & restore
// ---------------------------------------------------------------------------

export function renderBackupRestoreCard(): HTMLElement {
  const card = el("div", "card space-y-3");
  card.append(sectionTitle("💾 پشتیبان‌گیری و بازیابی"));
  card.append(
    el(
      "p",
      "text-[11px] leading-6 text-slate-400",
      "از رکوردها، تاریخچه وزن، عکس‌ها و تنظیماتت فایل پشتیبان بگیر تا با تعویض گوشی چیزی از دست نرود.",
    ),
  );

  const fileInput = el("input", "hidden");
  fileInput.type = "file";
  fileInput.accept = ".json,application/json";
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Partial<AppStateData>;
        if (!parsed || !Array.isArray(parsed.days) || !parsed.profile || !parsed.diet) {
          toast("این فایل پشتیبان معتبر نیست.", "error");
          return;
        }
        const restored = normalizeState(parsed as AppStateData);
        setState(restored);
        persist(0);
        toast("پشتیبان با موفقیت بازیابی شد ✅");
        requestRender();
      } catch {
        toast("خواندن فایل پشتیبان ناموفق بود.", "error");
      } finally {
        fileInput.value = "";
      }
    };
    reader.readAsText(file);
  });

  const row = el("div", "grid grid-cols-2 gap-2");
  row.append(
    btn("btn-primary text-xs", "📤 دانلود پشتیبان", () => downloadBackup()),
    btn("btn-ghost text-xs", "📥 بازیابی از فایل", () => fileInput.click()),
  );

  card.append(row, fileInput);
  return card;
}

function downloadBackup(): void {
  try {
    const json = JSON.stringify(getState(), null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `hypertrophy-backup-${isoToday()}.json`;
    anchor.click();
    // Revoking immediately can cancel the download in some browsers.
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast("فایل پشتیبان آماده شد 💾");
  } catch {
    toast("ساخت فایل پشتیبان ناموفق بود.", "error");
  }
}

/** Exported for tests: number of stored photos. */
export function photoCount(): number {
  return getState().progressPhotos?.length ?? 0;
}
