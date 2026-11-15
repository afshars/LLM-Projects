// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Step 10: state/focus-timer.ts, the optional timer of the Today screen. Pure helpers + the store with a fake clock. */

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});
const load = () => import("../src/state/focus-timer");

describe("pure helpers", () => {
  it("formatRemaining rounds UP to the second and never goes below zero", async () => {
    const { formatRemaining } = await load();
    expect(formatRemaining(25 * 60_000)).toBe("25:00");
    expect(formatRemaining(61_001)).toBe("01:02");
    expect(formatRemaining(500)).toBe("00:01");
    expect(formatRemaining(-5)).toBe("00:00");
  });

  it("timerView: idle, running, finished", async () => {
    const { timerView } = await load();
    expect(timerView(null, 0)).toEqual({ phase: "idle" });
    expect(timerView({ endsAt: 10_000, minutes: 25 }, 4_000)).toEqual({ phase: "running", minutes: 25, remainingMs: 6_000 });
    expect(timerView({ endsAt: 10_000, minutes: 25 }, 10_000)).toEqual({ phase: "finished", minutes: 25 });
  });
});

describe("store", () => {
  it("start sets the END time, so it stays right whenever it is read", async () => {
    const { focusTimerStore } = await load();
    focusTimerStore.start(25, 1_000_000);
    expect(focusTimerStore.view(1_000_000)).toEqual({ phase: "running", minutes: 25, remainingMs: 25 * 60_000 });
    expect(focusTimerStore.view(1_000_000 + 10 * 60_000)).toMatchObject({ phase: "running", remainingMs: 15 * 60_000 });
    expect(focusTimerStore.view(1_000_000 + 26 * 60_000)).toEqual({ phase: "finished", minutes: 25 });
  });

  it("only the offered lengths are accepted (anything else becomes the default)", async () => {
    const { focusTimerStore, DEFAULT_TIMER_MINUTES } = await load();
    focusTimerStore.start(7, 0);
    expect(focusTimerStore.view(0)).toMatchObject({ minutes: DEFAULT_TIMER_MINUTES });
  });

  it("clear stops a running timer and dismisses a finished one; listeners hear about it", async () => {
    const { focusTimerStore } = await load();
    const seen = vi.fn();
    focusTimerStore.subscribe(seen);
    focusTimerStore.start(15, 0);
    focusTimerStore.clear();
    focusTimerStore.clear(); // nothing to clear: no extra event
    expect(focusTimerStore.view(1)).toEqual({ phase: "idle" });
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it("survives a reload (localStorage) and ignores a broken stored value", async () => {
    let m = await load();
    m.focusTimerStore.start(50, Date.now());
    vi.resetModules();
    m = await load();
    expect(m.focusTimerStore.view()).toMatchObject({ phase: "running", minutes: 50 });
    localStorage.setItem("maketime:focus-timer", "{not json");
    vi.resetModules();
    m = await load();
    expect(m.focusTimerStore.view()).toEqual({ phase: "idle" });
  });

  it("works without storage (blocked localStorage)", async () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { focusTimerStore } = await load();
    expect(() => focusTimerStore.start(25, 0)).not.toThrow();
    expect(focusTimerStore.view(1)).toMatchObject({ phase: "running" });
    spy.mockRestore();
  });

  it("logging out drops the timer", async () => {
    const { focusTimerStore } = await load();
    const { journey } = await import("../src/state/journey");
    journey.goTo("DAILY_PLAN");
    focusTimerStore.start(25, Date.now());
    journey.reset();
    expect(focusTimerStore.view()).toEqual({ phase: "idle" });
  });
});
