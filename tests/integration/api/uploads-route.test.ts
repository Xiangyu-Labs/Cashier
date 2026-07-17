import { describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { downloadMock } = vi.hoisted(() => ({ downloadMock: vi.fn() }));

vi.mock("@/lib/storage/local", () => ({
  getLocalStorage: () => ({
    download: downloadMock,
  }),
}));

import { GET } from "@/app/api/uploads/[...path]/route";

describe("GET /api/uploads/[...path] after contract release", () => {
  it("does not read legacy image references or local files", async () => {
    const response = await GET(new Request("http://localhost/api/uploads/legacy") as NextRequest, {
      params: Promise.resolve({ path: ["legacy-ledger", "legacy-document", "receipt.jpg"] }),
    });

    expect(response.status).toBe(404);
    expect(downloadMock).not.toHaveBeenCalled();
  });
});
