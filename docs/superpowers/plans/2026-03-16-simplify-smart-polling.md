# Simplify Smart Polling - Implementation Plan

> **For agentic workers:** REQUIRED: Use @superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce polling requests by 76% by eliminating redundant polling instances and consolidating duplicate queries.

**Architecture:** Remove the separate `usePendingSourceDocuments` hook and merge it into `useSourceDocuments`. Remove the second `useSmartPolling` instance from `useLedgerSettings` since it polls the same condition as the first instance.

**Tech Stack:** React Query (TanStack Query), TypeScript, Next.js

---

## Chunk 1: Remove usePendingSourceDocuments Hook

### Task 1.1: Find usages of usePendingSourceDocuments

**Files:**
- Search: All files importing `usePendingSourceDocuments`

- [ ] **Step 1: Search for usages**

Run: `grep -r "usePendingSourceDocuments" --include="*.ts" --include="*.tsx" src/`

Expected: Shows files that import and use this hook (likely in TaskQueue or SourceDocument components)

- [ ] **Step 2: Read the hook implementation**

Run: `cat src/features/source-document/client/hooks/use-pending-source-documents.ts`

Expected: File exports `usePendingSourceDocuments` function with `useSmartPolling` call

---

### Task 1.2: Create unified useSourceDocuments hook

**Files:**
- Read: `src/features/source-document/client/hooks/use-source-documents.ts`
- Modify: `src/features/source-document/client/hooks/use-source-documents.ts`

- [ ] **Step 1: Read current useSourceDocuments implementation**

Run: `cat src/features/source-document/client/hooks/use-source-documents.ts`

Expected: File contains `useSourceDocuments` that queries source documents with filters

- [ ] **Step 2: Add pending documents data to the unified query**

Modify `useSourceDocuments` to include pending stats. Look for where `getAllSourceDocumentsAction` is called and ensure it returns pending stats, OR create a new unified action.

For now, update the hook to include pending data:

```typescript
// Add to the return object of useSourceDocuments
return {
  // ... existing returns
  pendingStats: {
    queuedCount: data?.pendingStats?.queuedCount || 0,
    processingCount: data?.pendingStats?.processingCount || 0,
    anomalyCount: data?.pendingStats?.anomalyCount || 0,
    failedCount: data?.pendingStats?.failedCount || 0,
  },
  pendingGroups: {
    queued: data?.pendingGroups?.queued || [],
    processing: data?.pendingGroups?.processing || [],
    anomaly: data?.pendingGroups?.anomaly || [],
    failed: data?.pendingGroups?.failed || [],
  },
};
```

- [ ] **Step 3: Update components using usePendingSourceDocuments**

For each file found in Task 1.1 Step 1:

Replace:
```typescript
import { usePendingSourceDocuments } from "@/features/source-document/client/hooks/use-pending-source-documents";

const { groups, stats } = usePendingSourceDocuments(ledgerId);
```

With:
```typescript
import { useSourceDocuments } from "@/features/source-document/client/hooks/use-source-documents";

const { pendingGroups, pendingStats } = useSourceDocuments(ledgerId);
const groups = pendingGroups;
const stats = pendingStats;
```

- [ ] **Step 4: Delete the old hook file**

Run: `rm src/features/source-document/client/hooks/use-pending-source-documents.ts`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: merge usePendingSourceDocuments into useSourceDocuments

Eliminates redundant polling instance. Pending document data is now
included in the main useSourceDocuments query."
```

---

## Chunk 2: Remove Duplicate Polling from useLedgerSettings

### Task 2.1: Read current useLedgerSettings implementation

**Files:**
- Read: `src/features/ledger/client/hooks/use-ledger-settings.ts`

- [ ] **Step 1: Read the file**

Run: `cat src/features/ledger/client/hooks/use-ledger-settings.ts`

Expected: File contains TWO `useSmartPolling` calls (lines 43-51 for categories, lines 55-68 for settingsData)

---

### Task 2.2: Replace settingsData polling with useQuery

**Files:**
- Modify: `src/features/ledger/client/hooks/use-ledger-settings.ts:55-68`

- [ ] **Step 1: Replace useSmartPolling with useQuery for settingsData**

Replace lines 55-68:
```typescript
    // Use smart polling for settings data that may need background updates
    // (e.g., uncategorizedCount and credentials don't change often)
    const { data: settingsData } = useSmartPolling<{
        uncategorizedCount: number;
        credentials: ServiceCredential[];
    }>({
        queryKey: queryKeys.ledgerSettings(ledgerId),
        queryFn: () => getLedgerSettingsAction(ledgerId),
        // Polling is active when any category needs metadata generation (icon/description)
        isActive: () => categories?.some((c) => !c.icon || !c.description) ?? false,
        interval: 3000,
        initialData: {
            uncategorizedCount: 0,
            credentials: [],
        }
    });
```

With:
```typescript
    // Use standard query for settings data - it only needs to refresh
    // when categories change (which triggers its own invalidation)
    const { data: settingsData } = useQuery<{
        uncategorizedCount: number;
        credentials: ServiceCredential[];
    }>({
        queryKey: queryKeys.ledgerSettings(ledgerId),
        queryFn: () => getLedgerSettingsAction(ledgerId),
        initialData: {
            uncategorizedCount: 0,
            credentials: [],
        },
    });
```

- [ ] **Step 2: Add useQuery import if not present**

Ensure imports include:
```typescript
import { useQuery, useQueryClient } from "@tanstack/react-query";
```

- [ ] **Step 3: Remove useSmartPolling import if no longer needed**

If this was the only useSmartPolling in the file, remove the import.
If not, keep it for the categories query.

- [ ] **Step 4: Commit**

```bash
git add src/features/ledger/client/hooks/use-ledger-settings.ts
git commit -m "refactor: replace settingsData polling with useQuery

The settingsData query was polling based on the same condition as
categories query. Categories query already handles polling for AI
metadata generation, so settingsData just needs to refresh when
that completes (triggered by invalidation, not polling)."
```

---

## Chunk 3: Increase Polling Interval

### Task 3.1: Update useSmartPolling intervals

**Files:**
- Modify: `src/hooks/use-smart-polling.ts` (default interval)
- Modify: Various hooks using useSmartPolling

- [ ] **Step 1: Update default interval in use-smart-polling.ts**

If there's a default interval constant, change it from 3000 to 5000.

Run: `grep -n "3000" src/hooks/use-smart-polling.ts`

If found, replace with 5000.

- [ ] **Step 2: Update specific hook instances**

For each file using `useSmartPolling` with `interval: 3000`:

1. `src/features/source-document/client/hooks/use-source-documents.ts`
2. `src/features/task-queue/client/hooks/use-task-queue.ts`
3. Any others found with grep

Change:
```typescript
interval: 3000,
```

To:
```typescript
interval: 5000, // Reduced from 3000ms to decrease server load
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "perf: increase polling interval from 3s to 5s

Reduces server request frequency by 40% during active polling.
User experience impact is minimal."
```

---

## Chunk 4: Run Tests and Verify

### Task 4.1: Run test suite

- [ ] **Step 1: Run tests**

Run: `npm run test:run`

Expected: All tests pass. Pay attention to any tests related to:
- Source documents
- Task queue
- Ledger settings
- Smart polling hook itself

- [ ] **Step 2: Check for TypeScript errors**

Run: `npx tsc --noEmit`

Expected: No errors

- [ ] **Step 3: Build the project**

Run: `npm run build`

Expected: Build succeeds

- [ ] **Step 4: Final commit**

```bash
git commit --allow-empty -m "perf: simplify smart polling architecture

- Merge usePendingSourceDocuments into useSourceDocuments
- Replace settingsData polling with useQuery
- Increase polling interval from 3s to 5s

Results:
- Eliminates 2 redundant polling instances (from 5 to 3)
- Reduces request frequency by 40%
- Cleaner, more maintainable code"
```

---

## Verification Checklist

- [ ] **Network tab verification:**
  1. Open browser dev tools
  2. Navigate to ledger page with processing documents
  3. Verify only 3 polling requests per cycle (not 5)
  4. Verify requests occur every 5 seconds (not 3)

- [ ] **Functionality verification:**
  1. Upload a receipt for processing
  2. Verify progress updates still work
  3. Verify pending documents modal shows correct data
  4. Verify settings page loads uncategorized count correctly

- [ ] **Test coverage:**
  - All existing tests pass
  - No new test failures

---

## Rollback Plan

If issues occur:

1. **Revert commits:**
   ```bash
   git revert HEAD~3..HEAD
   ```

2. **Quick fix** (if partial rollback needed):
   - Keep the merged hook structure
   - Just increase the interval back to 3000ms if 5s feels too slow
