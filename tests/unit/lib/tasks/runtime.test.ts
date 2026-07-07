import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskRuntime, TaskRuntimeConfig } from "@/lib/tasks";

const registerAllTasksMock = vi.fn().mockResolvedValue(undefined);
const resetTaskRegistryMock = vi.fn();
const submitMock = vi.fn().mockResolvedValue("task-1");
const cancelMock = vi.fn().mockResolvedValue(undefined);
const fakeEngine: TaskRuntime = {
  register: vi.fn(),
  submit: submitMock,
  cancel: cancelMock,
  getStatus: vi.fn().mockResolvedValue(null),
  listTasks: vi.fn().mockResolvedValue([]),
  getRunningTasks: vi.fn().mockResolvedValue([]),
  getMetrics: vi.fn().mockResolvedValue({ executionTime: 0, queueDepth: 0, deadTasks: [] }),
};
const createTaskRuntimeMock = vi.fn((_config: TaskRuntimeConfig) => fakeEngine);

vi.mock("@/lib/tasks/task-registry", () => ({
  registerAllTasks: registerAllTasksMock,
  resetTaskRegistry: resetTaskRegistryMock,
}));

vi.mock("@/lib/tasks/engine", () => ({
  createTaskRuntime: createTaskRuntimeMock,
}));

vi.mock("@/lib/ai/openai-client", () => ({
  getOpenAIClient: () => ({
    generateContent: vi.fn(),
  }),
}));

describe("task runtime", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_RUNTIME = "nodejs";

    const { resetTaskRuntime } = await import("@/lib/tasks/runtime");
    resetTaskRuntime();
    vi.clearAllMocks();
  });

  it("initializes once and registers tasks once", async () => {
    const { initializeDefaultTaskRuntime, getTaskRuntime } = await import("@/lib/tasks/runtime");

    const engine1 = await initializeDefaultTaskRuntime();
    const engine2 = await initializeDefaultTaskRuntime();

    expect(engine1).toBe(engine2);
    expect(getTaskRuntime()).toBe(engine1);
    expect(createTaskRuntimeMock).toHaveBeenCalledTimes(1);
    expect(createTaskRuntimeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        maxConcurrentTasks: expect.any(Number),
        aiContextFactory: expect.any(Function),
      })
    );
    expect(registerAllTasksMock).toHaveBeenCalledTimes(1);
    expect(registerAllTasksMock).toHaveBeenCalledWith(engine1);
  });

  it("throws when accessed before initialization", async () => {
    const { getTaskRuntime } = await import("@/lib/tasks/runtime");

    expect(() => getTaskRuntime()).toThrow(
      "Task runtime has not been initialized. Call initializeDefaultTaskRuntime() during startup."
    );
  });

  it("lazily initializes the default runtime on first task submission", async () => {
    const { submitTask, getTaskRuntime } = await import("@/lib/tasks/runtime");

    const taskId = await submitTask("lazy-task", { value: 1 });

    expect(taskId).toBe("task-1");
    expect(getTaskRuntime()).toBe(fakeEngine);
    expect(registerAllTasksMock).toHaveBeenCalledTimes(1);
    expect(submitMock).toHaveBeenCalledWith("lazy-task", { value: 1 }, undefined);
  });

  it("rejects lazy initialization in the edge runtime", async () => {
    process.env.NEXT_RUNTIME = "edge";
    const { submitTask } = await import("@/lib/tasks/runtime");

    await expect(submitTask("lazy-task", { value: 1 })).rejects.toThrow(
      "Task runtime is not supported in the Edge Runtime."
    );
  });
});
