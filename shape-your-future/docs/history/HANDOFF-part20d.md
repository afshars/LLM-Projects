# Part 20d: journey CTAs, Progress Check -> Weekly Growth -> Behavior patterns -> Today (HANDOFF)

Navigation only. No endpoint, no page, no flow logic changed, no existing button removed or replaced. Every new CTA is `JourneyNextStep` (`lib/journey-next-step.ts`), decided by `state/journey-map.ts`. None sends a request; all are rebuilt in the new language (tested, request count unchanged). The map itself is unchanged (still 17 steps).

## Verified
- `tsc --noEmit`: output identical before and after my change (25 lines, all sandbox-only: `.css` side-effect imports and missing vite/client types, because there is no node_modules here). Nothing new.
- `check:i18n` logic run with tsx (vite-node is not installed): OK, en 1829 = fa 1829.

## NOT verified (please run)
- **vitest did not run**: no node_modules and no network in this sandbox. The new `smoke/journey-cta-20d.test.ts` (24 tests) and the existing suite were only read, not executed. Please run `npx vitest run` and tell me what fails; expect the same 85 baseline failures from 20c and nothing more.
- No browser: look of `.progress-check__journey`, `.weekly-growth__journey`, `.weekly-growth__hint`, `.behavior-patterns__next` (both themes, RTL, 375px).
- Persian copy under `progressCheckPage.next`, `weeklyGrowthPage.next|hint`, `behaviorPage.next` is mine: needs a native skim.

## Where JourneyNextStep was added
| Step | Screen (file) | Button |
|---|---|---|
| 11 Progress check | under the result card, `#progress-check-result` sibling (`views/progress-check.ts`, `drawJourney`) | "Weekly review" -> Weekly growth. Quiet (secondary) while the check is unsaved, primary once saved. "Turn the next step into a NextAction", Save, and the success box's "See weekly Growth" / "Go to Today" are all kept |
| 12 Weekly growth | under the result card (`views/weekly-growth.ts`, `drawJourney`) | "See my behavior patterns" -> Behavior page, Patterns tab (via `openBehaviorTab`). Quiet while unsaved, primary once saved. Success box buttons kept |
| 13 Behavior patterns | Patterns tab (`views/behavior-patterns.ts`, `drawNext`) | "Back to Today" (primary), shown when saved patterns are on screen or a detect run has finished (even one that found nothing); hidden while a run is going and on the empty state before any run |
| Failures / Distractions tabs | under a NON-empty list (`views/behavior-failures.ts`, `views/behavior-distractions.ts`) | quiet "Back to Today". Both use `stepId: "behaviorPatterns"` (the Behavior page is that step; no new map step) |

Patterns empty state already linked to the Failures and Distractions tabs (16d); unchanged and covered by a test.

## Hint (item 4)
`views/weekly-growth.ts` shows a `role="note"` with a quiet "Do a Progress check first" button before the first run, only while no Progress Check was SAVED in this session (`state/growth-hint.ts: shouldHintProgressCheck`, reads two slices already in memory). It disappears when a run starts/succeeds/fails. "Run weekly review" is never disabled by it. It cannot know about checks saved in an earlier session (that would need a request), so the copy does not claim nothing was logged. Its button uses `goToJourneyStep(getStep("progressCheck"))` (same map target + guard as every journey button) because the map has no backward edge weeklyGrowth -> progressCheck and I did not want one: it would add a second button to the success CTA.

## Dead ends from the 20a audit
Fixed: **D4** (Progress check result before confirm), **D5** (Weekly growth result before confirm), **D6** (patterns with data), **D7** (Failures / Distractions non-empty). Together with 20b (D1, D2, G1-G3) and 20c (D3) every item of the 20a work list is now fixed. D4/D5 are fixed for the saved AND the unsaved state.

## Decisions for you
- **Duplicate-looking buttons after saving.** The success boxes already had "See weekly Growth" (Progress check) and "See behavior patterns" (Weekly growth). You said to keep working buttons and add the CTA beside them, so after a save the page has both (the new one sits under the card, with a lead line). If you prefer one, the old hand-built button can go in a one-line change per box; I did not do it.
- The CTA also appears BEFORE confirm (quiet), because D4/D5 in the audit were defined as "result before confirm" and leaving the page does not lose the result or the edits (they live in the store). Say so if you want it after confirm only.
- Still hand-built, untouched: the empty-state "Go to Today" on Failures/Distractions, the "Open Progress check" button on the Weekly growth not-enough-data error.

## Files
New: `src/state/growth-hint.ts`, `smoke/journey-cta-20d.test.ts`, `HANDOFF-part20d.md`, `existing-files-20d.patch`.
Changed (also in `existing-files-20d.patch`): `src/views/{progress-check,weekly-growth,behavior-patterns,behavior-failures,behavior-distractions}.ts`, `src/growth-os/i18n/{en,fa}.ts` (`progressCheckPage.next`, `weeklyGrowthPage.next`, `weeklyGrowthPage.hint`, `behaviorPage.next`), `src/styles/components.css`.
