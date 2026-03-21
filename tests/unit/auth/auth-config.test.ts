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
});
