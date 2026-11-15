import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installGlobalErrorHandlers, onAppError, reportAppError, shouldShowAppError } from "../src/lib/app-error";
import type { AppErrorReport } from "../src/lib/app-error";

/** Step 6 (audit B4): everything that fails outside a view's own handling goes through reportAppError(). */

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("reportAppError", () => {
  it("tells every listener the error and where it came from, and stops after unsubscribe", () => {
    const seen: AppErrorReport[] = [];
    const off = onAppError((r) => seen.push(r));
    const boom = new Error("boom");
    reportAppError(boom, "promise");
    expect(seen).toEqual([{ error: boom, source: "promise" }]);
    off();
    reportAppError(boom, "promise");
    expect(seen).toHaveLength(1);
  });

  it("a listener that throws neither throws out of reportAppError nor hides the error from the others", () => {
    const seen: unknown[] = [];
    const offBad = onAppError(() => {
      throw new Error("listener broke");
    });
    const offGood = onAppError((r) => seen.push(r.error));
    expect(() => reportAppError("original", "listener")).not.toThrow();
    expect(seen).toEqual(["original"]);
    offBad();
    offGood();
  });

  it("logs the error to the console", () => {
    reportAppError(new Error("logged"), "window");
    expect(console.error).toHaveBeenCalled();
  });
});

describe("shouldShowAppError", () => {
  it("does not interrupt the user for a 401 (the session guard routes to login)", () => {
    expect(shouldShowAppError({ kind: "auth", status: 401, message: "x" })).toBe(false);
  });

  it("ignores the harmless ResizeObserver notification", () => {
    expect(shouldShowAppError(new Error("ResizeObserver loop completed with undelivered notifications."))).toBe(false);
    expect(shouldShowAppError("ResizeObserver loop limit exceeded")).toBe(false);
  });

  it("shows network/server errors, plain errors, strings and empty rejections", () => {
    expect(shouldShowAppError({ kind: "network", status: null, message: "x" })).toBe(true);
    expect(shouldShowAppError({ kind: "server", status: 500, message: "x" })).toBe(true);
    expect(shouldShowAppError(new TypeError("x is null"))).toBe(true);
    expect(shouldShowAppError("something")).toBe(true);
    expect(shouldShowAppError(undefined)).toBe(true);
  });
});

describe("installGlobalErrorHandlers", () => {
  it("reports unhandled rejections and uncaught errors, and can be removed", () => {
    const target = new EventTarget();
    const seen: AppErrorReport[] = [];
    const off = onAppError((r) => seen.push(r));
    const uninstall = installGlobalErrorHandlers(target);

    const reason = { kind: "network", status: null, message: "down" };
    target.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason }));
    const err = new Error("uncaught");
    target.dispatchEvent(Object.assign(new Event("error"), { error: err }));
    expect(seen).toEqual([
      { error: reason, source: "promise" },
      { error: err, source: "window" },
    ]);

    uninstall();
    target.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason: "later" }));
    expect(seen).toHaveLength(2);
    off();
  });

  it("ignores an error event that carries nothing (resource load failures)", () => {
    const target = new EventTarget();
    const seen: AppErrorReport[] = [];
    const off = onAppError((r) => seen.push(r));
    const uninstall = installGlobalErrorHandlers(target);
    target.dispatchEvent(new Event("error"));
    expect(seen).toEqual([]);
    uninstall();
    off();
  });
});
