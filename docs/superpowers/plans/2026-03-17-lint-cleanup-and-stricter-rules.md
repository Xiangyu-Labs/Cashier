# ESLint 修复与规则收紧实施计划

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复现有 ESLint 错误和警告，并适度收紧 lint 规则以提升代码质量。

**Architecture:** 采用渐进式改进：先修复现有问题确保零错误，再添加新规则并修复引入的新警告。

**Tech Stack:** ESLint 9 + Next.js TypeScript 配置

---

## 现有问题分析

### ESLint Errors (2个)
1. `src/components/providers.tsx:54` - `react-hooks/set-state-in-effect`
   - 在 useEffect 中直接调用 setIsClient(true)
2. `tests/setup.ts:170` - `@typescript-eslint/no-require-imports`
   - 使用了 `require("../messages/zh.json")`

### ESLint Warnings (5个)
1. `src/features/ledger/server/actions/delete.ts:6` - 未使用的 `inArray` import
2. `src/features/source-document/client/hooks/use-batch-source-document-actions.ts:12` - 未使用的 `SourceDocumentWithEntries` import
3. `tests/integration/processing-tasks.test.ts:3` - 未使用的 `users` import
4. `tests/unit/features/ledger/server/actions/delete.test.ts:3` - 未使用的 `ledgerEntries`, `sourceDocuments` imports

---

## Chunk 1: 修复现有 ESLint Errors

### Task 1: 修复 providers.tsx 的 set-state-in-effect 错误

**文件:**
- 修改: `src/components/providers.tsx:50-58`

**背景:**
当前代码使用 `useEffect` + `setState` 模式来避免 hydration mismatch。ESLint 19 新增规则 `react-hooks/set-state-in-effect` 禁止在 effect 中直接调用 setState，因为这会导致级联渲染。

推荐的替代方案是使用 `useSyncExternalStore` 或 `useState(() => ...)` 延迟初始化模式。

- [ ] **Step 1: 将 useEffect 模式改为 useSyncExternalStore**

```typescript
// 删除这行：
const [isClient, setIsClient] = useState(false);

// 删除整个 useEffect:
useEffect(() => {
  setIsClient(true);
}, []);

// 替换为 useSyncExternalStore:
const isClient = useSyncExternalStore(
  () => () => {}, // 不需要订阅，因为这是静态的
  () => true,     // client 端返回 true
  () => false     // server 端返回 false
);
```

- [ ] **Step 2: 验证修复**

运行: `npm run lint -- src/components/providers.tsx`
预期: 没有错误输出

- [ ] **Step 3: 提交**

```bash
git add src/components/providers.tsx
git commit -m "fix(lint): use useSyncExternalStore instead of setState in effect

Fixes react-hooks/set-state-in-effect error"
```

---

### Task 2: 修复 tests/setup.ts 的 require 导入

**文件:**
- 修改: `tests/setup.ts:165-175`

**背景:**
当前在 i18n mock 中使用 `require("../messages/zh.json")` 同步加载翻译文件。ESLint 禁止 require 风格导入。

解决方案：改用动态 import 或 ES module import。

- [ ] **Step 1: 将 require 改为动态 import**

```typescript
// 找到 i18n mock 代码，大约在第 127 行:
vi.mock("next-intl", async () => {
  const actual = await vi.importActual("react");
  const React = actual as typeof import("react");

  // 删除这行:
  // const messages = require("../messages/zh.json");

  // 改为动态导入:
  const messages = await import("../messages/zh.json").then(m => m.default || m);

  return {
    // ... rest of mock
  };
});
```

- [ ] **Step 2: 验证修复**

运行: `npm run lint -- tests/setup.ts`
预期: 没有错误输出

- [ ] **Step 3: 提交**

```bash
git add tests/setup.ts
git commit -m "fix(lint): replace require with dynamic import in test setup

Fixes @typescript-eslint/no-require-imports error"
```

---

## Chunk 2: 修复现有 ESLint Warnings (未使用变量)

### Task 3: 删除未使用的 imports

**文件:**
- 修改: `src/features/ledger/server/actions/delete.ts:6`
- 修改: `src/features/source-document/client/hooks/use-batch-source-document-actions.ts:12`
- 修改: `tests/integration/processing-tasks.test.ts:3`
- 修改: `tests/unit/features/ledger/server/actions/delete.test.ts:3`

- [ ] **Step 1: 修复 delete.ts**

```typescript
// 从:
import { eq, and, isNull, inArray } from "drizzle-orm";
// 改为:
import { eq, and, isNull } from "drizzle-orm";
```

- [ ] **Step 2: 修复 use-batch-source-document-actions.ts**

```typescript
// 删除第 12 行:
// import type { SourceDocumentWithEntries } from "./use-source-documents";
```

- [ ] **Step 3: 修复 processing-tasks.test.ts**

```typescript
// 从:
import { ledgers, taskRuns, users } from "@/lib/db/schema";
// 改为:
import { ledgers, taskRuns } from "@/lib/db/schema";
```

- [ ] **Step 4: 修复 delete.test.ts**

```typescript
// 从:
import { users, ledgers, ledgerEntries, entryCategories, sourceDocuments } from "@/lib/db/schema";
// 改为:
import { users, ledgers, entryCategories } from "@/lib/db/schema";
```

- [ ] **Step 5: 批量验证修复**

运行: `npm run lint`
预期: 只剩 warnings（5个未使用变量已修复）

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "fix(lint): remove unused imports across codebase

Fixes @typescript-eslint/no-unused-vars warnings"
```

---

## Chunk 3: 收紧 ESLint 规则 (阶段二)

### Task 4: 更新 ESLint 配置

**文件:**
- 修改: `eslint.config.mjs`

- [ ] **Step 1: 添加新规则配置**

```javascript
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
  ]),
  {
    rules: {
      // 从 warn 改为 error - 未使用变量
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_"
        }
      ],
      // 已是 error，保持不变
      "@typescript-eslint/no-explicit-any": "error",
      // 新增：强制使用 import type
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
          fixStyle: "inline-type-imports"
        }
      ],
      // 新增：检查 useEffect 依赖 (降级为 warn 因为可能存在误报)
      "react-hooks/exhaustive-deps": "warn"
    }
  }
]);

export default eslintConfig;
```

- [ ] **Step 2: 查看新规则引入的问题**

运行: `npm run lint 2>&1 | head -100`
预期: 会显示大量 `@typescript-eslint/consistent-type-imports` 错误

- [ ] **Step 3: 提交配置更新**

```bash
git add eslint.config.mjs
git commit -m "chore(lint): tighten ESLint rules

- Change no-unused-vars from warn to error
- Add consistent-type-imports rule
- Add react-hooks/exhaustive-deps rule"
```

---

### Task 5: 批量修复 consistent-type-imports

**背景:**
新规则 `consistent-type-imports` 要求所有类型导入使用 `import type` 语法。

**策略:**
使用 ESLint 的 `--fix` 自动修复大部分问题，然后手动修复剩余问题。

- [ ] **Step 1: 运行自动修复**

```bash
npm run lint -- --fix
```

- [ ] **Step 2: 检查剩余问题**

运行: `npm run lint 2>&1 | grep -E "(error|warning)" | head -50`
预期: 查看是否还有未修复的类型导入问题

- [ ] **Step 3: 验证测试通过**

```bash
npm run test:run
```
预期: 所有测试通过

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "style(lint): enforce type imports with consistent-type-imports rule

Auto-fix applied via ESLint --fix"
```

---

## Chunk 4: 最终验证

### Task 6: 完整验证

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

- [ ] **Step 4: 最终提交**

```bash
git log --oneline -10
```
预期: 看到以下提交历史：
- style(lint): enforce type imports...
- chore(lint): tighten ESLint rules
- fix(lint): remove unused imports...
- fix(lint): replace require with dynamic import...
- fix(lint): use useSyncExternalStore...

---

## 回滚策略

如果新规则导致太多问题难以修复，可以回滚到较宽松的配置：

```javascript
// 在 eslint.config.mjs 中临时禁用问题规则:
"@typescript-eslint/consistent-type-imports": "off"
```

---

## 变更摘要

| 规则 | 之前 | 之后 |
|------|------|------|
| `@typescript-eslint/no-unused-vars` | warn | error |
| `@typescript-eslint/no-explicit-any` | error | error (不变) |
| `@typescript-eslint/consistent-type-imports` | 无 | error |
| `react-hooks/exhaustive-deps` | 无 | warn |

**修复的文件数:** ~7 个文件
**预计影响范围:** 全代码库类型导入风格统一
