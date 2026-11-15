import { el } from "../lib/dom";
import { CHEVRON_ICON } from "../lib/nav-icons";
import { t } from "../lib/theme-i18n";
import { isHidden, setHidden } from "../state/coach-layout";
import { renderCoachChat } from "./coach-chat";
import { renderCoachHighlight } from "./coach-highlight";
import { renderCoachTactic } from "./coach-tactic";
import type { ViewContext } from "./view-context";

/**
 * The Coach screen, in two parts side by side:
 *
 *   left   Highlight and tactic: today's Highlight (read-only) and the "One tactic for today" card (views/coach-tactic.ts).
 *          The AI proposes ONE tactic; only an accepted tactic is saved, as part of today's entry.
 *   right  the AI chat (views/coach-chat.ts): a plain conversation that never changes today's entry.
 *
 * The parts keep these physical sides in both languages (see .coach-split in styles/chat.css); on a narrow screen they
 * stack, Highlight and tactic first.
 *
 * The fold button of the left part is the first thing in that part, at its top-left corner. Folded, the part shrinks
 * to a narrow rail that keeps only that button. (The menu's own fold button lives in the sidebar: lib/nav-shell.ts.)
 *
 * renderCoach() builds the layout and returns it. The chat needs to be on the page before it can paint (it checks that
 * it is connected), so app.ts calls mountCoachChat() right after it has put the layout into <main>.
 */
export function renderCoach(): HTMLElement {
  const g = t().growth;
  const side = el("section", { class: "coach-split__side", "aria-label": g.coach.sideLabel }, [
    el("div", { class: "coach-side-bar" }, [sideFoldButton()]),
    renderCoachHighlight(),
    renderCoachTactic(),
  ]);
  const chat = el("section", { class: "coach-split__chat", "aria-label": g.coach.chatLabel, "data-coach-chat": "true" });
  const split = el("div", { class: "coach-split" }, [el("h1", { class: "sr-only" }, [g.nav.chat]), side, chat]);
  applyLayout(split);
  return split;
}

/** The folded part as a data attribute: CSS (styles/chat.css) does the rest. */
function applyLayout(split: HTMLElement): void {
  split.setAttribute("data-side", isHidden("side") ? "collapsed" : "open");
}

/** The fold switch of the left part. `aria-expanded` says whether the part is shown; the label says what a press does. */
function sideFoldButton(): HTMLButtonElement {
  const c = t().growth.coach.layout;
  const icon = el("span", { class: "coach-fold__icon", "aria-hidden": "true" });
  icon.innerHTML = CHEVRON_ICON;
  const label = el("span", { class: "coach-fold__label" });
  const btn = el("button", { class: "btn-secondary coach-fold coach-fold--side", type: "button", "data-coach-fold": "side" }, [icon, label]) as HTMLButtonElement;
  const paint = () => {
    const shown = !isHidden("side");
    const text = shown ? c.hideSide : c.showSide;
    label.textContent = text;
    btn.setAttribute("aria-expanded", String(shown));
    btn.setAttribute("aria-label", text);
    btn.setAttribute("title", text);
  };
  btn.addEventListener("click", () => {
    setHidden("side", !isHidden("side"));
    const split = btn.closest<HTMLElement>(".coach-split");
    if (split) applyLayout(split);
    paint();
  });
  paint();
  return btn;
}

/** Paints the chat into the right-hand part of a Coach layout that is already on the page. */
export function mountCoachChat(container: HTMLElement, context: ViewContext): void {
  const pane = container.querySelector<HTMLElement>("[data-coach-chat]");
  if (!pane) return;
  renderCoachChat(pane, context);
}
