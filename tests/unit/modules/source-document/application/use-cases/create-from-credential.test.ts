import { beforeEach, describe, expect, it, vi } from "vitest";

const { createAndQueueSourceDocumentMock, resolveLedgerForServiceCredentialMock } = vi.hoisted(() => ({
  createAndQueueSourceDocumentMock: vi.fn(),
  resolveLedgerForServiceCredentialMock: vi.fn(),
}));

vi.mock("@/modules/ledger/credential-access", () => ({
  resolveLedgerForServiceCredential: resolveLedgerForServiceCredentialMock,
}));

vi.mock("@/modules/source-document/application/use-cases/create-and-queue-source-document", () => ({
  createAndQueueSourceDocument: createAndQueueSourceDocumentMock,
}));

import { ValidationError } from "@/lib/errors";
import type { CreateSourceDocumentInput } from "@/modules/source-document/contracts";
import { createSourceDocumentFromCredential } from "../../../../../../src/modules/source-document/application/use-cases/create-from-credential";

describe("createSourceDocumentFromCredential", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createAndQueueSourceDocumentMock.mockResolvedValue({
      sourceDocumentId: "doc-1",
      status: "queued",
    });
  });

  it("throws when credential cannot resolve a ledger", async () => {
    resolveLedgerForServiceCredentialMock.mockResolvedValueOnce(null);

    await expect(
      createSourceDocumentFromCredential({
        credentialId: "cred-1",
        payload: {
          text: "hello",
        },
      })
    ).rejects.toThrow(ValidationError);
  });

  it("forwards resolved ledger and omits undefined payload fields", async () => {
    resolveLedgerForServiceCredentialMock.mockResolvedValueOnce({
      id: "ledger-1",
      userId: "user-1",
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });
    const payload: CreateSourceDocumentInput = {
      text: "receipt",
    };
    (payload as { timezone?: string | undefined }).timezone = undefined;

    await createSourceDocumentFromCredential({
      credentialId: "cred-1",
      payload,
    });

    expect(createAndQueueSourceDocumentMock).toHaveBeenCalledWith({
      ledgerId: "ledger-1",
      ledger: expect.objectContaining({ id: "ledger-1" }),
      text: "receipt",
    });
    expect(createAndQueueSourceDocumentMock.mock.calls[0]?.[0]).not.toHaveProperty("timezone");
  });
});
