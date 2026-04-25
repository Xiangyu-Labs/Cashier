# Single-Pass Receipt Parse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current Stage 0 → Stage 1 → Stage 2 receipt parse pipeline with a single-pass Stage 0 parser that returns final structured results on the first call, escalates to dual-run only for complex documents, and preserves text-only, image-only, and mixed-input support.

**Architecture:** Collapse validity classification and detailed parsing into a new vision-capable Stage 0 result schema, then let `pipeline.ts` orchestrate three branches only: accept first-pass result, perform a second identical parse for complex documents, or arbitrate when the two complex results disagree. Extend the parse result contract so receipt grouping and `order_adjustments` survive mapping, validation, and persistence instead of being silently dropped.

**Tech Stack:** TypeScript, Vitest, Zod, existing `AIContext`, existing parse-source-document modules, existing source-document persistence flow

---

## Scope Check

This plan covers one subsystem only:

- `src/modules/source-document/application/parse-source-document/`
- its direct output contract in `src/lib/ai/types.ts`
- the source-document parse persistence path that consumes parsed results

It does **not** redesign unrelated ledger UX, category semantics, exchange-rate logic, or the task engine.

## File Map

### Create
- `src/modules/source-document/application/parse-source-document/stage0-schema.ts`
  - Owns the new Zod schema, normalized Stage 0 output type, result comparison helpers, and `shouldDualRun()` policy.
- `src/modules/source-document/application/parse-source-document/stage0-arbitration.ts`
  - Owns arbitration prompt creation and arbitration execution against the original user input.
- `tests/unit/modules/source-document/application/parse-source-document/stage0-schema.test.ts`
  - Direct tests for normalization, comparison, and dual-run decisions.
- `tests/unit/modules/source-document/application/parse-source-document/stage0-arbitration.test.ts`
  - Direct tests for arbitration routing and result handling.

### Modify
- `src/modules/source-document/application/parse-source-document/types.ts`
  - Replace `DocumentUnderstanding`-centric types with final parse types (`ParsedEntry`, `OrderAdjustment`, `ReceiptTotal`, `Stage0ParseOutput`).
- `src/modules/source-document/application/parse-source-document/stage0-vision.ts`
  - Replace OCR-summary behavior with final parse execution, shared multimodal/text-only message construction, schema validation, and normalization.
- `src/modules/source-document/application/parse-source-document/pipeline.ts`
  - Replace three-stage sequencing with first-pass parse, optional second pass, and optional arbitration.
- `src/modules/source-document/application/parse-source-document/pipeline-stage-decisions.ts`
  - Interpret `success` / `invalid` / `anomaly` results from the new Stage 0 output shape.
- `src/modules/source-document/application/parse-source-document/pipeline-stage-inputs.ts`
  - Reduce to small helpers for first-pass input and arbitration input, or delete if fully subsumed.
- `src/modules/source-document/application/parse-source-document/result-mapper.ts`
  - Map `receipt_index` and `order_adjustments` into the public parse output contract without losing adjustment rows.
- `src/lib/ai/types.ts`
  - Extend `ParsedLedgerEntry` with `receiptIndex?: number` and an explicit adjustment marker field.
- `src/modules/source-document/application/parse-source-document/contracts.ts`
  - Keep pipeline result branches stable while carrying richer successful output as needed.
- `src/modules/source-document/application/parse-source-document/parse-result-handler.ts`
  - Persist richer parsed results without dropping adjustment entries.
- `src/modules/source-document/application/parse-source-document/entry-builder.ts`
  - Validate and translate adjustment rows safely into insertable ledger entries or dedicated persistence payloads.
- `tests/unit/modules/source-document/application/parse-source-document/pipeline.test.ts`
  - Update orchestration coverage for first-pass success, complex dual-run, and arbitration.
- `tests/unit/modules/source-document/application/parse-source-document/result-mapper.test.ts`
  - Add mapping coverage for receipt indices and adjustment rows.
- `tests/unit/modules/source-document/application/parse-source-document/parse-result-handler.test.ts`
  - Add persistence regression coverage for adjustment handling.
- `tests/unit/modules/source-document/application/parse-source-document/stage0-vision.test.ts`
  - Replace old `DocumentUnderstanding` assertions with final-output assertions.
- `tests/smoke/parse-pipeline.smoke.test.ts`
  - Align the smoke suite with the new result shape while preserving existing text-only/image-only coverage.

### Delete
- `src/modules/source-document/application/parse-source-document/stage1-executor.ts`
- `src/modules/source-document/application/parse-source-document/stage1-prompts.ts`
- `src/modules/source-document/application/parse-source-document/schemas.ts`
- `src/modules/source-document/application/parse-source-document/stage2-executor.ts`
- `src/modules/source-document/application/parse-source-document/stage2-prompts.ts`
- `src/modules/source-document/application/parse-source-document/stage2-result-policy.ts`
- `src/modules/source-document/application/parse-source-document/stage2-arbitration.ts`
- `src/modules/source-document/application/parse-source-document/message-content.ts`
- `tests/unit/modules/source-document/application/parse-source-document/stage1-executor.test.ts`
- `tests/unit/modules/source-document/application/parse-source-document/stage2-executor.test.ts`
- `tests/unit/modules/source-document/application/parse-source-document/stage2-result-policy.test.ts`

## Design Constraints

- Preserve support for **text-only**, **image-only**, and **mixed** source-document input.
- Preserve public task output branches: `passed`, `anomaly`, `invalid`.
- Keep `invalid` meaning “not a financial document” and `anomaly` meaning “financial but unparseable”.
- Make `order_adjustments` survive end-to-end instead of being dropped by positive-only entry filtering.
- Keep the first-pass parser authoritative for simple documents; do not reintroduce an intermediate OCR summary type.
- Do not let dual-run policy depend only on category output; it must derive from normalized parse result complexity.
- Do not claim success without targeted unit coverage and updated smoke coverage.

### Task 1: Define the new Stage 0 schema and complexity policy

**Files:**
- Create: `src/modules/source-document/application/parse-source-document/stage0-schema.ts`
- Modify: `src/modules/source-document/application/parse-source-document/types.ts`
- Create: `tests/unit/modules/source-document/application/parse-source-document/stage0-schema.test.ts`

- [ ] **Step 1: Write the failing schema-policy tests**

Create `tests/unit/modules/source-document/application/parse-source-document/stage0-schema.test.ts` with direct tests for normalization, equality, and complex-document escalation.

```ts
import { describe, expect, it } from "vitest";
import {
  compareResults,
  normalizeResult,
  shouldDualRun,
  stage0ParseOutputSchema,
} from "@/modules/source-document/application/parse-source-document/stage0-schema";

const simpleSuccess = {
  outcome: "success",
  title: "Coffee",
  receipt_count: 1,
  receipt_totals: [{ receipt_index: 0, amount: 12.5, currency: "USD" }],
  ledger_entries: [
    {
      receipt_index: 0,
      item_name: "Coffee",
      amount: 12.5,
      currency: "USD",
      category_index: 1,
      notes: null,
    },
  ],
  order_adjustments: [],
  reasoning: "single item",
};

describe("stage0-schema", () => {
  it("normalizes optional strings and preserves receipt-adjustment structure", () => {
    const parsed = normalizeResult(stage0ParseOutputSchema.parse(simpleSuccess));
    expect(parsed.ledger_entries[0]?.receipt_index).toBe(0);
    expect(parsed.order_adjustments).toEqual([]);
  });

  it("treats <=3 entries with one currency and no adjustments as simple", () => {
    expect(shouldDualRun(normalizeResult(stage0ParseOutputSchema.parse(simpleSuccess)))).toBe(false);
  });

  it("requires dual-run when multiple currencies or >3 entries are present", () => {
    const complex = normalizeResult(
      stage0ParseOutputSchema.parse({
        ...simpleSuccess,
        ledger_entries: [
          ...simpleSuccess.ledger_entries,
          { ...simpleSuccess.ledger_entries[0], item_name: "Tea" },
          { ...simpleSuccess.ledger_entries[0], item_name: "Cake" },
          { ...simpleSuccess.ledger_entries[0], item_name: "Tip" },
        ],
      })
    );
    expect(shouldDualRun(complex)).toBe(true);
  });

  it("compares receipt totals, entries, and adjustments instead of only grouped sums", () => {
    const left = normalizeResult(stage0ParseOutputSchema.parse(simpleSuccess));
    const right = normalizeResult(
      stage0ParseOutputSchema.parse({
        ...simpleSuccess,
        order_adjustments: [{ receipt_index: 0, item_name: "Discount", amount: -1, currency: "USD" }],
      })
    );
    expect(compareResults(left, right)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the schema-policy tests to verify they fail**

Run: `npm run test:unit -- tests/unit/modules/source-document/application/parse-source-document/stage0-schema.test.ts`
Expected: FAIL because `stage0-schema.ts` and the new types do not exist yet.

- [ ] **Step 3: Implement the schema and normalized result helpers**

Create `stage0-schema.ts` with Zod schemas and pure helpers.

```ts
import { z } from "zod";

const moneySchema = z.object({
  receipt_index: z.number().int().min(0),
  amount: z.number().nullable(),
  currency: z.string().min(3).max(3),
});

const ledgerEntrySchema = z.object({
  receipt_index: z.number().int().min(0),
  item_name: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().min(3).max(3),
  category_index: z.number().int().min(0),
  notes: z.string().nullish(),
});

const adjustmentSchema = z.object({
  receipt_index: z.number().int().min(0),
  item_name: z.string().min(1),
  amount: z.number(),
  currency: z.string().min(3).max(3),
});

export const stage0ParseOutputSchema = z.object({
  outcome: z.enum(["success", "anomaly", "invalid"]),
  anomaly_reason: z.string().nullish(),
  title: z.string().default("Untitled"),
  receipt_count: z.number().int().min(0).default(0),
  receipt_totals: z.array(moneySchema).default([]),
  ledger_entries: z.array(ledgerEntrySchema).default([]),
  order_adjustments: z.array(adjustmentSchema).default([]),
  reasoning: z.string().default(""),
});

export function shouldDualRun(result: NormalizedStage0ParseResult): boolean {
  if (result.outcome !== "success") return false;
  const currencies = new Set([
    ...result.ledger_entries.map((entry) => entry.currency),
    ...result.order_adjustments.map((entry) => entry.currency),
  ]);
  return (
    result.receipt_count > 1 ||
    result.ledger_entries.length > 3 ||
    currencies.size > 1 ||
    result.order_adjustments.length > 0
  );
}
```

- [ ] **Step 4: Run the schema-policy tests to verify they pass**

Run: `npm run test:unit -- tests/unit/modules/source-document/application/parse-source-document/stage0-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/source-document/application/parse-source-document/types.ts \
  src/modules/source-document/application/parse-source-document/stage0-schema.ts \
  tests/unit/modules/source-document/application/parse-source-document/stage0-schema.test.ts
git commit -m "feat: add unified stage0 parse schema"
```

### Task 2: Rebuild Stage 0 execution as the final parser

**Files:**
- Modify: `src/modules/source-document/application/parse-source-document/stage0-vision.ts`
- Modify: `tests/unit/modules/source-document/application/parse-source-document/stage0-vision.test.ts`

- [ ] **Step 1: Write the failing Stage 0 executor tests**

Replace old `DocumentUnderstanding` expectations with final-result expectations.

```ts
it("parses image input directly into final structured output", async () => {
  const result = await executeStage0(
    { imageUrls: ["/api/uploads/receipt.jpg"], aiLanguage: "zh-CN" },
    ai,
  );

  expect(result.outcome).toBe("success");
  expect(result.ledger_entries[0]?.item_name).toBe("Lunch");
  expect(result.receipt_totals[0]?.currency).toBe("CNY");
});

it("supports text-only input without loading images", async () => {
  const result = await executeStage0({ text: "Taxi fare SGD 28.00" }, ai);
  expect(result.outcome).toBe("success");
  expect(result.ledger_entries[0]?.currency).toBe("SGD");
});
```

- [ ] **Step 2: Run the Stage 0 executor tests to verify they fail**

Run: `npm run test:unit -- tests/unit/modules/source-document/application/parse-source-document/stage0-vision.test.ts`
Expected: FAIL because the executor still returns `DocumentUnderstanding` and does not accept text-only input.

- [ ] **Step 3: Implement the new Stage 0 parser executor**

Rewrite `stage0-vision.ts` so one executor can build content for text-only, image-only, and mixed input, call the vision tier when images exist, call the text tier when they do not, then validate via `stage0ParseOutputSchema`.

```ts
export interface Stage0Input {
  text?: string;
  imageUrls?: string[];
  aiLanguage?: string;
  preferredCurrencies?: string[];
  originalCategories: { name: string; description: string | null }[];
  aiCustomPrompt?: string;
}

const model = hasImages ? "vision" : "text";
const response = await ai.generate({
  prompt: buildStage0Prompt({ ...input }),
  messages: [{ role: "user", content }],
  requireJson: true,
  model,
});

return normalizeResult(parseJsonResponse(response.content, stage0ParseOutputSchema));
```

- [ ] **Step 4: Run the Stage 0 executor tests to verify they pass**

Run: `npm run test:unit -- tests/unit/modules/source-document/application/parse-source-document/stage0-vision.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/source-document/application/parse-source-document/stage0-vision.ts \
  tests/unit/modules/source-document/application/parse-source-document/stage0-vision.test.ts
git commit -m "feat: make stage0 parse final structured output"
```

### Task 3: Replace the pipeline with first-pass / dual-run / arbitration orchestration

**Files:**
- Modify: `src/modules/source-document/application/parse-source-document/pipeline.ts`
- Create: `src/modules/source-document/application/parse-source-document/stage0-arbitration.ts`
- Modify: `src/modules/source-document/application/parse-source-document/pipeline-stage-decisions.ts`
- Modify: `src/modules/source-document/application/parse-source-document/pipeline-stage-inputs.ts`
- Modify: `tests/unit/modules/source-document/application/parse-source-document/pipeline.test.ts`
- Create: `tests/unit/modules/source-document/application/parse-source-document/stage0-arbitration.test.ts`

- [ ] **Step 1: Write the failing orchestration tests**

Add tests that assert:
- simple success returns after one parse call
- complex success performs two parse calls
- disagreement triggers arbitration with original input
- `invalid` short-circuits without dual-run

```ts
it("returns immediately for simple documents", async () => {
  const { ai, generate } = createPipelineMockAI({ firstResultComplex: false });
  const result = await runParsePipeline(createInput(), buildCtx(ai));
  expect(result.kind).toBe("success");
  expect(generate.mock.calls.filter((c) => c[0].prompt.includes("receipt and invoice parser"))).toHaveLength(1);
});

it("arbitrates complex disagreements against original input", async () => {
  const { ai, generate } = createPipelineMockAI({ forceDisagreement: true });
  await runParsePipeline(createInput(), buildCtx(ai));
  const arbitrationCall = generate.mock.calls.find((c) => c[0].prompt.includes("arbitration AI for financial document parsing"));
  expect(arbitrationCall?.[0].messages[0]?.content).toBeDefined();
});
```

- [ ] **Step 2: Run the orchestration tests to verify they fail**

Run: `npm run test:unit -- tests/unit/modules/source-document/application/parse-source-document/pipeline.test.ts tests/unit/modules/source-document/application/parse-source-document/stage0-arbitration.test.ts`
Expected: FAIL because the pipeline still references Stage 1 / Stage 2 modules.

- [ ] **Step 3: Implement the new pipeline and arbitration runner**

Rewrite `pipeline.ts` around one parse executor and optional arbitration.

```ts
const first = await executeStage0(stage0Input, ctx.ai);
const firstDecision = resolveStage0Result(first);
if (firstDecision.kind !== "continue") return firstDecision;
if (!shouldDualRun(first)) return resolveStage0Success(first, false);

const second = await executeStage0(stage0Input, ctx.ai);
if (compareResults(first, second)) return resolveStage0Success(first, false);

const chosen = await arbitrateStage0Results({ input: stage0Input, result1: first, result2: second }, ctx.ai);
return resolveStage0ArbitratedResult(chosen);
```

Delete Stage 1 / Stage 2 imports and dead helper paths as part of this step.

- [ ] **Step 4: Run the orchestration tests to verify they pass**

Run: `npm run test:unit -- tests/unit/modules/source-document/application/parse-source-document/pipeline.test.ts tests/unit/modules/source-document/application/parse-source-document/stage0-arbitration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/source-document/application/parse-source-document/pipeline.ts \
  src/modules/source-document/application/parse-source-document/stage0-arbitration.ts \
  src/modules/source-document/application/parse-source-document/pipeline-stage-decisions.ts \
  src/modules/source-document/application/parse-source-document/pipeline-stage-inputs.ts \
  tests/unit/modules/source-document/application/parse-source-document/pipeline.test.ts \
  tests/unit/modules/source-document/application/parse-source-document/stage0-arbitration.test.ts
git commit -m "refactor: collapse parse pipeline into stage0 orchestration"
```

### Task 4: Extend output mapping and persistence for receipt indices and adjustments

**Files:**
- Modify: `src/lib/ai/types.ts`
- Modify: `src/modules/source-document/application/parse-source-document/result-mapper.ts`
- Modify: `src/modules/source-document/application/parse-source-document/parse-result-handler.ts`
- Modify: `src/modules/source-document/application/parse-source-document/entry-builder.ts`
- Modify: `tests/unit/modules/source-document/application/parse-source-document/result-mapper.test.ts`
- Modify: `tests/unit/modules/source-document/application/parse-source-document/parse-result-handler.test.ts`
- Modify: `tests/unit/modules/source-document/application/parse-source-document/entry-builder.test.ts`

- [ ] **Step 1: Write the failing mapping and persistence tests**

Add tests that prove:
- `receiptIndex` is preserved on mapped entries
- adjustment rows do not disappear during validation/build
- negative discount rows are stored using explicit adjustment metadata instead of being filtered out as invalid positives

```ts
it("maps receipt index and adjustment flag into ParsedLedgerEntry", () => {
  expect(convertToParsedEntries({
    ledgerEntries: [{ receipt_index: 1, item_name: "Meal", amount: 10, currency: "USD", category_index: 1, notes: null }],
    orderAdjustments: [{ receipt_index: 1, item_name: "Discount", amount: -2, currency: "USD" }],
  })).toEqual([
    expect.objectContaining({ itemName: "Meal", receiptIndex: 1, isAdjustment: false }),
    expect.objectContaining({ itemName: "Discount", receiptIndex: 1, isAdjustment: true, amount: -2 }),
  ]);
});
```

- [ ] **Step 2: Run the mapping and persistence tests to verify they fail**

Run: `npm run test:unit -- tests/unit/modules/source-document/application/parse-source-document/result-mapper.test.ts tests/unit/modules/source-document/application/parse-source-document/entry-builder.test.ts tests/unit/modules/source-document/application/parse-source-document/parse-result-handler.test.ts`
Expected: FAIL because the current contract strips receipt information and filters non-positive rows.

- [ ] **Step 3: Implement contract and persistence changes**

Update `ParsedLedgerEntry` and the parse handlers so adjustments are explicit data, not accidental negative ledger rows.

```ts
export interface ParsedLedgerEntry {
  itemName: string;
  amount: number;
  currency: string | null;
  categoryIndex: number;
  entryDate: string | null;
  notes?: string | null;
  receiptIndex?: number;
  isAdjustment?: boolean;
}
```

In `entry-builder.ts`, branch on `isAdjustment` instead of filtering strictly by `amount > 0`, and preserve negative values if the downstream persistence model is meant to store them. If persistence needs separate insert payloads for adjustments, create that payload explicitly here instead of overloading the existing positive-entry path.

- [ ] **Step 4: Run the mapping and persistence tests to verify they pass**

Run: `npm run test:unit -- tests/unit/modules/source-document/application/parse-source-document/result-mapper.test.ts tests/unit/modules/source-document/application/parse-source-document/entry-builder.test.ts tests/unit/modules/source-document/application/parse-source-document/parse-result-handler.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/types.ts \
  src/modules/source-document/application/parse-source-document/result-mapper.ts \
  src/modules/source-document/application/parse-source-document/parse-result-handler.ts \
  src/modules/source-document/application/parse-source-document/entry-builder.ts \
  tests/unit/modules/source-document/application/parse-source-document/result-mapper.test.ts \
  tests/unit/modules/source-document/application/parse-source-document/entry-builder.test.ts \
  tests/unit/modules/source-document/application/parse-source-document/parse-result-handler.test.ts
git commit -m "feat: persist receipt metadata and order adjustments"
```

### Task 5: Remove dead stages and refresh smoke coverage

**Files:**
- Delete: `src/modules/source-document/application/parse-source-document/stage1-executor.ts`
- Delete: `src/modules/source-document/application/parse-source-document/stage1-prompts.ts`
- Delete: `src/modules/source-document/application/parse-source-document/schemas.ts`
- Delete: `src/modules/source-document/application/parse-source-document/stage2-executor.ts`
- Delete: `src/modules/source-document/application/parse-source-document/stage2-prompts.ts`
- Delete: `src/modules/source-document/application/parse-source-document/stage2-result-policy.ts`
- Delete: `src/modules/source-document/application/parse-source-document/stage2-arbitration.ts`
- Delete: `src/modules/source-document/application/parse-source-document/message-content.ts`
- Delete: `tests/unit/modules/source-document/application/parse-source-document/stage1-executor.test.ts`
- Delete: `tests/unit/modules/source-document/application/parse-source-document/stage2-executor.test.ts`
- Delete: `tests/unit/modules/source-document/application/parse-source-document/stage2-result-policy.test.ts`
- Modify: `tests/smoke/parse-pipeline.smoke.test.ts`

- [ ] **Step 1: Write the smoke and cleanup assertions first**

Update `tests/smoke/parse-pipeline.smoke.test.ts` so the helper assertions still verify totals/currencies but also accept richer success output. Add at least one smoke assertion that a text-only case still succeeds after the refactor.

```ts
it("text-only taxi fare still parses after the pipeline collapse", async () => {
  const result = await runParsePipeline(baseInput({ text: "Taxi fare SGD 28.00" }), stageCtx);
  assertSuccess(result, { total: 28, currency: "SGD", minEntries: 1 });
});
```

- [ ] **Step 2: Run targeted unit and smoke suites before deleting files**

Run: `npm run test:unit -- tests/unit/modules/source-document/application/parse-source-document`
Expected: PASS before the delete step, confirming the new pipeline is fully covered.

- [ ] **Step 3: Delete dead Stage 1 / Stage 2 files and update imports**

Remove dead files and any remaining imports or references so the tree matches the new architecture.

```bash
rm src/modules/source-document/application/parse-source-document/stage1-executor.ts
rm src/modules/source-document/application/parse-source-document/stage1-prompts.ts
rm src/modules/source-document/application/parse-source-document/schemas.ts
rm src/modules/source-document/application/parse-source-document/stage2-executor.ts
rm src/modules/source-document/application/parse-source-document/stage2-prompts.ts
rm src/modules/source-document/application/parse-source-document/stage2-result-policy.ts
rm src/modules/source-document/application/parse-source-document/stage2-arbitration.ts
rm src/modules/source-document/application/parse-source-document/message-content.ts
rm tests/unit/modules/source-document/application/parse-source-document/stage1-executor.test.ts
rm tests/unit/modules/source-document/application/parse-source-document/stage2-executor.test.ts
rm tests/unit/modules/source-document/application/parse-source-document/stage2-result-policy.test.ts
```

- [ ] **Step 4: Run verification for the full parse subsystem**

Run:
- `npm run test:unit -- tests/unit/modules/source-document/application/parse-source-document`
- `SMOKE_TESTS=1 npm run test -- tests/smoke/parse-pipeline.smoke.test.ts`

Expected:
- Unit suite PASS
- Smoke suite PASS with existing image-only, text-only, mixed-input, invalid, and anomaly scenarios

- [ ] **Step 5: Commit**

```bash
git add src/modules/source-document/application/parse-source-document \
  tests/unit/modules/source-document/application/parse-source-document \
  tests/smoke/parse-pipeline.smoke.test.ts
git commit -m "refactor: remove legacy parse stages"
```

## Final Verification Checklist

- [ ] `npm run test:unit -- tests/unit/modules/source-document/application/parse-source-document`
- [ ] `SMOKE_TESTS=1 npm run test -- tests/smoke/parse-pipeline.smoke.test.ts`
- [ ] `npm run lint -- src/modules/source-document/application/parse-source-document src/lib/ai/types.ts tests/unit/modules/source-document/application/parse-source-document tests/smoke/parse-pipeline.smoke.test.ts`
- [ ] Confirm no imports remain for `stage1-*`, `stage2-*`, `schemas.ts`, or `message-content.ts`
- [ ] Confirm text-only, image-only, and mixed-input cases all still route through the new Stage 0 entry point
- [ ] Confirm adjustment rows are not silently discarded in validation or persistence

## Notes For The Implementer

- Keep `shouldDualRun()` in `stage0-schema.ts` pure and deterministic so it is trivial to test and reason about.
- Treat arbitration as a correctness fallback, not a normalization step; normalization must happen before comparison.
- If adjustment persistence forces a schema change beyond the current parse subsystem, stop and split that work into a follow-up spec/plan rather than improvising persistence semantics mid-task.
