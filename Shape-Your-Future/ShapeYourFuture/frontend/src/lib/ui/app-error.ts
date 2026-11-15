import { el, errorMessage, isApiError } from "../dom";
import { t } from "../theme-i18n";

/**
 * The two translated error surfaces (copy in lib/ui/i18n, `dict.ui.appError`):
 *
 *   appErrorPanel   replaces a view that could not be built (full page, never a blank <main>).
 *   appErrorBanner  non-blocking strip for failures that happened outside any view's own handling
 *                   (an unhandled rejection, a throwing listener). The page underneath keeps working.
 *
 * Both offer "Try again" (the caller re-draws the current view, so its data is requested again) and are
 * built at render time from the stored error, so a language switch re-translates them.
 */

export interface AppErrorPanelOptions {
  error: unknown;
  onRetry: () => void;
  /** Defaults to a full page reload; injectable for tests. */
  onReload?: () => void;
}

function messageFor(error: unknown): string {
  // A server/network failure has its own translated text; anything else is a bug in our code.
  return isApiError(error) ? errorMessage(error) : t().ui.appError.crashMessage;
}

function button(label: string, cls: string, attr: string, onClick: () => void): HTMLButtonElement {
  const btn = el("button", { class: cls, type: "button", [attr]: "true" }, [label]) as HTMLButtonElement;
  btn.addEventListener("click", onClick);
  return btn;
}

export function appErrorPanel(o: AppErrorPanelOptions): HTMLElement {
  const copy = t().ui.appError;
  const reload = o.onReload ?? (() => window.location.reload());
  return el("section", { class: "app-error", role: "alert", "data-app-error": "panel" }, [
    el("h1", { class: "page-title" }, [copy.title]),
    el("p", { class: "app-error__msg", dir: "auto" }, [messageFor(o.error)]),
    el("div", { class: "app-error__actions" }, [
      button(copy.retry, "btn-primary", "data-app-error-retry", o.onRetry),
      button(copy.reload, "btn-secondary", "data-app-error-reload", reload),
    ]),
  ]);
}

export interface AppErrorBannerOptions {
  error: unknown;
  onRetry: () => void;
  onDismiss: () => void;
}

export function appErrorBanner(o: AppErrorBannerOptions): HTMLElement {
  const copy = t().ui.appError;
  return el("div", { class: "error-banner app-error-banner", role: "alert", "aria-live": "assertive", "data-app-error": "banner" }, [
    el("span", { class: "app-error-banner__msg", dir: "auto" }, [messageFor(o.error)]),
    el("span", { class: "app-error-banner__actions" }, [
      button(copy.retry, "btn-secondary", "data-app-error-retry", o.onRetry),
      button(copy.dismiss, "btn-secondary", "data-app-error-dismiss", o.onDismiss),
    ]),
  ]);
}
