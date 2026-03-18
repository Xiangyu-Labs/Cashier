import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { getTestDb } from "../../setup";
import { users } from "@/lib/db/schema";
import {
  assertRegistrationAllowed,
  RegistrationDisabledError,
} from "@/features/auth/server/services/registration";

describe("Registration Policy", () => {
  const originalDisableRegistration = process.env.DISABLE_REGISTRATION;

  beforeEach(() => {
    process.env.DISABLE_REGISTRATION = "true";
  });

  afterEach(() => {
    if (originalDisableRegistration == null) {
      delete process.env.DISABLE_REGISTRATION;
    } else {
      process.env.DISABLE_REGISTRATION = originalDisableRegistration;
    }
  });

  it("throws a registration-disabled credentials error for new users", async () => {
    let error: unknown;

    try {
      await assertRegistrationAllowed("new-user@example.com");
    } catch (caughtError) {
      error = caughtError;
    }

    expect(error).toMatchObject({ code: "registration_disabled" });
    expect(error).toBeInstanceOf(RegistrationDisabledError);
  });

  it("allows existing users to sign in when registration is disabled", async () => {
    const db = getTestDb();

    await db.insert(users).values({
      id: "00000000-0000-0000-0000-000000000099",
      email: "existing@example.com",
      name: "Existing User",
      emailVerified: new Date(),
    });

    await expect(assertRegistrationAllowed("existing@example.com")).resolves.toBeUndefined();
  });
});
