
import { describe, it, expect } from "vitest";
import { isRegistrationAllowed } from "@/lib/auth/registration";
import { getTestDb } from "../../setup";
import { createTestUserWithLedger } from "../../helpers/schema-setup";

describe("Auth Registration Restrictions", () => {
    it("should allow sign in for existing user even if registration is disabled", async () => {
        const db = getTestDb();
        await createTestUserWithLedger(db, "existing@example.com", "Ledger 1");

        // Simulate ENV variable
        process.env.DISABLE_REGISTRATION = "true";

        const result = await isRegistrationAllowed("existing@example.com");

        expect(result).toBe(true);

        delete process.env.DISABLE_REGISTRATION;
    });

    it("should deny sign in for new user if registration is disabled", async () => {
        process.env.DISABLE_REGISTRATION = "true";

        const result = await isRegistrationAllowed("newuser@example.com");

        expect(result).toBe(false);

        delete process.env.DISABLE_REGISTRATION;
    });

    it("should allow sign in for new user if registration is enabled", async () => {
         process.env.DISABLE_REGISTRATION = "false";

         const result = await isRegistrationAllowed("newuser2@example.com");

         expect(result).toBe(true);
    });

    it("should allow sign in for new user if registration env is not set", async () => {
        delete process.env.DISABLE_REGISTRATION;

        const result = await isRegistrationAllowed("newuser3@example.com");

        expect(result).toBe(true);
   });
});
