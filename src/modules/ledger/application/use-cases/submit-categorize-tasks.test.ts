import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getLedgerAiLanguageMock,
  listIndexedCategoriesForCategorizationMock,
  listSelectedEntriesForCategorizationMock,
  listUncategorizedEntriesForCategorizationMock,
  submitCategorizeTasksForEntriesMock,
  loggerInfoMock,
} = vi.hoisted(() => ({
  getLedgerAiLanguageMock: vi.fn(),
  listIndexedCategoriesForCategorizationMock: vi.fn(),
  listSelectedEntriesForCategorizationMock: vi.fn(),
  listUncategorizedEntriesForCategorizationMock: vi.fn(),
  submitCategorizeTasksForEntriesMock: vi.fn(),
  loggerInfoMock: vi.fn(),
}));

vi.mock("@/modules/ledger/application/queries/get-ledger-ai-language", () => ({
  getLedgerAiLanguage: getLedgerAiLanguageMock,
}));

vi.mock("@/modules/ledger/application/queries/list-indexed-categories-for-categorization", () => ({
  listIndexedCategoriesForCategorization: listIndexedCategoriesForCategorizationMock,
}));

vi.mock("@/modules/ledger/application/queries/list-categorization-target-entries", () => ({
  listSelectedEntriesForCategorization: listSelectedEntriesForCategorizationMock,
  listUncategorizedEntriesForCategorization: listUncategorizedEntriesForCategorizationMock,
}));

vi.mock("@/modules/ledger/application/services/categorize-task-submission", () => ({
  submitCategorizeTasksForEntries: submitCategorizeTasksForEntriesMock,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: loggerInfoMock,
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      info: loggerInfoMock,
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

import { submitAutoCategorize, submitBatchCategorize } from "./submit-categorize-tasks";

describe("submit categorize tasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listIndexedCategoriesForCategorizationMock.mockResolvedValue([{ id: "cat-1" }]);
    getLedgerAiLanguageMock.mockResolvedValue("zh");
    submitCategorizeTasksForEntriesMock.mockResolvedValue({
      submittedCount: 2,
      skippedCount: 1,
    });
  });

  it("submits auto-categorize tasks for uncategorized entries and logs totals", async () => {
    listUncategorizedEntriesForCategorizationMock.mockResolvedValue([
      { id: "entry-1" },
      { id: "entry-2" },
      { id: "entry-3" },
    ]);

    const result = await submitAutoCategorize("ledger-1");

    expect(result).toEqual({ submittedCount: 2, skippedCount: 1 });
    expect(submitCategorizeTasksForEntriesMock).toHaveBeenCalledWith({
      ledgerId: "ledger-1",
      entries: [{ id: "entry-1" }, { id: "entry-2" }, { id: "entry-3" }],
      categories: [{ id: "cat-1" }],
      aiLanguage: "zh",
    });
    expect(loggerInfoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ledgerId: "ledger-1",
        submittedCount: 2,
        skippedCount: 1,
        totalUncategorized: 3,
      }),
      "Auto-categorize tasks submitted"
    );
  });

  it("returns zero result without querying dependencies when no entry ids are provided", async () => {
    await expect(submitBatchCategorize("ledger-1", [])).resolves.toEqual({
      submittedCount: 0,
      skippedCount: 0,
    });

    expect(listSelectedEntriesForCategorizationMock).not.toHaveBeenCalled();
    expect(submitCategorizeTasksForEntriesMock).not.toHaveBeenCalled();
  });

  it("submits batch categorize tasks for selected entries and logs selected total", async () => {
    listSelectedEntriesForCategorizationMock.mockResolvedValue([{ id: "entry-1" }, { id: "entry-2" }]);

    const result = await submitBatchCategorize("ledger-1", ["entry-1", "entry-2", "missing"]);

    expect(result).toEqual({ submittedCount: 2, skippedCount: 1 });
    expect(loggerInfoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ledgerId: "ledger-1",
        submittedCount: 2,
        skippedCount: 1,
        totalSelected: 2,
      }),
      "Batch categorize tasks submitted"
    );
  });
});
