# Deep Review Issues Fix Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 27 issues identified in the deep review report to improve code quality, performance, and maintainability.

**Architecture:** Group related fixes into logical batches to minimize conflicts and ensure coherent changes. Each fix is atomic and testable.

**Tech Stack:** Next.js 16, TypeScript, React Query, Zustand, Drizzle ORM, SQLite

---

## Overview

This plan addresses 27 issues found during deep review:
- **P0 (Critical):** 2 issues - mutation state isolation, auth error handling
- **P1 (High):** 8 issues - standard error classes, performance, security
- **P2 (Medium):** 12 issues - code quality, i18n, monitoring
- **P3 (Low):** 5 issues - naming conventions, consistency

---

## Chunk 1: Critical Fixes (P0)

### Task 1.1: Fix Global Mutation Counter Tenant Isolation

**Files:**
- Modify: `src/lib/store/mutation-state.ts`
- Modify: `src/hooks/use-smart-polling.ts`
- Modify: `src/lib/mutations/use-ledger-mutation.ts`

**Problem:** Global mutation counter violates tenant isolation - Ledger A's mutation pauses Ledger B's polling.

**Solution:** Replace global counter with ledger-scoped counter.

- [ ] **Step 1: Update mutation-state.ts store interface**

```typescript
interface MutationState {
    /** Per-ledger mutation counters */
    activeMutationsByLedger: Record<string, number>;
    /** Increment mutation count for specific ledger */
    incrementLedgerMutation: (ledgerId: string) => void;
    /** Decrement mutation count for specific ledger */
    decrementLedgerMutation: (ledgerId: string) => void;
    /** Check if specific ledger has active mutations */
    hasActiveLedgerMutation: (ledgerId: string) => boolean;
}
```

- [ ] **Step 2: Implement ledger-scoped store logic**

```typescript
export const useMutationStore = create<MutationState>((set, get) => ({
    activeMutationsByLedger: {},

    incrementLedgerMutation: (ledgerId: string) =>
        set((state) => ({
            activeMutationsByLedger: {
                ...state.activeMutationsByLedger,
                [ledgerId]: (state.activeMutationsByLedger[ledgerId] || 0) + 1
            }
        })),

    decrementLedgerMutation: (ledgerId: string) =>
        set((state) => {
            const current = state.activeMutationsByLedger[ledgerId] || 0;
            if (current <= 0) return state; // Prevent negative
            return {
                activeMutationsByLedger: {
                    ...state.activeMutationsByLedger,
                    [ledgerId]: current - 1
                }
            };
        }),

    hasActiveLedgerMutation: (ledgerId: string) => {
        return (get().activeMutationsByLedger[ledgerId] || 0) > 0;
    }
}));
```

- [ ] **Step 3: Update use-ledger-mutation.ts to pass ledgerId**

Modify lines 117, 137, 211:
```typescript
// Line 117: Pass ledgerId to store methods
const { incrementLedgerMutation, decrementLedgerMutation } = useMutationStore();

// Line 137: Increment with ledgerId
if (ledgerId) incrementLedgerMutation(ledgerId);

// Line 211: Decrement with ledgerId in finally block
if (ledgerId) decrementLedgerMutation(ledgerId);
```

- [ ] **Step 4: Update use-smart-polling.ts to use ledger-scoped check**

Modify to accept ledgerId and use `hasActiveLedgerMutation(ledgerId)`:
```typescript
interface SmartPollingOptions<TData, TError> extends Omit<UseQueryOptions<TData, TError>, 'refetchInterval'> {
    // ... existing options
    ledgerId: string; // Add this
}

// In hook:
const hasActiveLedgerMutation = useMutationStore((state) =>
    ledgerId ? state.hasActiveLedgerMutation(ledgerId) : () => false
);
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/unit/lib/query-keys.test.ts --reporter=verbose
```
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/lib/store/mutation-state.ts src/hooks/use-smart-polling.ts src/lib/mutations/use-ledger-mutation.ts
git commit -m "fix: use ledger-scoped mutation counters for tenant isolation"
```

---

### Task 1.2: Refactor Auth Actions to Throw Errors

**Files:**
- Modify: `src/features/auth/server/actions/auth.ts`
- Modify: All callers of sendOTPAction and verifyOTPAction

**Problem:** Auth actions return `{success, error}` objects instead of throwing errors, violating CLAUDE.md specification.

**Solution:** Convert to throw standard error classes.

- [ ] **Step 1: Update imports in auth.ts**

Add to imports:
```typescript
import { ValidationError, RateLimitError, UnauthorizedError } from "@/lib/errors";
```

- [ ] **Step 2: Replace return statements with throws in sendOTPAction**

Replace lines 30, 36, 42:
```typescript
// Before:
return { success: false, error: "Invalid email address" };

// After:
throw new ValidationError("Invalid email address");
```

Replace lines 55-59, 66-70, 77-81:
```typescript
// Before:
return { success: false, error: "...", retryAfter: ... };

// After:
const error = new RateLimitError("...");
(error as Error & { retryAfter: number }).retryAfter = retryAfter;
throw error;
```

Replace line 113:
```typescript
// Before:
return { success: false, error: "Failed to send..." };

// After:
throw new Error("Failed to send verification code");
```

Replace lines 124-129:
```typescript
// Before:
return { success: true, expiresIn, expiresAt, canResendAt };

// After:
return { expiresIn, expiresAt, canResendAt };
```

Replace line 132:
```typescript
// Before:
return { success: false, error: "Internal server error" };

// After:
throw new Error("Internal server error");
```

- [ ] **Step 3: Replace return statements with throws in verifyOTPAction**

Similar pattern for lines 140, 144, 149, 161, 168-171, 192-198, 202-206, 214.

Line 211:
```typescript
// Before:
return { success: true, email: normalizedEmail };

// After:
return { email: normalizedEmail };
```

- [ ] **Step 4: Update all callers**

Find and update all files that call `sendOTPAction` and `verifyOTPAction`:

Search:
```bash
grep -r "sendOTPAction\|verifyOTPAction" --include="*.tsx" --include="*.ts" src/
```

Update each caller to use try/catch instead of checking `result.success`.

- [ ] **Step 5: Run tests**

```bash
npx vitest run --reporter=verbose
```
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/features/auth/server/actions/auth.ts src/components/
git commit -m "refactor: auth actions throw errors instead of returning objects"
```

---

## Chunk 2: High Priority Fixes (P1)

### Task 2.1: Replace All `throw new Error()` with Standard Error Classes

**Files:**
- Modify: `src/features/source-document/server/actions/create.ts`
- Modify: `src/features/source-document/server/actions/quick-entry.ts`
- Modify: `src/features/ledger/server/actions/entries.ts`
- Modify: `src/features/ledger/server/actions/update.ts`
- Modify: `src/features/ledger/server/actions/credentials.ts`
- Modify: `src/features/task-queue/server/actions/cancel-task.ts`
- Modify: `src/features/task-queue/server/actions/dismiss-task.ts`
- Modify: `src/auth.ts`
- Modify: `src/features/source-document/server/actions/queries.ts`

- [ ] **Step 1: Update each file to use standard errors**

Example pattern for `src/features/source-document/server/actions/create.ts`:
```typescript
// Before:
throw new Error("At least one input (text or images) is required");

// After:
throw new ValidationError("At least one input (text or images) is required");

// Before:
throw new Error("Unauthorized or Ledger not found");

// After:
throw new UnauthorizedError("Unauthorized or Ledger not found");
```

- [ ] **Step 2: Run type check**

```bash
npx tsc --noEmit
```
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/
git commit -m "refactor: use standard error classes throughout codebase"
```

---

### Task 2.2: Fix Stats Query CPU-Intensive Processing

**Files:**
- Modify: `src/features/ledger/server/actions/stats.ts`

**Problem:** Loop processes each entry individually; should use SQL aggregation.

- [ ] **Step 1: Replace JavaScript loop with SQL aggregation**

Current (lines 104-152): Loops through entries

Replace with SQL-based aggregation:
```typescript
// Use SQL to calculate converted total directly
const convertedTotalResult = await db
    .select({
        total: sql<number>`sum(COALESCE(CAST(${ledgerEntries.convertedAmount} AS REAL), CAST(${ledgerEntries.amount} AS REAL)))`
    })
    .from(ledgerEntries)
    .where(and(...conditions));

const convertedTotalValue = Number(convertedTotalResult[0]?.total) || 0;
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run tests/unit/features/ledger/stats.test.ts --reporter=verbose
```

- [ ] **Step 3: Commit**

```bash
git add src/features/ledger/server/actions/stats.ts
git commit -m "perf: use SQL aggregation instead of JS loop for stats"
```

---

### Task 2.3: Add Pagination to Source Documents Query

**Files:**
- Modify: `src/features/source-document/server/actions/queries.ts`

**Problem:** Default limit 1000 is soft limit; no proper pagination.

- [ ] **Step 1: Enforce pagination with reasonable limits**

Modify `getAllSourceDocumentsAction` function:
```typescript
// Add constants at top
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

// Update function signature to accept page and pageSize
export const getAllSourceDocumentsAction = withLedgerAccess(async (
    ledgerId: string,
    params: {
        startDate?: string | null;
        endDate?: string | null;
        page?: number;
        pageSize?: number;
    } = {}
): Promise<{ items: SourceDocumentWithEntries[]; hasMore: boolean }> => {
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, params.pageSize || DEFAULT_PAGE_SIZE));
    const offset = (page - 1) * pageSize;

    // Query with limit + 1 to check if there's more
    const items = await db.query.sourceDocuments.findMany({
        // ... existing where clause
        limit: pageSize + 1,  // +1 to detect hasMore
        offset,
    });

    const hasMore = items.length > pageSize;
    return { items: items.slice(0, pageSize), hasMore };
});
```

- [ ] **Step 2: Update callers to handle pagination**

- [ ] **Step 3: Commit**

```bash
git add src/features/source-document/server/actions/queries.ts
git commit -m "feat: add proper pagination to source documents query"
```

---

### Task 2.4: Strengthen API v1 Input Validation

**Files:**
- Modify: `src/app/api/v1/source-documents/route.ts`

- [ ] **Step 1: Add comprehensive validation to schema**

```typescript
const sourceDocumentInputSchema = z.object({
    text: z.string().max(10000).optional(), // Add length limit
    images: z.array(z.object({
        data: z.string(),
        mimeType: z.string().regex(/^image\/(jpeg|png|gif|webp)$/, "Invalid image type")
    })).max(10, "Maximum 10 images allowed").optional(), // Limit image count
    entryDate: z.string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .refine((date) => {
            // Validate actual date validity
            const parsed = new Date(date);
            return !isNaN(parsed.getTime()) &&
                   date === parsed.toISOString().slice(0, 10);
        }, "Invalid date")
        .optional(),
    timezone: z.string().max(50).optional(),
});
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/v1/source-documents/route.ts
git commit -m "security: strengthen API input validation"
```

---

### Task 2.5: Fix Export Function Full Table Scan

**Files:**
- Modify: `src/features/ledger/server/actions/export.ts`

- [ ] **Step 1: Add date range filtering and streaming**

```typescript
// Add date range parameters
export const exportLedgerEntriesAction = withLedgerAccess(
    async (
        ledgerId: string,
        locale: string = "en",
        options?: { startDate?: string; endDate?: string }
    ): Promise<ExportResult> => {
        // Build conditions with date range
        const conditions = [
            eq(ledgerEntries.ledgerId, ledgerId),
            isNull(ledgerEntries.deletedAt)
        ];

        if (options?.startDate) {
            conditions.push(gte(sourceDocuments.entryDate, options.startDate));
        }
        if (options?.endDate) {
            conditions.push(lte(sourceDocuments.entryDate, options.endDate));
        }

        // Use streaming/chunked query for large datasets
        // ... implementation
    }
);
```

- [ ] **Step 2: Commit**

```bash
git add src/features/ledger/server/actions/export.ts
git commit -m "perf: add date range filtering to export function"
```

---

### Task 2.6: Improve withLedgerAccess Error Handling

**Files:**
- Modify: `src/lib/auth-actions.ts`

- [ ] **Step 1: Preserve original error types while avoiding info leakage**

```typescript
export function withLedgerAccess<TArgs extends unknown[], TReturn>(
    action: (ledgerId: string, ...args: TArgs) => Promise<TReturn>
): (ledgerId: string, ...args: TArgs) => Promise<TReturn> {
    return async (ledgerId: string, ...args: TArgs) => {
        const result = await requireLedgerAccess(ledgerId);

        if (result.error) {
            // Log actual error for debugging
            logger.debug({ ledgerId }, "Ledger access denied", result.error);

            // Throw appropriate error type (still abstracted for security)
            if (result.error.status === 404) {
                throw new NotFoundError("Ledger");
            }
            throw new UnauthorizedError('Unauthorized');
        }

        return action(ledgerId, ...args);
    };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/auth-actions.ts
git commit -m "refactor: preserve error types in withLedgerAccess"
```

---

### Task 2.7: Fix Image Compression Fallback Risk

**Files:**
- Modify: `src/features/source-document/components/SourceDocumentInput.tsx`

- [ ] **Step 1: Add size check before fallback**

```typescript
const MAX_FALLBACK_SIZE = 5 * 1024 * 1024; // 5MB

const processFiles = async (files: File[]) => {
    for (const file of files) {
        try {
            const compressed = await compressImage(file);
            setImages((prev) => [...prev, compressed]);
        } catch (error) {
            console.error("Failed to compress image:", error);

            // Only use original if under size limit
            if (file.size <= MAX_FALLBACK_SIZE) {
                setImages((prev) => [...prev, file]);
            } else {
                toast.error(`Image too large: ${file.name}. Please use a smaller image.`);
            }
        }
    }
};
```

- [ ] **Step 2: Commit**

```bash
git add src/features/source-document/components/SourceDocumentInput.tsx
git commit -m "fix: add size limit check for image compression fallback"
```

---

### Task 2.8: Fix Batch Update Status Validation

**Files:**
- Modify: `src/features/source-document/server/actions/update.ts`

- [ ] **Step 1: Add status enum validation**

```typescript
import { SourceDocumentStatusType } from "@/features/source-document/server/schema";

const VALID_STATUSES: SourceDocumentStatusType[] = [
    'pending', 'processing', 'completed', 'failed', 'cancelled'
];

// In batch update function:
if (status && !VALID_STATUSES.includes(status)) {
    throw new ValidationError(`Invalid status: ${status}`);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/source-document/server/actions/update.ts
git commit -m "fix: validate status values in batch update"
```

---

## Chunk 3: Medium Priority Fixes (P2)

### Task 3.1: Fix Translation Key Issues

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/zh.json`

**Problems Found:**
1. en.json line 290: `"themeSystem": "跟随系统"` (Chinese in English file)
2. zh.json line 503: `"signOutAllSuccess": "All other devices..."` (English in Chinese file)
3. zh.json lines 504-508: Multiple English strings in Chinese file

- [ ] **Step 1: Fix en.json**

```json
"themeSystem": "System Default"
```

- [ ] **Step 2: Fix zh.json**

```json
"signOutAllSuccess": "已成功退出所有其他设备",
"confirmLogoutTitle": "退出设备",
"confirmLogoutDesc": "确定要退出此设备吗？该设备将需要重新登录才能访问账户。",
"activeNow": "当前在线",
"unknownIp": "未知 IP",
"unknownDevice": "未知设备"
```

- [ ] **Step 3: Commit**

```bash
git add messages/
git commit -m "fix: correct translation keys and language consistency"
```

---

### Task 3.2: Add Success Message to Batch Actions

**Files:**
- Modify: `src/features/source-document/client/hooks/use-batch-source-document-actions.ts`

- [ ] **Step 1: Add proper success messages**

```typescript
const batchUpdateDates = useLedgerMutation(ledgerId, {
    mutationFn: async ({ ids, entryDate }: { ids: string[]; entryDate: string }) => {
        await batchUpdateSourceDocumentsAction(ledgerId, ids, { entryDate });
    },
    successMessage: t("datesUpdated", { count: ids.length }), // Add this
    errorMessage: tCommon("error"),
    // ...
});
```

- [ ] **Step 2: Commit**

```bash
git add src/features/source-document/client/hooks/use-batch-source-document-actions.ts
git commit -m "fix: add success message for batch date updates"
```

---

### Task 3.3: Fix useMemo Dependencies in Details Tab

**Files:**
- Modify: `src/features/ledger/client/hooks/use-details-tab-grouping.ts`

- [ ] **Step 1: Optimize useMemo dependencies**

```typescript
// Memoize the t function dependencies separately
const groupingKey = useMemo(() => `${locale}-${Object.keys(entries).length}`, [locale, entries]);

// Use stable references for expensive computations
const groupedItems = useMemo(() => {
    // ... computation
}, [entries, groupingKey]); // Use groupingKey instead of t and locale directly
```

- [ ] **Step 2: Commit**

```bash
git add src/features/ledger/client/hooks/use-details-tab-grouping.ts
git commit -m "perf: optimize useMemo dependencies in details tab grouping"
```

---

### Task 3.4: Add Task Engine Monitoring

**Files:**
- Create: `src/lib/flow/monitoring.ts`
- Modify: `src/lib/flow/engine.ts`

- [ ] **Step 1: Create monitoring utilities**

```typescript
// src/lib/flow/monitoring.ts
export interface TaskMetrics {
    executionTime: number;
    queueDepth: number;
    deadTasks: string[];
}

export function recordTaskExecution(taskId: string, durationMs: number): void {
    logger.info({ taskId, durationMs }, "Task execution completed");
}

export function detectDeadTasks(tasks: TaskRecord[]): string[] {
    const DEAD_TASK_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
    const now = Date.now();

    return tasks
        .filter(t => t.status === "running" &&
               now - new Date(t.updatedAt).getTime() > DEAD_TASK_THRESHOLD_MS)
        .map(t => t.id);
}
```

- [ ] **Step 2: Integrate into engine**

- [ ] **Step 3: Commit**

```bash
git add src/lib/flow/
git commit -m "feat: add task engine monitoring and dead task detection"
```

---

### Task 3.5: Add Database Connection Pool Configuration

**Files:**
- Modify: `src/lib/db/index.ts`

- [ ] **Step 1: Add connection pool settings**

```typescript
const client = globalForDb.conn ?? new Database(sqlitePath, {
    // Connection pool settings
    timeout: 5000, // 5 second timeout
    verbose: process.env.NODE_ENV === "development" ? console.log : undefined,
});

// Add query timeout pragma
client.pragma("busy_timeout = 5000");
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/db/index.ts
git commit -m "config: add database connection timeout settings"
```

---

### Task 3.6: Optimize Smart Polling JSON Serialization

**Files:**
- Modify: `src/hooks/use-smart-polling.ts`

- [ ] **Step 1: Use shallow comparison for large objects**

```typescript
// Add a hash/key function option
interface SmartPollingOptions<TData, TError> extends Omit<UseQueryOptions<TData, TError>, 'refetchInterval'> {
    // ... existing options
    dataKey?: (data: TData) => string; // Optional key extractor
}

// In hook:
const checkDataChanged = useCallback((data: TData | undefined) => {
    const dataStr = options.dataKey ? options.dataKey(data!) : JSON.stringify(data);
    // ... rest
}, [options.dataKey]);
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-smart-polling.ts
git commit -m "perf: add optional key extractor for smart polling"
```

---

### Task 3.7: Add Worker Pool for Image Processing

**Files:**
- Modify: `src/lib/image-utils.ts`

- [ ] **Step 1: Implement basic worker pool**

```typescript
class WorkerPool {
    private workers: Worker[] = [];
    private queue: Array<{ task: () => Promise<unknown>; resolve: Function; reject: Function }> = [];
    private maxWorkers: number;

    constructor(maxWorkers = 3) {
        this.maxWorkers = maxWorkers;
    }

    async execute<T>(task: () => Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            this.queue.push({ task, resolve, reject });
            this.processQueue();
        });
    }

    private processQueue(): void {
        // Implementation
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/image-utils.ts
git commit -m "feat: add worker pool for concurrent image processing"
```

---

### Task 3.8-3.12: Other Medium Priority Fixes

Continue with remaining P2 fixes for:
- Error boundary differentiation
- use-task-queue-modal state optimization
- Safe error handling improvements

---

## Chunk 4: Low Priority Fixes (P3)

### Task 4.1: Fix Component File Naming

**Files:**
- Rename: `src/components/entries/ledger-entry-item.tsx` → `LedgerEntryItem.tsx`
- Rename: `src/components/entries/editable-ledger-entry-item.tsx` → `EditableLedgerEntryItem.tsx`

- [ ] **Step 1: Rename files**
- [ ] **Step 2: Update all imports**
- [ ] **Step 3: Commit**

```bash
git add src/components/entries/
git commit -m "style: use PascalCase for component file names"
```

---

### Task 4.2: Extract Shared Types from Hooks

**Files:**
- Create: `src/features/ledger/types/period-filter.ts`
- Modify: `src/features/ledger/client/hooks/use-period-filter.ts`

- [ ] **Step 1: Extract types**
- [ ] **Step 2: Update imports**
- [ ] **Step 3: Commit**

---

### Task 4.3-4.5: Consistency Fixes

- Add missing `client/index.ts` to task-queue feature
- Add missing `server/index.ts` to calendar feature
- Fix schema export order

---

## Final Verification

### Task 5.1: Full Test Suite

- [ ] Run all tests
```bash
npm run test:run
```
Expected: All tests pass

- [ ] Run type check
```bash
npx tsc --noEmit
```
Expected: No errors

- [ ] Run build
```bash
npm run build
```
Expected: Build succeeds

- [ ] Run lint
```bash
npm run lint
```
Expected: No lint errors

---

## Summary

| Priority | Tasks | Est. Time |
|----------|-------|-----------|
| P0 | 2 | 4 hours |
| P1 | 8 | 8 hours |
| P2 | 12 | 6 hours |
| P3 | 5 | 2 hours |
| **Total** | **27** | **20 hours** |

**Key Dependencies:**
- Task 1.1 must complete before Task 1.2 (shared mutation state)
- Task 1.2 must complete before Task 2.1 (error class consistency)
- All other tasks can be done in parallel within their priority groups

**Testing Strategy:**
- Unit tests for each changed function
- Integration tests for auth flow
- Manual testing for UI changes
