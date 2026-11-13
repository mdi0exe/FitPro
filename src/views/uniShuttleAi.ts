/**
 * "Update the shuttle table with AI" sheet.
 *
 * The student copies a ready-made prompt + JSON skeleton, hands it to any AI
 * together with the new photo from the university, and pastes the answer back
 * here. The JSON is validated before it replaces the table, so a bad paste can
 * never blank the schedule.
 */
import { parseShuttleJson, SHUTTLE_AI_PROMPT_TEMPLATE } from "../data/shuttle";
import { btn, el } from "../lib/dom";
import { getState, persist, requestRender } from "../lib/store";
import { confirmDialog, openModal, toast } from "../components/ui";

async function copyPrompt(): Promise<void> {
  try {
    await navigator.clipboard.writeText(SHUTTLE_AI_PROMPT_TEMPLATE);
    toast("پرامپت و تمپلیت JSON کپی شد؛ حالا همراه عکس سرویس‌ها به هوش مصنوعی بده 📋");
  } catch {
    // Clipboard is blocked without a secure context: show the text instead.
    toast("کپی نشد؛ متن تمپلیت در کادر زیر قابل انتخاب است.", "error");
  }
}

export function openShuttleAiImportModal(): void {
  const state = getState();

  const body = el("div", "space-y-3");
  body.append(
    el(
      "p",
      "text-[11px] leading-6 text-slate-300",
      "هر وقت ساعت سرویس‌ها عوض شد: ۱) دکمه کپی را بزن، ۲) متن را همراه عکس جدید سرویس‌ها به هوش مصنوعی بده، ۳) JSON خروجی را در کادر زیر بچسبان و ذخیره کن.",
    ),
  );

  body.append(
    btn("btn-ghost w-full text-xs", "📋 ۱. کپی پرامپت و تمپلیت آماده", () => void copyPrompt(), {
      "aria-label": "کپی پرامپت تمپلیت سرویس‌ها",
    }),
  );

  const area = el("textarea", "field min-h-[150px] resize-y text-left font-mono text-[11px] leading-5");
  area.dir = "ltr";
  area.spellcheck = false;
  area.placeholder = '{\n  "effectiveDate": "1405/08/23",\n  "railway": { ... },\n  "suburbs": [ ... ]\n}';
  area.value = state.customShuttleJson ?? "";
  body.append(el("label", "label", "۲. JSON خروجی هوش مصنوعی"), area);

  const status = el("p", "text-[10px] leading-5 text-slate-500");
  status.textContent = state.customShuttleJson
    ? "الان برنامه ایمپورت‌شده فعال است."
    : "الان برنامه پیش‌فرض ۱۴۰۵/۰۸/۲۳ فعال است.";
  body.append(status);

  const footer = el("div", "grid grid-cols-2 gap-2");

  footer.append(
    btn("btn-primary text-xs", "💾 ذخیره و اعمال", () => {
      const raw = area.value.trim();

      if (!raw) {
        state.customShuttleJson = null;
        persist(0);
        handle.close();
        toast("برنامه سرویس به حالت پیش‌فرض برگشت.", "info");
        requestRender();
        return;
      }

      const parsed = parseShuttleJson(raw);
      if (!parsed) {
        status.textContent = "❌ ساختار JSON معتبر نیست: باید «railway» و «suburbs» داشته باشد و ساعت‌ها به شکل HH:MM باشند.";
        status.className = "text-[10px] leading-5 text-rose-300";
        toast("فرمت JSON معتبر نیست.", "error");
        return;
      }

      state.customShuttleJson = raw;
      persist(0);
      handle.close();
      toast("برنامه جدید سرویس‌ها اعمال شد 🚌✅");
      requestRender();
    }),
    btn("btn-danger text-xs", "بازگشت به پیش‌فرض", async () => {
      if (!state.customShuttleJson) {
        toast("همین حالا هم برنامه پیش‌فرض فعال است.", "info");
        return;
      }
      const ok = await confirmDialog({
        title: "بازگشت به پیش‌فرض",
        message: "برنامه ایمپورت‌شده حذف و جدول رسمی ۱۴۰۵/۰۸/۲۳ بازگردانی شود؟",
        confirmText: "بازگردان",
        danger: true,
      });
      if (!ok) return;
      state.customShuttleJson = null;
      persist(0);
      handle.close();
      toast("سرویس‌ها به حالت پیش‌فرض برگشتند.", "info");
      requestRender();
    }),
  );

  const handle = openModal({
    title: "🤖 بروزرسانی سرویس‌ها با هوش مصنوعی",
    subtitle: "تغییر ساعت سرویس‌ها در ترم‌های آینده، بدون آپدیت برنامه",
    body,
    footer,
  });
}
