# Source Document Stable Title Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure every source document parse result produces a stable non-empty title across success, invalid, and anomaly outcomes, without surfacing schema failures caused by missing/null titles.

**Architecture:** Keep `title` and parse reason separate. Accept unstable raw AI title values (`null`, missing, blank) at the parser boundary, normalize them into a stable title, then preserve that normalized title through the pipeline variants that currently drop it for `invalid` and `anomaly`. Persistence already stores title separately from anomalyReason; this change ensures those branches finally receive a title to store.

**Tech Stack:** TypeScript, Vitest, Zod, Next.js server-side task pipeline

---

## File Map

- Modify: `src/modules/source-document/application/parse-source-document/parser-schema.ts`
  - Accept nullable/missing raw titles at the AI boundary and normalize them into stable non-empty titles.
- Modify: `src/modules/source-document/application/parse-source-document/pipeline.ts`
  - Preserve normalized titles for `invalid` and `anomaly` outcomes instead of dropping them.
- Modify: `src/modules/source-document/application/parse-source-document/result-mapper.ts`
  - Ensure task output includes title for all non-cancelled outcomes.
- Test: `tests/unit/modules/source-document/application/parse-source-document/pipeline.test.ts`
  - Add failing coverage for invalid/anomaly inputs with `title: null`, missing title, and blank title.
- Test: `tests/unit/modules/source-document/application/parse-source-document/result-mapper.test.ts`
  - Update mapper expectations so invalid/anomaly outputs include title.
- Test: `tests/unit/modules/source-document/application/parse-source-document/parse-result-handler.test.ts`
  - Add coverage that invalid/anomaly documents persist title independently from anomalyReason.

---

### Task 1: Lock down the missing-title bug with failing unit tests

**Files:**
- Modify: `tests/unit/modules/source-document/application/parse-source-document/pipeline.test.ts`
- Reference: `src/modules/source-document/application/parse-source-document/pipeline.ts`
- Reference: `src/modules/source-document/application/parse-source-document/parser-schema.ts`

- [ ] **Step 1: Add a failing test for `invalid` with `title: null`**

```ts
it("returns invalid with a fallback title when AI sends title null", async () => {
  const { ai } = createMockAI({
    stage0Result: {
      ...SIMPLE_STAGE0_RESULT,
      outcome: "invalid",
      title: null,
      ledger_entries: [],
      receipt_totals: [],
    },
  });

  const result = await runParsePipeline(createInput({ text: "今天天气很好出去散步了" }), buildCtx(ai));

  expect(result).toMatchObject({
    kind: "invalid",
    title: expect.any(String),
  });
  if (result.kind === "invalid") {
    expect(result.title.trim().length).toBeGreaterThan(0);
  }
});
```

- [ ] **Step 2: Add a failing test for `anomaly` with blank title**

```ts
it("returns anomaly with a fallback title when AI sends blank title", async () => {
  const { ai } = createMockAI({
    stage0Result: {
      ...SIMPLE_STAGE0_RESULT,
      outcome: "anomaly",
      title: "   ",
      anomaly_reason: "Image too blurry",
      ledger_entries: [],
      receipt_totals: [],
    },
  });

  const result = await runParsePipeline(createInput(), buildCtx(ai));

  expect(result).toMatchObject({
    kind: "anomaly",
    anomalyReason: "Image too blurry",
    title: expect.any(String),
  });
});
```

- [ ] **Step 3: Add a failing test for `invalid` with missing title**

```ts
it("returns invalid with a fallback title when AI omits title", async () => {
  const { ai } = createMockAI({
    stage0Result: {
      outcome: "invalid",
      receipt_count: 1,
      receipt_totals: [],
      ledger_entries: [],
      order_adjustments: [],
      reasoning: "Not a receipt",
    },
  });

  const result = await runParsePipeline(createInput({ text: "今天天气很好出去散步了" }), buildCtx(ai));

  expect(result).toMatchObject({
    kind: "invalid",
    title: expect.any(String),
  });
});
```

- [ ] **Step 4: Run the focused unit tests and verify they fail for the right reason**

Run:
```bash
npx vitest run tests/unit/modules/source-document/application/parse-source-document/pipeline.test.ts
```

Expected: FAIL because current code either rejects `title: null` at schema validation or returns invalid/anomaly results without a propagated title.

---

### Task 2: Normalize unstable raw titles at the parser boundary

**Files:**
- Modify: `src/modules/source-document/application/parse-source-document/parser-schema.ts`

- [ ] **Step 1: Expand the raw parser schema to accept unstable AI title values**

```ts
export const parserOutputSchema = z.object({
  outcome: z.enum(["success", "invalid", "anomaly"]).default("success"),
  anomaly_reason: z.string().nullish(),
  title: z.string().nullish(),
  receipt_count: z.number().int().min(0).default(1),
  receipt_totals: z.array(receiptTotalSchema).default([]),
  ledger_entries: z.array(ledgerEntrySchema).default([]),
  order_adjustments: z.array(orderAdjustmentSchema).default([]),
  reasoning: z.string(),
});
```

- [ ] **Step 2: Add explicit title normalization with per-outcome fallback strings**

```ts
function fallbackTitleForOutcome(output: z.infer<typeof parserOutputSchema>): string {
  switch (output.outcome) {
    case "invalid":
      return "Invalid content";
    case "anomaly":
      return "Unparseable document";
    default:
      return "Untitled document";
  }
}

function normalizeTitle(output: z.infer<typeof parserOutputSchema>): string {
  const title = output.title?.trim();
  return title != null && title !== "" ? title : fallbackTitleForOutcome(output);
}
```

- [ ] **Step 3: Route all normalized outputs through the title normalizer**

```ts
return {
  outcome: output.outcome,
  ...(output.anomaly_reason != null ? { anomaly_reason: output.anomaly_reason } : {}),
  title: normalizeTitle(output),
  receipt_count: output.receipt_count,
  ...
};
```

- [ ] **Step 4: Re-run the focused unit tests**

Run:
```bash
npx vitest run tests/unit/modules/source-document/application/parse-source-document/pipeline.test.ts
```

Expected: parser boundary no longer fails on `title: null`; remaining failures should now be about missing invalid/anomaly title propagation.

---

### Task 3: Preserve title through invalid/anomaly pipeline variants

**Files:**
- Modify: `src/modules/source-document/application/parse-source-document/pipeline.ts`
- Modify: `src/modules/source-document/application/parse-source-document/result-mapper.ts`
- Test: `tests/unit/modules/source-document/application/parse-source-document/result-mapper.test.ts`

- [ ] **Step 1: Update the pipeline result contract where title is currently dropped**

```ts
export type ParsePipelineResult =
  | { kind: "success"; title: string; ledgerEntries: ParsedLedgerEntry[]; wasArbitrated: boolean }
  | { kind: "invalid"; title: string }
  | { kind: "anomaly"; title: string; anomalyReason: string }
  | { kind: "cancelled" };
```

- [ ] **Step 2: Preserve normalized title in `resolveOutcome()`**

```ts
if (result.outcome === "invalid") {
  return { kind: "invalid", title: result.title };
}
if (result.outcome === "anomaly") {
  return {
    kind: "anomaly",
    title: result.title,
    anomalyReason: result.anomaly_reason ?? "Document cannot be parsed",
  };
}
```

- [ ] **Step 3: Update `toParseSourceDocumentOutput()` so invalid/anomaly outputs include title**

```ts
case "invalid":
  return {
    ledgerEntries: [],
    title: result.title,
    verificationStatus: "invalid",
  };
case "anomaly":
  return {
    ledgerEntries: [],
    title: result.title,
    anomalyReason: result.anomalyReason,
    verificationStatus: "anomaly",
  };
```

- [ ] **Step 4: Add mapper tests for invalid/anomaly title propagation**

```ts
it("maps invalid results to invalid output with title", () => {
  const result: ParsePipelineResult = { kind: "invalid", title: "Chat screenshot" };

  expect(toParseSourceDocumentOutput(result)).toEqual({
    ledgerEntries: [],
    title: "Chat screenshot",
    verificationStatus: "invalid",
  });
});

it("maps anomaly results to anomaly output with title", () => {
  const result: ParsePipelineResult = {
    kind: "anomaly",
    title: "Blurred receipt",
    anomalyReason: "Image too blurry",
  };

  expect(toParseSourceDocumentOutput(result)).toEqual({
    ledgerEntries: [],
    title: "Blurred receipt",
    anomalyReason: "Image too blurry",
    verificationStatus: "anomaly",
  });
});
```

- [ ] **Step 5: Run the focused pipeline + mapper tests**

Run:
```bash
npx vitest run tests/unit/modules/source-document/application/parse-source-document/pipeline.test.ts tests/unit/modules/source-document/application/parse-source-document/result-mapper.test.ts
```

Expected: PASS.

---

### Task 4: Verify persistence keeps title separate from reason

**Files:**
- Modify: `tests/unit/modules/source-document/application/parse-source-document/parse-result-handler.test.ts`
- Reference: `src/modules/source-document/application/parse-source-document/parse-result-handler.ts`

- [ ] **Step 1: Add a test that invalid verification stores title independently from reason**

```ts
it("stores title for invalid documents while keeping Invalid content as anomalyReason", async () => {
  const db = getTestDb();
  const { ledgerId } = await createTestUserWithLedger(db);
  const doc = await createSourceDocument(ledgerId);

  await handleParseResult({
    ledgerId,
    sourceDocumentId: doc.id,
    parsedEntries: [],
    title: "Chat screenshot",
    verificationStatus: "invalid",
    categories: [],
  });

  const refreshed = await db.query.sourceDocuments.findFirst({ where: eq(sourceDocuments.id, doc.id) });
  expect(refreshed).toMatchObject({
    status: "anomaly",
    title: "Chat screenshot",
    anomalyReason: "Invalid content",
  });
});
```

- [ ] **Step 2: Add a test that anomaly verification stores both title and custom reason**

```ts
it("stores title and anomalyReason for anomaly documents", async () => {
  const db = getTestDb();
  const { ledgerId } = await createTestUserWithLedger(db);
  const doc = await createSourceDocument(ledgerId);

  await handleParseResult({
    ledgerId,
    sourceDocumentId: doc.id,
    parsedEntries: [],
    title: "Blurred receipt",
    anomalyReason: "Image too blurry",
    verificationStatus: "anomaly",
    categories: [],
  });

  const refreshed = await db.query.sourceDocuments.findFirst({ where: eq(sourceDocuments.id, doc.id) });
  expect(refreshed).toMatchObject({
    status: "anomaly",
    title: "Blurred receipt",
    anomalyReason: "Image too blurry",
  });
});
```

- [ ] **Step 3: Confirm no production change is needed in `handleParseResult()` beyond receiving the propagated title**

Current behavior should remain intentional:
- invalid/anomaly documents persist as `status: "anomaly"`
- `title` identifies the document
- `anomalyReason` explains why it was not parsed normally

- [ ] **Step 4: Run the focused handler tests**

Run:
```bash
npx vitest run tests/unit/modules/source-document/application/parse-source-document/parse-result-handler.test.ts
```

Expected: PASS.

---

### Task 5: Final verification for the changed contracts

**Files:**
- No additional production files expected

- [ ] **Step 1: Run the full targeted verification set**

Run:
```bash
npx vitest run tests/unit/modules/source-document/application/parse-source-document/pipeline.test.ts tests/unit/modules/source-document/application/parse-source-document/result-mapper.test.ts tests/unit/modules/source-document/application/parse-source-document/parse-result-handler.test.ts
```

Expected: PASS.

- [ ] **Step 2: Optionally run the task-level integration spec as a confidence check**

Run:
```bash
npx vitest run tests/integration/modules/source-document/application/tasks/parse-source-document.test.ts
```

Expected: PASS. This is verification only, not required to implement the fix.

- [ ] **Step 3: Run lint if formatting/type confidence is needed**

Run:
```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 4: Review final diff for scope control**

Run:
```bash
git diff -- src/modules/source-document/application/parse-source-document tests/unit/modules/source-document/application/parse-source-document
```

Expected: Only parser-schema normalization, invalid/anomaly title propagation, and matching tests.
