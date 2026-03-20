import { beforeEach, describe, expect, it, vi } from "vitest";

const { submitFlowTaskMock } = vi.hoisted(() => ({
  submitFlowTaskMock: vi.fn(),
}));

vi.mock("@/lib/flow", () => ({
  submitFlowTask: submitFlowTaskMock,
}));

import { submitCategorizeTasksForEntries } from "./categorize-task-submission";

describe("submitCategorizeTasksForEntries omission semantics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    submitFlowTaskMock.mockResolvedValue(undefined);
  });

  it("omits absent source document fields from task input", async () => {
    await submitCategorizeTasksForEntries({
      ledgerId: "ledger-1",
      categories: [
        {
          id: "cat-1",
          index: 1,
          name: "Food",
          description: null,
        },
      ],
      aiLanguage: "en",
	      entries: [
	        {
	          id: "entry-1",
	          ledgerId: "ledger-1",
	          categoryId: null,
	          sourceDocumentId: "doc-1",
	          itemName: "Lunch",
	          amount: "12.50",
	          currency: "USD",
	          description: null,
	          convertedAmount: null,
	          exchangeRate: null,
	          createdAt: new Date(),
	          updatedAt: new Date(),
	          deletedAt: null,
	          sourceDocument: {
	            id: "doc-1",
	            ledgerId: "ledger-1",
	            title: null,
	            type: "ai_parsed",
	            status: "completed",
	            anomalyReason: null,
	            entryDate: "",
	            text: null,
	            imageUrls: [],
	            metadata: {},
	            createdAt: new Date(),
	            updatedAt: new Date(),
	            deletedAt: null,
	          },
        },
      ],
    });

    const firstCall = submitFlowTaskMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    if (firstCall == null) {
      throw new Error("Expected submitFlowTask to be called");
    }
    const taskInput = firstCall[1] as Record<string, unknown>;

    expect(taskInput.ledgerId).toBe("ledger-1");
    expect(taskInput.entryId).toBe("entry-1");
    expect(taskInput.itemName).toBe("Lunch");
    expect(Object.prototype.hasOwnProperty.call(taskInput, "sourceDocumentText")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(taskInput, "sourceDocumentImageUrls")).toBe(false);
  });
});
