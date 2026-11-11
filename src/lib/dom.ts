/** Tiny DOM helpers — keeps the view code declarative without a framework. */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  html?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html !== undefined) node.innerHTML = html;
  return node;
}

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function btn(
  className: string,
  content: string | Node,
  onClick: (event: MouseEvent) => void,
  attrs: Record<string, string> = {},
): HTMLButtonElement {
  const button = el("button", className);
  button.type = "button";
  if (typeof content === "string") button.innerHTML = content;
  else button.append(content);
  for (const [key, value] of Object.entries(attrs)) button.setAttribute(key, value);
  button.addEventListener("click", onClick);
  return button;
}

export function svgIcon(markup: string, className = "h-5 w-5"): SVGSVGElement {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="${className}" aria-hidden="true">${markup}</svg>`;
  return wrapper.firstElementChild as SVGSVGElement;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function qs<T extends Element = HTMLElement>(root: ParentNode, selector: string): T | null {
  return root.querySelector<T>(selector);
}

export function qsa<T extends Element = HTMLElement>(root: ParentNode, selector: string): T[] {
  return Array.from(root.querySelectorAll<T>(selector));
}

/** Restores scroll position around a full re-render. */
export function preserveScroll(render: () => void): void {
  const y = window.scrollY;
  render();
  window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior });
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function uid(prefix = "id"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}
