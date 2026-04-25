# Entry Date Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户在 AI 上传入账和编辑重试时可以指定入账日期，快速入账日期选择器已存在无需改动。

**Architecture:** 后端 `retry-source-document.ts` 忽略了 `input.entryDate`（bug），需修复。前端在 `SourceDocumentInputView` 中新增可选日期选择器，通过 `initialData.entryDate` 传入重试时的默认日期。AI 不解析日期（已确认），无需改动提示词。

**Tech Stack:** Next.js App Router, TypeScript, TanStack Query, date-fns, Shadcn/ui (`DateFilter` component), Vitest

---

## 现状确认

- **快速入账**：`QuickEntryForm.tsx` 已有 `DateFilter` + `entryDate` 状态，**无需改动**
- **AI 入账 / 编辑重试**：`buildSubmitPayload` 硬编码 `formatDateTimeForApi(new Date())`，无日期 UI
- **后端 retry**：`retry-source-document.ts:91` 写死 `entryDate: existingDocument.entryDate`，从不读 `input?.entryDate`
- **AI 提示词**：均无日期字段，`getEntryFallbackDate` 直接用 `doc.entryDate` 作为 fallback，无需改动

## 文件变更清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `src/modules/source-document/application/use-cases/retry-source-document.ts` | 修改 | 修复 entryDate bug，优先使用 input.entryDate |
| `src/modules/source-document/ui/source-document-input.types.ts` | 修改 | initialData 增加 entryDate?: string |
| `src/modules/source-document/hooks/useSourceDocumentInputController.ts` | 修改 | 增加 entryDate 状态，传入 buildSubmitPayload |
| `src/modules/source-document/ui/SourceDocumentInputView.tsx` | 修改 | 增加日期选择器 UI |
| `src/modules/source-document/ui/SourceDocumentInput.tsx` | 修改 | 透传日期 props 和 messages |
| `src/modules/source-document/ui/SourceDocumentEditRetryDialog.tsx` | 修改 | 将 sourceDocument.entryDate 传入 initialData |
| `messages/en.json` | 修改 | 增加 SourceDocumentInput.entryDate i18n key |
| `messages/zh.json` | 修改 | 增加 SourceDocumentInput.entryDate i18n key |
| `tests/unit/modules/source-document/application/use-cases/retry-source-document.test.ts` | 修改 | 增加 entryDate 覆盖测试 |

---

## Task 1: 修复后端 retry 忽略 input.entryDate 的 bug

**Files:**
- Modify: `src/modules/source-document/application/use-cases/retry-source-document.ts` (目标行约第 98 行)
- Test: `tests/unit/modules/source-document/application/use-cases/retry-source-document.test.ts`

- [ ] **Step 1: 写失败测试**

在 `retry-source-document.test.ts` 末尾的 `describe` 块中追加两个测试：

```typescript
it("uses input.entryDate when provided, ignoring existingDocument.entryDate", async () => {
  const randomUUIDMock = vi
    .spyOn(globalThis.crypto, "randomUUID")
    .mockReturnValue("new-doc" as ReturnType<typeof crypto.randomUUID>);
  findFirstMock.mockResolvedValueOnce({
    id: "doc-1", ledgerId: "ledger-1", text: "t", imageUrls: [], metadata: {},
    entryDate: "2026-03-10",
  });
  processImagesMock.mockResolvedValueOnce([]);
  rehomeLocalUploadUrlsMock.mockImplementation(
    ({ imageUrls }: { imageUrls: string[] }) => Promise.resolve(imageUrls)
  );

  await retrySourceDocument({
    ledgerId: "ledger-1",
    ledger: { id: "ledger-1", userId: "u", metadata: {}, createdAt: new Date(), updatedAt: new Date(), deletedAt: null },
    sourceDocumentId: "doc-1",
    input: { entryDate: "2026-03-22" },
  });

  expect(insertValuesMock).toHaveBeenCalledWith(
    expect.objectContaining({ entryDate: "2026-03-22" })
  );
  randomUUIDMock.mockRestore();
});

it("falls back to existingDocument.entryDate when input.entryDate not provided", async () => {
  const randomUUIDMock = vi
    .spyOn(globalThis.crypto, "randomUUID")
    .mockReturnValue("new-doc" as ReturnType<typeof crypto.randomUUID>);
  findFirstMock.mockResolvedValueOnce({
    id: "doc-1", ledgerId: "ledger-1", text: "t", imageUrls: [], metadata: {},
    entryDate: "2026-03-10",
  });
  processImagesMock.mockResolvedValueOnce([]);
  rehomeLocalUploadUrlsMock.mockImplementation(
    ({ imageUrls }: { imageUrls: string[] }) => Promise.resolve(imageUrls)
  );

  await retrySourceDocument({
    ledgerId: "ledger-1",
    ledger: { id: "ledger-1", userId: "u", metadata: {}, createdAt: new Date(), updatedAt: new Date(), deletedAt: null },
    sourceDocumentId: "doc-1",
  });

  expect(insertValuesMock).toHaveBeenCalledWith(
    expect.objectContaining({ entryDate: "2026-03-10" })
  );
  randomUUIDMock.mockRestore();
});
```

- [ ] **Step 2: 跑测试确认新测试失败**

```bash
npx vitest run tests/unit/modules/source-document/application/use-cases/retry-source-document.test.ts
```

预期：只有 "uses input.entryDate" 测试失败（实际收到 `"2026-03-10"` 而非 `"2026-03-22"`）。
"falls back" 测试在修复前就通过——因为 bug 代码恰好执行了 fallback 逻辑（`entryDate: existingDocument.entryDate`）。

- [ ] **Step 3: 修复 retry-source-document.ts**

将 `retry-source-document.ts` 约第 98 行从：
```typescript
    entryDate: existingDocument.entryDate,
```
改为：
```typescript
    entryDate: input?.entryDate ?? existingDocument.entryDate,
```

- [ ] **Step 4: 跑测试确认全部通过**

```bash
npx vitest run tests/unit/modules/source-document/application/use-cases/retry-source-document.test.ts
```

预期：所有测试通过。

- [ ] **Step 5: Commit**

```bash
git add src/modules/source-document/application/use-cases/retry-source-document.ts \
  tests/unit/modules/source-document/application/use-cases/retry-source-document.test.ts
git commit -m "$(cat <<'EOF'
fix: retry source document respects input.entryDate over existing document date
EOF
)"
```

---

## Task 2: 扩展 initialData 类型，controller 增加 entryDate 状态

**Files:**
- Modify: `src/modules/source-document/ui/source-document-input.types.ts`
- Modify: `src/modules/source-document/hooks/useSourceDocumentInputController.ts`

- [ ] **Step 1: 扩展 initialData 类型**

[source-document-input.types.ts](src/modules/source-document/ui/source-document-input.types.ts) 改为：

```typescript
export interface SourceDocumentInputProps {
  ledgerId: string;
  onSuccess?: () => void;
  mode?: "create" | "retry";
  sourceDocumentId?: string;
  initialData?: {
    text?: string;
    images?: Array<{ data: string; mimeType: string }>;
    entryDate?: string;
  };
}
```

- [ ] **Step 2: controller 新增 entryDate 状态和初始化逻辑**

在 [useSourceDocumentInputController.ts](src/modules/source-document/hooks/useSourceDocumentInputController.ts) 中：

2a. 在已有 `import { formatDateTimeForApi } from "@/lib/date-utils"` 改为：
```typescript
import { formatDateTimeForApi, parseDateString } from "@/lib/date-utils";
```

2b. 在 `const [images, setImages] = useState(...)` 后新增：
```typescript
const [entryDate, setEntryDate] = useState<Date>(() => {
  if (initialData?.entryDate != null) {
    const parsed = parseDateString(initialData.entryDate);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
});
```

2c. 在现有的 `startTransition` 回调中（`useEffect` 里）追加 entryDate 重置：
```typescript
startTransition(() => {
  setText(initialData.text ?? "");
  setImages(toEditableImages(initialData.images));
  if (initialData.entryDate != null) {
    const parsed = parseDateString(initialData.entryDate);
    if (!isNaN(parsed.getTime())) setEntryDate(parsed);
  }
});
```

2d. 修改 `buildSubmitPayload` 函数接受 `entryDate: Date` 参数（替换内部的 `new Date()`）：
```typescript
function buildSubmitPayload(
  text: string,
  images: EditableInputImage[],
  entryDate: Date,
): SubmitPayload {
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

2e. 在 `handleSubmit` 中更新调用：
```typescript
const payload = buildSubmitPayload(text, images, entryDate);
```

2f. 在 return 对象中追加：
```typescript
entryDate,
setEntryDate,
```

> 类型说明：`entryDate` 为 `Date`，`setEntryDate` 为 `React.Dispatch<React.SetStateAction<Date>>`（即 `useState<Date>` 返回的 setter）。
>
> **null 处理链路**：`DateFilter.onChange` 签名为 `(date: Date | null) => void`，null 是用户清空选择时触发的。null 在 View 层的 Step 2e 中已通过 `(date) => onEntryDateChange(date ?? new Date())` 消掉，所以 `onEntryDateChange` prop 的类型为 `(date: Date) => void`（永远不收到 null）。因此在 Task 3 Step 3 中把 `controller.setEntryDate` 直接传给 `onEntryDateChange` 是类型安全的——`Dispatch<SetStateAction<Date>>` 与 `(date: Date) => void` 兼容。

- [ ] **Step 3: 跑类型检查确认无新增错误**

```bash
npx tsc --noEmit 2>&1 | head -40
```

预期：无新增 TS 错误。

- [ ] **Step 4: Commit**

```bash
git add src/modules/source-document/ui/source-document-input.types.ts \
  src/modules/source-document/hooks/useSourceDocumentInputController.ts
git commit -m "$(cat <<'EOF'
feat: add entryDate state to SourceDocumentInput controller
EOF
)"
```

---

## Task 3: SourceDocumentInputView 增加日期选择器 UI

**Files:**
- Modify: `src/modules/source-document/ui/SourceDocumentInputView.tsx`
- Modify: `src/modules/source-document/ui/SourceDocumentInput.tsx`
- Modify: `messages/en.json`
- Modify: `messages/zh.json`

- [ ] **Step 1: 在 en.json 和 zh.json 新增 i18n key**

> ⚠️ 注意：`LedgerEntryDetail` 命名空间中已有 `"entryDate"` key（en.json 约第 259 行），**不要修改它**。
> 下面的 key 必须加在 `"SourceDocumentInput": { ... }` 块内部。

`messages/en.json` 的 `"SourceDocumentInput"` 块中追加：
```json
"entryDate": "Date (optional)"
```

`messages/zh.json` 的 `"SourceDocumentInput"` 块中追加：
```json
"entryDate": "日期（可选）"
```

- [ ] **Step 2: 扩展 SourceDocumentInputViewMessages 和 Props**

在 [SourceDocumentInputView.tsx](src/modules/source-document/ui/SourceDocumentInputView.tsx) 中：

2a. 新增 import：
```typescript
import { DateFilter } from "@/components/ui/date-filter";
```

2b. 在 `SourceDocumentInputViewMessages` 接口末尾追加：
```typescript
entryDate: string;
```

2c. 在 `SourceDocumentInputViewProps` 接口末尾追加：
```typescript
entryDate: Date;
onEntryDateChange: (date: Date) => void;
```

2d. 在函数参数解构中追加：
```typescript
entryDate,
onEntryDateChange,
```

2e. 在 `<Textarea ... />` 和下方 action buttons 之间（即 `<div className="flex ..."` 之前）插入：

> 注意：`DateFilter.onChange` 回调签名为 `(date: Date | null) => void`，而 `onEntryDateChange` 的类型是 `(date: Date) => void`（见 2c）。因此此处用 `date ?? new Date()` 处理用户清空选择时的 null 情况，保证 controller 状态始终是有效 Date。

```tsx
{/* Entry Date */}
<DateFilter
  value={entryDate}
  onChange={(date) => onEntryDateChange(date ?? new Date())}
  placeholder={messages.entryDate}
  size="sm"
  className="w-full"
/>
```

- [ ] **Step 3: 透传 props 到 SourceDocumentInputView**

在 [SourceDocumentInput.tsx](src/modules/source-document/ui/SourceDocumentInput.tsx) 中，从 `controller` 解构 `entryDate` 和 `setEntryDate`，并透传给 `SourceDocumentInputView`。

> 接线说明：`onEntryDateChange={controller.setEntryDate}` 是类型安全的，原因如下：
> 1. View 层 Step 2e 中 `DateFilter.onChange` 的回调写为 `(date) => onEntryDateChange(date ?? new Date())`，在 View 内部就消掉了 `null`。
> 2. 因此 `onEntryDateChange` prop 的类型是 `(date: Date) => void`（永远不传 null 给 controller）。
> 3. `controller.setEntryDate`（`React.Dispatch<React.SetStateAction<Date>>`）与 `(date: Date) => void` 兼容，直接传引用无需包装。

```tsx
<SourceDocumentInputView
  mode={controller.mode}
  text={controller.text}
  entryDate={controller.entryDate}
  images={controller.images}
  selectedImageIndex={controller.selectedImageIndex}
  fileInputRef={controller.fileInputRef}
  isPending={controller.isPending}
  canSubmit={controller.canSubmit}
  messages={{
    placeholder: t("placeholder"),
    image: t("image"),
    send: t("send"),
    retry: tCommon("retry"),
    delete: tCommon("delete"),
    sendingStatus: tCommon("sending_status"),
    entryDate: t("entryDate"),
  }}
  onTextChange={controller.setText}
  onTextareaPaste={controller.handleTextareaPaste}
  onFileInputChange={controller.handleFileInputChange}
  onSelectImages={controller.triggerFileDialog}
  onSubmit={controller.handleSubmit}
  onRemoveImage={controller.removeImage}
  onImageOpen={controller.openImage}
  onImageClose={controller.closeImage}
  onImageModalSave={controller.handleModalSave}
  onEntryDateChange={controller.setEntryDate}
/>
```

- [ ] **Step 4: 跑类型检查确认无错误**

```bash
npx tsc --noEmit 2>&1 | head -40
```

预期：无新增 TS 错误。

- [ ] **Step 5: Commit**

```bash
git add src/modules/source-document/ui/SourceDocumentInputView.tsx \
  src/modules/source-document/ui/SourceDocumentInput.tsx \
  messages/en.json messages/zh.json
git commit -m "$(cat <<'EOF'
feat: add entry date picker to AI upload and retry input
EOF
)"
```

---

## Task 4: EditRetryDialog 传入 sourceDocument.entryDate 作为初始值

**Files:**
- Modify: `src/modules/source-document/ui/SourceDocumentEditRetryDialog.tsx`

当用户打开编辑重试对话框时，日期选择器默认值应为 source document 的入账日期（而非今天）。

- [ ] **Step 1: 将 sourceDocument.entryDate 纳入 initialData**

> **类型说明**：`SourceDocumentLightDto`（`src/modules/source-document/document-contracts.ts:77`）已声明 `entryDate: string | null`，所以 `"entryDate" in sourceDocument` 检查对所有可能的 prop 类型（`SourceDocument | SourceDocumentLight | { id: string }`）都能正确收窄，TypeScript 不会报错。
>
> **`fullData` 不含 `entryDate`**：dialog 通过 `useQuery` 拉取的 `fullData`（`SourceDocumentFullDto`）只有 `{ text, imageUrls, status, createdAt }`，没有 `entryDate` 字段。因此两个 `useMemo` 分支都从 `sourceDocument` prop（而非 `fullData`）读取 `entryDate`，这是正确的——原始 prop 始终带有 `entryDate`。

在 [SourceDocumentEditRetryDialog.tsx](src/modules/source-document/ui/SourceDocumentEditRetryDialog.tsx) 的 `useMemo` 中，两个分支都追加 `entryDate`：

```tsx
const initialData = useMemo(() => {
  // Get entryDate from sourceDocument if available
  const sourceDocEntryDate =
    "entryDate" in sourceDocument ? (sourceDocument.entryDate ?? undefined) : undefined;

  // If we fetched full data, use it
  if (fullData != null) {
    return {
      images:
        fullData.imageUrls?.map((url) => ({
          data: url,
          mimeType: "image/jpeg",
        })) ?? [],
      ...(fullData.text != null ? { text: fullData.text } : {}),
      ...(sourceDocEntryDate != null ? { entryDate: sourceDocEntryDate } : {}),
    };
  }

  // Otherwise use existing sourceDocument data
  const imageUrls = "imageUrls" in sourceDocument ? sourceDocument.imageUrls : undefined;
  const text = "text" in sourceDocument ? sourceDocument.text : undefined;
  return {
    images:
      imageUrls?.map((url) => ({
        data: url,
        mimeType: "image/jpeg",
      })) ?? [],
    ...(text != null ? { text } : {}),
    ...(sourceDocEntryDate != null ? { entryDate: sourceDocEntryDate } : {}),
  };
}, [sourceDocument, fullData]);
```

- [ ] **Step 2: 跑类型检查**

```bash
npx tsc --noEmit 2>&1 | head -40
```

预期：无新增 TS 错误。

- [ ] **Step 3: 跑全量测试确认无回归**

```bash
npx vitest run
```

预期：所有测试通过。

- [ ] **Step 4: Commit**

```bash
git add src/modules/source-document/ui/SourceDocumentEditRetryDialog.tsx
git commit -m "$(cat <<'EOF'
feat: pre-fill entry date in edit retry dialog from existing document
EOF
)"
```

---

## 验收标准

1. **AI 上传入账**：`SourceDocumentInput`（mode=create）显示日期选择器，默认今天，用户可修改；提交时 `entryDate` 以用户选择的日期传给后端
2. **编辑重试**：`SourceDocumentEditRetryDialog` 打开时日期选择器默认为原文档的 `entryDate`；用户可修改；提交后新文档使用用户选择的日期
3. **快速入账**：行为与之前完全相同（不受本次改动影响）
4. **后端 retry**：`input.entryDate` 有值时优先使用，否则 fallback 到原文档日期
5. **日期格式**：统一为 `yyyy-MM-dd`
6. **全量测试通过**：`npx vitest run` 全绿