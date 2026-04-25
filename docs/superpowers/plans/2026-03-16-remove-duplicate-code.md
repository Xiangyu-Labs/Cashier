# Remove Duplicate Code - Implementation Plan

> **For agentic workers:** REQUIRED: Use @superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove approximately 1000 lines of duplicate code by deleting redundant files and consolidating repeated patterns.

**Architecture:** Delete the duplicate BatchActionToolbar directory, remove redundant test files, and merge duplicate type definitions.

**Tech Stack:** TypeScript, React, Vitest

---

## Chunk 1: Delete Duplicate BatchActionToolbar

### Task 1.1: Verify the duplicate structure

**Files:**
- Read: `src/features/ledger/components/BatchActionToolbar/index.tsx`
- Read: `src/components/batch-action-toolbar/index.tsx`

- [ ] **Step 1: Check the duplicate file**

Run: `cat src/features/ledger/components/BatchActionToolbar/index.tsx`

Expected: File only re-exports from `@/components/batch-action-toolbar`

- [ ] **Step 2: Check the original file exists**

Run: `ls -la src/components/batch-action-toolbar/`

Expected: Shows the actual implementation files (index.tsx, use-batch-actions.ts, etc.)

---

### Task 1.2: Remove duplicate directory

**Files:**
- Delete: `src/features/ledger/components/BatchActionToolbar/`

- [ ] **Step 1: Find files importing from the duplicate location**

Run: `grep -r "@/features/ledger/components/BatchActionToolbar" --include="*.ts" --include="*.tsx" src/`

Expected: List of files that need to be updated

- [ ] **Step 2: Update imports to use the canonical location**

For each file found in Step 1, replace:
```typescript
import { BatchActionToolbar } from "@/features/ledger/components/BatchActionToolbar";
```

With:
```typescript
import { BatchActionToolbar } from "@/components/batch-action-toolbar";
```

- [ ] **Step 3: Delete the duplicate directory**

Run: `rm -rf src/features/ledger/components/BatchActionToolbar`

- [ ] **Step 4: Verify deletion**

Run: `ls src/features/ledger/components/BatchActionToolbar 2>&1`

Expected: "No such file or directory"

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: remove duplicate BatchActionToolbar

The BatchActionToolbar in features/ledger/components was just a
re-export of the one in components/. Removed the duplicate and
updated all imports to use the canonical location."
```

---

## Chunk 2: Remove Duplicate Test Files

### Task 2.1: Remove duplicate json-utils test

**Files:**
- Delete: `tests/unit/lib/json-utils.test.ts`
- Read: `tests/unit/lib/flow/json-utils.test.ts` (to keep)

- [ ] **Step 1: Verify the duplicate exists**

Run: `ls -la tests/unit/lib/json-utils.test.ts tests/unit/lib/flow/json-utils.test.ts`

Expected: Both files exist

- [ ] **Step 2: Compare the files**

Run:
```bash
echo "=== tests/unit/lib/json-utils.test.ts ===" && wc -l tests/unit/lib/json-utils.test.ts
echo "=== tests/unit/lib/flow/json-utils.test.ts ===" && wc -l tests/unit/lib/flow/json-utils.test.ts
```

Expected: The flow version is larger/more complete (139 lines vs 83 lines)

- [ ] **Step 3: Delete the duplicate**

Run: `rm tests/unit/lib/json-utils.test.ts`

- [ ] **Step 4: Commit**

```bash
git commit -m "test: remove duplicate json-utils test

tests/unit/lib/json-utils.test.ts was testing the same module as
tests/unit/lib/flow/json-utils.test.ts. The flow version is more
complete, so removing the duplicate."
```

---

### Task 2.2: Remove duplicate currency service test

**Files:**
- Delete: `tests/unit/currency/exchange-rate-service.test.ts`
- Read: `tests/unit/features/currency/exchange-rate-service.test.ts` (to keep)

- [ ] **Step 1: Verify the duplicate**

Run: `ls tests/unit/currency/exchange-rate-service.test.ts tests/unit/features/currency/exchange-rate-service.test.ts`

Expected: Both exist

- [ ] **Step 2: Delete the duplicate**

Run: `rm tests/unit/currency/exchange-rate-service.test.ts`

- [ ] **Step 3: Remove empty directory if applicable**

Run: `rmdir tests/unit/currency 2>/dev/null || echo "Directory not empty or already removed"`

- [ ] **Step 4: Commit**

```bash
git commit -m "test: remove duplicate exchange-rate-service test

tests/unit/currency/ version was a duplicate of
tests/unit/features/currency/ version."
```

---

### Task 2.3: Remove duplicate ai-context test

**Files:**
- Delete: `tests/unit/lib/ai-context.test.ts`
- Read: `tests/unit/lib/flow/ai-context.test.ts` (to keep)

- [ ] **Step 1: Verify and delete**

Run:
```bash
ls tests/unit/lib/ai-context.test.ts tests/unit/lib/flow/ai-context.test.ts
rm tests/unit/lib/ai-context.test.ts
```

- [ ] **Step 2: Commit**

```bash
git commit -m "test: remove duplicate ai-context test

tests/unit/lib/ai-context.test.ts was testing the same module as
tests/unit/lib/flow/ai-context.test.ts."
```

---

## Chunk 3: Consolidate Serialization Types

### Task 3.1: Analyze type duplication

**Files:**
- Read: `src/lib/serialization/types.ts`
- Read: `src/types/api.ts`

- [ ] **Step 1: Read both files**

Run:
```bash
echo "=== serialization/types.ts ===" && head -50 src/lib/serialization/types.ts
echo "=== types/api.ts ===" && head -80 src/types/api.ts
```

Expected: Both define similar types like `LedgerEntry`, `SourceDocument`, etc.

- [ ] **Step 2: Compare type definitions**

Look for types defined in both files:
- `SerializedLedgerEntry` vs `LedgerEntry`
- `SerializedSourceDocument` vs `SourceDocument`

They should be essentially the same type.

---

### Task 3.2: Consolidate types into api.ts

**Files:**
- Modify: `src/types/api.ts`
- Delete: `src/lib/serialization/types.ts` (or make it re-export)

- [ ] **Step 1: Check what imports serialization/types.ts**

Run: `grep -r "@/lib/serialization/types" --include="*.ts" --include="*.tsx" src/`

Expected: List of files importing from this module

- [ ] **Step 2: Create re-export for backward compatibility**

Replace `src/lib/serialization/types.ts` content with:
```typescript
// Re-export from canonical location for backward compatibility
// TODO: Update imports to use @/types/api directly
export * from "@/types/api";
```

OR if no files import it (check carefully), delete it entirely.

- [ ] **Step 3: Update imports if there are only a few**

If there are only a few files importing from `@/lib/serialization/types`, update them to import from `@/types/api` instead.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: consolidate serialization types

Types were defined in both lib/serialization/types.ts and types/api.ts.
Consolidated into types/api.ts as the canonical location."
```

---

## Chunk 4: Run Tests and Verify

### Task 4.1: Run full test suite

- [ ] **Step 1: Run tests**

Run: `npm run test:run`

Expected: All tests pass. No test files missing errors.

- [ ] **Step 2: Check for TypeScript errors**

Run: `npx tsc --noEmit`

Expected: No errors

- [ ] **Step 3: Build the project**

Run: `npm run build`

Expected: Build succeeds

- [ ] **Step 4: Count lines removed**

Run:
```bash
echo "Approximate lines removed:"
echo "- BatchActionToolbar duplicate: ~430 lines"
echo "- Duplicate test files: ~450 lines"
echo "- Type consolidation: ~60 lines"
echo "Total: ~940 lines"
```

- [ ] **Step 5: Final commit**

```bash
git commit --allow-empty -m "refactor: remove duplicate code

Deleted:
- BatchActionToolbar duplicate directory (430 lines)
- tests/unit/lib/json-utils.test.ts (83 lines)
- tests/unit/currency/exchange-rate-service.test.ts (~100 lines)
- tests/unit/lib/ai-context.test.ts (127 lines)

Consolidated:
- Serialization types into types/api.ts (~60 lines)

Total reduction: ~900 lines of code"
```

---

## Verification Checklist

- [ ] **Import verification:**
  ```bash
  grep -r "@/features/ledger/components/BatchActionToolbar" --include="*.ts" --include="*.tsx" src/
  # Should return no results
  ```

- [ ] **Test count verification:**
  ```bash
  npm run test:run 2>&1 | tail -5
  # Should show similar or same test count as before
  ```

- [ ] **Functionality verification:**
  - Batch actions still work in ledger entries tab
  - All existing features still work

---

## Rollback Plan

If issues occur:

1. **Revert commits:**
   ```bash
   git revert HEAD~4..HEAD
   ```

2. **If partial rollback needed:**
   - BatchActionToolbar re-export can be restored
   - Test files can be restored from git history
