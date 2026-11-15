// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DICTIONARIES } from "../src/lib/dictionary";

/**
 * Step 6 (audit B4): the real app shell with a view that throws. <main> must never stay blank, the error
 * must be translated, and "Try again" must rebuild the view. Only the Auth view is replaced by a stub (the
 * app starts on it when nobody is signed in); header, nav, journey and app.ts are the real ones.
 */

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
  Element.prototype.scrollTo = () => {}; // jsdom lacks it
  window.scrollTo = () => {};
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.doUnmock("../src/views/auth");
  vi.restoreAllMocks();
});

async function boot(renderAuth: () => HTMLElement) {
  vi.doMock("../src/views/auth", () => ({ renderAuth }));
  const { initThemeI18n, setLang } = await import("../src/lib/theme-i18n");
  initThemeI18n();
  setLang("en");
  const { reportAppError } = await import("../src/lib/app-error");
  const { startApp } = await import("../src/app");
  startApp(document.getElementById("app")!);
  const main = document.getElementById("view") as HTMLElement;
  return { main, setLang, reportAppError };
}

const okView = () => {
  const node = document.createElement("div");
  node.id = "auth-ok";
  return node;
};
const click = (selector: string) => {
  const node = document.querySelector<HTMLElement>(selector);
  expect(node, selector).not.toBeNull();
  node!.click();
};

describe("app shell error boundary", () => {
  it("replaces a view that throws with the translated panel (never a blank <main>), and Try again rebuilds it", async () => {
    let broken = true;
    const { main } = await boot(() => {
      if (broken) throw new Error("render failed");
      return okView();
    });

    expect(main.childElementCount).toBeGreaterThan(0);
    const panel = main.querySelector('[data-app-error="panel"]');
    expect(panel).not.toBeNull();
    expect(panel!.textContent).toContain(DICTIONARIES.en.ui.appError.title);
    expect(panel!.textContent).not.toContain("render failed");

    broken = false;
    click("[data-app-error-retry]");
    expect(main.querySelector("#auth-ok")).not.toBeNull();
    expect(main.querySelector('[data-app-error="panel"]')).toBeNull();
  });

  it("the panel is re-translated when the language changes", async () => {
    const { main, setLang } = await boot(() => {
      throw new Error("render failed");
    });
    setLang("fa");
    expect(main.querySelector('[data-app-error="panel"]')!.textContent).toContain(DICTIONARIES.fa.ui.appError.title);
  });
});

describe("app shell error banner (failures outside any view)", () => {
  it("an unhandled network error shows a translated banner; Try again re-draws the view and removes it", async () => {
    const renderAuth = vi.fn(okView);
    const { reportAppError } = await boot(renderAuth);
    const before = renderAuth.mock.calls.length;

    reportAppError({ kind: "network", status: null, message: "x" }, "promise");
    const banner = document.querySelector('[data-app-error="banner"]');
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain(DICTIONARIES.en.errors.network);

    click('[data-app-error="banner"] [data-app-error-retry]');
    expect(renderAuth.mock.calls.length).toBeGreaterThan(before);
    expect(document.querySelector('[data-app-error="banner"]')).toBeNull();
  });

  it("Dismiss removes the banner without re-drawing", async () => {
    const renderAuth = vi.fn(okView);
    const { reportAppError } = await boot(renderAuth);
    reportAppError(new Error("late failure"), "promise");
    const calls = renderAuth.mock.calls.length;
    click('[data-app-error="banner"] [data-app-error-dismiss]');
    expect(document.querySelector('[data-app-error="banner"]')).toBeNull();
    expect(renderAuth.mock.calls.length).toBe(calls);
  });

  it("a 401 never shows a banner (the session guard owns it)", async () => {
    const { reportAppError } = await boot(okView);
    reportAppError({ kind: "auth", status: 401, message: "x" }, "promise");
    expect(document.querySelector('[data-app-error="banner"]')).toBeNull();
  });

  it("a render failure is reported once and does not also raise a banner", async () => {
    await boot(() => {
      throw new Error("render failed");
    });
    expect(document.querySelector('[data-app-error="panel"]')).not.toBeNull();
    expect(document.querySelector('[data-app-error="banner"]')).toBeNull();
  });
});
