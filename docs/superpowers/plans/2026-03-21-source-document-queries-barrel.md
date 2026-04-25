# Source-Document Queries 纯 Barrel 整改实施计划

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `src/modules/source-document/queries.ts` 中的 4 个函数实现下沉至 application 层，使 `queries.ts` 成为符合约定的纯 re-export barrel。

**Architecture:** 纯结构性重组，不改变任何业务逻辑。`listSourceDocuments` 含 Zod 校验逻辑，下沉至 `application/queries/source-document-queries.ts`；其余 3 个为简单 pass-through wrapper，确认 application 层已有对应函数后直接 re-export。

**Tech Stack:** TypeScript, Next.js 16 App Router, Vitest

---

## 文件变更地图

### 修改
- `src/modules/source-document/application/queries/source-document-queries.ts` — 新增 `listSourceDocuments`（含校验）及其余缺失的公共函数
- `src/modules/source-document/queries.ts` — 清理为纯 barrel

---

## Task 1：分析现有 application 层函数签名

**Files:**
- Read: `src/modules/source-document/application/queries/source-document-queries.ts`
- Read: `src/modules/source-document/queries.ts`

- [ ] **Step 1：读取 source-document-queries.ts 现有内容**

  ```bash
  cat src/modules/source-document/application/queries/source-document-queries.ts
  ```

  记录现有导出函数名：`listSourceDocumentsQuery`、`listAllSourceDocumentsQuery`、`getPendingSourceDocumentsQuery`、`getSourceDocumentFullQuery`（预期）。

- [ ] **Step 2：对比 queries.ts 的 wrapper 函数签名**

  ```bash
  cat src/modules/source-document/queries.ts
  ```

  确认 4 个 wrapper 函数的入参/返回类型，以及 `listSourceDocuments` 的 Zod 校验逻辑使用的 schema 和 input 类型。

---

## Task 2：将函数下沉至 application/queries/source-document-queries.ts

**Files:**
- Modify: `src/modules/source-document/application/queries/source-document-queries.ts`

- [ ] **Step 1：在 source-document-queries.ts 末尾新增 listSourceDocuments**

  在文件末尾追加（保留原有内部 query 函数不变）：

  ```typescript
  import {
    listSourceDocumentsInputSchema,
    type ListSourceDocumentsInput,
  } from "@/modules/source-document/contract-schemas";

  export async function listSourceDocuments(
    ledgerId: string,
    params: ListSourceDocumentsInput
  ): Promise<SourceDocumentPageDto> {
    const validated = listSourceDocumentsInputSchema.parse(params);
    return listSourceDocumentsQuery(ledgerId, {
      status: validated.status ?? null,
      startDate: validated.startDate ?? null,
      endDate: validated.endDate ?? null,
      cursor: validated.cursor ?? null,
      limit: validated.limit,
      includeLedgerEntries: validated.includeEntries,
    });
  }
  ```

  注：`SourceDocumentPageDto` 已在该文件中使用，确认 import 已存在；若无则从 `@/modules/source-document/contracts` 导入。

- [ ] **Step 2：为其余 3 个 wrapper 新增同名导出（若 application 层函数名不同）**

  检查 application 层是否已有 `getAllSourceDocuments`、`getPendingSourceDocuments`、`getSourceDocumentFull` 这三个名称的导出。若没有，在文件末尾追加对应的同名导出函数（直接调用已有的内部 query 函数）：

  ```typescript
  export async function getAllSourceDocuments(
    ledgerId: string,
    params: { startDate?: string | null; endDate?: string | null; page?: number; pageSize?: number }
  ): Promise<SourceDocumentCollectionDto> {
    return listAllSourceDocumentsQuery(ledgerId, params);
  }

  export async function getPendingSourceDocuments(
    ledgerId: string
  ): Promise<PendingSourceDocumentsResponseDto> {
    return getPendingSourceDocumentsQuery(ledgerId);
  }

  export async function getSourceDocumentFull(
    ledgerId: string,
    sourceDocumentId: string
  ): Promise<SourceDocumentFullDto | null> {
    return getSourceDocumentFullQuery(ledgerId, sourceDocumentId);
  }
  ```

  若 application 层已有同名导出则跳过此步。

- [ ] **Step 3：类型检查确认无错**

  ```bash
  npx tsc --noEmit 2>&1 | head -30
  ```

  预期：无错误。

---

## Task 3：将 queries.ts 清理为纯 barrel

**Files:**
- Modify: `src/modules/source-document/queries.ts`

- [ ] **Step 1：检查所有引用 source-document/queries 的调用方**

  ```bash
  grep -rn "from '@/modules/source-document/queries'\|from \"@/modules/source-document/queries\"" src/ --include='*.ts' --include='*.tsx'
  ```

  确认调用方使用的函数名，确保全部包含在新 barrel 中。

- [ ] **Step 2：将 queries.ts 改为纯 barrel**

  ```typescript
  // src/modules/source-document/queries.ts
  export {
    listSourceDocuments,
    getAllSourceDocuments,
    getPendingSourceDocuments,
    getSourceDocumentFull,
  } from "./application/queries/source-document-queries";
  ```

- [ ] **Step 3：类型检查**

  ```bash
  npx tsc --noEmit 2>&1 | head -30
  ```

  预期：无错误。

- [ ] **Step 4：运行全量测试**

  ```bash
  npx vitest run
  ```

  预期：全部 PASS。

- [ ] **Step 5：Commit**

  ```bash
  git add src/modules/source-document/queries.ts src/modules/source-document/application/queries/source-document-queries.ts
  git commit -m "refactor(source-document): make queries.ts a pure barrel, move validation into application layer"
  ```
