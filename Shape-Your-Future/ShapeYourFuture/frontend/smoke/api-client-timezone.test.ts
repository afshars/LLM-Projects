// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient, browserTimeZone } from "../src/api/client";

/** Step 4: every request carries the browser's IANA zone so the backend can find the user's calendar day. */

afterEach(() => vi.unstubAllGlobals());

describe("X-Timezone header", () => {
  it("is the browser's IANA zone", () => {
    expect(browserTimeZone()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it("is sent on a day-based request, together with the explicit local day", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ tactic: null, blocker_type: null }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await apiClient.getConfirmedTactic("2026-03-11");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("day=2026-03-11");
    expect((init.headers as Record<string, string>)["X-Timezone"]).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });
});
