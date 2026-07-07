import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "@/lib/errors";

const {
  nextAuthMock,
  authenticateWithOTPMock,
  getSessionUserMock,
  handleAuthUserCreatedMock,
  handleAuthUserSignedInMock,
  isAuthSignInAllowedMock,
} = vi.hoisted(() => ({
  nextAuthMock: vi.fn(),
  authenticateWithOTPMock: vi.fn(),
  getSessionUserMock: vi.fn(),
  handleAuthUserCreatedMock: vi.fn(),
  handleAuthUserSignedInMock: vi.fn(),
  isAuthSignInAllowedMock: vi.fn().mockResolvedValue(true),
}));

vi.mock("next-auth", () => ({
  default: nextAuthMock,
}));

vi.mock("next-auth/providers/credentials", () => ({
  default: vi.fn((config) => config),
}));

vi.mock("@/lib/db", () => ({
  db: {},
}));

vi.mock("@/persistence/schema/auth", () => ({
  users: {},
}));

vi.mock("@/modules/auth/application/use-cases/authenticate-with-otp", () => ({
  authenticateWithOTP: authenticateWithOTPMock,
}));

vi.mock("@/modules/auth/application/use-cases/handle-auth-user-created", () => ({
  handleAuthUserCreated: handleAuthUserCreatedMock,
}));

vi.mock("@/modules/auth/application/use-cases/handle-auth-user-signed-in", () => ({
  handleAuthUserSignedIn: handleAuthUserSignedInMock,
}));

vi.mock("@/modules/auth/application/use-cases/is-auth-sign-in-allowed", () => ({
  isAuthSignInAllowed: isAuthSignInAllowedMock,
}));

vi.mock("@/modules/auth/application/queries/get-session-user", () => ({
  getSessionUser: getSessionUserMock,
}));

nextAuthMock.mockImplementation((config) => {
  return {
    handlers: { GET: vi.fn(), POST: vi.fn() },
    auth: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
    __config: config,
  };
});

describe("auth.ts adapter wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    authenticateWithOTPMock.mockResolvedValue({
      id: "user-authenticate",
      email: "user@example.com",
      name: "User",
      image: null,
    });
    isAuthSignInAllowedMock.mockResolvedValue(true);
    getSessionUserMock.mockResolvedValue({
      id: "db-user",
      email: "db@example.com",
      name: "DB User",
      image: "db-image",
    });
  });

  async function loadAuthOptions() {
    vi.doUnmock("@/auth");
    const authModule = await import("@/auth");
    const authOptions = nextAuthMock.mock.calls.at(-1)?.[0];
    return { authModule, authOptions };
  }

  it("delegates authorize to authenticateWithOTP", async () => {
    const { authOptions } = await loadAuthOptions();
    const otpProvider = authOptions?.providers?.find?.(
      (provider: { id?: string }) => provider.id === "otp"
    );

    const request = { headers: new Headers({ "x-forwarded-for": "127.0.0.1" }) };
    const result = await otpProvider?.authorize?.(
      { email: "user@example.com", otp: "123456", locale: "zh" },
      request
    );

    expect(authenticateWithOTPMock).toHaveBeenCalledWith({
      email: "user@example.com",
      otp: "123456",
      locale: "zh",
      requestHeaders: request.headers,
    });
    expect(result).toMatchObject({ email: "user@example.com" });
  });

  it("delegates createUser events to the auth user-created use case", async () => {
    const { authModule, authOptions } = await loadAuthOptions();
    const createUserEvent = authOptions?.events?.createUser as
      | ((params: { user: { id?: string | null } }) => Promise<void>)
      | undefined;

    expect(authModule).toBeDefined();
    expect(createUserEvent).toBeTypeOf("function");

    await createUserEvent?.({ user: { id: "user-create" } });

    expect(handleAuthUserCreatedMock).toHaveBeenCalledWith({ userId: "user-create" });
  });

  it("delegates signIn events to the auth user-signed-in use case", async () => {
    const { authOptions } = await loadAuthOptions();
    const signInEvent = authOptions?.events?.signIn as
      | ((params: {
          user: { id?: string | null; email?: string | null; locale?: string | null };
          isNewUser?: boolean;
        }) => Promise<void>)
      | undefined;

    await signInEvent?.({
      user: { id: "user-signin", email: "user@example.com", locale: "en" },
      isNewUser: false,
    });

    expect(handleAuthUserSignedInMock).toHaveBeenCalledWith({
      userId: "user-signin",
      email: "user@example.com",
      locale: "en",
      isNewUser: false,
    });
  });

  it("delegates signIn callbacks to the auth sign-in guard use case", async () => {
    const { authOptions } = await loadAuthOptions();
    const signInCallback = authOptions?.callbacks?.signIn as
      | ((params: { user: { email?: string | null } }) => Promise<boolean>)
      | undefined;

    isAuthSignInAllowedMock.mockResolvedValueOnce(false);
    const result = await signInCallback?.({ user: { email: "blocked@example.com" } });

    expect(isAuthSignInAllowedMock).toHaveBeenCalledWith({ email: "blocked@example.com" });
    expect(result).toBe(false);
  });

  it("hydrates session data through the auth session query", async () => {
    const { authOptions } = await loadAuthOptions();
    const sessionCallback = authOptions?.callbacks?.session as
      | ((params: {
          session: {
            user?: {
              id?: string;
              email?: string | null;
              name?: string | null;
              image?: string | null;
            };
          };
          token: { sub?: string | null };
        }) => Promise<{
          user?: {
            id?: string;
            email?: string | null;
            name?: string | null;
            image?: string | null;
          };
        }>)
      | undefined;

    const result = await sessionCallback?.({
      session: { user: { id: "session-user", email: "old@example.com", name: "Old", image: null } },
      token: { sub: "db-user" },
    });

    expect(getSessionUserMock).toHaveBeenCalledWith("db-user");
    expect(result).toEqual({
      user: {
        id: "db-user",
        email: "db@example.com",
        name: "DB User",
        image: "db-image",
      },
    });
  });

  it("rethrows missing-user session errors from the auth session query", async () => {
    const { authOptions } = await loadAuthOptions();
    const sessionCallback = authOptions?.callbacks?.session as
      | ((params: {
          session: {
            user?: {
              id?: string;
              email?: string | null;
              name?: string | null;
              image?: string | null;
            };
          };
          token: { sub?: string | null };
        }) => Promise<unknown>)
      | undefined;

    getSessionUserMock.mockRejectedValueOnce(new UnauthorizedError("User not found in database"));

    await expect(
      sessionCallback?.({
        session: {
          user: { id: "session-user", email: "old@example.com", name: "Old", image: null },
        },
        token: { sub: "missing-user" },
      })
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
