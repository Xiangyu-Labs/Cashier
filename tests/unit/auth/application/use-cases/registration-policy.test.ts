import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getTestDb } from "tests/setup";
import { users } from "@/persistence/schema/auth";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";
import {
  assertRegistrationAllowed,
  isRegistrationAllowed,
  RegistrationDisabledError,
} from "../../../../../src/modules/auth/application/use-cases/registration-policy";

describe("registration policy use-case", () => {
  const originalDisableRegistration = process.env.DISABLE_REGISTRATION;

  beforeEach(() => {
    delete process.env.DISABLE_REGISTRATION;
  });

  afterEach(() => {
    if (originalDisableRegistration == null) {
      delete process.env.DISABLE_REGISTRATION;
    } else {
      process.env.DISABLE_REGISTRATION = originalDisableRegistration;
    }
  });

  it("allows registration when feature flag is not enabled", async () => {
    await expect(isRegistrationAllowed("new-user@example.com")).resolves.toBe(true);
  });

  it("blocks new users when registration is disabled", async () => {
    process.env.DISABLE_REGISTRATION = "true";

    await expect(isRegistrationAllowed("new-user@example.com")).resolves.toBe(false);
    await expect(assertRegistrationAllowed("new-user@example.com")).rejects.toBeInstanceOf(
      RegistrationDisabledError
    );
    await expect(assertRegistrationAllowed("new-user@example.com")).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.REGISTRATION_DISABLED,
    });
  });

  it("allows existing users when registration is disabled", async () => {
    process.env.DISABLE_REGISTRATION = "true";
    const db = getTestDb();

    await db.insert(users).values({
      id: crypto.randomUUID(),
      email: "existing@example.com",
      name: "Existing",
      emailVerified: new Date(),
    });

    await expect(isRegistrationAllowed("EXISTING@EXAMPLE.COM")).resolves.toBe(true);
    await expect(assertRegistrationAllowed("EXISTING@EXAMPLE.COM")).resolves.toBeUndefined();
  });
});
