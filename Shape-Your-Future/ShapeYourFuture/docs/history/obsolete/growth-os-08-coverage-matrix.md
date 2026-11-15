> OBSOLETE (moved in Step 4): written before the app was reduced to Today, Reflect, Coach and Profile. It describes features that no longer exist. Kept as history only.

# 08 - Coverage matrix: endpoint -> client method -> UI page (Parts 21a + 21b)

Endpoint list: `app.openapi()` of `backend/app/main.py` (generated from the code, see Part 21a). Client list: `frontend/src/api/client.ts`. Routes: `frontend/src/growth-os/registry.ts` (sub-routes) and `frontend/src/app.ts` (journey steps). No backend or contract change.

## Summary

| Count | Value |
|---|---|
| Total endpoints | 65 |
| With a UI page | 63 |
| Intentionally no page (documented decision) | 2 |
| TODO (open work) | 0 |
| UNVERIFIED | 0 |

How "UI page" was decided: a page is listed only when a view file in `frontend/src/views/` contains the call (directly to `apiClient.*`, or to a store/flow function that is the only thing that calls that client method). Evidence = the view file and the function it calls, read from the source in this repository (comments ignored; an `import` alone did not count). Reading of the source only: nothing was run in a browser and vitest was not run.

Page names: `section/route` = a sub-route in `registry.ts` rendered by `views/section-view.ts` (`ROUTE_VIEWS`). `X step` = a journey step rendered by `VIEWS` in `app.ts` that has no registry sub-route of its own (reached from its nav section's `legacySteps`). The Preferences, Energy and Habits registry routes have no screen of their own: they open the tabs of `profile/smart-profile`.

## auth

| Endpoint | Client method | UI page |
|---|---|---|
| `POST /auth/register` | `register` | AUTH step (no registry route) - `views/auth.ts` (direct call) |
| `POST /auth/login` | `login` | AUTH step (no registry route) - `views/auth.ts` (direct call) |

## profile

| Endpoint | Client method | UI page |
|---|---|---|
| `GET /profile/me` | `getProfile` | profile/account - `views/profile-account.ts` (`profileStore.load`) |
| `PUT /profile/me` | `updateProfile` | profile/account - `views/profile-account.ts` (direct call) |
| `PUT /profile/me/password` | `changePassword` | profile/account - `views/profile-account.ts` (direct call) |
| `PUT /profile/me/avatar` | `setAvatar` | profile/account - `views/profile-account.ts` (direct call) |

## goals

| Endpoint | Client method | UI page |
|---|---|---|
| `POST /goals` | `createGoal` | GOAL_CREATION step (section goals) - `views/goal-creation.ts` (direct call)<br>CHAT step - `views/chat.ts` (direct call) |
| `GET /goals` | `listGoals` | goals/list - `views/goals.ts` (`goalsStore.loadList`)<br>DASHBOARD step - `views/dashboard.ts` (`dashboardStore.load`)<br>GOAL_WORKSPACE step (section goals) - `views/goal-workspace.ts` (`goalWorkspace.openLatest`) |
| `GET /goals/{goal_id}` | `getGoal` | goals/list - `views/goals.ts` (`goalsStore.loadDetail`) |
| `PUT /goals/{goal_id}` | `updateGoal` | goals/list - `views/goals.ts` (`goalsStore.update`) |
| `DELETE /goals/{goal_id}` | `deleteGoal` | goals/list - `views/goals.ts` (`goalsStore.remove`) |
| `POST /goals/{goal_id}/decompose` | `decomposeGoal` | goals/list - `views/goals.ts` (`goalsStore.decompose` (retry))<br>DECOMPOSITION step (section goals) - `views/decomposition.ts` (`goalsStore.decompose`) |
| `POST /goals/{goal_id}/convert-to-project` | `convertGoalToProject` | goals/list - `views/goal-stepper.ts` (`goalStepper.convert` (section inside the goals page)) |
| `POST /goals/projects/{project_id}/split-into-milestones` | `splitProjectIntoMilestones` | goals/list - `views/goal-stepper.ts` (`goalStepper.split`) |
| `POST /goals/milestones/{milestone_id}/convert-to-tasks` | `convertMilestoneToTasks` | goals/list - `views/goal-stepper.ts` (`goalStepper.convertMilestone`)<br>GOAL_WORKSPACE step (section goals) - `views/goal-workspace.ts` (`goalWorkspace.convertMilestoneToTasks`) |
| `POST /goals/tasks/{task_id}/convert-to-next-action` | `convertTaskToNextAction` | GOAL_WORKSPACE step (section goals) - `views/goal-workspace.ts` (`goalWorkspace.convertTaskToNextAction`)<br>reflect/progress-check - `views/progress-check-next-action.ts` (`requestCreateNextAction`) |
| `PUT /goals/next-actions/{action_id}/status` | `setNextActionDone` | DASHBOARD step - `views/dashboard.ts` (`dashboardStore.setDone`)<br>GOAL_WORKSPACE step (section goals) - `views/goal-workspace.ts` (`goalWorkspace.toggleNextAction`) |
| `PUT /goals/next-actions/{action_id}/planning` | `submitPlanning` | plan/planning-required - `views/planning-required-page.ts` (`planningRequiredStore.submit` (via `submitPlanning`))<br>PLANNING_REQUIRED step (section goals) - `views/planning-required.ts` (direct call of alias `updateNextActionPlanning`) |
| `GET /goals/{goal_id}/progress` | `getGoalProgress` | goals/list - `views/goals.ts` (`goalsStore.loadProgress`) |
| `GET /goals/{goal_id}/tree` | `getGoalTree` | goals/list - `views/goals.ts` (`goalsStore.loadRoadmap`)<br>DASHBOARD step - `views/dashboard.ts` (`dashboardStore.load`)<br>GOAL_WORKSPACE step (section goals) - `views/goal-workspace.ts` (`goalWorkspace.open`) |

## planning-proposals

| Endpoint | Client method | UI page |
|---|---|---|
| `POST /planning-proposals` | `createPlanningProposal` | plan/planning-required - `views/planning-required-page.ts` (`planningProposalStore.request`) |
| `GET /planning-proposals/{proposal_id}` | `getPlanningProposal` | **Intentionally no page** (Part 21e fix 5) - the planning screen works from the full proposal each create/accept/edit/reject answer returns, and `POST /planning-proposals` creates-or-refreshes the open one, so nothing needs a read by id. The typed, tested client method is kept; `smoke/api-client-usage.test.ts` fails if any other client method becomes unused without a written reason. |
| `POST /planning-proposals/{proposal_id}/accept` | `acceptPlanningProposal` | plan/planning-required - `views/planning-required-page.ts` (`planningProposalStore.accept`) |
| `POST /planning-proposals/{proposal_id}/edit` | `editPlanningProposal` | plan/planning-required - `views/planning-required-page.ts` (`planningProposalStore.saveEdit`) |
| `POST /planning-proposals/{proposal_id}/reject` | `rejectPlanningProposal` | plan/planning-required - `views/planning-required-page.ts` (`planningProposalStore.reject`) |

## daily-plan

| Endpoint | Client method | UI page |
|---|---|---|
| `GET /daily-plan` | `getDailyPlan` | DAILY_PLAN step (section today) - `views/daily-plan.ts` (`dailyPlanStore.load`)<br>DASHBOARD step - `views/dashboard.ts` (`dashboardStore.load`) |
| `GET /daily-plan/now` | `getNextActionNow` | DAILY_PLAN step (section today), Next action now - `views/next-action-now.ts` (`nextActionNowStore.ask` / `another`) |

## focus

| Endpoint | Client method | UI page |
|---|---|---|
| `POST /focus/start` | `startFocus` | DAILY_PLAN step (section today) - `views/daily-plan.ts` (`focusFlowStore.start`)<br>DAILY_PLAN step (section today), Next action now - `views/next-action-now.ts` (`focusFlowStore.start`)<br>DASHBOARD step - `views/dashboard.ts` (direct call) |
| `POST /focus/finish` | `finishFocus` | FOCUS_EXECUTION step (section today) - `views/focus-execution.ts` (`focusFlowStore.finish`) |
| `POST /focus/feedback` | `submitFocusFeedback` | FOCUS_FEEDBACK step (section today) - `views/focus-feedback.ts` (`focusFlowStore.submitFeedback`) |

## busy-blocks

| Endpoint | Client method | UI page |
|---|---|---|
| `POST /busy-blocks` | `createBusyBlock` | plan/busy-blocks - `views/busy-blocks.ts` (`busyBlocksStore.add`) |
| `GET /busy-blocks` | `listBusyBlocks` | plan/busy-blocks - `views/busy-blocks.ts` (`busyBlocksStore.load`) |
| `DELETE /busy-blocks/{block_id}` | `deleteBusyBlock` | plan/busy-blocks - `views/busy-blocks.ts` (`busyBlocksStore.remove`) |

## chains

| Endpoint | Client method | UI page |
|---|---|---|
| `POST /chains/brain-dump` | `runBrainDump` | plan/brain-dump - `views/brain-dump.ts` (`brainDumpStore.submit`) |
| `POST /chains/brain-dump/confirm` | `confirmBrainDump` | plan/brain-dump - `views/brain-dump.ts` (`brainDumpStore.confirm`) |
| `POST /chains/plan/interview` | `planInterview` | plan/interview - `views/plan-interview-chat.ts` (`sendInterviewTurn`) |
| `POST /chains/plan/propose` | `planPropose` | plan/interview (proposal phase) - `views/plan-proposal.ts` (`requestPlanProposal`) |
| `POST /chains/plan/confirm` | `confirmPlan` | plan/interview (proposal phase) - `views/plan-proposal.ts` (`requestPlanConfirm`) |
| `POST /chains/progress-check` | `runProgressCheck` | reflect/progress-check - `views/progress-check.ts` (`submitProgressCheck`) |
| `POST /chains/progress-check/confirm` | `confirmProgressCheck` | reflect/progress-check - `views/progress-check-confirm.ts` (`requestProgressConfirm`) |
| `POST /chains/growth/run` | `runGrowth` | reflect/weekly-growth - `views/weekly-growth.ts` (`runGrowthReview`) |
| `POST /chains/growth/confirm` | `confirmGrowth` | reflect/weekly-growth - `views/weekly-growth-confirm.ts` (`requestGrowthConfirm`) |

## behavior

| Endpoint | Client method | UI page |
|---|---|---|
| `GET /behavior/task-failures` | `listTaskFailures` | reflect/behavior - `views/behavior.ts` (`ensureBehaviorLoaded` / `refreshBehaviorTab`) |
| `POST /behavior/task-failures` | `recordTaskFailure` | reflect/behavior - `views/behavior-failures.ts` (`recordFailure`) |
| `POST /behavior/task-failures/{task_failure_id}/analyze` | `analyzeTaskFailure` | reflect/behavior - `views/behavior-failures.ts` (`analyzeFailure`) |
| `GET /behavior/distractions` | `listDistractionEvents` | reflect/behavior - `views/behavior.ts` (`ensureBehaviorLoaded` / `refreshBehaviorTab`) |
| `POST /behavior/distractions` | `recordDistractionEvent` | reflect/behavior - `views/behavior-distractions.ts` (`recordDistraction`) |
| `GET /behavior/patterns` | `getBehaviorPatterns` | reflect/behavior - `views/behavior.ts` (`ensureBehaviorLoaded` / `refreshBehaviorTab`) |
| `POST /behavior/patterns/detect` | `detectBehaviorPatterns` | reflect/behavior - `views/behavior-patterns.ts` (`detectPatterns`) |

## user-intelligence

| Endpoint | Client method | UI page |
|---|---|---|
| `GET /user-intelligence/profile` | `getUserProfile` | profile/smart-profile (tabs) - `views/my-profile-slice-tab.ts` (`ensureUiProfileLoaded`) |
| `PUT /user-intelligence/profile` | `updateUserProfile`, `updateActiveHours` | profile/smart-profile (tabs) - `views/my-profile-profile-save.ts` (`sendUiProfileSave`)<br>CONTEXT_SETUP step (section profile, no registry route) - `views/context.ts` (direct call) |
| `GET /user-intelligence/preferences` | `getUserPreferences` | profile/smart-profile (tabs) - `views/my-profile-slice-tab.ts` (`ensureUiPreferencesLoaded`) |
| `PUT /user-intelligence/preferences` | `updateUserPreferences` | profile/smart-profile (tabs) - `views/my-profile-preferences-save.ts` (`sendUiPreferencesSave`) |
| `GET /user-intelligence/goals` | `getUserGoals` | profile/smart-profile (tabs) - `views/my-profile-slice-tab.ts` (`ensureUiGoalsLoaded`) |
| `PUT /user-intelligence/goals` | `updateUserGoal` | profile/smart-profile (tabs) - `views/my-profile-goals-save.ts` (`sendUiGoalsSave`) |
| `GET /user-intelligence/energy` | `getEnergyProfile` | profile/smart-profile (tabs) - `views/my-profile-slice-tab.ts` (`ensureUiEnergyLoaded`) |
| `PUT /user-intelligence/energy` | `updateEnergyProfile`, `updateEnergyLevel` | profile/smart-profile (tabs) - `views/my-profile-energy-save.ts` (`sendUiEnergySave`)<br>DASHBOARD step (section dashboard) - `views/dashboard.ts` (`dashboardStore.saveCheckIn`) |
| `GET /user-intelligence/distractions` | `listUserDistractions` | profile/smart-profile (tabs) - `views/my-profile-slice-tab.ts` (`ensureUiDistractionsLoaded`) |
| `POST /user-intelligence/distractions` | `recordUserDistraction` | profile/smart-profile (tabs) - `views/my-profile-distractions-save.ts` (`sendUiDistractionSave`) |
| `GET /user-intelligence/habits` | `getHabitProfile` | profile/smart-profile (tabs) - `views/my-profile-slice-tab.ts` (`ensureUiHabitsLoaded`) |
| `PUT /user-intelligence/habits` | `updateHabitProfile`, `updateSleepHabit` | profile/smart-profile (tabs) - `views/my-profile-habits-save.ts` (`sendUiHabitsSave`)<br>DASHBOARD step (section dashboard) - `views/dashboard.ts` (`dashboardStore.saveCheckIn`) |

## conversation

| Endpoint | Client method | UI page |
|---|---|---|
| `POST /conversation/start` | `startConversation` | CHAT step (section chat) - `views/chat.ts` (direct call) |
| `POST /conversation/continue` | `continueConversation` | CHAT step (section chat) - `views/chat.ts` (direct call) |
| `GET /conversation/{conversation_id}` | `getConversation` | CHAT step (section chat) - `views/chat.ts` (`restoreConversation` -> state/conversation-restore.ts) |

## other (no router tag)

| Endpoint | Client method | UI page |
|---|---|---|
| `GET /healthz` | **NONE** | **Intentionally no page** - health check. Used by the Docker HEALTHCHECK, no screen needs it. |

## Endpoints with no page (all intentional; no open TODO)

| Endpoint | Reason | Kind |
|---|---|---|
| `GET /healthz` | Health check for Docker, no screen needs it | Intentional |
| `GET /planning-proposals/{proposal_id}` | `getPlanningProposal` is never called by any view/state module (decided in 21e fix 5: keep the client method, no UI; see its row above) | Intentional, kept as typed client. The one possible use, not built: re-sync an item after a 409 on accept/edit/reject. |

## UNVERIFIED

None. Every other row has a view that calls the method (or the store function that calls it). The check was static. If you want to re-run the core of the evidence yourself:

```
grep -rnE "apiClient\.(getPlanningProposal)" frontend/src --include=*.ts | grep -v "src/api/client.ts"
grep -rnE "apiClient\.[A-Za-z]+" frontend/src/views --include=*.ts
```
(the first prints nothing, which is how the one unused method was found; since 21e it is also checked by `smoke/api-client-usage.test.ts`. The second lists the direct `apiClient` uses in views: auth, chat, context, dashboard, goal-creation, planning-required, profile-account; the hits in daily-plan.ts and next-action-now.ts are comments only.)

## Notes
- Several methods appear on more than one page (for example `getGoalTree`, `listGoals`, `startFocus`, `getDailyPlan`, `convertTaskToNextAction`, `setNextActionDone`). All are listed.
- Registry sub-routes with no endpoint of their own (nothing to map): `plan/next-actions` (placeholder that points to Planning required), `profile/appearance`, and the disabled `llmAssignment` item.
- `CONTEXT_SETUP`, `GOAL_CREATION`, `DECOMPOSITION`, `GOAL_WORKSPACE`, `PLANNING_REQUIRED`, `FOCUS_EXECUTION`, `FOCUS_FEEDBACK` and `DASHBOARD` are journey steps, not registry sub-routes.
