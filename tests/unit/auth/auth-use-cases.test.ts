import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { ensureUserLedgerMock, findFirstMock, sendLoginNotificationMock } = vi.hoisted(() => ({
  ensureUserLedgerMock: vi.fn(),
  findFirstMock: vi.fn(),
  sendLoginNotificationMock: vi.fn(),
}));

vi.mock("@/modules/workspace/application/use-cases/ensure-user-ledger", () => ({
  ensureUserLedger: ensureUserLedgerMock,
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

import { handleAuthUserCreated } from "@/modules/auth/application/use-cases/handle-auth-user-created";
import { handleAuthUserSignedIn } from "@/modules/auth/application/use-cases/handle-auth-user-signed-in";
import { isAuthSignInAllowed } from "@/modules/auth/application/use-cases/is-auth-sign-in-allowed";

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

  it("initializes a ledger when an auth user is created with an id", async () => {
    await handleAuthUserCreated({ userId: "user-create" });

    expect(ensureUserLedgerMock).toHaveBeenCalledWith({ userId: "user-create" });
  });

  it("skips ledger initialization when auth user creation has no id", async () => {
    await handleAuthUserCreated({ userId: "" });

    expect(ensureUserLedgerMock).not.toHaveBeenCalled();
  });

  it("ensures a ledger and sends a notification for existing-user sign-in", async () => {
    await handleAuthUserSignedIn({
      userId: "user-signin",
      email: "user@example.com",
      locale: "en",
      isNewUser: false,
    });

    expect(ensureUserLedgerMock).toHaveBeenCalledWith({ userId: "user-signin" });
    expect(sendLoginNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ email: "user@example.com" })
    );
  });

  it("skips existing-user sign-in side effects for new users or missing email", async () => {
    await handleAuthUserSignedIn({
      userId: "new-user",
      email: "new@example.com",
      isNewUser: true,
    });
    await handleAuthUserSignedIn({
      userId: "user-signin",
      email: "",
      isNewUser: false,
    });

    expect(ensureUserLedgerMock).not.toHaveBeenCalled();
    expect(sendLoginNotificationMock).not.toHaveBeenCalled();
  });

  it("allows auth sign-in when registration is enabled or email is missing", async () => {
    await expect(isAuthSignInAllowed({ email: "user@example.com" })).resolves.toBe(true);
    await expect(isAuthSignInAllowed({ email: "" })).resolves.toBe(true);

    expect(findFirstMock).not.toHaveBeenCalled();
  });

  it("enforces the registration policy for auth sign-in when disabled", async () => {
    process.env.DISABLE_REGISTRATION = "true";
    findFirstMock.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "existing-user" });

    await expect(isAuthSignInAllowed({ email: "new-user@example.com" })).resolves.toBe(false);
    await expect(isAuthSignInAllowed({ email: "existing@example.com" })).resolves.toBe(true);
  });
});
