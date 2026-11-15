import { journey } from "./state/journey";
import type { Step } from "./state/journey";
import { el } from "./lib/dom";
import { createHeader } from "./lib/header";
import { createNavShell } from "./lib/nav-shell";
import { onAppError, reportAppError, shouldShowAppError } from "./lib/app-error";
import { appErrorBanner, appErrorPanel } from "./lib/ui/app-error";
import { onThemeI18nChange } from "./lib/theme-i18n";
import { renderAuth } from "./views/auth";
import { mountCoachChat, renderCoach } from "./views/coach";
import { disposeCoachChat } from "./views/coach-chat";
import { currentViewContext } from "./views/view-context";
import { renderSectionView } from "./views/section-view";
import { renderToday } from "./views/today";

/** Views that build and return their own element. Only steps that are in the product are listed; journey.goTo() never
 * sets another one, and draw() falls back to Today if one ever arrives, so <main> is never empty. */
const VIEWS: Partial<Record<Step, () => HTMLElement>> = {
  AUTH: renderAuth,
  COACH: renderCoach,
  DAILY_PLAN: renderToday,
  SECTION_VIEW: renderSectionView,
};

/**
 * App shell: one persistent <header> (logo, name, theme + language
 * toggles) above a layout of <nav> (sidebar / bottom bar, hidden on Auth)
 * and a <main> that is the only thing re-rendered. Because
 * the header is built once and merely updated in place, it is identical
 * on every route (Auth, Today, Coach, Reflect, Profile) and never flickers
 * or shifts the layout.
 *
 * `draw()` re-runs on every journey emission (step changes) and on every
 * theme/language change, so labels flip language immediately.
 */
export function startApp(root: HTMLElement) {
  const header = createHeader();
  // tabindex=-1 lets the header's skip-link move keyboard focus here.
  const main = el("main", { class: "app-main", id: "view", tabindex: "-1" });
  const nav = createNavShell();
  const layout = el("div", { class: "app-shell" }, [nav.node, main]);
  root.replaceChildren(header.node, layout);

  // What counts as "a navigation": a different step, or a different
  // sub-route inside SECTION_VIEW (same step, new screen).
  let lastViewKey: string | null = null;

  // An error that happened outside any view (unhandled rejection, throwing listener). It is kept, not
  // rendered once, so a language switch (which re-draws) rebuilds the banner in the new language.
  let bannerError: { error: unknown } | null = null;
  let banner: HTMLElement | null = null;

  const syncBanner = () => {
    banner?.remove();
    banner = null;
    if (!bannerError) return;
    const shown = bannerError.error;
    banner = appErrorBanner({
      error: shown,
      onRetry: () => {
        bannerError = null;
        draw(); // rebuilds the current view, which asks its store for the data again
      },
      onDismiss: () => {
        bannerError = null;
        syncBanner();
      },
    });
    header.node.after(banner);
  };

  const paint = () => {
    const { step, sectionRoute } = journey.get();
    const viewKey = step === "SECTION_VIEW" ? `SECTION_VIEW:${sectionRoute}` : step;
    header.update();
    nav.update();
    layout.dataset.nav = nav.node.hidden ? "off" : "on";
    if (step !== "COACH") disposeCoachChat(); // leaving the Coach: the chat's listener and DOM must not outlive it
    main.replaceChildren((VIEWS[step] ?? renderToday)());
    if (step === "COACH") mountCoachChat(main, currentViewContext()); // after the layout is on the page
    // Only animate on real navigation; re-draws (language switch, state
    // updates) must not replay the entrance animation.
    if (viewKey !== lastViewKey) {
      main.classList.remove("view-enter");
      void main.offsetWidth; // restart the CSS animation
      main.classList.add("view-enter");
      window.scrollTo({ top: 0 });
      // Keyboard / screen-reader users: move focus to the new view (not on first paint).
      if (lastViewKey !== null) main.focus({ preventScroll: true });
    }
    lastViewKey = viewKey;
  };

  /** Never leaves <main> blank: when a view throws while it is built, the translated error panel (with
   * "Try again") takes its place. */
  const draw = () => {
    try {
      paint();
    } catch (error) {
      reportAppError(error, "render");
      disposeCoachChat();
      main.replaceChildren(appErrorPanel({ error, onRetry: draw }));
    }
    syncBanner();
  };

  onAppError(({ error, source }) => {
    if (source === "render" || !shouldShowAppError(error)) return;
    bannerError = { error };
    syncBanner();
  });

  journey.subscribe(draw);
  onThemeI18nChange(draw);
  draw();
}
