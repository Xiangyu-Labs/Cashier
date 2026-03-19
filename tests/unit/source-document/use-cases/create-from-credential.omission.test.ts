import { beforeEach, describe, expect, it, vi } from "vitest";

const { getLedgerForServiceCredentialMock, createAndQueueSourceDocumentMock } = vi.hoisted(() => ({
  getLedgerForServiceCredentialMock: vi.fn(),
  createAndQueueSourceDocumentMock: vi.fn(),
}));

vi.mock("@/modules/ledger/queries", () => ({
  getLedgerForServiceCredential: getLedgerForServiceCredentialMock,
}));

vi.mock("@/modules/source-document/application/use-cases/create-and-queue-source-document", () => ({
  createAndQueueSourceDocument: createAndQueueSourceDocumentMock,
}));

import { createSourceDocumentFromCredential } from "@/modules/source-document/application/use-cases/create-from-credential";

describe("createSourceDocumentFromCredential omission semantics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLedgerForServiceCredentialMock.mockResolvedValue({ id: "ledger-1" });
    createAndQueueSourceDocumentMock.mockResolvedValue({
      sourceDocumentId: "doc-1",
      status: "queued",
    });
  });

  it("omits absent optional payload fields when forwarding to create-and-queue", async () => {
    await createSourceDocumentFromCredential({
      credentialId: "cred-1",
      payload: { text: "Lunch 12.50" },
    });

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
