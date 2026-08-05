import { beforeEach, describe, expect, it, vi } from "vitest";

const { createAndQueueSourceDocumentMock, resolveLedgerForServiceCredentialMock } = vi.hoisted(
  () => ({
    createAndQueueSourceDocumentMock: vi.fn(),
    resolveLedgerForServiceCredentialMock: vi.fn(),
  })
);

vi.mock("@/modules/ledger/credential-access", () => ({
  resolveLedgerForServiceCredential: resolveLedgerForServiceCredentialMock,
}));

vi.mock("@/modules/source-document/application/use-cases/create-and-queue-source-document", () => ({
  createAndQueueSourceDocument: createAndQueueSourceDocumentMock,
}));

import { ValidationError } from "@/lib/errors";
import { createSourceDocumentFromCredential } from "@/modules/source-document/application/use-cases/create-from-credential";
import type { SourceDocumentCredentialPorts } from "@/modules/source-document/application/ports";
import type { PreparedApiV1SourceDocumentInput } from "@/modules/source-document/api-v1-policy";

const ports = {
  ledgers: {},
  settings: {},
  submissions: {},
  storedFiles: {},
} as unknown as SourceDocumentCredentialPorts;

describe("createSourceDocumentFromCredential", () => {
  const scheduleProcessing = vi.fn();
  const preparedImage = {
    bytes: Buffer.from("AQ==", "base64"),
    mimeType: "image/jpeg",
    contentHash: "a".repeat(64),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    createAndQueueSourceDocumentMock.mockResolvedValue({
      sourceDocumentId: "doc-1",
      status: "processing",
    });
  });

  it("throws when credential cannot resolve a ledger", async () => {
    resolveLedgerForServiceCredentialMock.mockResolvedValueOnce(null);

    await expect(
      createSourceDocumentFromCredential(
        {
          credentialId: "cred-1",
          payload: {
            images: [preparedImage],
          },
        },
        scheduleProcessing,
        ports
      )
    ).rejects.toThrow(ValidationError);
    expect(scheduleProcessing).not.toHaveBeenCalled();
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
    const payload: PreparedApiV1SourceDocumentInput = {
      images: [preparedImage],
    };

    await createSourceDocumentFromCredential(
      { credentialId: "cred-1", payload },
      scheduleProcessing,
      ports
    );

    const callInput = createAndQueueSourceDocumentMock.mock.calls[0]?.[0];
    expect(callInput).toEqual({
      ledgerId: "ledger-1",
      ledger: expect.objectContaining({ id: "ledger-1" }),
      preparedImages: [preparedImage],
      maxDecodedImageBytes: 3 * 1024 * 1024,
    });
    expect(callInput).not.toHaveProperty("images");
  });

  it("threads scheduleProcessing through to createAndQueueSourceDocument", async () => {
    resolveLedgerForServiceCredentialMock.mockResolvedValueOnce({
      id: "ledger-1",
    });

    await createSourceDocumentFromCredential(
      { credentialId: "cred-1", payload: { images: [preparedImage] } },
      scheduleProcessing,
      ports
    );

    const deps = createAndQueueSourceDocumentMock.mock.calls[0]?.[1];
    expect(deps).toBeDefined();
    expect(deps.scheduleProcessing).toBe(scheduleProcessing);
  });
});
