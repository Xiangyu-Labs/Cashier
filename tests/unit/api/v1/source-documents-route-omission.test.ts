import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest, NextResponse } from "next/server";

const {
  handleApiV1RouteMock,
  createSourceDocumentFromCredentialActionMock,
  listSourceDocumentsMock,
} = vi.hoisted(() => ({
  handleApiV1RouteMock: vi.fn(),
  createSourceDocumentFromCredentialActionMock: vi.fn(),
  listSourceDocumentsMock: vi.fn(),
}));

vi.mock("@/app/api/v1/_shared/route-helper", () => ({
  handleApiV1Route: handleApiV1RouteMock,
}));

vi.mock("@/modules/source-document/actions", () => ({
  createSourceDocumentFromCredentialAction: createSourceDocumentFromCredentialActionMock,
  listSourceDocuments: listSourceDocumentsMock,
}));

import { GET, POST } from "@/app/api/v1/source-documents/route";

describe("api/v1/source-documents omission semantics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleApiV1RouteMock.mockImplementation(
      async (
        request: NextRequest,
        {
          handler,
        }: {
          handler: (ctx: {
            credential: { id: string; ledgerId: string };
            key: string;
            request: NextRequest;
          }) => Promise<NextResponse>;
        }
      ) =>
        handler({
          credential: { id: "cred-1", ledgerId: "ledger-1" },
          key: "test-key",
          request,
        })
    );
    createSourceDocumentFromCredentialActionMock.mockResolvedValue({
      sourceDocumentId: "doc-1",
      status: "queued",
    });
    listSourceDocumentsMock.mockResolvedValue({ items: [], nextCursor: null });
  });

  it("omits absent optional fields in POST payload", async () => {
    const request = new Request("http://localhost:3000/api/v1/source-documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Lunch 12.50" }),
    }) as unknown as NextRequest;

    await POST(request);

    const payload = createSourceDocumentFromCredentialActionMock.mock.calls[0]?.[0]
      ?.payload as Record<string, unknown>;
    expect(payload.text).toBe("Lunch 12.50");
    expect(Object.prototype.hasOwnProperty.call(payload, "images")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(payload, "originalImages")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(payload, "entryDate")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(payload, "timezone")).toBe(false);
  });

  it("omits absent optional fields in GET query payload", async () => {
    const request = new Request("http://localhost:3000/api/v1/source-documents?limit=10", {
      method: "GET",
    }) as unknown as NextRequest;

    await GET(request);

    const queryPayload = listSourceDocumentsMock.mock.calls[0]?.[1] as Record<string, unknown>;

    expect(queryPayload.limit).toBe("10");
    expect(Object.prototype.hasOwnProperty.call(queryPayload, "status")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(queryPayload, "startDate")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(queryPayload, "endDate")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(queryPayload, "cursor")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(queryPayload, "includeEntries")).toBe(false);
  });
});
