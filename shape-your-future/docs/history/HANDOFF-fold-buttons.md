# HANDOFF: fold buttons in their own places

Scope: only the two fold buttons on the Coach screen. No backend change, no new i18n keys (existing hideMenu/showMenu/hideSide/showSide reused).

## What changed
- Menu fold button: first thing in the sidebar (top of the menu, on the side the menu is on: right in fa, left in en). Folded, the sidebar becomes a 76px icon-only rail that keeps the button; each link gets a tooltip. A phone never shows it (bottom bar stays).
- Side-panel fold button: first thing in the left panel, top-left corner. Folded, the panel becomes a 4rem rail with only the button; the chat takes the rest. On a narrow screen the folded panel is just the button row.
- Both buttons moved OUT of the chat toolbar. The chevron points to the edge the part folds to and flips when folded.
- The menu choice now applies on every page (the button is in the shared sidebar), not only on Coach. Saved keys are unchanged: maketime:coach-side-hidden / maketime:coach-menu-hidden.
- The sidebar list selector `.app-nav__list:first-child` became `.app-nav__list` (the button is now the first child of <nav>).

## Files changed
src/lib/nav-icons.ts, src/lib/nav-shell.ts, src/views/coach.ts, src/state/coach-layout.ts (comment only), src/styles/chat.css, src/styles/shell.css, src/styles/refresh.css, smoke/coach-chat.test.ts, smoke/shell.test.ts. Added: this file. Deleted: none.

## Verified
- RUN: tsc --noEmit with the global tsc: no error in any changed file. The only errors are missing packages/CSS typings (node_modules is not in the zip, no network here).
- NOT RUN: vitest, npm run check:i18n (no new keys), build, pytest, and a look in the browser. Please check both buttons in fa and en, folded and open.

## Not done yet (asked, waiting for a decision)
Several Highlights per day with "+", Highlights for coming days, and reading past days. These need a new table and API, so they are a separate part.
