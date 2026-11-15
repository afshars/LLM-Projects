// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../src/api/client";

/** Step 6 (audit B7): a 2xx answer that is not JSON used to throw a raw SyntaxError out of request(). */

afterEach(() => vi.unstubAllGlobals());

const stub = (response: () => Response) => vi.stubGlobal("fetch", vi.fn(async () => response()));

describe("request(): 2xx with a body that is not JSON", () => {
  it("rejects with a normalized ApiError (kind server), never a SyntaxError", async () => {
    stub(() => new Response("<html>proxy error page</html>", { status: 200, headers: { "Content-Type": "text/html" } }));
    const err = await apiClient.getProfile().then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).not.toBeInstanceOf(SyntaxError);
    expect(err).toMatchObject({ kind: "server", status: 200 });
  });

  it("on an LLM route the same failure is llm_unavailable", async () => {
    stub(() => new Response("", { status: 200 }));
    await expect(apiClient.suggestTactic("my phone keeps pinging", "en")).rejects.toMatchObject({ kind: "llm_unavailable" });
  });

  it("does not change the happy paths: JSON is parsed, 204 stays undefined", async () => {
    stub(() => new Response(JSON.stringify({ username: "a" }), { status: 200 }));
    await expect(apiClient.getProfile()).resolves.toEqual({ username: "a" });
    stub(() => new Response(null, { status: 204 }));
    await expect(apiClient.changePassword({ current_password: "a", new_password: "b" })).resolves.toBeUndefined();
  });
});
