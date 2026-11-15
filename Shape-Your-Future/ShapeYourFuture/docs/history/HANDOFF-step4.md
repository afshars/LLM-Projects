# HANDOFF step4 (delete Plan area from frontend)
## What changed
- Deleted 29 src files (views+state of brain-dump, busy-blocks, plan-interview/proposal/confirm, planning-required, proposal-card, next-action-form, progress-next-action), 3 css files, 41 smoke tests. List: step4-deleted-files.txt (73).
- Removed Plan API methods from api/client.ts (incl. confirmPlan; Highlight will re-add its own call). api/types.ts untouched (API step).
- Removed i18n (en+fa): 7 plan namespaces, progressCheckPage.nextActionFlow, plan routes, plan journey keys, nav.plan, plan-confirm errors.
- Removed CTAs: Reflect NextAction slot, Brain Dump button in goal-creation, 4 plan steps in journey-map. SectionId "plan", 5 RouteKeys, plan icon removed.
## Checks
- RUN: tsc --noEmit (TS 6.0.3): 0 errors except the same 17 CSS-import errors in main.ts (vite types absent).
- RUN: import graph (no broken import); transpile syntax check of all 65 smoke files: 0 errors.
- NOT RUN: vitest, vite build, check:i18n (npm ci fails offline). i18n key removals were made symmetrically in en and fa but parity is unverified.
## Known red / unverified
- journey-* tests (map, next-step, cta-20b/20d) were already red from Step 3 (retired targets); edited only to drop plan refs. Delete with the journey step.
- api-client-usage.test not run; a scan found every client method still referenced in src.
