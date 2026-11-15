# Part 7b — Manual step-by-step path, step 3: milestone → tasks (HANDOFF)

Step 3 of the stepper is live: pick a milestone, list its task titles, create them, see them under the milestone, then do the next milestone. Steps 4 and 5 are still "Next" with a disabled button (7c).

**Verified**
- `tsc --noEmit` (strict, `noUnusedLocals`) is clean for everything in `src/`, and for `smoke/goal-stepper.test.ts` when it is checked against a stub of the vitest types. The only errors left are the 7 in `src/main.ts` (fontsource/css imports) that appear when `node_modules` is missing; I had no network.
- **The behaviour ran in real Chromium.** I bundled the app with esbuild, put a fake backend behind it that mirrors the three routes (all non-idempotent) and drove the page with Playwright: 17 scenarios, all green (layout, rows and counter, empty titles, success and next milestone, lock and double submit, language switch with zero requests, 500 + Retry, Retry re-validation, 429, stale `GET /tree`, already-decomposed goal, `/decompose` running, store guards). I then broke five guards on purpose (stale-GET guard, "milestone already has tasks", in-flight dedupe, max-15 in the store, decompose guard); each turned a scenario red and I restored the file.
- Looked at screenshots: LTR desktop, RTL desktop, RTL at 375 px (no horizontal scroll).

**Not verified**
- **vitest was not run** (not installed, offline). The 17 new tests in `smoke/goal-stepper.test.ts` are the same scenarios as the Chromium run, written against jsdom, but jsdom itself has never executed them. Run `npm i -D vitest@2 jsdom@25 && npx vitest run` and tell me what turns red.
- A real backend, `vite build`, light theme (I only looked at dark), screen readers.
- **Persian copy under `growth.goals.stepper.addTasks` is mine: please have a native speaker skim it.**

## Files
New: this file.
Edited:
- `state/goal-stepper.ts`: step 3 state and actions.
- `views/goal-stepper.ts`: step 3 UI.
- `state/goals.ts`: `applyTasks()` and a stale-answer guard on `loadRoadmap` (see below).
- `state/goal-workspace.ts`: the pure `withCreatedTasks()`; its private `applyTasks` now calls it (same behaviour).
- `styles/goals.css`: appended step 3 block. `growth-os/i18n/en.ts` + `fa.ts`: `stepper.addTasks` block.
- `smoke/goal-stepper.test.ts`: fake backend extended, 17 new tests, and 7a expectations updated (below).
Untouched: `api/client.ts` and `api/types.ts` (`convertMilestoneToTasks` → `Task[]` already matched `TaskOut[]`), `package.json`.

## Contract (from `schemas/goals.py`, `api/routes/goals.py`, `services/goal_engine.py`)
- `POST /goals/milestones/{id}/convert-to-tasks`, body `{task_titles?: string[]}` (max 15) → **`TaskOut[]`** (`id, milestone_id, title, status, order_index`).
- Omitting/emptying `task_titles` makes the backend create one default Persian task ("انجام …"). The UI never sends that: every row needs a title.
- **Not idempotent:** each call appends and restarts `order_index` at 0.

## Behaviour
- **State:** step 3 is `current` once milestones exist, `done` when *every* milestone has at least one task. `manualProgress()` now also returns `tasksByMilestone`, `tasksAny` (at least one milestone has tasks: what step 4 needs) and `tasksDone`.
- **One form at a time.** Each milestone row has "Add tasks"; opening another milestone switches the form, and the first one keeps its rows and typed text (draft ids `manual-task-{goal}-{milestone}-{row}`). Cancel closes the form and keeps them too.
- **Form:** starts with 1 row; add (stops at 15) / remove (the last row can't go); every row needs a non-blank title (error per empty row, focus on the first, no request); titles are trimmed and sent in order; live counter `n / 15` (`dir="ltr"`, localized digits). Enter in a field submits.
- **Over 15:** Add stops at 15, so the "over" state can't be reached from the UI. It is still guarded three times anyway: submit disabled + message in the view, and the store refuses `> 15` titles.
- **After success the answer is written into the stored roadmap tree** (`goalsStore.applyTasks`), with **no `GET /tree`**. The stepper and the Roadmap section both read that tree, so the tasks appear in both, and a language switch redraws from the store with zero requests (tested).
- **Stale answers:** `loadRoadmap` now drops an answer if a newer load or `applyTasks` happened meanwhile (per-goal token). Without it, a `GET /tree` that left before the POST would put the old tree back and the new tasks would vanish. This also protects 7a's convert/split refresh.
- **Lock:** `submitLock` per milestone (`goal-tasks-{goal}-{milestone}`) disables the fields, add/remove/cancel/submit; while any milestone of the goal is being sent, the other "Add tasks" buttons are disabled too.
- **Errors and retry:** a failed submit stores the `ApiError`; the form shows `asyncPanel` in its error state (`errorMessage` at render time, so it re-translates) with **Retry**, which re-validates and re-sends whatever is in the fields *now*. A 401 goes to the session guard; a 429 shows the lock's "please wait" (no panel). After a network/5xx/404 failure the tree is re-read, in case the request went through. The 7a `asyncPanel` around the whole stepper (tree load + retry) is unchanged.
- **Focus:** open → first row; add/remove row → new/neighbour row; cancel → that milestone's button; success → the next milestone's "Add tasks", or the step 3 heading when all are done.

## Decisions and caveats
- **A milestone is filled once.** Same reasoning as 7a: a second call would append duplicates with `order_index` restarting at 0. The store refuses a milestone that already has tasks (from this screen, `/decompose`, or the tree), and refuses everything while `POST /decompose` runs for the same goal. Adding more tasks to a filled milestone later is not offered; the goal workspace screen has its own flow.
- The goal workspace store (`goalWorkspace`) keeps a separate tree; it is not touched by this screen and refreshes when that screen opens. A task created there while this page is open is only noticed at the next tree read.
- Title cap 200 in the UI (the backend puts no limit on list items), like the other titles.
- Step 3 is "done" only when *all* milestones have tasks. If you'd rather move on after the first one, use `tasksAny` for step 4's `state` in 7c.
- **7a tests changed:** four `stepStates()` expectations went from `["done","done","next","next","next"]` to `["done","done","current","next","next"]` (step 3 is now current once milestones exist), and the layout test no longer expects a disabled button in step 3 (it shows "Finish step 2 first." like step 2 did).

## Hooks for 7c
Step 4 is `steps.tasks` (`disabledAction(...)` in `views/goal-stepper.ts`): its inputs are `prog.tasksByMilestone` (or `tree.tasks` / `tree.nextActionIds`); the workspace store already has `convertTaskToNextAction` and `validateActionDraft` for the "concrete action" rule. Follow the same pattern as step 3: a `convertTask` action next to `convertMilestone`, an `applyNextAction` on `goalsStore` that patches the tree (and invalidates in-flight loads the same way), and a `taskGoalPrefix`-style draft prefix cleared in `forget()`.
