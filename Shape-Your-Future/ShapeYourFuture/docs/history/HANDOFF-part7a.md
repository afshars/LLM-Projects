# Part 7a — Manual step-by-step path, steps 1 and 2 (HANDOFF)

A guided stepper on the goal page: **Goal → Project → Milestones → Tasks → NextAction**. Steps 1 and 2 work; 3 to 5 are visible, marked "Next", with a disabled button (7b/7c wire them).

**Verified:** `tsc --noEmit` clean (no environment errors this time: I could `npm install`), `vite build` OK, 63 vitest tests pass (42 existing + 21 new in `smoke/goal-stepper.test.ts`). I broke 11 guards on purpose (dedupe, existing-project check, submitLock on each form, empty-title check, trim, 429 handling, tree re-check, stale-tree fallback, redraw subscription); each one turned a test red, then I restored the file.
**Not verified:** a real backend (the tests use a fake that mirrors the two routes and their service code), how it *looks* (no browser: CSS is tokens-only and logical-property based, but needs a visual pass at 375 px, in both themes, and in RTL), screen readers. **Persian copy under `growth.goals.stepper` is mine: please have a native speaker skim it.**
**Not read:** `HANDOFF-part1.md` was not in the zip (only Parts 3 and 6 were). Contract facts come from `schemas/goals.py`, `api/routes/goals.py` and `services/goal_engine.py`.

## Files
New: `state/goal-stepper.ts`, `views/goal-stepper.ts`, `smoke/goal-stepper.test.ts`.
Edited: `views/goals.ts` (+3 lines of import, the stepper section placed between the edit form and the roadmap, and a second subscription so the stepper store redraws the screen), `styles/goals.css` (appended section), `growth-os/i18n/en.ts` + `fa.ts` (`goals.stepper` block). No change to `api/client.ts` or `api/types.ts`: `convertGoalToProject` and `splitProjectIntoMilestones` already matched the schemas.
`package.json` is untouched. The tests need `npm i -D vitest@2 jsdom@25` as before.

## Response shapes (from the schemas, not guessed)
- `POST /goals/{id}/convert-to-project` body `{project_title?, objective_title?}` → **`ProjectOut`** only (`id, objective_id, title, status, order_index`). No objective in the answer, so the objective title comes from `GET /tree`, which is refetched after success.
- `POST /goals/projects/{id}/split-into-milestones` body `{milestone_titles}` (max 15) → **`MilestoneOut[]`**.

## Behaviour
- **Progress is derived, not stored as a "current step" number.** `manualProgress(tree, entry)` (pure, exported) = the goal's tree from `goalsStore.roadmap` plus what the last POST answered. Step 1 done = a project exists; step 2 done = it has milestones. So a goal that was already converted (by this path or by `/decompose`) opens with steps 1 and 2 done and no forms. If the tree has a project but no milestones, step 2 is current and targets that project. A `GET /tree` that was already in flight when the POST answered cannot move progress backwards (tested).
- **State survives a language change, no refetch.** Rows, errors, POST answers live in `goalStepper` (per goal id). Typed text is in the `formField` draft store. Errors are stored as `ApiError` and turned into text with `errorMessage` at render time only. Tested: switching to FA sends 0 requests and keeps rows, typed text, step state.
- **Step 1:** two optional `formField`s; blank = key omitted from the body. **Step 2:** starts with 2 rows; add (max 15) / remove (last row can't go); every row must have a non-blank title (error per empty row, focus on the first, no request); titles are trimmed and sent in order.
- **submitLock** on both forms (keys `goal-convert-{id}`, `goal-split-{id}`): buttons and inputs disabled while in flight, double submit sends one POST, 429 shows the lock's "please wait" (no banner). **asyncPanel** wraps the stepper on the roadmap's load state (loading skeleton / error + retry): no form is shown until `GET /tree` has answered, because we don't yet know if the goal is converted.
- After success, focus moves to the step 2 heading (the form that had it is gone). After add/remove of a row, focus goes to the new/neighbouring row.

## Decisions and caveats
- **Neither endpoint is idempotent.** Converting twice creates a second Objective + Project; splitting twice appends duplicate milestones and restarts `order_index` at 0 (and the UI has no way to delete a project). So the store sends each POST at most once: deduped while in flight, refused when the tree already has the result, and refused while `POST /decompose` runs for the same goal (the button is disabled with a note). After a network/5xx failure the store re-reads `GET /tree` first, in case the request went through. This is a client-side guard only; a backend "already converted" 400/409 would be the real fix.
- **Blank titles get Persian defaults.** The backend fills blank titles from its category templates, which are Persian, and the routes take no language. The step 1 hint says so instead of promising a suggestion in the UI language.
- **Steps are named by node** as in your chain: step 1 "Goal" holds the goal→project form, step 2 "Project" holds the project→milestones form; steps 3 to 5 have placeholder labels ("Add tasks", "Add next action", "Set up next action") and one-line descriptions. Step 5's wording is a guess; change it in 7c.
- **The stepper does not draw the full tree.** Steps 1 and 2 show what they created (objective, project, milestone titles). The full outline is already rendered by the Roadmap section right below from the same `GET /tree`, so drawing it twice on one page seemed worse. It's a one-liner (`goalTreeList(tree)`) if you want it inside the stepper instead.
- **Once milestones exist, step 2 is closed.** Adding more milestones later isn't offered (it would be a second split). If several projects exist (auto-decomposed), the stepper follows the first project of the first objective.
- **Milestone title length:** the backend puts no limit on list items; the UI caps at 200 like the other titles.
- The stepper store forgets a goal when it leaves `goalsStore.detail` (deleted/archived) and everything on logout, without `goals.ts`'s `remove()` having to know about it (that would be an import cycle).

## Hooks for 7b / 7c
Add to `StepperEntry` + a `convertMilestone…` action next to `split()` in `state/goal-stepper.ts`; replace `disabledAction(...)` in `views/goal-stepper.ts` for the step, and make `state` of step 3 `prog.milestonesDone ? "current" : "next"`. Field-id prefixes (`manual-convert-{goal}-`, `manual-ms-{goal}-`) are exported so drafts are cleared on success and on forget.
