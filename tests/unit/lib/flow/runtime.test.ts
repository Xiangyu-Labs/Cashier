import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FlowEngine, FlowEngineConfig } from "@/lib/flow";

const registerAllTasksMock = vi.fn().mockResolvedValue(undefined);
const resetTaskRegistryMock = vi.fn();
const submitMock = vi.fn().mockResolvedValue("task-1");
const cancelMock = vi.fn().mockResolvedValue(undefined);
const fakeEngine: FlowEngine = {
  register: vi.fn(),
  submit: submitMock,
  cancel: cancelMock,
  getStatus: vi.fn().mockResolvedValue(null),
  listTasks: vi.fn().mockResolvedValue([]),
  getRunningTasks: vi.fn().mockResolvedValue([]),
  getMetrics: vi.fn().mockResolvedValue({ executionTime: 0, queueDepth: 0, deadTasks: [] }),
};
const createFlowEngineMock = vi.fn((_config: FlowEngineConfig) => fakeEngine);

vi.mock("@/lib/flow/task-registry", () => ({
  registerAllTasks: registerAllTasksMock,
  resetTaskRegistry: resetTaskRegistryMock,
}));

vi.mock("@/lib/flow/engine", () => ({
  createFlowEngine: createFlowEngineMock,
}));

vi.mock("@/lib/ai/openai-client", () => ({
  getOpenAIClient: () => ({
    generateContent: vi.fn(),
  }),
}));

describe("flow runtime", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_RUNTIME = "nodejs";

    const { resetFlowRuntime } = await import("@/lib/flow/runtime");
    resetFlowRuntime();
    vi.clearAllMocks();
  });

  it("initializes once and registers tasks once", async () => {
    const { initializeDefaultFlowRuntime, getFlowEngine } = await import("@/lib/flow/runtime");

    const engine1 = await initializeDefaultFlowRuntime();
    const engine2 = await initializeDefaultFlowRuntime();

    expect(engine1).toBe(engine2);
    expect(getFlowEngine()).toBe(engine1);
    expect(createFlowEngineMock).toHaveBeenCalledTimes(1);
    expect(createFlowEngineMock).toHaveBeenCalledWith(
      expect.objectContaining({
        maxConcurrentTasks: expect.any(Number),
        aiContextFactory: expect.any(Function),
      })
    );
    expect(registerAllTasksMock).toHaveBeenCalledTimes(1);
    expect(registerAllTasksMock).toHaveBeenCalledWith(engine1);
  });

  it("throws when accessed before initialization", async () => {
    const { getFlowEngine } = await import("@/lib/flow/runtime");

    expect(() => getFlowEngine()).toThrow(
      "Flow runtime has not been initialized. Call initializeDefaultFlowRuntime() during startup."
    );
  });

  it("lazily initializes the default runtime on first task submission", async () => {
    const { submitFlowTask, getFlowEngine } = await import("@/lib/flow/runtime");

    const taskId = await submitFlowTask("lazy-task", { value: 1 });

    expect(taskId).toBe("task-1");
    expect(getFlowEngine()).toBe(fakeEngine);
    expect(registerAllTasksMock).toHaveBeenCalledTimes(1);
    expect(submitMock).toHaveBeenCalledWith("lazy-task", { value: 1 }, undefined);
  });

  it("rejects lazy initialization in the edge runtime", async () => {
    process.env.NEXT_RUNTIME = "edge";
    const { submitFlowTask } = await import("@/lib/flow/runtime");

    await expect(submitFlowTask("lazy-task", { value: 1 })).rejects.toThrow(
      "Flow runtime is not supported in the Edge Runtime."
    );
  });
});
