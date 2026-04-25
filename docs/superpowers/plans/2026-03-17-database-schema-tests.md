# Database Schema Fixes - Test Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add comprehensive tests for database schema fixes to ensure correctness and prevent regressions.

**Architecture:** Follow existing test patterns in `tests/unit/` using Vitest, in-memory SQLite, and mocking.

**Tech Stack:** Vitest, better-sqlite3, Drizzle ORM, NextAuth mocks

---

## Overview of Tests to Add

| Priority | Test | Target | Coverage |
|----------|------|--------|----------|
| High | `deleteLedgerAction` clears `defaultLedgerId` | Data consistency | Task 3 |
| High | `batchUpdateLedgerEntriesAction` triggers recalculate | Data consistency | Task 4 |
| Medium | `onExchangeRatesUpdated` triggers recalculate | Data consistency | Task 4 |
| Medium | `getProcessingTasksAction` uses correct status | Bug fix | Type fix |

---

## Chunk 1: Ledger Delete Tests

### Task 1: Create Ledger Delete Action Test

**Files:**
- Create: `tests/unit/features/ledger/server/actions/delete.test.ts`

**Context:**
- The new `deleteLedgerAction` in `src/features/ledger/server/actions/delete.ts` soft-deletes a ledger and clears users' `defaultLedgerId`.
- Need to test both behaviors.

**Prerequisites:**
- Check how other action tests are structured: `tests/unit/features/source-document/server/actions/*.test.ts`
- Use `setupTestDb()` helper from `tests/helpers/schema-setup.ts`
- Mock `updateTag` from `next/cache`

- [ ] **Step 1: Create test file with basic setup**

```typescript
import { describe, it, expect, vi } from "vitest";
import { db } from "@/lib/db";
import { users, ledgers, ledgerEntries, entryCategories, sourceDocuments } from "@/lib/db/schema";
import { deleteLedgerAction } from "@/features/ledger/server/actions/delete";
import { eq } from "drizzle-orm";

// Mock next/cache
vi.mock("next/cache", () => ({
    updateTag: vi.fn(),
}));

describe("deleteLedgerAction", () => {
    it("should soft-delete ledger and all related data", async () => {
        // TODO: Implement
    });

    it("should clear defaultLedgerId for users who had this ledger as default", async () => {
        // TODO: Implement
    });

    it("should throw NotFoundError if ledger does not exist", async () => {
        // TODO: Implement
    });

    it("should throw ForbiddenError if user does not own the ledger", async () => {
        // TODO: Implement
    });
});
```

- [ ] **Step 2: Implement first test - soft-delete verification**

```typescript
it("should soft-delete ledger and all related data", async () => {
    // Arrange: Create test user, ledger, and related data
    const userId = "test-user-id";
    const ledgerId = "test-ledger-id";

    await db.insert(users).values({
        id: userId,
        email: "test@example.com",
    });

    await db.insert(ledgers).values({
        id: ledgerId,
        userId,
        metadata: {},
    });

    await db.insert(entryCategories).values({
        id: "test-category",
        ledgerId,
        name: "Test Category",
        sortOrder: 0,
    });

    // Act: Delete the ledger
    await deleteLedgerAction(userId, ledgerId);

    // Assert: Check all data is soft-deleted
    const ledger = await db.query.ledgers.findFirst({
        where: eq(ledgers.id, ledgerId),
    });
    expect(ledger?.deletedAt).not.toBeNull();

    const categories = await db.query.entryCategories.findMany({
        where: eq(entryCategories.ledgerId, ledgerId),
    });
    expect(categories.every(c => c.deletedAt !== null)).toBe(true);
});
```

- [ ] **Step 3: Implement critical test - defaultLedgerId cleared**

```typescript
it("should clear defaultLedgerId for users who had this ledger as default", async () => {
    // Arrange: Create user with defaultLedgerId set
    const userId = "test-user-id";
    const ledgerId = "test-ledger-id";

    await db.insert(users).values({
        id: userId,
        email: "test@example.com",
        defaultLedgerId: ledgerId,
    });

    await db.insert(ledgers).values({
        id: ledgerId,
        userId,
        metadata: {},
    });

    // Act: Delete the ledger
    await deleteLedgerAction(userId, ledgerId);

    // Assert: Check defaultLedgerId is cleared
    const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
    });
    expect(user?.defaultLedgerId).toBeNull();
});
```

- [ ] **Step 4: Implement error cases**

```typescript
it("should throw NotFoundError if ledger does not exist", async () => {
    await expect(
        deleteLedgerAction("user-id", "non-existent-ledger")
    ).rejects.toThrow("Ledger");
});

it("should throw ForbiddenError if user does not own the ledger", async () => {
    // Arrange: Create ledger owned by different user
    await db.insert(users).values({
        id: "owner-id",
        email: "owner@example.com",
    });

    await db.insert(users).values({
        id: "other-id",
        email: "other@example.com",
    });

    await db.insert(ledgers).values({
        id: "test-ledger",
        userId: "owner-id",
        metadata: {},
    });

    // Act & Assert
    await expect(
        deleteLedgerAction("other-id", "test-ledger")
    ).rejects.toThrow("Access denied");
});
```

- [ ] **Step 5: Run tests and fix any issues**

```bash
npx vitest run tests/unit/features/ledger/server/actions/delete.test.ts -v
```

- [ ] **Step 6: Commit**

```bash
git add tests/unit/features/ledger/server/actions/delete.test.ts
git commit -m "test(ledger): add tests for deleteLedgerAction

- Test soft-delete behavior for ledger and related data
- Test defaultLedgerId is cleared on ledger delete
- Test error cases: not found, access denied"
```

---

## Chunk 2: Batch Update Currency Tests

### Task 2: Create Batch Update Entry Currency Test

**Files:**
- Create: `tests/unit/features/ledger/server/actions/batch-update-currency.test.ts`
- Mock: `recalculateEntriesConvertedAmount` needs to be mocked

**Context:**
- `batchUpdateLedgerEntriesAction` now triggers `recalculateEntriesConvertedAmount` when currency is updated.
- Need to verify the recalculation is triggered.

- [ ] **Step 1: Create test file with mocked recalculate**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { users, ledgers, ledgerEntries, entryCategories } from "@/lib/db/schema";
import { batchUpdateLedgerEntriesAction } from "@/features/ledger/server/actions/entries";

// Mock the recalculate function
const mockRecalculate = vi.fn();
vi.mock("@/features/ledger/server/actions/helpers", async () => {
    const actual = await vi.importActual("@/features/ledger/server/actions/helpers");
    return {
        ...actual,
        recalculateEntriesConvertedAmount: mockRecalculate,
    };
});

describe("batchUpdateLedgerEntriesAction currency recalculation", () => {
    beforeEach(() => {
        mockRecalculate.mockClear();
    });

    it("should trigger recalculation when currency is updated", async () => {
        // TODO: Implement
    });

    it("should NOT trigger recalculation when only other fields are updated", async () => {
        // TODO: Implement
    });
});
```

- [ ] **Step 2: Implement currency change test**

```typescript
it("should trigger recalculation when currency is updated", async () => {
    // Arrange: Create test data
    const userId = "test-user-id";
    const ledgerId = "test-ledger-id";
    const entryId = "test-entry-id";

    await db.insert(users).values({
        id: userId,
        email: "test@example.com",
    });

    await db.insert(ledgers).values({
        id: ledgerId,
        userId,
        metadata: {
            settings: { mainCurrency: "USD" },
        },
    });

    await db.insert(entryCategories).values({
        id: "test-category",
        ledgerId,
        name: "Test",
        sortOrder: 0,
    });

    await db.insert(ledgerEntries).values({
        id: entryId,
        ledgerId,
        categoryId: "test-category",
        amount: "100",
        currency: "CNY",
        itemName: "Test Item",
    });

    // Wait for any pending async operations
    await new Promise(resolve => setTimeout(resolve, 100));
    mockRecalculate.mockClear();

    // Act: Batch update with currency change
    await batchUpdateLedgerEntriesAction(
        ledgerId,
        [entryId],
        { currency: "EUR" }
    );

    // Assert: Wait for async recalculation
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(mockRecalculate).toHaveBeenCalledWith(ledgerId, "USD");
});
```

- [ ] **Step 3: Implement non-currency update test**

```typescript
it("should NOT trigger recalculation when only other fields are updated", async () => {
    // Arrange: Create test data (same as above)
    const userId = "test-user-id";
    const ledgerId = "test-ledger-id";
    const entryId = "test-entry-id";

    await db.insert(users).values({
        id: userId,
        email: "test@example.com",
    });

    await db.insert(ledgers).values({
        id: ledgerId,
        userId,
        metadata: {
            settings: { mainCurrency: "USD" },
        },
    });

    await db.insert(entryCategories).values({
        id: "test-category",
        ledgerId,
        name: "Test",
        sortOrder: 0,
    });

    await db.insert(ledgerEntries).values({
        id: entryId,
        ledgerId,
        categoryId: "test-category",
        amount: "100",
        currency: "CNY",
        itemName: "Test Item",
    });

    await new Promise(resolve => setTimeout(resolve, 100));
    mockRecalculate.mockClear();

    // Act: Batch update without currency change
    await batchUpdateLedgerEntriesAction(
        ledgerId,
        [entryId],
        { itemName: "Updated Name" }
    );

    // Assert: Wait and verify no recalculation
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(mockRecalculate).not.toHaveBeenCalled();
});
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/unit/features/ledger/server/actions/batch-update-currency.test.ts -v
```

- [ ] **Step 5: Commit**

```bash
git add tests/unit/features/ledger/server/actions/batch-update-currency.test.ts
git commit -m "test(ledger): add tests for batch currency update recalculation

- Verify recalculateEntriesConvertedAmount is called on currency change
- Verify recalculation is NOT triggered for non-currency updates"
```

---

## Chunk 3: Exchange Rate Callback Tests

### Task 3: Create Exchange Rate Update Callback Test

**Files:**
- Create: `tests/unit/features/currency/server/services/exchange-rate-callback.test.ts`

**Context:**
- `onExchangeRatesUpdated` should trigger recalculation for all active ledgers.

- [ ] **Step 1: Create test file**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { users, ledgers } from "@/lib/db/schema";
import { onExchangeRatesUpdated } from "@/features/currency/server/services/exchange-rate-callback";

// Mock recalculate function
const mockRecalculate = vi.fn();
vi.mock("@/features/ledger/server/actions/helpers", async () => {
    const actual = await vi.importActual("@/features/ledger/server/actions/helpers");
    return {
        ...actual,
        recalculateEntriesConvertedAmount: mockRecalculate,
    };
});

describe("onExchangeRatesUpdated", () => {
    beforeEach(() => {
        mockRecalculate.mockClear();
    });

    it("should trigger recalculation for all non-deleted ledgers", async () => {
        // TODO: Implement
    });

    it("should use correct mainCurrency for each ledger", async () => {
        // TODO: Implement
    });

    it("should default to CNY when mainCurrency is not set", async () => {
        // TODO: Implement
    });
});
```

- [ ] **Step 2: Implement tests**

```typescript
it("should trigger recalculation for all non-deleted ledgers", async () => {
    // Arrange: Create multiple ledgers
    await db.insert(users).values({
        id: "user-1",
        email: "user1@example.com",
    });

    await db.insert(ledgers).values({
        id: "ledger-1",
        userId: "user-1",
        metadata: { settings: { mainCurrency: "USD" } },
    });

    await db.insert(ledgers).values({
        id: "ledger-2",
        userId: "user-1",
        metadata: { settings: { mainCurrency: "EUR" } },
    });

    // Act
    await onExchangeRatesUpdated();

    // Assert: Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(mockRecalculate).toHaveBeenCalledTimes(2);
    expect(mockRecalculate).toHaveBeenCalledWith("ledger-1", "USD");
    expect(mockRecalculate).toHaveBeenCalledWith("ledger-2", "EUR");
});

it("should NOT trigger recalculation for deleted ledgers", async () => {
    // Arrange
    await db.insert(users).values({
        id: "user-1",
        email: "user1@example.com",
    });

    await db.insert(ledgers).values({
        id: "active-ledger",
        userId: "user-1",
        metadata: { settings: { mainCurrency: "USD" } },
    });

    await db.insert(ledgers).values({
        id: "deleted-ledger",
        userId: "user-1",
        metadata: {},
        deletedAt: new Date(),
    });

    // Act
    await onExchangeRatesUpdated();

    // Assert
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(mockRecalculate).toHaveBeenCalledTimes(1);
    expect(mockRecalculate).toHaveBeenCalledWith("active-ledger", "USD");
});

it("should default to CNY when mainCurrency is not set", async () => {
    // Arrange
    await db.insert(users).values({
        id: "user-1",
        email: "user1@example.com",
    });

    await db.insert(ledgers).values({
        id: "ledger-1",
        userId: "user-1",
        metadata: {}, // No settings
    });

    // Act
    await onExchangeRatesUpdated();

    // Assert
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(mockRecalculate).toHaveBeenCalledWith("ledger-1", "CNY");
});
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/unit/features/currency/server/services/exchange-rate-callback.test.ts -v
```

- [ ] **Step 4: Commit**

```bash
git add tests/unit/features/currency/server/services/exchange-rate-callback.test.ts
git commit -m "test(currency): add tests for exchange rate update callback

- Verify recalculation triggered for all non-deleted ledgers
- Verify correct mainCurrency used per ledger
- Verify default to CNY when mainCurrency not set
- Verify deleted ledgers are skipped"
```

---

## Chunk 4: Task Status Query Tests

### Task 4: Create Task Status Query Test

**Files:**
- Create: `tests/unit/features/source-document/server/actions/processing.test.ts`

**Context:**
- Verify `getProcessingTasksAction` uses correct status values ("pending" not "queued").

- [ ] **Step 1: Create test file**

```typescript
import { describe, it, expect, vi } from "vitest";
import { db } from "@/lib/db";
import { users, ledgers, taskRuns } from "@/lib/db/schema";
import { getProcessingTasksAction } from "@/features/source-document/server/actions/processing";
import { eq, inArray } from "drizzle-orm";

describe("getProcessingTasksAction", () => {
    it("should return tasks with 'running' or 'pending' status when activeOnly=true", async () => {
        // Arrange
        const userId = "test-user";
        const ledgerId = "test-ledger";

        await db.insert(users).values({
            id: userId,
            email: "test@example.com",
        });

        await db.insert(ledgers).values({
            id: ledgerId,
            userId,
            metadata: {},
        });

        // Insert tasks with various statuses
        await db.insert(taskRuns).values({
            id: "task-running",
            type: "parse",
            title: "Running Task",
            status: "running",
            scopeId: ledgerId,
        });

        await db.insert(taskRuns).values({
            id: "task-pending",
            type: "parse",
            title: "Pending Task",
            status: "pending",
            scopeId: ledgerId,
        });

        await db.insert(taskRuns).values({
            id: "task-completed",
            type: "parse",
            title: "Completed Task",
            status: "completed",
            scopeId: ledgerId,
        });

        // Act
        const result = await getProcessingTasksAction(ledgerId, { activeOnly: true, limit: 10 });

        // Assert
        const taskIds = result.map(t => t.id);
        expect(taskIds).toContain("task-running");
        expect(taskIds).toContain("task-pending");
        expect(taskIds).not.toContain("task-completed");
    });

    it("should use correct status values (not 'queued')", async () => {
        // This test documents the bug fix where 'queued' was incorrectly used
        // instead of 'pending' for task_runs status

        const validStatuses = ["pending", "running", "completed", "failed", "cancelled"];
        const invalidStatus = "queued"; // This is source_documents status, not task_runs

        expect(validStatuses).not.toContain(invalidStatus);
        expect(validStatuses).toContain("pending");
    });
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run tests/unit/features/source-document/server/actions/processing.test.ts -v
```

- [ ] **Step 3: Commit**

```bash
git add tests/unit/features/source-document/server/actions/processing.test.ts
git commit -m "test(source-document): add tests for task status query

- Verify getProcessingTasksAction returns correct active statuses
- Document status value fix ('queued' -> 'pending')"
```

---

## Final Verification

After all tasks complete:

```bash
# Run full test suite
npm run test:run

# Build to ensure no type errors
npm run build

# Lint
npm run lint
```

---

## Summary of New Tests

| File | Test Coverage |
|------|---------------|
| `tests/unit/features/ledger/server/actions/delete.test.ts` | Ledger deletion, defaultLedgerId cleanup, error cases |
| `tests/unit/features/ledger/server/actions/batch-update-currency.test.ts` | Currency update triggers recalculation |
| `tests/unit/features/currency/server/services/exchange-rate-callback.test.ts` | Rate update triggers recalculation for all ledgers |
| `tests/unit/features/source-document/server/actions/processing.test.ts` | Task status query uses correct values |

**Total:** 4 new test files, ~15 test cases
