import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { getTestDb } from "../../setup";
import { createTestUserWithLedger } from "../../helpers/schema-setup";
import { sourceDocuments } from "@/persistence";
import * as authModule from "@/auth";

const { mockDownload, mockExtractKeyFromUrl } = vi.hoisted(() => ({
  mockDownload: vi.fn(),
  mockExtractKeyFromUrl: vi.fn((url: string) => {
    if (!url.startsWith("/api/uploads/")) return null;
    return url.slice("/api/uploads/".length);
  }),
}));

vi.mock("@/lib/storage/local", () => ({
  getLocalStorage: () => ({
    download: mockDownload,
    extractKeyFromUrl: mockExtractKeyFromUrl,
  }),
}));

import { GET as uploadsGET } from "@/app/api/uploads/[...path]/route";

function createMockRequest(url: string): NextRequest {
  return new Request(url) as NextRequest;
}

describe("GET /api/uploads/[...path]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExtractKeyFromUrl.mockImplementation((url: string) => {
      if (!url.startsWith("/api/uploads/")) return null;
      return url.slice("/api/uploads/".length);
    });
  });

  it("serves a referenced upload for the owning user", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const docId = crypto.randomUUID();
    const storageKey = `${ledgerId}/${docId}/receipt.jpg`;

    await db.insert(sourceDocuments).values({
      id: docId,
      ledgerId,
      status: "completed",
      imageUrls: [`/api/uploads/${storageKey}`],
    });

    mockDownload.mockResolvedValue(Buffer.from("image-bytes"));

    const response = await uploadsGET(createMockRequest("http://localhost/api/uploads/test"), {
      params: Promise.resolve({ path: [ledgerId, docId, "receipt.jpg"] }),
    });

    expect(response.status).toBe(200);
    expect(mockDownload).toHaveBeenCalledWith(storageKey);
  });

  it("returns 404 when the requested file is not referenced by the document", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const docId = crypto.randomUUID();

    await db.insert(sourceDocuments).values({
      id: docId,
      ledgerId,
      status: "completed",
      imageUrls: [`/api/uploads/${ledgerId}/${docId}/other.jpg`],
    });

    const response = await uploadsGET(createMockRequest("http://localhost/api/uploads/test"), {
      params: Promise.resolve({ path: [ledgerId, docId, "receipt.jpg"] }),
    });

    expect(response.status).toBe(404);
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it("returns 404 for another user's upload path", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(
      db,
      undefined,
      undefined,
      "11111111-1111-4111-8111-111111111111"
    );
    const docId = crypto.randomUUID();

    await db.insert(sourceDocuments).values({
      id: docId,
      ledgerId,
      status: "completed",
      imageUrls: [`/api/uploads/${ledgerId}/${docId}/receipt.jpg`],
    });

    const response = await uploadsGET(createMockRequest("http://localhost/api/uploads/test"), {
      params: Promise.resolve({ path: [ledgerId, docId, "receipt.jpg"] }),
    });

    expect(response.status).toBe(404);
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it("returns 401 when the user is not authenticated", async () => {
    vi.spyOn(authModule, "auth").mockResolvedValue(null as never);

    const response = await uploadsGET(createMockRequest("http://localhost/api/uploads/test"), {
      params: Promise.resolve({
        path: [
          "00000000-0000-4000-8000-000000000000",
          "00000000-0000-4000-8000-000000000001",
          "receipt.jpg",
        ],
      }),
    });

    expect(response.status).toBe(401);
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it("returns 404 when required path segments are missing", async () => {
    vi.spyOn(authModule, "auth").mockResolvedValue({
      user: {
        id: "00000000-0000-4000-8000-000000000000",
        email: "test@example.com",
      },
    } as never);

    const response = await uploadsGET(createMockRequest("http://localhost/api/uploads/test"), {
      params: Promise.resolve({
        path: ["00000000-0000-4000-8000-000000000000", "00000000-0000-4000-8000-000000000001"],
      }),
    });

    expect(response.status).toBe(404);
    expect(mockDownload).not.toHaveBeenCalled();
  });
});
