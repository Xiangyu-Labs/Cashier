# Remove Default "Other" Category Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the default "Other" / "其他" category from the default ledger configuration so new ledgers no longer include it.

**Architecture:** The default ledger categories are defined in `src/config/default-ledger.ts` as static arrays for `zhLedger` and `enLedger`. We simply remove the "Other" category object from both arrays. Tests mock `getDefaultLedger`, so they won't be affected.

**Tech Stack:** TypeScript, Next.js, Vitest

---

## Files to Modify

- `src/config/default-ledger.ts:71-78` — Remove the Chinese "其他" category object from `zhLedger.categories`
- `src/config/default-ledger.ts:154-161` — Remove the English "Other" category object from `enLedger.categories`

---

### Task 1: Remove "Other" Category from Default Ledger Config

**Files:**
- Modify: `src/config/default-ledger.ts`

- [ ] **Step 1: Remove the Chinese "其他" category**

Delete lines 71-78 in `src/config/default-ledger.ts`:

```typescript
    {
      name: "其他",
      description: "用于核算除上述预设类别以外，难以明确分类或具有特殊性质的临时性支出",
      icon: "Package",
      sortOrder: 9,
      isEditable: true,
    },
```

- [ ] **Step 2: Remove the English "Other" category**

Delete lines 154-161 in `src/config/default-ledger.ts`:

```typescript
    {
      name: "Other",
      description:
        "Miscellaneous expenses that don't fit into the predefined categories or have special/temporary nature",
      icon: "Package",
      sortOrder: 9,
      isEditable: true,
    },
```

- [ ] **Step 3: Run unit tests for create-default-ledger**

Run: `npx vitest run tests/unit/ledger/application/use-cases/create-default-ledger.test.ts`

Expected: PASS

- [ ] **Step 4: Run integration tests for ledger**

Run: `npx vitest run tests/integration/ledger/`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config/default-ledger.ts
git commit -m "feat: remove default Other category from default ledger"
```
