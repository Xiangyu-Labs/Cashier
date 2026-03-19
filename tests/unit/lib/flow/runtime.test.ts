import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StorageAdapter } from "@/lib/flow";

const registerAllTasksMock = vi.fn().mockResolvedValue(undefined);
const resetTaskRegistryMock = vi.fn();

vi.mock("@/lib/flow/task-registry", () => ({
  registerAllTasks: registerAllTasksMock,
  resetTaskRegistry: resetTaskRegistryMock,
}));

function createStorage(): StorageAdapter {
  return {
    create: vi.fn().mockResolvedValue("task-1"),
    update: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
  };
}

describe("flow runtime", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    const { resetFlowRuntime } = await import("@/lib/flow/runtime");
    resetFlowRuntime();
    vi.clearAllMocks();
  });

  it("initializes once and registers tasks once", async () => {
    const { initializeFlowRuntime, getFlowEngine, getFlowRuntime } =
      await import("@/lib/flow/runtime");
    const config = {
      storage: createStorage(),
      maxConcurrentTasks: 4,
      ai: {
        getClient: () => ({
          generateContent: vi.fn(),
        }),
        models: {
          text: "test-text-model",
          vision: "test-vision-model",
        },
      },
    };

    const runtime1 = await initializeFlowRuntime(config);
    const runtime2 = await initializeFlowRuntime(config);

    expect(runtime1).toBe(runtime2);
    expect(getFlowRuntime()).toBe(runtime1);
    expect(getFlowEngine()).toBe(runtime1.engine);
    expect(registerAllTasksMock).toHaveBeenCalledTimes(1);
    expect(registerAllTasksMock).toHaveBeenCalledWith(runtime1.engine);
  });

  it("throws when accessed before initialization", async () => {
    const { getFlowRuntime } = await import("@/lib/flow/runtime");

    expect(() => getFlowRuntime()).toThrow(
      "Flow runtime has not been initialized. Call initializeDefaultFlowRuntime() during startup."
    );
  });

  it("lazily initializes the default runtime on first task submission", async () => {
    process.env.NEXT_RUNTIME = "nodejs";

    const storage = createStorage();
    const handlerExecute = vi.fn().mockResolvedValue(undefined);

    vi.doMock("@/lib/flow/adapters/drizzle-storage", () => ({
      createDrizzleStorage: () => storage,
    }));

    vi.doMock("@/lib/ai/openai-client", () => ({
      getOpenAIClient: () => ({
        generateContent: vi.fn(),
      }),
    }));

    registerAllTasksMock.mockImplementationOnce(async (engine) => {
      engine.register("lazy-task", {
        execute: handlerExecute,
      });
    });

    const { submitFlowTask, getFlowRuntime } = await import("@/lib/flow/runtime");
    const taskId = await submitFlowTask("lazy-task", { value: 1 });

    expect(taskId).toBe("task-1");
    expect(getFlowRuntime().engine).toBeDefined();
    expect(registerAllTasksMock).toHaveBeenCalledTimes(1);
    expect(storage.create).toHaveBeenCalledTimes(1);
    expect(handlerExecute).toHaveBeenCalledTimes(1);
  });
});
