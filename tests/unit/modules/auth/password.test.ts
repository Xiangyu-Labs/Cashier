import { describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import type { UserAccountPort } from "@/application/contracts";
import { authenticateWithPassword } from "@/modules/auth/application/use-cases/authenticate-with-password";
import { hashPassword, verifyPassword } from "@/modules/auth/services/password";
import { validatePassword } from "@/modules/auth/services/password-policy";

describe("password authentication", () => {
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
    };
    const users = {
      findByEmail: async (email: string) => (email === account.email ? account : null),
    } as UserAccountPort;

    await expect(
      authenticateWithPassword(
        { email: " OWNER@example.com ", password: "valid-password-1" },
        users
      )
    ).resolves.toMatchObject({ id: "user-id", email: "owner@example.com" });
    await expect(
      authenticateWithPassword({ email: "owner@example.com", password: "wrong-password-1" }, users)
    ).rejects.toMatchObject({ code: "invalid_credentials" });
    await expect(
      authenticateWithPassword(
        { email: "missing@example.com", password: "wrong-password-1" },
        users
      )
    ).rejects.toMatchObject({ code: "invalid_credentials" });
  });
});
