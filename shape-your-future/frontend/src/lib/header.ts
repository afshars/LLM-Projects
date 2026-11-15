import { el } from "./dom";
import { ICON_MOON, ICON_SUN, logoMarkup } from "./logo";
import { LANG_META, LANG_ORDER } from "./locales";
import type { Lang } from "./locales";
import { getState, setLang, t, toggleTheme } from "./theme-i18n";
import { authStorage } from "../api/auth-storage";
import { confirmLogout } from "./logout";

export interface AppHeader {
  node: HTMLElement;
  /** Sync text, icons, pressed states and logout visibility with the current
   * state. Mutates in place (never rebuilds) so focus and layout are never
   * disturbed. */
  update(): void;
}

/** Persistent global header: skip-link, logo + app name, language switcher,
 * theme toggle (+ logout once signed in). Created once by app.ts.
 *
 * The language switcher is a two-option segmented control (one button per
 * entry in LANG_ORDER) instead of a single toggle, so the user sees both
 * languages and the active one at a glance. */
export function createHeader(): AppHeader {
  const skip = el("a", { class: "skip-link", href: "#view" });

  const logo = el("span", { class: "brand-logo" });
  const name = el("span", { class: "brand-name" });
  const brand = el("div", { class: "brand" }, [logo, name]);

  const themeBtn = el("button", { class: "icon-btn", type: "button" });
  themeBtn.addEventListener("click", toggleTheme);

  const langButtons = new Map<Lang, HTMLButtonElement>();
  for (const code of LANG_ORDER) {
    // `lang` on each option lets screen readers pronounce its label in
    // that language regardless of the page language.
    const btn = el("button", { class: "lang-switch__btn", type: "button", lang: code });
    btn.addEventListener("click", () => setLang(code));
    langButtons.set(code, btn);
  }
  const langGroup = el("div", { class: "lang-switch", role: "group" }, [...langButtons.values()]);

  const logoutBtn = el("button", { class: "btn-ghost", type: "button" });
  logoutBtn.addEventListener("click", () => void confirmLogout(logoutBtn));

  const actions = el("div", { class: "header-actions" }, [logoutBtn, langGroup, themeBtn]);
  const node = el("header", { class: "app-header" }, [
    skip,
    el("div", { class: "app-header-inner" }, [brand, actions]),
  ]);

  function update() {
    const dict = t();
    const { theme, lang } = getState();

    skip.textContent = dict.header.skipToContent;
    logo.innerHTML = logoMarkup(dict.header.logoLabel);
    name.textContent = dict.appName;

    themeBtn.innerHTML = theme === "dark" ? ICON_MOON : ICON_SUN;
    themeBtn.setAttribute("aria-label", dict.header.themeToggle);
    themeBtn.title = dict.header.themeToggle;

    langGroup.setAttribute("aria-label", dict.header.langToggle);
    for (const [code, btn] of langButtons) {
      const meta = LANG_META[code];
      btn.textContent = meta.short;
      btn.setAttribute("aria-label", meta.nativeName);
      btn.title = meta.nativeName;
      btn.setAttribute("aria-pressed", String(code === lang));
    }

    logoutBtn.textContent = dict.header.logout;
    logoutBtn.hidden = !authStorage.isAuthenticated();
  }

  update();
  return { node, update };
}
