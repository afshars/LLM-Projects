# Visual refresh 2: Calm Cyan (replaces Rose-Violet Aurora)

Goal: every page has the same flat, consistent layout; back to the cyan theme, no pink/purple wash.

Changed files (frontend only):
- src/styles/tokens.css: palette back to cyan/navy (dark) and cool paper (light); violet only as quiet secondary; glow/blur/neon shadows removed; smaller radii; --layout-max-width 720px.
- src/styles/refresh.css: rewritten. No glass sheet, no gem markers, no gradients. One column width on every page, sections flat with one hairline between them, solid buttons, square energy chips, one container style for login/dialogs.
- src/views/coach.ts: Coach now uses page() so it has the same visible title as the other pages (the sr-only heading is gone).
- src/style.css, src/lib/theme-i18n.ts, index.html: fallback colours, theme-color meta, favicon.

Checks: tsc --noEmit, vitest (178 passed), vite build.
