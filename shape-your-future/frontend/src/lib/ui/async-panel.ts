import type { ApiError, ApiErrorKind } from "../../api/types";
import { el, errorMessage, isApiError } from "../dom";
import type { ErrorContext } from "../dom";
import { t } from "../theme-i18n";
import { emptyStateGuide } from "./empty-state-guide";
import type { EmptyStateOptions } from "./empty-state-guide";
import { submitLock } from "./submit-lock";

/**
 * asyncPanel: one place that decides what a data-backed panel shows.
 *
 *   loading -> skeleton (shape of the content, not just a spinner/text)
 *   error   -> translated message + "Try again" (not for a 401: the session
 *              is gone and handleAuthExpiry already routes to login)
 *   empty   -> emptyStateGuide (what to do next, with a link)
 *   ready   -> whatever `render()` returns
 *
 * It is a pure function of the state you pass in, like the rest of the
 * views: call it inside your redraw. The error is turned into text HERE, at
 * render time, from `ApiError.kind`, so a language switch re-translates it.
 *
 *   panel.replaceChildren(asyncPanel({
 *     id: "dash-goals",
 *     status: s.status,                 // "idle" | "loading" | "ready" | "error"
 *     error: s.error,                   // ApiError | ApiErrorKind | null
 *     isEmpty: s.trees.length === 0,
 *     empty: { title, nextStep, action: { label, onClick } },
 *     onRetry: () => dashboardStore.load(),
 *     skeleton: "list",
 *     render: () => buildGoalList(s),
 *   }));
 */

export type AsyncStatus = "idle" | "loading" | "ready" | "error";
export type SkeletonVariant = "lines" | "card" | "list";

export interface AsyncPanelOptions {
  /** Stable id for this panel (keys the retry lock). */
  id: string;
  status: AsyncStatus;
  /** A full ApiError, or just its kind. */
  error?: ApiError | ApiErrorKind | null;
  errorContext?: ErrorContext;
  isEmpty?: boolean;
  /** Required in practice whenever `isEmpty` can be true. */
  empty?: EmptyStateOptions;
  /** May return a promise: the retry button stays disabled until it settles. */
  onRetry?: () => void | Promise<void>;
  skeleton?: SkeletonVariant;
  /** Number of skeleton lines / rows. Default 3. */
  rows?: number;
  /** Accessible name of the region (usually the panel heading text). */
  label?: string;
  render: () => Node;
}

function skeletonNode(variant: SkeletonVariant, rows: number): HTMLElement {
  const line = (extra = "") => el("span", { class: `ui-skeleton__line ${extra}`.trim() });
  const items: Node[] = [];
  if (variant === "card") {
    items.push(line("ui-skeleton__line--title"), el("span", { class: "ui-skeleton__block" }), line("ui-skeleton__line--short"));
  } else if (variant === "list") {
    for (let i = 0; i < rows; i++) {
      items.push(el("div", { class: "ui-skeleton__row" }, [el("span", { class: "ui-skeleton__dot" }), el("div", { class: "ui-skeleton__col" }, [line(), line("ui-skeleton__line--short")])]));
    }
  } else {
    for (let i = 0; i < rows; i++) items.push(line(i === rows - 1 ? "ui-skeleton__line--short" : ""));
  }
  return el("div", { class: `ui-skeleton ui-skeleton--${variant}`, "aria-hidden": "true" }, items);
}

export function asyncPanel(o: AsyncPanelOptions): HTMLElement {
  const dict = t();
  const root = el("div", { class: "ui-async" });
  if (o.label) {
    root.setAttribute("role", "region");
    root.setAttribute("aria-label", o.label);
  }

  if (o.status === "loading" || o.status === "idle") {
    root.setAttribute("aria-busy", "true");
    root.append(skeletonNode(o.skeleton ?? "lines", o.rows ?? 3), el("span", { class: "sr-only", role: "status" }, [dict.ui.async.loading]));
    return root;
  }

  if (o.status === "error") {
    const err: ApiError = typeof o.error === "string" ? { kind: o.error, status: null, message: "" } : o.error && isApiError(o.error) ? o.error : { kind: "unknown", status: null, message: "" };
    const box = el("div", { class: "ui-async__error", role: "alert" }, [el("p", { class: "ui-async__msg", dir: "auto" }, [errorMessage(err, o.errorContext)])]);

    if (o.onRetry && err.kind !== "auth") {
      const retry = el("button", { class: "btn-primary", type: "button" }, [dict.ui.async.retry]);
      const status = el("p", { class: "ui-async__wait" });
      const lock = submitLock(`async-retry:${o.id}`, {
        buttons: [retry],
        primary: retry,
        idleLabel: dict.ui.async.retry,
        busyLabel: dict.ui.async.retrying,
        status,
      });
      retry.addEventListener("click", () => void lock.run(async () => o.onRetry?.()));
      box.append(retry, status);
    }
    root.append(box);
    return root;
  }

  if (o.isEmpty) {
    if (!o.empty) {
      // A blank page is a bug in the caller: every empty state must name a next step.
      console.error(`asyncPanel "${o.id}": isEmpty without an "empty" guide`);
      root.append(el("p", { class: "ui-empty__desc" }, [dict.ui.empty.missingAction]));
    } else {
      root.append(emptyStateGuide(o.empty));
    }
    return root;
  }

  root.append(o.render());
  return root;
}
