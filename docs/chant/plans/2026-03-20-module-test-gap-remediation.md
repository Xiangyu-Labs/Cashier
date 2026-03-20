# Module Test Gap Remediation Implementation Plan

> **For agentic workers:** REQUIRED SKILL: Use $chant to carry this work through debugging or discussion if needed, then plan repair, staged execution, independent review, full verification, merge to the target branch, and delegated-worktree cleanup when applicable.

**Goal:** Fill the approved test gaps across `src/modules/*` on `chore/module-test-gap-audit` using delegated worktrees and merge all completed test work back into that branch only.

**Architecture:** The controller branch and controller worktree stay at `/root/workspace/Cashier-worktrees/chore-module-test-gap-audit`. Each module or module-group chunk executes in its own branch and worktree with one implementer owner. Direct module tests are preferred over broad route-level tests; integration tests are added only where the module behavior depends on persistence, concurrency, or external side effects.

**Tech Stack:** TypeScript, Next.js, Vitest, Testing Library, Drizzle, Git worktree

**Execution Topology:** `delegated`

**Target Branch:** `chore/module-test-gap-audit`

---

## Context and boundaries

- In scope:
  - Add missing tests for `auth`, `currency`, `ledger`, `source-document`, `stats`, `task-queue`, and `workspace`.
  - Use one controller worktree and multiple delegated worktrees.
  - Merge all chunk branches back into `chore/module-test-gap-audit`.
- Out of scope:
  - Production behavior changes unrelated to enabling or stabilizing tests.
  - Merge into `main`.
  - Reverting unrelated user changes.
- Assumptions:
  - The controller worktree exists and is the only integration point.
  - The delegated worktrees can share the controller `node_modules` through symlinks.
  - Direct tests are higher priority than additional route-wrapper smoke coverage.

## Stage map

### Stage 0: Bootstrap controller baseline
- Goal: Make the controller worktree runnable and persist the audit artifacts.
- Why later stages depend on it: Every delegated worktree will branch from this baseline and use the same dependency set.
- Exit criteria:
  - `npm ci` completed in controller worktree.
  - Plan and audit summary docs are present.
  - Unit and integration baselines are recorded.
- Stage verification gate:
  - `npm ci`
  - `npm run test:unit`
  - `npm run test:integration`

### Stage 1: Parallel implementation batch A
- Goal: Fill the thinner but isolated module gaps first.
- Why later stages depend on it: These chunks establish shared testing patterns before the heavy integration modules land.
- Exit criteria:
  - `task-queue`, `stats`, `workspace`, `auth`, and `currency` chunks each have failing-first tests added and passing targeted verification.
  - Controller review is complete for each merged chunk.
- Stage verification gate:
  - Per-chunk targeted Vitest commands pass in delegated worktrees.
  - Controller reruns each affected chunk's targeted commands after merge.

### Stage 2: Parallel implementation batch B
- Goal: Fill the deepest integration-heavy gaps in `ledger` and `source-document`.
- Why later stages depend on it: These modules interact with most shared helpers, persistence rules, and external workflows.
- Exit criteria:
  - High-priority service/query/use-case/integration gaps for `ledger` and `source-document` are covered.
  - Controller review is complete for both merged chunks.
- Stage verification gate:
  - Per-chunk targeted Vitest commands pass in delegated worktrees.
  - Controller reruns the affected integration suites after merge.

### Stage 3: Final integration, review, and cleanup
- Goal: Validate the integrated controller branch and clean up delegated worktrees.
- Why later stages depend on it: This is the final state handoff on `chore/module-test-gap-audit`.
- Exit criteria:
  - Full unit, integration, and coverage commands pass.
  - Independent final review is approved or any valid findings are fixed and re-reviewed.
  - Delegated worktrees are removed and delegated branches are preserved.
- Stage verification gate:
  - `npm run test:unit`
  - `npm run test:integration`
  - `npm run test:coverage`

## Chunk map per stage

### Stage 0

| chunk_id | objective | write_scope | read_only_context | depends_on | verification_commands | quality_bar | review_mode |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `bootstrap-controller` | Install deps, persist plan/audit docs, record baseline | `docs/chant/plans/2026-03-20-module-test-gap-remediation.md`, `docs/testing/2026-03-20-module-test-gap-plan.md` | `package.json`, `vitest.config.ts`, `vitest.unit.config.ts`, current test tree | none | `npm ci`; `npm run test:unit`; `npm run test:integration` | No production code edits in this chunk | serial controller review |

### Stage 1

| chunk_id | objective | write_scope | read_only_context | depends_on | verification_commands | quality_bar | review_mode | branch_name | worktree_path | merge_order |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `task-queue` | Add direct tests for queue query, use-cases, hooks, and modal/card state | `src/modules/task-queue/**`, `tests/unit/hooks/use-task-queue-mutations.test.ts`, `tests/integration/task-queue/**` | `tests/integration/processing-tasks.test.ts`, `tests/integration/api/processing-tasks.test.ts` | `bootstrap-controller` | `npx vitest run src/modules/task-queue/application/queries/get-task-queue.test.ts`; `npx vitest run src/modules/task-queue/application/use-cases/cancel-task.test.ts src/modules/task-queue/application/use-cases/dismiss-task.test.ts`; `npx vitest run src/modules/task-queue/ui/useTaskQueue.test.ts src/modules/task-queue/ui/useTaskQueueMutations.test.ts src/modules/task-queue/ui/useTaskQueueModal.test.ts src/modules/task-queue/ui/QueueItemCard/useQueueItemActions.test.ts`; `npx vitest run tests/integration/task-queue/task-queue-actions.test.ts` | Must test real hook/query logic, not stub replacement helpers | controller review | `chunk/task-queue-tests` | `/root/workspace/Cashier-worktrees/chunk-task-queue-tests` | `1` |
| `stats` | Add direct tests for enhanced stats query, heatmap color logic, and stats UI | `src/modules/stats/**`, `tests/integration/stats/**` | `tests/integration/stats-currency-conversion.test.ts`, `tests/integration/ledger/stats-actions.test.ts` | `bootstrap-controller` | `npx vitest run src/modules/stats/application/queries/get-enhanced-stats.test.ts`; `npx vitest run src/modules/stats/lib/heatmap-colors.test.ts`; `npx vitest run src/modules/stats/ui/AdaptiveHeatmap/index.test.tsx src/modules/stats/ui/CalendarHeatmapSection.test.tsx src/modules/stats/ui/StatsChart.test.tsx src/modules/stats/ui/StatsHeader.test.tsx src/modules/stats/ui/StatsRanking.test.tsx`; `npx vitest run tests/integration/stats/enhanced-stats.test.ts tests/integration/stats-soft-delete.test.ts` | Multi-currency, soft-delete, and heatmap/grid branches must be asserted directly | controller review | `chunk/stats-tests` | `/root/workspace/Cashier-worktrees/chunk-stats-tests` | `2` |
| `workspace` | Add direct tests for bootstrap query and page orchestration/state hooks | `src/modules/workspace/**`, `tests/unit/features/workspace/**`, `tests/unit/hooks/useDetailsTabFilters.test.ts` | Existing `workspace` and `ledger` feature tests | `bootstrap-controller` | `npx vitest run tests/unit/features/workspace/get-ledger-page-bootstrap.test.ts`; `npx vitest run src/modules/workspace/ledger-url-navigation.test.ts`; `npx vitest run src/modules/workspace/ui/LedgerPageClient.test.tsx src/modules/workspace/ui/useLedgerPagePrefetching.test.ts src/modules/workspace/ui/useLedgerEntriesTabState.test.ts src/modules/workspace/ui/useDetailsTabState.test.ts src/modules/workspace/ui/useLedgerDialogState.test.ts` | Tab/page/prefetch/dialog behavior cannot remain implicitly covered only by helper tests | controller review | `chunk/workspace-tests` | `/root/workspace/Cashier-worktrees/chunk-workspace-tests` | `3` |
| `auth` | Add direct tests for session query, notifications, OTP verification, and send/authenticate failure paths | `src/modules/auth/**`, `tests/unit/features/auth/**`, `tests/integration/auth/**` | Existing `auth` unit and integration suites | `bootstrap-controller` | `npx vitest run src/modules/auth/application/queries/get-session-user.test.ts`; `npx vitest run src/modules/auth/services/notifications.test.ts src/modules/auth/services/otp-verification.test.ts`; `npx vitest run src/modules/auth/application/use-cases/send-otp.test.ts src/modules/auth/application/use-cases/authenticate-with-otp.more.test.ts src/modules/auth/application/use-cases/registration-policy.test.ts`; `npx vitest run src/modules/auth/actions.test.ts tests/integration/auth/send-otp-edge-cases.test.ts` | Host/IP/config/fail-open behavior must be asserted, not only mocked wiring | controller review | `chunk/auth-tests` | `/root/workspace/Cashier-worktrees/chunk-auth-tests` | `4` |
| `currency` | Add direct tests for conversion fallbacks, helpers, and display behavior | `src/modules/currency/**`, `tests/integration/currency-fallbacks.test.ts` | Existing currency and related ledger/stats integration tests | `bootstrap-controller` | `npx vitest run src/modules/currency/application/use-cases/convert-currency.test.ts`; `npx vitest run src/modules/currency/exchange-rate-helpers.test.ts src/modules/currency/useAmountDisplay.test.ts src/modules/currency/ui/AmountDisplay.test.tsx`; `npx vitest run tests/integration/currency-fallbacks.test.ts` | Missing-rate and same-currency branches must be covered directly | controller review | `chunk/currency-tests` | `/root/workspace/Cashier-worktrees/chunk-currency-tests` | `5` |

### Stage 2

| chunk_id | objective | write_scope | read_only_context | depends_on | verification_commands | quality_bar | review_mode | branch_name | worktree_path | merge_order |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ledger` | Add direct tests for high-risk queries, services, hooks, and concurrency/rollback integrations | `src/modules/ledger/**`, `tests/integration/ledger/**`, `tests/integration/ledger-create-limit.test.ts` | Existing ledger action and integration suites | `bootstrap-controller`, `currency`, `workspace` | `npx vitest run src/modules/ledger/application/queries/get-ledger-entry-detail.test.ts src/modules/ledger/application/queries/calculate-ledger-stats.test.ts src/modules/ledger/application/queries/list-ledger-entries.test.ts src/modules/ledger/application/queries/list-entry-categories.test.ts src/modules/ledger/application/queries/list-service-credentials.test.ts`; `npx vitest run src/modules/ledger/application/services/authenticate-service-credential.test.ts src/modules/ledger/application/services/resolve-ledger-for-service-credential.test.ts`; `npx vitest run src/modules/ledger/application/use-cases/create-default-ledger.test.ts src/modules/ledger/application/use-cases/submit-categorize-tasks.test.ts`; `npx vitest run src/modules/ledger/credential-access.test.ts src/modules/ledger/hooks/useBatchEntryActions.test.ts src/modules/ledger/hooks/useCredentialMutations.test.ts src/modules/ledger/hooks/useEntryMutations.test.ts src/modules/ledger/hooks/useLedgerSettings.test.ts`; `npx vitest run tests/integration/ledger/ledger-single-owner-race-and-rollback.test.ts tests/integration/ledger/source-document-linkage.test.ts` | Single-ledger constraint, rollback, credential access, and source-document linkage must be validated with real persistence flows | controller review | `chunk/ledger-tests` | `/root/workspace/Cashier-worktrees/chunk-ledger-tests` | `6` |
| `source-document` | Add direct tests for create/queue, processing/query layer, detail/cache hooks, and R2 fallback | `src/modules/source-document/**`, `tests/unit/source-document/**`, `tests/integration/source-document/**`, `tests/integration/api/source-document*.test.ts` | Existing source-document pipeline and integration suites | `bootstrap-controller`, `task-queue`, `ledger` | `npx vitest run src/modules/source-document/application/use-cases/create-and-queue-source-document.test.ts src/modules/source-document/application/use-cases/create-from-credential.test.ts src/modules/source-document/application/use-cases/create-quick-entry.test.ts src/modules/source-document/application/use-cases/retry-source-document.test.ts`; `npx vitest run src/modules/source-document/application/queries/source-document-queries.test.ts src/modules/source-document/grouping.test.ts`; `npx vitest run tests/unit/source-document/services/process-images.test.ts tests/unit/source-document/hooks/useSourceDocumentDetailData.test.ts tests/unit/source-document/hooks/useSourceDocumentRecordMutations.test.ts tests/unit/source-document/hooks/useSourceDocumentEntryMutations.test.ts`; `npx vitest run tests/integration/source-document/r2-fallback-and-delete-failures.test.ts` | Task enqueueing, storage fallback, delete failure logging, and cache consistency must be proven directly | controller review | `chunk/source-document-tests` | `/root/workspace/Cashier-worktrees/chunk-source-document-tests` | `7` |

## Task steps

1. Controller bootstrap
   - Save this file.
   - Save the audit summary doc at `docs/testing/2026-03-20-module-test-gap-plan.md`.
   - Run `npm ci` in `/root/workspace/Cashier-worktrees/chore-module-test-gap-audit`.
   - Run baseline `npm run test:unit` and `npm run test:integration`.
   - If baseline fails, capture failures and keep them visible for every implementer prompt.

2. Delegated worktree preparation
   - Create chunk branches from `chore/module-test-gap-audit`.
   - Create the chunk worktrees listed above.
   - In each delegated worktree, link `node_modules` back to the controller worktree before handing work to an implementer.

3. TDD steps for every implementer
   - Add or extend the target test file first.
   - Run the smallest relevant command and observe the expected failure.
   - Implement the minimum production/test-fixture changes needed.
   - Re-run the targeted command until it passes.
   - Do not edit files outside `write_scope`.

4. Controller integration steps
   - Review the implementer diff and test scope.
   - Merge or cherry-pick the chunk branch into `chore/module-test-gap-audit`.
   - Re-run that chunk's verification commands in the controller worktree.
   - If findings exist, send them back to the implementer branch for repair and re-review.

5. Final integration steps
   - After all chunks are merged, run `npm run test:unit`.
   - Run `npm run test:integration`.
   - Run `npm run test:coverage`.
   - Spawn one final independent reviewer on a separate review worktree if any integrated risk remains unclear.

## Review loop

- Controller review is the default chunk review path.
- For each chunk:
  - Implementer finishes and reports exact files and commands.
  - Controller reviews for correctness, regression risk, scope discipline, and test adequacy.
  - If valid findings exist, the implementer fixes them on the same chunk branch.
  - Controller re-reviews and only then integrates.
- Final review:
  - One independent reviewer agent reviews the fully integrated controller branch.
  - Findings must be fixed on `chore/module-test-gap-audit`.
  - Re-review runs if fixes touch risky shared helpers or integration fixtures.

## Final integration

- Integration branch: `chore/module-test-gap-audit`
- Merge order:
  1. `chunk/task-queue-tests`
  2. `chunk/stats-tests`
  3. `chunk/workspace-tests`
  4. `chunk/auth-tests`
  5. `chunk/currency-tests`
  6. `chunk/ledger-tests`
  7. `chunk/source-document-tests`
- Post-merge verification:
  - `npm run test:unit`
  - `npm run test:integration`
  - `npm run test:coverage`
- Stop on `chore/module-test-gap-audit`. Do not merge to `main`.

## Cleanup

- Remove delegated worktrees after final verification:
  - `/root/workspace/Cashier-worktrees/chunk-task-queue-tests`
  - `/root/workspace/Cashier-worktrees/chunk-stats-tests`
  - `/root/workspace/Cashier-worktrees/chunk-workspace-tests`
  - `/root/workspace/Cashier-worktrees/chunk-auth-tests`
  - `/root/workspace/Cashier-worktrees/chunk-currency-tests`
  - `/root/workspace/Cashier-worktrees/chunk-ledger-tests`
  - `/root/workspace/Cashier-worktrees/chunk-source-document-tests`
- Preserve all chunk branches unless deletion is explicitly requested.
- Keep the controller worktree and `chore/module-test-gap-audit`.

## Delegation guardrails

- Delegated execution is allowed because the user explicitly requested multiple agents in different worktrees and the write scopes are separable.
- Parallel ceiling:
  - Stage 1: 5 implementers in parallel
  - Stage 2: 2 implementers in parallel
  - Optional 1 final reviewer
  - Total never exceeds 10 active agents
- Fallback if delegation becomes unavailable:
  - Controller executes the same chunks serially in this exact order.
  - Scope, TDD, review, and verification do not shrink.
