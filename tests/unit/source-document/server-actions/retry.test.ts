import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireLedgerAccessMock, retrySourceDocumentMock } = vi.hoisted(() => ({
  requireLedgerAccessMock: vi.fn(),
  retrySourceDocumentMock: vi.fn(),
}));

vi.mock("@/modules/ledger/access", () => ({
  requireLedgerAccess: requireLedgerAccessMock,
  withLedgerAccess: <TArgs extends unknown[], TResult>(
    handler: (ledgerId: string, ...args: TArgs) => TResult
  ) => handler,
}));

vi.mock("@/modules/source-document/application/use-cases/retry-source-document", () => ({
  retrySourceDocument: retrySourceDocumentMock,
}));

import { retrySourceDocumentAction } from "@/modules/source-document/actions";

describe("retrySourceDocumentAction omission semantics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireLedgerAccessMock.mockResolvedValue({ ledger: { id: "ledger-1" } });
    retrySourceDocumentMock.mockResolvedValue({
      sourceDocumentId: "new-doc",
      previousSourceDocumentId: "old-doc",
      status: "queued",
    });
  });

  it("omits input when no retry payload is provided", async () => {
    await retrySourceDocumentAction("ledger-1", "old-doc");

    const callInput = retrySourceDocumentMock.mock.calls[0]?.[0] as Record<string, unknown>;

    expect(callInput).toBeDefined();
    expect(callInput.ledgerId).toBe("ledger-1");
    expect(callInput.sourceDocumentId).toBe("old-doc");
    expect(Object.prototype.hasOwnProperty.call(callInput, "input")).toBe(false);
  });
});
