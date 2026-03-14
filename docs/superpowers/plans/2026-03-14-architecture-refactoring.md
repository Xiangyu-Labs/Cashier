# Cashier 架构优化实施计划

> **For agentic workers:** REQUIRED: Use @superpowers:subagent-driven-development (if subagents available) or @superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 通过统一导出、错误处理封装、文件精简等优化，提升 Cashier 项目的代码内聚性和可维护性

**Architecture:** 1) 为每个 feature 添加 index.ts 实现统一导入导出 2) 创建 withAuth 包装器减少重复认证代码 3) 拆分大型 actions 文件 4) 整理 API 类型导入

**Tech Stack:** Next.js 16, TypeScript, Drizzle ORM, next-auth, Zod

---

## Chunk 1: 创建基础工具与类型整理

### Task 1: 创建 withAuth 包装器

**Files:**
- Create: `src/lib/auth-actions.ts`
- Test: `tests/unit/lib/auth-actions.test.ts`

**Context:** 当前有 9 处重复认证检查代码，每次都要写 `const session = await auth(); if (!session?.user?.id) throw new Error(...)`

- [ ] **Step 1: 创建测试文件**

Create: `tests/unit/lib/auth-actions.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { withAuth } from '@/lib/auth-actions';
import { UnauthorizedError } from '@/lib/errors';

// Mock next-auth
vi.mock('@/auth', () => ({
  auth: vi.fn()
}));

import { auth } from '@/auth';

describe('withAuth', () => {
  it('should throw UnauthorizedError when no session', async () => {
    vi.mocked(auth).mockResolvedValue(null);

    const action = withAuth(async (userId) => userId);

    await expect(action()).rejects.toThrow(UnauthorizedError);
  });

  it('should throw UnauthorizedError when no user id', async () => {
    vi.mocked(auth).mockResolvedValue({ user: {} } as any);

    const action = withAuth(async (userId) => userId);

    await expect(action()).rejects.toThrow(UnauthorizedError);
  });

  it('should pass userId to action when authenticated', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'user-123' }
    } as any);

    const action = withAuth(async (userId, arg1: string) => {
      return { userId, arg1 };
    });

    const result = await action('test-arg');

    expect(result).toEqual({ userId: 'user-123', arg1: 'test-arg' });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/unit/lib/auth-actions.test.ts`

Expected: FAIL - "withAuth is not defined"

- [ ] **Step 3: 实现 withAuth 包装器**

Create: `src/lib/auth-actions.ts`

```typescript
import { auth } from '@/auth';
import { UnauthorizedError } from '@/lib/errors';

/**
 * Wraps a server action to automatically handle authentication.
 * Injects userId as the first argument to the action.
 *
 * Usage:
 *   const myAction = withAuth(async (userId, data: MyInputType) => {
 *     // userId is guaranteed to be string
 *     return doSomething(userId, data);
 *   });
 */
export function withAuth<TArgs extends any[], TReturn>(
  action: (userId: string, ...args: TArgs) => Promise<TReturn>
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs) => {
    const session = await auth();

    if (!session?.user?.id) {
      throw new UnauthorizedError('Please log in to perform this action');
    }

    return action(session.user.id, ...args);
  };
}

/**
 * Gets the current authenticated user ID or throws UnauthorizedError.
 * Use this when you need the userId but don't want to wrap the whole action.
 */
export async function requireAuth(): Promise<string> {
  const session = await auth();

  if (!session?.user?.id) {
    throw new UnauthorizedError('Please log in to perform this action');
  }

  return session.user.id;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/unit/lib/auth-actions.test.ts`

Expected: PASS - all tests pass

- [ ] **Step 5: 提交**

```bash
git add src/lib/auth-actions.ts tests/unit/lib/auth-actions.test.ts
git commit -m "feat: add withAuth wrapper and requireAuth helper for authenticated actions"
```

---

### Task 2: 更新错误类添加 UnauthorizedError

**Files:**
- Modify: `src/lib/errors.ts`

- [ ] **Step 1: 检查现有错误类**

Read: `src/lib/errors.ts`

- [ ] **Step 2: 添加 UnauthorizedError（如果不存在）**

如果 UnauthorizedError 不存在，在 `src/lib/errors.ts` 中添加：

```typescript
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized', details?: Record<string, unknown>) {
    super(message, 'UNAUTHORIZED', 401, details);
  }
}
```

- [ ] **Step 3: 运行测试确认通过**

Run: `npx vitest run tests/unit/lib/auth-actions.test.ts`

Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add src/lib/errors.ts
git commit -m "feat: add UnauthorizedError class for 401 errors"
```

---

## Chunk 2: 创建 Feature 统一导出

### Task 3: Ledger Feature 统一导出

**Files:**
- Create: `src/features/ledger/server/index.ts`
- Create: `src/features/ledger/client/index.ts`
- Create: `src/features/ledger/index.ts`

- [ ] **Step 1: 创建 server/index.ts**

Create: `src/features/ledger/server/index.ts`

```typescript
// Server Actions
export {
  createLedgerAction,
  updateLedgerAction,
  deleteLedgerAction,
  getLedgerAction,
  getLedgersAction,
  setDefaultLedgerAction,
  getDefaultLedgerIdAction,
} from './actions/ledgers';

export {
  createEntryAction,
  updateEntryAction,
  deleteEntryAction,
  getLedgerEntriesAction,
  batchDeleteEntriesAction,
  batchUpdateEntriesCategoryAction,
} from './actions/entries';

export {
  getEntryAction,
} from './actions/get-entry';

export {
  getCategoriesAction,
  createCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
  reorderCategoriesAction,
} from './actions/categories';

export {
  categorizeEntriesAction,
} from './actions/categorize';

export {
  getLedgerSettingsAction,
  updateLedgerSettingsAction,
} from './actions/settings';

export {
  getServiceCredentialsAction,
  upsertServiceCredentialAction,
  deleteServiceCredentialAction,
} from './actions/credentials';

export {
  getLedgerStatsAction,
} from './actions/stats';

// Schema
export {
  ledgers,
  entryCategories,
  ledgerEntries,
  serviceCredentials,
  type Ledger,
  type EntryCategory,
  type LedgerEntry,
  type ServiceCredential,
} from './schema';
```

- [ ] **Step 2: 创建 client/index.ts**

Create: `src/features/ledger/client/index.ts`

```typescript
// Hooks
export { useLedgerEntriesMutations } from './hooks/useLedgerEntriesMutations';
export { useEntryMutations } from './hooks/useEntryMutations';
export { useBatchEntryActions } from './hooks/useBatchEntryActions';
export { useCategoryMutations } from './hooks/useCategoryMutations';
export { useCredentialMutations } from './hooks/useCredentialMutations';
export { useLedgerSettings } from './hooks/useLedgerSettings';
export { usePeriodFilter } from './hooks/usePeriodFilter';
export { useSelectionMode } from './hooks/useSelectionMode';
export { useDetailsTabState } from './hooks/useDetailsTabState';
export { useDetailsTabData } from './hooks/useDetailsTabData';
export { useDetailsTabFilters } from './hooks/useDetailsTabFilters';
export { useDetailsTabGrouping } from './hooks/useDetailsTabGrouping';
```

- [ ] **Step 3: 创建根 index.ts**

Create: `src/features/ledger/index.ts`

```typescript
// Public API surface for ledger feature
export * from './server';
export * from './client';
```

- [ ] **Step 4: 验证导出正确**

Run: `npx tsc --noEmit`

Expected: 无错误

- [ ] **Step 5: 提交**

```bash
git add src/features/ledger/
git commit -m "feat(ledger): add index.ts for unified exports"
```

---

### Task 4: Source Document Feature 统一导出

**Files:**
- Create: `src/features/source-document/server/index.ts`
- Create: `src/features/source-document/client/index.ts`
- Create: `src/features/source-document/index.ts`

- [ ] **Step 1: 创建 server/index.ts**

Create: `src/features/source-document/server/index.ts`

```typescript
// Server Actions
export {
  createSourceDocumentAction,
  createSourceDocumentDirectAction,
} from './actions/create';

export {
  updateSourceDocumentAction,
} from './actions/update';

export {
  deleteSourceDocumentAction,
  batchDeleteSourceDocumentsAction,
} from './actions/delete';

export {
  getSourceDocumentAction,
  getSourceDocumentsAction,
} from './actions/queries';

export {
  getSourceDocumentLightAction,
} from './actions/get-document-light';

export {
  retrySourceDocumentAction,
  retrySourceDocumentsAction,
} from './actions/retry';

export {
  batchRetrySourceDocumentsAction,
} from './actions/batch-retry';

export {
  createQuickEntryAction,
} from './actions/quick-entry';

export {
  getProcessingStatusAction,
} from './actions/processing';

// Schema
export {
  sourceDocuments,
  type SourceDocument,
  type SourceDocumentStatus,
  type ProcessingStage,
} from './schema';
```

- [ ] **Step 2: 创建 client/index.ts**

Create: `src/features/source-document/client/index.ts`

```typescript
// Hooks
export { useSourceDocuments } from './hooks/useSourceDocuments';
export { usePendingSourceDocuments } from './hooks/usePendingSourceDocuments';
export { usePendingChanges } from './hooks/usePendingChanges';
export { useSelection } from './hooks/useSelection';
export { useBatchSourceDocumentActions } from './hooks/useBatchSourceDocumentActions';
```

- [ ] **Step 3: 创建根 index.ts**

Create: `src/features/source-document/index.ts`

```typescript
export * from './server';
export * from './client';
```

- [ ] **Step 4: 验证导出正确**

Run: `npx tsc --noEmit`

Expected: 无错误

- [ ] **Step 5: 提交**

```bash
git add src/features/source-document/
git commit -m "feat(source-document): add index.ts for unified exports"
```

---

### Task 5: Auth Feature 统一导出

**Files:**
- Create: `src/features/auth/server/index.ts`
- Create: `src/features/auth/client/index.ts`
- Create: `src/features/auth/index.ts`

- [ ] **Step 1: 创建 server/index.ts**

Create: `src/features/auth/server/index.ts`

```typescript
// Server Actions
export {
  signInAction,
  verifyOtpAction,
} from './actions/auth';

export {
  signOutAction,
} from './actions/sign-out';

export {
  deleteAccountAction,
  updateUserSettingsAction,
} from './actions/account';

// Services
export {
  sendOTP,
  generateOTP,
} from './services/otp';

export {
  verifyOTP,
} from './services/otp-verification';

export {
  createUser,
  setUserDefaultLedger,
  getUserDefaultLedgerId,
} from './services/user-setup';

// Schema
export {
  users,
  accounts,
  otps,
  type User,
  type Account,
  type OTP,
} from './schema';
```

- [ ] **Step 2: 创建 client/index.ts**

Create: `src/features/auth/client/index.ts`

```typescript
// Currently no client-specific exports
// Add hooks here as needed
```

- [ ] **Step 3: 创建根 index.ts**

Create: `src/features/auth/index.ts`

```typescript
export * from './server';
```

- [ ] **Step 4: 验证导出正确**

Run: `npx tsc --noEmit`

Expected: 无错误

- [ ] **Step 5: 提交**

```bash
git add src/features/auth/
git commit -m "feat(auth): add index.ts for unified exports"
```

---

### Task 6: Task Queue Feature 统一导出

**Files:**
- Create: `src/features/task-queue/server/index.ts`
- Create: `src/features/task-queue/client/index.ts`
- Create: `src/features/task-queue/index.ts`

- [ ] **Step 1: 创建 server/index.ts**

Create: `src/features/task-queue/server/index.ts`

```typescript
// Server Actions
export {
  getTaskQueueAction,
} from './actions/task-queue';

export {
  cancelTaskAction,
} from './actions/cancel-task';

export {
  dismissTaskAction,
} from './actions/dismiss-task';

// Schema
export {
  taskRuns,
  type TaskRun,
  type TaskStatus,
} from './schema';
```

- [ ] **Step 2: 创建 client/index.ts**

Create: `src/features/task-queue/client/index.ts`

```typescript
// Hooks
export { useTaskQueue } from './hooks/useTaskQueue';
export { useTaskQueueMutations } from './hooks/useTaskQueueMutations';
export { useTaskQueueModal } from './hooks/useTaskQueueModal';
```

- [ ] **Step 3: 创建根 index.ts**

Create: `src/features/task-queue/index.ts`

```typescript
export * from './server';
export * from './client';
```

- [ ] **Step 4: 验证导出正确**

Run: `npx tsc --noEmit`

Expected: 无错误

- [ ] **Step 5: 提交**

```bash
git add src/features/task-queue/
git commit -m "feat(task-queue): add index.ts for unified exports"
```

---

### Task 7: Calendar, Currency, Stats Features 统一导出

**Files:**
- Create: `src/features/calendar/server/index.ts`
- Create: `src/features/calendar/client/index.ts`
- Create: `src/features/calendar/index.ts`
- Create: `src/features/currency/server/index.ts`
- Create: `src/features/currency/client/index.ts`
- Create: `src/features/currency/index.ts`
- Create: `src/features/stats/server/index.ts`
- Create: `src/features/stats/index.ts`

- [ ] **Step 1: 创建 calendar exports**

Create: `src/features/calendar/server/index.ts`

```typescript
export {
  getHeatmapDataAction,
  getHeatmapForRangeAction,
  getDayDetailAction,
} from './actions/heatmap';
```

Create: `src/features/calendar/client/index.ts`

```typescript
export { useCalendarData } from './hooks/useCalendarData';
```

Create: `src/features/calendar/index.ts`

```typescript
export * from './server';
export * from './client';
```

- [ ] **Step 2: 创建 currency exports**

Create: `src/features/currency/server/index.ts`

```typescript
export {
  convertCurrencyAction,
  batchConvertCurrencyAction,
} from './actions';

export {
  ExchangeRateService,
} from './exchange-rate-service';

export {
  exchangeRates,
  type ExchangeRate,
} from './schema';
```

Create: `src/features/currency/client/index.ts`

```typescript
export { useConvertedAmount } from './hooks/useConvertedAmount';
export { useBatchConvertedAmounts } from './hooks/useBatchConvertedAmounts';
```

Create: `src/features/currency/index.ts`

```typescript
export * from './server';
export * from './client';
```

- [ ] **Step 3: 创建 stats exports**

Create: `src/features/stats/server/index.ts`

```typescript
export {
  getStatsAction,
  getTokenStatsAction,
  getEnhancedStatsAction,
} from './actions';
```

Create: `src/features/stats/index.ts`

```typescript
export * from './server';
```

- [ ] **Step 4: 验证导出正确**

Run: `npx tsc --noEmit`

Expected: 无错误

- [ ] **Step 5: 提交**

```bash
git add src/features/calendar/ src/features/currency/ src/features/stats/
git commit -m "feat(calendar,currency,stats): add index.ts for unified exports"
```

---

## Chunk 3: 应用 withAuth 重构现有 Actions

### Task 8: 重构 ledgers.ts 使用 withAuth

**Files:**
- Modify: `src/features/ledger/server/actions/ledgers.ts`

- [ ] **Step 1: 备份原文件**

```bash
cp src/features/ledger/server/actions/ledgers.ts src/features/ledger/server/actions/ledgers.ts.bak
```

- [ ] **Step 2: 修改导入和函数签名**

修改 `src/features/ledger/server/actions/ledgers.ts`：

```typescript
"use server";

import { db } from "@/lib/db";
import { ledgers, entryCategories, ledgerEntries, serviceCredentials, users } from "@/lib/db/schema";
import { defaultLedger } from "@/config/default-ledger";
import { withAuth, requireAuth } from "@/lib/auth-actions";  // Add this
import { z } from "zod";
import { eq, and, isNull, desc, sql, inArray } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { ExchangeRateService } from "@/features/currency/server/exchange-rate-service";
import { taskVersionManager } from "@/lib/task-version";
import { unstable_cache } from "next/cache";

const createLedgerSchema = z.object({
    name: z.string().min(1, "Name is required"),
    aiLanguage: z.string().optional(),
});

const updateLedgerSchema = z.object({
    name: z.string().optional(),
    settings: z.object({
        aiLanguage: z.string().optional(),
        currencies: z.array(z.string()).optional(),
        mainCurrency: z.string().optional(),
        collapseEntriesDefault: z.boolean().optional(),
        aiCustomPrompt: z.string().optional(),
        showMonthlyExpense: z.boolean().optional(),
        monthStartDay: z.number().min(1).max(31).optional(),
    }).optional(),
});

// Use withAuth to wrap authenticated actions
export const createLedgerAction = withAuth(async (userId, data: z.infer<typeof createLedgerSchema>) => {
    const validated = createLedgerSchema.parse(data);
    let newLedger: typeof ledgers.$inferSelect;

    db.transaction((tx) => {
        [newLedger] = tx
            .insert(ledgers)
            .values({
                userId: userId,  // Use injected userId
                name: validated.name,
                metadata: {
                    settings: {
                        aiLanguage: validated.aiLanguage || defaultLedger.settings.aiLanguage,
                        currencies: defaultLedger.settings.currencies,
                        mainCurrency: defaultLedger.settings.mainCurrency,
                        collapseEntriesDefault: defaultLedger.settings.collapseEntriesDefault,
                        aiCustomPrompt: defaultLedger.settings.aiCustomPrompt,
                    }
                }
            })
            .returning()
            .all();

        if (defaultLedger.categories.length > 0) {
            tx.insert(entryCategories).values(
                defaultLedger.categories.map((cat) => ({
                    ...cat,
                    ledgerId: newLedger.id,
                }))
            ).run();
        }
    });

    return newLedger!;
});

// ... continue refactoring other functions
```

- [ ] **Step 3: 运行测试确认通过**

Run: `npm run test:run`

Expected: All tests pass

- [ ] **Step 4: 提交**

```bash
git add src/features/ledger/server/actions/ledgers.ts
git rm src/features/ledger/server/actions/ledgers.ts.bak
git commit -m "refactor(ledger): use withAuth wrapper in ledgers.ts"
```

---

### Task 9: 重构剩余 Actions 使用 withAuth

**Files:**
- Modify: `src/features/ledger/server/actions/entries.ts`
- Modify: `src/features/auth/server/actions/account.ts`

- [ ] **Step 1: 重构 entries.ts**

将 `src/features/ledger/server/actions/entries.ts` 中的认证检查替换为 `withAuth`。

- [ ] **Step 2: 重构 account.ts**

将 `src/features/auth/server/actions/account.ts` 中的认证检查替换为 `withAuth`。

- [ ] **Step 3: 运行测试确认通过**

Run: `npm run test:run`

Expected: All tests pass

- [ ] **Step 4: 提交**

```bash
git add src/features/ledger/server/actions/entries.ts src/features/auth/server/actions/account.ts
git commit -m "refactor: apply withAuth wrapper to remaining actions"
```

---

## Chunk 4: Actions 文件精简

### Task 10: 拆分 ledgers.ts 为独立文件

**Files:**
- Create: `src/features/ledger/server/actions/create.ts`
- Create: `src/features/ledger/server/actions/update.ts`
- Create: `src/features/ledger/server/actions/delete.ts`
- Create: `src/features/ledger/server/actions/get.ts`
- Modify: `src/features/ledger/server/actions/ledgers.ts` (最终删除或简化为 re-export)
- Modify: `src/features/ledger/server/index.ts`

- [ ] **Step 1: 创建 create.ts**

Create: `src/features/ledger/server/actions/create.ts`

```typescript
"use server";

import { db } from "@/lib/db";
import { ledgers, entryCategories } from "@/lib/db/schema";
import { defaultLedger } from "@/config/default-ledger";
import { withAuth } from "@/lib/auth-actions";
import { z } from "zod";

const createLedgerSchema = z.object({
    name: z.string().min(1, "Name is required"),
    aiLanguage: z.string().optional(),
});

export const createLedgerAction = withAuth(async (userId, data: z.infer<typeof createLedgerSchema>) => {
    const validated = createLedgerSchema.parse(data);
    let newLedger: typeof ledgers.$inferSelect;

    db.transaction((tx) => {
        [newLedger] = tx
            .insert(ledgers)
            .values({
                userId,
                name: validated.name,
                metadata: {
                    settings: {
                        aiLanguage: validated.aiLanguage || defaultLedger.settings.aiLanguage,
                        currencies: defaultLedger.settings.currencies,
                        mainCurrency: defaultLedger.settings.mainCurrency,
                        collapseEntriesDefault: defaultLedger.settings.collapseEntriesDefault,
                        aiCustomPrompt: defaultLedger.settings.aiCustomPrompt,
                    }
                }
            })
            .returning()
            .all();

        if (defaultLedger.categories.length > 0) {
            tx.insert(entryCategories).values(
                defaultLedger.categories.map((cat) => ({
                    ...cat,
                    ledgerId: newLedger.id,
                }))
            ).run();
        }
    });

    return newLedger!;
});
```

- [ ] **Step 2: 创建 update.ts**

将 `updateLedgerAction` 和相关的辅助函数移动到 `src/features/ledger/server/actions/update.ts`

- [ ] **Step 3: 创建 delete.ts**

将 `deleteLedgerAction` 移动到 `src/features/ledger/server/actions/delete.ts`

- [ ] **Step 4: 创建 get.ts**

将 `getLedgerAction`, `getLedgersAction`, `getDefaultLedgerIdAction`, `setDefaultLedgerAction` 移动到 `src/features/ledger/server/actions/get.ts`

- [ ] **Step 5: 简化 ledgers.ts 为 re-export**

修改 `src/features/ledger/server/actions/ledgers.ts`：

```typescript
// Re-exports for backward compatibility
// Prefer importing from specific files: @/features/ledger/server/actions/create

export { createLedgerAction } from './create';
export { updateLedgerAction } from './update';
export { deleteLedgerAction } from './delete';
export {
  getLedgerAction,
  getLedgersAction,
  getDefaultLedgerIdAction,
  setDefaultLedgerAction
} from './get';
```

- [ ] **Step 6: 更新 index.ts 导出**

修改 `src/features/ledger/server/index.ts`，添加新文件的导出：

```typescript
// Server Actions - specific files
export * from './actions/create';
export * from './actions/update';
export * from './actions/delete';
export * from './actions/get';

// Legacy re-exports (backward compatibility)
export * from './actions/ledgers';
// ... rest of exports
```

- [ ] **Step 7: 运行测试确认通过**

Run: `npm run test:run`

Expected: All tests pass

- [ ] **Step 8: 提交**

```bash
git add src/features/ledger/server/actions/
git commit -m "refactor(ledger): split ledgers.ts into focused action files"
```

---

## Chunk 5: 最终验证与清理

### Task 11: 运行完整测试套件

**Files:** N/A (verification only)

- [ ] **Step 1: 运行所有测试**

Run: `npm run test:run`

Expected: All tests pass

- [ ] **Step 2: 运行类型检查**

Run: `npx tsc --noEmit`

Expected: No type errors

- [ ] **Step 3: 运行 lint**

Run: `npm run lint`

Expected: No lint errors

- [ ] **Step 4: 运行构建**

Run: `npm run build`

Expected: Build succeeds

- [ ] **Step 5: 提交**

```bash
git commit -m "chore: verify all architecture refactoring passes tests and build"
```

---

## Summary

完成以上所有任务后，项目将具备：

1. **统一的导入导出** - 每个 feature 都有清晰的 public API
2. **减少样板代码** - `withAuth` 包装器消除重复认证检查
3. **更小的文件** - Actions 按职责拆分，更易维护
4. **完整的测试覆盖** - 新增工具函数有单元测试

**总任务数:** 11
**预计工作量:** 12-18 小时
**风险等级:** 低（大部分是非破坏性重构）
