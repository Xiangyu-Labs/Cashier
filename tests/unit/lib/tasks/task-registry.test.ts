import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskRuntime } from "@/lib/tasks";

function mockTaskRegistryDependencies() {
  vi.doMock("@/modules/source-document/tasks", () => ({
    parseSourceDocumentTaskDefinition: {
      type: "parse_source_document",
      handler: { execute: vi.fn() },
    },
  }));
}

describe("registerAllTasks", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("registers parse_source_document only once across concurrent and repeated calls", async () => {
    const registerMock = vi.fn();
    mockTaskRegistryDependencies();

    const { registerAllTasks } = await import("@/lib/tasks/task-registry");
    const engine = { register: registerMock } as unknown as TaskRuntime;

    await Promise.all([registerAllTasks(engine), registerAllTasks(engine)]);
    await registerAllTasks(engine);

    expect(registerMock).toHaveBeenCalledTimes(1);
    expect(registerMock).toHaveBeenCalledWith("parse_source_document", expect.any(Object));
  });

  it("tolerates handlers that were already registered elsewhere", async () => {
    const registerMock = vi.fn(() => {
      throw new Error("Task handler already registered: parse_source_document");
    });
    mockTaskRegistryDependencies();

    const { registerAllTasks } = await import("@/lib/tasks/task-registry");
    const engine = { register: registerMock } as unknown as TaskRuntime;

    await expect(registerAllTasks(engine)).resolves.toBeUndefined();
    await expect(registerAllTasks(engine)).resolves.toBeUndefined();

    expect(registerMock).toHaveBeenCalledTimes(1);
  });
});
