# Receipt Total Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make parse-source-document treat receipt totals as the final accounting truth by adding deterministic post-processing that reconciles extracted items and bill-level adjustments to each receipt total without relying on the AI to do bookkeeping.

**Architecture:** Keep the AI focused on extraction: receipt totals, explicit items, and explicit bill-level adjustments. Add a new deterministic reconciliation layer after parser/arbitration and before persistence/output mapping. The reconciliation layer operates per `receipt_index`, removes no explicit facts, uses one residual fallback when needed, chooses the fallback item category from the dominant receipt theme, and persists the reconciled structure into `metadata.parseResult` so synthetic adjustments remain auditable even when order adjustments are later folded into ledger entries.

**Tech Stack:** TypeScript, Next.js server runtime, existing flow task pipeline, Drizzle/SQLite persistence, Vitest unit tests.

---

## File Structure

- Create: `src/modules/source-document/application/parse-source-document/reconciliation.ts`
  - Deterministic per-receipt reconciliation helpers.
  - Input: `NormalizedParseOutput` plus optional `aiLanguage` for fallback labels.
  - Output: reconciled success result or anomaly result with explicit reason.
- Modify: `src/modules/source-document/application/parse-source-document/pipeline.ts`
  - Invoke reconciliation after the final parser/arbitration decision and before persistence/output mapping.
  - Persist reconciled parse output into `metadata.parseResult`.
- Modify: `src/modules/source-document/application/parse-source-document/parser-schema.ts`
  - Strengthen consistency helpers so total-driven comparison actually includes `receipt_totals`.
  - Add shared grouped-total helpers if reconciliation needs them.
- Create: `tests/unit/modules/source-document/application/parse-source-document/reconciliation.test.ts`
  - Focused unit coverage for deterministic reconciliation behavior.
- Modify: `tests/unit/modules/source-document/application/parse-source-document/pipeline.test.ts`
  - Assert the pipeline returns reconciled outputs instead of raw parser outputs.
- Modify: `tests/unit/modules/source-document/application/parse-source-document/stage0-schema.test.ts`
  - Lock in total-aware compare behavior.

---

### Task 1: Build deterministic receipt reconciliation

**Files:**
- Create: `src/modules/source-document/application/parse-source-document/reconciliation.ts`
- Test: `tests/unit/modules/source-document/application/parse-source-document/reconciliation.test.ts`

- [ ] **Step 1: Write the failing test for already-balanced receipts remaining unchanged**

```ts
it("leaves a balanced receipt unchanged", () => {
  const result = reconcileParseOutput({
    aiLanguage: "zh-CN",
    result: successResult({
      receipt_totals: [{ receipt_index: 0, amount: 30, currency: "CNY" }],
      ledger_entries: [
        entry({ receipt_index: 0, item_name: "A", amount: 10, category_index: 1 }),
        entry({ receipt_index: 0, item_name: "B", amount: 20, category_index: 1 }),
      ],
      order_adjustments: [],
    }),
  });

  expect(result.kind).toBe("success");
  expect(result.result.ledger_entries).toHaveLength(2);
  expect(result.result.order_adjustments).toEqual([]);
});
```

- [ ] **Step 2: Write the failing test for positive residual becoming one generic item**

```ts
it("adds one synthetic ledger entry when explicit items plus adjustments are below the receipt total", () => {
  const result = reconcileParseOutput({
    aiLanguage: "zh-CN",
    result: successResult({
      receipt_totals: [{ receipt_index: 0, amount: 42, currency: "CNY" }],
      ledger_entries: [
        entry({ receipt_index: 0, item_name: "Visible Item", amount: 30, category_index: 2 }),
      ],
      order_adjustments: [],
    }),
  });

  expect(result.kind).toBe("success");
  expect(result.result.ledger_entries).toEqual([
    expect.objectContaining({ item_name: "Visible Item", amount: 30, category_index: 2 }),
    expect.objectContaining({ amount: 12, category_index: 2 }),
  ]);
});
```

- [ ] **Step 3: Write the failing test for negative residual becoming one generic order adjustment**

```ts
it("adds one synthetic order adjustment when extracted values exceed the receipt total", () => {
  const result = reconcileParseOutput({
    aiLanguage: "en-US",
    result: successResult({
      receipt_totals: [{ receipt_index: 0, amount: 90, currency: "USD" }],
      ledger_entries: [entry({ receipt_index: 0, item_name: "Meal", amount: 100, category_index: 1 })],
      order_adjustments: [],
    }),
  });

  expect(result.kind).toBe("success");
  expect(result.result.order_adjustments).toEqual([
    expect.objectContaining({ receipt_index: 0, amount: -10 }),
  ]);
});
```

- [ ] **Step 4: Write the failing test for dominant-category fallback selection**

```ts
it("assigns the synthetic ledger entry to the dominant category by amount, then count, then lowest category index", () => {
  const result = reconcileParseOutput({
    aiLanguage: "zh-CN",
    result: successResult({
      receipt_totals: [{ receipt_index: 0, amount: 75, currency: "CNY" }],
      ledger_entries: [
        entry({ receipt_index: 0, item_name: "Food 1", amount: 40, category_index: 3 }),
        entry({ receipt_index: 0, item_name: "Shop 1", amount: 20, category_index: 2 }),
      ],
      order_adjustments: [],
    }),
  });

  expect(result.kind).toBe("success");
  expect(result.result.ledger_entries[2]).toMatchObject({ amount: 15, category_index: 3 });
});
```

- [ ] **Step 5: Write the failing test for unreliable totals becoming anomaly**

```ts
it("returns anomaly when a successful parse has no usable receipt total for a receipt", () => {
  const result = reconcileParseOutput({
    aiLanguage: "en-US",
    result: successResult({
      receipt_totals: [],
      ledger_entries: [entry({ receipt_index: 0, item_name: "A", amount: 10, category_index: 1 })],
      order_adjustments: [],
    }),
  });

  expect(result).toEqual({
    kind: "anomaly",
    reason: expect.stringContaining("receipt total"),
  });
});
```

- [ ] **Step 6: Run the reconciliation tests to verify they fail for the missing implementation**

Run: `pnpm vitest run tests/unit/modules/source-document/application/parse-source-document/reconciliation.test.ts`
Expected: FAIL with `reconcileParseOutput is not defined` or equivalent missing-export failures.

- [ ] **Step 7: Implement the minimal reconciliation module**

```ts
export function reconcileParseOutput({
  aiLanguage,
  result,
}: {
  aiLanguage?: string;
  result: NormalizedParseOutput;
}):
  | { kind: "success"; result: NormalizedParseOutput }
  | { kind: "anomaly"; reason: string } {
  if (result.outcome !== "success") {
    return { kind: "anomaly", reason: "reconciliation requires success result" };
  }

  // Group totals, items, and adjustments by receipt_index.
  // For each receipt:
  //   target = receipt_total.amount
  //   current = sum(items) + sum(adjustments)
  //   diff = round(target - current, 2)
  //   if abs(diff) <= 0.01 -> unchanged
  //   if diff > 0 -> append one synthetic ledger_entry
  //   if diff < 0 -> append one synthetic order_adjustment
  // Use deterministic generic labels and dominant category selection.
}
```

Implementation requirements:
- Reconcile **per `receipt_index`**, never globally across multiple receipts.
- Use a 0.01 tolerance.
- Create **at most one** synthetic ledger entry and **at most one** synthetic order adjustment per receipt.
- Never fabricate a specific product name; use generic labels such as `其他商品` / `Other items` and `未归因账单调整` / `Unattributed bill adjustment`.
- For synthetic ledger entries, set `notes` to a deterministic explanation like `Created during receipt-total reconciliation.`
- For synthetic ledger entries, choose `category_index` by highest summed amount on the same receipt; break ties by highest entry count; then lowest positive `category_index`; fall back to `0` if no category exists.
- If a receipt has no usable receipt total, or multiple conflicting totals for the same `receipt_index`, return anomaly instead of inventing a target.

- [ ] **Step 8: Run the reconciliation tests to verify they pass**

Run: `pnpm vitest run tests/unit/modules/source-document/application/parse-source-document/reconciliation.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/modules/source-document/application/parse-source-document/reconciliation.ts \
        tests/unit/modules/source-document/application/parse-source-document/reconciliation.test.ts
git commit -m "feat: add deterministic receipt reconciliation"
```

---

### Task 2: Integrate reconciliation into the parse pipeline

**Files:**
- Modify: `src/modules/source-document/application/parse-source-document/pipeline.ts`
- Test: `tests/unit/modules/source-document/application/parse-source-document/pipeline.test.ts`

- [ ] **Step 1: Write the failing pipeline test for positive residual integration**

```ts
it("returns a reconciled synthetic ledger entry when parser output is below the receipt total", async () => {
  const { ai } = createMockAI({
    stage0Result: {
      ...SIMPLE_STAGE0_RESULT,
      receipt_totals: [{ receipt_index: 0, amount: 15, currency: "USD" }],
      ledger_entries: [{ ...SIMPLE_ENTRY, amount: 10 }],
      order_adjustments: [],
    },
  });

  const result = await runParsePipeline(createInput(), buildCtx(ai));

  expect(result.kind).toBe("success");
  if (result.kind === "success") {
    expect(result.ledgerEntries).toEqual(
      expect.arrayContaining([expect.objectContaining({ amount: 5, itemName: expect.any(String) })])
    );
  }
});
```

- [ ] **Step 2: Write the failing pipeline test for negative residual integration**

```ts
it("reconciles an over-stated parse by adding a synthetic bill adjustment before mapping to parsed entries", async () => {
  const { ai } = createMockAI({
    stage0Result: {
      ...SIMPLE_STAGE0_RESULT,
      receipt_totals: [{ receipt_index: 0, amount: 8, currency: "USD" }],
      ledger_entries: [{ ...SIMPLE_ENTRY, amount: 10 }],
      order_adjustments: [],
    },
  });

  const result = await runParsePipeline(createInput(), buildCtx(ai));

  expect(result.kind).toBe("success");
  if (result.kind === "success") {
    expect(result.ledgerEntries[0]).toMatchObject({ amount: 8 });
  }
});
```

- [ ] **Step 3: Run the focused pipeline tests to verify they fail before integration**

Run: `pnpm vitest run tests/unit/modules/source-document/application/parse-source-document/pipeline.test.ts`
Expected: FAIL because the pipeline still returns raw parser output.

- [ ] **Step 4: Integrate the reconciliation helper into the pipeline**

```ts
const reconciled = reconcileParseOutput({
  aiLanguage: input.aiLanguage,
  result: finalResult,
});
if (reconciled.kind === "anomaly") {
  return { kind: "anomaly", anomalyReason: reconciled.reason };
}
await persistParseResult(reconciled.result, ctx);
return resolveSuccess(reconciled.result, wasArbitrated);
```

Implementation requirements:
- Apply reconciliation to the chosen final parse result in **both** the single-pass success path and the arbitration success path.
- Persist the **reconciled** `NormalizedParseOutput` into `metadata.parseResult`, not the raw parser output.
- Keep invalid/anomaly short-circuits unchanged.
- Do not change `result-mapper.ts` in this task unless the new tests prove reconciliation cannot be expressed in the existing normalized shape.

- [ ] **Step 5: Re-run the focused pipeline tests to verify they pass**

Run: `pnpm vitest run tests/unit/modules/source-document/application/parse-source-document/pipeline.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/source-document/application/parse-source-document/pipeline.ts \
        tests/unit/modules/source-document/application/parse-source-document/pipeline.test.ts
git commit -m "feat: reconcile parse results before mapping"
```

---

### Task 3: Make dual-run agreement total-aware

**Files:**
- Modify: `src/modules/source-document/application/parse-source-document/parser-schema.ts`
- Test: `tests/unit/modules/source-document/application/parse-source-document/stage0-schema.test.ts`

- [ ] **Step 1: Write the failing test for `compareResults` noticing different receipt totals**

```ts
it("treats different receipt totals as non-matching even when item and adjustment groupings match", () => {
  const left = normalizeResult(stage0ParseOutputSchema.parse(simpleSuccess));
  const right = normalizeResult(
    stage0ParseOutputSchema.parse({
      ...simpleSuccess,
      receipt_totals: [{ receipt_index: 0, amount: 99.99, currency: "USD" }],
    })
  );

  expect(compareResults(left, right)).toBe(false);
});
```

- [ ] **Step 2: Run the schema test to verify it fails before the helper is fixed**

Run: `pnpm vitest run tests/unit/modules/source-document/application/parse-source-document/stage0-schema.test.ts`
Expected: FAIL because `compareResults()` currently ignores `receipt_totals` despite claiming otherwise.

- [ ] **Step 3: Implement receipt-total comparison in `parser-schema.ts`**

```ts
function groupReceiptTotals(totals: { receipt_index: number; currency: string; amount: number }[]): Record<string, number> {
  return totals.reduce<Record<string, number>>((acc, t) => {
    const key = `${t.receipt_index}:${t.currency}`;
    acc[key] = (acc[key] ?? 0) + t.amount;
    return acc;
  }, {});
}

// Inside compareResults():
if (!mapsMatch(groupReceiptTotals(left.receipt_totals), groupReceiptTotals(right.receipt_totals))) {
  return false;
}
```

Implementation requirements:
- Compare receipt totals with the same 0.01 tolerance already used elsewhere.
- Keep grouped-entry and grouped-adjustment comparison behavior intact.
- Update stale comments so they match the actual logic.

- [ ] **Step 4: Re-run the schema tests to verify they pass**

Run: `pnpm vitest run tests/unit/modules/source-document/application/parse-source-document/stage0-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/source-document/application/parse-source-document/parser-schema.ts \
        tests/unit/modules/source-document/application/parse-source-document/stage0-schema.test.ts
git commit -m "fix: compare parse results by receipt totals"
```

---

### Task 4: Run the end-to-end verification sweep

**Files:**
- Test: `tests/unit/modules/source-document/application/parse-source-document/reconciliation.test.ts`
- Test: `tests/unit/modules/source-document/application/parse-source-document/pipeline.test.ts`
- Test: `tests/unit/modules/source-document/application/parse-source-document/stage0-schema.test.ts`
- Test: `tests/unit/modules/source-document/application/parse-source-document/result-mapper.test.ts`

- [ ] **Step 1: Run the targeted parse pipeline suite**

Run:

```bash
pnpm vitest run \
  tests/unit/modules/source-document/application/parse-source-document/reconciliation.test.ts \
  tests/unit/modules/source-document/application/parse-source-document/pipeline.test.ts \
  tests/unit/modules/source-document/application/parse-source-document/stage0-schema.test.ts \
  tests/unit/modules/source-document/application/parse-source-document/result-mapper.test.ts
```

Expected: PASS.

- [ ] **Step 2: Review whether any prompt wording is now obsolete**

Checklist:
- Keep AI instructions focused on extraction, not forced bookkeeping.
- Do **not** remove the anti-double-counting and bill-level-fee-preservation rules.
- Only touch prompt wording if the new deterministic reconciliation makes a prompt line factually wrong.

- [ ] **Step 3: Commit the verification-only follow-up if documentation/comments changed**

```bash
git add src/modules/source-document/application/parse-source-document/parser.ts
# Only if changed during the review step
git commit -m "docs: align parser prompt with deterministic reconciliation"
```

