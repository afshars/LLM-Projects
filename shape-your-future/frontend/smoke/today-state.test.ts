// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DailyEntry } from "../src/api/types";

/**
 * Step 10: state/today.ts. Only fetch is stubbed. Checked: WHEN GET /daily-entry/today is made, that every change is
 * shown at once and sent as ONLY the changed keys, that saves are serialized (taps made during a request are merged
 * into the next one), and that a failure keeps what the user did and can be retried.
 */

const tick = () => new Promise((r) => setTimeout(r, 0));
const entry = (extra: Partial<DailyEntry> = {}): DailyEntry => ({
  date: "2026-11-09",
  exists: false,
  highlight: null,
  highlight_done: false,
  scheduled_time: null,
  laser: { notifications_off: false, remove_apps: false, internet_distance: false },
  energize: { walk: false, real_food: false, caffeine: false, rest: false },
  energy: null,
  reflection_note: null,
  change_for_tomorrow: null,
  ...extra,
});

let calls: Array<{ method: string; url: string; body: Record<string, unknown> | null }>;
let server: DailyEntry;
let failNext: Array<{ status: number }>;
let gate: Promise<void> | null;

/** What the real backend does with a PUT: only the sent keys change. */
function serverApply(body: Record<string, any>) {
  server = { ...server, exists: true, laser: { ...server.laser, ...(body.laser ?? {}) }, energize: { ...server.energize, ...(body.energize ?? {}) } };
  for (const k of ["highlight", "scheduled_time", "energy", "reflection_note", "change_for_tomorrow"] as const) if (k in body) (server as any)[k] = body[k];
  if (server.highlight === null) {
    server.scheduled_time = null;
    server.highlight_done = false;
  }
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  calls = [];
  failNext = [];
  gate = null;
  server = entry();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = (init.method ?? "GET").toUpperCase();
      const body = init.body ? JSON.parse(String(init.body)) : null;
      calls.push({ method, url, body });
      if (gate && method === "PUT") await gate;
      const fail = method === "PUT" ? failNext.shift() : undefined;
      if (fail) return new Response(JSON.stringify({ detail: "x" }), { status: fail.status });
      if (method === "PUT") serverApply(body);
      return new Response(JSON.stringify(server), { status: 200 });
    })
  );
});
afterEach(() => vi.unstubAllGlobals());

async function boot() {
  const { authStorage } = await import("../src/api/auth-storage");
  authStorage.setToken("tok");
  const mod = await import("../src/state/today");
  const { journey } = await import("../src/state/journey");
  return { ...mod, journey };
}
const puts = () => calls.filter((c) => c.method === "PUT");

describe("pure helpers", () => {
  it("localDay is the LOCAL calendar day, not the UTC one", async () => {
    const { localDay } = await boot();
    expect(localDay(new Date(2026, 10, 9, 23, 30))).toBe("2026-11-09");
    expect(localDay(new Date(2026, 0, 5, 0, 5))).toBe("2026-01-05");
  });

  it("cleanText trims and turns blank into null", async () => {
    const { cleanText } = await boot();
    expect(cleanText("  write  ")).toBe("write");
    expect(cleanText("   ")).toBeNull();
  });

  it("applyPatch changes only what was sent; clearing the Highlight clears its time", async () => {
    const { applyPatch } = await boot();
    const base = entry({ highlight: "Write", scheduled_time: "09:00", laser: { notifications_off: true, remove_apps: false, internet_distance: false } });
    const a = applyPatch(base, { energize: { walk: true } });
    expect(a.energize).toEqual({ walk: true, real_food: false, caffeine: false, rest: false });
    expect(a.laser.notifications_off).toBe(true);
    expect(a.highlight).toBe("Write");
    expect(base.energize.walk).toBe(false); // the old object is untouched
    const cleared = applyPatch(base, { highlight: null });
    expect(cleared.highlight).toBeNull();
    expect(cleared.scheduled_time).toBeNull();
  });

  it("mergePatch: the newer value wins, check groups merge key by key, a cleared Highlight drops the time", async () => {
    const { mergePatch } = await boot();
    expect(mergePatch({ laser: { remove_apps: true }, highlight: "A" }, { laser: { internet_distance: true }, highlight: "B" })).toEqual({
      laser: { remove_apps: true, internet_distance: true },
      highlight: "B",
    });
    expect(mergePatch({ scheduled_time: "09:00" }, { highlight: null })).toEqual({ highlight: null });
  });
});

describe("loading", () => {
  it("first load asks for the user's local day once; a rebuilt view (load again) does not ask again", async () => {
    const { todayStore, localDay } = await boot();
    expect(todayStore.get().status).toBe("idle");
    await todayStore.load();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toMatch(new RegExp(`/daily-entry/today\\?day=${localDay()}$`));
    await todayStore.load();
    await todayStore.load();
    expect(calls).toHaveLength(1);
    expect(todayStore.get().status).toBe("ready");
    expect(todayStore.get().entry!.exists).toBe(false);
  });

  it("a new calendar day asks again; force always asks", async () => {
    const { todayStore } = await boot();
    await todayStore.load();
    expect(todayStore.needsLoad(new Date())).toBe(false);
    expect(todayStore.needsLoad(new Date(Date.now() + 2 * 86_400_000))).toBe(true);
    await todayStore.load({ force: true });
    expect(calls).toHaveLength(2);
  });

  it("a failed load keeps the error kind and the next visit asks again", async () => {
    const { todayStore } = await boot();
    (globalThis.fetch as any).mockImplementationOnce(async () => new Response("{}", { status: 500 }));
    await todayStore.load();
    expect(todayStore.get().status).toBe("error");
    expect(todayStore.get().error!.kind).toBe("server");
    await todayStore.load();
    expect(todayStore.get().status).toBe("ready");
  });

  it("a 401 goes to the session guard: back to login, the store is cleared", async () => {
    const { todayStore, journey } = await boot();
    (globalThis.fetch as any).mockImplementationOnce(async () => new Response("{}", { status: 401 }));
    await todayStore.load();
    expect(journey.get().step).toBe("AUTH");
    expect(todayStore.get().status).toBe("idle");
  });
});

describe("saving", () => {
  it("shows the change at once and sends only the changed keys", async () => {
    const { todayStore } = await boot();
    await todayStore.load();
    todayStore.save({ laser: { notifications_off: true } });
    expect(todayStore.get().entry!.laser.notifications_off).toBe(true); // before the answer
    expect(todayStore.get().saving).toBe(true);
    await tick();
    expect(puts()).toHaveLength(1);
    expect(puts()[0]!.body).toEqual({ laser: { notifications_off: true } });
    expect(puts()[0]!.url).toMatch(/\?day=\d{4}-\d{2}-\d{2}$/);
    expect(todayStore.get()).toMatchObject({ saving: false, saved: true, saveError: null });
    expect(todayStore.get().entry!.exists).toBe(true);
  });

  it("the Highlight text: blank clears (null is sent), a time can follow", async () => {
    const { todayStore } = await boot();
    await todayStore.load();
    todayStore.save({ highlight: "Write the plan" });
    await tick();
    todayStore.save({ scheduled_time: "09:30" });
    await tick();
    expect(puts().map((p) => p.body)).toEqual([{ highlight: "Write the plan" }, { scheduled_time: "09:30" }]);
    todayStore.save({ highlight: null });
    await tick();
    expect(puts()[2]!.body).toEqual({ highlight: null });
    expect(todayStore.get().entry).toMatchObject({ highlight: null, scheduled_time: null });
  });

  it("is serialized: taps made while a request runs are merged into ONE next request, in order", async () => {
    const { todayStore } = await boot();
    await todayStore.load();
    let open!: () => void;
    gate = new Promise<void>((r) => (open = r));
    todayStore.save({ energize: { walk: true } });
    await tick();
    todayStore.save({ energize: { real_food: true } });
    todayStore.save({ laser: { remove_apps: true } });
    todayStore.save({ energize: { walk: false } }); // the newer value of the same key wins
    expect(puts()).toHaveLength(1); // only the first is on the wire
    const shown = todayStore.get().entry!;
    expect(shown.energize).toMatchObject({ walk: false, real_food: true });
    gate = null;
    open();
    await tick();
    await tick();
    expect(puts().map((p) => p.body)).toEqual([{ energize: { walk: true } }, { energize: { real_food: true, walk: false }, laser: { remove_apps: true } }]);
    expect(todayStore.get().entry!.energize.walk).toBe(false);
    expect(todayStore.get()).toMatchObject({ saving: false, saved: true });
  });

  it("is ignored before the entry is loaded", async () => {
    const { todayStore } = await boot();
    todayStore.save({ laser: { remove_apps: true } });
    await tick();
    expect(calls).toHaveLength(0);
  });
});

describe("a failed save", () => {
  it("keeps what the user did, says it is not saved, and retry() sends the same change", async () => {
    const { todayStore } = await boot();
    await todayStore.load();
    failNext = [{ status: 500 }];
    todayStore.save({ energize: { walk: true } });
    await tick();
    const s = todayStore.get();
    expect(s.saveError!.kind).toBe("server");
    expect(s.saved).toBe(false);
    expect(s.entry!.energize.walk).toBe(true); // still on screen
    expect(todayStore.hasUnsaved()).toBe(true);
    todayStore.retry();
    await tick();
    expect(puts().map((p) => p.body)).toEqual([{ energize: { walk: true } }, { energize: { walk: true } }]);
    expect(todayStore.get()).toMatchObject({ saveError: null, saved: true });
    expect(todayStore.hasUnsaved()).toBe(false);
  });

  it("a rate limit (429) is also kept for retry", async () => {
    const { todayStore } = await boot();
    await todayStore.load();
    failNext = [{ status: 429 }];
    todayStore.save({ laser: { notifications_off: true } });
    await tick();
    expect(todayStore.get().saveError!.kind).toBe("rate_limit");
    todayStore.retry();
    await tick();
    expect(server.laser.notifications_off).toBe(true);
  });

  it("a newer change goes together with the failed one (so retrying can never undo it)", async () => {
    const { todayStore } = await boot();
    await todayStore.load();
    failNext = [{ status: 500 }];
    todayStore.save({ highlight: "First" });
    await tick();
    todayStore.save({ highlight: "Second", energize: { rest: true } });
    await tick();
    expect(puts()[1]!.body).toEqual({ highlight: "Second", energize: { rest: true } });
    expect(server.highlight).toBe("Second");
    expect(todayStore.get().saveError).toBeNull();
  });

  it("load() does not run while there is an unsaved change (it would hide it)", async () => {
    const { todayStore } = await boot();
    await todayStore.load();
    failNext = [{ status: 500 }];
    todayStore.save({ laser: { remove_apps: true } });
    await tick();
    await todayStore.load({ force: true });
    expect(calls.filter((c) => c.method === "GET")).toHaveLength(1);
    expect(todayStore.get().entry!.laser.remove_apps).toBe(true);
  });

  it("a 401 while saving goes to the session guard", async () => {
    const { todayStore, journey } = await boot();
    await todayStore.load();
    failNext = [{ status: 401 }];
    todayStore.save({ laser: { remove_apps: true } });
    await tick();
    expect(journey.get().step).toBe("AUTH");
    expect(todayStore.get().entry).toBeNull();
  });
});

describe("no scores", () => {
  it("the state holds no counter, score or streak", async () => {
    const { todayStore } = await boot();
    await todayStore.load();
    expect(Object.keys(todayStore.get()).sort()).toEqual(["entry", "error", "saveError", "saved", "saving", "status"]);
    expect(Object.keys(todayStore.get().entry!).join(",")).not.toMatch(/score|streak|points|count/i);
  });
});
