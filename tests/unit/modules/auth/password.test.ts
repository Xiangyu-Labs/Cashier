import { describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import type { UserAccountPort } from "@/application/contracts";
import { authenticateWithPassword } from "@/modules/auth/application/use-cases/authenticate-with-password";
import { hashPassword, verifyPassword } from "@/modules/auth/services/password";
import { validatePassword } from "@/modules/auth/services/password-policy";

describe("password authentication", () => {
  const rateLimiter = {
    increment: async () => ({ success: true, remaining: 9, resetTime: Date.now() + 900_000 }),
    current: async () => 0,
    acquireCooldown: async () => ({ acquired: true, acquiredAt: new Date(), retryAfter: 0 }),
    releaseCooldown: async () => true,
    setCooldown: async () => {},
    getCooldownRemaining: async () => 0,
  };

  it("hashes and verifies passwords without storing plaintext", async () => {
    const hash = await hashPassword("correct-horse-9");
    expect(hash).not.toContain("correct-horse-9");
    expect(bcrypt.getRounds(hash)).toBe(12);
    await expect(verifyPassword("correct-horse-9", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password-9", hash)).resolves.toBe(false);
  });

  it("enforces the compact password policy", () => {
    expect(() => validatePassword("short1")).toThrow(/8 and 128/);
    expect(() => validatePassword("onlyletters")).toThrow(/letter and one number/);
    expect(() => validatePassword("valid-password-1")).not.toThrow();
    expect(() => validatePassword(`${"a".repeat(70)}1x`)).not.toThrow();
    expect(() => validatePassword(`${"a".repeat(71)}1x`)).toThrow(/72 UTF-8 bytes/);
  });

  it("returns the user for valid credentials and hides failure details", async () => {
    const passwordHash = await bcrypt.hash("valid-password-1", 4);
    const account = {
      id: "user-id",
      email: "owner@example.com",
      name: null,
      image: null,
      passwordHash,
      passwordUpdatedAt: new Date(),
      authVersion: 1,
      registrationCompletedAt: new Date(),
    };
    const users = {
      findByEmail: async (email: string) => (email === account.email ? account : null),
    } as UserAccountPort;

    await expect(
      authenticateWithPassword(
        {
          email: " OWNER@example.com ",
          password: "valid-password-1",
          requestHeaders: new Headers(),
        },
        { users, rateLimiter }
      )
    ).resolves.toMatchObject({ id: "user-id", email: "owner@example.com" });
    await expect(
      authenticateWithPassword(
        {
          email: "owner@example.com",
          password: "wrong-password-1",
          requestHeaders: new Headers(),
        },
        { users, rateLimiter }
      )
    ).rejects.toMatchObject({ code: "invalid_credentials" });
    await expect(
      authenticateWithPassword(
        {
          email: "missing@example.com",
          password: "wrong-password-1",
          requestHeaders: new Headers(),
        },
        { users, rateLimiter }
      )
    ).rejects.toMatchObject({ code: "invalid_credentials" });
  });

  it("does not increment a rate-limit bucket for a successful password login", async () => {
    const passwordHash = await bcrypt.hash("valid-password-1", 4);
    const increment = vi.fn();
    const users = {
      findByEmail: vi.fn().mockResolvedValue({
        id: "user-id",
        email: "owner@example.com",
        name: null,
        image: null,
        passwordHash,
        passwordUpdatedAt: new Date(),
        authVersion: 2,
        registrationCompletedAt: new Date(),
      }),
    } as unknown as UserAccountPort;

    await authenticateWithPassword(
      {
        email: "owner@example.com",
        password: "valid-password-1",
        locale: "en",
        requestHeaders: new Headers(),
      },
      { users, rateLimiter: { ...rateLimiter, increment } }
    );

    expect(increment).not.toHaveBeenCalled();
  });

  it("runs a dummy bcrypt comparison for unknown users", async () => {
    const compare = vi.spyOn(bcrypt, "compare");
    const findByEmail = vi.fn().mockResolvedValue(null);

    await expect(
      authenticateWithPassword(
        {
          email: "missing@example.com",
          password: "wrong-password-1",
          requestHeaders: new Headers(),
        },
        {
          users: { findByEmail } as unknown as UserAccountPort,
          rateLimiter,
        }
      )
    ).rejects.toMatchObject({ code: "invalid_credentials" });

    expect(compare).toHaveBeenCalledWith("wrong-password-1", expect.stringMatching(/^\$2b\$12\$/));
    compare.mockRestore();
  });

  it("blocks password verification when either rate-limit bucket is unavailable or exhausted", async () => {
    const findByEmail = vi.fn();
    const compare = vi.spyOn(bcrypt, "compare");
    const unavailableRateLimiter = {
      ...rateLimiter,
      current: vi.fn().mockRejectedValue(new Error("rate limiter down")),
    };

    await expect(
      authenticateWithPassword(
        {
          email: "owner@example.com",
          password: "valid-password-1",
          requestHeaders: new Headers(),
        },
        {
          users: { findByEmail } as unknown as UserAccountPort,
          rateLimiter: unavailableRateLimiter,
        }
      )
    ).rejects.toMatchObject({ code: "password_rate_limit_unavailable" });

    expect(findByEmail).not.toHaveBeenCalled();
    expect(compare).not.toHaveBeenCalled();
    compare.mockRestore();

    const limitedRateLimiter = {
      ...rateLimiter,
      current: vi.fn().mockResolvedValue(10),
    };
    await expect(
      authenticateWithPassword(
        {
          email: "owner@example.com",
          password: "valid-password-1",
          requestHeaders: new Headers(),
        },
        {
          users: { findByEmail } as unknown as UserAccountPort,
          rateLimiter: limitedRateLimiter,
        }
      )
    ).rejects.toMatchObject({ code: "password_rate_limited" });
    expect(findByEmail).not.toHaveBeenCalled();
  });

  it("skips the shared IP bucket when the client address is unknown", async () => {
    const increment = vi.fn().mockResolvedValue({
      success: true,
      remaining: 9,
      resetTime: Date.now() + 900_000,
    });
    const users = {
      findByEmail: vi.fn().mockResolvedValue(null),
    } as unknown as UserAccountPort;

    await expect(
      authenticateWithPassword(
        {
          email: "owner@example.com",
          password: "wrong-password-1",
          requestHeaders: new Headers(),
        },
        { users, rateLimiter: { ...rateLimiter, increment } }
      )
    ).rejects.toMatchObject({ code: "invalid_credentials" });

    expect(increment).toHaveBeenCalledTimes(1);
    expect(increment.mock.calls[0]?.[0]).toBe("auth:password:email:owner@example.com");
  });
});
