import { describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { getTestDb } from "tests/setup";
import { otpTokens } from "@/persistence";
import { listAdminOTPTokens } from "@/modules/admin/queries";
import { ValidationError } from "@/lib/errors";
import { UserRole } from "@/modules/admin/types";

const { requireSuperAdminMock } = vi.hoisted(() => ({
  requireSuperAdminMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  get db() {
    return getTestDb();
  },
}));

vi.mock("@/modules/admin/access", () => ({
  requireSuperAdmin: requireSuperAdminMock,
}));

describe("listAdminOTPTokens", () => {
  it("requires super-admin access", async () => {
    requireSuperAdminMock.mockRejectedValueOnce(new Error("forbidden"));
    await expect(listAdminOTPTokens({ limit: 50 })).rejects.toThrow("forbidden");
  });

  it("returns OTP tokens newest first", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValueOnce({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    await db.run(sql`DELETE FROM otp_tokens`);

    await db.insert(otpTokens).values([
      {
        id: "token-new",
        email: "user@example.com",
        tokenHash: "hash-new",
        expires: new Date("2026-03-26T10:00:00.000Z"),
        attempts: 0,
        createdAt: new Date("2026-03-25T10:00:00.000Z"),
      },
      {
        id: "token-old",
        email: "user@example.com",
        tokenHash: "hash-old",
        expires: new Date("2026-03-24T10:00:00.000Z"),
        attempts: 1,
        verifiedAt: new Date("2026-03-25T09:00:00.000Z"),
        createdAt: new Date("2026-03-24T10:00:00.000Z"),
      },
    ]);

    const result = await listAdminOTPTokens({ limit: 50 });

    expect(result.items.map((item) => item.id)).toEqual(["token-new", "token-old"]);
    expect(result.items[0]).toMatchObject({ isVerified: false });
    expect(result.items[1]).toMatchObject({ isVerified: true });
    expect(result.hasAnyOTPTokens).toBe(true);
  });

  it("filters by verified status", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValueOnce({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    await db.run(sql`DELETE FROM otp_tokens`);

    await db.insert(otpTokens).values([
      {
        id: "token-new",
        email: "user@example.com",
        tokenHash: "hash-new",
        expires: new Date("2026-03-26T10:00:00.000Z"),
        attempts: 0,
        createdAt: new Date("2026-03-25T10:00:00.000Z"),
      },
      {
        id: "token-old",
        email: "user@example.com",
        tokenHash: "hash-old",
        expires: new Date("2026-03-24T10:00:00.000Z"),
        attempts: 1,
        verifiedAt: new Date("2026-03-25T09:00:00.000Z"),
        createdAt: new Date("2026-03-24T10:00:00.000Z"),
      },
    ]);

    const verifiedResult = await listAdminOTPTokens({ verified: "yes", limit: 50 });
    expect(verifiedResult.items.map((item) => item.id)).toEqual(["token-old"]);

    const unverifiedResult = await listAdminOTPTokens({ verified: "no", limit: 50 });
    expect(unverifiedResult.items.map((item) => item.id)).toEqual(["token-new"]);
  });

  it("returns nextCursor and supports pagination", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValue({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    await db.run(sql`DELETE FROM otp_tokens`);

    await db.insert(otpTokens).values([
      {
        id: "token-new",
        email: "user@example.com",
        tokenHash: "hash-new",
        expires: new Date("2026-03-26T10:00:00.000Z"),
        attempts: 0,
        createdAt: new Date("2026-03-25T10:00:00.000Z"),
      },
      {
        id: "token-old",
        email: "user@example.com",
        tokenHash: "hash-old",
        expires: new Date("2026-03-24T10:00:00.000Z"),
        attempts: 1,
        verifiedAt: new Date("2026-03-25T09:00:00.000Z"),
        createdAt: new Date("2026-03-24T10:00:00.000Z"),
      },
    ]);

    const firstPage = await listAdminOTPTokens({ limit: 1 });
    expect(firstPage.items.map((item) => item.id)).toEqual(["token-new"]);
    expect(firstPage.nextCursor).toBeTruthy();

    const secondPage = await listAdminOTPTokens({
      limit: 1,
      cursor: firstPage.nextCursor ?? undefined,
    });
    expect(secondPage.items.map((item) => item.id)).toEqual(["token-old"]);
    expect(secondPage.nextCursor).toBeNull();
  });

  it("validates input and throws ValidationError for an invalid cursor", async () => {
    requireSuperAdminMock.mockResolvedValueOnce({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });
    await expect(listAdminOTPTokens({ cursor: "bad" })).rejects.toBeInstanceOf(ValidationError);
  });
});
