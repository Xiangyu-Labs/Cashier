# Source Document Retry Image Reownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让单条 `edit retry` 和批量 `batch retry` 在创建全新 `sourceDocumentId` 时，也为本地上传图片创建全新的图片归属路径，避免新单据继续引用旧单据的 `/api/uploads/<ledger>/<oldDocId>/...` URL。

**Architecture:** 在 `source-document` application services 增加一个专用的“本地上传 URL 重归属” helper。这个 helper 只负责处理已有图片 URL：本地 `/api/uploads/...` 图片如果不属于目标 `sourceDocumentId`，就从存储下载后重新上传到目标单据目录；已经属于目标单据的本地 URL 原样保留；外部 URL 继续透传。单条 retry 和 batch retry 都通过这个 helper 生成“新请求自己的图片 URL”，这样上传路由现有的“URL 中 docId 必须是活跃单据”校验无需改动。

**Tech Stack:** TypeScript, Next.js server actions, Drizzle ORM, Better SQLite, local filesystem storage, Vitest

---

## Root Cause

当前实现里，`retrySourceDocument()` 和 `batchRetrySourceDocuments()` 都会生成新的 `sourceDocumentId`，但在没有新图片上传时，会直接复用旧单据的 `imageUrls`：

- [`src/modules/source-document/application/use-cases/retry-source-document.ts`](/home/dev/workspace/Cashier/src/modules/source-document/application/use-cases/retry-source-document.ts)
- [`src/modules/source-document/application/use-cases/batch-retry-source-documents.ts`](/home/dev/workspace/Cashier/src/modules/source-document/application/use-cases/batch-retry-source-documents.ts)

上传展示路由会用 URL 中的 `docId` 做访问校验，并要求这条 `source_document` 仍然是活跃记录：

- [`src/app/api/uploads/[...path]/route.ts`](/home/dev/workspace/Cashier/src/app/api/uploads/[...path]/route.ts)
- [`src/modules/source-document/application/queries/can-access-source-document-upload.ts`](/home/dev/workspace/Cashier/src/modules/source-document/application/queries/can-access-source-document-upload.ts)

所以只要 retry 后旧单据被软删除，而新单据继续引用旧路径，图片展示就会 404。我们已经确认产品语义是“retry = 完全新的请求”，所以应该修源头，而不是给上传路由加兼容逻辑。

## File Structure

### New File

- `src/modules/source-document/application/services/rehome-local-upload-urls.ts`
  - 负责把已有的本地 `/api/uploads/...` URL 重新归属到新的 `ledgerId/sourceDocumentId` 路径
  - 保留 URL 顺序
  - 外部 URL 透传
  - 已经属于目标单据的本地 URL 透传
  - 支持复用同一 helper 处理 `imageUrls` 和 `metadata.originalImageUrls`

### Modified Files

- `src/modules/source-document/application/use-cases/retry-source-document.ts`
  - 单条 retry 改为通过 helper 生成新单据自己的 `imageUrls`
  - 现有 `metadata.originalImageUrls` 也要重归属，而不是继续复用旧路径

- `src/modules/source-document/application/use-cases/batch-retry-source-documents.ts`
  - 批量 retry 改为为每个新单据生成新的图片路径
  - 如果旧单据有 `metadata.originalImageUrls`，一并保留并重归属到新单据

### Test Files

- `src/modules/source-document/application/services/rehome-local-upload-urls.test.ts`
  - helper 的纯单元测试

- `src/modules/source-document/application/use-cases/retry-source-document.test.ts`
  - 单条 retry 的用例级测试

- `src/modules/source-document/application/use-cases/batch-retry-source-documents.test.ts`
  - 批量 retry 的用例级测试

- `tests/integration/api/retry-source-document.test.ts`
  - 单条 retry 的集成回归，确保新单据的 `imageUrls` 指向新 doc 目录

- `tests/integration/source-document/batch-retry-action.test.ts`
  - 批量 retry 的集成回归，确保新单据不再沿用旧 doc 路径

### Existing Regression Coverage To Keep Running

- `tests/integration/source-document/r2-fallback-and-delete-failures.test.ts`
  - 远程 URL 在 retry 时仍应保持透传，不应被误处理为本地复制

---

## Task 1: 为本地上传 URL 重归属 helper 写失败测试

**Files:**
- Create: `src/modules/source-document/application/services/rehome-local-upload-urls.test.ts`
- Create: `src/modules/source-document/application/services/rehome-local-upload-urls.ts`

- [ ] **Step 1: 写失败测试，覆盖“旧本地 URL 会复制成新单据路径”**

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const { downloadMock, uploadMock, extractKeyFromUrlMock, getLocalStorageMock } = vi.hoisted(() => ({
  downloadMock: vi.fn(),
  uploadMock: vi.fn(),
  extractKeyFromUrlMock: vi.fn(),
  getLocalStorageMock: vi.fn(),
}));

vi.mock("@/lib/storage/local", () => ({
  getLocalStorage: getLocalStorageMock,
}));

import { rehomeLocalUploadUrls } from "./rehome-local-upload-urls";

describe("rehomeLocalUploadUrls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLocalStorageMock.mockReturnValue({
      download: downloadMock,
      upload: uploadMock,
      extractKeyFromUrl: extractKeyFromUrlMock,
    });
  });

  it("copies a legacy local upload URL into the new source document namespace", async () => {
    extractKeyFromUrlMock.mockReturnValue(
      "ledger-1/old-doc/receipt.webp"
    );
    downloadMock.mockResolvedValue(Buffer.from("image-bytes"));
    uploadMock.mockResolvedValue("/api/uploads/ledger-1/new-doc/receipt.webp");

    const result = await rehomeLocalUploadUrls({
      ledgerId: "ledger-1",
      sourceDocumentId: "new-doc",
      imageUrls: ["/api/uploads/ledger-1/old-doc/receipt.webp"],
    });

    expect(downloadMock).toHaveBeenCalledWith("ledger-1/old-doc/receipt.webp");
    expect(uploadMock).toHaveBeenCalledWith(
      "ledger-1/new-doc/receipt.webp",
      Buffer.from("image-bytes"),
      "image/webp"
    );
    expect(result).toEqual(["/api/uploads/ledger-1/new-doc/receipt.webp"]);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run src/modules/source-document/application/services/rehome-local-upload-urls.test.ts`

Expected: `FAIL`，因为 `rehomeLocalUploadUrls` 还不存在

- [ ] **Step 3: 补第二个失败测试，覆盖“外部 URL 透传、已归属 URL 透传”**

```typescript
it("preserves external URLs and already-owned local URLs", async () => {
  extractKeyFromUrlMock.mockImplementation((url: string) => {
    if (url.startsWith("/api/uploads/")) {
      return url.slice("/api/uploads/".length);
    }
    return null;
  });

  const result = await rehomeLocalUploadUrls({
    ledgerId: "ledger-1",
    sourceDocumentId: "new-doc",
    imageUrls: [
      "https://bucket.r2.dev/ledger-1/doc-1/image.jpg",
      "/api/uploads/ledger-1/new-doc/already-owned.webp",
    ],
  });

  expect(downloadMock).not.toHaveBeenCalled();
  expect(uploadMock).not.toHaveBeenCalled();
  expect(result).toEqual([
    "https://bucket.r2.dev/ledger-1/doc-1/image.jpg",
    "/api/uploads/ledger-1/new-doc/already-owned.webp",
  ]);
});
```

- [ ] **Step 4: 再跑测试，确认仍然是红灯**

Run: `npx vitest run src/modules/source-document/application/services/rehome-local-upload-urls.test.ts`

Expected: `FAIL`

- [ ] **Step 5: Commit 测试脚手架**

```bash
git add src/modules/source-document/application/services/rehome-local-upload-urls.test.ts
git commit -m "test: add failing coverage for retry image reownership helper"
```

---

## Task 2: 实现本地上传 URL 重归属 helper

**Files:**
- Create: `src/modules/source-document/application/services/rehome-local-upload-urls.ts`
- Modify: `src/modules/source-document/application/services/rehome-local-upload-urls.test.ts`
- Reference: `src/lib/storage/local.ts`
- Reference: `src/lib/storage/utils.ts`

- [ ] **Step 1: 实现 helper 的输入输出接口**

```typescript
interface RehomeLocalUploadUrlsInput {
  ledgerId: string;
  sourceDocumentId: string;
  imageUrls: string[];
}

export async function rehomeLocalUploadUrls({
  ledgerId,
  sourceDocumentId,
  imageUrls,
}: RehomeLocalUploadUrlsInput): Promise<string[]> {
  // implementation
}
```

- [ ] **Step 2: 实现本地 URL 判定和目标 key 生成**

```typescript
function buildTargetKey(ledgerId: string, sourceDocumentId: string, key: string): string {
  const parts = key.split("/");
  const filename = parts.slice(2).join("/");
  return `${ledgerId}/${sourceDocumentId}/${filename}`;
}
```

- [ ] **Step 3: 用最小实现让测试通过**

```typescript
import { getLocalStorage } from "@/lib/storage/local";
import { inferImageMimeType } from "@/lib/storage/utils";

export async function rehomeLocalUploadUrls({
  ledgerId,
  sourceDocumentId,
  imageUrls,
}: RehomeLocalUploadUrlsInput): Promise<string[]> {
  const storage = getLocalStorage();

  return Promise.all(
    imageUrls.map(async (url) => {
      if (!url.startsWith("/api/uploads/")) {
        return url;
      }

      const key = storage.extractKeyFromUrl(url);
      if (key == null) {
        return url;
      }

      const parts = key.split("/");
      const currentDocId = parts[1];
      if (currentDocId === sourceDocumentId) {
        return url;
      }

      const targetKey = `${ledgerId}/${sourceDocumentId}/${parts.slice(2).join("/")}`;
      const buffer = await storage.download(key);
      const mimeType = inferImageMimeType(key);
      return storage.upload(targetKey, buffer, mimeType);
    })
  );
}
```

- [ ] **Step 4: 跑 helper 测试，确认绿灯**

Run: `npx vitest run src/modules/source-document/application/services/rehome-local-upload-urls.test.ts`

Expected: `PASS`

- [ ] **Step 5: Commit helper**

```bash
git add src/modules/source-document/application/services/rehome-local-upload-urls.ts \
        src/modules/source-document/application/services/rehome-local-upload-urls.test.ts
git commit -m "feat: rehome retry image urls into new source document paths"
```

---

## Task 3: 先为单条 retry 写红灯，再接入 helper

**Files:**
- Modify: `src/modules/source-document/application/use-cases/retry-source-document.test.ts`
- Modify: `tests/integration/api/retry-source-document.test.ts`
- Modify: `src/modules/source-document/application/use-cases/retry-source-document.ts`
- Reference: `tests/integration/source-document/r2-fallback-and-delete-failures.test.ts`

- [ ] **Step 1: 修改 use-case 单元测试，要求旧本地 `imageUrls` 不再直接复用**

把现有测试 `reuses existing originals, falls back to existing imageUrls...` 改成：

```typescript
vi.mock("../services/rehome-local-upload-urls", () => ({
  rehomeLocalUploadUrls: rehomeLocalUploadUrlsMock,
}));

rehomeLocalUploadUrlsMock
  .mockResolvedValueOnce(["/api/uploads/ledger-1/new-doc/current.webp"])
  .mockResolvedValueOnce(["/api/uploads/ledger-1/new-doc/original.webp"]);

expect(insertValuesMock).toHaveBeenCalledWith(
  expect.objectContaining({
    imageUrls: ["/api/uploads/ledger-1/new-doc/current.webp"],
    metadata: {
      originalImageUrls: ["/api/uploads/ledger-1/new-doc/original.webp"],
    },
  })
);
```

- [ ] **Step 2: 运行单测，确认失败**

Run: `npx vitest run src/modules/source-document/application/use-cases/retry-source-document.test.ts`

Expected: `FAIL`，因为 `retry-source-document.ts` 还没有调用 helper

- [ ] **Step 3: 在集成测试里新增“新 doc 的 imageUrls 必须包含新 docId”断言**

在 [`tests/integration/api/retry-source-document.test.ts`](/home/dev/workspace/Cashier/tests/integration/api/retry-source-document.test.ts) 增加一个图片场景：

```typescript
const imageData = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB...";
const createRes = await createSourceDocumentAction(testLedgerId, {
  text: "Receipt with image",
  images: [{ data: imageData, mimeType: "image/png" }],
});
await processAllPendingTasks();

const retryRes = await retrySourceDocumentAction(testLedgerId, createRes.sourceDocumentId, {
  text: "Retried receipt with image",
});

const retriedDoc = await db.query.sourceDocuments.findFirst({
  where: eq(sourceDocuments.id, retryRes.sourceDocumentId),
});

expect(retriedDoc?.imageUrls?.[0]).toContain(`/${retryRes.sourceDocumentId}/`);
expect(retriedDoc?.imageUrls?.[0]).not.toContain(`/${createRes.sourceDocumentId}/`);
```

- [ ] **Step 4: 跑集成测试，确认失败**

Run: `npx vitest run tests/integration/api/retry-source-document.test.ts`

Expected: `FAIL`，因为当前实现仍然会保留旧图片 URL

- [ ] **Step 5: 在 `retry-source-document.ts` 中接入 helper**

实现方向：

```typescript
import { rehomeLocalUploadUrls } from "../services/rehome-local-upload-urls";

const finalImageUrls =
  processedImageUrls != null && processedImageUrls.length > 0
    ? processedImageUrls
    : await rehomeLocalUploadUrls({
        ledgerId,
        sourceDocumentId: newDocumentId,
        imageUrls: existingDocument.imageUrls ?? [],
      });

if (existingOriginalImageUrls.length > 0) {
  processedOriginalImageUrls = await rehomeLocalUploadUrls({
    ledgerId,
    sourceDocumentId: newDocumentId,
    imageUrls: existingOriginalImageUrls.filter((url): url is string => typeof url === "string" && url !== ""),
  });
}
```

- [ ] **Step 6: 跑单测与集成测试，确认通过**

Run: `npx vitest run src/modules/source-document/application/use-cases/retry-source-document.test.ts`

Expected: `PASS`

Run: `npx vitest run tests/integration/api/retry-source-document.test.ts`

Expected: `PASS`

- [ ] **Step 7: 跑远程 URL 回归，确认外部链接仍透传**

Run: `npx vitest run tests/integration/source-document/r2-fallback-and-delete-failures.test.ts`

Expected: `PASS`

- [ ] **Step 8: Commit 单条 retry 修复**

```bash
git add src/modules/source-document/application/use-cases/retry-source-document.ts \
        src/modules/source-document/application/use-cases/retry-source-document.test.ts \
        tests/integration/api/retry-source-document.test.ts
git commit -m "fix: rehome retry images into the new source document namespace"
```

---

## Task 4: 先为 batch retry 写红灯，再接入 helper

**Files:**
- Modify: `src/modules/source-document/application/use-cases/batch-retry-source-documents.test.ts`
- Modify: `tests/integration/source-document/batch-retry-action.test.ts`
- Modify: `src/modules/source-document/application/use-cases/batch-retry-source-documents.ts`

- [ ] **Step 1: 修改 batch retry 单元测试，要求新单据不再复用旧本地路径**

把当前“preserve imageUrls”测试改成区分本地 URL 与外部 URL：

```typescript
sourceDocumentsFindManyMock.mockResolvedValue([
  {
    id: "old-1",
    text: "Specific text 1",
    entryDate: "2026-03-20",
    imageUrls: ["/api/uploads/ledger-1/old-1/local.webp"],
    metadata: { originalImageUrls: ["/api/uploads/ledger-1/old-1/original.webp"] },
  },
]);

rehomeLocalUploadUrlsMock
  .mockResolvedValueOnce(["/api/uploads/ledger-1/new-1/local.webp"])
  .mockResolvedValueOnce(["/api/uploads/ledger-1/new-1/original.webp"]);

expect(insertValuesMock).toHaveBeenCalledWith([
  expect.objectContaining({
    imageUrls: ["/api/uploads/ledger-1/new-1/local.webp"],
    metadata: { originalImageUrls: ["/api/uploads/ledger-1/new-1/original.webp"] },
  }),
]);
```

- [ ] **Step 2: 运行 batch use-case 单测，确认失败**

Run: `npx vitest run src/modules/source-document/application/use-cases/batch-retry-source-documents.test.ts`

Expected: `FAIL`

- [ ] **Step 3: 在 batch retry 集成测试中新增本地图片场景**

在 [`tests/integration/source-document/batch-retry-action.test.ts`](/home/dev/workspace/Cashier/tests/integration/source-document/batch-retry-action.test.ts) 新增一个用例，创建带本地图片 URL 的旧单据，batch retry 后断言：

```typescript
expect(newDoc.imageUrls?.[0]).toContain(`/${newDoc.id}/`);
expect(newDoc.imageUrls?.[0]).not.toContain(`/${oldDoc.id}/`);
```

- [ ] **Step 4: 跑 batch retry 集成测试，确认失败**

Run: `npx vitest run tests/integration/source-document/batch-retry-action.test.ts`

Expected: `FAIL`

- [ ] **Step 5: 在 batch retry use-case 中接入 helper**

实现方向：

```typescript
const newDocMappings = await Promise.all(
  oldDocs.map(async (oldDoc) => {
    const newDocId = crypto.randomUUID();
    const imageUrls = await rehomeLocalUploadUrls({
      ledgerId,
      sourceDocumentId: newDocId,
      imageUrls: oldDoc.imageUrls ?? [],
    });
    const originalImageUrls = Array.isArray(oldDoc.metadata?.originalImageUrls)
      ? await rehomeLocalUploadUrls({
          ledgerId,
          sourceDocumentId: newDocId,
          imageUrls: oldDoc.metadata.originalImageUrls.filter(
            (url): url is string => typeof url === "string" && url !== ""
          ),
        })
      : [];

    return {
      oldDocId: oldDoc.id,
      newDocId,
      text: oldDoc.text,
      entryDate: oldDoc.entryDate,
      imageUrls,
      originalImageUrls,
    };
  })
);
```

插入新文档时：

```typescript
metadata:
  mapping.originalImageUrls.length > 0
    ? { originalImageUrls: mapping.originalImageUrls }
    : {}
```

- [ ] **Step 6: 跑 batch retry 单测与集成测试，确认通过**

Run: `npx vitest run src/modules/source-document/application/use-cases/batch-retry-source-documents.test.ts`

Expected: `PASS`

Run: `npx vitest run tests/integration/source-document/batch-retry-action.test.ts`

Expected: `PASS`

- [ ] **Step 7: Commit batch retry 修复**

```bash
git add src/modules/source-document/application/use-cases/batch-retry-source-documents.ts \
        src/modules/source-document/application/use-cases/batch-retry-source-documents.test.ts \
        tests/integration/source-document/batch-retry-action.test.ts
git commit -m "fix: rehome batch retry images into new source document paths"
```

---

## Task 5: 回归验证与清理

**Files:**
- Modify: none expected
- Test: `src/modules/source-document/application/services/rehome-local-upload-urls.test.ts`
- Test: `src/modules/source-document/application/use-cases/retry-source-document.test.ts`
- Test: `src/modules/source-document/application/use-cases/batch-retry-source-documents.test.ts`
- Test: `tests/integration/api/retry-source-document.test.ts`
- Test: `tests/integration/source-document/batch-retry-action.test.ts`
- Test: `tests/integration/source-document/r2-fallback-and-delete-failures.test.ts`
- Test: `tests/integration/api/uploads-route.test.ts`

- [ ] **Step 1: 跑 helper 与 use-case 单测**

Run:

```bash
npx vitest run \
  src/modules/source-document/application/services/rehome-local-upload-urls.test.ts \
  src/modules/source-document/application/use-cases/retry-source-document.test.ts \
  src/modules/source-document/application/use-cases/batch-retry-source-documents.test.ts
```

Expected: all `PASS`

- [ ] **Step 2: 跑 retry / batch retry 集成回归**

Run:

```bash
npx vitest run \
  tests/integration/api/retry-source-document.test.ts \
  tests/integration/source-document/batch-retry-action.test.ts \
  tests/integration/source-document/r2-fallback-and-delete-failures.test.ts \
  tests/integration/api/uploads-route.test.ts
```

Expected: all `PASS`

- [ ] **Step 3: 跑静态检查**

Run:

```bash
npx eslint \
  src/modules/source-document/application/services/rehome-local-upload-urls.ts \
  src/modules/source-document/application/services/rehome-local-upload-urls.test.ts \
  src/modules/source-document/application/use-cases/retry-source-document.ts \
  src/modules/source-document/application/use-cases/retry-source-document.test.ts \
  src/modules/source-document/application/use-cases/batch-retry-source-documents.ts \
  src/modules/source-document/application/use-cases/batch-retry-source-documents.test.ts \
  tests/integration/api/retry-source-document.test.ts \
  tests/integration/source-document/batch-retry-action.test.ts
```

Expected: exit code `0`

- [ ] **Step 4: 手工验收**

在开发环境手工验证：

1. 选择一条带图片的 source document
2. 执行 edit retry
3. 等新文档完成解析
4. 打开新文档详情
5. 确认图片 URL 中包含新 `sourceDocumentId`
6. 确认图片能正常显示
7. 确认旧文档软删除后，新文档展示不受影响

- [ ] **Step 5: Commit 回归验证说明**

```bash
git add .
git commit -m "test: cover retry image reownership regressions"
```

---

## Acceptance Criteria

- [ ] 单条 retry 不再让新文档复用旧本地上传 URL
- [ ] batch retry 不再让新文档复用旧本地上传 URL
- [ ] 已存在的远程 URL 仍然保持透传，不被误复制
- [ ] `metadata.originalImageUrls` 在 retry / batch retry 中也遵循“新请求新归属”
- [ ] 上传展示路由代码无需增加兼容逻辑，现有校验仍可通过
- [ ] 所有新增与修改测试通过

## Out Of Scope

- [ ] 不增加上传路由兼容层
- [ ] 不编写历史数据库修复脚本
- [ ] 不修改管理员审计策略
- [ ] 不处理已经存在于生产库中的历史脏数据迁移
