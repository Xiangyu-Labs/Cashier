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
  usePathname: () => "/login",
}));

vi.mock("@/modules/auth/actions", () => ({
  sendOTPAction: sendOTPActionMock,
}));

import { useLoginFlow } from "@/modules/auth/hooks/use-login-flow";
import { useLoginDraftStore } from "@/modules/auth/login-draft-store";

const t = (key: string) => key;
function createEmailSubmitEvent(email: string): React.FormEvent<HTMLFormElement> {
  const form = document.createElement("form");
  const emailInput = document.createElement("input");
  emailInput.name = "email";
  emailInput.value = email;
  form.append(emailInput);
  return {
    preventDefault: vi.fn(),
    currentTarget: form,
  } as unknown as React.FormEvent<HTMLFormElement>;
}

function createPasswordSubmitEvent(
  email: string,
  password: string
): React.FormEvent<HTMLFormElement> {
  const form = document.createElement("form");
  const emailInput = document.createElement("input");
  emailInput.name = "email";
  emailInput.value = email;
  const passwordInput = document.createElement("input");
  passwordInput.name = "password";
  passwordInput.value = password;
  form.append(emailInput, passwordInput);
  return {
    preventDefault: vi.fn(),
    currentTarget: form,
  } as unknown as React.FormEvent<HTMLFormElement>;
}

describe("useLoginFlow OTP sending", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useLoginDraftStore.getState().reset();
    window.history.replaceState({}, "", "/login");
  });

  it("shows the rate-limit message and stays on the email step", async () => {
    sendOTPActionMock.mockResolvedValue({
      ok: false,
      code: "rate_limited",
      retryAfter: 42,
    });
    const { result } = renderHook(() => useLoginFlow(t));

    act(() => result.current.setEmail("user@example.com"));
    await act(() => result.current.handleSendOTP(createEmailSubmitEvent("user@example.com")));

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
    await act(() => result.current.handleSendOTP(createEmailSubmitEvent("user@example.com")));

    expect(window.location.search).toBe("?authMode=otp&authStep=otp");
    expect(result.current.expiresAt).toBe(1_800_000_000);
    expect(result.current.canResendAt).toBe(1_799_999_760);
    expect(result.current.error).toBeNull();
  });

  it("enters the OTP step even when sessionStorage writes are restricted", async () => {
    sendOTPActionMock.mockResolvedValue({
      ok: true,
      expiresIn: 300,
      expiresAt: 1_800_000_000,
      canResendAt: 1_799_999_760,
    });
    const originalSetItem = sessionStorage.setItem;
    sessionStorage.setItem = () => {
      throw new Error("quota exceeded");
    };
    try {
      const { result } = renderHook(() => useLoginFlow(t));

      act(() => result.current.setEmail("user@example.com"));
      await act(() => result.current.handleSendOTP(createEmailSubmitEvent("user@example.com")));

      expect(window.location.search).toBe("?authMode=otp&authStep=otp");
      expect(result.current.error).toBeNull();
    } finally {
      sessionStorage.setItem = originalSetItem;
    }
  });

  it("starts in the requested login mode", () => {
    const { result } = renderHook(() => useLoginFlow(t, { initialMode: "otp" }));

    expect(result.current.mode).toBe("otp");
  });

  it("submits browser-filled password fields even when React state is empty", async () => {
    signInMock.mockResolvedValue({ ok: false, error: "CredentialsSignin" });
    const { result } = renderHook(() => useLoginFlow(t));

    await act(() =>
      result.current.handlePasswordLogin(
        createPasswordSubmitEvent("autofill@example.com", "autofilled-password")
      )
    );

    expect(signInMock).toHaveBeenCalledWith("password", {
      email: "autofill@example.com",
      password: "autofilled-password",
      locale: "en",
      redirect: false,
      callbackUrl: "/",
    });
    expect(result.current.email).toBe("autofill@example.com");
    expect(result.current.password).toBe("");
  });
});
