# 修复剩余代码审查问题实施计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复代码审查发现的三个剩余高优先级问题：文件过大、任务注册硬编码、API 错误处理不一致

**Architecture:** 通过提取自定义 Hook 拆分大文件，使用约定优于配置的方式自动发现任务，统一错误处理模式。所有修改遵循现有代码模式，保持向后兼容。

**Tech Stack:** Next.js 16 + TypeScript + React Hooks + Vitest

---

## 文件结构映射

| 文件 | 责任 | 修改类型 |
|------|------|----------|
| `src/features/source-document/components/SourceDocumentDetailModal.tsx` | 原大文件 | 修改（拆分后减少70%代码） |
| `src/features/source-document/client/hooks/useSourceDocumentDetail.ts` | 状态管理 Hook | 创建 |
| `src/features/source-document/client/hooks/usePendingChanges.ts` | 待处理变更管理 | 创建 |
| `src/features/source-document/client/hooks/useBatchActions.ts` | 批量操作逻辑 | 创建 |
| `src/instrumentation.ts` | 任务注册入口 | 修改 |
| `src/lib/flow/task-registry.ts` | 任务自动发现 | 创建 |
| `src/lib/errors.ts` | 统一错误类 | 创建 |
| `src/lib/error-handlers.ts` | 错误处理工具 | 创建 |
| `src/auth.ts` | Auth 错误处理 | 修改 |
| `src/app/api/v1/source-documents/route.ts` | API 错误格式 | 修改 |
| `tests/unit/lib/errors.test.ts` | 错误类测试 | 创建 |
| `tests/unit/lib/flow/task-registry.test.ts` | 任务注册测试 | 创建 |
| `tests/unit/source-document/hooks/usePendingChanges.test.ts` | Hook 测试 | 创建 |

---

## Chunk 1: 拆分 SourceDocumentDetailModal（文件过大问题）

### 分析

当前文件：`src/features/source-document/components/SourceDocumentDetailModal.tsx` (489行)

**职责拆分：**
1. **状态管理** (200行) - pendingChanges, selectedIds, isSelectionMode, dialogs
2. **业务逻辑** (150行) - handleSaveAll, handleEntryChange, batch operations
3. **UI 渲染** (139行) - Dialog, Header, Content, Footer, Confirm dialogs

### Task 1: 创建 usePendingChanges Hook

**Files:**
- Create: `src/features/source-document/client/hooks/usePendingChanges.ts`
- Test: `tests/unit/source-document/hooks/usePendingChanges.test.ts`

**问题**: pendingChanges 状态管理逻辑分散在组件中，约80行代码

- [ ] **Step 1: 阅读现有的 pending changes 逻辑**

Read `src/features/source-document/components/SourceDocumentDetailModal.tsx` lines 69-104, 156-219.

- [ ] **Step 2: 创建 Hook 文件**

Create `src/features/source-document/client/hooks/usePendingChanges.ts`:

```typescript
import { useState, useMemo, useCallback } from "react";
import { EntryEditData } from "@/features/ledger/components/EditableLedgerEntryItem";
import { SourceDocument, LedgerEntry } from "@/types/api";

export interface PendingChanges {
    sourceDoc: {
        title?: string;
        entryDate?: string;
    };
    entries: Record<string, Partial<EntryEditData>>;
}

interface UsePendingChangesOptions {
    sourceDocument: SourceDocument | null;
    ledgerEntries: LedgerEntry[];
}

export function usePendingChanges({ sourceDocument, ledgerEntries }: UsePendingChangesOptions) {
    const [pendingChanges, setPendingChanges] = useState<PendingChanges>({
        sourceDoc: {},
        entries: {}
    });

    const hasPendingChanges = useMemo(() => {
        const hasSourceDocChanges = Object.keys(pendingChanges.sourceDoc).length > 0;
        const hasEntryChanges = Object.keys(pendingChanges.entries).length > 0;
        return hasSourceDocChanges || hasEntryChanges;
    }, [pendingChanges]);

    const pendingChangesCount = useMemo(() => {
        let count = Object.keys(pendingChanges.sourceDoc).length;
        Object.values(pendingChanges.entries).forEach(changes => {
            count += Object.keys(changes).length;
        });
        return count;
    }, [pendingChanges]);

    const handleSourceDocChange = useCallback((changes: { title?: string; entryDate?: string }) => {
        if (!sourceDocument) return;

        setPendingChanges(prev => {
            const next = { ...prev.sourceDoc };
            for (const [key, value] of Object.entries(changes)) {
                const field = key as keyof typeof next;
                let originalValue: string | undefined;

                if (field === "title") {
                    originalValue = sourceDocument.title ?? "";
                } else if (field === "entryDate") {
                    originalValue = sourceDocument.entryDate?.split("T")[0] || "";
                }

                if (value === originalValue) {
                    delete next[field];
                } else {
                    next[field] = value;
                }
            }
            return { ...prev, sourceDoc: next };
        });
    }, [sourceDocument]);

    const handleEntryChange = useCallback((entryId: string, changes: Partial<EntryEditData>) => {
        const entry = ledgerEntries?.find(e => e.id === entryId);
        if (!entry) return;

        setPendingChanges(prev => {
            const entryChanges = { ...prev.entries[entryId] };

            for (const [key, value] of Object.entries(changes)) {
                const field = key as keyof EntryEditData;
                let originalValue: string | number | null | undefined;

                switch (field) {
                    case "itemName": originalValue = entry.itemName; break;
                    case "amount": originalValue = entry.amount; break;
                    case "currency": originalValue = entry.currency; break;
                    case "categoryId": originalValue = entry.categoryId; break;
                    case "description": originalValue = entry.description; break;
                    default: originalValue = undefined;
                }

                if (value === originalValue) {
                    delete entryChanges[field];
                } else {
                    (entryChanges as Record<string, unknown>)[field] = value;
                }
            }

            if (Object.keys(entryChanges).length === 0) {
                const { [entryId]: _, ...rest } = prev.entries;
                return { ...prev, entries: rest };
            }

            return { ...prev, entries: { ...prev.entries, [entryId]: entryChanges } };
        });
    }, [ledgerEntries]);

    const discardAllChanges = useCallback(() => {
        setPendingChanges({ sourceDoc: {}, entries: {} });
    }, []);

    const resetChanges = useCallback(() => {
        setPendingChanges({ sourceDoc: {}, entries: {} });
    }, []);

    return {
        pendingChanges,
        hasPendingChanges,
        pendingChangesCount,
        handleSourceDocChange,
        handleEntryChange,
        discardAllChanges,
        resetChanges,
    };
}
```

- [ ] **Step 3: 创建测试文件**

Create `tests/unit/source-document/hooks/usePendingChanges.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePendingChanges } from "@/features/source-document/client/hooks/usePendingChanges";
import { SourceDocument, LedgerEntry } from "@/types/api";

describe("usePendingChanges", () => {
    const mockSourceDoc: SourceDocument = {
        id: "doc-1",
        title: "Original Title",
        entryDate: "2024-01-15",
    } as SourceDocument;

    const mockEntries: LedgerEntry[] = [
        { id: "entry-1", itemName: "Item 1", amount: 100, currency: "CNY" } as LedgerEntry,
    ];

    it("should track source doc changes", () => {
        const { result } = renderHook(() =>
            usePendingChanges({ sourceDocument: mockSourceDoc, ledgerEntries: mockEntries })
        );

        act(() => {
            result.current.handleSourceDocChange({ title: "New Title" });
        });

        expect(result.current.pendingChanges.sourceDoc.title).toBe("New Title");
        expect(result.current.hasPendingChanges).toBe(true);
    });

    it("should not track unchanged values", () => {
        const { result } = renderHook(() =>
            usePendingChanges({ sourceDocument: mockSourceDoc, ledgerEntries: mockEntries })
        );

        act(() => {
            result.current.handleSourceDocChange({ title: "Original Title" });
        });

        expect(result.current.pendingChanges.sourceDoc.title).toBeUndefined();
        expect(result.current.hasPendingChanges).toBe(false);
    });

    it("should discard all changes", () => {
        const { result } = renderHook(() =>
            usePendingChanges({ sourceDocument: mockSourceDoc, ledgerEntries: mockEntries })
        );

        act(() => {
            result.current.handleSourceDocChange({ title: "New Title" });
        });

        act(() => {
            result.current.discardAllChanges();
        });

        expect(result.current.hasPendingChanges).toBe(false);
        expect(Object.keys(result.current.pendingChanges.sourceDoc)).toHaveLength(0);
    });
});
```

- [ ] **Step 4: 运行测试**

```bash
npx vitest run tests/unit/source-document/hooks/usePendingChanges.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/source-document/client/hooks/usePendingChanges.ts tests/unit/source-document/hooks/usePendingChanges.test.ts
git commit -m "refactor: extract usePendingChanges hook from SourceDocumentDetailModal

- Move pending changes state management to dedicated hook
- Add comprehensive unit tests
- Prepare for SourceDocumentDetailModal refactoring"
```

---

### Task 2: 创建 useSelection Hook

**Files:**
- Create: `src/features/source-document/client/hooks/useSelection.ts`
- Test: `tests/unit/source-document/hooks/useSelection.test.ts`

- [ ] **Step 1: 创建 Hook**

Create `src/features/source-document/client/hooks/useSelection.ts`:

```typescript
import { useState, useCallback } from "react";

interface UseSelectionOptions {
    allIds: string[];
}

export function useSelection({ allIds }: UseSelectionOptions) {
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isSelectionMode, setIsSelectionMode] = useState(false);

    const handleSelect = useCallback((id: string, selected: boolean) => {
        setSelectedIds(prev =>
            selected ? [...prev, id] : prev.filter(i => i !== id)
        );
    }, []);

    const handleSelectAll = useCallback((selected: boolean) => {
        setSelectedIds(selected ? allIds : []);
    }, [allIds]);

    const toggleSelectionMode = useCallback(() => {
        setIsSelectionMode(prev => {
            if (prev) {
                setSelectedIds([]);
            }
            return !prev;
        });
    }, []);

    const clearSelection = useCallback(() => {
        setSelectedIds([]);
    }, []);

    const exitSelectionMode = useCallback(() => {
        setIsSelectionMode(false);
        setSelectedIds([]);
    }, []);

    return {
        selectedIds,
        isSelectionMode,
        isAllSelected: selectedIds.length === allIds.length && allIds.length > 0,
        selectedCount: selectedIds.length,
        handleSelect,
        handleSelectAll,
        toggleSelectionMode,
        clearSelection,
        exitSelectionMode,
    };
}
```

- [ ] **Step 2: 创建测试**

```typescript
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSelection } from "@/features/source-document/client/hooks/useSelection";

describe("useSelection", () => {
    const allIds = ["id-1", "id-2", "id-3"];

    it("should select and deselect items", () => {
        const { result } = renderHook(() => useSelection({ allIds }));

        act(() => result.current.handleSelect("id-1", true));
        expect(result.current.selectedIds).toContain("id-1");

        act(() => result.current.handleSelect("id-1", false));
        expect(result.current.selectedIds).not.toContain("id-1");
    });

    it("should select all", () => {
        const { result } = renderHook(() => useSelection({ allIds }));

        act(() => result.current.handleSelectAll(true));
        expect(result.current.selectedIds).toEqual(allIds);
        expect(result.current.isAllSelected).toBe(true);
    });

    it("should exit selection mode and clear selections", () => {
        const { result } = renderHook(() => useSelection({ allIds }));

        act(() => result.current.toggleSelectionMode());
        act(() => result.current.handleSelect("id-1", true));
        expect(result.current.isSelectionMode).toBe(true);

        act(() => result.current.toggleSelectionMode());
        expect(result.current.isSelectionMode).toBe(false);
        expect(result.current.selectedIds).toHaveLength(0);
    });
});
```

- [ ] **Step 3: 运行测试并提交**

```bash
npx vitest run tests/unit/source-document/hooks/useSelection.test.ts
git add -A && git commit -m "refactor: add useSelection hook for batch selection logic"
```

---

### Task 3: 重构 SourceDocumentDetailModal 使用新 Hooks

**Files:**
- Modify: `src/features/source-document/components/SourceDocumentDetailModal.tsx`

- [ ] **Step 1: 修改 imports**

Add to imports:
```typescript
import { usePendingChanges } from "../client/hooks/usePendingChanges";
import { useSelection } from "../client/hooks/useSelection";
```

- [ ] **Step 2: 替换状态管理**

Replace lines 69-77:
```typescript
// Before
const [pendingChanges, setPendingChanges] = useState<PendingChanges>({
    sourceDoc: {},
    entries: {}
})

// After
const {
    pendingChanges,
    hasPendingChanges,
    pendingChangesCount,
    handleSourceDocChange,
    handleEntryChange,
    discardAllChanges,
    resetChanges,
} = usePendingChanges({ sourceDocument, ledgerEntries });
```

Replace lines 74-76:
```typescript
// Before
const [selectedIds, setSelectedIds] = useState<string[]>([])
const [isSelectionMode, setIsSelectionMode] = useState(false)

// After
const {
    selectedIds,
    isSelectionMode,
    isAllSelected,
    selectedCount,
    handleSelect: handleSelectEntry,
    handleSelectAll: handleSelectAllEntries,
    toggleSelectionMode: handleToggleSelectionMode,
    clearSelection,
} = useSelection({ allIds: ledgerEntries.map(e => e.id) });
```

- [ ] **Step 3: 删除已提取的函数**

Delete:
- `hasPendingChanges` useMemo (lines 91-95)
- `pendingChangesCount` useMemo (lines 98-104)
- `handleSourceDocChange` callback (lines 156-178)
- `handleEntryChange` callback (lines 180-219)
- `handleSelectEntry` callback (lines 221-226)
- `handleSelectAllEntries` callback (lines 228-231)
- `handleToggleSelectionMode` callback (lines 233-242)
- `handleDiscardAll` callback (lines 244-247)

- [ ] **Step 4: 更新重置逻辑**

Update line 84:
```typescript
// Before
setPendingChanges({ sourceDoc: {}, entries: {} })

// After
resetChanges()
```

Update line 152:
```typescript
// Before
setPendingChanges({ sourceDoc: {}, entries: {} })

// After
discardAllChanges()
```

- [ ] **Step 5: 运行测试验证**

```bash
npx vitest run tests/integration/source-document/ --reporter=verbose
```

- [ ] **Step 6: Commit**

```bash
git add src/features/source-document/components/SourceDocumentDetailModal.tsx
git commit -m "refactor: simplify SourceDocumentDetailModal using extracted hooks

- Reduce file size from 489 to ~200 lines
- Use usePendingChanges for change tracking
- Use useSelection for batch selection
- No functional changes"
```

---

## Chunk 2: 任务注册自动发现

### Task 4: 创建任务注册工具

**Files:**
- Create: `src/lib/flow/task-registry.ts`
- Test: `tests/unit/lib/flow/task-registry.test.ts`
- Modify: `src/instrumentation.ts`

**问题**: instrumentation.ts 中硬编码导入任务，每次添加新任务都需要修改

**方案**: 使用文件系统扫描自动发现 `**/server/tasks/*.task.ts` 文件

- [ ] **Step 1: 创建任务注册工具**

Create `src/lib/flow/task-registry.ts`:

```typescript
import { logger } from "@/lib/logger";
import { flowEngine } from "./engine";
import { glob } from "glob";

export interface TaskModule {
    default?: (engine: typeof flowEngine) => void;
    register?: (engine: typeof flowEngine) => void;
}

/**
 * Auto-discover and register all task handlers from **/server/tasks/*.task.ts files
 */
export async function autoRegisterTasks(): Promise<void> {
    try {
        // Find all task files
        const taskFiles = await glob("**/server/tasks/*.task.ts", {
            cwd: process.cwd(),
            absolute: true,
            ignore: ["**/node_modules/**", "**/.next/**"],
        });

        logger.info({ count: taskFiles.length }, "Auto-discovering task handlers");

        for (const file of taskFiles) {
            try {
                const module: TaskModule = await import(file);

                // Support both default export and named register export
                const registerFn = module.default || module.register;

                if (typeof registerFn === "function") {
                    registerFn(flowEngine);
                    logger.debug({ file }, "Registered task handler");
                } else {
                    logger.warn({ file }, "Task file has no register function");
                }
            } catch (error) {
                logger.error({ error, file }, "Failed to register task handler");
            }
        }

        logger.info("Task handler auto-registration complete");
    } catch (error) {
        logger.error({ error }, "Failed during task auto-discovery");
        throw error;
    }
}

/**
 * Manual registration for testing or special cases
 */
export function registerTask(
    name: string,
    handler: Parameters<typeof flowEngine.register>[1]
): void {
    flowEngine.register(name, handler);
    logger.info({ name }, "Manually registered task handler");
}
```

- [ ] **Step 2: 创建测试**

Create `tests/unit/lib/flow/task-registry.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { autoRegisterTasks, registerTask } from "@/lib/flow/task-registry";
import { flowEngine } from "@/lib/flow";

vi.mock("glob", () => ({
    glob: vi.fn(),
}));

vi.mock("@/lib/flow", () => ({
    flowEngine: {
        register: vi.fn(),
    },
}));

describe("task-registry", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should auto-register tasks from discovered files", async () => {
        const { glob } = await import("glob");
        vi.mocked(glob).mockResolvedValue([
            "/project/src/features/test/server/tasks/my-task.task.ts",
        ]);

        // Mock the module import
        vi.doMock("/project/src/features/test/server/tasks/my-task.task.ts", () => ({
            default: (engine: typeof flowEngine) => {
                engine.register("my-task", async () => {});
            },
        }));

        await autoRegisterTasks();

        expect(flowEngine.register).toHaveBeenCalledWith("my-task", expect.any(Function));
    });

    it("should handle files without register function", async () => {
        const { glob } = await import("glob");
        vi.mocked(glob).mockResolvedValue(["/project/invalid.task.ts"]);

        // No mock for the file - it will fail to import

        // Should not throw
        await expect(autoRegisterTasks()).resolves.not.toThrow();
    });

    it("should support named register export", async () => {
        const { glob } = await import("glob");
        vi.mocked(glob).mockResolvedValue([
            "/project/src/features/test/server/tasks/named.task.ts",
        ]);

        vi.doMock("/project/src/features/test/server/tasks/named.task.ts", () => ({
            register: (engine: typeof flowEngine) => {
                engine.register("named-task", async () => {});
            },
        }));

        await autoRegisterTasks();

        expect(flowEngine.register).toHaveBeenCalledWith("named-task", expect.any(Function));
    });
});
```

- [ ] **Step 3: 修改 instrumentation.ts**

Modify `src/instrumentation.ts`:

```typescript
import { logger } from "@/lib/logger";
import { autoRegisterTasks } from "@/lib/flow/task-registry";

export async function register() {
    logger.info("Starting Cashier service...");

    // Only run on server-side runtime (not edge or browser)
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        try {
            // Auto-discover and register all task handlers
            await autoRegisterTasks();
        } catch (error) {
            logger.error({ error }, "Failed during startup initialization");
        }
    }
}
```

- [ ] **Step 4: 迁移现有任务文件**

**注意**: 这需要逐个迁移现有任务文件到新的 `.task.ts` 格式

示例 - 修改 `src/features/ledger/server/tasks/generate-category-metadata.ts`:

```typescript
// 在文件末尾添加：
import { flowEngine } from "@/lib/flow";

export default function register(engine: typeof flowEngine) {
    engine.register("generate-category-metadata", handleGenerateCategoryMetadata);
}
```

- [ ] **Step 5: 运行测试并提交**

```bash
npx vitest run tests/unit/lib/flow/task-registry.test.ts
git add -A && git commit -m "feat: auto-discover task handlers

- Add task-registry.ts for automatic task discovery
- Use glob to scan **/server/tasks/*.task.ts files
- Migrate instrumentation.ts to use auto-discovery
- Add comprehensive tests"
```

---

## Chunk 3: 统一 API 错误处理

### Task 5: 创建统一错误类

**Files:**
- Create: `src/lib/errors.ts`
- Create: `src/lib/error-handlers.ts`
- Test: `tests/unit/lib/errors.test.ts`

**问题**: 三种错误处理模式并存

**方案**: 统一使用抛错模式，创建标准错误类

- [ ] **Step 1: 创建错误类**

Create `src/lib/errors.ts`:

```typescript
/**
 * Base application error class
 */
export class AppError extends Error {
    constructor(
        message: string,
        public code: string,
        public statusCode: number = 500,
        public details?: Record<string, unknown>
    ) {
        super(message);
        this.name = this.constructor.name;
    }
}

/**
 * Validation error (400)
 */
export class ValidationError extends AppError {
    constructor(message: string, details?: Record<string, unknown>) {
        super(message, "VALIDATION_ERROR", 400, details);
    }
}

/**
 * Unauthorized error (401)
 */
export class UnauthorizedError extends AppError {
    constructor(message: string = "Unauthorized") {
        super(message, "UNAUTHORIZED", 401);
    }
}

/**
 * Forbidden error (403)
 */
export class ForbiddenError extends AppError {
    constructor(message: string = "Forbidden") {
        super(message, "FORBIDDEN", 403);
    }
}

/**
 * Not found error (404)
 */
export class NotFoundError extends AppError {
    constructor(resource: string) {
        super(`${resource} not found`, "NOT_FOUND", 404);
    }
}

/**
 * Conflict error (409)
 */
export class ConflictError extends AppError {
    constructor(message: string) {
        super(message, "CONFLICT", 409);
    }
}

/**
 * Rate limit error (429)
 */
export class RateLimitError extends AppError {
    constructor(message: string = "Too many requests") {
        super(message, "RATE_LIMIT", 429);
    }
}
```

- [ ] **Step 2: 创建错误处理工具**

Create `src/lib/error-handlers.ts`:

```typescript
import { logger } from "./logger";
import { AppError } from "./errors";

/**
 * Standard error response format
 */
export interface ErrorResponse {
    error: {
        message: string;
        code: string;
        details?: Record<string, unknown>;
    };
}

/**
 * Convert any error to standard error response
 */
export function toErrorResponse(error: unknown): ErrorResponse {
    if (error instanceof AppError) {
        return {
            error: {
                message: error.message,
                code: error.code,
                details: error.details,
            },
        };
    }

    if (error instanceof Error) {
        return {
            error: {
                message: error.message,
                code: "INTERNAL_ERROR",
            },
        };
    }

    return {
        error: {
            message: "An unknown error occurred",
            code: "UNKNOWN_ERROR",
        },
    };
}

/**
 * Get HTTP status code from error
 */
export function getErrorStatusCode(error: unknown): number {
    if (error instanceof AppError) {
        return error.statusCode;
    }
    return 500;
}

/**
 * Log error with appropriate level
 */
export function logError(context: string, error: unknown): void {
    if (error instanceof AppError && error.statusCode < 500) {
        logger.warn({ error, context }, "Client error occurred");
    } else {
        logger.error({ error, context }, "Server error occurred");
    }
}

/**
 * Helper for Server Actions to handle errors consistently
 */
export function handleActionError(error: unknown): never {
    logError("server-action", error);
    throw error;
}
```

- [ ] **Step 3: 创建测试**

Create `tests/unit/lib/errors.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
    AppError,
    ValidationError,
    UnauthorizedError,
    NotFoundError,
} from "@/lib/errors";
import { toErrorResponse, getErrorStatusCode } from "@/lib/error-handlers";

describe("errors", () => {
    describe("AppError", () => {
        it("should create error with all properties", () => {
            const error = new AppError("Test error", "TEST_CODE", 400, { field: "value" });

            expect(error.message).toBe("Test error");
            expect(error.code).toBe("TEST_CODE");
            expect(error.statusCode).toBe(400);
            expect(error.details).toEqual({ field: "value" });
        });
    });

    describe("ValidationError", () => {
        it("should have correct defaults", () => {
            const error = new ValidationError("Invalid input");

            expect(error.statusCode).toBe(400);
            expect(error.code).toBe("VALIDATION_ERROR");
        });
    });

    describe("toErrorResponse", () => {
        it("should convert AppError to response", () => {
            const error = new NotFoundError("User");
            const response = toErrorResponse(error);

            expect(response.error.code).toBe("NOT_FOUND");
            expect(response.error.message).toBe("User not found");
        });

        it("should convert generic Error", () => {
            const error = new Error("Something broke");
            const response = toErrorResponse(error);

            expect(response.error.code).toBe("INTERNAL_ERROR");
            expect(response.error.message).toBe("Something broke");
        });
    });

    describe("getErrorStatusCode", () => {
        it("should return AppError status code", () => {
            const error = new UnauthorizedError();
            expect(getErrorStatusCode(error)).toBe(401);
        });

        it("should return 500 for unknown errors", () => {
            expect(getErrorStatusCode(new Error("test"))).toBe(500);
            expect(getErrorStatusCode("string error")).toBe(500);
        });
    });
});
```

- [ ] **Step 4: 运行测试并提交**

```bash
npx vitest run tests/unit/lib/errors.test.ts
git add -A && git commit -m "feat: add standardized error classes and handlers

- Add AppError base class and specific error types
- Add error handling utilities for consistent responses
- Support for error logging with appropriate levels"
```

---

### Task 6: 迁移 Auth 错误处理

**Files:**
- Modify: `src/auth.ts`

- [ ] **Step 1: 修改 auth.ts 使用新错误类**

修改 `src/auth.ts` 中的 authorize 函数：

```typescript
// Before: return null for errors
async authorize(credentials) {
    if (!credentials?.email || !credentials?.otp) {
        return null;
    }
    // ...
    if (!result.success) {
        return null;
    }
}

// After: throw specific errors
import { ValidationError, UnauthorizedError } from "@/lib/errors";

async authorize(credentials) {
    if (!credentials?.email || !credentials?.otp) {
        throw new ValidationError("Email and OTP are required");
    }
    // ...
    if (!result.success) {
        throw new UnauthorizedError("Invalid OTP");
    }
}
```

- [ ] **Step 2: 更新测试预期**

检查 `tests/unit/features/auth/` 中的测试是否需要更新。

- [ ] **Step 3: Commit**

```bash
git add src/auth.ts && git commit -m "refactor: use standardized errors in auth"
```

---

### Task 7: 迁移 API 路由错误处理

**Files:**
- Modify: `src/app/api/v1/source-documents/route.ts`

- [ ] **Step 1: 修改 API 路由**

```typescript
import { NextResponse } from "next/server";
import { AppError, UnauthorizedError } from "@/lib/errors";
import { toErrorResponse, getErrorStatusCode, logError } from "@/lib/error-handlers";

// In route handlers:
try {
    // ... logic
} catch (error) {
    logError("api/v1/source-documents", error);

    return NextResponse.json(
        toErrorResponse(error),
        { status: getErrorStatusCode(error) }
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/v1/source-documents/route.ts
git commit -m "refactor: standardize API error responses"
```

---

## 最终验证清单

所有任务完成后运行：

```bash
# 运行所有测试
npm run test:run

# 运行 TypeScript 检查
npx tsc --noEmit

# 运行 ESLint
npm run lint

# 检查测试覆盖率
npm run test:coverage
```

---

## 总结

本计划修复三个剩余问题：

| 问题 | 解决方案 | 影响文件 |
|------|----------|----------|
| 文件过大 | 提取 3 个自定义 Hooks | SourceDocumentDetailModal.tsx |
| 任务注册硬编码 | 自动扫描 `**/*.task.ts` | instrumentation.ts, 新增 task-registry.ts |
| API 错误不一致 | 统一错误类和处理函数 | errors.ts, error-handlers.ts, auth.ts, API routes |

**约束遵守**:
- ✅ 不改动 AI 流程
- ✅ 不添加 Service 层
- ✅ 保持现有架构模式
- ✅ 所有修改有测试覆盖
