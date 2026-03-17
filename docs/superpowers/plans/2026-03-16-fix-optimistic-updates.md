# Fix Optimistic Update Flickering - Implementation Plan

> **For agentic workers:** REQUIRED: Use @superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the optimistic update flickering issue when users toggle settings by removing the conflict between Next.js unstable_cache and React Query's optimistic updates.

**Architecture:** Remove the redundant `unstable_cache` layer from Server Actions since React Query's client-side caching already handles caching effectively. Modify `useLedgerMutation` to only invalidate queries when mutations don't return data, preventing unnecessary refetches that overwrite optimistic updates.

**Tech Stack:** Next.js 16, React Query (TanStack Query), TypeScript, Drizzle ORM

---

## Chunk 1: Add Cache Revalidation to updateLedgerAction

### Task 1.1: Read current updateLedgerAction implementation

**Files:**
- Read: `src/features/ledger/server/actions/update.ts`

- [ ] **Step 1: Read the file**

Run: `cat src/features/ledger/server/actions/update.ts`

Expected: File contains `updateLedgerAction` using `withAuth` wrapper, updates ledger in database, but does NOT import or call `revalidateTag`.

---

### Task 1.2: Add revalidateTag to updateLedgerAction

**Files:**
- Modify: `src/features/ledger/server/actions/update.ts`

- [ ] **Step 1: Add import for revalidateTag**

Add at the top of the file with other imports:
```typescript
import { revalidateTag } from "next/cache";
```

- [ ] **Step 2: Add revalidateTag call after successful update**

After line 43 (after `.returning()` and before the currency change check), add:
```typescript
    // Revalidate cache to ensure fresh data on next request
    revalidateTag('ledger');
```

The final code should look like:
```typescript
    const [updatedLedger] = await db
        .update(ledgers)
        .set({
            name: validated.name || existing.name,
            metadata: {
                ...currentMetadata,
                settings: newSettings,
            }
        })
        .where(eq(ledgers.id, id))
        .returning();

    // Revalidate cache to ensure fresh data on next request
    revalidateTag('ledger');

    // If main currency changed, recalculate all entries' convertedAmount
    if (newMainCurrency && newMainCurrency !== oldMainCurrency) {
```

- [ ] **Step 3: Verify the changes**

Run: `grep -n "revalidateTag" src/features/ledger/server/actions/update.ts`

Expected output: Shows the import and the call to revalidateTag

- [ ] **Step 4: Commit**

```bash
git add src/features/ledger/server/actions/update.ts
git commit -m "fix: add revalidateTag to updateLedgerAction for cache consistency"
```

---

## Chunk 2: Remove unstable_cache from getLedgerAction

### Task 2.1: Read current getLedgerAction implementation

**Files:**
- Read: `src/features/ledger/server/actions/get.ts`

- [ ] **Step 1: Read the file**

Run: `cat src/features/ledger/server/actions/get.ts`

Expected: File contains `cachedGetLedger` and `cachedGetLedgers` using `unstable_cache`, with 60-second revalidation.

---

### Task 2.2: Replace cached version with direct query

**Files:**
- Modify: `src/features/ledger/server/actions/get.ts`

- [ ] **Step 1: Remove unstable_cache import and wrapper functions**

Delete lines 7 (the import) and lines 10-35 (the cachedGetLedger wrapper) and lines 43-65 (the cachedGetLedgers wrapper).

- [ ] **Step 2: Replace getLedgerAction with direct query**

Replace the entire file content with:
```typescript
"use server";

import { db } from "@/lib/db";
import { ledgers } from "@/lib/db/schema";
import { withAuth } from "@/lib/auth-actions";
import { eq, and, isNull, desc } from "drizzle-orm";

export const getLedgerAction = withAuth(async (userId: string, id: string): Promise<import("@/types/api").Ledger | null> => {
    const existing = await db.query.ledgers.findFirst({
        where: and(eq(ledgers.id, id), isNull(ledgers.deletedAt)),
    });

    if (!existing || existing.userId !== userId) {
        return null;
    }

    return {
        id: existing.id,
        userId: existing.userId,
        name: existing.name,
        metadata: existing.metadata,
        createdAt: existing.createdAt.toISOString(),
        updatedAt: existing.updatedAt.toISOString(),
        deletedAt: existing.deletedAt ? existing.deletedAt.toISOString() : null,
    };
});

export const getLedgersAction = withAuth(async (userId: string): Promise<import("@/types/api").Ledger[]> => {
    const rows = await db.query.ledgers.findMany({
        where: and(eq(ledgers.userId, userId), isNull(ledgers.deletedAt)),
        orderBy: [desc(ledgers.createdAt)],
    });

    return rows.map(row => ({
        id: row.id,
        userId: row.userId,
        name: row.name,
        metadata: row.metadata,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    }));
});
```

- [ ] **Step 3: Verify the changes**

Run: `grep -n "unstable_cache" src/features/ledger/server/actions/get.ts`

Expected: No output (unstable_cache removed)

Run: `wc -l src/features/ledger/server/actions/get.ts`

Expected: Around 45 lines (reduced from 70 lines)

- [ ] **Step 4: Commit**

```bash
git add src/features/ledger/server/actions/get.ts
git commit -m "refactor: remove unstable_cache from ledger actions

React Query client-side caching is sufficient. Removing the
additional Next.js cache layer eliminates the cache invalidation
conflict causing optimistic update flickering."
```

---

## Chunk 3: Modify useLedgerMutation to Skip Unnecessary Invalidation

### Task 3.1: Read current useLedgerMutation implementation

**Files:**
- Read: `src/lib/mutations/use-ledger-mutation.ts`

- [ ] **Step 1: Read the file**

Run: `cat src/lib/mutations/use-ledger-mutation.ts`

Expected: File contains the `onSettled` callback that always calls `invalidateQueries` when `!skipInvalidation`.

---

### Task 3.2: Modify onSettled to only invalidate when data is undefined

**Files:**
- Modify: `src/lib/mutations/use-ledger-mutation.ts:187-201`

- [ ] **Step 1: Replace the onSettled callback**

Replace lines 187-201 with:
```typescript
    onSettled: async (data, error, variables) => {
      // Only invalidate queries if the mutation doesn't return data
      // or if skipInvalidation is false. When mutation returns data,
      // onSuccessExtra should handle cache updates directly.
      if (!skipInvalidation && !error && data === undefined) {
        if (customInvalidation) {
          customInvalidation(queryClient);
        } else if (ledgerId) {
          await queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
        }
      }

      // Run additional settled callback
      if (onSettledExtra) {
        onSettledExtra(queryClient, variables, data, error);
      }
    },
```

- [ ] **Step 2: Verify the changes**

Run: `grep -A 10 "onSettled:" src/lib/mutations/use-ledger-mutation.ts`

Expected: Shows the new logic with `data === undefined` check

- [ ] **Step 3: Commit**

```bash
git add src/lib/mutations/use-ledger-mutation.ts
git commit -m "fix: skip invalidation when mutation returns data

Prevents optimistic update flickering by not invalidating queries
when the mutation returns data (which should be set directly to
cache by onSuccessExtra)."
```

---

## Chunk 4: Add Test for Optimistic Update Behavior

### Task 4.1: Create test file

**Files:**
- Create: `tests/unit/lib/mutations/use-ledger-mutation.test.ts`

- [ ] **Step 1: Create the test file**

Create `tests/unit/lib/mutations/use-ledger-mutation.test.ts` with:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

interface TestData {
  id: string;
  name: string;
}

interface TestVariables {
  name: string;
}

describe("useLedgerMutation", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it("should NOT invalidate queries when mutation returns data", async () => {
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    const mutationFn = vi.fn().mockResolvedValue({ id: "1", name: "Test" } as TestData);

    const { result } = renderHook(
      () =>
        useLedgerMutation<TestData, TestVariables>("ledger-1", {
          mutationFn,
          successMessage: "Success!",
        }),
      { wrapper }
    );

    await act(async () => {
      await result.current.mutateAsync({ name: "Test" });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // invalidateQueries should NOT be called when mutation returns data
    expect(invalidateQueriesSpy).not.toHaveBeenCalled();

    invalidateQueriesSpy.mockRestore();
  });

  it("should invalidate queries when mutation returns undefined", async () => {
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    const mutationFn = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(
      () =>
        useLedgerMutation<undefined, TestVariables>("ledger-1", {
          mutationFn,
          successMessage: "Success!",
        }),
      { wrapper }
    );

    await act(async () => {
      await result.current.mutateAsync({ name: "Test" });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // invalidateQueries SHOULD be called when mutation returns undefined
    expect(invalidateQueriesSpy).toHaveBeenCalled();

    invalidateQueriesSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run the test to ensure it passes**

Run: `npx vitest run tests/unit/lib/mutations/use-ledger-mutation.test.ts`

Expected: Tests pass (both scenarios work correctly)

- [ ] **Step 3: Commit**

```bash
git add tests/unit/lib/mutations/use-ledger-mutation.test.ts
git commit -m "test: add tests for useLedgerMutation invalidation behavior"
```

---

## Chunk 5: Run Full Test Suite

### Task 5.1: Run all tests

- [ ] **Step 1: Run the full test suite**

Run: `npm run test:run`

Expected: All tests pass. Pay special attention to:
- `tests/unit/components/SettingsTab.test.tsx` (tests settings updates)
- Any tests related to ledger mutations

- [ ] **Step 2: Run the build to ensure no type errors**

Run: `npm run build`

Expected: Build succeeds with no errors

- [ ] **Step 3: Final commit**

```bash
git commit --allow-empty -m "fix: resolve optimistic update flickering

- Add revalidateTag to updateLedgerAction for immediate cache invalidation
- Remove unstable_cache from getLedgerAction to eliminate double caching
- Modify useLedgerMutation to skip invalidation when mutation returns data
- Add tests to verify the new behavior

This fixes the issue where toggling settings would briefly show the
old value before showing the new value (flickering)."
```

---

## Verification Checklist

After implementation, verify:

- [ ] **Manual test in browser:**
  1. Open ledger settings
  2. Toggle "Collapse entries by default" switch
  3. Verify the switch stays in the new position without flickering back
  4. Verify success toast appears
  5. Refresh page and verify the setting persisted

- [ ] **Network tab verification:**
  1. Open browser dev tools, Network tab
  2. Toggle a setting
  3. Verify NO additional GET request is made immediately after the mutation
  4. (Previously there would be a GET request that returned stale data)

- [ ] **Test coverage:**
  - `npm run test:run` passes
  - New test file exists and passes
  - No regressions in existing tests

---

## Rollback Plan

If issues occur:

1. **Revert commits:**
   ```bash
   git revert HEAD~4..HEAD
   ```

2. **Alternative minimal fix** (if full solution has issues):
   - Keep `unstable_cache` but reduce revalidation time to 1 second
   - Or add `revalidateTag` calls to ALL mutation actions (not just updateLedgerAction)
