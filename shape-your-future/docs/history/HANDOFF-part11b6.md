# HANDOFF part 11b-6: Brain Dump -> Plan flow hand-off (shared `planCandidates` slot). Part 12 reads it.

## WHAT PART 12 DEPENDS ON (exact)

**File:** `frontend/src/state/plan-candidates.ts` (the repo's pattern: one module-level store per concern; `journey.ts` is NOT used for this).

**Exports**
- `planCandidates` - the slot's store. `planCandidates.get(): PlanCandidatesSlot` (same object until the next change), `planCandidates.subscribe(fn): () => void`. (`replace` is internal: always write through `setPlanCandidates` / `clearPlanCandidates`.)
- `setPlanCandidates(input: ReadonlyArray<{ readonly text: string }>): SetPlanCandidatesResult`
- `clearPlanCandidates(): void`
- `getPlanCandidates(): readonly PlanCandidate[]` (frozen; `[]` when nothing was handed over)
- `normalizePlanCandidates(input)` (pure, stores nothing), `taskCandidatesOf(items)`, `candidateInputsOf(items)` (pure helpers for Brain Dump items)
- constants `PLAN_CANDIDATES_MAX = 20`, `PLAN_FLOW_ROUTE = "plan/interview"`

**Exact types**
```ts
export interface PlanCandidate { readonly text: string; readonly source: "brain_dump" }
export interface PlanCandidatesSlot { readonly items: readonly PlanCandidate[]; readonly updatedAt: number } // Date.now(); 0 = never written
export interface PlanCandidatesDropped { readonly empty: number; readonly duplicate: number; readonly overCap: number; readonly total: number }
export interface SetPlanCandidatesResult { readonly kept: number; readonly dropped: PlanCandidatesDropped }
```

**Route the CTA goes to:** `plan/interview` (route id from `growth-os/registry.ts`, label key `planningInterview`), via `journey.goToRoute(PLAN_FLOW_ROUTE)`. It is a one-line constant. TODAY `section-view.ts` has no renderer for it, so the CTA lands on the shared placeholder page; Part 12 adds `"plan/interview": renderPlanInterviewPage` to `ROUTE_VIEWS`.

**Rules (all in `normalizePlanCandidates`)**
1. text is trimmed with `String.prototype.trim`; non-strings count as empty.
2. empty-after-trim texts are dropped.
3. DEDUPE: exact, CASE-SENSITIVE match of the trimmed text; first occurrence wins; order kept (`"Pay rent"` and `"pay rent"` are two items).
4. CAP: at most 20 items, counted AFTER steps 1-3 (empties and duplicates do not use up slots); the FIRST 20 stay, the rest are `overCap`.
5. `setPlanCandidates` REPLACES the slot (never appends), stores frozen copies, sets `updatedAt = Date.now()`. An all-empty input leaves an empty slot. `clearPlanCandidates()` also stamps `updatedAt`.
6. Part 12 mapping: `getPlanCandidates().map((c) => c.text)` is already a valid `candidates` array for the API (1 to 20). It can be `[]`: Part 12 must handle "no candidates" itself (the API needs at least 1).

**Lifetime:** in-memory module state only (no localStorage / sessionStorage / URL). Survives a language change (the view is rebuilt, the module is not). Dropped when the user arrives at the login step (same as every other store). It is a SNAPSHOT: later edits in Brain Dump do not change it until the user clicks the button again. Starting a new brain dump, discarding, confirming or re-sorting do NOT touch it.

## What changed in the UI
- `views/brain-dump.ts`: new `handoffBlock()` under the review panel (shown whenever the answer has at least one item; hidden when nothing was found). Button "Use these items as today's candidates":
  - uses ONLY `type === "task"` items of the CURRENT working list (`brainDumpStore.get().items`, read at click time): edited text, deleted ones gone, an item whose type was edited to / from task follows;
  - disabled when no usable task exists; `aria-describedby` -> an always-visible line that says why, or how many tasks a click hands over;
  - click: `setPlanCandidates(...)`, then a persistent `role="status"` region shows "N tasks are ready as today's candidates." + (only if something was dropped) "N left out: duplicates, or more than the limit of 20 candidates." + a "Go to Plan" button (`journey.goToRoute("plan/interview")`).
  - the confirmation is tied to the list it was made from: after an edit / delete / new run it disappears and the button is offered again (the slot keeps the older snapshot until the next click). It survives a language change.
  - independent of Confirm: no save needed first; saving does not clear the slot or the confirmation.
- The 11b-4b "Plan today" button on the success screen now writes through `setPlanCandidates` too (ONE slot, ONE shape). It does not show the dropped note.
- i18n: `growth.brainDumpPage.result.handoff.{button,hint(count,shown),none,done(count,shown),dropped(count,shown,max),cta}`, fa + en. Persian copy is mine: needs a native skim.
- `styles/brain-dump.css`: `.brain-handoff*` (tokens only).

## BREAKING for anything that used the 11b-4b slot
`planCandidates.get()` used to return `BrainDumpItem[]` and had `.set` / `.clear`. It now returns `{ items, updatedAt }` with items `{ text, source }` and has NO `.set` / `.clear` (use the functions). I updated the 5 assertions in `smoke/brain-dump-confirm-feedback.test.ts`. Nothing else in the zip used the old shape.

## Tests
- NEW `smoke/plan-candidates.test.ts` (11: trim, empty, dedupe, cap 20 incl. exactly 20, duplicates/empties do not use cap slots, replace not append, frozen copies, subscribe, no web storage, cleared at login) and `smoke/brain-dump-handoff.test.ts` (15: only tasks, edited text, deleted, type edits, disabled + described, forced click, status region identity, CTA route, cap note, stale confirmation, no /confirm request, confirm and startNew leave the slot, language switch).
- NOT RUN. The zip has no `node_modules` and I had no network: I only checked that every changed file parses. Please run `tsc --noEmit` and `vitest run`. The test I trust least: "confirming afterwards ... the message stays" assumes the store keeps the same `items` array after a save. If it fails, that assumption is the cause, not the slot.
- Also not seen in a browser: layout of `.brain-handoff`, RTL.

## Heads-up (carried from 11b-5)
The zip has two copies of the copy files: `growth-os/i18n/{en,fa}.ts` (the ones `dictionary.ts` imports) lack the 11b-4b `confirm.error/success` keys that the stray `growth-os/{en,fa}.ts` have. I added the new keys to all four; check which pair is real in your repo.

- Commit: feat(plan): shared planCandidates slot (text + source, trim/dedupe/cap 20) and Brain Dump "Use these items as today's candidates" with Go to Plan
