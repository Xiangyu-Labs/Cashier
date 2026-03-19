import { beforeEach, describe, expect, it, vi } from "vitest";

const { nextAuthMock, ensureUserLedgerMock, sendLoginNotificationMock } = vi.hoisted(() => ({
  nextAuthMock: vi.fn(),
  ensureUserLedgerMock: vi.fn(),
  sendLoginNotificationMock: vi.fn(),
}));

vi.mock("next-auth", () => ({
  default: nextAuthMock,
}));

vi.mock("next-auth/providers/credentials", () => ({
  default: vi.fn((config) => config),
}));

vi.mock("@auth/drizzle-adapter", () => ({
  DrizzleAdapter: vi.fn(() => ({})),
}));

vi.mock("@/lib/db", () => ({
  db: {},
}));

vi.mock("@/persistence/schema/auth", () => ({
  users: {},
  accounts: {},
}));

vi.mock("@/modules/auth/services", () => ({
  authenticateWithOTP: vi.fn(),
  isRegistrationAllowed: vi.fn().mockResolvedValue(true),
  sendLoginNotification: sendLoginNotificationMock,
}));

vi.mock("@/modules/workspace/use-cases", () => ({
  ensureUserLedger: ensureUserLedgerMock,
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

describe("auth events single-ledger initialization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  async function loadAuthOptions() {
    vi.doUnmock("@/auth");
    const authModule = await import("@/auth");
    const authOptions = nextAuthMock.mock.calls.at(-1)?.[0];
    return { authModule, authOptions };
  }

  it("calls ensureUserLedger on createUser when user id exists", async () => {
    const { authModule, authOptions } = await loadAuthOptions();
    const createUserEvent = authOptions?.events?.createUser as
      | ((params: { user: { id?: string | null } }) => Promise<void>)
      | undefined;

    expect(authModule).toBeDefined();
    expect(createUserEvent).toBeTypeOf("function");

    await createUserEvent?.({ user: { id: "user-create" } });

    expect(ensureUserLedgerMock).toHaveBeenCalledWith({ userId: "user-create" });
    expect(sendLoginNotificationMock).not.toHaveBeenCalled();
  });

  it("does not call ensureUserLedger on createUser when id is missing", async () => {
    const { authOptions } = await loadAuthOptions();
    const createUserEvent = authOptions?.events?.createUser as
      | ((params: { user: { id?: string | null } }) => Promise<void>)
      | undefined;

    await createUserEvent?.({ user: { id: "" } });

    expect(ensureUserLedgerMock).not.toHaveBeenCalled();
  });

  it("calls ensureUserLedger and notification for existing-user signIn", async () => {
    const { authOptions } = await loadAuthOptions();
    const signInEvent = authOptions?.events?.signIn as
      | ((params: { user: { id?: string | null; email?: string | null }; isNewUser?: boolean }) => Promise<void>)
      | undefined;

    await signInEvent?.({
      user: { id: "user-signin", email: "user@example.com" },
      isNewUser: false,
    });

    expect(ensureUserLedgerMock).toHaveBeenCalledWith({ userId: "user-signin" });
    expect(sendLoginNotificationMock).toHaveBeenCalledWith("user@example.com");
  });

  it("skips ensureUserLedger for new-user signIn", async () => {
    const { authOptions } = await loadAuthOptions();
    const signInEvent = authOptions?.events?.signIn as
      | ((params: { user: { id?: string | null; email?: string | null }; isNewUser?: boolean }) => Promise<void>)
      | undefined;

    await signInEvent?.({
      user: { id: "user-signin", email: "user@example.com" },
      isNewUser: true,
    });

    expect(ensureUserLedgerMock).not.toHaveBeenCalled();
    expect(sendLoginNotificationMock).not.toHaveBeenCalled();
  });

  it("skips signIn side effects when email is missing", async () => {
    const { authOptions } = await loadAuthOptions();
    const signInEvent = authOptions?.events?.signIn as
      | ((params: { user: { id?: string | null; email?: string | null }; isNewUser?: boolean }) => Promise<void>)
      | undefined;

    await signInEvent?.({
      user: { id: "user-signin", email: "" },
      isNewUser: false,
    });

    expect(ensureUserLedgerMock).not.toHaveBeenCalled();
    expect(sendLoginNotificationMock).not.toHaveBeenCalled();
  });
});
