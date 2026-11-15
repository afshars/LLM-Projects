import { OBSTACLE_MAX_LENGTH } from "../api/types";
import type { CoachTactic } from "../api/types";
import { el, errorMessage } from "../lib/dom";
import { errorBanner } from "../lib/page";
import { getLang, t } from "../lib/theme-i18n";
import { draftGet, draftSet } from "../lib/ui/drafts";
import { coachTacticStore } from "../state/coach-tactic";
import type { CoachTacticState } from "../state/coach-tactic";

/** The obstacle text mirrors what is typed, so a language change (which rebuilds the view) keeps it. */
const OBSTACLE_DRAFT = "coach:obstacle";

let disposeActive: (() => void) | null = null;

/** Name + description of a tactic in the current UI language. */
function words(tactic: CoachTactic): { title: string; description: string } {
  return getLang() === "fa"
    ? { title: tactic.title_fa, description: tactic.description_fa }
    : { title: tactic.title_en, description: tactic.description_en };
}

/**
 * The Coach card: "what is in your way today?" -> ONE tactic -> the user confirms it.
 *
 * The AI only proposes. Nothing is stored until the user presses "Use this tactic" (state/coach-tactic.ts); "Not this
 * one" just drops it. A confirmed tactic is today's entry on the server, so it is still here after a reload.
 * The view is rebuilt from the store on every change (it is small), except that the textarea is kept so typing never
 * loses focus. It is the left part of the Coach screen (views/coach.ts, next to the AI chat); nothing but a confirmed tactic is saved.
 */
export function renderCoachTactic(): HTMLElement {
  disposeActive?.();
  const root = el("section", { class: "card coach-tactic", "aria-labelledby": "coach-tactic-title" });
  const body = el("div", { class: "coach-tactic__body", id: "coach-tactic-body" });
  root.append(el("h2", { id: "coach-tactic-title", class: "coach-tactic__title" }, [t().growth.coach.tactic.title]), body);

  const input = el("textarea", {
    id: "coach-obstacle",
    class: "coach-tactic__input",
    rows: "2",
    maxlength: String(OBSTACLE_MAX_LENGTH),
    dir: "auto",
  }) as HTMLTextAreaElement;
  input.value = draftGet<string>(OBSTACLE_DRAFT) ?? "";
  input.addEventListener("input", () => {
    draftSet(OBSTACLE_DRAFT, input.value);
    updateSubmit();
  });
  const submit = el("button", { class: "btn-primary", type: "submit", "data-coach-suggest": "true" }) as HTMLButtonElement;
  let busy = false;
  function updateSubmit() {
    submit.disabled = busy || input.value.trim() === "";
  }

  const form = el("form", { class: "coach-tactic__form", novalidate: "true" }, [
    el("label", { for: "coach-obstacle", class: "coach-tactic__label" }, [t().growth.coach.tactic.question]),
    input,
    submit,
  ]) as HTMLFormElement;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (submit.disabled) return;
    void coachTacticStore.suggest(input.value, getLang());
  });

  function tacticBlock(tactic: CoachTactic, blockerType: string | null): HTMLElement {
    const c = t().growth.coach.tactic;
    const w = words(tactic);
    const kind = blockerType ? (c.blockers as Record<string, string>)[blockerType] : undefined;
    return el("div", { class: "coach-tactic__tactic", "data-coach-tactic": String(tactic.id) }, [
      ...(kind ? [el("p", { class: "coach-tactic__kind" }, [kind])] : []),
      el("h3", { class: "coach-tactic__name", dir: "auto" }, [w.title]),
      el("p", { class: "coach-tactic__desc", dir: "auto" }, [w.description]),
    ]);
  }

  let wasConnected = false;
  function paint(s: CoachTacticState) {
    // The store emits synchronously from load() below, before the Coach view has put `root` on the page, so "not
    // connected" only means "navigated away" once it has been connected at least once.
    if (root.isConnected) wasConnected = true;
    else if (wasConnected) {
      stop();
      return;
    }
    const c = t().growth.coach.tactic;
    busy = s.phase === "suggesting";
    submit.textContent = busy ? c.thinking : c.suggest;
    submit.setAttribute("aria-busy", String(busy));
    input.disabled = busy;
    updateSubmit();

    const parts: Node[] = [];
    const error = s.error ? errorBanner(errorMessage(s.error)) : null;

    if (s.phase === "confirmed" && s.confirmed) {
      const another = el("button", { class: "btn-secondary", type: "button", "data-coach-another": "true" }, [c.another]);
      another.addEventListener("click", () => coachTacticStore.startOver());
      parts.push(
        el("p", { class: "coach-tactic__status", role: "status" }, [c.saved]),
        tacticBlock(s.confirmed.tactic, s.confirmed.blockerType),
        another
      );
    } else if ((s.phase === "suggested" || s.phase === "confirming") && s.suggestion?.tactic) {
      const confirming = s.phase === "confirming";
      const yes = el("button", { class: "btn-primary", type: "button", "data-coach-confirm": "true" }, [confirming ? c.saving : c.confirm]) as HTMLButtonElement;
      yes.disabled = confirming;
      yes.setAttribute("aria-busy", String(confirming));
      yes.addEventListener("click", () => void coachTacticStore.confirm());
      const no = el("button", { class: "btn-secondary", type: "button", "data-coach-dismiss": "true" }, [c.dismiss]) as HTMLButtonElement;
      no.disabled = confirming;
      no.addEventListener("click", () => coachTacticStore.dismiss());
      parts.push(
        el("p", { class: "coach-tactic__status" }, [c.proposal]),
        tacticBlock(s.suggestion.tactic, s.suggestion.blocker_type),
        el("p", { class: "field-hint" }, [c.notSavedYet]),
        ...(error ? [error] : []),
        el("div", { class: "coach-tactic__actions" }, [yes, no])
      );
    } else {
      if (s.phase === "needsMore") parts.push(el("p", { class: "coach-tactic__status", role: "status" }, [c.needsMore]));
      if (error) parts.push(error);
      parts.push(form);
    }
    body.replaceChildren(...parts);
  }

  const stop: () => void = coachTacticStore.subscribe(paint);
  disposeActive = stop;
  paint(coachTacticStore.get());
  void coachTacticStore.load();
  return root;
}
