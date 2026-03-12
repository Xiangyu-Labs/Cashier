import { describe, it, expect, beforeEach, vi } from "vitest";
import { createFlowEngine } from "@/lib/flow/engine";
import type {
    StorageAdapter,
    TaskRecord,
    TaskFilter,
    TaskInput,
    FlowContext,
} from "@/lib/flow/types";

/**
 * In-memory storage adapter for testing
 * No external dependencies, no mocking of the engine itself
 */
function createMemoryStorage(): StorageAdapter & { tasks: Map<string, TaskRecord> } {
    const tasks = new Map<string, TaskRecord>();
    let idCounter = 0;

    return {
        tasks,
        async create(task: TaskInput): Promise<string> {
            const id = `test-task-${++idCounter}`;
            const record: TaskRecord = {
                id,
                type: task.type,
                title: task.title ?? null,
                status: "pending",
                progress: null,
                input: task.input ?? null,
                error: null,
                tokenUsage: null,
                scopeId: task.scopeId ?? null,
                entityType: task.entityType ?? null,
                entityId: task.entityId ?? null,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            tasks.set(id, record);
            return id;
        },

        async update(id: string, data: Partial<TaskRecord>): Promise<void> {
            const existing = tasks.get(id);
            if (existing) {
                tasks.set(id, { ...existing, ...data, updatedAt: new Date() });
            }
        },

        async get(id: string): Promise<TaskRecord | null> {
            return tasks.get(id) ?? null;
        },

        async list(filter?: TaskFilter): Promise<TaskRecord[]> {
            let results = Array.from(tasks.values());
            if (filter?.status) {
                results = results.filter((t) => t.status === filter.status);
            }
            if (filter?.type) {
                results = results.filter((t) => t.type === filter.type);
            }
            return results;
        },
    };
}

/**
 * Helper to wait for task completion
 */
async function waitForTaskCompletion(
    storage: StorageAdapter,
    taskId: string,
    timeoutMs = 5000
): Promise<TaskRecord> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const task = await storage.get(taskId);
        if (task && ["completed", "failed", "cancelled"].includes(task.status)) {
            return task;
        }
        await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`Task ${taskId} did not complete within ${timeoutMs}ms`);
}

describe("FlowEngine", () => {
    let storage: ReturnType<typeof createMemoryStorage>;

    beforeEach(() => {
        storage = createMemoryStorage();
        vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe("register and submit", () => {
        it("registers a handler and submits a task", async () => {
            const engine = createFlowEngine({ storage });

            engine.register("test_task", {
                execute: async () => ({ result: "success" }),
            });

            const taskId = await engine.submit("test_task", { data: "input" });
            expect(taskId).toBeDefined();
            expect(taskId).toMatch(/^test-task-/);
        });

        it("throws error for unregistered handler", async () => {
            const engine = createFlowEngine({ storage });

            await expect(
                engine.submit("unregistered_task", { data: "input" })
            ).rejects.toThrow("No handler registered for task");
        });
    });

    describe("task lifecycle", () => {
        it("completes task with result", async () => {
            const engine = createFlowEngine({ storage });
            const expectedResult = { message: "done", count: 42 };

            engine.register("complete_task", {
                execute: async () => expectedResult,
            });

            const taskId = await engine.submit("complete_task", {});
            const task = await waitForTaskCompletion(storage, taskId);

            expect(task.status).toBe("completed");
            expect(task.error).toBeNull();
        });

        it("fails task with error", async () => {
            const engine = createFlowEngine({ storage });

            engine.register("fail_task", {
                execute: async () => {
                    throw new Error("Something went wrong");
                },
            });

            const taskId = await engine.submit("fail_task", {});
            const task = await waitForTaskCompletion(storage, taskId);

            expect(task.status).toBe("failed");
            expect(task.error).toBe("Something went wrong");
        });

        it("calls onComplete hook", async () => {
            const engine = createFlowEngine({ storage });
            const onCompleteSpy = vi.fn();

            engine.register("hook_task", {
                execute: async () => ({ result: "data" }),
                onComplete: onCompleteSpy,
            });

            const taskId = await engine.submit("hook_task", { input: "test" });
            await waitForTaskCompletion(storage, taskId);

            expect(onCompleteSpy).toHaveBeenCalledWith(
                { result: "data" },
                { input: "test" },
                expect.objectContaining({ taskId })
            );
        });

        it("calls onError hook", async () => {
            const engine = createFlowEngine({ storage });
            const onErrorSpy = vi.fn();

            engine.register("error_hook_task", {
                execute: async () => {
                    throw new Error("Test error");
                },
                onError: onErrorSpy,
            });

            const taskId = await engine.submit("error_hook_task", { input: "test" });
            await waitForTaskCompletion(storage, taskId);

            expect(onErrorSpy).toHaveBeenCalledWith(
                expect.any(Error),
                { input: "test" },
                expect.objectContaining({ taskId })
            );
        });
    });

    describe("token usage tracking", () => {
        it("accumulates token usage from single report", async () => {
            const engine = createFlowEngine({ storage });

            engine.register("token_task", {
                execute: async (_input: unknown, ctx: FlowContext) => {
                    ctx.reportTokens({ model: "gpt-4o", input: 100, output: 50 });
                    return { done: true };
                },
            });

            const taskId = await engine.submit("token_task", {});
            const task = await waitForTaskCompletion(storage, taskId);

            expect(task.tokenUsage).toBeDefined();
            expect(task.tokenUsage!["gpt-4o"]).toEqual({ input: 100, output: 50 });
            expect(task.tokenUsage!["total"]).toEqual({ input: 100, output: 50 });
        });

        it("accumulates token usage from multiple reports", async () => {
            const engine = createFlowEngine({ storage });

            engine.register("multi_token_task", {
                execute: async (_input: unknown, ctx: FlowContext) => {
                    ctx.reportTokens({ model: "gpt-4o", input: 100, output: 50 });
                    ctx.reportTokens({ model: "gpt-4o", input: 200, output: 100 });
                    ctx.reportTokens({ model: "gemini-2.5-flash", input: 50, output: 25 });
                    return { done: true };
                },
            });

            const taskId = await engine.submit("multi_token_task", {});
            const task = await waitForTaskCompletion(storage, taskId);

            expect(task.tokenUsage!["gpt-4o"]).toEqual({ input: 300, output: 150 });
            expect(task.tokenUsage!["gemini-2.5-flash"]).toEqual({ input: 50, output: 25 });
            expect(task.tokenUsage!["total"]).toEqual({ input: 350, output: 175 });
        });

        it("saves token usage even on failure", async () => {
            const engine = createFlowEngine({ storage });

            engine.register("fail_with_tokens", {
                execute: async (_input: unknown, ctx: FlowContext) => {
                    ctx.reportTokens({ model: "gpt-4o", input: 100, output: 50 });
                    throw new Error("Failed after reporting tokens");
                },
            });

            const taskId = await engine.submit("fail_with_tokens", {});
            const task = await waitForTaskCompletion(storage, taskId);

            expect(task.status).toBe("failed");
            expect(task.tokenUsage!["gpt-4o"]).toEqual({ input: 100, output: 50 });
        });
    });

    describe("progress updates", () => {
        it("updates progress during execution", async () => {
            const engine = createFlowEngine({ storage });
            const progressMessages: string[] = [];

            // Override update to capture progress
            const originalUpdate = storage.update.bind(storage);
            storage.update = async (id, data) => {
                if (data.progress) {
                    progressMessages.push(data.progress);
                }
                return originalUpdate(id, data);
            };

            engine.register("progress_task", {
                execute: async (_input: unknown, ctx: FlowContext) => {
                    await ctx.updateProgress("Step 1: Starting");
                    await ctx.updateProgress("Step 2: Processing");
                    await ctx.updateProgress("Step 3: Finishing");
                    return { done: true };
                },
            });

            const taskId = await engine.submit("progress_task", {});
            await waitForTaskCompletion(storage, taskId);

            expect(progressMessages).toContain("Step 1: Starting");
            expect(progressMessages).toContain("Step 2: Processing");
            expect(progressMessages).toContain("Step 3: Finishing");
        });
    });

    describe("cancellation", () => {
        it("cancels running task", async () => {
            const engine = createFlowEngine({ storage });
            let wasAborted = false;

            engine.register("long_task", {
                execute: async (_input: unknown, ctx: FlowContext) => {
                    // Simulate long-running task that checks abort signal
                    for (let i = 0; i < 100; i++) {
                        if (ctx.signal.aborted) {
                            wasAborted = true;
                            throw new Error("Aborted");
                        }
                        await new Promise((r) => setTimeout(r, 10));
                    }
                    return { done: true };
                },
            });

            const taskId = await engine.submit("long_task", {});
            // Wait a bit for task to start
            await new Promise((r) => setTimeout(r, 50));
            await engine.cancel(taskId);

            const task = await waitForTaskCompletion(storage, taskId);
            expect(task.status).toBe("cancelled");
            expect(wasAborted).toBe(true);
        });

        it("calls onCancel hook", async () => {
            const engine = createFlowEngine({ storage });
            const onCancelSpy = vi.fn();

            engine.register("cancel_hook_task", {
                execute: async (_input: unknown, ctx: FlowContext) => {
                    await new Promise((r) => setTimeout(r, 1000));
                    if (ctx.signal.aborted) throw new Error("Cancelled");
                    return { done: true };
                },
                onCancel: onCancelSpy,
            });

            const taskId = await engine.submit("cancel_hook_task", { input: "test" });
            await new Promise((r) => setTimeout(r, 50));
            await engine.cancel(taskId);

            await waitForTaskCompletion(storage, taskId);

            expect(onCancelSpy).toHaveBeenCalledWith(
                { input: "test" },
                expect.objectContaining({ taskId })
            );
        });
    });

    describe("task queries", () => {
        it("gets task status by ID", async () => {
            const engine = createFlowEngine({ storage });

            engine.register("query_task", {
                execute: async () => ({ result: "done" }),
            });

            const taskId = await engine.submit("query_task", {}, { title: "Test Query" });
            await waitForTaskCompletion(storage, taskId);

            const status = await engine.getStatus(taskId);
            expect(status).toBeDefined();
            expect(status!.id).toBe(taskId);
            expect(status!.status).toBe("completed");
        });

        it("returns null for non-existent task", async () => {
            const engine = createFlowEngine({ storage });
            const status = await engine.getStatus("non-existent-id");
            expect(status).toBeNull();
        });

        it("lists tasks with filter", async () => {
            const engine = createFlowEngine({ storage });

            engine.register("type_a", { execute: async () => "a" });
            engine.register("type_b", { execute: async () => "b" });

            await engine.submit("type_a", {});
            await engine.submit("type_a", {});
            await engine.submit("type_b", {});

            // Wait for all to complete
            await new Promise((r) => setTimeout(r, 100));

            const typeAResults = await engine.listTasks({ type: "type_a" });
            expect(typeAResults).toHaveLength(2);
        });

        it("gets running tasks", async () => {
            const engine = createFlowEngine({ storage });

            engine.register("slow_task", {
                execute: async () => {
                    await new Promise((r) => setTimeout(r, 500));
                    return { done: true };
                },
            });

            const taskId = await engine.submit("slow_task", {});
            await new Promise((r) => setTimeout(r, 50)); // Wait for task to start

            const runningTasks = await engine.getRunningTasks();
            expect(runningTasks.length).toBeGreaterThanOrEqual(1);
            expect(runningTasks.some((t) => t.id === taskId)).toBe(true);

            await waitForTaskCompletion(storage, taskId);
        });
    });

    describe("AI context integration", () => {
        it("provides ai context with generate method", async () => {
            const engine = createFlowEngine({ storage });
            let hasAIContext = false;
            let hasGenerateMethod = false;

            engine.register("ai_context_task", {
                execute: async (_input: unknown, ctx: FlowContext) => {
                    hasAIContext = ctx.ai !== undefined;
                    hasGenerateMethod = typeof ctx.ai?.generate === "function";
                    return { hasAI: hasAIContext };
                },
            });

            const taskId = await engine.submit("ai_context_task", {});
            await waitForTaskCompletion(storage, taskId);

            expect(hasAIContext).toBe(true);
            expect(hasGenerateMethod).toBe(true);
        });

        it("ai context has correct interface", async () => {
            const engine = createFlowEngine({ storage });
            let aiContextKeys: string[] = [];

            engine.register("ai_interface_task", {
                execute: async (_input: unknown, ctx: FlowContext) => {
                    aiContextKeys = Object.keys(ctx.ai);
                    return { keys: aiContextKeys };
                },
            });

            const taskId = await engine.submit("ai_interface_task", {});
            await waitForTaskCompletion(storage, taskId);

            expect(aiContextKeys).toContain("generate");
        });
    });
});
