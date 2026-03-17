# 额外 Lint 规则实施计划

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 添加 Prettier 代码格式化、strict-boolean-expressions 严格布尔检查、no-floating-promises 未等待 Promise 检查。

**Architecture:** 采用渐进式实施：先添加 Prettier（最基础），再添加 strict-boolean-expressions（最严格），最后添加 no-floating-promises（需仔细审查）。

**Tech Stack:** Prettier, ESLint 9, @typescript-eslint

---

## Chunk 1: 添加 Prettier 代码格式化

### Task 1: 安装并配置 Prettier

**文件:**
- 创建: `.prettierrc`
- 创建: `.prettierignore`
- 修改: `package.json` (添加 script 和 devDependencies)
- 修改: `eslint.config.mjs` (添加 eslint-config-prettier)

**背景:**
Prettier 是一个代码格式化工具，与 ESLint 负责代码质量不同，它只关注代码美观（空格、换行、引号等）。

- [ ] **Step 1: 安装依赖**

```bash
npm install -D prettier eslint-config-prettier
```

- [ ] **Step 2: 创建 .prettierrc 配置文件**

```json
{
  "semi": true,
  "singleQuote": false,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

- [ ] **Step 3: 创建 .prettierignore 文件**

```
.next/
out/
build/
coverage/
*.min.js
*.min.css
package-lock.json
pnpm-lock.yaml
yarn.lock
```

- [ ] **Step 4: 修改 eslint.config.mjs 添加 prettier**

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
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_"
        }
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
          fixStyle: "inline-type-imports"
        }
      ],
      "react-hooks/exhaustive-deps": "warn"
    }
  }
]);

export default eslintConfig;
```

- [ ] **Step 5: 添加 package.json scripts**

修改 `package.json`，在 scripts 中添加：
```json
{
  "scripts": {
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "lint": "eslint",
    "lint:fix": "eslint --fix",
    ...
  }
}
```

- [ ] **Step 6: 运行 Prettier 格式化全代码库**

```bash
npm run format
```

- [ ] **Step 7: 验证**

```bash
npm run format:check
```
预期: 0 errors

- [ ] **Step 8: 提交**

```bash
git add -A
git commit -m "chore: add Prettier for code formatting

- Add .prettierrc with team style preferences
- Add .prettierignore
- Add format and format:check npm scripts
- Format entire codebase"
```

---

## Chunk 2: 添加 strict-boolean-expressions 规则

### Task 2: 启用 strict-boolean-expressions 规则

**文件:**
- 修改: `eslint.config.mjs` (添加规则)
- 修改: 约 80+ 个文件 (修复布尔表达式)

**背景:**
`@typescript-eslint/strict-boolean-expressions` 规则禁止在条件中使用非布尔值的隐式转换，避免 `0`、`""`、`NaN` 被误判为 false。

**警告:** 此规则会影响约 80+ 处代码，需要仔细检查每个修改。

- [ ] **Step 1: 安装额外依赖**

```bash
npm install -D @typescript-eslint/eslint-plugin
```

- [ ] **Step 2: 更新 eslint.config.mjs 添加规则**

在 rules 部分添加：
```javascript
"@typescript-eslint/strict-boolean-expressions": [
  "error",
  {
    allowString: false,
    allowNumber: false,
    allowNullableObject: true,
    allowNullableBoolean: true,
    allowNullableString: false,
    allowNullableNumber: false,
    allowAny: false
  }
]
```

- [ ] **Step 3: 查看需要修复的问题**

```bash
npm run lint 2>&1 | grep "strict-boolean-expressions" | head -50
```

- [ ] **Step 4: 修复典型的布尔表达式问题**

常见的修复模式：

```typescript
// 从:
if (count) { ... }
// 改为:
if (count > 0) { ... }

// 从:
if (name) { ... }
// 改为:
if (name !== "") { ... }
if (name != null) { ... }  // 检查是否存在

// 从:
if (items.length) { ... }
// 改为:
if (items.length > 0) { ... }

// 从:
if (value) { ... }  // 可能是 0
// 改为:
if (value !== 0) { ... }
```

**重要文件列表 (预计需要修改):**
- src/components/providers.tsx (if 检查)
- src/features/source-document/server/actions/*.ts
- src/features/ledger/server/actions/*.ts
- src/features/ledger/components/*.tsx
- tests/**/*.ts

- [ ] **Step 5: 使用 ESLint --fix 自动修复**

```bash
npm run lint:fix
```

- [ ] **Step 6: 手动修复剩余问题**

检查仍有问题的地方：
```bash
npm run lint 2>&1 | grep "strict-boolean-expressions"
```

对于每个问题，根据上下文决定：
- `if (x)` → `if (x != null)` (检查是否存在)
- `if (x)` → `if (x !== 0)` (检查非零)
- `if (x)` → `if (x !== "")` (检查非空字符串)
- `if (x)` → `if (Boolean(x))` (如果确实需要真值检查)

- [ ] **Step 7: 验证测试通过**

```bash
npm run test:run
```

- [ ] **Step 8: 提交**

```bash
git add -A
git commit -m "chore(lint): enable strict-boolean-expressions rule

- Prevent implicit boolean conversions that could mask bugs
- Fix 80+ instances of implicit boolean coercion"
```

---

## Chunk 3: 添加 no-floating-promises 规则

### Task 3: 启用 no-floating-promises 规则

**文件:**
- 修改: `eslint.config.mjs` (添加规则)
- 修改: 需要明确处理的 Promise 调用点

**背景:**
`@typescript-eslint/no-floating-promises` 规则检测那些没有 await、.catch() 或 void 标记的 Promise，防止未处理的 rejection。

- [ ] **Step 1: 更新 eslint.config.mjs 添加规则**

在 rules 部分添加：
```javascript
"@typescript-eslint/no-floating-promises": [
  "error",
  {
    ignoreVoid: true,
    ignoreIIFE: true
  }
]
```

- [ ] **Step 2: 查看需要修复的问题**

```bash
npm run lint 2>&1 | grep "no-floating-promises" | head -30
```

- [ ] **Step 3: 分析并修复每个问题**

**修复策略：**

1. **应该 await 的：** 添加 await
```typescript
// 从:
fetch('/api/data');
// 改为:
await fetch('/api/data');
```

2. **故意不等待的 (fire-and-forget)：** 使用 void 标记
```typescript
// 从:
analytics.track(event);
// 改为:
void analytics.track(event);
```

3. **需要错误处理的：** 添加 catch
```typescript
// 从:
saveToDatabase(data);
// 改为:
saveToDatabase(data).catch(err => logger.error(err));
```

- [ ] **Step 4: 验证**

```bash
npm run lint
```
预期: 没有 no-floating-promises 错误

- [ ] **Step 5: 验证测试**

```bash
npm run test:run
```

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "chore(lint): enable no-floating-promises rule

- Detect unhandled Promise rejections
- Mark intentional fire-and-forget with void operator
- Add error handling where needed"
```

---

## Chunk 4: 最终验证

### Task 4: 完整验证

- [ ] **Step 1: 运行所有检查**

```bash
npm run lint
npm run format:check
npm run test:run
npm run build
```

- [ ] **Step 2: 更新 CLAUDE.md 文档**

在 `CLAUDE.md` 的 **Commands** 部分添加：
```bash
# Code Quality
npm run lint             # ESLint check
npm run lint:fix         # ESLint auto-fix
npm run format           # Prettier format
npm run format:check     # Prettier check
```

- [ ] **Step 3: 提交文档更新**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with new code quality commands"
```

---

## 回滚策略

如果新规则导致问题，可以临时禁用：

```javascript
// 在 eslint.config.mjs 中
"@typescript-eslint/strict-boolean-expressions": "off"
"@typescript-eslint/no-floating-promises": "off"
```

---

## 变更摘要

| 工具/规则 | 新增/变更 | 影响范围 |
|-----------|----------|----------|
| Prettier | 新增 | 全代码库格式化 |
| @typescript-eslint/strict-boolean-expressions | 新增 error | ~80+ 处需修改 |
| @typescript-eslint/no-floating-promises | 新增 error | 需要审查每个 Promise |

**预计修改文件数:** 80+
**预计工作量:** 2-4 小时
**风险等级:** 中等 (strict-boolean-expressions 需要仔细测试)
