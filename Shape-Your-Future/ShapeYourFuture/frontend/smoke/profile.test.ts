// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const flush = async () => { for (let i = 0; i < 5; i++) await tick(); };

interface Call { method: string; path: string; body: unknown }
let calls: Call[];
let profile: { username: string; display_name: string; bio: string | null; avatar_kind: string; avatar_value: string };
let passwordStatus = 204;

function installFetch() {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const path = new URL(url).pathname;
    const method = (init.method ?? "GET").toUpperCase();
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, body });
    if (path === "/profile/me" && method === "GET") return new Response(JSON.stringify(profile), { status: 200 });
    if (path === "/profile/me" && method === "PUT") {
      const b = body as { display_name: string | null; bio: string | null };
      profile = { ...profile, display_name: b.display_name ?? profile.username, bio: b.bio };
      return new Response(JSON.stringify(profile), { status: 200 });
    }
    if (path === "/profile/me/password") {
      return passwordStatus === 204
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify({ detail: "رمز عبور فعلی نادرست است" }), { status: passwordStatus });
    }
    return new Response("{}", { status: 404 });
  }));
}

async function boot() {
  const { authStorage } = await import("../src/api/auth-storage");
  authStorage.setToken("tok");
  const { initThemeI18n, setLang } = await import("../src/lib/theme-i18n");
  initThemeI18n();
  setLang("en");
  const { journey } = await import("../src/state/journey");
  journey.goToRoute("profile/account");
  const { startApp } = await import("../src/app");
  startApp(document.getElementById("app")!);
  await flush();
  return { journey, authStorage, setLang };
}

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
function type(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
  Element.prototype.scrollTo = () => {};
  window.scrollTo = () => {};
  profile = { username: "sara", display_name: "sara", bio: null, avatar_kind: "preset", avatar_value: "fox" };
  passwordStatus = 204;
  installFetch();
});
afterEach(() => vi.unstubAllGlobals());

describe("password rules (shared by sign-up and change-password)", () => {
  it("matches the backend policy", async () => {
    const { isStrongPassword, passwordRules } = await import("../src/lib/password-ui");
    expect(passwordRules()).toHaveLength(5);
    expect(isStrongPassword("Abcdef1!")).toBe(true);
    expect(isStrongPassword("Abcde1!")).toBe(false); // 7 chars
    expect(isStrongPassword("abcdef1!")).toBe(false); // no upper
    expect(isStrongPassword("ABCDEF1!")).toBe(false); // no lower
    expect(isStrongPassword("Abcdefg!")).toBe(false); // no digit
    expect(isStrongPassword("Abcdefg1")).toBe(false); // no punctuation
    expect(isStrongPassword("ÄÖÜÄÖÜ1!")).toBe(false); // non-ASCII letters do not count
  });
});

describe("profile page", () => {
  it("loads GET /profile/me and shows it", async () => {
    await boot();
    expect(calls.filter((c) => c.path === "/profile/me" && c.method === "GET")).toHaveLength(1);
    expect(($("#profile-display-name-control") as HTMLInputElement).value).toBe("sara");
    expect(($("#profile-username") as HTMLInputElement).value).toBe("sara");
    // Only language, theme, account and logout: no bio, no avatar.
    expect(document.querySelector("#profile-bio-control")).toBeNull();
    expect(document.querySelector('input[name="avatar-preset"]')).toBeNull();
    expect([...document.querySelectorAll("h2.panel__title")].map((h) => h.textContent)).toEqual(["Preferences", "Profile", "Change password", "Session"]);
  });

  it("saves the name with PUT /profile/me (blank or the username -> null) and passes the bio through unchanged", async () => {
    profile.bio = "kept";
    await boot();
    type($("#profile-display-name-control"), "  Sara K  ");
    $("#profile-display-name-control").closest("form")!.requestSubmit();
    await flush();
    expect(calls.find((c) => c.method === "PUT" && c.path === "/profile/me")!.body).toEqual({ display_name: "Sara K", bio: "kept" });
    expect(document.body.textContent).toContain("Profile saved.");

    type($("#profile-display-name-control"), "sara"); // the username fallback is not stored as a name
    $("#profile-display-name-control").closest("form")!.requestSubmit();
    await flush();
    const puts = calls.filter((c) => c.method === "PUT" && c.path === "/profile/me");
    expect(puts[1].body).toEqual({ display_name: null, bio: "kept" });
  });

  it("language and theme are changed here, apply at once and never call the server", async () => {
    const { getState } = await import("../src/lib/theme-i18n");
    await boot();
    const before = calls.length;
    const fa = $('input[name="profile-lang"][value="fa"]') as HTMLInputElement;
    fa.checked = true;
    fa.dispatchEvent(new Event("change", { bubbles: true }));
    await flush();
    expect(getState().lang).toBe("fa");
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.querySelector("h2.panel__title")?.textContent).toBe("ترجیحات");
    expect(($('input[name="profile-lang"][value="fa"]') as HTMLInputElement).checked).toBe(true);

    const dark = $('input[name="profile-theme"][value="dark"]') as HTMLInputElement;
    const light = $('input[name="profile-theme"][value="light"]') as HTMLInputElement;
    const target = dark.checked ? light : dark;
    target.checked = true;
    target.dispatchEvent(new Event("change", { bubbles: true }));
    await flush();
    expect(getState().theme).toBe(target.value);
    expect(($(`input[name="profile-theme"][value="${target.value}"]`) as HTMLInputElement).checked).toBe(true);
    expect(calls.slice(before).filter((c) => c.method !== "GET")).toEqual([]);
  });

  it("language switch keeps every draft (name, passwords) and does not refetch", async () => {
    const { setLang } = await boot();
    type($("#profile-display-name-control"), "Sara draft");
    type($("#profile-pw-current"), "OldPass1!");
    type($("#profile-pw-new"), "NewPass1!");
    type($("#profile-pw-confirm"), "NewPass1");

    setLang("fa");
    await flush();
    expect(document.querySelector("h2.panel__title")?.textContent).toBe("ترجیحات"); // re-rendered in Persian
    expect(($("#profile-display-name-control") as HTMLInputElement).value).toBe("Sara draft");
    expect(($("#profile-pw-current") as HTMLInputElement).value).toBe("OldPass1!");
    expect(($("#profile-pw-new") as HTMLInputElement).value).toBe("NewPass1!");
    expect(($("#profile-pw-confirm") as HTMLInputElement).value).toBe("NewPass1");
    expect(calls.filter((c) => c.method === "GET")).toHaveLength(1);
  });
});

describe("change password", () => {
  const fill = (cur: string, next: string, conf: string) => {
    type($("#profile-pw-current"), cur);
    type($("#profile-pw-new"), next);
    type($("#profile-pw-confirm"), conf);
  };
  const submitBtn = () => $("#profile-pw-current").closest("form")!.querySelector<HTMLButtonElement>('button[type="submit"]')!;

  it("stays disabled until the policy is met and both new passwords match", async () => {
    await boot();
    expect(submitBtn().disabled).toBe(true);
    fill("OldPass1!", "weakpass", "weakpass");
    expect(submitBtn().disabled).toBe(true);
    expect(document.querySelectorAll("#profile-pw-hints .hint--ok").length).toBeLessThan(5);
    fill("OldPass1!", "NewPass1!", "NewPass1?");
    expect(submitBtn().disabled).toBe(true);
    fill("OldPass1!", "NewPass1!", "NewPass1!");
    expect(document.querySelectorAll("#profile-pw-hints .hint--ok")).toHaveLength(5);
    expect(submitBtn().disabled).toBe(false);
  });

  it("handles 204 (no body): clears the fields, keeps the session", async () => {
    const { authStorage, journey } = await boot();
    fill("OldPass1!", "NewPass1!", "NewPass1!");
    submitBtn().closest("form")!.requestSubmit();
    await flush();
    expect(calls.find((c) => c.path === "/profile/me/password")).toMatchObject({ method: "PUT", body: { current_password: "OldPass1!", new_password: "NewPass1!" } });
    expect(($("#profile-pw-current") as HTMLInputElement).value).toBe("");
    expect(($("#profile-pw-new") as HTMLInputElement).value).toBe("");
    expect(document.body.textContent).toContain("Password changed.");
    expect(authStorage.isAuthenticated()).toBe(true);
    expect(journey.get().step).toBe("SECTION_VIEW");
  });

  it("wrong current password (400) shows a localized message and keeps what was typed", async () => {
    await boot();
    passwordStatus = 400;
    fill("Wrong123!", "NewPass1!", "NewPass1!");
    submitBtn().closest("form")!.requestSubmit();
    await flush();
    expect(document.querySelector(".error-banner")?.textContent).toBe("The current password is incorrect.");
    expect(($("#profile-pw-new") as HTMLInputElement).value).toBe("NewPass1!");
    expect(document.activeElement).toBe($("#profile-pw-current"));
  });
});

describe("logout", () => {
  it("asks first; cancel keeps the session", async () => {
    const { authStorage, journey } = await boot();
    $<HTMLButtonElement>(".profile__logout").click();
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    document.querySelector<HTMLButtonElement>(".ui-dialog__actions .btn-secondary")!.click();
    await flush();
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(authStorage.isAuthenticated()).toBe(true);
    expect(journey.get().step).toBe("SECTION_VIEW");
  });

  it("confirm clears the token, the profile and every draft, and lands on login", async () => {
    const { authStorage, journey } = await boot();
    type($("#profile-display-name-control"), "will be wiped");
    type($("#profile-pw-current"), "Secret123!");
    $<HTMLButtonElement>(".profile__logout").click();
    document.querySelector<HTMLButtonElement>(".ui-dialog__actions .btn-primary")!.click();
    await flush();

    const { profileStore } = await import("../src/state/profile");
    const { draftGet } = await import("../src/lib/ui/drafts");
    expect(authStorage.getToken()).toBeNull();
    expect(journey.get().step).toBe("AUTH");
    expect(profileStore.get()).toMatchObject({ status: "idle", profile: null });
    expect(draftGet("field:profile-display-name")).toBeUndefined();
    expect(draftGet("profile:pw-current")).toBeUndefined();
    expect($<HTMLElement>(".app-nav").hidden).toBe(true);
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(document.querySelector("#profile-pw-current")).toBeNull();
  });

  it("the header Log out button asks too", async () => {
    const { authStorage } = await boot();
    const logout = [...document.querySelectorAll<HTMLButtonElement>(".header-actions .btn-ghost")].find((b) => b.textContent === "Log out")!;
    logout.click();
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(authStorage.isAuthenticated()).toBe(true); // not yet
  });
});

describe("expired session", () => {
  it("a 401 while loading the profile logs out and wipes the stores", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: "x" }), { status: 401 })));
    const { journey, authStorage } = await boot();
    expect(journey.get().step).toBe("AUTH");
    expect(authStorage.isAuthenticated()).toBe(false);
  });
});

describe("auth view after the checklist extraction", () => {
  it("sign-up still shows the live password checklist and gates the submit button", async () => {
    const { initThemeI18n, setLang } = await import("../src/lib/theme-i18n");
    initThemeI18n();
    setLang("en");
    const { renderAuth } = await import("../src/views/auth");
    document.body.replaceChildren(renderAuth());
    document.querySelector<HTMLButtonElement>(".tab-link")!.click(); // switch to register
    expect(document.querySelectorAll("#password-hints .hint")).toHaveLength(5);
    type($("#username"), "sara_k");
    type($("#password"), "Abcdef1!");
    type($("#confirm-password"), "Abcdef1!");
    expect(document.querySelectorAll("#password-hints .hint--ok")).toHaveLength(5);
    expect($<HTMLButtonElement>('button[type="submit"]').disabled).toBe(false);
    type($("#password"), "abcdef1!");
    expect($<HTMLButtonElement>('button[type="submit"]').disabled).toBe(true);
  });
});
