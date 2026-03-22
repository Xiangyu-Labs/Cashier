import { beforeEach, describe, expect, it, vi } from "vitest";

const { nextAuthMock, drizzleAdapterMock } = vi.hoisted(() => ({
  nextAuthMock: vi.fn((config: unknown) => ({
    config,
    handlers: { GET: vi.fn(), POST: vi.fn() },
    auth: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
  })),
  drizzleAdapterMock: vi.fn(() => ({})),
}));

vi.mock("next-auth", () => ({
  default: nextAuthMock,
}));

vi.mock("@auth/drizzle-adapter", () => ({
  DrizzleAdapter: drizzleAdapterMock,
}));

vi.mock("@/modules/auth/use-cases", () => ({
  authenticateWithOTP: vi.fn(),
  handleAuthUserCreated: vi.fn(),
  handleAuthUserSignedIn: vi.fn(),
  isAuthSignInAllowed: vi.fn(async () => true),
}));

vi.mock("@/modules/auth/queries", () => ({
  getSessionUser: vi.fn(async (id: string) => ({
    id,
    email: "test@example.com",
    name: "Test User",
    image: null,
  })),
}));

describe("auth runtime config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env.OIDC_ISSUER;
    delete process.env.OIDC_CLIENT_ID;
    delete process.env.OIDC_CLIENT_SECRET;
    delete process.env.NEXT_PUBLIC_OIDC_BUTTON_NAME;
  });

  it("preserves verifyRequest in resolved auth pages", async () => {
    vi.doUnmock("@/auth");

    const authModule = await import("@/auth");

    expect(authModule.authOptions.pages).toEqual({
      signIn: "/login",
      verifyRequest: "/login/verify",
      error: "/login/error",
    });

    expect(nextAuthMock).toHaveBeenCalledTimes(1);
    expect(nextAuthMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        pages: expect.objectContaining({
          signIn: "/login",
          verifyRequest: "/login/verify",
          error: "/login/error",
        }),
      })
    );
  });

  it("uses NEXT_PUBLIC_OIDC_BUTTON_NAME for the OIDC provider label", async () => {
    vi.doUnmock("@/auth");
    process.env.OIDC_ISSUER = "https://sso.cashier.test";
    process.env.OIDC_CLIENT_ID = "cashier-web";
    process.env.OIDC_CLIENT_SECRET = "top-secret";
    process.env.NEXT_PUBLIC_OIDC_BUTTON_NAME = "Cashier SSO";

    await import("@/auth");

    const config = nextAuthMock.mock.calls[0]?.[0] as
      | { providers?: Array<{ name?: string }> }
      | undefined;

    expect(config?.providers?.[0]?.name).toBe("Cashier SSO");
  });
});
