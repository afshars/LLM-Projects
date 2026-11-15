// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { onAppError } from "../src/lib/app-error";
import type { AppErrorReport } from "../src/lib/app-error";
import { journey } from "../src/state/journey";

/** Step 6 (audit B4): one throwing journey listener used to stop every listener after it. */

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("journey.subscribe", () => {
  it("keeps notifying the other listeners when one throws, and reports the failure", () => {
    const reports: AppErrorReport[] = [];
    const offReport = onAppError((r) => reports.push(r));
    const after = vi.fn();
    const offBad = journey.subscribe(() => {
      throw new Error("view blew up");
    });
    const offGood = journey.subscribe(after);

    expect(() => journey.goTo("DAILY_PLAN")).not.toThrow();
    expect(after).toHaveBeenCalled();
    expect(reports.some((r) => r.source === "listener" && (r.error as Error).message === "view blew up")).toBe(true);

    offBad();
    offGood();
    offReport();
  });
});
