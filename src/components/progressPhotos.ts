/**
 * Before/after progress photo album and JSON backup/restore.
 */
import { btn, el, svgIcon, uid } from "../lib/dom";
import { icons } from "../lib/icons";
import { faDate, faNum, isoToday } from "../lib/fa";
import {
  isTauri,
  nativeSaveBackupToDownloads,
  nativeShareBackupFile,
  saveBackupFile,
} from "../lib/api";
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
  card.append(sectionTitle("💾 پشتیبان‌گیری و اشتراک‌گذاری اطلاعات"));
  card.append(
    el(
      "p",
      "text-[11px] leading-6 text-slate-400",
      "از رکوردها، تاریخچه وزن، عکس‌ها و تنظیماتت فایل پشتیبان بگیر تا با تعویض گوشی چیزی از دست نرود. فایل را می‌توانی مستقیم در تلگرام بفرستی یا در پوشه Download ذخیره کنی.",
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

  // Result of the last save/share, kept on screen so the path stays readable.
  const hint = el("p", "hidden text-[10px] leading-5 text-emerald-300");

  const row = el("div", "space-y-2");
  row.append(
    btn("btn-primary w-full text-xs", "📤 ارسال به تلگرام / اشتراک‌گذاری فایل", () => {
      void shareBackup(hint);
    }, { "aria-label": "اشتراکگذاری فایل پشتیبان" }),
    btn("btn-ghost w-full text-xs", "📁 ذخیره مستقیم در پوشه Download", () => {
      void saveBackupToDownloads(hint);
    }, { "aria-label": "ذخیره پشتیبان در Download" }),
    btn("btn-ghost w-full text-xs", "📥 بازیابی از فایل", () => fileInput.click()),
  );

  card.append(row, hint, fileInput);
  return card;
}

/** File name used by every backup entry point. */
function backupFileName(): string {
  return `hypertrophy-backup-${isoToday()}.json`;
}

function backupJson(): string {
  return JSON.stringify(getState(), null, 2);
}

function setHint(target: HTMLElement, text: string, tone: "ok" | "error" = "ok"): void {
  target.textContent = text;
  target.className = `text-[10px] leading-5 ${tone === "ok" ? "text-emerald-300" : "text-rose-300"}`;
}

/**
 * Opens the native Android Share Sheet (Telegram, Drive, email...).
 *
 * An Android WebView has no `navigator.share`; the Kotlin bridge is the only
 * way to attach a real `.json` file. A genuine browser still uses the Web Share
 * API, and a failure is reported — never silently converted into a save, which
 * used to make both backup buttons do the same thing.
 */
async function shareBackup(hint: HTMLElement): Promise<void> {
  const name = backupFileName();
  const json = backupJson();

  // Android WebViews have no `navigator.share`. Previously that landed in the
  // catch block below, which called `saveBackupToDownloads` — so both buttons
  // did exactly the same thing. The Kotlin bridge now owns this path.
  const nativeResult = nativeShareBackupFile(name, json);
  if (nativeResult !== null) {
    if (nativeResult) {
      setHint(hint, "منوی اشتراک\u200cگذاری اندروید باز شد؛ فایل JSON را به تلگرام یا درایو بفرست 📤");
    } else {
      setHint(hint, "باز کردن منوی اشتراک\u200cگذاری ناموفق بود.", "error");
    }
    return;
  }

  const nav = typeof navigator === "undefined" ? undefined : navigator;
  try {
    const file = new File([json], name, { type: "application/json" });
    const canShareFiles =
      typeof nav?.canShare === "function" && nav.canShare({ files: [file] });
    if (nav?.share && canShareFiles) {
      await nav.share({ files: [file], title: "پشتیبان فیت\u200cپرو" });
      setHint(hint, "فایل پشتیبان به اشتراک گذاشته شد 📤");
      return;
    }
    if (nav?.share) {
      await nav.share({ title: name, text: json });
      setHint(hint, "محتوای پشتیبان به اشتراک گذاشته شد 📤");
      return;
    }
    throw new Error("share API unavailable");
  } catch (error) {
    // Dismissing the sheet is not a failure.
    if ((error as Error | undefined)?.name === "AbortError") return;
    console.warn("share failed", error);
    if (!isTauri()) {
      downloadBackup(name, json);
      setHint(hint, "اشتراک\u200cگذاری پشتیبانی نشد؛ فایل از طریق مرورگر دانلود شد 📁");
      return;
    }
    // Never silently save here — that is what made the two buttons identical.
    setHint(
      hint,
      "اشتراک\u200cگذاری در این دستگاه در دسترس نیست؛ از دکمه «ذخیره مستقیم در پوشه Download» استفاده کن.",
      "error",
    );
  }
}

/** Writes the JSON with the native command (or a download in the browser). */
async function saveBackupToDownloads(hint: HTMLElement): Promise<void> {
  const name = backupFileName();
  const json = backupJson();

  // Android 10+ scoped storage blocks Rust's std::fs::write into Download.
  // MediaStore.Downloads needs no permission and lands in the visible folder.
  let nativePath: string | null = null;
  try {
    nativePath = nativeSaveBackupToDownloads(name, json);
  } catch (error) {
    console.warn("MediaStore backup write failed, trying the native command", error);
  }
  if (nativePath) {
    setHint(hint, `ذخیره شد در ${nativePath}`);
    toast("فایل پشتیبان در پوشه Download ذخیره شد 💾");
    return;
  }

  try {
    const saved = await saveBackupFile(name, json);
    if (!saved) {
      downloadBackup(name, json);
      setHint(hint, "فایل از طریق مرورگر دانلود شد 📁");
      return;
    }
    setHint(
      hint,
      saved.directory === "downloads"
        ? `ذخیره شد در ${saved.path}`
        : `اندروید اجازه نوشتن در Download را نداد؛ نسخه پشتیبان در حافظه برنامه ذخیره شد: ${saved.path}`,
    );
    toast("فایل پشتیبان ذخیره شد 💾");
  } catch (error) {
    console.warn("native backup write failed", error);
    toast("ذخیره فایل ناموفق بود؛ از گزینه اشتراک\u200cگذاری استفاده کن.", "error");
    setHint(hint, "ذخیره فایل ناموفق بود؛ از دکمه اشتراک\u200cگذاری استفاده کن.", "error");
  }
}

/** Browser fallback: a blob download with the same name. */
function downloadBackup(name = backupFileName(), json = backupJson()): void {
  try {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
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
