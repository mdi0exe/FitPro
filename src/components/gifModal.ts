/** In-app GIF viewer + "paste a direct .gif URL" editor. */
import { btn, el, escapeHtml, svgIcon } from "../lib/dom";
import { icons } from "../lib/icons";
import { gifSearchUrl, muscleWikiUrl, openExternal, youtubeUrl } from "../lib/api";
import { openModal, toast } from "./ui";

export interface GifModalOptions {
  title: string;
  query: string;
  gifUrl?: string | null;
  /** Bundled offline demo used when a custom/remote link fails to load. */
  fallbackUrl?: string | null;
  /** When provided, the modal lets the user save a direct .gif URL. */
  onSaveUrl?: (url: string | null) => void;
}

export function openGifModal(options: GifModalOptions): void {
  const body = el("div", "space-y-4");

  const preview = el(
    "div",
    "relative flex min-h-[180px] items-center justify-center overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70",
  );

  const renderPreview = (url?: string | null) => {
    preview.innerHTML = "";
    if (url) {
      const img = el("img", "max-h-72 w-full object-contain");
      img.src = url;
      img.alt = options.title;
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      let triedFallback = false;
      img.addEventListener("error", () => {
        // A saved remote link may be dead (Cloudflare 403): show the bundled
        // demo instead of an empty box.
        const fallback = options.fallbackUrl;
        if (!triedFallback && fallback && fallback !== url) {
          triedFallback = true;
          img.src = fallback;
          return;
        }
        preview.innerHTML = "";
        preview.append(
          el(
            "div",
            "px-6 py-8 text-center text-xs leading-6 text-rose-300",
            "این تصویر بارگذاری نشد. لینک باید مستقیم به فایل تصویری ختم شود و به اینترنت دسترسی باشد.",
          ),
        );
      });
      preview.append(img);
    } else {
      const placeholder = el("div", "px-6 py-10 text-center");
      const iconWrap = el("div", "mb-2 flex justify-center text-slate-600");
      iconWrap.append(svgIcon(icons.film, "h-10 w-10"));
      placeholder.append(
        iconWrap,
        el("p", "text-xs font-bold text-slate-300", "گیف ذخیره‌شده‌ای برای این حرکت نداریم"),
        el("p", "mt-1 text-[11px] leading-6 text-slate-500", "با دکمه‌های پایین جستجو کن یا لینک مستقیم .gif را پایین بچسبان."),
      );
      preview.append(placeholder);
    }
  };

  renderPreview(options.gifUrl);
  body.append(preview);

  body.append(
    el(
      "div",
      "rounded-2xl border border-slate-800 bg-slate-950/40 px-3 py-2.5",
      `<p class="text-[10px] text-slate-500">عبارت جستجو</p>
       <p class="mt-0.5 font-mono text-xs text-cyan-300" dir="ltr">${escapeHtml(options.query)}</p>`,
    ),
  );

  const searchRow = el("div", "grid grid-cols-1 gap-2");
  searchRow.append(
    btn("btn-primary w-full", `${svgIcon(icons.external, "h-4 w-4").outerHTML} جستجوی گیف متحرک در گوگل`, () =>
      void openExternal(gifSearchUrl(options.query)),
    ),
    btn(
      "btn-ghost w-full",
      `${svgIcon(icons.book, "h-4 w-4").outerHTML} نمایش در MuscleWiki`,
      () => void openExternal(muscleWikiUrl(options.query)),
    ),
    btn(
      "btn-ghost w-full",
      `${svgIcon(icons.play, "h-4 w-4").outerHTML} ویدیوی فرم صحیح در یوتیوب`,
      () => void openExternal(youtubeUrl(options.query)),
    ),
  );
  body.append(searchRow);

  if (options.onSaveUrl) {
    const urlRow = el("div", "space-y-2 rounded-2xl border border-slate-800 bg-slate-950/40 p-3");
    urlRow.append(el("label", "label", "لینک مستقیم گیف (اختیاری)"));
    const input = el("input", "field field-sm text-left");
    input.type = "url";
    input.dir = "ltr";
    input.placeholder = "https://example.com/squat.gif";
    input.value = options.gifUrl ?? "";
    urlRow.append(input);

    const actions = el("div", "grid grid-cols-2 gap-2");
    actions.append(
      btn("btn-primary", "ذخیره گیف", () => {
        const value = input.value.trim();
        if (value && !/^https?:\/\//i.test(value)) {
          toast("لینک باید با http یا https شروع شود.", "error");
          return;
        }
        options.onSaveUrl?.(value || null);
        renderPreview(value || null);
        toast(value ? "گیف ذخیره شد و در کارت حرکت نمایش داده می‌شود." : "گیف حذف شد.");
      }),
      btn("btn-ghost", "حذف گیف", () => {
        input.value = "";
        options.onSaveUrl?.(null);
        renderPreview(null);
        toast("گیف حذف شد.", "info");
      }),
    );
    urlRow.append(actions);
    body.append(urlRow);
  }

  openModal({
    title: options.title,
    subtitle: "نمایش حرکت قبل از اجرا — فرم صحیح = رشد بیشتر",
    body,
  });
}
