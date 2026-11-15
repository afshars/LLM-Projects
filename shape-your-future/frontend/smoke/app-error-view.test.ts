// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { setLang } from "../src/lib/theme-i18n";
import { appErrorBanner, appErrorPanel } from "../src/lib/ui/app-error";
import { DICTIONARIES } from "../src/lib/dictionary";

/** Step 6 (audit B4): the translated error surfaces. No blank page, always a way to try again. */

afterEach(() => setLang("en"));

const click = (root: HTMLElement, selector: string) => {
  const node = root.querySelector(selector) as HTMLElement | null;
  expect(node, selector).not.toBeNull();
  node!.click();
};

describe("appErrorPanel", () => {
  it("shows the translated title and crash message for a non-API error, in both languages", () => {
    for (const lang of ["en", "fa"] as const) {
      setLang(lang);
      const copy = DICTIONARIES[lang].ui.appError;
      const panel = appErrorPanel({ error: new TypeError("x is null"), onRetry: () => undefined });
      expect(panel.getAttribute("role")).toBe("alert");
      expect(panel.textContent).toContain(copy.title);
      expect(panel.textContent).toContain(copy.crashMessage);
      expect(panel.textContent).toContain(copy.retry);
      expect(panel.textContent).toContain(copy.reload);
      // never the raw exception text
      expect(panel.textContent).not.toContain("x is null");
    }
  });

  it("shows the translated API message (not the server text) for an ApiError", () => {
    setLang("fa");
    const panel = appErrorPanel({ error: { kind: "network", status: null, message: "Could not reach" }, onRetry: () => undefined });
    expect(panel.textContent).toContain(DICTIONARIES.fa.errors.network);
    expect(panel.textContent).not.toContain("Could not reach");
  });

  it("Try again and Reload call their handlers", () => {
    const onRetry = vi.fn();
    const onReload = vi.fn();
    const panel = appErrorPanel({ error: new Error("x"), onRetry, onReload });
    click(panel, "[data-app-error-retry]");
    expect(onRetry).toHaveBeenCalledTimes(1);
    click(panel, "[data-app-error-reload]");
    expect(onReload).toHaveBeenCalledTimes(1);
  });
});

describe("appErrorBanner", () => {
  it("is an alert with the translated message, Try again and Dismiss", () => {
    const onRetry = vi.fn();
    const onDismiss = vi.fn();
    const banner = appErrorBanner({ error: { kind: "server", status: 500, message: "raw" }, onRetry, onDismiss });
    expect(banner.getAttribute("role")).toBe("alert");
    expect(banner.textContent).toContain(DICTIONARIES.en.errors.server);
    expect(banner.textContent).not.toContain("raw");
    click(banner, "[data-app-error-retry]");
    click(banner, "[data-app-error-dismiss]");
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("is rebuilt in the new language from the same error", () => {
    const error = { kind: "rate_limit", status: 429, message: "x" };
    const en = appErrorBanner({ error, onRetry: () => undefined, onDismiss: () => undefined });
    setLang("fa");
    const fa = appErrorBanner({ error, onRetry: () => undefined, onDismiss: () => undefined });
    expect(en.textContent).toContain(DICTIONARIES.en.errors.rateLimit);
    expect(fa.textContent).toContain(DICTIONARIES.fa.errors.rateLimit);
  });
});
