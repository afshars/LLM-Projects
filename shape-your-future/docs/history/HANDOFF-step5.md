# HANDOFF step5 (delete remaining frontend areas)
## What changed
- Deleted 135 files (list: step5-deleted-files.txt): views/state/lib/styles of Goals (list, stepper, workspace, decomposition), Weekly growth, Behavior, Dashboard (+charts), Smart profile (7 tabs, ui-* save flows, user-intelligence, diffForPartialPut), context.ts, journey stack (journey-next-step/map/facts/welcome), section-subnav, 3 unused UI kit parts, 4 CSS files, 43 smoke tests.
- Edited kept files only to cut those links: chat.ts (first-visit welcome block), auth.ts (markWelcome), progress-check.ts (Weekly review CTA), next-action-now.ts (planning CTA).
- api/client.ts: removed 36 methods (goals CRUD/tree, user-intelligence, behavior, growth, updateActiveHours). Kept createGoal (chat, gated off).
- growth-os: SectionId = today|reflect|chat|profile, RouteKey = progressCheck|account; RETIRED_ROUTE_IDS gone.
- i18n (en+fa): removed growth namespaces journey, workspace, dashboard, goals, weeklyGrowthPage, myProfilePage, behaviorPage, nav/routes/shell leftovers, progressCheckPage.next; dictionary context/goal/decomposition + 2 error keys; ui.score.
- CSS: style.css 2015 -> 1584 lines (Goal Workspace, Dashboard, Hierarchy tree); components.css drops ScoreBar, KeyValue/StringList editors, journey rules.
- Tests: nav, ui, chat-history, api-client-usage, daily-plan-view adjusted (daily-plan-view: 3 selectors that were already red since Step 3).
## Checks
- RUN: tsc --noEmit exit 0 (real vite types, Node 22).
- RUN: npm run check:i18n OK, en = fa = 396 values.
- RUN: vitest 22 files, 302 passed, 4 skipped, 0 failed (baseline before this step: 82 failed).
- RUN: npm run build OK (main JS 125.8 kB).
- NOT RUN: browser/e2e, Node 20, backend pytest (no backend change), docker.
## Left on purpose (not in this step)
- journey.ts: Step union (DASHBOARD, CONTEXT_SETUP, GOAL_*, PLANNING_REQUIRED) and goal/decomposition state.
- chat.ts: plan card, GOAL_ROADMAP_CTA, createGoal. step-indicator.ts + its CSS. views/next-action-now + daily-plan (Today step).
- views/focus-feedback.ts kept as asked, but no route opens it (FOCUS_FEEDBACK retired in Step 3).
- api/types.ts untouched; backend routes still exist.
## Git commit message
refactor(frontend): remove goals, weekly-growth, behavior, dashboard, smart-profile and journey UI
