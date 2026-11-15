/**
 * Which parts of the screen the user folded away to focus on the chat. Two independent switches, remembered in
 * localStorage (guarded: storage can be unavailable, then the choice just lasts until the next reload):
 *
 *   side  the left part of the Coach screen (Highlight + tactic); its button is the first thing in that part
 *   menu  the navigation sidebar (desktop only; a phone keeps its bottom bar); its button is the first thing in the sidebar
 *
 * Nothing here is sent to the server. views/coach.ts applies `side` as a data attribute on the Coach layout and
 * lib/nav-shell.ts applies `menu` as a data attribute on the sidebar; CSS does the rest.
 */
const KEYS = { side: "maketime:coach-side-hidden", menu: "maketime:coach-menu-hidden" } as const;
export type CoachPart = keyof typeof KEYS;

export function isHidden(part: CoachPart): boolean {
  try {
    return localStorage.getItem(KEYS[part]) === "1";
  } catch {
    return false;
  }
}

export function setHidden(part: CoachPart, hidden: boolean): void {
  try {
    if (hidden) localStorage.setItem(KEYS[part], "1");
    else localStorage.removeItem(KEYS[part]);
  } catch {
    /* storage unavailable: the choice is not remembered */
  }
}
