# Parse Pipeline Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有三阶段解析流程（Stage 0 OCR + Stage 1 validity + Stage 2 dual-run parse）重构为两阶段（Stage 0 combined vision+parse + 可选 dual-run），提升解析质量、减少 token 消耗、支持多账单和订单级调整。

**Architecture:** Stage 0 使用视觉模型，同时完成 OCR 和解析，直接输出最终 ledger_entries。当 entry 数量 > 3 或货币种类 > 1 时，触发第二次相同调用，比较结果，不一致时仲裁。删除原 Stage 1（validity check）和原 Stage 2，由新 Stage 0 统一承担。

**Tech Stack:** TypeScript, Zod, OpenAI/Gemini vision model, Vitest

---

## File Map

### 删除
- `src/modules/source-document/application/parse-source-document/stage1-executor.ts`
- `src/modules/source-document/application/parse-source-document/stage1-prompts.ts`
- `src/modules/source-document/application/parse-source-document/schemas.ts`
- `src/modules/source-document/application/parse-source-document/stage2-executor.ts`
- `src/modules/source-document/application/parse-source-document/stage2-prompts.ts`
- `src/modules/source-document/application/parse-source-document/stage2-arbitration.ts`
- `src/modules/source-document/application/parse-source-document/stage2-result-policy.ts`
- `src/modules/source-document/application/parse-source-document/message-content.ts`

### 修改
- `src/modules/source-document/application/parse-source-document/types.ts` — 替换为新输出类型
- `src/modules/source-document/application/parse-source-document/stage0-vision.ts` — 完全重写 prompt 和输出结构
- `src/modules/source-document/application/parse-source-document/pipeline.ts` — 重写流程：Stage 0 → 判断是否 dual-run → 可选仲裁
- `src/modules/source-document/application/parse-source-document/pipeline-stage-decisions.ts` — 重写决策逻辑
- `src/modules/source-document/application/parse-source-document/pipeline-stage-inputs.ts` — 删除 Stage 1 input builder，简化 Stage 0 input builder
- `src/modules/source-document/application/parse-source-document/contracts.ts` — 不变（ParsePipelineResult 已包含 invalid/anomaly/success/cancelled）
- `src/modules/source-document/application/parse-source-document/result-mapper.ts` — 扩展支持 receipt_index、order_adjustments
- `src/lib/ai/types.ts` — ParsedLedgerEntry 加 receiptIndex、orderAdjustments

### 新建
- `src/modules/source-document/application/parse-source-document/stage0-schema.ts` — Zod schema + normalize + compare + arbitration prompt
- `src/modules/source-document/application/parse-source-document/stage0-arbitration.ts` — 仲裁逻辑

### 测试
- `tests/smoke/parse-pipeline.smoke.test.ts` — 更新断言，加多账单 case
- `tests/unit/modules/source-document/stage0-schema.test.ts` — 新建，测试 schema 和 compare 逻辑

---

## Task 1: 定义新类型和 Zod Schema

**Files:**
- Modify: `src/modules/source-document/application/parse-source-document/types.ts`
- Create: `src/modules/source-document/application/parse-source-document/stage0-schema.ts`
- Create: `tests/unit/modules/source-document/stage0-schema.test.ts`

- [ ] **Step 1: 更新 types.ts，替换旧类型**

```typescript
// src/modules/source-document/application/parse-source-document/types.ts

export interface ParsedEntry {
  receipt_index: number;
  item_name: string;
  amount: number;
  currency: string;
  category_index: number;
  notes: string | null;
}

export interface OrderAdjustment {
  receipt_index: number;
  description: string;
  amount: number; // 负数=优惠，正数=费用
  currency: string;
}

export interface ReceiptTotal {
  receipt_index: number;
  currency: string;
  total: number | null;
}

export interface Stage0ParseOutput {
  outcome: "success" | "anomaly" | "invalid";
  anomaly_reason?: string;
  receipt_count: number;
  title?: string;
  ledger_entries: ParsedEntry[];
  order_adjustments?: OrderAdjustment[];
  receipt_totals?: ReceiptTotal[];
  reasoning: string;
}
```

- [ ] **Step 2: 新建 stage0-schema.ts，定义 Zod schema 和 compare 逻辑**

```typescript
// src/modules/source-document/application/parse-source-document/stage0-schema.ts
import { z } from "zod";

const parsedEntrySchema = z.object({
  receipt_index: z.number().int().min(0).default(0),
  item_name: z.string(),
  amount: z.number(),
  currency: z.string(),
  category_index: z.number().int().min(0),
  notes: z.string().nullish(),
});

const orderAdjustmentSchema = z.object({
  receipt_index: z.number().int().min(0).default(0),
  description: z.string(),
  amount: z.number(),
  currency: z.string(),
});

const receiptTotalSchema = z.object({
  receipt_index: z.number().int().min(0).default(0),
  currency: z.string(),
  total: z.number().nullable(),
});

export const stage0OutputSchema = z.object({
  outcome: z.enum(["success", "anomaly", "invalid"]).default("success"),
  anomaly_reason: z.string().nullish(),
  receipt_count: z.number().int().min(0).default(1),
  title: z.string().optional(),
  ledger_entries: z.array(parsedEntrySchema).default([]),
  order_adjustments: z.array(orderAdjustmentSchema).optional(),
  receipt_totals: z.array(receiptTotalSchema).optional(),
  reasoning: z.string(),
});

export type NormalizedStage0Output = z.infer<typeof stage0OutputSchema> & {
  ledger_entries: Array<z.infer<typeof parsedEntrySchema>>;
};

export function normalizeStage0Output(raw: z.infer<typeof stage0OutputSchema>): NormalizedStage0Output {
  return {
    ...raw,
    ledger_entries: raw.ledger_entries.map(e => ({ ...e, notes: e.notes ?? null })),
  };
}

// 判断两次结果是否一致，决定是否需要仲裁
export function compareStage0Results(
  a: NormalizedStage0Output,
  b: NormalizedStage0Output
): boolean {
  // outcome 不同直接不一致
  if (a.outcome !== b.outcome) return false;
  if (a.outcome !== "success") return true; // 两个都是 anomaly/invalid，视为一致

  // entry 数量不同
  if (a.ledger_entries.length !== b.ledger_entries.length) return false;

  // 按 receipt_index:currency:category_index 分组比总金额（普通 entry）
  const groupNormal = (entries: NormalizedStage0Output["ledger_entries"]) =>
    entries
      .filter(e => e.amount >= 0)
      .reduce<Record<string, number>>((acc, e) => {
        const key = `${e.receipt_index}:${e.currency}:${e.category_index}`;
        acc[key] = (acc[key] ?? 0) + e.amount;
        return acc;
      }, {});

  // 折扣 entry 按 receipt_index:currency 分组
  const groupDiscount = (entries: NormalizedStage0Output["ledger_entries"]) =>
    entries
      .filter(e => e.amount < 0)
      .reduce<Record<string, number>>((acc, e) => {
        const key = `${e.receipt_index}:${e.currency}`;
        acc[key] = (acc[key] ?? 0) + e.amount;
        return acc;
      }, {});

  const aNormal = groupNormal(a.ledger_entries);
  const bNormal = groupNormal(b.ledger_entries);
  const aDiscount = groupDiscount(a.ledger_entries);
  const bDiscount = groupDiscount(b.ledger_entries);

  const keysMatch = (x: Record<string, number>, y: Record<string, number>) => {
    const xk = Object.keys(x).sort();
    const yk = Object.keys(y).sort();
    if (xk.join("|") !== yk.join("|")) return false;
    return xk.every(k => Math.abs((x[k] ?? 0) - (y[k] ?? 0)) <= 0.01);
  };

  return keysMatch(aNormal, bNormal) && keysMatch(aDiscount, bDiscount);
}

// 判断是否需要 dual-run（entry > 3 或货币种类 > 1）
export const DUAL_RUN_ENTRY_THRESHOLD = 3;

export function shouldDualRun(result: NormalizedStage0Output): boolean {
  if (result.outcome !== "success") return false;
  const currencies = new Set(result.ledger_entries.map(e => e.currency));
  return result.ledger_entries.length > DUAL_RUN_ENTRY_THRESHOLD || currencies.size > 1;
}
```

- [ ] **Step 3: 新建 stage0-schema.test.ts，测试 compare 和 shouldDualRun 逻辑**

```typescript
// tests/unit/modules/source-document/stage0-schema.test.ts
import { describe, it, expect } from "vitest";
import { compareStage0Results, shouldDualRun, normalizeStage0Output, stage0OutputSchema } from "@/modules/source-document/application/parse-source-document/stage0-schema";

function makeResult(overrides = {}) {
  return normalizeStage0Output(stage0OutputSchema.parse({
    outcome: "success",
    receipt_count: 1,
    ledger_entries: [],
    reasoning: "test",
    ...overrides,
  }));
}

describe("compareStage0Results", () => {
  it("两个空 entry 视为一致", () => {
    expect(compareStage0Results(makeResult(), makeResult())).toBe(true);
  });

  it("相同 entry 视为一致", () => {
    const entries = [{ receipt_index: 0, item_name: "咖啡", amount: 35, currency: "CNY", category_index: 1, notes: null }];
    expect(compareStage0Results(makeResult({ ledger_entries: entries }), makeResult({ ledger_entries: entries }))).toBe(true);
  });

  it("金额不同视为不一致", () => {
    const a = [{ receipt_index: 0, item_name: "咖啡", amount: 35, currency: "CNY", category_index: 1, notes: null }];
    const b = [{ receipt_index: 0, item_name: "咖啡", amount: 40, currency: "CNY", category_index: 1, notes: null }];
    expect(compareStage0Results(makeResult({ ledger_entries: a }), makeResult({ ledger_entries: b }))).toBe(false);
  });

  it("outcome 不同视为不一致", () => {
    expect(compareStage0Results(makeResult({ outcome: "success" }), makeResult({ outcome: "anomaly", ledger_entries: [] }))).toBe(false);
  });
});

describe("shouldDualRun", () => {
  it("3条以内单货币不触发", () => {
    const entries = Array.from({ length: 3 }, (_, i) => ({ receipt_index: 0, item_name: `item${i}`, amount: 10, currency: "CNY", category_index: 1, notes: null }));
    expect(shouldDualRun(makeResult({ ledger_entries: entries }))).toBe(false);
  });

  it("超过3条触发", () => {
    const entries = Array.from({ length: 4 }, (_, i) => ({ receipt_index: 0, item_name: `item${i}`, amount: 10, currency: "CNY", category_index: 1, notes: null }));
    expect(shouldDualRun(makeResult({ ledger_entries: entries }))).toBe(true);
  });

  it("多货币触发", () => {
    const entries = [
      { receipt_index: 0, item_name: "a", amount: 10, currency: "CNY", category_index: 1, notes: null },
      { receipt_index: 0, item_name: "b", amount: 10, currency: "USD", category_index: 1, notes: null },
    ];
    expect(shouldDualRun(makeResult({ ledger_entries: entries }))).toBe(true);
  });

  it("anomaly 不触发", () => {
    expect(shouldDualRun(makeResult({ outcome: "anomaly", ledger_entries: [] }))).toBe(false);
  });
});
```

- [ ] **Step 4: 运行测试确认失败（文件未实现）**

```bash
npx vitest run tests/unit/modules/source-document/stage0-schema.test.ts
```

预期：FAIL（模块不存在）

- [ ] **Step 5: 确认 stage0-schema.ts 实现后测试通过**

```bash
npx vitest run tests/unit/modules/source-document/stage0-schema.test.ts
```

预期：全部 PASS

- [ ] **Step 6: Commit**

```bash
git add src/modules/source-document/application/parse-source-document/types.ts \
        src/modules/source-document/application/parse-source-document/stage0-schema.ts \
        tests/unit/modules/source-document/stage0-schema.test.ts
git commit -m "feat(parse-pipeline): define new types and stage0 output schema with dual-run logic"
```

---

## Task 2: 重写 Stage 0 Vision Prompt 和 Executor

**Files:**
- Modify: `src/modules/source-document/application/parse-source-document/stage0-vision.ts`

// __CONTINUE_HERE__

