import { el } from "./dom";
import { CHEVRON_ICON, NAV_ICONS } from "./nav-icons";
import { t } from "./theme-i18n";
import { authStorage } from "../api/auth-storage";
import { isHidden, setHidden } from "../state/coach-layout";
import { journey } from "../state/journey";
import { NAV_SECTIONS, activeSection } from "../growth-os";
import type { NavSection, SectionId } from "../growth-os";

export interface NavShell {
  node: HTMLElement;
  /** Sync labels, current-page state and visibility. Mutates in place. */
  update(): void;
}

/** Main navigation, built once from NAV_SECTIONS (growth-os/registry.ts).
 * One <nav>: a sidebar on desktop, a fixed bottom bar on mobile (CSS in
 * styles/shell.css). Four sections, all always visible: no "More" menu.
 *
 * On desktop the fold button sits at the top of the sidebar, on the side the sidebar is on. Pressed, the sidebar
 * shrinks to a narrow icon-only rail that keeps the button (so the menu can always be brought back). The choice is
 * remembered (state/coach-layout.ts). A phone has the bottom bar only and never shows the button. */
export function createNavShell(): NavShell {
  const links = new Map<SectionId, HTMLButtonElement>();
  const labels = new Map<SectionId, HTMLElement>();

  const buildItem = (section: NavSection) => {
    const label = el("span", { class: "app-nav__label" });
    const btn = el("button", { class: "app-nav__link", type: "button" }, [
      el("span", { class: "app-nav__icon" }),
      label,
    ]);
    btn.firstElementChild!.innerHTML = NAV_ICONS[section.icon];
    btn.addEventListener("click", () => {
      go(section);
    });
    links.set(section.id, btn);
    labels.set(section.id, label);
    return el("li", { class: "app-nav__item" }, [btn]);
  };

  const list = el("ul", { class: "app-nav__list" }, NAV_SECTIONS.map(buildItem));

  const toggleIcon = el("span", { class: "app-nav__toggle-icon", "aria-hidden": "true" });
  toggleIcon.innerHTML = CHEVRON_ICON;
  const toggleLabel = el("span", { class: "app-nav__toggle-label" });
  const toggle = el("button", { class: "btn-secondary app-nav__toggle", type: "button", "data-nav-fold": "menu" }, [toggleIcon, toggleLabel]);
  toggle.addEventListener("click", () => {
    setHidden("menu", !isHidden("menu"));
    update();
  });

  const node = el("nav", { class: "app-nav" }, [toggle, list]);

  function go(section: NavSection) {
    const j = journey.get();
    const { entry } = section;
    // Already on the section's entry view: nothing to do (also avoids
    // re-rendering the screen and losing what was typed).
    if ("step" in entry ? j.step === entry.step : j.step === "SECTION_VIEW" && j.sectionRoute === entry.route) return;
    if ("step" in entry) journey.goTo(entry.step);
    else journey.goToRoute(entry.route);
  }

  function update() {
    const g = t().growth;
    const j = journey.get();
    const visible = authStorage.isAuthenticated() && j.step !== "AUTH";
    node.hidden = !visible;
    node.setAttribute("aria-label", g.shell.primaryNav);

    // The fold button: the label says what a press does; `aria-expanded` says whether the menu is shown in full.
    const folded = isHidden("menu");
    const foldText = folded ? g.coach.layout.showMenu : g.coach.layout.hideMenu;
    node.toggleAttribute("data-collapsed", folded);
    toggleLabel.textContent = foldText;
    toggle.setAttribute("aria-expanded", String(!folded));
    toggle.setAttribute("aria-label", foldText);
    toggle.setAttribute("title", foldText);

    const current = activeSection(j.step, j.sectionRoute);
    for (const section of NAV_SECTIONS) {
      labels.get(section.id)!.textContent = g.nav[section.id];
      const btn = links.get(section.id)!;
      // In the icon-only rail the label is hidden, so a tooltip names the section.
      if (folded) btn.setAttribute("title", g.nav[section.id]);
      else btn.removeAttribute("title");
      if (section.id === current?.id) btn.setAttribute("aria-current", "page");
      else btn.removeAttribute("aria-current");
    }
  }

  update();
  return { node, update };
}
