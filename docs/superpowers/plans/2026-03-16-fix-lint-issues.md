# 修复 Lint 问题实施计划

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复项目中的所有 ESLint 错误和警告（2个错误，11个警告）

**Architecture:** 通过修改源代码中的未使用变量、错误的变量声明和 React Hook 依赖问题来解决 lint 问题

**Tech Stack:** TypeScript, ESLint, React, Next.js

---

## 问题总览

运行 `npm run lint` 发现的 13 个问题：

| 文件 | 行号 | 类型 | 问题描述 |
|------|------|------|----------|
| `src/hooks/use-smart-polling.ts` | 37 | error | React Compiler memoization 问题 - 依赖数组不匹配 |
| `src/hooks/use-smart-polling.ts` | 51 | warning | React Hook useCallback 缺少依赖 'options' |
| `src/lib/storage/local.ts` | 125 | error | 'key' 应该用 const 而不是 let |
| `src/features/auth/server/services/user-setup.ts` | 10 | warning | 'userEmail' 定义但未使用 |
| `src/features/ledger/components/LedgerPageClient/Header.tsx` | 27 | warning | 'ledger' 定义但未使用 |
| `src/features/ledger/components/SettingsTab.tsx` | 33 | warning | 'allLedgers' 赋值但未使用 |
| `tests/integration/cascade-operations.test.ts` | 12 | warning | 'users' 定义但未使用 |
| `tests/integration/cascade-operations.test.ts` | 21 | warning | 'getLedgersAction' 定义但未使用 |
| `tests/integration/cascade-operations.test.ts` | 24 | warning | 'testUserId' 赋值但未使用 |
| `tests/integration/ledger-create-limit.test.ts` | 5 | warning | 'eq' 定义但未使用 |
| `tests/integration/ledger-export.test.ts` | 6 | warning | 'uuidv4' 定义但未使用 |
| `tests/integration/ledger-export.test.ts` | 231 | warning | 'fields' 赋值但未使用 |
| `tests/integration/ledger/stats-actions.test.ts` | 7 | warning | 'currencyRates' 定义但未使用 |

---

## Chunk 1: 修复 use-smart-polling.ts 中的 React Compiler 问题

### Task 1: 修复 useSmartPolling Hook

**Files:**
- Modify: `src/hooks/use-smart-polling.ts:37-51`

**问题分析:**
React Compiler 检测到 `useCallback` 的依赖数组 `[options.dataKey]` 与推断的依赖 `options` 不匹配。由于 `checkDataChanged` 函数内部使用了 `options.dataKey`，但依赖数组只包含 `options.dataKey` 而不是 `options`，导致 React Compiler 无法正确优化。

**解决方案:**
将 `dataKey` 从 `options` 中解构出来，避免在 `useCallback` 内部访问 `options.dataKey`。

- [ ] **Step 1: 修改 useSmartPolling 函数**

```typescript
// 在解构时添加 dataKey
const { isActive, interval = 5000, cooldownInterval = 10000, idleInterval, ledgerId, dataKey, ...queryOptions } = options;
```

- [ ] **Step 2: 更新 useCallback 使用解构后的 dataKey**

```typescript
const checkDataChanged = useCallback((data: TData | undefined) => {
    const dataStr = dataKey
        ? dataKey(data)
        : JSON.stringify(data);
    // ... 其余代码不变
}, [dataKey]);
```

- [ ] **Step 3: 运行 lint 验证修复**

Run: `npm run lint -- src/hooks/use-smart-polling.ts`
Expected: 该文件不再有错误和警告

- [ ] **Step 4: Commit**

```bash
git add src/hooks/use-smart-polling.ts
git commit -m "fix(lint): resolve React Compiler memoization warning in useSmartPolling

- Destructure dataKey from options to fix dependency mismatch
- Ensures useCallback has correct and stable dependencies"
```

---

## Chunk 2: 修复 local.ts 中的 const 错误

### Task 2: 修复 LocalStorageProvider

**Files:**
- Modify: `src/lib/storage/local.ts:125`

- [ ] **Step 1: 修改 extractKeyFromUrl 方法中的变量声明**

将第 125 行从：
```typescript
let key = urlWithoutQuery.slice(prefix.length);
```
改为：
```typescript
const key = urlWithoutQuery.slice(prefix.length);
```

- [ ] **Step 2: 运行 lint 验证修复**

Run: `npm run lint -- src/lib/storage/local.ts`
Expected: 该文件不再有错误

- [ ] **Step 3: Commit**

```bash
git add src/lib/storage/local.ts
git commit -m "fix(lint): use const instead of let for immutable key variable"
```

---

## Chunk 3: 修复未使用变量警告 - 源文件

### Task 3: 修复 user-setup.ts

**Files:**
- Modify: `src/features/auth/server/services/user-setup.ts:10`

- [ ] **Step 1: 重命名未使用的参数**

将函数参数从 `userEmail` 改为 `_userEmail`：
```typescript
export async function createDefaultLedgerForUser(
    userId: string,
    _userEmail: string
): Promise<string> {
```

- [ ] **Step 2: 运行 lint 验证**

Run: `npm run lint -- src/features/auth/server/services/user-setup.ts`
Expected: 该文件不再有警告

- [ ] **Step 3: Commit**

```bash
git add src/features/auth/server/services/user-setup.ts
git commit -m "style(lint): prefix unused parameter with underscore"
```

### Task 4: 修复 Header.tsx

**Files:**
- Modify: `src/features/ledger/components/LedgerPageClient/Header.tsx:27`

- [ ] **Step 1: 重命名未使用的参数**

将函数参数从 `ledger` 改为 `_ledger`：
```typescript
export function Header({ _ledger, pendingStats, onOpenTaskQueue, onOpenInput }: HeaderProps) {
```

- [ ] **Step 2: 运行 lint 验证**

Run: `npm run lint -- src/features/ledger/components/LedgerPageClient/Header.tsx`
Expected: 该文件不再有警告

- [ ] **Step 3: Commit**

```bash
git add src/features/ledger/components/LedgerPageClient/Header.tsx
git commit -m "style(lint): prefix unused ledger prop with underscore"
```

### Task 5: 修复 SettingsTab.tsx

**Files:**
- Modify: `src/features/ledger/components/SettingsTab.tsx:33`

- [ ] **Step 1: 重命名未使用的参数**

将函数参数从 `allLedgers` 改为 `_allLedgers`：
```typescript
export function SettingsTab({ ledger, initialCategories, ledgerId, _allLedgers = [] }: SettingsTabProps) {
```

- [ ] **Step 2: 运行 lint 验证**

Run: `npm run lint -- src/features/ledger/components/SettingsTab.tsx`
Expected: 该文件不再有警告

- [ ] **Step 3: Commit**

```bash
git add src/features/ledger/components/SettingsTab.tsx
git commit -m "style(lint): prefix unused allLedgers prop with underscore"
```

---

## Chunk 4: 修复测试文件中的未使用变量

### Task 6: 修复 cascade-operations.test.ts

**Files:**
- Modify: `tests/integration/cascade-operations.test.ts`

- [ ] **Step 1: 移除未使用的导入 `users`**

第 12 行，从导入列表中移除 `users`：
```typescript
import { ledgers, ledgerEntries, entryCategories, sourceDocuments } from "@/lib/db/schema";
```

- [ ] **Step 2: 移除未使用的导入 `getLedgersAction`**

第 21 行，删除整行：
```typescript
// 删除: import { getLedgersAction } from "@/features/ledger/server/actions/get";
```

- [ ] **Step 3: 移除未使用的常量 `testUserId`**

第 24 行，删除整行：
```typescript
// 删除: const testUserId = TEST_USER_ID;
```
然后查找并替换文件中所有使用 `testUserId` 的地方为 `TEST_USER_ID`（如果存在）。

- [ ] **Step 4: 运行 lint 验证**

Run: `npm run lint -- tests/integration/cascade-operations.test.ts`
Expected: 该文件不再有警告

- [ ] **Step 5: Commit**

```bash
git add tests/integration/cascade-operations.test.ts
git commit -m "style(lint): remove unused imports and variables in cascade-operations test"
```

### Task 7: 修复 ledger-create-limit.test.ts

**Files:**
- Modify: `tests/integration/ledger-create-limit.test.ts`

- [ ] **Step 1: 移除未使用的导入 `eq`**

第 5 行，删除整行：
```typescript
// 删除: import { eq } from "drizzle-orm";
```

- [ ] **Step 2: 运行 lint 验证**

Run: `npm run lint -- tests/integration/ledger-create-limit.test.ts`
Expected: 该文件不再有警告

- [ ] **Step 3: Commit**

```bash
git add tests/integration/ledger-create-limit.test.ts
git commit -m "style(lint): remove unused eq import in ledger-create-limit test"
```

### Task 8: 修复 ledger-export.test.ts

**Files:**
- Modify: `tests/integration/ledger-export.test.ts`

- [ ] **Step 1: 移除未使用的导入 `uuidv4`**

第 6 行，删除整行：
```typescript
// 删除: import { v4 as uuidv4 } from "uuid";
```

- [ ] **Step 2: 移除未使用的变量 `fields`**

第 231 行，找到以下代码并删除 `fields` 变量的声明：
```typescript
// 修改前:
const fields = dataRow.split(",");
// Category should be empty (not "null")
expect(dataRow).not.toContain("null");

// 修改后 (如果 fields 真的不需要):
// Category should be empty (not "null")
expect(dataRow).not.toContain("null");
```

注意：检查第 232 行是否使用了 `fields`，如果使用了则不能删除，需要使用下划线前缀。

- [ ] **Step 3: 运行 lint 验证**

Run: `npm run lint -- tests/integration/ledger-export.test.ts`
Expected: 该文件不再有警告

- [ ] **Step 4: Commit**

```bash
git add tests/integration/ledger-export.test.ts
git commit -m "style(lint): remove unused uuidv4 import and fields variable in ledger-export test"
```

### Task 9: 修复 stats-actions.test.ts

**Files:**
- Modify: `tests/integration/ledger/stats-actions.test.ts`

- [ ] **Step 1: 移除未使用的导入 `currencyRates`**

第 7 行，从导入列表中移除 `currencyRates`：
```typescript
import {
    ledgers,
    ledgerEntries,
    entryCategories,
    users,
} from "@/lib/db/schema";
```

- [ ] **Step 2: 运行 lint 验证**

Run: `npm run lint -- tests/integration/ledger/stats-actions.test.ts`
Expected: 该文件不再有警告

- [ ] **Step 3: Commit**

```bash
git add tests/integration/ledger/stats-actions.test.ts
git commit -m "style(lint): remove unused currencyRates import in stats-actions test"
```

---

## Chunk 5: 最终验证

### Task 10: 验证所有 Lint 问题已修复

- [ ] **Step 1: 运行完整 lint 检查**

Run: `npm run lint`
Expected:
```
> cashier@0.1.0 lint
> eslint

✨ No issues found!
```

- [ ] **Step 2: 运行测试确保没有破坏功能**

Run: `npm run test:run`
Expected: 所有测试通过

- [ ] **Step 3: 创建最终提交（如果需要）**

如果用户要求，可以创建一个汇总提交：
```bash
git log --oneline -10  # 查看所有修复提交
git commit --allow-empty -m "fix(lint): resolve all ESLint errors and warnings

Summary of fixes:
- Fixed React Compiler memoization warning in useSmartPolling
- Fixed prefer-const error in LocalStorageProvider
- Prefixed unused parameters with underscore in 3 source files
- Removed unused imports and variables in 4 test files

Total: 2 errors and 11 warnings resolved"
```

---

## 快速修复参考

如果希望快速修复所有问题（不遵循 TDD），可以按以下顺序执行：

```bash
# 1. 修复 use-smart-polling.ts
cat > /tmp/fix-polling.patch << 'PATCH'
--- a/src/hooks/use-smart-polling.ts
+++ b/src/hooks/use-smart-polling.ts
@@ -26,7 +26,7 @@ export function useSmartPolling<TData = unknown, TError = unknown>(
     options: SmartPollingOptions<TData, TError>
 ) {
-    const { isActive, interval = 5000, cooldownInterval = 10000, idleInterval, ledgerId, ...queryOptions } = options;
+    const { isActive, interval = 5000, cooldownInterval = 10000, idleInterval, ledgerId, dataKey, ...queryOptions } = options;

     const hasActiveLedgerMutation = useMutationStore((state) => state.hasActiveLedgerMutation);

@@ -37,8 +37,8 @@ export function useSmartPolling<TData = unknown, TError = unknown>(
     const checkDataChanged = useCallback((data: TData | undefined) => {
-        const dataStr = options.dataKey
-            ? options.dataKey(data)
+        const dataStr = dataKey
+            ? dataKey(data)
             : JSON.stringify(data);
         const changed = dataStr !== lastDataRef.current;
         lastDataRef.current = dataStr;
PATCH

# 2. 修复 local.ts
sed -i 's/let key = urlWithoutQuery.slice(prefix.length);/const key = urlWithoutQuery.slice(prefix.length);/' src/lib/storage/local.ts

# 3. 修复未使用变量 (使用 _ 前缀)
sed -i 's/userEmail: string/_userEmail: string/' src/features/auth/server/services/user-setup.ts
sed -i 's/{ ledger,/{ _ledger,/' src/features/ledger/components/LedgerPageClient/Header.tsx
sed -i 's/allLedgers = \[\]/_allLedgers = []/' src/features/ledger/components/SettingsTab.tsx

# 4. 修复测试文件
sed -i 's/, users/, sourceDocuments/' tests/integration/cascade-operations.test.ts
# ... (其他 sed 命令)
```

---

## 注意事项

1. **user-setup.ts**: 参数 `userEmail` 虽然目前未使用，但保留在函数签名中可能是为了未来的扩展或 API 一致性。使用 `_userEmail` 前缀可以消除警告同时保留参数。

2. **Header.tsx**: `ledger` 属性虽然当前未使用，但可能在未来的 UI 增强中使用（例如在头部显示账本名称）。保留属性但添加下划线前缀是安全的做法。

3. **SettingsTab.tsx**: `allLedgers` 可能在未来的功能中使用（例如账本切换器），所以保留但标记为未使用。

4. **测试文件**: 删除未使用的导入和变量不会影响测试功能，因为这些变量确实没有被使用。

5. **React Compiler 警告**: 这是一个真实的潜在 bug - 如果 `options` 对象引用改变但 `options.dataKey` 不变，可能会导致错误的缓存行为。修复后的代码更健壮。
