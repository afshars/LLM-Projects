import { el } from "./dom";
import { journey } from "../state/journey";
import { stepIndicator } from "./step-indicator";
import { t } from "./theme-i18n";

/** Common page chrome: step progress (when applicable) + title + a slot
 * for body content. Every view uses this so the app has one consistent
 * title/section pattern (Phase 11), and now a shared sense of "where am
 * I in the flow" (frontend polish pass). */
export function page(title: string, ...body: Node[]): HTMLElement {
  const indicator = stepIndicator(journey.get().step);
  return el("div", { class: "page" }, [
    ...(indicator ? [indicator] : []),
    el("h1", { class: "page-title" }, [title]),
    ...body,
  ]);
}

export function errorBanner(message: string): HTMLElement {
  return el("div", { class: "error-banner", role: "alert", "aria-live": "assertive" }, [message]);
}

export function loadingIndicator(text = t().common.loading): HTMLElement {
  return el("div", { class: "loading", role: "status", "aria-live": "polite" }, [text]);
}

export function primaryButton(label: string, onClick: () => void): HTMLButtonElement {
  const btn = el("button", { class: "btn-primary", type: "button" }, [label]) as HTMLButtonElement;
  btn.addEventListener("click", onClick);
  return btn;
}

export function setButtonLoading(btn: HTMLButtonElement, loading: boolean, idleLabel: string, loadingLabel: string) {
  btn.disabled = loading;
  btn.setAttribute("aria-busy", String(loading));
  btn.textContent = loading ? loadingLabel : idleLabel;
}
