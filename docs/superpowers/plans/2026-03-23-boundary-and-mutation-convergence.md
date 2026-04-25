# Boundary And Mutation Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring input validation, public module surfaces, and ledger-side mutation orchestration back into line with the durable engineering rules.

**Architecture:** Parse inputs exactly once at the module boundary, shrink public barrels so they stop re-exporting persistence internals, and move the remaining ad hoc ledger-side invalidation flow into a dedicated hook that uses the shared mutation abstraction.

**Tech Stack:** TypeScript, Zod, Next.js Server Actions, TanStack Query, Vitest

---

## File Map

- Create: `src/modules/currency/contract-schemas.ts` - currency boundary schemas and parse helpers.
- Modify: `src/modules/currency/server-actions/convert-currency.ts`
- Modify: `src/modules/currency/application/use-cases/convert-currency.ts`
- Modify: `src/modules/ledger/contract-schemas.ts`
- Modify: `src/modules/ledger/application/queries/list-ledger-entries.ts`
- Modify: `src/modules/source-document/contract-schemas.ts`
- Modify: `src/modules/source-document/application/queries/list-source-document-page.ts`
- Modify: `src/modules/source-document/application/use-cases/create-and-queue-source-document.ts`
- Modify: `src/modules/source-document/queries.ts`
- Modify: `src/modules/stats/application/queries/get-enhanced-stats.ts`
- Modify: `src/modules/task-queue/application/queries/get-task-queue.ts`
- Modify: `src/modules/task-queue/application/use-cases/cancel-task.ts`
- Modify: `src/modules/workspace/application/queries/get-ledger-page-bootstrap.ts`
- Create: `src/modules/ledger/hooks/useAutoCategorizeMutation.ts`
- Modify: `src/modules/ledger/ui/SettingsTab.tsx`
- Create: `tests/unit/modules/currency/contract-schemas.test.ts`
- Create: `tests/unit/modules/ledger/hooks/useAutoCategorizeMutation.test.ts`

### Task 1: Move currency validation to the module boundary

**Files:**
- Create: `src/modules/currency/contract-schemas.ts`
- Modify: `src/modules/currency/server-actions/convert-currency.ts`
- Modify: `src/modules/currency/application/use-cases/convert-currency.ts`
- Create: `tests/unit/modules/currency/contract-schemas.test.ts`

- [ ] **Step 1: Write the failing boundary tests**

```ts
it("parses currency conversion input with the module contract schema", () => {
  expect(parseConvertCurrencyInput({ amount: 12.5, from: "USD", to: "CNY" })).toEqual({
    amount: 12.5,
    from: "USD",
    to: "CNY",
  });
});

it("rejects blank conversion parameters before the use case runs", () => {
  expect(() =>
    parseConvertCurrencyInput({ amount: 0, from: "", to: "" })
  ).toThrow("Missing required parameters");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit -- tests/unit/modules/currency/contract-schemas.test.ts tests/unit/modules/currency/application/use-cases/convert-currency.test.ts`

Expected: FAIL because the currency module does not yet own a contract schema and validation still lives inside the use case.

- [ ] **Step 3: Add parse helpers and push validation outward**

```ts
const convertCurrencyInputSchema = z.object({
  amount: z.number().positive(),
  from: z.string().trim().length(3),
  to: z.string().trim().length(3),
  date: optionalDateStringSchema,
});

export const parseConvertCurrencyInput = (input: unknown) => {
  const result = convertCurrencyInputSchema.safeParse(input);
  if (!result.success) {
    throw new ValidationError("Missing required parameters", { issues: result.error.issues });
  }
  return result.data;
};
```

Then:

- `convertCurrencyAction()` should call `parseConvertCurrencyInput(...)`
- `convertCurrency()` should assume validated input and only do business work

- [ ] **Step 4: Run the targeted tests**

Run: `npm run test:unit -- tests/unit/modules/currency/contract-schemas.test.ts tests/unit/modules/currency/application/use-cases/convert-currency.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/currency/contract-schemas.ts src/modules/currency/server-actions/convert-currency.ts src/modules/currency/application/use-cases/convert-currency.ts tests/unit/modules/currency/contract-schemas.test.ts
git commit -m "refactor: validate currency inputs at the boundary"
```

### Task 2: Parse ledger and source-document inputs only once

**Files:**
- Modify: `src/modules/ledger/application/queries/list-ledger-entries.ts`
- Modify: `src/modules/ledger/contract-schemas.ts`
- Modify: `src/modules/source-document/contract-schemas.ts`
- Modify: `src/modules/source-document/application/queries/list-source-document-page.ts`
- Modify: `src/modules/source-document/application/use-cases/create-and-queue-source-document.ts`

- [ ] **Step 1: Write or extend the failing tests**

```ts
// Reuse existing module tests and add one assertion per file that validated input is parsed once
// and downstream helpers receive already-normalized data.
```

- [ ] **Step 2: Run the relevant unit tests to verify the current duplication is visible**

Run: `npm run test:unit -- tests/unit/ledger/application/queries/list-ledger-entries.test.ts tests/unit/source-document/server-actions/create.test.ts`

Expected: Existing tests should pass, but this run gives the baseline before refactoring duplicated parse logic out of the application layer.

- [ ] **Step 3: Refactor to one parse step per boundary**

```ts
// list-ledger-entries.ts
const validated = parseListLedgerEntriesInput(params);
return listLedgerEntriesFromValidatedInput(ledgerId, validated);

// list-source-document-page.ts
const parsed = parseListSourceDocumentsInput(params);
return listSourceDocumentsFromValidatedInput(ledgerId, parsed);

// create-and-queue-source-document.ts
const validated = parseCreateSourceDocumentInput(parsePayload);
```

Implementation notes:

- Prefer adding explicit parse helpers to existing contract modules over repeating `safeParse()` blocks.
- Keep use-case/query internals working with validated data types only.
- Do not move validation back down into helper functions after extraction.

- [ ] **Step 4: Run the targeted tests**

Run: `npm run test:unit -- tests/unit/ledger/application/queries/list-ledger-entries.test.ts tests/unit/source-document/server-actions/create.test.ts tests/unit/modules/currency/contract-schemas.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/ledger/contract-schemas.ts src/modules/ledger/application/queries/list-ledger-entries.ts src/modules/source-document/contract-schemas.ts src/modules/source-document/application/queries/list-source-document-page.ts src/modules/source-document/application/use-cases/create-and-queue-source-document.ts
git commit -m "refactor: parse validated inputs once per boundary"
```

### Task 3: Stop leaking source-document state helpers through the public barrel

**Files:**
- Modify: `src/modules/source-document/queries.ts`
- Modify: `src/modules/stats/application/queries/get-enhanced-stats.ts`
- Modify: `src/modules/task-queue/application/queries/get-task-queue.ts`
- Modify: `src/modules/task-queue/application/use-cases/cancel-task.ts`
- Modify: `src/modules/workspace/application/queries/get-ledger-page-bootstrap.ts`

- [ ] **Step 1: Write the failing boundary test if needed**

```ts
// Prefer using the existing feature-boundaries and barrel governance tests.
```

- [ ] **Step 2: Run the boundary tests**

Run: `npm run test:unit -- tests/unit/eslint/feature-boundaries.test.ts tests/unit/eslint/module-root-barrels.test.ts`

Expected: PASS baseline before changing the public barrel.

- [ ] **Step 3: Remove persistence helper re-exports from the public entrypoint**

```ts
export {
  listSourceDocuments,
  getSourceDocumentCollection,
  getPendingSourceDocuments,
  getSourceDocumentFull,
} from "./application/queries/source-document-queries";
```

Implementation notes:

- Delete the re-exports for `deletedSourceDocumentPatch`, `sourceDocumentNotDeletedCondition`, `whereSourceDocumentNotDeleted`, and `whereSourceDocumentNotDeletedId`.
- Update any internal call sites to import `./application/source-document-state` relatively instead of reaching back through the public barrel.
- Update cross-module callers that currently import these helpers through `@/modules/source-document/queries` to import the narrow internal source-document-state module or an equivalent local helper explicitly.
- Do not add a new public helper to replace the removed internals.

- [ ] **Step 4: Run the targeted tests**

Run: `npm run test:unit -- tests/unit/eslint/feature-boundaries.test.ts tests/unit/eslint/module-root-barrels.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/source-document/queries.ts src/modules/stats/application/queries/get-enhanced-stats.ts src/modules/task-queue/application/queries/get-task-queue.ts src/modules/task-queue/application/use-cases/cancel-task.ts src/modules/workspace/application/queries/get-ledger-page-bootstrap.ts
git commit -m "refactor: remove source document state leaks from public barrel"
```

### Task 4: Move auto-categorize invalidation into a dedicated ledger hook

**Files:**
- Create: `src/modules/ledger/hooks/useAutoCategorizeMutation.ts`
- Modify: `src/modules/ledger/ui/SettingsTab.tsx`
- Create: `tests/unit/modules/ledger/hooks/useAutoCategorizeMutation.test.ts`

- [ ] **Step 1: Write the failing hook test**

```ts
it("invalidates uncategorized count and task queue in onSettled", async () => {
  const { result } = renderHook(() => useAutoCategorizeMutation("ledger-1"));

  await result.current.mutateAsync();

  expect(submitAutoCategorizeActionMock).toHaveBeenCalledWith("ledger-1");
  expect(invalidateQueriesMock).toHaveBeenCalledWith({
    queryKey: queryKeys.uncategorizedCount("ledger-1"),
  });
  expect(invalidateQueriesMock).toHaveBeenCalledWith({
    queryKey: queryKeys.taskQueue("ledger-1"),
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- tests/unit/modules/ledger/hooks/useAutoCategorizeMutation.test.ts`

Expected: FAIL because the hook does not exist and `SettingsTab.tsx` still performs manual invalidation inline.

- [ ] **Step 3: Create the hook and wire `SettingsTab` to use it**

```ts
export function useAutoCategorizeMutation(ledgerId: string) {
  return useLedgerMutation<
    { submittedCount: number; skippedCount: number },
    void
  >(ledgerId, {
    mutationFn: async () => submitAutoCategorizeAction(ledgerId),
    successMessage: null,
    errorMessage: "error",
    skipInvalidation: true,
    onSettledExtra: async (queryClient) => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.uncategorizedCount(ledgerId),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.taskQueue(ledgerId),
      });
    },
  });
}
```

Implementation notes:

- Let the hook own both submission and post-settled invalidation.
- `SettingsTab.tsx` should only call the hook and consume its result.
- Do not reintroduce ad hoc `queryClient.invalidateQueries(...)` calls in the component after extracting the hook.

- [ ] **Step 4: Run the targeted tests**

Run: `npm run test:unit -- tests/unit/modules/ledger/hooks/useAutoCategorizeMutation.test.ts tests/unit/components/SettingsTab.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/ledger/hooks/useAutoCategorizeMutation.ts src/modules/ledger/ui/SettingsTab.tsx tests/unit/modules/ledger/hooks/useAutoCategorizeMutation.test.ts
git commit -m "refactor: move auto categorize into ledger mutation hook"
```
