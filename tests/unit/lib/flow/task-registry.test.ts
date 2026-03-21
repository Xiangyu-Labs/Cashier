import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FlowEngine } from "@/lib/flow";

function mockTaskRegistryDependencies() {
  vi.doMock("@/modules/source-document/tasks", () => ({
    parseSourceDocumentTaskDefinition: {
      type: "parse_source_document",
      handler: { execute: vi.fn() },
    },
  }));

  vi.doMock("@/modules/ledger/tasks", () => ({
    generateCategoryMetadataTaskDefinition: {
      type: "generate_category_metadata",
      handler: { execute: vi.fn() },
    },
    categorizeEntryTaskDefinition: {
      type: "categorize_entry",
      handler: { execute: vi.fn() },
    },
  }));
}

describe("registerAllTasks", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("registers each task only once across concurrent and repeated calls", async () => {
    const registerMock = vi.fn();
    mockTaskRegistryDependencies();

    const { registerAllTasks } = await import("@/lib/flow/task-registry");
    const engine = { register: registerMock } as unknown as FlowEngine;

    await Promise.all([registerAllTasks(engine), registerAllTasks(engine)]);
    await registerAllTasks(engine);

    expect(registerMock).toHaveBeenCalledTimes(3);
    expect(registerMock).toHaveBeenNthCalledWith(1, "parse_source_document", expect.any(Object));
    expect(registerMock).toHaveBeenNthCalledWith(
      2,
      "generate_category_metadata",
      expect.any(Object)
    );
    expect(registerMock).toHaveBeenNthCalledWith(3, "categorize_entry", expect.any(Object));
  });

  it("tolerates handlers that were already registered elsewhere", async () => {
    const registerMock = vi.fn(() => {
      throw new Error("Task handler already registered: parse_source_document");
    });
    mockTaskRegistryDependencies();

    const { registerAllTasks } = await import("@/lib/flow/task-registry");
    const engine = { register: registerMock } as unknown as FlowEngine;

    await expect(registerAllTasks(engine)).resolves.toBeUndefined();
    await expect(registerAllTasks(engine)).resolves.toBeUndefined();

    expect(registerMock).toHaveBeenCalledTimes(3);
  });
});
