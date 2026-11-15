import { el, errorMessage } from "../lib/dom";
import { errorBanner } from "../lib/page";
import { getLang, t } from "../lib/theme-i18n";
import { LANG_META } from "../lib/locales";
import { journey } from "../state/journey";
import { todayStore } from "../state/today";
import type { TodayState } from "../state/today";

/** "09:00" -> localized digits ("۰۹:۰۰" in fa). Anything unexpected is shown as received. */
function planTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const two = new Intl.NumberFormat(LANG_META[getLang()].locale, { minimumIntegerDigits: 2, useGrouping: false });
  return `${two.format(h)}:${two.format(m)}`;
}

/**
 * Read-only card at the top of the Coach screen's left part: today's Highlight (the one priority), whether it is done,
 * and when it is planned. It only READS the day's entry from the Today store; to set or change the Highlight the user goes
 * to Today. Built again on every redraw; it follows the store until it is taken off the page.
 */
export function renderCoachHighlight(): HTMLElement {
  const c = t().growth.coach.highlight;
  const body = el("div", { class: "coach-highlight__body" });
  const root = el("section", { class: "card coach-highlight", "aria-labelledby": "coach-highlight-title" }, [
    el("h2", { id: "coach-highlight-title", class: "coach-highlight__title" }, [c.title]),
    body,
  ]);

  let wasConnected = false;
  function paint(s: TodayState) {
    // The store may emit before the Coach view has put `root` on the page: "not connected" only means "navigated away"
    // once it has been connected at least once.
    if (root.isConnected) wasConnected = true;
    else if (wasConnected) {
      stop();
      return;
    }
    const highlight = s.entry?.highlight?.trim() ?? "";
    if (s.status === "error" && !s.entry) {
      body.replaceChildren(errorBanner(errorMessage(s.error)));
    } else if (s.status !== "ready" || !s.entry) {
      body.replaceChildren(el("p", { class: "coach-highlight__status", role: "status" }, [c.loading]));
    } else if (highlight === "") {
      const go = el("button", { class: "btn-secondary", type: "button", "data-coach-set-highlight": "true" }, [c.set]);
      go.addEventListener("click", () => journey.goTo("DAILY_PLAN"));
      body.replaceChildren(el("p", { class: "coach-highlight__status" }, [c.none]), go);
    } else {
      const meta: HTMLElement[] = [
        el("span", { class: `coach-highlight__chip${s.entry.highlight_done ? " is-done" : ""}` }, [s.entry.highlight_done ? c.done : c.pending]),
      ];
      if (s.entry.scheduled_time) meta.push(el("span", { class: "coach-highlight__chip", dir: "ltr" }, [c.at(planTime(s.entry.scheduled_time))]));
      body.replaceChildren(
        el("p", { class: "coach-highlight__text", dir: "auto", "data-coach-highlight": "true" }, [highlight]),
        el("div", { class: "coach-highlight__meta" }, meta)
      );
    }
  }

  const stop: () => void = todayStore.subscribe(paint);
  paint(todayStore.get());
  void todayStore.load();
  return root;
}
