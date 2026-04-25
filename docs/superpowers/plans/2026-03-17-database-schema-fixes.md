# Database Schema Fixes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all database schema issues identified in deep review: index optimization, data consistency, dead code removal, and constraint improvements.

**Architecture:** Use Drizzle ORM migrations for schema changes, update application code for consistency fixes, ensure backward compatibility.

**Tech Stack:** Next.js, Drizzle ORM, SQLite, TypeScript

---

## Overview of Issues to Fix

| Priority | Issue | Location | Impact |
|----------|-------|----------|--------|
| Critical | `converted_amount` index ineffective | `ledger_entries` | Index not used due to CAST |
| Critical | `currency` column missing index | `ledger_entries` | Slow queries |
| High | `defaultLedgerId` data inconsistency | `users` | Dangling references |
| High | `convertedAmount` maintenance gaps | `ledger_entries` | Data inconsistency |
| High | `verification_tokens` dead code | `auth` | Unused table |
| Medium | `task_runs` unused index | `task_runs` | Index bloat |
| Medium | Status enum no constraints | `source_documents`, `task_runs` | Data integrity |

---

## Chunk 1: Fix Index Issues

### Task 1: Remove Ineffective `converted_amount` Index

**Problem:** The index `idx_ledger_entries_converted_amount` is ineffective because all queries use `CAST(convertedAmount AS REAL)` which prevents index usage.

**Files:**
- Modify: `src/features/ledger/server/schema.ts:92`
- Migration: `src/lib/db/migrations/0019_remove_converted_amount_index.sql`

- [ ] **Step 1: Remove index from schema**

Delete line 92 in `src/features/ledger/server/schema.ts`:
```typescript
// REMOVE THIS LINE:
// index("idx_ledger_entries_converted_amount").on(table.convertedAmount),
```

- [ ] **Step 2: Create migration to drop index**

Create `src/lib/db/migrations/0019_remove_converted_amount_index.sql`:
```sql
-- Drop ineffective converted_amount index
DROP INDEX IF EXISTS "idx_ledger_entries_converted_amount";
```

- [ ] **Step 3: Run migration**

```bash
npm run db:migrate
```

- [ ] **Step 4: Verify**

```bash
sqlite3 data/sqlite.db ".indexes ledger_entries" | grep converted_amount
# Should return nothing
```

- [ ] **Step 5: Commit**

```bash
git add src/features/ledger/server/schema.ts src/lib/db/migrations/0019_remove_converted_amount_index.sql
git commit -m "fix(db): remove ineffective converted_amount index"
```

---

### Task 2: Add `currency` Column Index

**Problem:** `ledger_entries.currency` is frequently used in WHERE and GROUP BY clauses but has no index.

**Files:**
- Modify: `src/features/ledger/server/schema.ts:84-93`
- Migration: `src/lib/db/migrations/0020_add_currency_index.sql`

- [ ] **Step 1: Add index to schema**

In `src/features/ledger/server/schema.ts`, add after line 90:
```typescript
// For currency filtering and grouping
index("idx_ledger_entries_ledger_currency").on(table.ledgerId, table.currency, table.deletedAt),
```

- [ ] **Step 2: Create migration**

Create `src/lib/db/migrations/0020_add_currency_index.sql`:
```sql
-- Add index for currency filtering
CREATE INDEX "idx_ledger_entries_ledger_currency" ON "ledger_entries" ("ledger_id", "currency", "deleted_at");
```

- [ ] **Step 3: Run migration**

```bash
npm run db:migrate
```

- [ ] **Step 4: Verify index exists**

```bash
sqlite3 data/sqlite.db ".indexes ledger_entries" | grep currency
# Should show idx_ledger_entries_ledger_currency
```

- [ ] **Step 5: Commit**

```bash
git add src/features/ledger/server/schema.ts src/lib/db/migrations/0020_add_currency_index.sql
git commit -m "feat(db): add currency index for faster queries"
```

---

## Chunk 2: Fix Data Consistency

### Task 3: Fix `defaultLedgerId` Data Consistency

**Problem:** When a ledger is deleted, `users.defaultLedgerId` is not cleared, causing dangling references.

**Files:**
- Modify: `src/features/ledger/server/actions/delete.ts` (or find existing delete logic)
- Modify: `src/app/[locale]/(protected)/page.tsx:36-37`

- [ ] **Step 1: Find ledger delete logic**

Search for ledger deletion:
```bash
grep -r "ledgers.*delete\|deleteLedger\|softDelete" src/features/ledger --include="*.ts" | head -20
```

- [ ] **Step 2: Create helper function to clear defaultLedgerId**

In `src/features/auth/server/services/user-setup.ts`, add:
```typescript
/**
 * Clear defaultLedgerId when the ledger is deleted
 */
export async function clearUserDefaultLedger(ledgerId: string): Promise<void> {
    await db
        .update(users)
        .set({ defaultLedgerId: null })
        .where(eq(users.defaultLedgerId, ledgerId));
}
```

- [ ] **Step 3: Update ledger delete action**

Find where ledgers are soft-deleted and add:
```typescript
import { clearUserDefaultLedger } from "@/features/auth/server/services/user-setup";

// In the delete function, after soft-deleting the ledger:
await clearUserDefaultLedger(ledgerId);
```

- [ ] **Step 4: Add validation in page redirect**

In `src/app/[locale]/(protected)/page.tsx`, enhance the redirect logic:
```typescript
// Before redirecting, verify the ledger exists
if (session.user.defaultLedgerId) {
    const defaultLedger = ledgers.find(l => l.id === session.user.defaultLedgerId);
    if (defaultLedger) {
        redirect({ href: `/ledger/${session.user.defaultLedgerId}`, locale });
    }
    // If defaultLedgerId points to non-existent ledger, fall through to first ledger
}
```

- [ ] **Step 5: Test**

```bash
npm run test:run
```

- [ ] **Step 6: Commit**

```bash
git add src/features/auth/server/services/user-setup.ts src/app/[locale]/(protected)/page.ts
git commit -m "fix(auth): clear defaultLedgerId when ledger is deleted"
```

---

### Task 4: Fix `convertedAmount` Maintenance Gaps

**Problem:** `convertedAmount` is not recalculated when:
1. Exchange rates are updated
2. `batchUpdateLedgerEntriesAction` updates currency

**Files:**
- Modify: `src/features/ledger/server/actions/entries.ts:174-199`
- Create: `src/features/currency/server/services/exchange-rate-callback.ts`

- [ ] **Step 1: Update batchUpdateLedgerEntriesAction**

In `src/features/ledger/server/actions/entries.ts`, modify `batchUpdateLedgerEntriesAction`:
```typescript
export const batchUpdateLedgerEntriesAction = withLedgerAccess(async (
    ledgerId: string,
    ledgerEntryIds: string[],
    data: z.infer<typeof batchUpdateLedgerEntriesSchema>
): Promise<void> => {
    // ... existing validation code ...

    const q = forLedger(ledgerEntries, ledgerId);

    await db.update(ledgerEntries)
        .set(updateData)
        .where(and(
            q.whereActive,
            inArray(ledgerEntries.id, ledgerEntryIds)
        ));

    // If currency changed, recalculate convertedAmount for affected entries
    if (validated.currency !== undefined) {
        const { recalculateEntriesConvertedAmount } = await import("../helpers");
        const ledger = await db.query.ledgers.findFirst({
            where: eq(ledgers.id, ledgerId),
        });
        const mainCurrency = ledger?.metadata?.settings?.mainCurrency || "CNY";

        recalculateEntriesConvertedAmount(ledgerId, mainCurrency).catch(err => {
            logger.error({ err, ledgerId }, "Failed to recalculate after batch currency update");
        });
    }
});
```

- [ ] **Step 2: Create exchange rate callback**

Create `src/features/currency/server/services/exchange-rate-callback.ts`:
```typescript
import { db } from "@/lib/db";
import { ledgers } from "@/lib/db/schema";
import { recalculateEntriesConvertedAmount } from "@/features/ledger/server/actions/helpers";
import { logger } from "@/lib/logger";
import { eq, isNull } from "drizzle-orm";

/**
 * Trigger recalculation for all ledgers when exchange rates are updated
 * This should be called after ExchangeRateService fetches new rates
 */
export async function onExchangeRatesUpdated(): Promise<void> {
    try {
        // Get all active ledgers with their main currencies
        const allLedgers = await db.query.ledgers.findMany({
            where: isNull(ledgers.deletedAt),
            columns: { id: true, metadata: true },
        });

        for (const ledger of allLedgers) {
            const mainCurrency = ledger.metadata?.settings?.mainCurrency || "CNY";

            // Trigger async recalculation
            recalculateEntriesConvertedAmount(ledger.id, mainCurrency).catch(err => {
                logger.error({ err, ledgerId: ledger.id }, "Failed to recalculate after exchange rate update");
            });
        }

        logger.info({ ledgerCount: allLedgers.length }, "Triggered recalculation for all ledgers after exchange rate update");
    } catch (err) {
        logger.error({ err }, "Failed to trigger recalculation after exchange rate update");
    }
}
```

- [ ] **Step 3: Wire up callback in ExchangeRateService**

In `src/features/currency/server/services/exchange-rate.ts`, find where rates are saved and add:
```typescript
import { onExchangeRatesUpdated } from "./exchange-rate-callback";

// After saving new rates:
await onExchangeRatesUpdated();
```

- [ ] **Step 4: Test**

```bash
npm run test:run -- tests/unit/features/ledger
```

- [ ] **Step 5: Commit**

```bash
git add src/features/ledger/server/actions/entries.ts src/features/currency/server/services/
git commit -m "fix(ledger): recalculate convertedAmount on currency changes and rate updates"
```

---

## Chunk 3: Remove Dead Code

### Task 5: Remove Unused `verification_tokens` Table

**Problem:** `verification_tokens` table is dead code - not used by OTP login and no Magic Link provider configured.

**Warning:** This is safe only if you confirm Magic Link will NOT be added. If unsure, skip this task.

**Files:**
- Modify: `src/features/auth/server/schema.ts:56-63`
- Modify: `src/auth.ts:8-9`
- Migration: `src/lib/db/migrations/0021_remove_verification_tokens.sql`

- [ ] **Step 1: Verify Magic Link is not used**

Check auth.ts confirms no EmailProvider:
```bash
grep -n "EmailProvider\|magic.*link\|verificationTokens" src/auth.ts
```
Should only show DrizzleAdapter reference.

- [ ] **Step 2: Remove from DrizzleAdapter config**

In `src/auth.ts`, change:
```typescript
// BEFORE:
adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    verificationTokensTable: verificationTokens,  // REMOVE
}),

// AFTER:
adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
}),
```

- [ ] **Step 3: Remove import**

In `src/auth.ts`, remove:
```typescript
// REMOVE:
import { verificationTokens } from "@/features/auth/server/schema";
```

- [ ] **Step 4: Remove table from schema**

In `src/features/auth/server/schema.ts`, remove lines 56-63:
```typescript
// REMOVE ENTIRE TABLE DEFINITION:
// export const verificationTokens = sqliteTable("verification_tokens", {
//     identifier: text("identifier").notNull(),
//     token: text("token").notNull().unique(),
//     expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
// }, (table) => [
//     primaryKey({ columns: [table.identifier, table.token] }),
// ]);
```

- [ ] **Step 5: Create migration to drop table**

Create `src/lib/db/migrations/0021_remove_verification_tokens.sql`:
```sql
-- Drop unused verification_tokens table (Magic Link not enabled)
DROP TABLE IF EXISTS "verification_tokens";
```

- [ ] **Step 6: Run migration**

```bash
npm run db:migrate
```

- [ ] **Step 7: Test**

```bash
npm run test:run
npm run build
```

- [ ] **Step 8: Commit**

```bash
git add src/auth.ts src/features/auth/server/schema.ts src/lib/db/migrations/0021_remove_verification_tokens.sql
git commit -m "chore(auth): remove unused verification_tokens table"
```

---

## Chunk 4: Optimize Indexes

### Task 6: Remove Unused `task_runs` Index

**Problem:** `idx_task_runs_type_status` is almost never used - all queries use `scopeId + status`.

**Files:**
- Modify: `src/features/task-queue/server/schema.ts:44`
- Migration: `src/lib/db/migrations/0022_remove_task_runs_type_status_index.sql`

- [ ] **Step 1: Verify index is unused**

Search for queries using type + status without scopeId:
```bash
grep -rn "taskRuns.type" src --include="*.ts" | grep -v "node_modules"
```
Should show only schema definition, no queries.

- [ ] **Step 2: Remove from schema**

In `src/features/task-queue/server/schema.ts`, remove line 44:
```typescript
// REMOVE:
// index("idx_task_runs_type_status").on(table.type, table.status),
```

- [ ] **Step 3: Create migration**

Create `src/lib/db/migrations/0022_remove_task_runs_type_status_index.sql`:
```sql
-- Remove unused index
DROP INDEX IF EXISTS "idx_task_runs_type_status";
```

- [ ] **Step 4: Run migration**

```bash
npm run db:migrate
```

- [ ] **Step 5: Commit**

```bash
git add src/features/task-queue/server/schema.ts src/lib/db/migrations/0022_remove_task_runs_type_status_index.sql
git commit -m "perf(db): remove unused task_runs type_status index"
```

---

## Chunk 5: Add Constraints

### Task 7: Add Status Enum CHECK Constraints

**Problem:** Status columns allow any string value, no database-level validation.

**Files:**
- Modify: `src/features/source-document/server/schema.ts`
- Modify: `src/features/task-queue/server/schema.ts`
- Migration: `src/lib/db/migrations/0023_add_status_constraints.sql`

- [ ] **Step 1: Add CHECK constraint to source_documents**

In `src/features/source-document/server/schema.ts`, modify the status column:
```typescript
// Add import at top if not present:
import { check } from "drizzle-orm/sqlite-core";

// Modify status column definition:
status: text("status").notNull().default("queued")
    .$type<"queued" | "processing" | "completed" | "anomaly" | "failed">(),
```

Note: SQLite CHECK constraints in Drizzle require table-level definition. If complex, document in code instead.

- [ ] **Step 2: Add CHECK constraint to task_runs**

In `src/features/task-queue/server/schema.ts`:
```typescript
status: text("status").notNull().default("pending")
    .$type<"pending" | "running" | "completed" | "failed" | "cancelled">(),
```

- [ ] **Step 3: Create migration with CHECK constraints**

Create `src/lib/db/migrations/0023_add_status_constraints.sql`:
```sql
-- Add CHECK constraints for status enums
-- Note: SQLite doesn't support ALTER TABLE ADD CONSTRAINT,
-- so we need to recreate tables if adding constraints to existing columns

-- For new tables, use:
-- status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'anomaly', 'failed'))

-- Since we can't easily add CHECK to existing columns in SQLite,
-- document the valid values in code instead
```

Alternative: Since SQLite doesn't support adding CHECK constraints to existing columns easily, document in code:

- [ ] **Step 4: Add runtime validation instead**

In `src/features/source-document/server/actions/schemas.ts`, add Zod validation:
```typescript
export const sourceDocumentStatusSchema = z.enum(["queued", "processing", "completed", "anomaly", "failed"]);
```

In `src/features/task-queue/server/actions/schemas.ts`:
```typescript
export const taskRunStatusSchema = z.enum(["pending", "running", "completed", "failed", "cancelled"]);
```

- [ ] **Step 5: Test**

```bash
npm run test:run
```

- [ ] **Step 6: Commit**

```bash
git add src/features/source-document/server/schemas.ts src/features/task-queue/server/schemas.ts
# If migrations created:
git add src/lib/db/migrations/0023_add_status_constraints.sql
git commit -m "feat(db): add status enum validation"
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

## Summary of Changes

| Task | Schema Change | Migration | Code Change |
|------|---------------|-----------|-------------|
| 1 | Remove index | 0019 | - |
| 2 | Add index | 0020 | - |
| 3 | - | - | Update delete logic |
| 4 | - | - | Update batch update |
| 5 | Remove table | 0021 | Update auth.ts |
| 6 | Remove index | 0022 | - |
| 7 | Add types | 0023 (optional) | Add schemas |
