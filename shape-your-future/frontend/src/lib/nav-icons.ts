import type { NavIcon } from "../growth-os";

/** 24x24 stroke icons for the navigation. Static, trusted markup (same
 * approach as ICON_SUN / ICON_MOON in logo.ts). Decorative: the label next
 * to each icon is the accessible name, so they are aria-hidden. */
const wrap = (paths: string) =>
  `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;

export const NAV_ICONS: Record<NavIcon, string> = {
  today: wrap('<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>'),
  reflect: wrap('<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>'),
  chat: wrap('<path d="M21 12a8 8 0 0 1-11.7 7L4 20l1.2-4.4A8 8 0 1 1 21 12Z"/>'),
  profile: wrap('<circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'),
};

/** The chevron on the two fold buttons (menu, Coach side panel). It points LEFT; CSS mirrors it where the part it
 * folds sits on the other side (styles/shell.css, styles/chat.css). Decorative: the button carries the label. */
export const CHEVRON_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M15 6l-6 6 6 6"/></svg>';
