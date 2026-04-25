# 记一笔弹窗关闭行为 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让“记一笔”弹窗在用户提交后立即关闭，并且不再把“清空输入内容”当成用户可见的乐观反馈。

**Architecture:** 现有“记一笔”弹窗由 [`src/modules/workspace/ui/LedgerPageClient.tsx`](/home/dev/workspace/Cashier/src/modules/workspace/ui/LedgerPageClient.tsx) 统一承载，内部在 AI 记账和快速入账之间切换。修复时需要把“关闭时机”从各自表单的本地重置逻辑里剥离出来，改为统一的“提交即关闭”语义，同时用测试锁住 AI 与 Quick 两条链路的行为，避免再次回到“先清空、后关闭”或“等待服务端成功才关闭”的不一致状态。

**Tech Stack:** Next.js 16, React 19, TanStack Query 5, Vitest, Testing Library

---

## 调查结论

- AI 记账创建链路已经在提交时触发关闭回调：
  [`src/modules/source-document/hooks/useSourceDocumentInputController.ts`](/home/dev/workspace/Cashier/src/modules/source-document/hooks/useSourceDocumentInputController.ts)
- 但同一链路又在 `onOptimisticUpdate` 里立即执行 `setText("")` 和 `setImages([])`，现有测试也把这个行为明确命名为 “clears create input optimistically”：
  [`tests/unit/modules/source-document/hooks/useSourceDocumentInputController.test.tsx`](/home/dev/workspace/Cashier/tests/unit/modules/source-document/hooks/useSourceDocumentInputController.test.tsx)
- 记一笔父弹窗使用 Radix Dialog，并带有 `data-[state=closed]:animate-out` 关闭动画；推断这会让“关闭中仍短暂可见的内容”显示为已清空状态，看起来像“只是清空了”，而不是“直接关闭”：
  [`src/components/ui/dialog.tsx`](/home/dev/workspace/Cashier/src/components/ui/dialog.tsx)
- 快速入账并没有真正做“提交即关闭”；它目前是在 mutation 成功后的 `onSuccessExtra` 里先重置本地表单，再调用 `onSuccess` 关闭父弹窗：
  [`src/modules/source-document/hooks/useQuickEntryFormController.ts`](/home/dev/workspace/Cashier/src/modules/source-document/hooks/useQuickEntryFormController.ts)
- 现有测试只覆盖了 AI 输入的“立即关闭”，没有覆盖 QuickEntry 的关闭时机，因此这条链路的语义目前没有测试护栏。

## File Map

- Modify: [`src/modules/source-document/hooks/useSourceDocumentInputController.ts`](/home/dev/workspace/Cashier/src/modules/source-document/hooks/useSourceDocumentInputController.ts)
  AI 记账创建链路；移除会在关闭动画期间暴露给用户的“乐观清空”。
- Modify: [`src/modules/source-document/hooks/useQuickEntryFormController.ts`](/home/dev/workspace/Cashier/src/modules/source-document/hooks/useQuickEntryFormController.ts)
  快速入账链路；把关闭时机改成提交即关闭，并移除成功后可见的本地重置闪烁。
- Modify: [`tests/unit/modules/source-document/hooks/useSourceDocumentInputController.test.tsx`](/home/dev/workspace/Cashier/tests/unit/modules/source-document/hooks/useSourceDocumentInputController.test.tsx)
  将 AI 创建模式的测试从“乐观清空”改成“关闭语义优先，不在 pending 期间清空草稿”。
- Create: [`tests/unit/modules/source-document/hooks/useQuickEntryFormController.test.tsx`](/home/dev/workspace/Cashier/tests/unit/modules/source-document/hooks/useQuickEntryFormController.test.tsx)
  新增快速入账提交即关闭的时序测试。
- Modify: [`tests/unit/modules/workspace/ui/LedgerPageClient.test.tsx`](/home/dev/workspace/Cashier/tests/unit/modules/workspace/ui/LedgerPageClient.test.tsx)
  锁住父弹窗对子表单 `onSuccess` 的关闭 wiring，避免后续重构时丢失。

### Task 1: 先用测试锁住“关闭优先”语义

**Files:**
- Modify: `tests/unit/modules/source-document/hooks/useSourceDocumentInputController.test.tsx`
- Create: `tests/unit/modules/source-document/hooks/useQuickEntryFormController.test.tsx`
- Modify: `tests/unit/modules/workspace/ui/LedgerPageClient.test.tsx`

- [ ] **Step 1: 把 AI 创建模式的旧测试改成新的失败用例**

```tsx
it("keeps create draft intact while the request is pending", async () => {
  const deferred = createDeferred<{ sourceDocumentId: string; status: string }>();
  vi.mocked(createSourceDocumentAction).mockReturnValue(deferred.promise as never);

  const { result } = renderHook(() =>
    useSourceDocumentInputController({
      ledgerId: "ledger-1",
      mode: "create",
      initialData: {
        text: "Lunch",
        images: [{ data: "image-1", mimeType: "image/png" }],
      },
      messages: createMessages(),
    })
  );

  act(() => {
    result.current.handleSubmit();
  });

  await waitFor(() => {
    expect(createSourceDocumentAction).toHaveBeenCalledTimes(1);
  });

  expect(result.current.text).toBe("Lunch");
  expect(result.current.images).toEqual([{ data: "image-1", mimeType: "image/png" }]);
});
```

- [ ] **Step 2: 运行单测，确认它先失败**

Run: `npx vitest run tests/unit/modules/source-document/hooks/useSourceDocumentInputController.test.tsx`
Expected: FAIL，仍然看到当前实现把 `text` / `images` 立即清空

- [ ] **Step 3: 新增 QuickEntry 提交即关闭的失败用例**

```tsx
it("calls onSuccess immediately when submitting quick entry", async () => {
  const deferred = createDeferred({ id: "entry-1" });
  vi.mocked(createQuickEntryAction).mockReturnValue(deferred.promise as never);
  const onSuccess = vi.fn();

  const { result } = renderHook(() =>
    useQuickEntryFormController({
      ledgerId: "ledger-1",
      categories: [categoryFactory()],
      mainCurrency: "CNY",
      onSuccess,
    })
  );

  act(() => {
    result.current.setSelectedCategoryId("cat-1");
    result.current.setAmount(23);
    result.current.handleSubmit();
  });

  expect(onSuccess).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 4: 运行 QuickEntry 新测试，确认它先失败**

Run: `npx vitest run tests/unit/modules/source-document/hooks/useQuickEntryFormController.test.tsx`
Expected: FAIL，当前实现会等 mutation success 后才调用 `onSuccess`

- [ ] **Step 5: 给父弹窗 wiring 补一个回归测试**

```tsx
it("closes the dialog when ai child invokes onSuccess", () => {
  const setIsInputOpen = vi.fn();
  useLedgerDialogStateMock.mockReturnValue({
    isInputOpen: true,
    setIsInputOpen,
    inputMode: "ai",
    setInputMode: vi.fn(),
    isPendingOpen: false,
    setIsPendingOpen: vi.fn(),
    handleInputDialogChange: vi.fn(),
  });

  render(<LedgerPageClient ledgerId="ledger-1" initialTab="stream" initialPeriod={{ period: "thisMonth" }} />);
  fireEvent.click(screen.getByTestId("source-document-input"));

  expect(setIsInputOpen).toHaveBeenCalledWith(false);
});
```

- [ ] **Step 6: 运行父弹窗测试，确认 wiring 被锁住**

Run: `npx vitest run tests/unit/modules/workspace/ui/LedgerPageClient.test.tsx`
Expected: PASS（若 mock 还没触发 `props.onSuccess`，先在测试 mock 内补齐）

- [ ] **Step 7: Commit**

```bash
git add tests/unit/modules/source-document/hooks/useSourceDocumentInputController.test.tsx \
  tests/unit/modules/source-document/hooks/useQuickEntryFormController.test.tsx \
  tests/unit/modules/workspace/ui/LedgerPageClient.test.tsx
git commit -m "test: lock ledger input close timing"
```

### Task 2: 修正 AI 记账创建链路，不再用“乐观清空”当用户反馈

**Files:**
- Modify: `src/modules/source-document/hooks/useSourceDocumentInputController.ts`
- Test: `tests/unit/modules/source-document/hooks/useSourceDocumentInputController.test.tsx`

- [ ] **Step 1: 删除创建模式里会立即清空草稿的本地状态修改**

```ts
const createMutation = useLedgerMutation<unknown, SubmitPayload, CreateRollbackContext>(ledgerId, {
  mutationFn: async (payload) => createSourceDocumentAction(ledgerId, payload),
  successMessage: messages.uploadSuccess,
  errorMessage: messages.uploadError,
  cancelPredicates: [createExactPredicate(queryKeys.sourceDocuments(ledgerId, "pending"))],
  skipInvalidation: true,
  onOptimisticUpdate: async (queryClient) => {
    const previousPending = queryClient.getQueryData(queryKeys.sourceDocuments(ledgerId, "pending"));
    return { previousPending };
  },
  onRollback: (queryClient, context) => {
    if (context.previousPending !== undefined) {
      queryClient.setQueryData(queryKeys.sourceDocuments(ledgerId, "pending"), context.previousPending);
    }
  },
});
```

- [ ] **Step 2: 清理不再需要的 rollback context 字段**

```ts
interface CreateRollbackContext {
  previousPending?: unknown;
}
```

- [ ] **Step 3: 运行 AI controller 测试，确认新语义通过**

Run: `npx vitest run tests/unit/modules/source-document/hooks/useSourceDocumentInputController.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/modules/source-document/hooks/useSourceDocumentInputController.ts \
  tests/unit/modules/source-document/hooks/useSourceDocumentInputController.test.tsx
git commit -m "fix: keep ai entry draft stable while closing dialog"
```

### Task 3: 统一 QuickEntry 为“提交即关闭”，移除成功后重置闪烁

**Files:**
- Modify: `src/modules/source-document/hooks/useQuickEntryFormController.ts`
- Test: `tests/unit/modules/source-document/hooks/useQuickEntryFormController.test.tsx`

- [ ] **Step 1: 把关闭时机前移到 submit 事件里**

```ts
const handleSubmit = () => {
  if (selectedCategoryId === null || amount <= 0) return;
  const nextItemName = itemName !== "" ? itemName : undefined;

  onSuccess?.();
  mutation.mutate({
    categoryId: selectedCategoryId,
    amount,
    entryDate: formatDateTimeForApi(entryDate),
    ...(nextItemName !== undefined ? { itemName: nextItemName } : {}),
  });
};
```

- [ ] **Step 2: 删除会在成功时先重置再关闭的本地重置逻辑**

```ts
const mutation = useLedgerMutation(ledgerId, {
  mutationFn: (data: CreateQuickEntryPayload) => createQuickEntryAction(ledgerId, data),
  successMessage: t("quickEntrySuccess"),
  errorMessage: t("quickEntryError"),
  cancelPredicates: [invalidateSourceDocuments(ledgerId), invalidateLedgerEntries(ledgerId)],
  invalidatePredicates: [
    invalidateSourceDocuments(ledgerId),
    invalidateLedgerEntries(ledgerId),
    invalidateLedgerStats(ledgerId),
    invalidateCalendar(ledgerId),
  ],
  onOptimisticUpdate: (queryClient, variables) => {
    // 保留现有 cache optimistic update
  },
});
```

- [ ] **Step 3: 运行 QuickEntry 测试，确认关闭时机改对**

Run: `npx vitest run tests/unit/modules/source-document/hooks/useQuickEntryFormController.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/modules/source-document/hooks/useQuickEntryFormController.ts \
  tests/unit/modules/source-document/hooks/useQuickEntryFormController.test.tsx
git commit -m "fix: close quick entry dialog on submit"
```

### Task 4: 全链路回归验证

**Files:**
- Verify: `tests/unit/source-document/components/SourceDocumentInput.test.tsx`
- Verify: `tests/unit/modules/source-document/hooks/useSourceDocumentInputController.test.tsx`
- Verify: `tests/unit/modules/source-document/hooks/useQuickEntryFormController.test.tsx`
- Verify: `tests/unit/modules/workspace/ui/LedgerPageClient.test.tsx`

- [ ] **Step 1: 跑与记一笔弹窗相关的定向单测**

Run: `npx vitest run tests/unit/source-document/components/SourceDocumentInput.test.tsx tests/unit/modules/source-document/hooks/useSourceDocumentInputController.test.tsx tests/unit/modules/source-document/hooks/useQuickEntryFormController.test.tsx tests/unit/modules/workspace/ui/LedgerPageClient.test.tsx`
Expected: PASS

- [ ] **Step 2: 如有时间，补一次更高层人工验证**

Run: `npm run dev`
Expected: 在“记一笔”弹窗内，无论是 AI 记账还是快速入账，点击提交后都立即进入关闭流程；用户不再看到“表单被清空但弹窗还没走”的视觉反馈

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "test: verify ledger input close behavior"
```
