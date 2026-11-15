# Part 20c: journey CTAs, plan proposal -> daily plan -> "what now?" -> focus -> feedback (HANDOFF)

Navigation only. No endpoint, no page, no flow logic changed. Every new CTA is `JourneyNextStep` (`lib/journey-next-step.ts`), decided by `state/journey-map.ts`. None sends a request; all are rebuilt in the new language (tested, request count unchanged).

## Verified
- `tsc --noEmit`: 10 errors, the same 10 as the 20b zip (missing Part 17b files). Nothing new.
- `npm run check:i18n`: OK.
- 16 new tests (`smoke/journey-cta-20c.test.ts`). Full vitest: 85 failures (20b baseline: 90) in the same files as before: my-profile-form-view, my-profile-save-state, my-profile-save-view, plan-confirm-feedback (17 -> 12), ui-habits-discard-completeness, ui-habits-save. Passing 2020 -> 2068.
- Mutation check: 9 deliberate breaks, 9 caught (one needed a new test: the "planningNone: false" override on the What-now card).
- 3 existing tests changed because the map changed on purpose (`journey-map.test.ts` list + whatNow edges, `journey-next-step.test.ts` whatNow with no session).

## Not verified
- No browser: look of `.busy__next`, `.now-card__plan`, the plan success box (both themes, RTL, 375px).
- Persian copy (`growth.journey.steps/cta.planProposal|busyBlocks`, `busyBlocksPage.next.*`) is mine: needs a native skim.
- The remaining `plan-confirm-feedback` failure that is about my area: "Go to Today navigates" expects `dailyPlanStore.invalid === true` without ever loading the plan; the store (by design, 9a) ignores `invalidate()` before the first load. The test, not the code. I did not edit that test.

## Where JourneyNextStep was added
| Step | Screen (file) | Button(s) |
|---|---|---|
| 8 "what now?" with nothing left | the card's empty guide, both "nothing fits" and "everything shown" (`views/next-action-now.ts`) | "Plan my next actions" -> Planning required. Check again / Start over / Back stay. With a running focus session also "Back to my focus session". Never shown while a suggestion is on screen |
| 6/7 after Plan confirm | proposal screen success box (`views/plan-proposal.ts`, `drawConfirmSuccess`) | "Go to Today" (primary) beside the existing "Plan again" |
| after adding / removing a Busy Block | Busy blocks page (`views/busy-blocks.ts`) | "Go to Today", with a one-line lead; shown from the first successful add/remove until the user reaches Today |

Map (`state/journey-map.ts`): new side-page steps `planProposal` and `busyBlocks` (both -> `dailyPlan`; `sidePage: true` means "opened from the nav bar", a start point for the reachability check); `whatNow` now leads to `focus` and `planning`. Component: new optional `labels` prop (text per target step, so the screens can say "Go to Today"). New state: `state/busy-change-signal.ts` (in-memory flag; cleared when the journey reaches Today or the login step).

## Dead ends from the 20a audit
Fixed: **D3** (no "Go to Today" after Plan confirm). Part 13c's success view was missing from the zip, so I wrote it from the existing 13c i18n/CSS/tests: the status message, Go to Today, Plan again, "saved" intro and section title, focus on the message once on save (not on a language rebuild). 5 more 13c success tests now pass.
Already fine in 20a (no dead end), unchanged: steps 7, 8, 9, 10. Fixed earlier (20b): D1, D2, G1-G3.
Left for 20d: **D4, D5, D6, D7**.

## Not changed, on purpose (please decide)
- **Daily plan page**: "What should I do now?" is the existing card, and the empty state already offers active hours, goals (decomposition) and Planning required. Both match the task, so I added nothing. The card also shows on an EMPTY plan; an existing test pins that ("an empty plan still offers 'What should I do now?'"). Hiding it would remove a working button, so I left it.
- **After focus finish / after feedback**: "Give feedback", "Check my progress" and "What now" already exist as hand-built buttons (9c). A JourneyNextStep beside them would show the same button twice, so I did not add one. Say so if you want them swapped to JourneyNextStep (the map already has focus -> feedback -> progressCheck; "Back to what now" would need `feedback` -> `whatNow`).
- "Focus moves to the feedback form": `app.ts` moves focus to `<main>` on every view change; the form's first field is not focused. Not changed.
- Plan confirm ERROR hooks (`drawConfirmError`, 12 failing 13c tests) are still empty: not a CTA task, not touched.

## Files
New: `src/state/busy-change-signal.ts`, `smoke/journey-cta-20c.test.ts`, `HANDOFF-part20c.md`, `existing-files-20c.patch`.
Changed: `state/journey-map.ts`, `lib/journey-next-step.ts`, `views/{busy-blocks,next-action-now,plan-proposal}.ts`, `growth-os/i18n/{en,fa}.ts`, `styles/{busy-blocks,components}.css`, `smoke/journey-map.test.ts`, `smoke/journey-next-step.test.ts`.
