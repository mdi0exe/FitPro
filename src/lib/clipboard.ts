/**
 * Clipboard access that also works inside the Android WebView.
 *
 * `navigator.clipboard` needs a secure context and is silently rejected by some
 * WebView builds, so every call falls back to a hidden textarea plus
 * `document.execCommand("copy")`. Callers only need the boolean.
 */
import { el } from "./dom";

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* the WebView may deny clipboard access — fall through */
  }

  const temp = el("textarea", "sr-only");
  temp.value = text;
  document.body.append(temp);
  temp.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  temp.remove();
  return copied;
}

/** Best-effort clipboard read; `""` when the platform refuses. */
export async function readClipboardText(): Promise<string> {
  try {
    if (navigator.clipboard?.readText) return await navigator.clipboard.readText();
  } catch {
    /* permission denied or unsupported */
  }
  return "";
}
