import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailDeliveryPort, UserAccountPort } from "@/application/contracts";

const { findFirstMock, sendLoginNotificationMock } = vi.hoisted(() => ({
  findFirstMock: vi.fn(),
  sendLoginNotificationMock: vi.fn(),
}));

vi.mock("@/modules/auth/services/notifications", () => ({
  sendLoginNotification: sendLoginNotificationMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      users: {
        findFirst: findFirstMock,
      },
    },
  },
}));

import { handleAuthUserSignedIn } from "@/modules/auth/application/use-cases/handle-auth-user-signed-in";
import { isAuthSignInAllowed } from "@/modules/auth/application/use-cases/is-auth-sign-in-allowed";

const emailDelivery = {} as EmailDeliveryPort;
const users = { findByEmail: findFirstMock } as unknown as UserAccountPort;

describe("auth lifecycle use cases", () => {
  const originalDisableRegistration = process.env.DISABLE_REGISTRATION;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.DISABLE_REGISTRATION;
  });

  afterEach(() => {
    if (originalDisableRegistration == null) {
      delete process.env.DISABLE_REGISTRATION;
    } else {
      process.env.DISABLE_REGISTRATION = originalDisableRegistration;
    }
  });

  it("sends a notification for existing-user sign-in", async () => {
    await handleAuthUserSignedIn(
      {
        email: "user@example.com",
        locale: "en",
        isNewUser: false,
      },
      { emailDelivery }
    );

    expect(sendLoginNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ email: "user@example.com" }),
      emailDelivery
    );
  });

  it("skips existing-user sign-in side effects for new users or missing email", async () => {
    await handleAuthUserSignedIn({ email: "new@example.com", isNewUser: true }, { emailDelivery });
    await handleAuthUserSignedIn({ email: "", isNewUser: false }, { emailDelivery });

    expect(sendLoginNotificationMock).not.toHaveBeenCalled();
  });

  it("allows auth sign-in when registration is enabled or email is missing", async () => {
    await expect(isAuthSignInAllowed({ email: "user@example.com" }, users)).resolves.toBe(true);
    await expect(isAuthSignInAllowed({ email: "" }, users)).resolves.toBe(true);

    expect(findFirstMock).not.toHaveBeenCalled();
  });

  it("enforces the registration policy for auth sign-in when disabled", async () => {
    process.env.DISABLE_REGISTRATION = "true";
    findFirstMock.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "existing-user" });

    await expect(isAuthSignInAllowed({ email: "new-user@example.com" }, users)).resolves.toBe(
      false
    );
    await expect(isAuthSignInAllowed({ email: "existing@example.com" }, users)).resolves.toBe(true);
  });
});
