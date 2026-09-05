import { describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "@/lib/errors";
import { updateUserPreferences } from "@/modules/auth/application/use-cases/user-preferences";

describe("updateUserPreferences", () => {
  it("passes validated preferences directly to persistence", async () => {
    const update = vi.fn().mockResolvedValue({ interfaceLanguage: "zh" });

    await expect(
      updateUserPreferences("user-1", { interfaceLanguage: "zh" }, { get: vi.fn(), update })
    ).resolves.toEqual({ interfaceLanguage: "zh" });
    expect(update).toHaveBeenCalledWith({
      userId: "user-1",
      preferences: { interfaceLanguage: "zh" },
    });
  });

  it("preserves unauthorized update behavior", async () => {
    const update = vi.fn().mockResolvedValue(null);

    await expect(
      updateUserPreferences("user-1", { interfaceLanguage: "en" }, { get: vi.fn(), update })
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
