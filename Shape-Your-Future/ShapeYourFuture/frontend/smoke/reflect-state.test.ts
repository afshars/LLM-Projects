// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RecentDay } from "../src/api/types";

/** Step 11: the "last 7 days" store and its pure helpers. Only fetch is stubbed. */

const tick = () => new Promise((r) => setTimeout(r, 0));
const day = (date: string, highlight: string | null, done: boolean | null): RecentDay => ({ date, highlight, highlight_done: done });
const WEEK: RecentDay[] = [
  day("2026-11-03", "A", true),
  day("2026-11-04", null, null),
  day("2026-11-05", "B", false),
  day("2026-11-06", "C", true),
  day("2026-11-07", "D", false),
  day("2026-11-08", null, null),
  day("2026-11-09", "E", false),
];

let calls: Array<{ method: string; url: string }>;
let reply: () => { status: number; body: unknown };

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  calls = [];
  reply = () => ({ status: 200, body: { days: WEEK } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ method: (init.method ?? "GET").toUpperCase(), url });
      const r = reply();
      return new Response(JSON.stringify(r.body), { status: r.status });
    })
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("withToday / newestFirst", () => {
  it("takes today's row from the entry on screen and leaves the other rows alone", async () => {
    const { withToday } = await import("../src/state/reflect");
    const out = withToday(WEEK, { date: "2026-11-09", highlight: "E", highlight_done: true });
    expect(out.map((d) => d.highlight_done)).toEqual([true, null, false, true, false, null, true]);
    expect(out.slice(0, 6)).toEqual(WEEK.slice(0, 6));
  });

  it("a day without a Highlight is never 'done' or 'not done'", async () => {
    const { withToday } = await import("../src/state/reflect");
    const out = withToday(WEEK, { date: "2026-11-09", highlight: null, highlight_done: false });
    expect(out[6]).toEqual({ date: "2026-11-09", highlight: null, highlight_done: null });
  });

  it("keeps the list as it is with no entry, or when the entry's day is not in it", async () => {
    const { withToday } = await import("../src/state/reflect");
    expect(withToday(WEEK, null)).toEqual(WEEK);
    expect(withToday(WEEK, { date: "2030-01-01", highlight: "X", highlight_done: true })).toEqual(WEEK);
  });

  it("sorts newest first without touching its input", async () => {
    const { newestFirst } = await import("../src/state/reflect");
    const copy = [...WEEK];
    expect(newestFirst(WEEK).map((d) => d.date)).toEqual(copy.map((d) => d.date).reverse());
    expect(WEEK).toEqual(copy);
  });
});

describe("recentStore", () => {
  it("loads once (GET /daily-entry/recent with the local day) and answers from memory afterwards", async () => {
    const { recentStore } = await import("../src/state/reflect");
    const { localDay } = await import("../src/state/today");
    expect(recentStore.get().status).toBe("idle");
    await recentStore.load();
    await tick();
    expect(recentStore.get().status).toBe("ready");
    expect(recentStore.get().days).toEqual(WEEK);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("GET");
    expect(calls[0]!.url).toContain("/daily-entry/recent");
    expect(calls[0]!.url).toContain(`day=${localDay()}`);
    await recentStore.load();
    expect(calls).toHaveLength(1);
  });

  it("asks again on a new calendar day and on force", async () => {
    const { recentStore } = await import("../src/state/reflect");
    await recentStore.load();
    expect(recentStore.needsLoad(new Date(2099, 0, 1))).toBe(true);
    await recentStore.load({ force: true });
    expect(calls).toHaveLength(2);
  });

  it("keeps the failure as an ApiError (no raw text) and asks again on the next visit", async () => {
    const { recentStore } = await import("../src/state/reflect");
    reply = () => ({ status: 500, body: { detail: "boom" } });
    await recentStore.load();
    await tick();
    expect(recentStore.get().status).toBe("error");
    expect(recentStore.get().error).toMatchObject({ kind: "server", status: 500 });
    expect(recentStore.get().days).toEqual([]);
    reply = () => ({ status: 200, body: { days: WEEK } });
    await recentStore.load();
    await tick();
    expect(recentStore.get().status).toBe("ready");
  });

  it("forgets everything on reset and drops an answer that was still on its way", async () => {
    const { recentStore } = await import("../src/state/reflect");
    const pending = recentStore.load();
    recentStore.reset();
    await pending;
    await tick();
    expect(recentStore.get()).toEqual({ status: "idle", days: [], error: null });
  });

  it("holds nothing but the days: no counts, rates or streaks", async () => {
    const { recentStore } = await import("../src/state/reflect");
    await recentStore.load();
    expect(Object.keys(recentStore.get()).sort()).toEqual(["days", "error", "status"]);
    for (const d of recentStore.get().days) expect(Object.keys(d).sort()).toEqual(["date", "highlight", "highlight_done"]);
  });
});
