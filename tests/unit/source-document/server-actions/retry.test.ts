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
    requireLedgerAccessMock.mockResolvedValue({
      ledger: { id: "ledger-1" },
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    retrySourceDocumentMock.mockResolvedValue({
      sourceDocumentId: "22222222-2222-4222-8222-222222222222",
      previousSourceDocumentId: "11111111-1111-4111-8111-111111111111",
      status: "processing",
    });
  });

  it("omits input when no retry payload is provided", async () => {
    await retrySourceDocumentAction("ledger-1", "11111111-1111-4111-8111-111111111111");

    const callInput = retrySourceDocumentMock.mock.calls[0]?.[0] as Record<string, unknown>;

    expect(callInput).toBeDefined();
    expect(callInput.ledgerId).toBe("ledger-1");
    expect(callInput.sourceDocumentId).toBe("11111111-1111-4111-8111-111111111111");
    expect(Object.prototype.hasOwnProperty.call(callInput, "input")).toBe(false);
  });

  it("injects scheduleProcessing into use case dependencies", async () => {
    await retrySourceDocumentAction("ledger-1", "11111111-1111-4111-8111-111111111111");

    const deps = retrySourceDocumentMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(deps).toBeDefined();
    expect(typeof deps.scheduleProcessing).toBe("function");
  });

  it("scopes the retry operation ID to the authenticated user and document", async () => {
    const sourceDocumentId = "11111111-1111-4111-8111-111111111111";
    const operationId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    await retrySourceDocumentAction("ledger-1", sourceDocumentId, operationId);

    expect(retrySourceDocumentMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        idempotency: {
          principalType: "user",
          principalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          key: `source-document:direct-retry:ledger-1:${sourceDocumentId}:${operationId}`,
          contentFingerprint: "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
        },
      })
    );
  });

  it("rejects an invalid source-document UUID before invoking the use case", async () => {
    await expect(retrySourceDocumentAction("ledger-1", "not-a-uuid")).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(retrySourceDocumentMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid operation UUID before invoking the use case", async () => {
    await expect(
      retrySourceDocumentAction(
        "ledger-1",
        "11111111-1111-4111-8111-111111111111",
        "operation-not-a-uuid"
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(retrySourceDocumentMock).not.toHaveBeenCalled();
  });
});
