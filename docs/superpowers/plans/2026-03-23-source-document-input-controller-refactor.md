# SourceDocumentInputController Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 拆分 `src/modules/source-document/hooks/useSourceDocumentInputController.ts` 这个热点 hook，让它只保留编排职责，同时完整保留当前 create / retry、optimistic close、图片处理、编辑态图片提交、以及 `SourceDocumentInput` 外部行为。

**Architecture:** 保留 `useSourceDocumentInputController` 作为 `SourceDocumentInput.tsx` 的唯一公开入口，但把职责拆到同目录下的本地模块：纯数据转换、图片导入管道、draft 状态、submit mutations。不要引入通用状态机、通用 form framework、或跨模块复用 abstraction；这次拆分只服务 `source-document input` 这条链路，让未来新增字段、批量图片编辑、或新增提交策略时只需要改动一层。

**Tech Stack:** React 19, TypeScript, TanStack Query, Next.js client hooks, Vitest, Testing Library

---

## Scope Check

这份计划只处理一个子系统：

- `src/modules/source-document/hooks/useSourceDocumentInputController.ts`

它会顺带新增该 hook 的本地 helper / sub-hook / tests，但**不**重构下面这些相邻系统：

- `SourceDocumentImageModal` 的编辑器实现
- server actions (`createSourceDocumentAction`, `retrySourceDocumentAction`)
- `useLedgerMutation` 通用框架
- 其他 source-document detail / batch action hooks

这能把 PR 控制在“一个热点 hook 的职责拆分”范围内，避免把 source-document 模块整体重做一遍。

## Hotspot Map

当前 `useSourceDocumentInputController.ts` 同时承担了 4 类职责，而且这些职责交错在一个文件里：

- draft 初始化与文档切换重置
  - `src/modules/source-document/hooks/useSourceDocumentInputController.ts:149-176`
- create / retry 两套 mutation、optimistic update、rollback、query invalidation
  - `src/modules/source-document/hooks/useSourceDocumentInputController.ts:178-250`
- 图片压缩、FileReader fallback、超大文件 toast
  - `src/modules/source-document/hooks/useSourceDocumentInputController.ts:257-282`
- 事件编排与 UI-facing return shape
  - `src/modules/source-document/hooks/useSourceDocumentInputController.ts:285-369`

这就是为什么再加一个字段或一个额外图片策略时，认知负担会陡增。

## File Map

- `src/modules/source-document/hooks/useSourceDocumentInputController.ts`
  - 最终保留为薄编排层。只负责把 draft、image pipeline、submit mutations、DOM event handlers 组合成现有的 public return shape。
- `src/modules/source-document/hooks/source-document-input-controller.types.ts`
  - 新建。存放这个输入流专属的共享本地类型，例如 `EditableInputImage`、`SourceDocumentSubmitPayload`、`SourceDocumentInputControllerMessages`、图片导入结果联合类型。
- `src/modules/source-document/hooks/source-document-input-controller.core.ts`
  - 新建。存放纯函数：`toEditableImages`、`toModalImages`、`mergeModalImagesIntoEditableImages`、`resolveInitialEntryDate`、`buildSubmitPayload`。
- `src/modules/source-document/hooks/source-document-input-images.ts`
  - 新建。封装“压缩 -> fallback -> MIME 推断 -> 结果联合类型”的图片导入管道。不处理 toast，不知道 React state。
- `src/modules/source-document/hooks/useSourceDocumentSubmitMutations.ts`
  - 新建。只负责 create / retry mutation 配置、optimistic update、rollback、query invalidation，向 controller 暴露 `submit()` 和 `isPending`。
- `src/modules/source-document/hooks/useSourceDocumentInputDraft.ts`
  - 新建。只负责 `text` / `entryDate` / `images` / `selectedImageIndex` 的状态、initialData 一次性初始化、切换 `sourceDocumentId` 时的重置、modal save/remove/open/close。
- `tests/unit/modules/source-document/hooks/source-document-input-controller.core.test.ts`
  - 新建。纯逻辑单元测试。
- `tests/unit/modules/source-document/hooks/source-document-input-images.test.ts`
  - 新建。图片导入管道单元测试。
- `tests/unit/modules/source-document/hooks/useSourceDocumentSubmitMutations.test.tsx`
  - 新建。mutation / rollback / invalidation 直接测试。
- `tests/unit/modules/source-document/hooks/useSourceDocumentInputDraft.test.tsx`
  - 新建。draft 状态测试。
- `tests/unit/modules/source-document/hooks/useSourceDocumentInputController.test.tsx`
  - 保留并瘦身为 orchestration-level 回归测试，不再承载所有细节分支。
- `tests/unit/source-document/components/SourceDocumentInput.test.tsx`
  - 现有组件级 guardrail，继续证明 optimistic close 和 modal 打开行为没有回归。
- `tests/unit/modules/source-document/ui/SourceDocumentInputView.test.tsx`
  - 现有视图级 guardrail，继续证明 `SourceDocumentInputView` contract 没变。

## Design Constraints

- 保持 `useSourceDocumentInputController()` 的 public return shape 不变，`SourceDocumentInput.tsx` 不需要跟着改一套调用方式。
- 保持 create / retry 的语义不变：
  - create 继续 cancel 精确的 `pending` list key
  - retry 继续 optimistic 地把当前 document 标成 `processing`
  - 两者都继续在 settled 后 invalidation `sourceDocuments` 和 `taskQueue`
- 保持 `onSuccess` 仍然是 optimistic close：在真正 mutation resolve 之前触发。
- 保持图片 fallback 规则不变：
  - 先压缩
  - 压缩失败时，小文件走 `FileReader`
  - 超过 `5 * 1024 * 1024` 直接 toast 错误
- 保持 `originalImages` 的提交语义不变：
  - 只有存在任意编辑过的图片时才带上
  - 如果图片被改回原图，`isEdited` 要恢复为 `false`
- 新 helper / sub-hook 只在本模块本地使用，**不要**把它们加进 `src/modules/source-document/hooks/index.ts`
- 不引入 `useReducer` 状态机，也不做“通用上传表单引擎”

### Task 1: 提取纯逻辑核心并锁定 payload / 图片转换语义

**Files:**
- Create: `src/modules/source-document/hooks/source-document-input-controller.types.ts`
- Create: `src/modules/source-document/hooks/source-document-input-controller.core.ts`
- Create: `tests/unit/modules/source-document/hooks/source-document-input-controller.core.test.ts`
- Modify: `src/modules/source-document/hooks/useSourceDocumentInputController.ts`
- Test: `tests/unit/modules/source-document/hooks/useSourceDocumentInputController.test.tsx`

- [ ] **Step 1: 写失败测试，直接锁定纯逻辑边界**

在 `tests/unit/modules/source-document/hooks/source-document-input-controller.core.test.ts` 新建测试，直接 import 还不存在的 core 模块：

```ts
import { describe, expect, it, vi } from "vitest";
import {
  buildSubmitPayload,
  mergeModalImagesIntoEditableImages,
  resolveInitialEntryDate,
  toEditableImages,
} from "@/modules/source-document/hooks/source-document-input-controller.core";

describe("source-document-input-controller.core", () => {
  it("adds original image metadata when creating editable images", () => {
    expect(
      toEditableImages([{ data: "image-a", mimeType: "image/png" }])
    ).toEqual([
      {
        data: "image-a",
        mimeType: "image/png",
        originalData: "image-a",
        originalMimeType: "image/png",
        isEdited: false,
      },
    ]);
  });

  it("includes originalImages only when at least one image is edited", () => {
    const editableImages = [
      {
        data: "edited-image",
        mimeType: "image/png",
        originalData: "original-image",
        originalMimeType: "image/png",
        isEdited: true,
      },
    ];

    expect(
      buildSubmitPayload("Lunch", editableImages, new Date("2026-03-20T00:00:00.000Z"))
    ).toMatchObject({
      text: "Lunch",
      images: [{ data: "edited-image", mimeType: "image/png" }],
      originalImages: [{ data: "original-image", mimeType: "image/png" }],
    });
  });

  it("marks an image as unedited again when modal save restores the original bytes", () => {
    const currentImages = toEditableImages([{ data: "original-image", mimeType: "image/png" }]);

    const restored = mergeModalImagesIntoEditableImages(currentImages, [
      { data: "original-image", mimeType: "image/png" },
    ]);

    expect(restored[0]?.isEdited).toBe(false);
  });

  it("falls back to now when initialData entryDate is missing or invalid", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-23T09:00:00.000Z"));

    expect(resolveInitialEntryDate(undefined)).toEqual(new Date("2026-03-23T09:00:00.000Z"));
    expect(resolveInitialEntryDate("invalid-date")).toEqual(new Date("2026-03-23T09:00:00.000Z"));

    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: 运行新测试，确认失败**

Run: `npm run test:unit -- tests/unit/modules/source-document/hooks/source-document-input-controller.core.test.ts`

Expected: `FAIL`，因为 `source-document-input-controller.core.ts` 和 `source-document-input-controller.types.ts` 还不存在。

- [ ] **Step 3: 新建本地 types / core 模块，并实现最小纯逻辑**

在 `source-document-input-controller.types.ts` 里放共享类型：

```ts
import type { SourceDocumentInputProps } from "../ui/source-document-input.types";
import type { SourceDocumentModalImage } from "../ui/SourceDocumentImageModal";

export type SourceDocumentInputInitialData = NonNullable<
  SourceDocumentInputProps["initialData"]
>;

export interface EditableInputImage extends SourceDocumentModalImage {
  originalData: string;
  originalMimeType: string;
  isEdited: boolean;
}

export interface SourceDocumentSubmitPayload {
  entryDate: string;
  text?: string;
  images?: SourceDocumentModalImage[];
  originalImages?: SourceDocumentModalImage[];
}

export interface SourceDocumentInputControllerMessages {
  uploadSuccess: string;
  uploadError: string;
  retrySuccess: string;
  retryError: string;
  imageTooLarge: (fileName: string) => string;
}
```

在 `source-document-input-controller.core.ts` 里实现纯函数：

```ts
import { formatDateTimeForApi, parseDateString } from "@/lib/date-utils";
import type { SourceDocumentModalImage } from "../ui/SourceDocumentImageModal";
import type { EditableInputImage, SourceDocumentSubmitPayload } from "./source-document-input-controller.types";

export function toEditableImage(image: SourceDocumentModalImage): EditableInputImage {
  return {
    ...image,
    originalData: image.data,
    originalMimeType: image.mimeType,
    isEdited: false,
  };
}

export function toEditableImages(images?: SourceDocumentModalImage[]) {
  return (images ?? []).map(toEditableImage);
}

export function toModalImages(images: EditableInputImage[]): SourceDocumentModalImage[] {
  return images.map(({ data, mimeType }) => ({ data, mimeType }));
}

export function mergeModalImagesIntoEditableImages(
  currentImages: EditableInputImage[],
  updatedImages: SourceDocumentModalImage[]
) {
  return currentImages.map((image, index) => {
    const updatedImage = updatedImages[index];
    if (updatedImage == null) return image;

    return {
      ...image,
      data: updatedImage.data,
      mimeType: updatedImage.mimeType,
      isEdited:
        updatedImage.data !== image.originalData ||
        updatedImage.mimeType !== image.originalMimeType,
    };
  });
}

export function resolveInitialEntryDate(entryDate?: string): Date {
  if (entryDate != null) {
    const parsed = parseDateString(entryDate);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  return new Date();
}

export function buildSubmitPayload(
  text: string,
  images: EditableInputImage[],
  entryDate: Date
): SourceDocumentSubmitPayload {
  const nextImages = images.map(({ data, mimeType }) => ({ data, mimeType }));
  const originalImages = images.map(({ originalData, originalMimeType }) => ({
    data: originalData,
    mimeType: originalMimeType,
  }));

  return {
    entryDate: formatDateTimeForApi(entryDate),
    ...(text !== "" ? { text } : {}),
    ...(nextImages.length > 0 ? { images: nextImages } : {}),
    ...(images.some((image) => image.isEdited) ? { originalImages } : {}),
  };
}
```

- [ ] **Step 4: 让 controller 使用这些新纯函数，而不是继续把实现塞在文件顶部**

把下面这些内联实现从 `useSourceDocumentInputController.ts` 挪出去并改成 import：

- `toEditableImage`
- `toEditableImages`
- `toModalImages`
- `resolveInitialEntryDate`
- `buildSubmitPayload`

这个步骤只做“搬家 + 接线”，不要在这里顺手改 mutation 或图片流程。

- [ ] **Step 5: 跑纯逻辑测试和现有 controller 回归**

Run: `npm run test:unit -- tests/unit/modules/source-document/hooks/source-document-input-controller.core.test.ts tests/unit/modules/source-document/hooks/useSourceDocumentInputController.test.tsx`

Expected: `PASS`

- [ ] **Step 6: Commit**

```bash
git add src/modules/source-document/hooks/source-document-input-controller.types.ts \
  src/modules/source-document/hooks/source-document-input-controller.core.ts \
  src/modules/source-document/hooks/useSourceDocumentInputController.ts \
  tests/unit/modules/source-document/hooks/source-document-input-controller.core.test.ts \
  tests/unit/modules/source-document/hooks/useSourceDocumentInputController.test.tsx
git commit -m "refactor: extract source document input core helpers"
```

### Task 2: 提取图片导入管道，隔离压缩 / fallback / MIME 推断

**Files:**
- Create: `src/modules/source-document/hooks/source-document-input-images.ts`
- Create: `tests/unit/modules/source-document/hooks/source-document-input-images.test.ts`
- Modify: `src/modules/source-document/hooks/source-document-input-controller.types.ts`
- Modify: `src/modules/source-document/hooks/useSourceDocumentInputController.ts`
- Test: `tests/unit/modules/source-document/hooks/useSourceDocumentInputController.test.tsx`

- [ ] **Step 1: 写失败测试，锁定图片导入的三条路径**

新建 `tests/unit/modules/source-document/hooks/source-document-input-images.test.ts`：

```ts
import { describe, expect, it, vi } from "vitest";
import { compressImage } from "@/lib/image-utils";
import { loadSourceDocumentInputFiles } from "@/modules/source-document/hooks/source-document-input-images";

vi.mock("@/lib/image-utils", () => ({
  compressImage: vi.fn(),
}));

describe("source-document-input-images", () => {
  it("returns a ready editable image when compression succeeds", async () => {
    vi.mocked(compressImage).mockResolvedValueOnce({
      data: "compressed-image",
      mimeType: "image/png",
    } as never);

    const results = await loadSourceDocumentInputFiles([
      new File(["image"], "receipt.png", { type: "image/png" }),
    ]);

    expect(results).toEqual([
      {
        kind: "ready",
        image: {
          data: "compressed-image",
          mimeType: "image/png",
          originalData: "compressed-image",
          originalMimeType: "image/png",
          isEdited: false,
        },
      },
    ]);
  });

  it("falls back to FileReader for small files when compression fails", async () => {
    vi.mocked(compressImage).mockRejectedValueOnce(new Error("Compression failed"));
    // mock FileReader to return data:image/webp;base64,fallback-image
  });

  it("returns a too-large result when fallback is blocked by file size", async () => {
    vi.mocked(compressImage).mockRejectedValueOnce(new Error("Compression failed"));
    const largeFile = new File(["image"], "huge.png", { type: "image/png" });
    Object.defineProperty(largeFile, "size", { value: 5 * 1024 * 1024 + 1, configurable: true });

    const results = await loadSourceDocumentInputFiles([largeFile]);

    expect(results).toEqual([{ kind: "too-large", fileName: "huge.png" }]);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm run test:unit -- tests/unit/modules/source-document/hooks/source-document-input-images.test.ts`

Expected: `FAIL`，因为 `source-document-input-images.ts` 还不存在。

- [ ] **Step 3: 实现图片导入模块，并把 UI 副作用从里面拿掉**

在 `source-document-input-controller.types.ts` 追加一个联合类型：

```ts
export type SourceDocumentInputImageLoadResult =
  | { kind: "ready"; image: EditableInputImage }
  | { kind: "too-large"; fileName: string };
```

在 `source-document-input-images.ts` 里实现：

```ts
import { compressImage } from "@/lib/image-utils";
import { toEditableImage } from "./source-document-input-controller.core";
import type { SourceDocumentInputImageLoadResult } from "./source-document-input-controller.types";

export const MAX_FALLBACK_SIZE = 5 * 1024 * 1024;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Unexpected FileReader result"));
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error("Failed to read file"));
    };

    reader.readAsDataURL(file);
  });
}

function getMimeTypeFromDataUrl(dataUrl: string, fileType: string) {
  const mimeMatch = dataUrl.match(/^data:([^;]+);base64,/);
  return mimeMatch?.[1] ?? (fileType !== "" ? fileType : "image/jpeg");
}

export async function loadSourceDocumentInputFiles(
  files: File[]
): Promise<SourceDocumentInputImageLoadResult[]> {
  const results: SourceDocumentInputImageLoadResult[] = [];

  for (const file of files) {
    try {
      const compressed = await compressImage(file);
      results.push({ kind: "ready", image: toEditableImage(compressed) });
    } catch (error) {
      console.error("Failed to compress image:", error);

      if (file.size > MAX_FALLBACK_SIZE) {
        results.push({ kind: "too-large", fileName: file.name });
        continue;
      }

      const base64 = await readFileAsDataUrl(file);
      results.push({
        kind: "ready",
        image: toEditableImage({
          data: base64,
          mimeType: getMimeTypeFromDataUrl(base64, file.type),
        }),
      });
    }
  }

  return results;
}
```

关键点：

- helper 只返回结构化结果
- `toast.error(...)` 继续留在 controller
- 不把 `setImages(...)` 放进 helper

- [ ] **Step 4: 让 controller 改成消费 `loadSourceDocumentInputFiles()`**

把现在 `appendFiles()` 里的图片压缩 / fallback 逻辑替换成：

```ts
const appendFiles = async (files: File[]) => {
  const results = await loadSourceDocumentInputFiles(files);

  results.forEach((result) => {
    if (result.kind === "too-large") {
      toast.error(messages.imageTooLarge(result.fileName));
      return;
    }

    setImages((previousImages) => [...previousImages, result.image]);
  });
};
```

仍然保留 `handleFileInputChange()` 和 `handleTextareaPaste()` 这两个 DOM handler，但它们不再知道压缩细节。

- [ ] **Step 5: 跑新 helper 测试和现有 hook 回归**

Run: `npm run test:unit -- tests/unit/modules/source-document/hooks/source-document-input-images.test.ts tests/unit/modules/source-document/hooks/useSourceDocumentInputController.test.tsx`

Expected: `PASS`

- [ ] **Step 6: Commit**

```bash
git add src/modules/source-document/hooks/source-document-input-controller.types.ts \
  src/modules/source-document/hooks/source-document-input-images.ts \
  src/modules/source-document/hooks/useSourceDocumentInputController.ts \
  tests/unit/modules/source-document/hooks/source-document-input-images.test.ts \
  tests/unit/modules/source-document/hooks/useSourceDocumentInputController.test.tsx
git commit -m "refactor: isolate source document input image pipeline"
```

### Task 3: 提取 submit mutations，隔离 create / retry / optimistic update / invalidation

**Files:**
- Create: `src/modules/source-document/hooks/useSourceDocumentSubmitMutations.ts`
- Create: `tests/unit/modules/source-document/hooks/useSourceDocumentSubmitMutations.test.tsx`
- Modify: `src/modules/source-document/hooks/useSourceDocumentInputController.ts`
- Test: `tests/unit/modules/source-document/hooks/useSourceDocumentInputController.test.tsx`

- [ ] **Step 1: 写失败测试，直接锁定 create / retry mutation 语义**

新建 `tests/unit/modules/source-document/hooks/useSourceDocumentSubmitMutations.test.tsx`：

```tsx
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/lib/query-keys";
import {
  createSourceDocumentAction,
  retrySourceDocumentAction,
} from "@/modules/source-document/actions";
import { useSourceDocumentSubmitMutations } from "@/modules/source-document/hooks/useSourceDocumentSubmitMutations";

it("submits create payloads and invalidates source document and task queue queries on settle", async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

  vi.mocked(createSourceDocumentAction).mockResolvedValue({
    sourceDocumentId: "doc-1",
    status: "queued",
  } as never);

  const { result } = renderHook(
    () =>
      useSourceDocumentSubmitMutations({
        ledgerId: "ledger-1",
        mode: "create",
        messages: createMessages(),
      }),
    { wrapper: createWrapper(queryClient) }
  );

  act(() => {
    result.current.submit({
      entryDate: "2026-03-20T12:00:00.000Z",
      text: "Lunch",
    });
  });

  await waitFor(() => {
    expect(createSourceDocumentAction).toHaveBeenCalledWith("ledger-1", {
      entryDate: "2026-03-20T12:00:00.000Z",
      text: "Lunch",
    });
  });

  await waitFor(() => {
    expect(invalidateQueriesSpy).toHaveBeenCalledWith(
      expect.objectContaining({ predicate: expect.any(Function) })
    );
  });
});

it("optimistically marks retry documents as processing and rolls back on failure", async () => {
  // seed queryKeys.sourceDocument("doc-1"), call submit(), reject promise, assert rollback
});

it("returns false and does not submit retry when sourceDocumentId is missing", () => {
  // expect submit(payload) to be false and retrySourceDocumentAction not called
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm run test:unit -- tests/unit/modules/source-document/hooks/useSourceDocumentSubmitMutations.test.tsx`

Expected: `FAIL`，因为 `useSourceDocumentSubmitMutations.ts` 还不存在。

- [ ] **Step 3: 实现专用 submit hook，只暴露 `submit()` 和 `isPending`**

在 `useSourceDocumentSubmitMutations.ts` 里搬出现在 controller 里的 mutation 配置：

```ts
"use client";

import { invalidateSourceDocuments, invalidateTaskQueue, queryKeys } from "@/lib/query-keys";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import {
  createSourceDocumentAction,
  retrySourceDocumentAction,
} from "@/modules/source-document/actions";
import type { SourceDocument } from "@/modules/source-document/contracts";
import { fireAndForget } from "@/lib/safe-async";
import type {
  SourceDocumentInputControllerMessages,
  SourceDocumentSubmitPayload,
} from "./source-document-input-controller.types";

interface UseSourceDocumentSubmitMutationsOptions {
  ledgerId: string;
  mode: "create" | "retry";
  sourceDocumentId?: string;
  messages: SourceDocumentInputControllerMessages;
}

function createExactPredicate(target: readonly unknown[]) {
  return (query: { queryKey: readonly unknown[] }) =>
    Array.isArray(query.queryKey) &&
    query.queryKey.length === target.length &&
    target.every((value, index) => query.queryKey[index] === value);
}

function invalidateSubmitQueries(
  queryClient: {
    invalidateQueries: (options: { predicate: (query: { queryKey: readonly unknown[] }) => boolean }) => Promise<unknown>;
  },
  ledgerId: string
) {
  fireAndForget(queryClient.invalidateQueries({ predicate: invalidateSourceDocuments(ledgerId) }), {
    context: "SourceDocumentInput",
  });
  fireAndForget(queryClient.invalidateQueries({ predicate: invalidateTaskQueue(ledgerId) }), {
    context: "SourceDocumentInput",
  });
}

export function useSourceDocumentSubmitMutations({
  ledgerId,
  mode,
  sourceDocumentId,
  messages,
}: UseSourceDocumentSubmitMutationsOptions) {
  // move createMutation and retryMutation here
  // preserve current optimistic update / rollback semantics exactly

  const submit = (payload: SourceDocumentSubmitPayload) => {
    if (mode === "retry") {
      if (sourceDocumentId == null) return false;
      retryMutation.mutate(payload);
      return true;
    }

    createMutation.mutate(payload);
    return true;
  };

  return {
    isPending: (mode === "retry" ? retryMutation : createMutation).isPending,
    submit,
  };
}
```

注意：

- `SourceDocumentInputControllerMessages` 从原 hook 移到 `source-document-input-controller.types.ts`
- create / retry 的 `cancelPredicates`、`skipInvalidation`、`onRollback`、`onSettledExtra` 语义必须保持原样

- [ ] **Step 4: controller 改为只 build payload + 调 `submit()`**

把 `useSourceDocumentInputController.ts` 里的 mutation 声明删掉，改成：

```ts
const submitMutations = useSourceDocumentSubmitMutations({
  ledgerId,
  mode,
  sourceDocumentId,
  messages,
});

const handleSubmit = () => {
  if (!canSubmit) return;

  const payload = buildSubmitPayload(text, images, entryDate);
  const submitted = submitMutations.submit(payload);
  if (submitted) {
    onSuccess?.();
  }
};
```

这里不要再让 controller 为 submit 额外维护一层 transition state。最终 pending 应该只来自：

- draft hook 的初始化 transition
- submit hook 的 mutation pending

- [ ] **Step 5: 跑新 mutation 测试和现有 controller 回归**

Run: `npm run test:unit -- tests/unit/modules/source-document/hooks/useSourceDocumentSubmitMutations.test.tsx tests/unit/modules/source-document/hooks/useSourceDocumentInputController.test.tsx`

Expected: `PASS`

- [ ] **Step 6: Commit**

```bash
git add src/modules/source-document/hooks/useSourceDocumentSubmitMutations.ts \
  src/modules/source-document/hooks/useSourceDocumentInputController.ts \
  tests/unit/modules/source-document/hooks/useSourceDocumentSubmitMutations.test.tsx \
  tests/unit/modules/source-document/hooks/useSourceDocumentInputController.test.tsx
git commit -m "refactor: isolate source document submit mutations"
```

### Task 4: 提取 draft 状态 hook，把 controller 收敛成薄编排层

**Files:**
- Create: `src/modules/source-document/hooks/useSourceDocumentInputDraft.ts`
- Create: `tests/unit/modules/source-document/hooks/useSourceDocumentInputDraft.test.tsx`
- Modify: `src/modules/source-document/hooks/useSourceDocumentInputController.ts`
- Modify: `tests/unit/modules/source-document/hooks/useSourceDocumentInputController.test.tsx`
- Test: `tests/unit/source-document/components/SourceDocumentInput.test.tsx`
- Test: `tests/unit/modules/source-document/ui/SourceDocumentInputView.test.tsx`

- [ ] **Step 1: 写失败测试，直接锁定 draft 状态语义**

新建 `tests/unit/modules/source-document/hooks/useSourceDocumentInputDraft.test.tsx`，把现在 controller 测试里最核心的状态用例迁过来：

```tsx
import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSourceDocumentInputDraft } from "@/modules/source-document/hooks/useSourceDocumentInputDraft";

it("does not overwrite user edits when initialData changes for the same document", async () => {
  const { result, rerender } = renderHook(
    (props: {
      sourceDocumentId?: string;
      initialData?: {
        text?: string;
        images?: Array<{ data: string; mimeType: string }>;
        entryDate?: string;
      };
    }) => useSourceDocumentInputDraft(props),
    {
      initialProps: {
        sourceDocumentId: "doc-1",
        initialData: { text: "Original text" },
      },
    }
  );

  act(() => {
    result.current.setText("User edited text");
  });

  rerender({
    sourceDocumentId: "doc-1",
    initialData: { text: "Server update" },
  });

  expect(result.current.text).toBe("User edited text");
});

it("reinitializes draft state when switching to a different document", async () => {
  // preserve existing coverage for text / images / entryDate reset
});

it("marks edited images and clears the edited flag when modal save restores the original image", () => {
  // append image, call handleModalSave twice, expect isEdited true then false
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm run test:unit -- tests/unit/modules/source-document/hooks/useSourceDocumentInputDraft.test.tsx`

Expected: `FAIL`，因为 `useSourceDocumentInputDraft.ts` 还不存在。

- [ ] **Step 3: 实现 draft hook，承接所有本地 UI 状态**

在 `useSourceDocumentInputDraft.ts` 里实现：

```ts
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { SourceDocumentModalImage } from "../ui/SourceDocumentImageModal";
import type { SourceDocumentInputInitialData, EditableInputImage } from "./source-document-input-controller.types";
import {
  mergeModalImagesIntoEditableImages,
  resolveInitialEntryDate,
  toEditableImages,
  toModalImages,
} from "./source-document-input-controller.core";

interface UseSourceDocumentInputDraftOptions {
  sourceDocumentId?: string;
  initialData?: SourceDocumentInputInitialData;
}

export function useSourceDocumentInputDraft({
  sourceDocumentId,
  initialData,
}: UseSourceDocumentInputDraftOptions) {
  const [text, setText] = useState(initialData?.text ?? "");
  const [images, setImages] = useState<EditableInputImage[]>(() => toEditableImages(initialData?.images));
  const [entryDate, setEntryDate] = useState<Date>(() => resolveInitialEntryDate(initialData?.entryDate));
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [isInitializing, startTransition] = useTransition();
  const hasInitializedRef = useRef(false);
  const previousSourceDocumentIdRef = useRef<string | undefined>(sourceDocumentId);

  useEffect(() => {
    if (previousSourceDocumentIdRef.current !== sourceDocumentId) {
      hasInitializedRef.current = false;
      previousSourceDocumentIdRef.current = sourceDocumentId;
    }
  }, [sourceDocumentId]);

  useEffect(() => {
    if (initialData == null || hasInitializedRef.current) return;

    hasInitializedRef.current = true;
    startTransition(() => {
      setText(initialData.text ?? "");
      setImages(toEditableImages(initialData.images));
      setEntryDate(resolveInitialEntryDate(initialData.entryDate));
    });
  }, [initialData]);

  const handleModalSave = (updatedImages: SourceDocumentModalImage[]) => {
    setImages((previousImages) =>
      mergeModalImagesIntoEditableImages(previousImages, updatedImages)
    );
  };

  return {
    text,
    setText,
    images,
    setImages,
    modalImages: toModalImages(images),
    entryDate,
    setEntryDate,
    selectedImageIndex,
    openImage: (index: number) => setSelectedImageIndex(index),
    closeImage: () => setSelectedImageIndex(null),
    removeImage: (index: number) =>
      setImages((previousImages) =>
        previousImages.filter((_, imageIndex) => imageIndex !== index)
      ),
    handleModalSave,
    canSubmit: text !== "" || images.length > 0,
    isInitializing,
  };
}
```

- [ ] **Step 4: 改写 controller，让它只负责“接线”**

`useSourceDocumentInputController.ts` 最终应该收敛成下面这种结构：

```ts
"use client";

import { useRef } from "react";
import type { ChangeEvent, ClipboardEvent } from "react";
import { toast } from "sonner";
import { fireAndForget } from "@/lib/safe-async";
import { buildSubmitPayload } from "./source-document-input-controller.core";
import { loadSourceDocumentInputFiles } from "./source-document-input-images";
import { useSourceDocumentInputDraft } from "./useSourceDocumentInputDraft";
import { useSourceDocumentSubmitMutations } from "./useSourceDocumentSubmitMutations";

export function useSourceDocumentInputController({
  ledgerId,
  onSuccess,
  mode = "create",
  sourceDocumentId,
  initialData,
  messages,
}: UseSourceDocumentInputControllerOptions) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draft = useSourceDocumentInputDraft({ sourceDocumentId, initialData });
  const submitMutations = useSourceDocumentSubmitMutations({
    ledgerId,
    mode,
    sourceDocumentId,
    messages,
  });

  const appendFiles = async (files: File[]) => {
    const results = await loadSourceDocumentInputFiles(files);

    results.forEach((result) => {
      if (result.kind === "too-large") {
        toast.error(messages.imageTooLarge(result.fileName));
        return;
      }

      draft.setImages((previousImages) => [...previousImages, result.image]);
    });
  };

  const handleSubmit = () => {
    if (!draft.canSubmit) return;

    const submitted = submitMutations.submit(
      buildSubmitPayload(draft.text, draft.images, draft.entryDate)
    );
    if (submitted) {
      onSuccess?.();
    }
  };

  return {
    mode,
    text: draft.text,
    entryDate: draft.entryDate,
    images: draft.modalImages,
    selectedImageIndex: draft.selectedImageIndex,
    fileInputRef,
    isPending: draft.isInitializing || submitMutations.isPending,
    canSubmit: draft.canSubmit,
    setText: draft.setText,
    setEntryDate: draft.setEntryDate,
    openImage: draft.openImage,
    closeImage: draft.closeImage,
    removeImage: draft.removeImage,
    triggerFileDialog: () => fileInputRef.current?.click(),
    handleFileInputChange,
    handleTextareaPaste,
    handleSubmit,
    handleModalSave: draft.handleModalSave,
  };
}
```

这里最关键的是：

- controller 不再自己拥有 `useState(...)`
- controller 不再自己定义 `useLedgerMutation(...)`
- controller 不再自己知道压缩 / fallback 细节
- `onSuccess` 只在 `submit()` 真正接收了请求时触发，避免以后有人把 retry 无 `sourceDocumentId` 的 guard 搞丢

- [ ] **Step 5: 运行分层测试和组件 guardrails**

Run: `npm run test:unit -- tests/unit/modules/source-document/hooks/useSourceDocumentInputDraft.test.tsx tests/unit/modules/source-document/hooks/useSourceDocumentInputController.test.tsx tests/unit/source-document/components/SourceDocumentInput.test.tsx tests/unit/modules/source-document/ui/SourceDocumentInputView.test.tsx`

Expected: `PASS`

- [ ] **Step 6: 做一次这个热点相关的完整单测 sweep**

Run: `npm run test:unit -- tests/unit/modules/source-document/hooks/source-document-input-controller.core.test.ts tests/unit/modules/source-document/hooks/source-document-input-images.test.ts tests/unit/modules/source-document/hooks/useSourceDocumentSubmitMutations.test.tsx tests/unit/modules/source-document/hooks/useSourceDocumentInputDraft.test.tsx tests/unit/modules/source-document/hooks/useSourceDocumentInputController.test.tsx tests/unit/source-document/components/SourceDocumentInput.test.tsx tests/unit/modules/source-document/ui/SourceDocumentInputView.test.tsx`

Expected: `PASS`

- [ ] **Step 7: Commit**

```bash
git add src/modules/source-document/hooks/useSourceDocumentInputDraft.ts \
  src/modules/source-document/hooks/useSourceDocumentInputController.ts \
  tests/unit/modules/source-document/hooks/useSourceDocumentInputDraft.test.tsx \
  tests/unit/modules/source-document/hooks/useSourceDocumentInputController.test.tsx \
  tests/unit/source-document/components/SourceDocumentInput.test.tsx \
  tests/unit/modules/source-document/ui/SourceDocumentInputView.test.tsx
git commit -m "refactor: split source document input controller"
```

## Implementation Notes

- 先新增新测试文件，再拆实现。不要一上来直接移动代码。
- 迁移现有 `useSourceDocumentInputController.test.tsx` 用例时，先复制到新的 direct test 文件，确认新测试绿了，再删除重复断言，避免 refactor 中途丢 coverage。
- `SourceDocumentInput.tsx` 理论上不应该需要结构性修改；如果最后需要改它，说明 controller 公共 contract 被改坏了，先回头检查。
- 任何时候都不要把新 helper 暴露到 `hooks/index.ts`。这些都是本地实现细节，不是公共模块 API。

## Verification Checklist

- `useSourceDocumentInputController.ts` 文件长度和职责显著下降，只剩 orchestration
- 纯逻辑、图片处理、mutation 语义、draft 状态分别有独立测试文件
- create / retry 的 query invalidation 和 optimistic update 语义未变
- `originalImages` 行为未变
- 现有 `SourceDocumentInput` / `SourceDocumentInputView` 组件测试继续通过
