# Part 20a: User journey map, shared next-step CTA, dead-end audit (HANDOFF)

Navigation only. No endpoint, no page, no existing flow changed. Nothing is wired into a page yet (20b to 20d do that).

**Verified**
- `tsc --noEmit`: 10 errors, byte-identical to the untouched zip (all from the 3 missing Part 17b files). Nothing new.
- `npm run check:i18n`: OK.
- 27 new tests pass (`smoke/journey-map.test.ts` 17, `smoke/journey-next-step.test.ts` 10). I broke the code 8 ways (guard ignored, current-view filter removed, tab ignored, live guard not rechecked, hard-coded route id, group role always, branch removed, focus() inside the component): every one is caught.
- Full vitest: 90 failures in the same 6 files as on the untouched zip (my-profile-form-view, my-profile-save-state, my-profile-save-view, plan-confirm-feedback, ui-habits-discard-completeness, ui-habits-save). Passing 1965 -> 1992.

**Not verified**
- No browser: look of `.journey-next` (both themes, RTL, 375px).
- Persian copy under `growth.journey` is mine: needs a native skim.

## Audit (code as given in the zip)

"Dead end" = in its normal finished state the screen has no in-page button to the next journey step (the nav bar always works).

| # | Step | Route / view | Next-step CTA today | Dead end? |
|---|---|---|---|---|
| 1 | Sign up | `AUTH`, `views/auth.ts` | login and register both `goTo("CHAT")` automatically; nothing points to active hours | No, but next step never offered |
| 2 | Active hours | `CONTEXT_SETUP`, `views/context.ts` | save -> `GOAL_CREATION` automatically; no Brain Dump branch | No (partial) |
| 3 | Brain Dump | `plan/brain-dump`, `views/brain-dump.ts` | after confirm: "Plan today" -> `plan/interview`, "Start new". Nothing leads to decompose; Brain Dump creates no goal | Mismatch with the journey |
| 4 | Create goal | `GOAL_CREATION`, `views/goal-creation.ts` | submit -> `setGoal` + `DECOMPOSITION` | No |
| 5 | Decompose | `DECOMPOSITION`, `views/decomposition.ts` | Continue -> legacy `PLANNING_REQUIRED` or `DAILY_PLAN`; Open workspace | No (gaps below) |
| 6 | NextAction planning proposal | `plan/planning-required` (`views/planning-required-page.ts`), legacy `PLANNING_REQUIRED` (`views/planning-required.ts`) | legacy page auto-forwards to `DAILY_PLAN`; route page has CTAs only in its empty state; `plan/next-actions` has no view (placeholder, CTA only "Go to chat") | Yes |
| 7 | Daily plan | `DAILY_PLAN`, `views/daily-plan.ts` | Start focus, "what now" card, "Plan another", 3 ways out of the empty state | No |
| 8 | "What now?" | card inside `DAILY_PLAN` (`views/next-action-now.ts`), no route | Start focus, Choose another, Not now, actions in empty states | No |
| 9 | Focus | `FOCUS_EXECUTION`, `views/focus-execution.ts` | Finish (action); after: Give feedback / Skip | No |
| 10 | Feedback | `FOCUS_FEEDBACK`, `views/focus-feedback.ts` | after submit: Check my progress, What now | No |
| 11 | Progress Check | `reflect/progress-check`, `views/progress-check.ts` | Today + Weekly growth only inside the confirm success box | Yes |
| 12 | Weekly growth | `reflect/weekly-growth`, `views/weekly-growth.ts` | Patterns + Today only inside the confirm success box | Yes |
| 13 | Behavior patterns | `reflect/behavior`, patterns tab | empty state links to the Failures / Distractions tabs only | Yes |

## Dead ends: the work list for 20b to 20d (exact)

| ID | Where | Problem | Suggested journey target |
|---|---|---|---|
| D1 | `plan/planning-required` (`planning-required-page.ts`), list state | no CTA to Today while items remain | `planning` -> `dailyPlan` |
| D2 | `plan/next-actions` (registry route, no entry in `ROUTE_VIEWS`) | placeholder only; its real feature lives on `plan/planning-required` | decide: hide the tab or point it there |
| D3 | `plan/interview` proposal screen after confirm (`plan-proposal.ts`) | no "Go to Today". **Part 13c's view code is missing from the zip**: `drawConfirmSuccess` / `drawConfirmError` are empty, `PlanProposalNav` has no `onGoToToday`, and `plan-confirm-feedback.test.ts` fails 17 tests | re-send 13c, then Today |
| D4 | Progress Check result before confirm (`progress-check-result.ts`) | no CTA | `progressCheck` -> `weeklyGrowth` |
| D5 | Weekly Growth result before confirm (`weekly-growth-result.ts`) | no CTA | `weeklyGrowth` -> `behaviorPatterns` |
| D6 | Behavior patterns tab, with data | no way out | `behaviorPatterns` -> `dailyPlan` |
| D7 | Behavior Failures / Distractions tabs, non-empty | Today link exists only in the empty state | `dailyPlan` |

Gaps (not dead ends, decisions for you):
- G1 Sign-up lands on Chat; active hours is never offered.
- G2 Active hours offers only create goal; Brain Dump is not a branch there.
- G3 **Brain Dump does not reach decompose in code** (it goes to `plan/interview`). The map follows your journey (both branches -> decompose), but from Brain Dump the decompose button stays hidden until a goal exists (guard). Either route Brain Dump through create goal, or change the map to `brainDump -> planning interview`.
- G4 Decompose's "already decomposed" view skips planning; its Continue goes to the legacy `PLANNING_REQUIRED` page (manual form, no proposals), not `plan/planning-required`.
- G5 Chat's "Convert to Goal Roadmap" is a third real entry into decompose; it is not in the 12-step journey, so it is not in the map.

Missing from the zip: `state/active-hours.ts`, `state/ui-profile-form.ts`, `views/my-profile-active-hours.ts` (Part 17b); HANDOFFs for Parts 1, 2, 4, 5, 17b-1, 17b-2. The profile tab's active-hours editor could not be read, so the map's `activeHours` step points at the legacy `CONTEXT_SETUP` page.

## Journey map (`src/state/journey-map.ts`)

NOT `state/journey.ts`: that is the navigation store and stays untouched.

```ts
type JourneyStepId = "signUp" | "activeHours" | "brainDump" | "createGoal" | "decompose" | "planning"
  | "dailyPlan" | "whatNow" | "focus" | "feedback" | "progressCheck" | "weeklyGrowth" | "behaviorPatterns";
type JourneyTargetKey = RouteKey | Step;            // registry sub-route key, or legacy store Step
type JourneyRequirement = "goal" | "focusSession" | "finishedFocusSession";
interface JourneyStep {
  readonly id: JourneyStepId;
  readonly routeKey: JourneyTargetKey;              // resolved through NAV_SECTIONS; no route string in the file
  readonly labelKey: JourneyStepId;                 // keys of growth.journey.steps and growth.journey.cta
  readonly nextStepIds: readonly JourneyStepId[];   // first = primary, rest = alternatives
  readonly requires?: JourneyRequirement;           // entry guard (decompose, focus, feedback)
  readonly tab?: BehaviorTabId;                     // behavior page only, opened via openBehaviorTab
}
```
Graph: signUp -> activeHours -> {brainDump, createGoal} -> decompose -> planning -> dailyPlan -> whatNow -> focus -> feedback -> progressCheck -> weeklyGrowth -> behaviorPatterns -> dailyPlan (loop).

Exports: `JOURNEY_STEPS`, `getStep(id: string)`, `getNextSteps(id: string)`, `getAvailableNextSteps(id, ctx)`, `resolveTarget(key)`, `resolveStepTarget(step)`, `isStepAvailable(step, ctx)`, `isCurrentView(target, ctx)`, `journeyMapProblems(steps?)`; types above plus `JourneyTarget`, `JourneyContext`.

`getAvailableNextSteps` drops: unresolvable targets, unmet guards, and the screen the user is already on (a button there would re-draw the page and reset it). So on the daily plan page `dailyPlan` yields nothing (the "what now" card is already there); that page's next steps stay its in-page buttons.

## Component (`src/lib/journey-next-step.ts`)

Named like `emptyStateGuide` (a function returning a node).

```ts
journeyNextStep(props: JourneyNextStepProps): HTMLElement | null
interface JourneyNextStepProps {
  stepId: JourneyStepId;                 // the step the user is ON; buttons lead to its nextStepIds
  state?: JourneyContext;                // default: live store (tests only)
  onNavigate?: (to: JourneyStepId) => void;
  className?: string;
}
goToJourneyStep(step: JourneyStep): boolean            // false = refused (live guard no longer met)
journeyNextActions(stepId, state?): EmptyStateAction[] // same steps as { label, onClick } for emptyStateGuide
```
- First button `btn-primary`, others `btn-secondary`; wrapper `div.journey-next[data-journey-next]`, `role="group"` + `aria-label` only with 2+ buttons. Accessible name = visible text.
- Navigation: `journey.goTo` / `journey.goToRoute` / `openBehaviorTab`. Focus moves to `<main>` via `app.ts draw()`; the component never calls `.focus()` (a test enforces it).
- Returns `null` when nothing can be offered: the caller decides what to show instead.

## i18n (fa + en)
`growth.journey = { nextGroup, steps: Record<JourneyStepId,string>, cta: Record<JourneyStepId,string> }` in `growth-os/i18n/en.ts` and `fa.ts`.

## Files
New: `src/state/journey-map.ts`, `src/lib/journey-next-step.ts`, `smoke/journey-map.test.ts`, `smoke/journey-next-step.test.ts`, `HANDOFF-part20a.md`, `existing-files-20a.patch`.
Changed (also in `existing-files-20a.patch`): `src/growth-os/i18n/en.ts`, `src/growth-os/i18n/fa.ts`, `src/styles/components.css` (`.journey-next*`).
Not in `lib/ui/index.ts` on purpose: the component imports store code, which `lib/ui` does not.
