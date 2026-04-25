# 测试文件迁移实施计划

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将残留在 `src/modules/` 内的测试文件迁移至 `tests/unit/` 目录，符合项目测试规范（测试文件不应与源代码同级放置）。

**Architecture:** 纯文件迁移，修复 import 路径为 `@/` 别名。涉及模块：auth、stats、task-queue、workspace（currency 模块的测试迁移由独立计划处理）。

**Tech Stack:** TypeScript, Vitest

---

## 文件变更地图

### 迁移（移动 + 修复 import）
- `src/modules/auth/actions.test.ts` → `tests/unit/auth/actions.test.ts`
- `src/modules/stats/utils.test.ts` → `tests/unit/stats/utils.test.ts`
- `src/modules/task-queue/types.test.ts` → `tests/unit/task-queue/types.test.ts`
- `src/modules/workspace/initial-query-state.test.ts` → `tests/unit/workspace/initial-query-state.test.ts`
- `src/modules/workspace/ledger-url-navigation.test.ts` → `tests/unit/workspace/ledger-url-navigation.test.ts`
- `src/modules/workspace/ledger-url-params.test.ts` → `tests/unit/workspace/ledger-url-params.test.ts`

---

## Task 1：移动文件并修复 import 路径

- [ ] **Step 1：确认各测试文件的 import 路径**

  ```bash
  grep -n 'from' src/modules/auth/actions.test.ts
  grep -n 'from' src/modules/stats/utils.test.ts
  grep -n 'from' src/modules/task-queue/types.test.ts
  grep -n 'from' src/modules/workspace/initial-query-state.test.ts
  grep -n 'from' src/modules/workspace/ledger-url-navigation.test.ts
  grep -n 'from' src/modules/workspace/ledger-url-params.test.ts
  ```

  记录所有使用相对路径（`./` 或 `../`）的 import，这些在迁移后需要改为 `@/` 别名路径。

- [ ] **Step 2：创建目标目录并移动文件**

  ```bash
  mkdir -p tests/unit/auth tests/unit/stats tests/unit/task-queue tests/unit/workspace
  mv src/modules/auth/actions.test.ts tests/unit/auth/
  mv src/modules/stats/utils.test.ts tests/unit/stats/
  mv src/modules/task-queue/types.test.ts tests/unit/task-queue/
  mv src/modules/workspace/initial-query-state.test.ts tests/unit/workspace/
  mv src/modules/workspace/ledger-url-navigation.test.ts tests/unit/workspace/
  mv src/modules/workspace/ledger-url-params.test.ts tests/unit/workspace/
  ```

- [ ] **Step 3：修复每个迁移后文件的相对 import 路径**

  对每个迁移后的文件，将相对路径 import 改为 `@/` 别名。例如：

  - `from "../actions"` → `from "@/modules/auth/actions"`
  - `from "./utils"` → `from "@/modules/stats/utils"`
  - `from "./types"` → `from "@/modules/task-queue/types"`
  - workspace 文件中的相对路径同理，对应改为 `@/modules/workspace/...`

  已使用 `@/` 别名的 import 无需修改。

- [ ] **Step 4：运行迁移后的测试确认全部通过**

  ```bash
  npx vitest run tests/unit/auth/actions.test.ts tests/unit/stats/utils.test.ts tests/unit/task-queue/types.test.ts tests/unit/workspace/
  ```

  预期：全部 PASS。

- [ ] **Step 5：确认 src/ 内无残留（除 currency）**

  ```bash
  find src/modules -name '*.test.ts' | grep -v 'currency'
  ```

  预期：无输出。

- [ ] **Step 6：Commit**

  ```bash
  git add -A
  git commit -m "refactor: migrate test files from src/modules/ to tests/unit/"
  ```
