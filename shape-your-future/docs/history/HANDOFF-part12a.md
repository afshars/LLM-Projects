# HANDOFF part 12a: Plan interview state and pure logic (no UI, no fetch)

**File:** `frontend/src/state/plan-interview.ts` (one module-level store per concern, same pattern as `plan-candidates.ts`).
**Test:** `frontend/smoke/plan-interview.test.ts`.

## Exact exports

```ts
export const INTERVIEW_MAX_TURNS = 5;        // backend MAX_TURNS
export const INTERVIEW_MAX_MESSAGES = 20;    // backend cap
export const INTERVIEW_MAX_CANDIDATES = 20;  // backend cap

export type InterviewStatus = "idle" | "asking" | "error";

export interface PlanInterviewSlice {
  readonly messages: readonly PlanningInterviewMessage[];   // { role: "user" | "assistant"; content: string }
  readonly knownCandidates: readonly string[];
  readonly knownAvailableHours: number | null;
  readonly knownEnergyWindow: string | null;                // "morning" | "afternoon" | "evening" when known
  readonly turnCount: number;                               // as answered by the backend, 0 before the first answer
  readonly ready: boolean;
  readonly status: InterviewStatus;
  readonly error: ApiError | null;                          // set only while status === "error"; read error.kind
}

// Pure (no DOM, no fetch). Every one returns a NEW frozen slice or a body; nothing is stored.
export function startInterview(candidates: readonly string[]): PlanInterviewSlice;
export function resetInterview(): PlanInterviewSlice;
export function buildInterviewRequest(slice: PlanInterviewSlice, userText: string): PlanningInterviewRequest;
export function applyInterviewResponse(slice: PlanInterviewSlice, response: PlanningInterviewResponse, userText?: string): PlanInterviewSlice;
export function isTurnLimitReached(slice: PlanInterviewSlice): boolean;
// Small extras the view needs (also pure):
export function markAsking(slice: PlanInterviewSlice): PlanInterviewSlice;
export function failInterview(slice: PlanInterviewSlice, err: unknown): PlanInterviewSlice;
export function canSendTurn(slice: PlanInterviewSlice): boolean;

// The store (set() starts no request):
export const planInterview: {
  get(): PlanInterviewSlice;                       // same object until the next set()
  set(next: PlanInterviewSlice): void;
  subscribe(fn: (s: PlanInterviewSlice) => void): () => void;
};
```

`PlanningInterviewMessage`, `PlanningInterviewRequest`, `PlanningInterviewResponse` and `ApiError` are the existing types from `api/types.ts` (unchanged).

## Rules

- `startInterview(candidates)`: fresh slice; `knownCandidates` = the input with blank texts and exact duplicates dropped, first 20 kept, **text kept exactly** (no trim: `candidate_task_ids` in propose is keyed by the exact string).
- `buildInterviewRequest`: `messages` = slice messages + `userText` as the last user turn. `known_candidates` only when non-empty; `known_available_hours` only when a number (0 counts); `known_energy_window` only when a non-empty string. Never null. `lang` is not set (the API client adds it). The slice is not changed.
- `applyInterviewResponse`: appends the user turn **only when `userText` is passed** (pass the text you sent), then the assistant `question_fa` when it is a non-empty string (nothing is appended when it is null, e.g. when `ready`). `knownCandidates`, `knownAvailableHours`, `knownEnergyWindow`, `turnCount` and `ready` are taken from the response (the backend returns the merged state). `status` becomes `"idle"`, `error` null.
- `failInterview`: status `"error"`, `error` = the ApiError (anything else becomes `kind: "unknown"`). Messages are NOT changed, so a retry re-sends the same text and the transcript has no half turn.
- `isTurnLimitReached`: `turnCount >= 5`.
- Lifetime: in-memory module state, no web storage, no translated text. It survives a language change. Reset when the user arrives at the login step. Nothing in this file imports `apiClient`.
- Assumption: `status: "asking"` means "a turn request is in flight" (there is no separate loading state).

## Usage

```ts
import { apiClient } from "../api/client";
import { getPlanCandidates } from "./plan-candidates";
import { planInterview, startInterview, buildInterviewRequest, markAsking, applyInterviewResponse, failInterview, canSendTurn } from "./plan-interview";

// entering the page (Part 12b): seed from the Brain Dump hand-off
planInterview.set(startInterview(getPlanCandidates().map((c) => c.text)));

// the user sends a message
async function send(text: string) {
  let s = planInterview.get();
  if (!canSendTurn(s)) return;
  const body = buildInterviewRequest(s, text);
  planInterview.set((s = markAsking(s)));
  try {
    s = applyInterviewResponse(s, await apiClient.planInterview(body), text);
  } catch (e) {
    s = failInterview(s, e);               // s.error.kind: "llm_unavailable" | "rate_limit" | ...
  }
  planInterview.set(s);                    // s.ready -> hand knownCandidates / hours / window to planPropose
}
```

## Things to know before 12b

1. **`turn_count` is not "user turns".** The route sets `turn_count = len(messages)` (including the message just sent) and the graph adds 1. With 1 user message the answer is `turn_count: 2`; after 2 user + 1 assistant + 1 user messages it is 5 and the backend answers `ready: true`. So the limit is reached after about 2 to 3 user messages, not 5. I trust the response value and do not compute it locally.
2. **`apiClient.planInterview` still sends nulls.** It always sets `known_candidates` (even `[]`), `known_available_hours: null` and `known_energy_window: null`. The backend accepts that, but it breaks your "never null" rule on the wire. I did not touch `client.ts` (this part is state only). One-line fix if you want it: build the body from the input as given instead of the `?? null` defaults. Say so and I will do it with its test in 12b.
3. The client rejects >20 messages or >20 candidates with `ApiError.kind "validation"`; `canSendTurn` also refuses a turn that would pass 20 messages, so the view does not spend a request.
4. The Part 2 and Part 3 HANDOFFs and the main store file were not in the zip (`HANDOFF-part2.md` is missing; `state/` has per-concern stores and `journey.ts`). I followed `plan-candidates.ts` and `planning-proposal.ts` for the pattern, and `isApiError` from `lib/dom.ts` for errors.

## Tests

- NEW `smoke/plan-interview.test.ts` (11): start seeding / cap 20 / exact text, reset, request with no nulls and no `lang`, 0 hours kept, slice not mutated, apply (user + assistant turns, no assistant message when `question_fa` is null, ready), error keeps `kind` and messages, limit at 5, `canSendTurn`, store notifies and calls no `fetch`, reset at login.
- **NOT RUN.** The zip has no `node_modules`. I typechecked `plan-interview.ts` alone with `tsc --strict` (clean). Please run `tsc --noEmit` and `vitest run`.

- Commit: feat(plan): planInterview slice (stateless interview state, request builder, response applier, turn limit)
