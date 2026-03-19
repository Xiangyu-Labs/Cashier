import { beforeEach, describe, expect, it, vi } from "vitest";

const { submitMock, registerAllTasksMock, loggerMock } = vi.hoisted(() => ({
  submitMock: vi.fn(),
  registerAllTasksMock: vi.fn(),
  loggerMock: {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/flow", () => ({
  flowEngine: {
    submit: submitMock,
  },
}));

vi.mock("@/lib/flow/task-registry", () => ({
  registerAllTasks: registerAllTasksMock,
}));

vi.mock("@/lib/db", () => ({
  db: {},
}));

vi.mock("@/lib/logger", () => ({
  logger: loggerMock,
}));

vi.mock("@/lib/storage/image-processing", () => ({
  processImage: vi.fn(),
  isSupportedImageFormat: vi.fn(),
}));

vi.mock("@/lib/storage/local", () => ({
  getLocalStorage: vi.fn(),
}));

describe("prepareSourceDocumentTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    submitMock.mockResolvedValue("task-id");
  });

  it("ensures tasks are registered before submitting parse_source_document", async () => {
    let releaseRegistration: (() => void) | undefined;
    registerAllTasksMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseRegistration = resolve;
        })
    );

    const { prepareSourceDocumentTask } = await import(
      "@/modules/source-document/application/services/processing"
    );

    const submitPromise = prepareSourceDocumentTask({
      ledgerId: "ledger-1",
      sourceDocumentId: "doc-1",
      text: "Lunch 25",
      imageUrls: ["/api/uploads/test.jpg"],
      categories: [{ id: "cat-1", name: "Food", description: "Meals" }],
      settings: {
        aiLanguage: "en",
        preferredCurrencies: ["USD"],
        settings: {
          aiCustomPrompt: "Be strict",
        },
      },
    });

    expect(registerAllTasksMock).toHaveBeenCalledTimes(1);
    expect(submitMock).not.toHaveBeenCalled();

    releaseRegistration?.();
    await submitPromise;

    expect(submitMock).toHaveBeenCalledWith(
      "parse_source_document",
      {
        ledgerId: "ledger-1",
        sourceDocumentId: "doc-1",
        text: "Lunch 25",
        imageUrls: ["/api/uploads/test.jpg"],
        aiLanguage: "en",
        preferredCurrencies: ["USD"],
        categories: [{ id: "cat-1", name: "Food", description: "Meals" }],
        settings: {
          aiCustomPrompt: "Be strict",
        },
      },
      {
        title: "Parse source document",
        scopeId: "ledger-1",
        entityType: "source_document",
        entityId: "doc-1",
      }
    );
    expect(registerAllTasksMock.mock.invocationCallOrder[0]).toBeLessThan(
      submitMock.mock.invocationCallOrder[0]
    );
  });
});
