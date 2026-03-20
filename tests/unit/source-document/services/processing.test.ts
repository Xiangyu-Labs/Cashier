import { beforeEach, describe, expect, it, vi } from "vitest";

const { submitMock, listEntryCategoryInfosMock, loggerMock } = vi.hoisted(() => ({
  submitMock: vi.fn(),
  listEntryCategoryInfosMock: vi.fn(),
  loggerMock: {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/flow", () => ({
  submitFlowTask: submitMock,
}));

vi.mock("@/lib/db", () => ({
  db: {},
}));

vi.mock("@/modules/ledger/queries", () => ({
  listEntryCategoryInfos: listEntryCategoryInfosMock,
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
    listEntryCategoryInfosMock.mockResolvedValue([]);
  });

  it("submits parse_source_document with the assembled flow capability", async () => {
    const { prepareSourceDocumentTask } =
      await import("@/modules/source-document/application/services/processing");

    await prepareSourceDocumentTask({
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
  });

  it("omits optional task payload fields when they are absent", async () => {
    const { prepareSourceDocumentTask } =
      await import("@/modules/source-document/application/services/processing");

    await prepareSourceDocumentTask({
      ledgerId: "ledger-1",
      sourceDocumentId: "doc-1",
      imageUrls: ["/api/uploads/test.jpg"],
      categories: [],
      settings: {
        aiLanguage: "en",
        settings: {},
      },
    });

    const submitInput = submitMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(submitInput).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(submitInput, "text")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(submitInput, "preferredCurrencies")).toBe(false);
  });

  it("omits optional settings fields when ledger metadata does not provide them", async () => {
    const { getSourceDocumentTaskContext } =
      await import("@/modules/source-document/application/services/processing");

    const context = await getSourceDocumentTaskContext("ledger-1", {
      id: "ledger-1",
      userId: "user-1",
      metadata: { settings: {} },
      createdAt: new Date("2026-03-19T12:00:00.000Z"),
      updatedAt: new Date("2026-03-19T12:00:00.000Z"),
      deletedAt: null,
    });

    expect("preferredCurrencies" in context.settings).toBe(false);
    expect("aiCustomPrompt" in context.settings.settings).toBe(false);
  });
});
