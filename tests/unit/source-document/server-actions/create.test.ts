import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireLedgerAccessMock, createAndQueueSourceDocumentMock } = vi.hoisted(() => ({
  requireLedgerAccessMock: vi.fn(),
  createAndQueueSourceDocumentMock: vi.fn(),
}));

vi.mock("@/modules/ledger/access", () => ({
  requireLedgerAccess: requireLedgerAccessMock,
  withLedgerAccess: <TArgs extends unknown[], TResult>(
    handler: (ledgerId: string, ...args: TArgs) => TResult
  ) => handler,
}));

vi.mock("@/modules/source-document/application/use-cases/create-and-queue-source-document", () => ({
  createAndQueueSourceDocument: createAndQueueSourceDocumentMock,
}));

import { createSourceDocumentAction } from "@/modules/source-document/actions";

describe("createSourceDocumentAction omission semantics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireLedgerAccessMock.mockResolvedValue({ ledger: { id: "ledger-1" } });
    createAndQueueSourceDocumentMock.mockResolvedValue({
      sourceDocumentId: "doc-1",
      status: "queued",
    });
  });

  it("omits absent optional fields when forwarding parsed input", async () => {
    await createSourceDocumentAction("ledger-1", { text: "Lunch 12.50" });

    const callInput = createAndQueueSourceDocumentMock.mock.calls[0]?.[0] as Record<string, unknown>;

    expect(callInput).toBeDefined();
    expect(callInput.ledgerId).toBe("ledger-1");
    expect(callInput.text).toBe("Lunch 12.50");
    expect(Object.prototype.hasOwnProperty.call(callInput, "images")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(callInput, "originalImages")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(callInput, "entryDate")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(callInput, "timezone")).toBe(false);
  });
});
