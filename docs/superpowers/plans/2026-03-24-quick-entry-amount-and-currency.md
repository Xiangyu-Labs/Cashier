# 快速记账金额输入与货币选择 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复快速记账金额输入时的字体跳变，把内联金额输入改成按分录入的常见马来西亚样式，并让快速入账可以选择货币且默认主货币。

**Architecture:** 把“按分录入 + 编辑态与展示态排版一致”的行为收敛到复用组件 [`src/components/ui/calculator-input.tsx`](/home/dev/workspace/Cashier/src/components/ui/calculator-input.tsx)，这样快速记账和现有金额编辑入口共享同一套金额交互，不再在表单层各自格式化。快速记账的服务端 contract 已经支持 `currency` 且会在缺省时回落主货币，所以实现重点在前端 controller / form / 页面 wiring：新增显式 `currency` 状态与选择器，并把 optimistic entry 改成“币种真实、折合值不造假”的策略，主货币直接预填折合金额，非主货币先留空等服务端返回。

**Tech Stack:** Next.js 16, React 19, TypeScript, TanStack Query 5, Radix Select, Vitest, Testing Library

---

## 调查结论

- [`src/components/ui/calculator-input.tsx`](/home/dev/workspace/Cashier/src/components/ui/calculator-input.tsx) 的展示态使用 `displayClassName`，但内联输入态又额外强塞了 `!text-base`，所以一点击金额就会出现字号/字形跳变。
- 同一个组件当前把内联输入当作普通十进制字符串处理；输入 `1300` 会得到 `1300.00`，不符合“1300 -> 13.00 / 1454 -> 14.54”的按分录入预期。
- [`src/modules/source-document/ui/QuickEntryForm.tsx`](/home/dev/workspace/Cashier/src/modules/source-document/ui/QuickEntryForm.tsx) 只暴露了金额，没有货币选择 UI。
- [`src/modules/source-document/hooks/useQuickEntryFormController.ts`](/home/dev/workspace/Cashier/src/modules/source-document/hooks/useQuickEntryFormController.ts) 的 mutation payload 没有 `currency`，而 optimistic entry 也把 `currency` 和 `convertedAmount` 全部硬编码成 `mainCurrency`，如果只补 UI 不修这里，前端会先乐观显示错币种、错折合值。
- 服务端链路已经支持目标行为：
  [`src/modules/source-document/contract-schemas.ts`](/home/dev/workspace/Cashier/src/modules/source-document/contract-schemas.ts) 允许 `currency?: string`，
  [`src/modules/source-document/application/use-cases/create-quick-entry.ts`](/home/dev/workspace/Cashier/src/modules/source-document/application/use-cases/create-quick-entry.ts) 会在未传货币时回落到 ledger 主货币，
  [`tests/integration/source-document/quick-entry.test.ts`](/home/dev/workspace/Cashier/tests/integration/source-document/quick-entry.test.ts) 已覆盖“默认主货币 / 使用指定货币”的服务端行为。

## File Map

- Modify: [`src/components/ui/calculator-input.tsx`](/home/dev/workspace/Cashier/src/components/ui/calculator-input.tsx)
  内联金额输入的核心行为与样式；修复字体跳变并实现按分录入。
- Modify: [`tests/unit/components/calculator-input.test.tsx`](/home/dev/workspace/Cashier/tests/unit/components/calculator-input.test.tsx)
  锁住 `CalculatorInput` 的排版一致性与按分录入语义。
- Modify: [`src/modules/source-document/hooks/useQuickEntryFormController.ts`](/home/dev/workspace/Cashier/src/modules/source-document/hooks/useQuickEntryFormController.ts)
  新增 `currency` 状态，提交 payload 带上货币，并修正 optimistic entry 的币种/折合值。
- Modify: [`tests/unit/modules/source-document/hooks/useQuickEntryFormController.test.tsx`](/home/dev/workspace/Cashier/tests/unit/modules/source-document/hooks/useQuickEntryFormController.test.tsx)
  锁住“默认主货币”“提交带货币”“optimistic entry 不再伪装成主货币”。
- Modify: [`src/modules/source-document/ui/QuickEntryForm.tsx`](/home/dev/workspace/Cashier/src/modules/source-document/ui/QuickEntryForm.tsx)
  增加货币选择器，并把它接到 controller 返回值。
- Create: [`tests/unit/modules/source-document/ui/QuickEntryForm.test.tsx`](/home/dev/workspace/Cashier/tests/unit/modules/source-document/ui/QuickEntryForm.test.tsx)
  锁住货币选择器渲染、默认主货币、首屏选项顺序。
- Modify: [`src/modules/workspace/ui/LedgerPageClient.tsx`](/home/dev/workspace/Cashier/src/modules/workspace/ui/LedgerPageClient.tsx)
  把 ledger 的 `mainCurrency` / `preferredCurrencies` 传进快速记账表单。
- Modify: [`tests/unit/modules/workspace/ui/LedgerPageClient.test.tsx`](/home/dev/workspace/Cashier/tests/unit/modules/workspace/ui/LedgerPageClient.test.tsx)
  锁住父级 wiring，确保 quick 模式下确实传入主货币和偏好货币。
- Modify: [`messages/zh.json`](/home/dev/workspace/Cashier/messages/zh.json)
  新增快速记账货币文案。
- Modify: [`messages/en.json`](/home/dev/workspace/Cashier/messages/en.json)
  新增快速记账货币文案的英文对应项。

### Task 1: 先用测试锁住金额输入回归

**Files:**
- Modify: `tests/unit/components/calculator-input.test.tsx`

- [ ] **Step 1: 为“输入态不再改字体”写失败测试**

```tsx
it("keeps the same typography when switching into inline edit mode", () => {
  render(
    <CalculatorInput
      value={0}
      onChange={() => {}}
      displayClassName="text-3xl font-bold font-mono text-center"
    />
  );

  fireEvent.click(screen.getByRole("button", { name: "0.00" }));
  const input = screen.getByRole("textbox");

  expect(input.className).toContain("font-mono");
  expect(input.className).toContain("text-3xl");
  expect(input.className).not.toContain("!text-base");
});
```

- [ ] **Step 2: 运行单测，确认当前实现先失败**

Run: `npx vitest run tests/unit/components/calculator-input.test.tsx -t "keeps the same typography when switching into inline edit mode"`
Expected: FAIL，因为当前输入态类名里仍然存在 `!text-base`

- [ ] **Step 3: 为“1300 -> 13.00”写失败测试**

```tsx
it("treats inline digit typing as minor units", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();

  render(<CalculatorInput value={0} onChange={onChange} />);

  fireEvent.click(screen.getByRole("button", { name: "0.00" }));
  const input = screen.getByRole("textbox");

  await user.type(input, "1300{Enter}");

  expect(onChange).toHaveBeenCalledWith(13);
});
```

- [ ] **Step 4: 运行单测，确认当前实现先失败**

Run: `npx vitest run tests/unit/components/calculator-input.test.tsx -t "treats inline digit typing as minor units"`
Expected: FAIL，当前实现会把 `1300` 当作 `1300.00`

- [ ] **Step 5: 为“1454 -> 14.54 且退格继续按分移动”写失败测试**

```tsx
it("keeps minor-unit semantics when deleting digits", async () => {
  const user = userEvent.setup();

  render(<CalculatorInput value={0} onChange={() => {}} />);

  fireEvent.click(screen.getByRole("button", { name: "0.00" }));
  const input = screen.getByRole("textbox");

  await user.type(input, "1454");
  expect(input).toHaveValue("14.54");

  await user.type(input, "{Backspace}");
  expect(input).toHaveValue("1.45");
});
```

- [ ] **Step 6: 运行单测，确认当前实现先失败**

Run: `npx vitest run tests/unit/components/calculator-input.test.tsx -t "keeps minor-unit semantics when deleting digits"`
Expected: FAIL，当前实现不会把删除动作重新解释为“去掉最后一位分”

- [ ] **Step 7: Commit**

```bash
git add tests/unit/components/calculator-input.test.tsx
git commit -m "test: lock calculator inline minor-unit input behavior"
```

### Task 2: 修复 CalculatorInput 的内联金额交互

**Files:**
- Modify: `src/components/ui/calculator-input.tsx`
- Test: `tests/unit/components/calculator-input.test.tsx`

- [ ] **Step 1: 增加“金额 <-> 按分数字串”转换 helper**

```ts
function amountToMinorUnitDigits(value: number): string {
  return Math.max(0, Math.round(value * 100)).toString();
}

function digitsToMinorUnitDisplay(digits: string): string {
  const normalized = digits.replace(/\D/g, "");
  const padded = normalized.padStart(3, "0");
  const units = padded.slice(0, -2).replace(/^0+(?=\d)/, "") || "0";
  const cents = padded.slice(-2);
  return `${units}.${cents}`;
}

function digitsToAmount(digits: string): number {
  const normalized = digits.replace(/\D/g, "");
  if (normalized === "") return 0;
  return Number.parseFloat((Number.parseInt(normalized, 10) / 100).toFixed(2));
}
```

- [ ] **Step 2: 把内联输入态从 `inputValue` 改成 digits buffer**

```ts
const [inputDigits, setInputDigits] = React.useState<string>("");

React.useEffect(() => {
  if (mode === "input") {
    setInputDigits(value === 0 ? "" : amountToMinorUnitDigits(value));
  }
}, [mode, value]);
```

- [ ] **Step 3: 改写内联输入的 `onChange` / confirm 逻辑，让它始终按分解释**

```ts
const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  setInputDigits(e.target.value.replace(/\D/g, ""));
};

const confirmInputValue = () => {
  onChange(digitsToAmount(inputDigits));
  setMode("display");
};
```

- [ ] **Step 4: 去掉会压扁字体的 `!text-base`，让输入态复用展示态字号/字形**

```tsx
<input
  ref={inputRef}
  type="text"
  inputMode="numeric"
  value={digitsToMinorUnitDisplay(inputDigits)}
  onChange={handleInputChange}
  onKeyDown={handleInputKeyDown}
  className={cn(
    "w-32 border-0 bg-transparent p-0 text-center shadow-none outline-none focus-visible:ring-0",
    displayClassName
  )}
/>
```

- [ ] **Step 5: 保持计算器弹窗逻辑不变，只让它继续消费最终 number**

```ts
const handleConfirmCalculator = () => {
  const resultValue = parseFloat(calcState.displayValue);
  if (!isNaN(resultValue) && calcState.displayValue !== "Error") {
    onChange(parseFloat(resultValue.toFixed(2)));
  }
  setMode("display");
};
```

- [ ] **Step 6: 运行金额组件单测，确认全部通过**

Run: `npx vitest run tests/unit/components/calculator-input.test.tsx`
Expected: PASS，新增的 3 个回归用例和旧用例全部通过

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/calculator-input.tsx \
  tests/unit/components/calculator-input.test.tsx
git commit -m "fix: support minor-unit inline amount entry"
```

### Task 3: 先用测试锁住快速记账货币行为

**Files:**
- Modify: `tests/unit/modules/source-document/hooks/useQuickEntryFormController.test.tsx`
- Create: `tests/unit/modules/source-document/ui/QuickEntryForm.test.tsx`
- Modify: `tests/unit/modules/workspace/ui/LedgerPageClient.test.tsx`

- [ ] **Step 1: 为 controller 补“默认主货币 + 提交带上所选货币”的失败测试**

```tsx
it("defaults currency to mainCurrency and submits the selected currency", async () => {
  vi.mocked(createQuickEntryAction).mockResolvedValue({ ledgerEntryId: "entry-1" } as never);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const { result } = renderHook(() =>
    useQuickEntryFormController({
      ledgerId: "ledger-1",
      categories: [createCategory()],
      mainCurrency: "MYR",
    }),
    { wrapper: createWrapper(queryClient) }
  );

  expect(result.current.currency).toBe("MYR");

  act(() => {
    result.current.setSelectedCategoryId("cat-1");
    result.current.setCurrency("USD");
    result.current.setAmount(14.54);
    result.current.handleSubmit();
  });

  await waitFor(() => {
    expect(createQuickEntryAction).toHaveBeenCalledWith(
      "ledger-1",
      expect.objectContaining({ currency: "USD", amount: 14.54 })
    );
  });
});
```

- [ ] **Step 2: 运行 hook 单测，确认当前实现先失败**

Run: `npx vitest run tests/unit/modules/source-document/hooks/useQuickEntryFormController.test.tsx`
Expected: FAIL，因为 hook 还没有 `currency` / `setCurrency`

- [ ] **Step 3: 为 optimistic entry 的真实币种写失败测试**

```tsx
it("uses the selected currency in optimistic entries and does not fake convertedAmount", async () => {
  const deferred = createDeferred<{ ledgerEntryId: string }>();
  vi.mocked(createQuickEntryAction).mockReturnValue(deferred.promise as never);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  queryClient.setQueryData(queryKeys.sourceDocumentCollection("ledger-1"), {
    items: [],
    nextCursor: null,
    total: 0,
  });
  queryClient.setQueryData(queryKeys.ledgerEntries("ledger-1"), {
    pages: [{ items: [] }],
    pageParams: [],
  });

  const { result } = renderHook(() =>
    useQuickEntryFormController({
      ledgerId: "ledger-1",
      categories: [createCategory()],
      mainCurrency: "MYR",
    }),
    { wrapper: createWrapper(queryClient) }
  );

  act(() => {
    result.current.setSelectedCategoryId("cat-1");
    result.current.setCurrency("USD");
    result.current.setAmount(14.54);
    result.current.handleSubmit();
  });

  const optimisticEntries = queryClient.getQueryData<{
    pages: Array<{ items: Array<{ currency: string | null; convertedAmount: string | null }> }>;
  }>(queryKeys.ledgerEntries("ledger-1"));

  expect(optimisticEntries?.pages[0]?.items[0]).toMatchObject({
    currency: "USD",
    convertedAmount: null,
  });
});
```

- [ ] **Step 4: 运行 hook 单测，确认当前实现先失败**

Run: `npx vitest run tests/unit/modules/source-document/hooks/useQuickEntryFormController.test.tsx -t "uses the selected currency in optimistic entries"`
Expected: FAIL，当前 optimistic entry 仍会写成 `currency: mainCurrency`

- [ ] **Step 5: 新建 QuickEntryForm 组件测试，锁住货币选择器默认值与顺序**

```tsx
vi.mock("@/modules/source-document/hooks/useQuickEntryFormController", () => ({
  useQuickEntryFormController: () => ({
    selectedCategoryId: null,
    setSelectedCategoryId: vi.fn(),
    selectedCategory: null,
    amount: 0,
    setAmount: vi.fn(),
    currency: "MYR",
    setCurrency: vi.fn(),
    itemName: "",
    setItemName: vi.fn(),
    entryDate: new Date("2026-03-24T00:00:00.000Z"),
    setEntryDate: vi.fn(),
    mutation: { isPending: false },
    handleSubmit: vi.fn(),
  }),
}));

it("renders currency selector with main currency first", () => {
  render(
    <QuickEntryForm
      ledgerId="ledger-1"
      categories={[createCategory()]}
      mainCurrency="MYR"
      preferredCurrencies={["USD", "CNY"]}
    />
  );

  expect(screen.getByText("MYR")).toBeTruthy();
  expect(screen.getByText("USD")).toBeTruthy();
  expect(screen.getByText("CNY")).toBeTruthy();
});
```

- [ ] **Step 6: 运行组件单测，确认当前实现先失败**

Run: `npx vitest run tests/unit/modules/source-document/ui/QuickEntryForm.test.tsx`
Expected: FAIL，因为当前表单还没有货币选择器

- [ ] **Step 7: 扩展 LedgerPageClient 测试 mock，锁住父级 wiring**

```tsx
it("passes mainCurrency and preferredCurrencies into QuickEntryForm", () => {
  useLedgerDialogStateMock.mockReturnValue({
    isInputOpen: true,
    setIsInputOpen: vi.fn(),
    inputMode: "quick",
    setInputMode: vi.fn(),
    isPendingOpen: false,
    setIsPendingOpen: vi.fn(),
    handleInputDialogChange: vi.fn(),
  });

  useQueryMock.mockImplementation(({ queryKey }) => {
    if (queryKey[0] === "ledger") {
      return {
        data: {
          id: "ledger-1",
          userId: "user-1",
          metadata: {
            settings: { mainCurrency: "MYR", currencies: ["USD", "CNY"] },
          },
        },
      };
    }
    if (queryKey[0] === "entryCategories" || queryKey[0] === "ledgers") return { data: [] };
    return { data: undefined };
  });

  render(<LedgerPageClient ledgerId="ledger-1" initialTab="stream" initialPeriod={{ period: "thisMonth" }} />);

  expect(screen.getByTestId("quick-entry-form")).toHaveAttribute("data-main-currency", "MYR");
  expect(screen.getByTestId("quick-entry-form")).toHaveAttribute(
    "data-preferred-currencies",
    "USD,CNY"
  );
});
```

- [ ] **Step 8: 运行页面 wiring 单测，确认当前实现先失败**

Run: `npx vitest run tests/unit/modules/workspace/ui/LedgerPageClient.test.tsx -t "passes mainCurrency and preferredCurrencies into QuickEntryForm"`
Expected: FAIL，因为当前 quick form 只接收 `mainCurrency`

- [ ] **Step 9: Commit**

```bash
git add tests/unit/modules/source-document/hooks/useQuickEntryFormController.test.tsx \
  tests/unit/modules/source-document/ui/QuickEntryForm.test.tsx \
  tests/unit/modules/workspace/ui/LedgerPageClient.test.tsx
git commit -m "test: lock quick entry currency selection behavior"
```

### Task 4: 实现快速记账货币选择与真实 optimistic update

**Files:**
- Modify: `src/modules/source-document/hooks/useQuickEntryFormController.ts`
- Modify: `src/modules/source-document/ui/QuickEntryForm.tsx`
- Modify: `src/modules/workspace/ui/LedgerPageClient.tsx`
- Modify: `messages/zh.json`
- Modify: `messages/en.json`
- Test: `tests/unit/modules/source-document/hooks/useQuickEntryFormController.test.tsx`
- Test: `tests/unit/modules/source-document/ui/QuickEntryForm.test.tsx`
- Test: `tests/unit/modules/workspace/ui/LedgerPageClient.test.tsx`

- [ ] **Step 1: 在 controller 中新增 `currency` 状态，并默认取 `mainCurrency`**

```ts
const [currency, setCurrency] = useState(mainCurrency);

React.useEffect(() => {
  setCurrency(mainCurrency);
}, [mainCurrency]);
```

- [ ] **Step 2: 扩展 QuickEntry mutation payload，把 `currency` 一起提交**

```ts
interface CreateQuickEntryPayload {
  categoryId: string;
  amount: number;
  currency: string;
  itemName?: string;
  entryDate: string;
}

mutation.mutate({
  categoryId: selectedCategoryId,
  amount,
  currency,
  entryDate: formatDateTimeForApi(entryDate),
  ...(nextItemName !== undefined ? { itemName: nextItemName } : {}),
});
```

- [ ] **Step 3: 修正 optimistic entry，不再把所有币种都伪装成主货币**

```ts
const optimisticConvertedAmount = currency === mainCurrency ? amount.toFixed(2) : null;
const optimisticExchangeRate = currency === mainCurrency ? "1" : null;

const tempEntry: LedgerEntry = {
  // ...
  amount: amount.toFixed(2),
  currency,
  convertedAmount: optimisticConvertedAmount,
  exchangeRate: optimisticExchangeRate,
  // ...
};
```

- [ ] **Step 4: 让 QuickEntryForm 渲染货币选择器，并把主货币放在首位**

```tsx
const preferredCurrencyOptions = Array.from(
  new Set(preferredCurrencies.filter((curr) => curr !== "unknown" && curr !== mainCurrency))
);

const currencyOptions = [
  mainCurrency,
  ...preferredCurrencyOptions,
  ...SUPPORTED_CURRENCIES.filter(
    (curr) =>
      curr !== mainCurrency &&
      curr !== "unknown" &&
      !preferredCurrencyOptions.includes(curr)
  ),
];

<div>
  <p className="text-sm text-muted-foreground mb-2">{t("currency")}</p>
  <Select value={currency} onValueChange={setCurrency}>
    <SelectTrigger className="w-full">
      <SelectValue placeholder={mainCurrency} />
    </SelectTrigger>
    <SelectContent>
      {currencyOptions.map((curr) => (
        <SelectItem key={curr} value={curr}>
          {curr}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>
```

- [ ] **Step 5: 扩展 QuickEntryForm props 与父级 wiring，把 `preferredCurrencies` 传下来**

```tsx
interface QuickEntryFormProps {
  ledgerId: string;
  categories: EntryCategory[];
  mainCurrency?: string;
  preferredCurrencies?: string[];
  onSuccess?: () => void;
}

<QuickEntryForm
  ledgerId={ledgerId}
  categories={categories}
  mainCurrency={mainCurrency}
  preferredCurrencies={ledger?.metadata?.settings?.currencies ?? []}
  onSuccess={() => setIsInputOpen(false)}
/>
```

- [ ] **Step 6: 为中英文文案补齐货币标签**

```json
"QuickEntryForm": {
  "currency": "货币",
  "selectCurrency": "选择货币"
}
```

```json
"QuickEntryForm": {
  "currency": "Currency",
  "selectCurrency": "Select currency"
}
```

- [ ] **Step 7: 运行快速记账相关单测，确认全部通过**

Run: `npx vitest run tests/unit/modules/source-document/hooks/useQuickEntryFormController.test.tsx tests/unit/modules/source-document/ui/QuickEntryForm.test.tsx tests/unit/modules/workspace/ui/LedgerPageClient.test.tsx`
Expected: PASS，默认货币、选择器渲染、父级 wiring、optimistic entry 行为全部通过

- [ ] **Step 8: 回归现有服务端 quick-entry 集成测试**

Run: `npx vitest run tests/integration/source-document/quick-entry.test.ts`
Expected: PASS，现有“默认主货币 / 指定货币”服务端 contract 不受 UI 改动影响

- [ ] **Step 9: 校验 i18n catalog**

Run: `npm run validate:i18n`
Expected: PASS，没有缺失 key 或多语言不对齐

- [ ] **Step 10: Commit**

```bash
git add src/modules/source-document/hooks/useQuickEntryFormController.ts \
  src/modules/source-document/ui/QuickEntryForm.tsx \
  src/modules/workspace/ui/LedgerPageClient.tsx \
  messages/zh.json \
  messages/en.json \
  tests/unit/modules/source-document/hooks/useQuickEntryFormController.test.tsx \
  tests/unit/modules/source-document/ui/QuickEntryForm.test.tsx \
  tests/unit/modules/workspace/ui/LedgerPageClient.test.tsx
git commit -m "feat: add currency selection to quick entry"
```

### Task 5: 做一次整体验证，避免两个需求互相打架

**Files:**
- Test: `tests/unit/components/calculator-input.test.tsx`
- Test: `tests/unit/modules/source-document/hooks/useQuickEntryFormController.test.tsx`
- Test: `tests/unit/modules/source-document/ui/QuickEntryForm.test.tsx`
- Test: `tests/unit/modules/workspace/ui/LedgerPageClient.test.tsx`
- Test: `tests/integration/source-document/quick-entry.test.ts`

- [ ] **Step 1: 跑一组聚合回归测试**

Run: `npx vitest run tests/unit/components/calculator-input.test.tsx tests/unit/modules/source-document/hooks/useQuickEntryFormController.test.tsx tests/unit/modules/source-document/ui/QuickEntryForm.test.tsx tests/unit/modules/workspace/ui/LedgerPageClient.test.tsx tests/integration/source-document/quick-entry.test.ts`
Expected: PASS

- [ ] **Step 2: 手工验证桌面端金额输入**

1. 打开“记一笔”弹窗并切到“快速记账”
2. 点击金额
3. 输入 `1300`
4. 预期显示 `13.00`，字号/字形不跳变
5. 再输入 `1454`
6. 预期显示 `14.54`

- [ ] **Step 3: 手工验证货币默认值与切换**

1. 把 ledger 主货币设置成 `MYR`
2. 打开“快速记账”
3. 预期货币选择器默认显示 `MYR`
4. 改成 `USD` 后提交
5. 预期新建 entry 初始就显示 `USD`，并在服务端返回后出现正确折合值

- [ ] **Step 4: Commit（如果手工验证后还补了小修复）**

```bash
git add src/components/ui/calculator-input.tsx \
  src/modules/source-document/hooks/useQuickEntryFormController.ts \
  src/modules/source-document/ui/QuickEntryForm.tsx \
  src/modules/workspace/ui/LedgerPageClient.tsx \
  messages/zh.json \
  messages/en.json \
  tests/unit/components/calculator-input.test.tsx \
  tests/unit/modules/source-document/hooks/useQuickEntryFormController.test.tsx \
  tests/unit/modules/source-document/ui/QuickEntryForm.test.tsx \
  tests/unit/modules/workspace/ui/LedgerPageClient.test.tsx
git commit -m "test: verify quick entry amount and currency regressions"
```
