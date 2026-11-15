/** Minimal helpers so views don't hand-write innerHTML strings everywhere. */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: (Node | string)[] = []
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) {
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

export function mount(root: HTMLElement, node: Node) {
  root.replaceChildren(node);
}

import type { ApiError } from "../api/types";
import { getLang, t } from "./theme-i18n";

/** Where an error happened, when the same HTTP status means different
 * things: on the login form a 401 is "wrong credentials", anywhere else it
 * is "session expired". On the register form a 400 is "can't register".
 * "save" (a confirm request that stores the user's data): a 400/422 is always the
 * generic "check your input" text, never the server's own wording or one of our
 * internal reason codes.
 * "conversation-restore" (GET /conversation/{id}): a 404 says the conversation was not found (unknown id, or it
 * belongs to another user). */
export type ErrorContext = "login" | "register" | "save" | "conversation-restore";

const PERSIAN_CHARS = /[\u0600-\u06FF]/;
/** api/client.ts falls back to this text when the server sent no `detail`. */
const NO_DETAIL = /^Request failed \(/;

/** The backend's 400/422 texts are free-form and in mixed languages
 * (Persian domain messages, English pydantic messages). Known ones map to
 * the UI language; anything else is shown only if it already matches the
 * UI language, otherwise a generic "check your input" message is used. */
function validationMessage(err: ApiError, context?: ErrorContext): string {
  const e = t().errors;
  const raw = err.message;
  if (context === "save") return e.validation;
  if (context === "register" && err.status === 400) return e.registerRejected;
  if (/active hours|ساعات فعال/i.test(raw)) return e.noActiveHours;
  if (/Next Action آماده/.test(raw)) return e.nothingPlannable;
  const usable = raw.trim() !== "" && !NO_DETAIL.test(raw) && PERSIAN_CHARS.test(raw) === (getLang() === "fa");
  return usable ? raw : e.validation;
}

/** Human-facing, localized text for an error. Never exposes stack traces or
 * internals. `err.message` stays the raw server text (some views match on
 * it for control flow); only this function decides what the user reads. */
export function errorMessage(err: unknown, context?: ErrorContext): string {
  const e = t().errors;
  if (!isApiError(err)) return e.generic;
  switch (err.kind) {
    case "network":
      return e.network;
    case "rate_limit":
      return e.rateLimit;
    case "server":
      return e.server;
    case "llm_unavailable":
      return e.llmUnavailable;
    case "conflict":
      return e.conflict;
    case "not_found":
      return context === "conversation-restore" ? e.conversationNotFound : e.notFound;
    case "auth":
      return context === "login" ? e.invalidCredentials : e.sessionExpired;
    case "validation":
      return validationMessage(err, context);
    default:
      return e.generic;
  }
}

export function isApiError(err: unknown): err is ApiError {
  return !!err && typeof err === "object" && "kind" in err && "status" in err;
}
