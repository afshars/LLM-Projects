import { el } from "../lib/dom";
import { page } from "../lib/page";
import { t } from "../lib/theme-i18n";
import { emptyStateGuide } from "../lib/ui";
import { findRoute } from "../growth-os";
import type { RouteKey } from "../growth-os";
import { journey } from "../state/journey";
import { renderProfileAccount } from "./profile-account";
import { renderReflect } from "./reflect";

/** Screens of the sub-routes listed in growth-os/registry.ts (Reflect and Profile). Keyed by RouteKey (the `labelKey`
 * of the route), not by a route id string, so a route id is only ever written in the registry. */
const ROUTE_VIEWS: Readonly<Record<RouteKey, () => HTMLElement>> = {
  account: renderProfileAccount,
  reflect: renderReflect,
};

/** Host of the sub-route screens. ROUTE_VIEWS is a total Record, so a registry route without a screen does not
 * compile; an unknown route id shows a guide that leads to the Coach: never a blank page. (journey.goToRoute already refuses ids that are not in the registry.) */
export function renderSectionView(): HTMLElement {
  const g = t().growth;
  const found = findRoute(journey.get().sectionRoute);
  const toChat = { label: g.shell.missing.cta, onClick: () => journey.goTo("COACH") };

  if (!found) {
    return el("div", { class: "section-view" }, [page(g.nav.chat, emptyStateGuide({ title: t().ui.empty.missingAction, nextStep: g.shell.missing.nextStep, action: toChat, headingLevel: 2 }))]);
  }

  const { route } = found;
  const copy = g.routes[route.labelKey];
  return el("div", { class: "section-view" }, [page(copy.label, ROUTE_VIEWS[route.labelKey]())]);
}
