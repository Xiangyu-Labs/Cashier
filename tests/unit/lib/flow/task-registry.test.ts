import { beforeEach, describe, expect, it, vi } from "vitest";

function mockTaskRegistryDependencies(registerMock: ReturnType<typeof vi.fn>) {
  vi.doMock("@/lib/flow", () => ({
    flowEngine: {
      register: registerMock,
    },
  }));

  vi.doMock("@/modules/source-document/application/tasks/parse-source-document", () => ({
    parseSourceDocumentTaskDefinition: {
      type: "parse_source_document",
      handler: { execute: vi.fn() },
    },
  }));

  vi.doMock("@/modules/ledger/application/tasks/generate-category-metadata", () => ({
    generateCategoryMetadataTaskDefinition: {
      type: "generate_category_metadata",
      handler: { execute: vi.fn() },
    },
  }));

  vi.doMock("@/modules/ledger/application/tasks/categorize-entry", () => ({
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
    mockTaskRegistryDependencies(registerMock);

    const { registerAllTasks } = await import("@/lib/flow/task-registry");

    await Promise.all([registerAllTasks(), registerAllTasks()]);
    await registerAllTasks();

    expect(registerMock).toHaveBeenCalledTimes(3);
    expect(registerMock).toHaveBeenNthCalledWith(
      1,
      "parse_source_document",
      expect.any(Object)
    );
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
    mockTaskRegistryDependencies(registerMock);

    const { registerAllTasks } = await import("@/lib/flow/task-registry");

    await expect(registerAllTasks()).resolves.toBeUndefined();
    await expect(registerAllTasks()).resolves.toBeUndefined();

    expect(registerMock).toHaveBeenCalledTimes(3);
  });
});
