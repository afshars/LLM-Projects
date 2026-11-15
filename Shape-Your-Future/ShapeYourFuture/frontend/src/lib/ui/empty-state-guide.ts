import { el } from "../dom";
import { t } from "../theme-i18n";

/**
 * emptyStateGuide: an empty page or panel never just says "nothing here". It
 * says why it is empty, names the next step, and links straight to it.
 *
 *   emptyStateGuide({
 *     title: d.rings.empty,
 *     nextStep: "Tell the mentor about a goal and it will build your roadmap.",
 *     action: { label: d.rings.emptyCta, onClick: () => journey.goTo("COACH") },
 *   })
 *
 * `action` is required by the type on purpose: use `href` for a real URL,
 * `onClick` for in-app navigation (this app routes through `journey`).
 */

export type EmptyStateAction = { label: string; onClick: () => void } | { label: string; href: string };

export interface EmptyStateOptions {
  /** What is empty, e.g. "No goals yet". */
  title: string;
  /** Optional: why it is empty. */
  description?: string;
  /** The next step, as a sentence. */
  nextStep: string;
  action: EmptyStateAction;
  /** Optional second way out (e.g. "Go to Today" next to "Go to Goals"). Shown after `action`, styled as secondary. */
  secondaryAction?: EmptyStateAction;
  /** Optional further ways out, shown after `secondaryAction` (styled as secondary). */
  extraActions?: EmptyStateAction[];
  /** Heading level to fit the page outline. Default 3. */
  headingLevel?: 2 | 3 | 4;
}

export function emptyStateGuide(o: EmptyStateOptions): HTMLElement {
  const heading = el(`h${o.headingLevel ?? 3}` as "h2" | "h3" | "h4", { class: "ui-empty__title", dir: "auto" }, [o.title]);

  const actionNode = (action: EmptyStateAction, cls: string): HTMLElement => {
    if ("href" in action) return el("a", { class: cls, href: action.href }, [action.label]);
    const button = el("button", { class: cls, type: "button" }, [action.label]);
    button.addEventListener("click", action.onClick);
    return button;
  };

  const cta = actionNode(o.action, "btn-primary ui-empty__cta");
  // One action stays a bare child (as before); two share a wrapper so they sit side by side.
  const more = [...(o.secondaryAction ? [o.secondaryAction] : []), ...(o.extraActions ?? [])];
  const actions: HTMLElement = more.length
    ? el("div", { class: "ui-empty__actions" }, [cta, ...more.map((a) => actionNode(a, "btn-secondary ui-empty__cta"))])
    : cta;

  return el("section", { class: "ui-empty" }, [
    heading,
    ...(o.description ? [el("p", { class: "ui-empty__desc" }, [o.description])] : []),
    el("p", { class: "ui-empty__next" }, [el("strong", { class: "ui-empty__next-label" }, [t().ui.empty.nextStep]), " ", o.nextStep]),
    actions,
  ]);
}
