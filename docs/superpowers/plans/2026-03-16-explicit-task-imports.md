# 显式 Import 任务处理器 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除自动发现机制，改回显式 import 注册任务处理器，解决 `count: 0` 日志误导问题

**Architecture:** 直接在 `instrumentation.ts` 中显式 import 三个任务文件，利用模块副作用完成注册，删除 `task-registry.ts` 及其测试

**Tech Stack:** TypeScript, Next.js instrumentation, Vitest

---

## File Structure

| 文件 | 操作 | 说明 |
|-----|------|------|
| `src/instrumentation.ts` | 修改 | 移除 `autoRegisterTasks`，添加显式 import |
| `src/lib/flow/task-registry.ts` | 删除 | 自动发现逻辑不再需要 |
| `tests/unit/lib/flow/task-registry.test.ts` | 删除 | 对应测试不再需要 |
| `docs/guides/TASK_HANDLERS.md` | 修改 | 更新文档说明 |

---

## Chunk 1: Core Changes

### Task 1: 修改 instrumentation.ts

**Files:**
- Modify: `src/instrumentation.ts`

- [ ] **Step 1: 将自动发现改为显式 import**

修改 `src/instrumentation.ts`:

```typescript
import { logger } from "@/lib/logger";

export async function register() {
    // Only run on server-side runtime (not edge or browser)
    if (process.env.NEXT_RUNTIME !== 'nodejs') {
        return;
    }

    logger.info("Starting Cashier service...");

    // Log critical configuration status for diagnostics (safe, no secrets exposed)
    logger.info({
        nodeEnv: process.env.NODE_ENV ?? "not set",
        databaseUrl: process.env.DATABASE_URL ? "configured" : "not configured",
        localStorage: process.env.LOCAL_STORAGE_PATH ?? "./data/uploads",
    }, "Service configuration status");

    try {
        // Explicitly import task handlers to register them
        // Each module registers itself via side effect (flowEngine.register())
        await import("@/features/source-document/server/tasks/parse-source-document");
        await import("@/features/ledger/server/tasks/generate-category-metadata");
        await import("@/features/ledger/server/tasks/categorize-entry");

        logger.info("Task handlers registered successfully");
    } catch (error) {
        logger.error({ error }, "Failed during startup initialization");
    }
}
```

- [ ] **Step 2: 运行 dev 测试**

运行: `npm run dev`

Expected: 启动日志显示 "Task handlers registered successfully"，不再有 "Auto-discovering task handlers" 和 "count: 0"

- [ ] **Step 3: Commit**

```bash
git add src/instrumentation.ts
git commit -m "fix: use explicit imports for task handlers instead of auto-discovery

Remove autoRegisterTasks in favor of explicit imports. This fixes
the misleading 'count: 0' log and makes task registration explicit
and easier to understand."
```

---

### Task 2: 删除 task-registry.ts

**Files:**
- Delete: `src/lib/flow/task-registry.ts`

- [ ] **Step 1: 删除文件**

```bash
rm src/lib/flow/task-registry.ts
```

- [ ] **Step 2: 确认无其他引用**

搜索: `grep -r "task-registry" src/ --include="*.ts"`

Expected: 无结果（instrumentation.ts 已修改，不再引用）

- [ ] **Step 3: Commit**

```bash
git add src/lib/flow/task-registry.ts
git commit -m "chore: remove unused task-registry.ts

Auto-discovery is no longer used; tasks are now explicitly imported
in instrumentation.ts."
```

---

### Task 3: 删除 task-registry 测试

**Files:**
- Delete: `tests/unit/lib/flow/task-registry.test.ts`

- [ ] **Step 1: 删除测试文件**

```bash
rm tests/unit/lib/flow/task-registry.test.ts
```

- [ ] **Step 2: 运行测试确保无影响**

运行: `npm run test:run`

Expected: 所有测试通过，没有关于 task-registry 的错误

- [ ] **Step 3: Commit**

```bash
git add tests/unit/lib/flow/task-registry.test.ts
git commit -m "test: remove task-registry tests

Tests for removed auto-discovery functionality."
```

---

## Chunk 2: Documentation Update

### Task 4: 更新 TASK_HANDLERS.md

**Files:**
- Modify: `docs/guides/TASK_HANDLERS.md`

- [ ] **Step 1: 读取当前文档**

读取文件内容，找到关于自动发现的章节。

- [ ] **Step 2: 更新文档**

找到类似以下内容并修改为显式 import 方式:

```markdown
## Task Registration

Tasks are registered via explicit imports in `src/instrumentation.ts`.
When a task module is imported, it automatically registers itself with
`flowEngine.register()` as a side effect.

To add a new task handler:

1. Create your task file at `src/features/{domain}/server/tasks/{task-name}.ts`
2. Import it in `src/instrumentation.ts`:

```typescript
await import("@/features/{domain}/server/tasks/{task-name}");
```

3. The task will be registered on application startup.
```

- [ ] **Step 3: Commit**

```bash
git add docs/guides/TASK_HANDLERS.md
git commit -m "docs: update TASK_HANDLERS.md to reflect explicit imports

Remove auto-discovery documentation, add explicit import instructions."
```

---

## Final Verification

### Task 5: 完整验证

- [ ] **Step 1: 运行所有测试**

运行: `npm run test:run`

Expected: 全部通过

- [ ] **Step 2: 启动开发服务器验证日志**

运行: `npm run dev`

观察启动日志，Expected:
```
INFO: Starting Cashier service...
INFO: Service configuration status
...
INFO: Task handlers registered successfully
```

不应该出现:
```
INFO: Auto-discovering task handlers
    count: 0
```

- [ ] **Step 3: 验证任务功能**

在 UI 中测试:
- 上传收据 → 应该正常触发解析任务
- 创建新分类 → 应该正常触发元数据生成

- [ ] **Step 4: 最终 Commit（如果需要）**

```bash
git commit -m "chore: complete migration from auto-discovery to explicit imports"
```

---

## Summary

这个变更将:
1. **解决 `count: 0` 误导日志** - 不再有自动发现失败的假象
2. **使代码更清晰** - 显式 import 一目了然
3. **移除无用代码** - 删除 task-registry.ts 和对应测试
4. **更新文档** - 确保后续开发者了解正确做法
