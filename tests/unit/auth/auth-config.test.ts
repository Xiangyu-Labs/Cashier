import { beforeEach, describe, expect, it, vi } from "vitest";

const { nextAuthMock } = vi.hoisted(() => ({
  nextAuthMock: vi.fn((config: unknown) => ({
    config,
    handlers: { GET: vi.fn(), POST: vi.fn() },
    auth: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
  })),
}));

vi.mock("next-auth", () => ({
  default: nextAuthMock,
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
    process.env.OIDC_ISSUER = "https://sso.cashier.test";
    process.env.OIDC_CLIENT_ID = "cashier-web";
    process.env.OIDC_CLIENT_SECRET = "top-secret";
    process.env.NEXT_PUBLIC_OIDC_ENABLED = "true";
    process.env.NEXT_PUBLIC_OIDC_BUTTON_NAME = "Cashier SSO";
  });

  it("preserves resolved auth pages", async () => {
    vi.doUnmock("@/auth");

    const authModule = await import("@/auth");

    expect(authModule.authOptions.pages).toEqual({
      signIn: "/login",
      verifyRequest: "/login/verify",
      error: "/login/error",
    });

    expect(nextAuthMock).toHaveBeenCalledTimes(1);
  });

  it("registers only the email OTP credentials provider and no database adapter", async () => {
    vi.doUnmock("@/auth");

    await import("@/auth");

    const config = nextAuthMock.mock.calls[0]?.[0] as
      | {
          adapter?: unknown;
          providers?: Array<{ id?: string; name?: string; type?: string }>;
        }
      | undefined;

    expect(config?.adapter).toBeUndefined();
    expect(config?.providers).toHaveLength(1);
    expect(config?.providers?.[0]).toMatchObject({
      id: "otp",
      name: "OTP",
      type: "credentials",
    });
    expect(config?.providers?.map((provider) => provider.id)).toEqual(["otp"]);
  });
});
