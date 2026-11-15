import type { ApiError } from "../api/types";

/**
 * App-wide error reporting (no DOM, no translations: pure logic, so it is trivially testable).
 *
 * Why it exists: before this, an exception inside a renderer, a journey listener or a promise nobody
 * awaited left the previous (or an empty) <main> on screen and nothing told the user. Everything that
 * can fail "outside" a view's own error handling now ends up in reportAppError(); app.ts listens and
 * shows a translated error state with a retry button (lib/ui/app-error.ts).
 */

/** Where the error was caught. "render": a view threw while building (app.ts shows the full-page panel
 * itself, so the banner ignores this source). The others come from code that has no UI of its own. */
export type AppErrorSource = "render" | "listener" | "promise" | "window" | "startup";

export interface AppErrorReport {
  error: unknown;
  source: AppErrorSource;
}

export type AppErrorListener = (report: AppErrorReport) => void;

const listeners = new Set<AppErrorListener>();

/** Subscribe to reported errors. Returns the unsubscribe function. */
export function onAppError(listener: AppErrorListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Logs the error and tells every listener. Never throws: a broken listener must not hide the original
 * error or stop the others, and this function is called from catch blocks and global handlers. */
export function reportAppError(error: unknown, source: AppErrorSource): void {
  try {
    console.error(`[app-error:${source}]`, error);
  } catch {
    // console missing or patched to throw: nothing else to do
  }
  for (const listener of [...listeners]) {
    try {
      listener({ error, source });
    } catch (listenerError) {
      try {
        console.error("[app-error] a listener failed", listenerError);
      } catch {
        // ignore
      }
    }
  }
}

/** Browser noise that is not a failure of the app. */
const BENIGN_MESSAGE = /ResizeObserver loop/i;

function isApiErrorLike(error: unknown): error is ApiError {
  return !!error && typeof error === "object" && "kind" in error && "status" in error;
}

/** Whether an error is worth interrupting the user for.
 * - A 401 (kind "auth") is owned by handleAuthExpiry(), which already routes to login.
 * - "ResizeObserver loop ..." is a harmless browser notification. */
export function shouldShowAppError(error: unknown): boolean {
  if (isApiErrorLike(error) && error.kind === "auth") return false;
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : (error as { message?: unknown } | null)?.message;
  if (typeof message === "string" && BENIGN_MESSAGE.test(message)) return false;
  return true;
}

/** The two global events this module listens to. Anything with addEventListener works (window, or an
 * EventTarget in tests). */
export interface ErrorEventTarget {
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
}

/** Routes uncaught exceptions and unhandled promise rejections into reportAppError(). Call once at startup.
 * Returns a function that removes both handlers. */
export function installGlobalErrorHandlers(target: ErrorEventTarget): () => void {
  const onRejection = (event: { reason?: unknown }) => reportAppError(event.reason, "promise");
  const onError = (event: { error?: unknown; message?: unknown }) => {
    // Resource load errors (img/script) do not carry an Error; a script error does.
    const error = event.error ?? event.message;
    if (error === undefined || error === null || error === "") return;
    reportAppError(error, "window");
  };
  target.addEventListener("unhandledrejection", onRejection as unknown as (event: Event) => void);
  target.addEventListener("error", onError as unknown as (event: Event) => void);
  return () => {
    target.removeEventListener("unhandledrejection", onRejection as unknown as (event: Event) => void);
    target.removeEventListener("error", onError as unknown as (event: Event) => void);
  };
}
