import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/modules/auth/services/password";

describe("password service", () => {
  describe("hashPassword", () => {
    it("returns a bcrypt hash for a valid password", async () => {
      const hash = await hashPassword("ValidPass123");
      expect(hash).toBeDefined();
      expect(hash.length).toBeGreaterThan(0);
      expect(hash.startsWith("$2b$")).toBe(true);
    });
  });

  describe("verifyPassword", () => {
    it("returns true for matching password", async () => {
      const hash = await hashPassword("ValidPass123");
      const result = await verifyPassword("ValidPass123", hash);
      expect(result).toBe(true);
    });

    it("returns false for non-matching password", async () => {
      const hash = await hashPassword("ValidPass123");
      const result = await verifyPassword("WrongPass123", hash);
      expect(result).toBe(false);
    });

    it("returns false for empty password against valid hash", async () => {
      const hash = await hashPassword("ValidPass123");
      const result = await verifyPassword("", hash);
      expect(result).toBe(false);
    });
  });
});
