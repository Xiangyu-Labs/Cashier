# Cache Policy Unification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace ad-hoc optimistic updates with a single policy-driven mutation layer for ledger-related caches.

**Architecture:** Introduce a unified mutation hook that centralizes cancel/snapshot/optimistic/rollback/invalidate. Define domain cache policies (ledger entries, source documents, task queue) that the hook consumes so business hooks stop mutating cache directly.

**Tech Stack:** TanStack Query, Next.js client hooks, existing `queryKeys` and `invalidateLedgerCache`.

---

### Task 1: Define cache policy interface

**Files:**
- Modify: `src/lib/mutations/use-ledger-mutation.ts`
- Create: `src/lib/mutations/cache-policies.ts`

**Step 1: Write the failing test**

No new tests for policy shape. This is internal refactor only.

**Step 2: Run test to verify it fails**

Skip.

**Step 3: Write minimal implementation**

Define a policy interface that includes:

```ts
export type LedgerMutationPolicy<TVariables, TContext> = {
  cancel: (queryClient: QueryClient, variables: TVariables) => Promise<void>;
  snapshot: (queryClient: QueryClient, variables: TVariables) => TContext;
  optimistic: (queryClient: QueryClient, variables: TVariables) => void;
  rollback: (queryClient: QueryClient, context: TContext) => void;
  invalidate: (queryClient: QueryClient, variables: TVariables) => void;
};
```

**Step 4: Run test to verify it passes**

Skip.

**Step 5: Commit**

Skip.

---

### Task 2: Implement unified mutation hook (breaking)

**Files:**
- Modify: `src/lib/mutations/use-ledger-mutation.ts`
- Modify: `src/lib/mutations/index.ts`

**Step 1: Write the failing test**

No new tests for hook refactor.

**Step 2: Run test to verify it fails**

Skip.

**Step 3: Write minimal implementation**

Replace the existing options with:

```ts
type UseLedgerMutationOptions<TData, TVariables, TContext> = {
  mutationFn: (variables: TVariables) => Promise<TData>;
  policy: LedgerMutationPolicy<TVariables, TContext>;
  successMessage?: string;
  errorMessage?: string;
  onSuccessExtra?: (data: TData, variables: TVariables) => void;
  onErrorExtra?: (error: Error, variables: TVariables) => void;
};
```

Implement lifecycle:

1) `policy.cancel` → 2) `policy.snapshot` → 3) `policy.optimistic` → 4) `policy.rollback` on error → 5) `policy.invalidate` on settled.

**Step 4: Run test to verify it passes**

Skip.

**Step 5: Commit**

Skip.

---

### Task 3: Add cache policy helpers

**Files:**
- Create: `src/lib/mutations/cache-policies.ts`

**Step 1: Write the failing test**

No tests. Policies are deterministic transformations.

**Step 2: Run test to verify it fails**

Skip.

**Step 3: Write minimal implementation**

Implement policies:

1) Ledger entries policy
```ts
updateEntryPolicy({ ledgerId, categories })
deleteEntryPolicy({ ledgerId })
```

2) Unified source documents policy
```ts
updateSourceDocEntryPolicy({ ledgerId, categories })
deleteSourceDocEntryPolicy({ ledgerId })
deleteSourceDocPolicy({ ledgerId })
```

3) Task queue policy
```ts
removeTaskItemsPolicy({ ledgerId })
retryTaskItemsPolicy({ ledgerId })
```

Each policy:
- Cancels with `invalidateLedgerCache(ledgerId)`
- Snapshots via `getQueriesData({ queryKey: queryKeys.sourceDocuments(ledgerId) })` or exact keys
- Optimistic update uses `setQueriesData`
- Rollback restores snapshot array
- Invalidate uses `invalidateLedgerCache(ledgerId)` or specific keys

**Step 4: Run test to verify it passes**

Skip.

**Step 5: Commit**

Skip.

---

### Task 4: Migrate ledger entry mutations

**Files:**
- Modify: `src/features/ledger/client/hooks/useEntryMutations.ts`
- Modify: `src/features/ledger/client/hooks/useLedgerEntriesMutations.ts`

**Step 1: Write the failing test**

No tests. Behavior should stay the same.

**Step 2: Run test to verify it fails**

Skip.

**Step 3: Write minimal implementation**

Replace `useMutation` with `useLedgerMutation` using the new policies. Remove direct cache writes and rollback code from these hooks. Keep toast and modal logic in `onSuccessExtra`.

**Step 4: Run test to verify it passes**

Skip.

**Step 5: Commit**

Skip.

---

### Task 5: Migrate task queue mutations

**Files:**
- Modify: `src/features/task-queue/client/hooks/useTaskQueueMutations.ts`

**Step 1: Write the failing test**

No tests. Behavior should stay the same.

**Step 2: Run test to verify it fails**

Skip.

**Step 3: Write minimal implementation**

Use `useLedgerMutation` with task queue policies. Remove duplicated cancel/invalidate calls in onSettled and local cache mutation helpers.

**Step 4: Run test to verify it passes**

Skip.

**Step 5: Commit**

Skip.

---

### Task 6: Migrate remaining ledger/source-document mutations

**Files:**
- Modify: `src/features/source-document/components/SourceDocumentDetailWrapper.tsx`
- Modify: `src/features/source-document/components/SourceDocumentInput.tsx`

**Step 1: Write the failing test**

No tests. Behavior should stay the same.

**Step 2: Run test to verify it fails**

Skip.

**Step 3: Write minimal implementation**

Replace any direct `useMutation` + cache writes with the unified hook + policies.

**Step 4: Run test to verify it passes**

Skip.

**Step 5: Commit**

Skip.

---

### Task 7: Verification

**Files:**
- None

**Step 1: Run lint**

Run: `npm run lint`
Expected: no errors

**Step 2: Run tests**

Run: `npm run test:run`
Expected: all tests pass

**Step 3: Commit**

Skip (unless user asks).
