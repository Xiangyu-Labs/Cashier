import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/auth";
import { getTaskQueueForAuthorizedLedger } from "@/modules/task-queue/actions";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

describe("getTaskQueueForAuthorizedLedger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws UnauthorizedError when not authenticated", async () => {
    vi.mocked(auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      getTaskQueueForAuthorizedLedger("11111111-1111-1111-1111-111111111111")
    ).rejects.toMatchObject({
      statusCode: 401,
    });
  });
});
