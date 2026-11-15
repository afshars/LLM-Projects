// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { apiClient } from "../src/api/client";

/**
 * Part 21e fix 5: the executable form of the "endpoint coverage" grep in docs/growth-os/08-coverage-matrix.md.
 * Every apiClient method must be called from some module outside api/client.ts, or be listed here WITH a reason.
 * A new unused method fails this test until someone either wires it or writes the decision down.
 */

/** Client methods that are intentionally not used by any screen. Empty since the simplification: every method has a caller. */
const INTENTIONALLY_UNUSED: Record<string, string> = {};

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
  });

/** Source text with comments removed (a method named only in a comment is not a call). */
const code = (file: string): string => readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("apiClient usage", () => {
  const files = walk("src").filter((f) => !f.replace(/\\/g, "/").endsWith("src/api/client.ts"));
  const sources = files.map(code);
  const methods = Object.keys(apiClient).filter((k) => typeof (apiClient as Record<string, unknown>)[k] === "function");

  it("finds the client and the source files", () => {
    expect(methods.length).toBeGreaterThan(8);
    expect(files.length).toBeGreaterThan(40);
  });

  it("every method is used outside api/client.ts, or listed as intentionally unused", () => {
    const unused = methods.filter((m) => !sources.some((s) => new RegExp(`\\b${m}\\b`).test(s)));
    expect(unused.sort()).toEqual(Object.keys(INTENTIONALLY_UNUSED).sort());
  });

  it("an intentionally-unused method is still a real client method (no stale entries)", () => {
    for (const name of Object.keys(INTENTIONALLY_UNUSED)) expect(methods).toContain(name);
  });
});
