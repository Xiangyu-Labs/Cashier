import { beforeEach, describe, expect, it, vi } from "vitest";

const { createAndQueueSourceDocumentMock } = vi.hoisted(() => ({
  createAndQueueSourceDocumentMock: vi.fn(),
}));

vi.mock("@/modules/source-document/application/use-cases/create-and-queue-source-document", () => ({
  createAndQueueSourceDocument: createAndQueueSourceDocumentMock,
}));

import { createSourceDocumentFromCredential } from "@/modules/source-document/application/use-cases/create-from-credential";
import type { SourceDocumentCredentialPorts } from "@/modules/source-document/application/ports";

const ports = {
  submissions: {},
  storedFiles: {},
} as unknown as SourceDocumentCredentialPorts;

describe("createSourceDocumentFromCredential omission semantics", () => {
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

  it("omits absent optional payload fields when forwarding to create-and-queue", async () => {
    await createSourceDocumentFromCredential(
      {
        credential: { id: "cred-1", ledgerId: "ledger-1" },
        payload: { images: [preparedImage] },
      },
      scheduleProcessing,
      ports
    );

    const callInput = createAndQueueSourceDocumentMock.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(callInput).toBeDefined();
    expect(callInput.ledgerId).toBe("ledger-1");
    expect(callInput.preparedImages).toEqual([preparedImage]);
    expect(Object.prototype.hasOwnProperty.call(callInput, "images")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(callInput, "originalImages")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(callInput, "entryDate")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(callInput, "timezone")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(callInput, "text")).toBe(false);
  });
});
