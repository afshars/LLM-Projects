# HANDOFF part 8 / step 9: page-level proposal tests
- Only a test file changed: `smoke/planning-required-page-flow.test.ts` (+ new describe "proposal flows at page level (step 9)", 12 tests; real page, stores, card and API client, only fetch stubbed). No source file touched.
- Request -> accept: item leaves on planning_ready=true; exactly 2 requests (POST create, POST accept); no GET, no tree/decompose call; journey decomposition unchanged; focus to the list heading; last item -> empty guide.
- Edit -> save: sends all three values (also untouched sliders, and moved ones); planning_ready=true removes the item; planning_ready=false keeps it with status "edited" and no buttons.
- Reject: item stays with status "rejected"; manual entry is still available and PUTs to the item's own `planning_endpoint` (3 values), with no proposal call.
- Failed action: accept / reject / edit each show role=alert in that card only, stay usable, and Retry re-sends (edit: same editor, same values). Failed request + Retry was already covered.
- Submitting: accept / reject / edit disable every button of the item (+ Manual entry, Get a suggestion), the running one shows its own label, extra clicks send nothing; other items stay free.
- Language switch: edit draft kept (also after a failed save), no request on rebuild, Save then sends exactly the draft, labels in Persian.
- GOAL-TREE MARKER: none exists in Part 7 (no readiness field in the tree types; `all_planning_ready` is only on the decomposition result), so none is asserted. The tests check what is observable: no tree/decompose request and journey.decomposition untouched. If a marker is wanted, it needs its own step.
- RAN (npm ci): `npx tsc --noEmit` clean; `npx vitest run` 21 files / 735 tests passed; `npx vite build` ok. `npm run build` (`tsc -b`) not run. Mutation check done by hand (ignore planning_ready, drop busy-disabling, break edit Retry, drop manual-toggle lock): each made the new tests fail; source restored.
