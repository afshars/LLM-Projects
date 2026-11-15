# HANDOFF Part 11 (final): Brain Dump submit, review, confirm, hand-off to Plan. Merges 11a, 11b-4a, 11b-4b, 11b-6, 11b-7a (no 11b-5 handoff existed; its clarify hint is described from the code).
## Files (all under frontend/)
- NEW: src/state/{brain-dump,brain-dump-items,plan-candidates}.ts, src/views/brain-dump.ts, src/styles/brain-dump.css, scripts/check-i18n-parity.ts, smoke/{brain-dump-*,plan-candidates,review-and-confirm-options,api-brain-dump-confirm}.test.ts
- CHANGED: src/api/{client,types}.ts, src/lib/ui/review-and-confirm.ts, src/lib/dom.ts (ErrorContext "save"), src/views/section-view.ts, src/growth-os/i18n/{en,fa}.ts, src/main.ts (css import), package.json (check:i18n)
- DELETED: stray src/growth-os/{en,fa}.ts (unreferenced, broken imports). Their 15 confirm.error/success keys now live in growth-os/i18n/{en,fa}.ts (the pair dictionary.ts imports).
## Exported names
- Types: BrainDumpItem, BrainDumpRequest/Response, BrainDumpConfirmRequest/Response (api/types); BrainDumpState, BrainDumpStatus, BrainDumpConfirmStatus, BrainDumpItemType, ItemPatch, UpdateItemResult; PlanCandidate, PlanCandidatesSlot, PlanCandidatesDropped, SetPlanCandidatesResult
- State: brainDumpStore (setDraft, submit, editItem, deleteItem, confirm(logDate), discard, startNew, reset), isConfirmFrozen, countChars, validateBrainDump, charsOver, BRAIN_DUMP_MAX_CHARS=4000, updateItem/removeItem/validateItemPatch/buildConfirmBody; planCandidates, setPlanCandidates, clearPlanCandidates, getPlanCandidates, normalizePlanCandidates, taskCandidatesOf, candidateInputsOf, PLAN_CANDIDATES_MAX=20, PLAN_FLOW_ROUTE
- Client: apiClient.runBrainDump(rawText, lang) POST /chains/brain-dump; apiClient.confirmBrainDump(logDate, items) POST /chains/brain-dump/confirm (ADDS rows: never re-send blindly)
- Components: renderBrainDumpPage; reviewAndConfirm (new options items readonly, removable, showErrors, frozen, blockedReason, headingLevel, saved)
## Store slots and routes
- Route added: "plan/brain-dump" -> renderBrainDumpPage (section-view.ts). CTA target: "plan/interview" (PLAN_FLOW_ROUTE, my guess; no renderer yet).
- planCandidates slot, exact type: `planCandidates.get(): { readonly items: readonly { readonly text: string; readonly source: "brain_dump" }[]; readonly updatedAt: number }` (updatedAt = Date.now(), 0 = never written)
- brainDumpStore keys: draft, status, result, error, items (working list), confirmStatus, confirmError, confirmResult.
## Part 12 reads candidates from
- `getPlanCandidates()` in src/state/plan-candidates.ts (= planCandidates.get().items). `.map(c => c.text)` is a valid API `candidates` array (1-20) but may be [] : Part 12 must handle that. In-memory only, SNAPSHOT, replaced (not appended) per click, cleared on arrival at login. Never read brainDumpStore for this.
- Rules: trim, drop empty, exact case-sensitive dedupe (first wins), first 20 kept. Only type==="task" items are handed over.
## Known gaps / TODO
- Part 12 must add `"plan/interview": renderPlanInterviewPage` to ROUTE_VIEWS (today the CTA lands on the placeholder page).
- log_date = device-local todayIso(); change in reviewPanel() if the profile time zone should win.
- After a network error on confirm, saved state is unknown; the UI asks "Save again?" (no idempotency key on the backend).
- Persian copy (all new fa strings) needs a native skim. Nothing checked in a real browser: card grid, :has() editor layout, RTL, focus rings.
- Part 1/2/11b-5 handoffs were not in the zip.
