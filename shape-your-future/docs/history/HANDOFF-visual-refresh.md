# Visual refresh: Rose-Violet Aurora

Goal: no box-per-section look; warm pink/violet palette in light and dark.

Changed files (frontend only, no logic/DOM changes):
- src/styles/tokens.css: new palette for both themes (variable names unchanged; --color-accent is now rose-pink), new tokens --color-bg-gradient, --color-sheet, --color-input-bg, larger radii, softer shadows.
- src/styles/refresh.css (NEW, imported last in src/main.ts): one glass "sheet" per page, flat sections separated by a gradient hairline, gem markers on section titles, pill nav/buttons, round energy bubbles, tinted tactic ribbons.
- src/style.css: fallback colours in step indicator updated to the new palette.
- src/lib/theme-i18n.ts, index.html: theme-color meta + favicon gradient.

Checks run: tsc --noEmit, vitest (178 passed), vite build.
