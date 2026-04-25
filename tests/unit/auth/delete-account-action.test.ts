import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, deleteAccountUseCaseMock, signOutMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  deleteAccountUseCaseMock: vi.fn(),
  signOutMock: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: authMock,
  signOut: signOutMock,
}));

vi.mock("@/modules/auth/use-cases", () => ({
  deleteAccount: deleteAccountUseCaseMock,
  sendOTP: vi.fn(),
}));

import { deleteAccount } from "@/modules/auth/actions";

describe("deleteAccount action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "user-delete" } });
    deleteAccountUseCaseMock.mockResolvedValue(undefined);
    signOutMock.mockResolvedValue(undefined);
  });

  it("deletes the current account and signs out", async () => {
    await deleteAccount("test@example.com", "123456");

    expect(deleteAccountUseCaseMock).toHaveBeenCalledWith({
      userId: "user-delete",
      email: "test@example.com",
      otp: "123456",
    });
    expect(signOutMock).toHaveBeenCalledWith({ redirectTo: "/" });
  });

  it("does not sign out when account deletion fails", async () => {
    const error = new Error("delete failed");
    deleteAccountUseCaseMock.mockRejectedValueOnce(error);

    await expect(deleteAccount("test@example.com", "123456")).rejects.toThrow(error);
    expect(signOutMock).not.toHaveBeenCalled();
  });
});
