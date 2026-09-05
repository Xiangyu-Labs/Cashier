import { beforeEach, describe, expect, it, vi } from "vitest";

const { createAndQueueSourceDocumentMock } = vi.hoisted(() => ({
  createAndQueueSourceDocumentMock: vi.fn(),
}));

vi.mock("@/modules/source-document/application/use-cases/create-and-queue-source-document", () => ({
  createAndQueueSourceDocument: createAndQueueSourceDocumentMock,
}));

import { createSourceDocumentFromCredential } from "@/modules/source-document/application/use-cases/create-from-credential";
import type { SourceDocumentCredentialPorts } from "@/modules/source-document/application/ports";
import type { PreparedApiV1SourceDocumentInput } from "@/modules/source-document/api-v1-policy";

const ports = {
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

  it("forwards the authenticated principal ledger and omits undefined payload fields", async () => {
    const payload: PreparedApiV1SourceDocumentInput = {
      images: [preparedImage],
    };

    await createSourceDocumentFromCredential(
      { credential: { id: "cred-1", ledgerId: "ledger-1" }, payload },
      scheduleProcessing,
      ports
    );

    const callInput = createAndQueueSourceDocumentMock.mock.calls[0]?.[0];
    expect(callInput).toEqual({
      ledgerId: "ledger-1",
      evidence: { kind: "inline", images: [preparedImage] },
    });
    expect(callInput).not.toHaveProperty("ledger");
  });

  it("threads scheduleProcessing through to createAndQueueSourceDocument", async () => {
    await createSourceDocumentFromCredential(
      {
        credential: { id: "cred-1", ledgerId: "ledger-1" },
        payload: { images: [preparedImage] },
      },
      scheduleProcessing,
      ports
    );

    const deps = createAndQueueSourceDocumentMock.mock.calls[0]?.[1];
    expect(deps).toBeDefined();
    expect(deps.scheduleProcessing).toBe(scheduleProcessing);
  });
});
