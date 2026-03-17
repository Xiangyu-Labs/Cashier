# 移除 ignoreVoid 并修复 Floating Promises

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 禁用 `ignoreVoid` 选项，用更安全的错误处理方式替换所有 `void` 操作符。

**Architecture:** 创建一个 `safeAsync` 工具模块提供 `fireAndForget` 函数，统一处理未捕获的异步错误。将所有 `void promise` 改为使用此函数或显式的 `.catch()` 处理。

**Tech Stack:** TypeScript, TanStack Query

---

## 问题分析

当前配置允许使用 `void` 操作符来"标记"故意不等待的 Promise：

```typescript
void queryClient.invalidateQueries();  // 被 ignoreVoid: true 允许
```

但这种方式**隐藏了潜在错误**，如果操作失败，没有任何日志或反馈。

---

## Chunk 1: 创建安全异步工具模块

### Task 1: 创建 safe-async.ts 工具模块

**文件:**
- 创建: `src/lib/safe-async.ts`

**设计思路:**
创建一个统一的错误处理入口，所有 fire-and-forget 操作都通过这里，错误会被记录到控制台和可选的监控服务。

- [ ] **Step 1: 创建 safe-async.ts**

```typescript
/**
 * Safe async utilities for fire-and-forget operations
 *
 * All promises that are intentionally not awaited should use these helpers
 * to ensure errors are logged and not silently swallowed.
 */

import { logger } from "@/lib/logger";

/**
 * Fire-and-forget helper that logs errors but doesn't throw
 *
 * Usage:
 *   fireAndForget(queryClient.invalidateQueries());
 *   fireAndForget(saveToDatabase(data), { context: "saveOrder" });
 */
export function fireAndForget<T>(
  promise: Promise<T>,
  options?: {
    context?: string;
    onError?: (error: unknown) => void;
  }
): void {
  promise.catch((error) => {
    const context = options?.context ? `[${options.context}] ` : "";
    logger.error(`${context}Unhandled async error:`, error);

    // Call custom error handler if provided
    options?.onError?.(error);
  });
}

/**
 * Wraps a function to make it safe for fire-and-forget usage
 *
 * Usage:
 *   const safeInvalidate = makeFireAndForget(queryClient.invalidateQueries.bind(queryClient));
 *   safeInvalidate();
 */
export function makeFireAndForget<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
  options?: {
    context?: string;
    onError?: (error: unknown) => void;
  }
): (...args: T) => void {
  return (...args: T) => {
    fireAndForget(fn(...args), options);
  };
}

/**
 * Use this when you truly don't care about the result (rare!)
 * Still logs at debug level for troubleshooting
 */
export function fireAndForgetSilent<T>(promise: Promise<T>): void {
  promise.catch((error) => {
    logger.debug("Silent async error (ignored):", error);
  });
}
```

- [ ] **Step 2: 验证模块编译**

运行: `npx tsc --noEmit src/lib/safe-async.ts`
预期: 无错误

- [ ] **Step 3: 提交**

```bash
git add src/lib/safe-async.ts
git commit -m "feat: add safe-async utilities for fire-and-forget operations

- Add fireAndForget() helper for safe async error handling
- Add makeFireAndForget() for wrapping existing functions
- Add fireAndForgetSilent() for truly ignorable operations"
```

---

## Chunk 2: 更新 ESLint 配置禁用 ignoreVoid

### Task 2: 禁用 ignoreVoid

**文件:**
- 修改: `eslint.config.mjs`

- [ ] **Step 1: 修改 eslint.config.mjs**

```javascript
"@typescript-eslint/no-floating-promises": [
  "error",
  {
    ignoreVoid: false,    // ❌ 禁用 - 不再允许 void operator
    ignoreIIFE: true,     // ✅ 保留 - IIFE 仍然允许
  },
],
```

- [ ] **Step 2: 验证配置**

运行: `npm run lint`
预期: 显示所有使用 `void` 的错误（约 25 个）

- [ ] **Step 3: 提交配置更新**

```bash
git add eslint.config.mjs
git commit -m "chore(lint): disable ignoreVoid for no-floating-promises

- Require explicit error handling for all promises
- void operator is no longer allowed"
```

---

## Chunk 3: 修复所有 void 调用

### Task 3: 修复 queryClient.invalidateQueries 调用

**文件:**
- `src/features/ledger/client/hooks/use-category-mutations.ts` (4 处)
- `src/features/ledger/client/hooks/use-ledger-settings.ts` (1 处)

**修复方式:** 使用 `fireAndForget` 包装

- [ ] **Step 1: 修复 use-category-mutations.ts**

```typescript
// 导入
import { fireAndForget } from "@/lib/safe-async";

// 修改前:
void queryClient.invalidateQueries({ queryKey: queryKeys.processingTasks(ledgerId) });

// 修改后:
fireAndForget(
  queryClient.invalidateQueries({ queryKey: queryKeys.processingTasks(ledgerId) }),
  { context: "use-category-mutations" }
);
```

- [ ] **Step 2: 修复 use-ledger-settings.ts**

```typescript
import { fireAndForget } from "@/lib/safe-async";

// 修改 1 处 invalidateQueries 调用
fireAndForget(
  qc.invalidateQueries({ queryKey: queryKeys.ledgerSettings(ledgerId) }),
  { context: "use-ledger-settings" }
);
```

- [ ] **Step 3: 验证和提交**

运行: `npm run lint -- 'src/features/ledger/client/hooks/use-category-mutations.ts' 'src/features/ledger/client/hooks/use-ledger-settings.ts'`
预期: 无错误

```bash
git add -A
git commit -m "fix(lint): replace void with fireAndForget in ledger hooks"
```

---

### Task 4: 修复 LedgerPageClient 中的 void 调用

**文件:**
- `src/features/ledger/components/LedgerPageClient/index.tsx` (5 处: 1 prefetch + 4 import)

**修复方式:**
- `prefetchQuery` → 使用 `fireAndForget`
- 动态 `import()` → 使用 `fireAndForget` 或改为 `await`

- [ ] **Step 1: 修复 prefetchQuery**

```typescript
import { fireAndForget } from "@/lib/safe-async";

// 修改前:
void queryClient.prefetchQuery({...});

// 修改后:
fireAndForget(
  queryClient.prefetchQuery({...}),
  { context: "LedgerPageClient.prefetch" }
);
```

- [ ] **Step 2: 修复动态 import**

```typescript
// 修改前:
void import("../DetailsTab");

// 修改后 (推荐 - 预加载不需要错误处理):
fireAndForget(
  import("../DetailsTab"),
  { context: "LedgerPageClient.preload" }
);
```

- [ ] **Step 3: 验证和提交**

```bash
npm run lint -- 'src/features/ledger/components/LedgerPageClient/index.tsx'
git add -A
git commit -m "fix(lint): replace void with fireAndForget in LedgerPageClient"
```

---

### Task 5: 修复 source-document 组件中的 void 调用

**文件:**
- `src/features/source-document/components/SourceDocumentDetailWrapper.tsx` (7 处)
- `src/features/source-document/components/SourceDocumentInput.tsx` (7 处)

- [ ] **Step 1: 修复 SourceDocumentDetailWrapper.tsx (7 处)**

将所有 `void queryClient.invalidateQueries(...)` 改为：
```typescript
fireAndForget(
  queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocument(id) }),
  { context: "SourceDocumentDetailWrapper" }
);
```

- [ ] **Step 2: 修复 SourceDocumentInput.tsx (7 处)**

包括:
- 5 处 `queryClient.invalidateQueries()`
- 2 处 `void processFiles()`

```typescript
// invalidateQueries
fireAndForget(
  queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) }),
  { context: "SourceDocumentInput" }
);

// processFiles
fireAndForget(processFiles(Array.from(files)), { context: "SourceDocumentInput.processFiles" });
```

- [ ] **Step 3: 验证和提交**

```bash
npm run lint -- 'src/features/source-document/components/SourceDocumentDetailWrapper.tsx' 'src/features/source-document/components/SourceDocumentInput.tsx'
git add -A
git commit -m "fix(lint): replace void with fireAndForget in source-document components"
```

---

### Task 6: 修复 sso-button.tsx 中的 signIn 调用

**文件:**
- `src/app/[locale]/login/components/sso-button.tsx` (1 处)

**分析:** `signIn` 是 NextAuth 的函数，如果失败应该有用户反馈。

- [ ] **Step 1: 添加错误处理**

```typescript
// 修改前:
void signIn("oidc", { callbackUrl });

// 修改后:
try {
  await signIn("oidc", { callbackUrl });
} catch (error) {
  logger.error("OIDC sign in failed:", error);
  toast.error(t("ssoError"));
}
```

或者如果保持 fire-and-forget：
```typescript
fireAndForget(
  signIn("oidc", { callbackUrl }),
  {
    context: "sso-button",
    onError: () => toast.error(t("ssoError"))
  }
);
```

- [ ] **Step 2: 验证和提交**

```bash
npm run lint -- 'src/app/[locale]/login/components/sso-button.tsx'
git add -A
git commit -m "fix(lint): add error handling to sso-button signIn"
```

---

## Chunk 4: 最终验证

### Task 7: 完整验证

- [ ] **Step 1: 运行完整 lint 检查**

```bash
npm run lint
```
预期: 0 errors, 0 warnings

- [ ] **Step 2: 运行测试套件**

```bash
npm run test:run
```
预期: 所有测试通过

- [ ] **Step 3: 验证构建**

```bash
npm run build
```
预期: 构建成功

- [ ] **Step 4: 最终提交总结**

```bash
git log --oneline -15
```

---

## 回滚策略

如果新规则导致太多问题，可以临时重新启用 ignoreVoid：

```javascript
"@typescript-eslint/no-floating-promises": [
  "error",
  {
    ignoreVoid: true,  // 临时恢复
    ignoreIIFE: true,
  },
],
```

---

## 变更摘要

| 变更 | 之前 | 之后 |
|------|------|------|
| ignoreVoid | `true` (允许) | `false` (禁止) |
| 处理方式 | `void promise` | `fireAndForget(promise, { context })` |
| 错误处理 | 静默忽略 | 记录到 logger，可选回调 |

**新文件:** `src/lib/safe-async.ts`
**修改文件:** ~6 个文件，约 25 处 `void` 调用
**预计工作量:** 30-60 分钟
