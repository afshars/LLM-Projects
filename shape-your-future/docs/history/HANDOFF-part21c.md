# Part 21c: manual smoke-test checklist (HANDOFF)
Documentation only. New: `docs/growth-os/09-smoke-test.md` and this file. No code, contract or test changed. NOT RUN: no browser, no backend, no vitest; the checklist is written from the HANDOFFs plus reading the source, and nobody has ticked it yet.
Modules covered (in order): auth/profile, goals, planning proposals, today (plan, "what now", focus, feedback), busy blocks, brain dump, plan (interview, propose, override, confirm), progress check, weekly growth, behavior, user intelligence, chat, whole journey. Each has [LANG], [DOUBLE], [429], [ERR], [NOSAVE] and [375] lines where relevant; the how-to for each is in "Shared checks".
Could not describe well (HANDOFFs too thin): auth/profile account (Parts 1, 2, 4, 5 absent: written from i18n copy, error texts and the step 7 QA report; session expiry unverified); goal stepper steps 4 and 5 (7c absent, left out); Goal workspace and Dashboard (only the architecture doc and QA report); legacy CONTEXT_SETUP page (skipped); what Chat does to the typed text on a 429.
Found while reading, NOT fixed: (1) Plan confirm error UI is missing: `drawConfirmError` in `views/plan-proposal.ts` is an empty placeholder and the panel's own banner is off, so 400, 404, 422, 500 and network failures show nothing. The 400/404 checklist items expect the intended text and will fail until it is built.
(2) A real 400/404 cannot come from the screen (free-text candidates carry no task id); the checklist needs a developer's fake propose answer.
(3) The three Part 17b files are still missing from the zip (`state/ui-profile-form.ts`, `state/active-hours.ts`, `views/my-profile-active-hours.ts`); the app may not build without them.
(4) The four confirm saves and GET conversation have no backend rate limit, so a real 429 there is impossible; `GENERAL_RATE_LIMIT_PER_MINUTE` is not passed by docker-compose.
(5) Weekly growth confirm has no "Save again?" dialog after a network error (Brain Dump has one).
Persian wording is still unreviewed by a native speaker; the checklist asks the Persian pass to look at it.
Commit: docs(growth-os): add manual smoke-test checklist 09-smoke-test.md
