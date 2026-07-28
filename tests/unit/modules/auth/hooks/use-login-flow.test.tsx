import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendOTPActionMock, signInMock, pushMock, refreshMock } = vi.hoisted(() => ({
  sendOTPActionMock: vi.fn(),
  signInMock: vi.fn(),
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  signIn: signInMock,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next-intl", () => ({
  useLocale: () => "en",
}));

vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

vi.mock("@/modules/auth/actions", () => ({
  sendOTPAction: sendOTPActionMock,
}));

import { useLoginFlow } from "@/modules/auth/hooks/use-login-flow";

const t = (key: string) => key;
const submitEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;

describe("useLoginFlow OTP sending", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the rate-limit message and stays on the email step", async () => {
    sendOTPActionMock.mockResolvedValue({
      ok: false,
      code: "rate_limited",
      retryAfter: 42,
    });
    const { result } = renderHook(() => useLoginFlow(t));

    act(() => result.current.setEmail("user@example.com"));
    await act(() => result.current.handleSendOTP(submitEvent));

    expect(result.current.step).toBe("email");
    expect(result.current.error).toBe("rateLimitedDesc");
    expect(result.current.isLoading).toBe(false);
  });

  it("enters the OTP step only after a successful send", async () => {
    sendOTPActionMock.mockResolvedValue({
      ok: true,
      expiresIn: 300,
      expiresAt: 1_800_000_000,
      canResendAt: 1_799_999_760,
    });
    const { result } = renderHook(() => useLoginFlow(t));

    act(() => result.current.setEmail("user@example.com"));
    await act(() => result.current.handleSendOTP(submitEvent));

    expect(result.current.step).toBe("otp");
    expect(result.current.expiresAt).toBe(1_800_000_000);
    expect(result.current.canResendAt).toBe(1_799_999_760);
    expect(result.current.error).toBeNull();
  });
});
