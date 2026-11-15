> OBSOLETE (moved in Step 4): written before the app was reduced to Today, Reflect, Coach and Profile. It describes features that no longer exist. Kept as history only.

# 10 - Definition of Done report (Part 21d)

Project state audited: the Part 21c zip + Part 17b-4 (restores the three lost 17b files, adds the 1-minute minimum, backend validation of `active_hours`) + the three one-line colour fixes made in this part.

## How the evidence was gathered (read this first)
- Nothing was pasted this turn, so every MET below rests on **static checks I ran myself on the project files** (grep, `tsc`, and the real `scripts/check-i18n-parity.ts` compiled and run in Node). Each row names the check. They prove what the source says, not how the app behaves.
- **Not run by anyone yet:** `npm run build`, `vitest`, any browser or backend, any 375px check. Those rows are UNKNOWN with the command to run.
- Environment limits: no `node_modules`, no network. TypeScript here is 6.0.3 (the project asks `^5.6.2`).

## Commands to run and paste back (for the UNKNOWN rows)
Run from `frontend/` after `npm ci`:
```bash
npx tsc --noEmit 2>&1 | tail -60
npm run build 2>&1 | tail -40
npm run check:i18n 2>&1 | tail -20
npx vitest run 2>&1 | tail -60
```
The greps below are the ones I ran (re-run them to confirm; each prints nothing or the lines named in the table):
```bash
# hard-coded text
grep -rnE "(textContent|innerText|innerHTML)\s*=\s*[`"'][^`"']+" src/views src/lib --include=*.ts
grep -rnE "(placeholder|aria-label|title|alt|label)[\"']?\s*[:=,]\s*[\"'`][^\"'`]*[A-Za-z]" src/views src/lib --include=*.ts | grep -v "src/lib/dictionary.ts" | grep -v "src/lib/ui/i18n/" | grep -v "src/growth-os/i18n/"
grep -rnP '[\x{0600}-\x{06FF}]' src --include=*.ts | grep -vE "growth-os/i18n|lib/dictionary.ts|lib/ui/i18n"
# fetch, storage, console, raw errors
grep -rnE "\bfetch\(" src --include=*.ts | grep -v "src/api/client.ts"
grep -rnE "localStorage|sessionStorage" src --include=*.ts
grep -rnE "console\.(log|debug|info|warn|error)" src --include=*.ts
grep -rnE "\b(err|error|e|ex|caught)\w*\.(message|detail|body)\b|String\(err\)" src --include=*.ts | grep -v "src/api/client.ts"
# RTL and colours
grep -nE "margin-(left|right)|padding-(left|right)|text-align: *(left|right)|(^|[ ;{])(left|right):|float: *(left|right)|border-(left|right)" src/style.css src/styles/*.css
grep -nE "#[0-9a-fA-F]{3,8}\b|rgba?\(" src/style.css src/styles/*.css | grep -v "styles/tokens.css" | grep -v "var(--"
# confirm flows and endpoint coverage
grep -rnE "apiClient\.(confirmBrainDump|confirmPlan|confirmProgressCheck|confirmGrowth)\b" src --include=*.ts | grep -v "src/api/client.ts"
grep -rnE "apiClient\.(getPlanningProposal)" src --include=*.ts | grep -v "src/api/client.ts"
```
375px steps: `docs/growth-os/09-smoke-test.md` step 6 (line 16), the shared **[375]** check (line 53), the **[375]** line of each section (lines 74, 95, 113, 130, 146, 166, 196, 213, 231, 248, 267, 282, 301), and the sign-off line 319. Do them in English and in Persian.

## Status table
| # | Item | Status | Evidence / problem / command |
|---|---|---|---|
| 1 | Every endpoint reachable from a page or documented in the matrix | **MET** | `08-coverage-matrix.md` (21a/21b): 65 endpoints, 63 with a UI page, 2 documented TODOs (`GET /healthz` intentional, `GET /planning-proposals/{id}` unused). My re-run: of 67 `apiClient` members only `getPlanningProposal` is referenced nowhere outside `api/client.ts`. The endpoint count itself comes from 21a (backend not run here). |
| 2 | No hard-coded user-visible strings | **NOT MET** (minor, 2 places) | (a) `src/views/next-action-form.ts:175` `placeholder: "YYYY-MM-DD"`. (b) `src/state/goal-workspace.ts:185` `suggestTaskTitles` builds `انجام ${title}` / `Complete: ${title}` with `lang === "fa"` instead of i18n (editable default text, follows the UI language). Everything else in the greps was comments, ids, keys or text from `t()`. `src/lib/password-ui.ts:55` uses translated rule text. Persian text outside i18n files is only digit tables, language names, font samples and backend-message regexes (`lib/dom.ts`, `api/client.ts`). |
| 3 | All text in fa and en (parity) | **MET** | `scripts/check-i18n-parity.ts` compiled and run in Node: `en 1841 values, fa 1841 values`, all five checks ok, exit OK. Not run through `vite-node` (not installed). Persian copy is still unreviewed by a native speaker (21c). |
| 4 | Language change keeps forms and state | **UNKNOWN** | Drafts live in stores (17a/17b HANDOFFs) and there are view tests, but no test was run. Run `npx vitest run`, then the **[LANG]** lines of `09-smoke-test.md`. |
| 5 | No LLM flow saves without confirmation (brain dump, plan, progress check, growth) | **MET** | Each `apiClient.confirm*` is called only from its flow function: `state/brain-dump.ts:249` (`confirm()` <- `views/brain-dump.ts:431` `onConfirm`), `state/plan-proposal-flow.ts:137` (<- `views/plan-proposal.ts:336`), `state/progress-confirm-flow.ts:42` (<- `views/progress-check-confirm.ts:99`), `state/growth-confirm-flow.ts:40` (<- `views/weekly-growth-confirm.ts:106`). All four sit in a `reviewAndConfirm` `onConfirm` (a button). No timer or subscriber calls them. Backend `chains.py`: the analyze routes (`/brain-dump`, `/plan/interview`, `/plan/propose`, `/progress-check`, `/growth/run`) contain no DB write; the writes are in the four `/confirm` routes. |
| 5b | Chat writes what the user says into the profile (backend `conversation_manager._write_through`) | **UNKNOWN** | Outside the four confirm flows and not touched by this audit. Needs a product decision: is an automatic write from chat acceptable? Also `POST /planning-proposals` stores a pending proposal row (accept/edit/reject follow); that is not a plan save. |
| 6 | 400/401/404/422/429/500/network errors localized, with a way to continue | **NOT MET** | **Plan confirm shows nothing.** `src/views/plan-proposal.ts:365` `drawConfirmError` is an empty placeholder ("13c: slot.replaceChildren(...) goes here") and the panel banner is off (`showErrors: false`, line 327). A failed plan confirm shows no text and no retry. `smoke/plan-confirm-feedback.test.ts` (Part 13c) describes the intended UI and its 17 tests fail on this code. Helpers exist: `planConfirmErrorCase` (`state/plan-confirm.ts:113`) and `errorMessage(err, "plan-confirm")`. Follow-up: Part 21e below. |
| 6b | Same, other flows | **UNKNOWN** | `lib/dom.ts` `errorMessage` covers network, rate_limit, server, llm_unavailable, conflict, not_found, auth, validation (read, not run). Whether each screen draws it and offers a retry needs `npx vitest run` and the **[ERR]** / **[429]** lines in `09-smoke-test.md`. |
| 7 | Raw server errors never shown | **MET** | Grep: `err.message` is read only in `lib/dom.ts` (inside `errorMessage`), in `state/daily-plan.ts:54` and `state/dashboard.ts:376` (classification only), and `state/dashboard.ts:407` stores it in `rowError.message`; the only reader (`views/dashboard.ts:210`) shows the translated `a.failed`, never the stored message. |
| 8 | No direct `fetch(` outside `api/client.ts` | **MET** | Grep result: no lines. |
| 9 | localStorage / sessionStorage only for the allowed uses | **MET** | Uses: token (`api/auth-storage.ts`), theme and language (`lib/theme-i18n.ts`), dashboard postpone/skip marks and check-in history (`state/dashboard.ts`, keys `maketime:dash:<user>:marks:<day>` and `:checkins`). No `sessionStorage`. |
| 10 | No `console.log` | **MET** | Grep: no `console.log/debug/info/warn`. One `console.error` in `lib/ui/async-panel.ts:110`, a developer guard for a misused component (never reached by a user). |
| 11 | No physical CSS properties that break RTL | **MET** | Grep over `src/style.css` and `src/styles/*.css`: 0 hits for margin/padding/border left/right, `text-align: left/right`, `left:`/`right:`, `float`; 0 hits for inline `.style.left/right/margin…`. The only `to right`/`to left` is the 24h busy-track gradient (`styles/busy-blocks.css:80-86`), which has its own `[dir="rtl"]` rule. How it looks in RTL was not checked. |
| 12 | No hard-coded colours outside `tokens.css` | **MET** (after a fix made in this part) | Found 3 lines in `src/style.css`: 420 and 1774 (`rgba(255, 209, 102, …)`) and 782 (`rgba(255, 255, 255, 0.4)`). Fixed with `color-mix(in srgb, var(--color-highlight) …)` and `color-mix(in srgb, currentColor 40%, transparent)`. Re-grep: 0 lines. All other colours use `rgba(var(--color-…-rgb), …)` tokens. Left on purpose: `#000` in two mask gradients (`style.css:1187-1194`, alpha only) and `THEME_COLORS` in `lib/theme-i18n.ts:31` (the `<meta name="theme-color">` values, which need real colours). Not looked at in a browser: check the highlight badge and the spinner in both themes. |
| 13 | `npx tsc --noEmit` passes | **UNKNOWN** | My run (TS 6.0.3, no `node_modules`): 15 errors, all `src/main.ts` side-effect imports (CSS files and the two `@fontsource-variable` fonts). No error in any other file, including the restored 17b files. Needs your run after `npm ci`. |
| 14 | `npm run build` (`tsc -b && vite build`) passes | **UNKNOWN** | Not run. Command above. 17b-2's HANDOFF says it passed there; this zip changed after that. |
| 15 | Existing tests pass | **UNKNOWN** | `npx vitest run`. Known: 17 failing tests in `smoke/plan-confirm-feedback.test.ts` (row 6). 17b-1/17b-3 tests were never run, 17b-2's were. Backend `pytest` also never run for the 17b-4 validator tests. |
| 16 | Every page usable at 375px, no horizontal page scroll | **UNKNOWN** | Nobody tested it. Steps: see "375px steps" above (`09-smoke-test.md` lines 16, 53, per-section lines, sign-off 319). |

## Prioritized fix list
1. **Blocks acceptance - plan confirm error UI** (row 6). A failed save of the plan is silent. Follow-up prompt **Part 21e** below.
2. **Run the build, tests and i18n script** (rows 13-15) and paste the results. They may reveal more than the static checks can. Until then the "tsc and build pass" item cannot be ticked.
3. **375px and the two-language smoke test** (rows 4, 6b, 16, plus the [LANG], [ERR], [429], [DOUBLE], [NOSAVE] lines of `09-smoke-test.md`).
4. **Decide the chat write-through** (row 5b): keep, or show it to the user.
5. Minor, can be batched into one small part (**Part 21f** below): `placeholder: "YYYY-MM-DD"` and `suggestTaskTitles` into i18n (row 2); the weekly-growth "Save again?" dialog after a network error (21c finding 5; Brain Dump has it); remove or use `getPlanningProposal`.
6. Known limits, not bugs to fix now: the four confirm saves and `GET /conversation/{id}` have no backend rate limit, so a real 429 cannot happen there (21c finding 4; `GENERAL_RATE_LIMIT_PER_MINUTE` is not set in docker-compose); a real 400/404 on plan confirm cannot come from the screen (free-text candidates carry no task id), so testing it needs a fake propose answer.

## Changes made in this part
- `frontend/src/style.css`: three colour values (lines 420, 782, 1774) now use `color-mix` with tokens.
- `docs/growth-os/09-smoke-test.md` line 12: the "three 17b files are missing" warning is replaced (they were restored in 17b-4).
- This report. No other file changed.

## Follow-up prompts

### Part 21e: Plan confirm error UI (blocks acceptance)
```
PART 21e: Plan confirm feedback (Part 13c, never finished).

Paste these files: HANDOFF-part13a.md, HANDOFF-part13b.md, src/views/plan-proposal.ts, src/state/plan-confirm.ts, src/state/plan-proposal-flow.ts, smoke/plan-confirm-feedback.test.ts, the `plan` and `errors` parts of src/growth-os/i18n/en.ts and fa.ts, and the output of `npx vitest run smoke/plan-confirm-feedback.test.ts`.

Problem: `drawConfirmError` in src/views/plan-proposal.ts (about line 365) is an empty placeholder and the confirm panel has showErrors: false, so a failed POST /chains/plan/confirm shows nothing. The 17 tests of smoke/plan-confirm-feedback.test.ts fail for this reason.

Task
1. Fill drawConfirmError (and drawConfirmSuccess only if the same test file says it is also missing) so that smoke/plan-confirm-feedback.test.ts passes. Read the test first and follow it exactly: slot `[data-hook='plan-confirm-error']`, attribute `data-plan-confirm-error` = bad_task_ref | task_not_found | other, `role="alert"`, the buttons ("Re-run the proposal" for 400/404 only; "Try again" with `data-plan-confirm-retry` for everything else), focus rules, no raw server text.
2. Text only through errorMessage(err, "plan-confirm") at render time (never store a string), so a language change re-translates it. Add any missing i18n keys in fa and en.
3. Keep the rules: the plan and the user's edits stay in state; Confirm is enabled again after an error; "Try again" re-sends the same body through the panel's submitLock (so a double click is one request and a 429 shows "please wait a moment"); 401 still goes to the sign-in hand-off; nothing is saved by "Re-run the proposal".
4. Do not change the backend, api/client.ts or the contract.
HANDOFF: exported names, the test result you could and could not run, and what you changed in i18n.
```

### Part 21f: small Definition-of-Done leftovers
```
PART 21f: DoD leftovers.

Paste these files: docs/growth-os/10-definition-of-done-report.md, src/views/next-action-form.ts, src/state/goal-workspace.ts, src/views/weekly-growth-confirm.ts, src/state/growth-confirm-flow.ts, src/views/brain-dump.ts (only the "Save again?" part), the matching en.ts/fa.ts parts.

Task
1. Move `placeholder: "YYYY-MM-DD"` (next-action-form.ts) into i18n (fa and en). Keep the digits and the format.
2. Move the default task title of suggestTaskTitles (goal-workspace.ts) into i18n with a {milestone} placeholder; remove the `lang === "fa"` branch. Update its tests.
3. Weekly growth: after a network error on confirm, offer the same "Save again?" dialog that Brain Dump has (the server may already have saved). Reuse the Brain Dump component or keys; do not copy the logic. Tests for the dialog.
4. Decide with me (ask one question) whether `getPlanningProposal` is deleted from api/client.ts or wired to a re-fetch; do not guess.
HANDOFF: exported names, tests added, what you could not run.
```

## HANDOFF
Final status (18 rows): **9 MET** (rows 1, 3, 5, 7, 8, 9, 10, 11, 12), **2 NOT MET** (row 2 hard-coded strings, minor; row 6 plan confirm errors, blocking), **7 UNKNOWN** (rows 4, 5b, 6b, 13, 14, 15, 16). Follow-up prompts: Part 21e (blocking) and Part 21f (minor), both written above. Not ready for acceptance until row 6 is fixed and the UNKNOWN rows are run.

## Update after Part 21e (fixes 1 to 5 + final verification)
Rows 2 and 6 are now MET (plan confirm error UI built; `YYYY-MM-DD` placeholder and the `suggestTaskTitles` language branch moved to i18n); the weekly-growth "Save again?" dialog and the `getPlanningProposal` decision are done (see `HANDOFF-part21e-fix1..5.md`). Rows 13-15 were RUN: `tsc --noEmit` clean, `npm run build` OK, `check:i18n` OK (1847/1847), `vitest run` 104 files / 2271 tests pass. Row 16 (375px) was checked in headless Chromium only for the Weekly Growth confirm error + "Save again?" dialog (en and fa, no horizontal scroll). Everything else at 375px, a browser pass of Plan confirm, and a native read of the Persian copy remain unverified. Details: `HANDOFF-part21-final.md`.
