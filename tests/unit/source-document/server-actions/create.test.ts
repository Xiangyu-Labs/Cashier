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
    requireLedgerAccessMock.mockResolvedValue({
      ledger: { id: "ledger-1" },
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    createAndQueueSourceDocumentMock.mockResolvedValue({
      sourceDocumentId: "doc-1",
      status: "processing",
    });
  });

  it("omits absent optional fields when forwarding parsed input", async () => {
    await createSourceDocumentAction("ledger-1", { text: "Lunch 12.50" });

    const callInput = createAndQueueSourceDocumentMock.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;

    expect(callInput).toBeDefined();
    expect(callInput.ledgerId).toBe("ledger-1");
    expect(callInput.text).toBe("Lunch 12.50");
    expect(Object.prototype.hasOwnProperty.call(callInput, "images")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(callInput, "originalImages")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(callInput, "entryDate")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(callInput, "timezone")).toBe(false);
  });

  it("injects scheduleProcessing into use case dependencies", async () => {
    await createSourceDocumentAction("ledger-1", { text: "Lunch" });

    const deps = createAndQueueSourceDocumentMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(deps).toBeDefined();
    expect(typeof deps.scheduleProcessing).toBe("function");
  });

  it("scopes a client submission ID to the authenticated user", async () => {
    const clientSubmissionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    await createSourceDocumentAction("ledger-1", { text: "Lunch" }, undefined, clientSubmissionId);

    expect(createAndQueueSourceDocumentMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        idempotency: {
          principalType: "user",
          principalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          key: `source-document:create:ledger-1:new:${clientSubmissionId}`,
          contentFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
      })
    );
  });

  it("does not include the legacy operation ID in the business result", async () => {
    const result = await createSourceDocumentAction(
      "ledger-1",
      { text: "Lunch" },
      "operation-not-a-uuid"
    );

    expect(createAndQueueSourceDocumentMock).toHaveBeenCalledOnce();
    expect(result).toEqual({ sourceDocumentId: "doc-1", status: "processing" });
    expect(result).not.toHaveProperty("reconciliation");
  });
});
