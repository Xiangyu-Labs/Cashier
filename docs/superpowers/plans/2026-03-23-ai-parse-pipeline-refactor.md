# AI Parse Pipeline Complexity Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the document AI parse chain so `pipeline.ts`, `stage1-executor.ts`, and `stage2-executor.ts` become thin orchestration shells while preserving current parsing behavior, anomaly handling, and public contracts.

**Architecture:** Keep the existing stage order and runtime contracts exactly as they are: Stage 0 vision enrichment, Stage 1 pre-analysis, Stage 1.5 validation, and Stage 2 detailed parsing. Move pure input-building, result-interpretation, normalization, comparison, and arbitration logic into small local modules inside `parse-source-document` so the orchestration files only express sequencing, progress updates, cancellation boundaries, and logging.

**Tech Stack:** TypeScript, Vitest, Zod, existing `AIContext`, existing parse-source-document modules

---

## Scope Check

This plan is intentionally scoped to one subsystem:

- `src/modules/source-document/application/parse-source-document/`

It does **not** redesign the AI architecture, change prompts, replace dual-GPT arbitration, or introduce a generic workflow engine. The target is implementation complexity, not product behavior.

## File Map

- `src/modules/source-document/application/parse-source-document/pipeline.ts`
  - Final pipeline shell. Owns stage ordering, progress messages, logging side effects, and top-level cancellation handling only.
- `src/modules/source-document/application/parse-source-document/pipeline-stage-inputs.ts`
  - New pure builders for Stage 1, Stage 1.5, and Stage 2 inputs. No logging, no AI calls, no DB access.
- `src/modules/source-document/application/parse-source-document/pipeline-stage-decisions.ts`
  - New pure rules for interpreting Stage 1 / Stage 1.5 / Stage 2 outputs into `ParsePipelineResult` branches.
- `src/modules/source-document/application/parse-source-document/stage1-executor.ts`
  - Final Stage 1 shell. Owns batch sequencing, message-content creation, and cancellation boundary only.
- `src/modules/source-document/application/parse-source-document/stage1-task-runners.ts`
  - New AI task wrappers for validity, completeness, currency, category, title, and user-requirements calls.
- `src/modules/source-document/application/parse-source-document/stage1-result-policy.ts`
  - New pure Stage 1 result compiler that turns individual task outputs into the existing Stage 1 union result shape.
- `src/modules/source-document/application/parse-source-document/stage2-executor.ts`
  - Final Stage 2 shell. Owns message-content creation, dual parse sequencing, and arbitration branching only.
- `src/modules/source-document/application/parse-source-document/stage2-result-policy.ts`
  - New pure Stage 2 helpers for output schema, normalized parse results, entry comparison, and success output assembly.
- `src/modules/source-document/application/parse-source-document/stage2-arbitration.ts`
  - New arbitration prompt builder and arbitration runner for Stage 2.
- `tests/unit/modules/source-document/application/parse-source-document/pipeline-stage-helpers.test.ts`
  - New direct tests for pure pipeline input builders and stage-decision helpers.
- `tests/unit/modules/source-document/application/parse-source-document/pipeline.test.ts`
  - Existing pipeline guardrail tests. Keep green while moving helpers out of `pipeline.ts`.
- `tests/unit/modules/source-document/application/parse-source-document/stage1-result-policy.test.ts`
  - New direct tests for Stage 1 result compilation logic.
- `tests/unit/modules/source-document/application/parse-source-document/stage1-executor.test.ts`
  - Existing Stage 1 orchestration guardrails. Keep green while extracting task runners.
- `tests/unit/modules/source-document/application/parse-source-document/stage2-result-policy.test.ts`
  - New direct tests for Stage 2 comparison and output normalization logic.
- `tests/unit/modules/source-document/application/parse-source-document/stage2-executor.test.ts`
  - Existing Stage 2 orchestration guardrails. Keep green while extracting arbitration helpers.

## Design Constraints

- Preserve these exported runtime contracts:
  - `runParsePipeline`
  - `executeStage1`
  - `executeStage2`
  - `executeParseSourceDocument`
- Preserve current progress copy:
  - `正在读取图片...`
  - `正在分析单据信息...`
  - `正在核对分析结果...`
  - `正在生成账单条目...`
- Preserve current anomaly reasons and title fallback behavior unless an added test proves a bug and the implementation intentionally fixes it.
- Do **not** modify Stage 0 vision, Stage 1.5 prompt semantics, or Stage 2 prompt semantics as part of this refactor.
- Do **not** introduce a config-driven stage engine, reducers, or reusable AI orchestration framework.
- Keep new files local to `parse-source-document/`; this is a local decomposition, not a cross-module abstraction pass.

### Task 1: Extract Pipeline Input Builders And Stage Decision Rules

**Files:**
- Create: `src/modules/source-document/application/parse-source-document/pipeline-stage-inputs.ts`
- Create: `src/modules/source-document/application/parse-source-document/pipeline-stage-decisions.ts`
- Create: `tests/unit/modules/source-document/application/parse-source-document/pipeline-stage-helpers.test.ts`
- Modify: `src/modules/source-document/application/parse-source-document/pipeline.ts`
- Modify: `tests/unit/modules/source-document/application/parse-source-document/pipeline.test.ts`

- [ ] **Step 1: Write the failing pure-helper tests**

Create `tests/unit/modules/source-document/application/parse-source-document/pipeline-stage-helpers.test.ts` with direct tests for input building and branch decisions.

```ts
import { describe, expect, it } from "vitest";
import type { ParseSourceDocumentInput } from "@/modules/source-document/application/tasks/parse-source-document";
import type { Stage1Results, ValidationSummary } from "@/modules/source-document/application/parse-source-document/types";
import {
  buildStage1Input,
  buildStage1ValidationInput,
  buildStage2Input,
} from "@/modules/source-document/application/parse-source-document/pipeline-stage-inputs";
import {
  resolveStage1ExecutionResult,
  resolveStage1ValidationResult,
  resolveStage2ExecutionResult,
} from "@/modules/source-document/application/parse-source-document/pipeline-stage-decisions";

const baseInput: ParseSourceDocumentInput = {
  ledgerId: "ledger-1",
  sourceDocumentId: "doc-1",
  categories: [{ id: "cat-1", name: "Food", description: "Meals" }],
  settings: { aiCustomPrompt: "merge meals" },
  text: "Lunch 10 USD",
  imageUrls: ["https://example.com/doc.png"],
  aiLanguage: "en-US",
  preferredCurrencies: ["USD"],
};

const baseStage1Results: Stage1Results = {
  validity: { is_valid: true, reasoning: "valid" },
  currency: { currencies: ["USD"], reasoning: "symbol" },
  category: { categories: ["Food"], reasoning: "meal" },
  title: { title: "Lunch" },
};

const baseValidationSummary: ValidationSummary = {
  is_reasonable: true,
  summary: {
    title: "Lunch",
    currencies: [{ code: "USD", hint: "$" }],
    categories: [{ name: "Food", hint: "meal" }],
  },
};

describe("pipeline-stage helpers", () => {
  it("builds stage 1.5 and stage 2 inputs without duplicating mapping logic", () => {
    expect(buildStage1Input(baseInput, "vision summary")).toEqual({
      text: "Lunch 10 USD",
      imageUrls: ["https://example.com/doc.png"],
      visionDescription: "vision summary",
      aiLanguage: "en-US",
      preferredCurrencies: ["USD"],
      aiCustomPrompt: "merge meals",
      categories: [{ name: "Food", description: "Meals" }],
    });

    expect(buildStage1ValidationInput(baseInput, "vision summary", baseStage1Results)).toEqual({
      text: "Lunch 10 USD",
      imageUrls: ["https://example.com/doc.png"],
      visionDescription: "vision summary",
      aiLanguage: "en-US",
      stage1Results: baseStage1Results,
    });

    expect(buildStage2Input(baseInput, "vision summary", baseValidationSummary)).toEqual({
      text: "Lunch 10 USD",
      imageUrls: ["https://example.com/doc.png"],
      visionDescription: "vision summary",
      aiLanguage: "en-US",
      validationSummary: baseValidationSummary,
      originalCategories: [{ name: "Food", description: "Meals" }],
    });
  });

  it("turns unknown currencies into an anomaly before stage 1.5", () => {
    const result = resolveStage1ExecutionResult(
      {
        isValid: true,
        isIncomplete: false,
        results: {
          ...baseStage1Results,
          currency: { currencies: ["unknown"], reasoning: "unclear" },
        },
      },
    );

    expect(result).toEqual({
      kind: "anomaly",
      anomalyReason: "Unable to recognize currency type",
    });
  });

  it("uses the validation rejection reason when stage 1.5 vetoes the result", () => {
    expect(
      resolveStage1ValidationResult({
        is_reasonable: false,
        rejection_reason: "Currency mismatch",
      })
    ).toEqual({
      kind: "anomaly",
      anomalyReason: "Currency mismatch",
    });
  });

  it("maps a stage 2 anomaly into the pipeline anomaly branch", () => {
    expect(resolveStage2ExecutionResult({ kind: "anomaly", reason: "Both wrong" })).toEqual({
      kind: "anomaly",
      anomalyReason: "Parsing results diverged",
    });
  });
});
```

- [ ] **Step 2: Run the new pipeline helper tests to verify they fail**

Run: `npm run test:unit -- tests/unit/modules/source-document/application/parse-source-document/pipeline-stage-helpers.test.ts`
Expected: FAIL with module resolution errors because `pipeline-stage-inputs.ts` and `pipeline-stage-decisions.ts` do not exist yet.

- [ ] **Step 3: Implement the pure builder and decision modules**

Create the two helper files with concrete functions instead of leaving mapping logic inline in `pipeline.ts`.

```ts
// pipeline-stage-inputs.ts
import type { ParseSourceDocumentInput } from "../tasks/parse-source-document";
import type { Stage1Input } from "./stage1-executor";
import type { Stage1Results, ValidationSummary } from "./types";
import type { ValidationInput } from "./stage1-5-validator";
import type { Stage2Input } from "./stage2-executor";

export function buildStage1Input(
  input: ParseSourceDocumentInput,
  visionDescription: string | undefined
): Stage1Input {
  return {
    categories: input.categories.map((category) => ({
      name: category.name,
      description: category.description ?? null,
    })),
    ...(input.text !== undefined ? { text: input.text } : {}),
    ...(input.imageUrls !== undefined ? { imageUrls: input.imageUrls } : {}),
    ...(visionDescription !== undefined ? { visionDescription } : {}),
    ...(input.aiLanguage !== undefined ? { aiLanguage: input.aiLanguage } : {}),
    ...(input.preferredCurrencies !== undefined
      ? { preferredCurrencies: input.preferredCurrencies }
      : {}),
    ...(input.settings.aiCustomPrompt !== undefined
      ? { aiCustomPrompt: input.settings.aiCustomPrompt }
      : {}),
  };
}

export function buildStage1ValidationInput(
  input: ParseSourceDocumentInput,
  visionDescription: string | undefined,
  stage1Results: Stage1Results
): ValidationInput {
  return {
    stage1Results,
    ...(input.text !== undefined ? { text: input.text } : {}),
    ...(input.imageUrls !== undefined ? { imageUrls: input.imageUrls } : {}),
    ...(visionDescription !== undefined ? { visionDescription } : {}),
    ...(input.aiLanguage !== undefined ? { aiLanguage: input.aiLanguage } : {}),
  };
}

export function buildStage2Input(
  input: ParseSourceDocumentInput,
  visionDescription: string | undefined,
  validationSummary: ValidationSummary
): Stage2Input {
  return {
    validationSummary,
    originalCategories: input.categories.map((category) => ({
      name: category.name,
      description: category.description ?? null,
    })),
    ...(input.text !== undefined ? { text: input.text } : {}),
    ...(input.imageUrls !== undefined ? { imageUrls: input.imageUrls } : {}),
    ...(visionDescription !== undefined ? { visionDescription } : {}),
    ...(input.aiLanguage !== undefined ? { aiLanguage: input.aiLanguage } : {}),
  };
}
```

```ts
// pipeline-stage-decisions.ts
import { convertToParsedEntries } from "./result-mapper";
import type { ParsePipelineResult } from "./contracts";
import type { Stage1Results, ValidationSummary } from "./types";
import type { Stage2ExecutionResult } from "./stage2-executor";

type RawStage1Execution =
  | { isValid: false; title: string }
  | { isValid: true; isIncomplete: true; incompleteReason?: string; title: string }
  | { isValid: true; isIncomplete: false; results: Stage1Results };

function isUnknownCurrency(currency: string): boolean {
  const normalized = currency.trim().toLowerCase();
  return normalized === "" || normalized === "unknown" || normalized === "undefined";
}

export function resolveStage1ExecutionResult(
  stage1Result: RawStage1Execution
):
  | Extract<ParsePipelineResult, { kind: "invalid" | "anomaly" }>
  | { kind: "continue"; results: Stage1Results } {
  if (!stage1Result.isValid) {
    return { kind: "invalid", title: stage1Result.title };
  }

  if (stage1Result.isIncomplete) {
    return {
      kind: "anomaly",
      anomalyReason: stage1Result.incompleteReason ?? "Content incomplete",
      title: stage1Result.title,
    };
  }

  if (stage1Result.results.currency.currencies.some(isUnknownCurrency)) {
    return {
      kind: "anomaly",
      anomalyReason: "Unable to recognize currency type",
    };
  }

  return { kind: "continue", results: stage1Result.results };
}

export function resolveStage1ValidationResult(
  validationResult: ValidationSummary
):
  | Extract<ParsePipelineResult, { kind: "anomaly" }>
  | { kind: "continue"; validationResult: ValidationSummary } {
  if (!validationResult.is_reasonable) {
    return {
      kind: "anomaly",
      anomalyReason: validationResult.rejection_reason ?? "Pre-analysis results invalid",
    };
  }

  return { kind: "continue", validationResult };
}

export function resolveStage2ExecutionResult(
  stage2Result: Stage2ExecutionResult
): Extract<ParsePipelineResult, { kind: "success" | "anomaly" }> {
  if (stage2Result.kind === "anomaly") {
    return {
      kind: "anomaly",
      anomalyReason: "Parsing results diverged",
    };
  }

  return {
    kind: "success",
    title: stage2Result.output.title,
    ledgerEntries: convertToParsedEntries(stage2Result.output.entries),
  };
}
```

- [ ] **Step 4: Slim `pipeline.ts` down to orchestration only**

Update `pipeline.ts` so it imports these helpers and only sequences the stages, logging around the decision results.

```ts
import {
  buildStage1Input,
  buildStage1ValidationInput,
  buildStage2Input,
} from "./pipeline-stage-inputs";
import {
  resolveStage1ExecutionResult,
  resolveStage1ValidationResult,
  resolveStage2ExecutionResult,
} from "./pipeline-stage-decisions";

const stage1Decision = resolveStage1ExecutionResult(stage1RawResult);
if (stage1Decision.kind !== "continue") {
  logger.info({ docId: ctx.docId, kind: stage1Decision.kind }, "Stage 1 finished early");
  return stage1Decision;
}

const validationInput = buildStage1ValidationInput(input, visionDescription, stage1Decision.results);
const stage2Input = buildStage2Input(input, visionDescription, validationDecision.validationResult);
const stage2Decision = resolveStage2ExecutionResult(await executeStage2(stage2Input, ctx.ai));
return stage2Decision;
```

Move the `buildStage1Input` import in `tests/unit/modules/source-document/application/parse-source-document/pipeline.test.ts` to `pipeline-stage-inputs.ts` so the existing test suite follows the new home of that pure helper.

- [ ] **Step 5: Re-run the pipeline-focused tests**

Run: `npm run test:unit -- tests/unit/modules/source-document/application/parse-source-document/pipeline-stage-helpers.test.ts tests/unit/modules/source-document/application/parse-source-document/pipeline.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/modules/source-document/application/parse-source-document/pipeline-stage-inputs.ts \
  src/modules/source-document/application/parse-source-document/pipeline-stage-decisions.ts \
  src/modules/source-document/application/parse-source-document/pipeline.ts \
  tests/unit/modules/source-document/application/parse-source-document/pipeline-stage-helpers.test.ts \
  tests/unit/modules/source-document/application/parse-source-document/pipeline.test.ts
git commit -m "refactor: extract parse pipeline stage helpers"
```

### Task 2: Split Stage 1 Into Task Runners And A Pure Result Policy

**Files:**
- Create: `src/modules/source-document/application/parse-source-document/stage1-task-runners.ts`
- Create: `src/modules/source-document/application/parse-source-document/stage1-result-policy.ts`
- Create: `tests/unit/modules/source-document/application/parse-source-document/stage1-result-policy.test.ts`
- Modify: `src/modules/source-document/application/parse-source-document/stage1-executor.ts`
- Test: `tests/unit/modules/source-document/application/parse-source-document/stage1-executor.test.ts`

- [ ] **Step 1: Write the failing Stage 1 result-policy tests**

Create direct tests for the pure result compiler before extracting code.

```ts
import { describe, expect, it } from "vitest";
import {
  finalizeStage1Execution,
  haveSameStringMembers,
} from "@/modules/source-document/application/parse-source-document/stage1-result-policy";

describe("stage1-result-policy", () => {
  it("returns an incomplete result without incompleteReason when the issue is blank", () => {
    const result = finalizeStage1Execution({
      validity: { is_valid: true, reasoning: "valid" },
      completeness: { is_complete: false, issue: "" },
      currency: { currencies: ["CNY"], reasoning: "symbol" },
      category: { categories: ["餐饮"], reasoning: "meal" },
      title: { title: "午餐" },
      userRequirements: undefined,
    });

    expect(result).toEqual({
      isValid: true,
      isIncomplete: true,
      title: "午餐",
    });
  });

  it("treats string lists with the same members in different order as equal", () => {
    expect(haveSameStringMembers(["USD", "CNY"], ["CNY", "USD"])).toBe(true);
    expect(haveSameStringMembers(["USD"], ["USD", "CNY"])).toBe(false);
  });
});
```

- [ ] **Step 2: Run the new Stage 1 policy tests to verify they fail**

Run: `npm run test:unit -- tests/unit/modules/source-document/application/parse-source-document/stage1-result-policy.test.ts`
Expected: FAIL because `stage1-result-policy.ts` does not exist yet.

- [ ] **Step 3: Extract the task runners and the pure result compiler**

Move AI-call wrappers into `stage1-task-runners.ts` and put only result-shaping rules in `stage1-result-policy.ts`.

```ts
// stage1-task-runners.ts
import { parseJsonResponse } from "@/lib/ai/response-parser";
import { runDualGptWithArbitration } from "@/lib/ai/dual-gpt-runner";
import type { AIContext } from "@/lib/flow/types";
import type {
  ValidityCheckOutput,
  CompletenessCheckOutput,
  CurrencyRecognitionOutput,
  CategoryRecognitionOutput,
  TitleExtractionOutput,
  UserRequirementsOutput,
} from "./types";
import {
  validitySchema,
  completenessSchema,
  currencySchema,
  categorySchema,
  titleSchema,
  rulesSchema,
} from "./schemas";
import {
  buildValidityCheckPrompt,
  buildCompletenessCheckPrompt,
  buildCurrencyRecognitionPrompt,
  buildCategoryRecognitionPrompt,
  buildTitleExtractionPrompt,
  buildUserRequirementsPrompt,
} from "./stage1-prompts";
import type { MessageContentPart } from "./message-content";

export function haveSameStringMembers(left: string[], right: string[]): boolean {
  return [...left].sort().join("|") === [...right].sort().join("|");
}

export async function runCurrencyTask(
  messageContent: MessageContentPart[],
  aiLanguage: string | undefined,
  preferredCurrencies: string[] | undefined,
  ai: AIContext
): Promise<CurrencyRecognitionOutput> {
  const result = await runDualGptWithArbitration<CurrencyRecognitionOutput>({
    taskName: "Currency Recognition - Identify currencies in the document",
    prompt: buildCurrencyRecognitionPrompt(aiLanguage, preferredCurrencies),
    messageContent,
    schema: currencySchema,
    ai,
    model: "text",
    compareResults: (r1, r2) => haveSameStringMembers(r1.currencies, r2.currencies),
  });
  return result.result;
}
```

```ts
// stage1-result-policy.ts
import type {
  ValidityCheckOutput,
  CompletenessCheckOutput,
  CurrencyRecognitionOutput,
  CategoryRecognitionOutput,
  TitleExtractionOutput,
  UserRequirementsOutput,
  Stage1Results,
} from "./types";

export { haveSameStringMembers } from "./stage1-task-runners";

export function finalizeStage1Execution({
  validity,
  completeness,
  currency,
  category,
  title,
  userRequirements,
}: {
  validity: ValidityCheckOutput;
  completeness: CompletenessCheckOutput;
  currency: CurrencyRecognitionOutput;
  category: CategoryRecognitionOutput;
  title: TitleExtractionOutput;
  userRequirements: UserRequirementsOutput | undefined;
}):
  | { isValid: true; isIncomplete: true; incompleteReason?: string; title: string }
  | { isValid: true; isIncomplete: false; results: Stage1Results } {
  if (!completeness.is_complete) {
    return {
      isValid: true,
      isIncomplete: true,
      title: title.title,
      ...(completeness.issue != null && completeness.issue !== ""
        ? { incompleteReason: completeness.issue }
        : {}),
    };
  }

  return {
    isValid: true,
    isIncomplete: false,
    results: {
      validity,
      currency,
      category,
      title,
      ...(userRequirements != null ? { userRequirements } : {}),
    },
  };
}
```

- [ ] **Step 4: Reduce `stage1-executor.ts` to sequencing only**

Update `stage1-executor.ts` so the file only:

- builds message content
- runs the first batch (`validity` + `title`)
- enforces the cancellation boundary
- runs the second batch (`completeness`, `currency`, `category`, `user requirements`)
- calls `finalizeStage1Execution`

The file should read roughly like this:

```ts
const messageContent = buildMessageContent(input.text, input.imageUrls, input.visionDescription);

const [validityResult, titleResult] = await Promise.all([
  runValidityTask(messageContent, input.aiLanguage, ai),
  runTitleTask(messageContent, input.aiLanguage, ai),
]);

if (!validityResult.is_valid) {
  return { isValid: false, title: titleResult.title };
}

throwIfCancelled(signal);

const [completenessResult, currencyResult, categoryResult, userReqResult] = await Promise.all([
  runCompletenessTask(messageContent, input.aiLanguage, ai),
  runCurrencyTask(messageContent, input.aiLanguage, input.preferredCurrencies, ai),
  runCategoryTask(messageContent, input.aiLanguage, input.categories, ai),
  runUserRequirementsTask(messageContent, input.aiLanguage, input.aiCustomPrompt, ai),
]);

return finalizeStage1Execution({
  validity: validityResult,
  completeness: completenessResult,
  currency: currencyResult,
  category: categoryResult,
  title: titleResult,
  userRequirements: userReqResult,
});
```

- [ ] **Step 5: Run the Stage 1 tests**

Run: `npm run test:unit -- tests/unit/modules/source-document/application/parse-source-document/stage1-result-policy.test.ts tests/unit/modules/source-document/application/parse-source-document/stage1-executor.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/modules/source-document/application/parse-source-document/stage1-task-runners.ts \
  src/modules/source-document/application/parse-source-document/stage1-result-policy.ts \
  src/modules/source-document/application/parse-source-document/stage1-executor.ts \
  tests/unit/modules/source-document/application/parse-source-document/stage1-result-policy.test.ts
git commit -m "refactor: split stage 1 execution policy"
```

### Task 3: Extract Stage 2 Result Policy And Arbitration Helpers

**Files:**
- Create: `src/modules/source-document/application/parse-source-document/stage2-result-policy.ts`
- Create: `src/modules/source-document/application/parse-source-document/stage2-arbitration.ts`
- Create: `tests/unit/modules/source-document/application/parse-source-document/stage2-result-policy.test.ts`
- Modify: `src/modules/source-document/application/parse-source-document/stage2-executor.ts`
- Test: `tests/unit/modules/source-document/application/parse-source-document/stage2-executor.test.ts`

- [ ] **Step 1: Write the failing Stage 2 policy tests**

Create direct tests for comparison and output assembly before extracting helpers.

```ts
import { describe, expect, it } from "vitest";
import {
  compareParsedEntries,
  buildStage2SuccessOutput,
} from "@/modules/source-document/application/parse-source-document/stage2-result-policy";

describe("stage2-result-policy", () => {
  it("treats reordered entries with matching grouped totals as equal", () => {
    expect(
      compareParsedEntries(
        [
          { item_name: "Lunch", amount: 10, currency: "USD", category_index: 1, notes: null },
          { item_name: "Tip", amount: 2, currency: "USD", category_index: 1, notes: null },
        ],
        [
          { item_name: "Tip", amount: 2, currency: "USD", category_index: 1, notes: null },
          { item_name: "Lunch", amount: 10, currency: "USD", category_index: 1, notes: null },
        ]
      )
    ).toBe(true);
  });

  it("falls back to Untitled when validation summary has no title", () => {
    expect(
      buildStage2SuccessOutput(
        [{ item_name: "Lunch", amount: 10, currency: "USD", category_index: 1, notes: null }],
        "Parsed",
        undefined,
        false
      ).title
    ).toBe("Untitled");
  });
});
```

- [ ] **Step 2: Run the new Stage 2 policy tests to verify they fail**

Run: `npm run test:unit -- tests/unit/modules/source-document/application/parse-source-document/stage2-result-policy.test.ts`
Expected: FAIL because `stage2-result-policy.ts` does not exist yet.

- [ ] **Step 3: Extract Stage 2 normalization, comparison, and arbitration helpers**

Create the two helper files with explicit ownership boundaries.

```ts
// stage2-result-policy.ts
import { z } from "zod";
import type { ParsedEntry } from "./types";
import type { Stage2Output } from "./stage2-executor";

const entrySchema = z.object({
  item_name: z.string(),
  amount: z.number(),
  currency: z.string(),
  category_index: z.number().int().min(0),
  entry_date: z.string().optional(),
  notes: z.string().nullable(),
});

export const stage2ParseOutputSchema = z.object({
  ledger_entries: z.array(entrySchema),
  reasoning: z.string(),
});

export type NormalizedStage2ParseResult = {
  ledger_entries: ParsedEntry[];
  reasoning: string;
};

export function normalizeStage2ParseResult(
  output: z.infer<typeof stage2ParseOutputSchema>
): NormalizedStage2ParseResult {
  return {
    ledger_entries: output.ledger_entries.map((entry) => ({
      item_name: entry.item_name,
      amount: entry.amount,
      currency: entry.currency,
      category_index: entry.category_index,
      notes: entry.notes,
      ...(entry.entry_date !== undefined ? { entry_date: entry.entry_date } : {}),
    })),
    reasoning: output.reasoning,
  };
}

export function compareParsedEntries(left: ParsedEntry[], right: ParsedEntry[]): boolean {
  if (left.length !== right.length) return false;

  const groupTotals = (entries: ParsedEntry[]) =>
    entries.reduce<Record<string, number>>((groups, entry) => {
      const key = `${entry.currency}:${entry.category_index}`;
      groups[key] = (groups[key] ?? 0) + entry.amount;
      return groups;
    }, {});

  const leftTotals = groupTotals(left);
  const rightTotals = groupTotals(right);
  const leftKeys = Object.keys(leftTotals).sort();
  const rightKeys = Object.keys(rightTotals).sort();

  if (leftKeys.join("|") !== rightKeys.join("|")) {
    return false;
  }

  return leftKeys.every((key) => Math.abs((leftTotals[key] ?? 0) - (rightTotals[key] ?? 0)) <= 0.01);
}

export function buildStage2SuccessOutput(
  entries: ParsedEntry[],
  reasoning: string,
  title: string | undefined,
  wasArbitrated: boolean
): Stage2Output {
  return {
    entries,
    title: title ?? "Untitled",
    reasoning,
    wasArbitrated,
  };
}
```

```ts
// stage2-arbitration.ts
import { z } from "zod";
import { parseJsonResponse } from "@/lib/ai/response-parser";
import type { AIContext } from "@/lib/flow/types";
import type { ParsedEntry } from "./types";
import type { MessageContentPart } from "./message-content";

const arbitrationSchema = z.object({
  choice: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  reason: z.string().optional(),
});

export type Stage2ArbitrationCandidate = {
  ledger_entries: ParsedEntry[];
  reasoning: string;
};

export function buildStage2ArbitrationPrompt(
  result1: Stage2ArbitrationCandidate,
  result2: Stage2ArbitrationCandidate
): string {
  return `You are an arbitration AI for financial document parsing.

### Task Description
Determine which parsing result is more accurate for the given financial document.

### GPT 1 Result
${JSON.stringify(result1, null, 2)}

### GPT 2 Result
${JSON.stringify(result2, null, 2)}

### Your Task
Compare the two results and determine which is more accurate.
- Return choice: 1 to use GPT 1's result
- Return choice: 2 to use GPT 2's result
- Return choice: 0 if both have fundamental issues (mark as anomaly)

Look for:
- Correct amounts matching the document
- Proper categorization
- Reasonable date handling

### Output (raw JSON only)
{"choice": 1 | 2 | 0, "reason": "..."}`;
}

export async function arbitrateStage2Results(
  ai: AIContext,
  messageContent: MessageContentPart[],
  result1: Stage2ArbitrationCandidate,
  result2: Stage2ArbitrationCandidate
) {
  const response = await ai.generate({
    prompt: buildStage2ArbitrationPrompt(result1, result2),
    messages: [{ role: "user", content: messageContent }],
    requireJson: true,
    model: "text",
  });

  const arbitrationResult = parseJsonResponse(response.content, arbitrationSchema);
  if (arbitrationResult.choice === 0) {
    return { kind: "anomaly" as const, reason: arbitrationResult.reason ?? "Both parsing results invalid" };
  }

  return {
    kind: "chosen" as const,
    result: arbitrationResult.choice === 1 ? result1 : result2,
  };
}
```

- [ ] **Step 4: Reduce `stage2-executor.ts` to orchestration only**

Update `stage2-executor.ts` so it:

- builds `messageContent`
- builds the detailed parse prompt
- makes the two parse calls
- normalizes outputs via `stage2-result-policy.ts`
- uses `compareParsedEntries`
- delegates arbitration to `stage2-arbitration.ts`
- assembles the final success output via `buildStage2SuccessOutput`

The end state should read like this:

```ts
const [response1, response2] = await Promise.all([
  ai.generate({ prompt, messages: [{ role: "user", content: messageContent }], requireJson: true, model: "text" }),
  ai.generate({ prompt, messages: [{ role: "user", content: messageContent }], requireJson: true, model: "text" }),
]);

const result1 = normalizeStage2ParseResult(parseJsonResponse(response1.content, stage2ParseOutputSchema));
const result2 = normalizeStage2ParseResult(parseJsonResponse(response2.content, stage2ParseOutputSchema));

if (compareParsedEntries(result1.ledger_entries, result2.ledger_entries)) {
  return {
    kind: "success",
    output: buildStage2SuccessOutput(
      result1.ledger_entries,
      result1.reasoning,
      input.validationSummary.summary?.title,
      false
    ),
  };
}
```

- [ ] **Step 5: Run the Stage 2 tests**

Run: `npm run test:unit -- tests/unit/modules/source-document/application/parse-source-document/stage2-result-policy.test.ts tests/unit/modules/source-document/application/parse-source-document/stage2-executor.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/modules/source-document/application/parse-source-document/stage2-result-policy.ts \
  src/modules/source-document/application/parse-source-document/stage2-arbitration.ts \
  src/modules/source-document/application/parse-source-document/stage2-executor.ts \
  tests/unit/modules/source-document/application/parse-source-document/stage2-result-policy.test.ts
git commit -m "refactor: extract stage 2 comparison and arbitration"
```

### Task 4: Re-lock Failure Modes At The Orchestration Level And Run The Full Guardrail Slice

**Files:**
- Modify: `tests/unit/modules/source-document/application/parse-source-document/pipeline.test.ts`
- Modify: `src/modules/source-document/application/parse-source-document/pipeline.ts`
- Modify: `src/modules/source-document/application/parse-source-document/stage1-executor.ts`
- Modify: `src/modules/source-document/application/parse-source-document/stage2-executor.ts`
- Test: `tests/unit/modules/source-document/application/parse-source-document/stage1-5-validator.test.ts`

- [ ] **Step 1: Add failing orchestration regression tests for the subtle failure modes**

Extend `tests/unit/modules/source-document/application/parse-source-document/pipeline.test.ts` with the branch cases that should remain obvious after the refactor:

```ts
it("returns anomaly when stage 1 detects an unknown currency marker", async () => {
  const { ai } = createMultiStageMockAI({ currencies: ["unknown"] });

  const result = await executeParseSourceDocument(createInput(), createStageContext(ai));

  expect(result.verificationStatus).toBe("anomaly");
  expect(result.anomalyReason).toBe("Unable to recognize currency type");
});

it("returns cancelled when the pipeline aborts between stage batches", async () => {
  const controller = new AbortController();
  const { ai } = createMultiStageMockAI({});
  const ctx = buildStageContext({
    signal: controller.signal,
    ai,
    setProgress: vi.fn(async (message: string) => {
      if (message === "正在核对分析结果...") {
        controller.abort();
      }
    }),
    docId: "source-doc-1",
    ledgerId: "ledger-1",
  });

  const result = await runParsePipeline(createInput(), ctx);
  expect(result).toEqual({ kind: "cancelled" });
});
```

- [ ] **Step 2: Run the pipeline guardrail suite to verify the new assertions fail or expose gaps**

Run: `npm run test:unit -- tests/unit/modules/source-document/application/parse-source-document/pipeline.test.ts`
Expected: FAIL until the refactored shells preserve the exact failure-mode behavior end-to-end.

- [ ] **Step 3: Make the smallest orchestration-only fixes needed to restore the behavior**

Allowed fixes in this step:

- restore a missing anomaly/title mapping in `pipeline.ts`
- restore a missing cancellation boundary in `stage1-executor.ts`
- restore a missing title fallback or anomaly propagation in `stage2-executor.ts`

Do **not** reopen the helper modules to add new abstractions here unless the failing test proves a real omission.

- [ ] **Step 4: Run the full parse-source-document unit slice**

Run: `npm run test:unit -- tests/unit/modules/source-document/application/parse-source-document/pipeline-stage-helpers.test.ts tests/unit/modules/source-document/application/parse-source-document/pipeline.test.ts tests/unit/modules/source-document/application/parse-source-document/stage1-result-policy.test.ts tests/unit/modules/source-document/application/parse-source-document/stage1-executor.test.ts tests/unit/modules/source-document/application/parse-source-document/stage1-5-validator.test.ts tests/unit/modules/source-document/application/parse-source-document/stage2-result-policy.test.ts tests/unit/modules/source-document/application/parse-source-document/stage2-executor.test.ts`
Expected: PASS

- [ ] **Step 5: Run targeted lint on the touched parse-source-document files**

Run: `npx eslint src/modules/source-document/application/parse-source-document/*.ts tests/unit/modules/source-document/application/parse-source-document/*.ts`
Expected: PASS with no errors

- [ ] **Step 6: Commit**

```bash
git add src/modules/source-document/application/parse-source-document/pipeline.ts \
  src/modules/source-document/application/parse-source-document/stage1-executor.ts \
  src/modules/source-document/application/parse-source-document/stage2-executor.ts \
  tests/unit/modules/source-document/application/parse-source-document/pipeline.test.ts
git commit -m "test: relock parse pipeline failure modes"
```

## Done Criteria

- `pipeline.ts` no longer owns stage-specific input mapping or business-rule classification.
- `stage1-executor.ts` no longer owns AI prompt/schema details and result-shape rules in the same file.
- `stage2-executor.ts` no longer mixes normalization, comparison heuristics, prompt construction, and orchestration in one file.
- Existing public behavior is preserved by the focused guardrail suite.
- New pure helper tests make future rule changes visible without forcing engineers to reason through the whole AI chain.

## Execution Notes

- Work in a dedicated worktree before implementation.
- Keep commits task-scoped and do not batch multiple tasks into one commit.
- If a helper type is only used by one new file pair, keep it local to that pair instead of pushing it into `types.ts`.
- If a new failing test reveals a real behavioral bug, fix it in the smallest responsible task and update the commit message accordingly.
