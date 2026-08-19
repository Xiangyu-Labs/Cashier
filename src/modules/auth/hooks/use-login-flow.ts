"use client";

import { useCallback, useEffect, useState } from "react";
import { signIn, type SignInResponse } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { usePathname } from "@/i18n/routing";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";
import { sendOTPAction } from "@/modules/auth/actions";
import type { SendOTPActionResult } from "@/modules/auth/server-actions/send-otp";
import { OTP_LENGTH } from "@/modules/auth/constants";
import { useLoginDraftStore } from "@/modules/auth/login-draft-store";

type LoginStep = "email" | "otp";
export type LoginMode = "password" | "otp";
const OTP_CONTEXT_KEY = "cashier:login-otp-context:v1";

interface StoredOtpContext {
  email: string;
  expiresAt: number;
  canResendAt: number;
}

function clearOtpContext(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(OTP_CONTEXT_KEY);
  } catch {
    // Storage is disabled or restricted; the login flow must still work.
  }
}

function storeOtpContext(context: StoredOtpContext): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(OTP_CONTEXT_KEY, JSON.stringify(context));
  } catch {
    // Best-effort persistence only: the in-memory draft store still drives the UI.
  }
}

function readOtpContext(): StoredOtpContext | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(OTP_CONTEXT_KEY);
    if (raw == null) return null;
    const stored = JSON.parse(raw) as Partial<StoredOtpContext>;
    if (
      typeof stored.email === "string" &&
      stored.email !== "" &&
      typeof stored.expiresAt === "number" &&
      typeof stored.canResendAt === "number"
    ) {
      return {
        email: stored.email,
        expiresAt: stored.expiresAt,
        canResendAt: stored.canResendAt,
      };
    }
  } catch {
    // Treat unreadable or malformed context as absent.
  }
  return null;
}

interface LoginFlowOptions {
  initialMode?: LoginMode;
  isDevAuthAvailable?: boolean;
}

function getSignInErrorMessage(
  result: SignInResponse | undefined,
  t: (key: string, values?: Record<string, string | number>) => string
): string {
  switch (result?.code) {
    case AUTH_ERROR_CODES.INVALID_CREDENTIALS:
      return t("invalidCredentials");
    case AUTH_ERROR_CODES.REGISTRATION_DISABLED:
      return t("registrationDisabledDesc");
    case AUTH_ERROR_CODES.OTP_INVALID:
      return t("verifyFailed");
    case AUTH_ERROR_CODES.OTP_EXPIRED:
      return t("codeExpiredMessage");
    case AUTH_ERROR_CODES.OTP_LOCKED:
      return t("otpLockedDesc");
    case AUTH_ERROR_CODES.OTP_RATE_LIMITED:
      return t("rateLimitedDesc");
    case AUTH_ERROR_CODES.PASSWORD_RATE_LIMITED:
      return t("rateLimitedDesc");
    case AUTH_ERROR_CODES.PASSWORD_RATE_LIMIT_UNAVAILABLE:
    case AUTH_ERROR_CODES.AUTH_RATE_LIMIT_UNAVAILABLE:
      return t("rateLimitUnavailableDesc");
    default:
      return result?.error != null ? t("errorDesc") : t("unexpectedError");
  }
}

function sanitizeCallbackUrl(value: string | null): string {
  return value != null && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function getSendOTPErrorMessage(
  result: Extract<SendOTPActionResult, { ok: false }>,
  t: (key: string, values?: Record<string, string | number>) => string,
  fallbackKey: "sendCodeFailed" | "resendFailed"
): string {
  if (result.code === "rate_limited") {
    return t("rateLimitedDesc");
  }
  if (result.code === "rate_limit_unavailable") {
    return t("rateLimitUnavailableDesc");
  }
  if (result.code === "unexpected") {
    return t("unexpectedError");
  }
  return t(fallbackKey);
}

export function useLoginFlow(
  t: (key: string, values?: Record<string, string | number>) => string,
  { initialMode = "password", isDevAuthAvailable = false }: LoginFlowOptions = {}
) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const callbackUrl = sanitizeCallbackUrl(searchParams.get("callbackUrl"));
  const rawMode = searchParams.get("authMode");
  const mode: LoginMode = rawMode === "password" || rawMode === "otp" ? rawMode : initialMode;
  const rawStep = searchParams.get("authStep");
  const step: LoginStep = mode === "otp" && rawStep === "otp" ? "otp" : "email";
  const email = useLoginDraftStore((state) => state.email);
  const password = useLoginDraftStore((state) => state.password);
  const otp = useLoginDraftStore((state) => state.otp);
  const resendPending = useLoginDraftStore((state) => state.resendPending);
  const otpExpired = useLoginDraftStore((state) => state.otpExpired);
  const expiresAt = useLoginDraftStore((state) => state.expiresAt);
  const canResendAt = useLoginDraftStore((state) => state.canResendAt);
  const setEmail = useLoginDraftStore((state) => state.setEmail);
  const setPassword = useLoginDraftStore((state) => state.setPassword);
  const setOtp = useLoginDraftStore((state) => state.setOtp);
  const setResendPending = useLoginDraftStore((state) => state.setResendPending);
  const setOtpExpiry = useLoginDraftStore((state) => state.setOtpExpiry);
  const setOtpExpired = useLoginDraftStore((state) => state.setOtpExpired);
  const resetDraft = useLoginDraftStore((state) => state.reset);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contextHydrated, setContextHydrated] = useState(false);

  const writeFlowUrl = useCallback(
    (nextMode: LoginMode, nextStep: LoginStep, replace = false) => {
      const params = new URLSearchParams(searchParams.toString());
      if (nextMode === initialMode) params.delete("authMode");
      else params.set("authMode", nextMode);
      if (nextStep === "email") params.delete("authStep");
      else params.set("authStep", nextStep);
      const query = params.toString();
      const url = query === "" ? pathname : `${pathname}?${query}`;
      const state = window.history.state ?? {};
      if (replace) window.history.replaceState(state, "", url);
      else window.history.pushState(state, "", url);
    },
    [initialMode, pathname, searchParams]
  );

  useEffect(() => {
    const invalidMode = rawMode != null && rawMode !== "password" && rawMode !== "otp";
    const invalidStep =
      rawStep != null &&
      ((rawStep !== "email" && rawStep !== "otp") || (mode === "password" && rawStep === "otp"));
    if (invalidMode || invalidStep || (mode === "password" && rawStep != null)) {
      writeFlowUrl(mode, "email", true);
    }
  }, [mode, rawMode, rawStep, writeFlowUrl]);

  useEffect(() => {
    if (rawStep !== "otp" || mode !== "otp") {
      setContextHydrated(true);
      return;
    }
    const stored = readOtpContext();
    const now = Math.floor(Date.now() / 1000);
    if (stored != null && stored.expiresAt > now) {
      setEmail(stored.email);
      setOtpExpiry(stored.expiresAt, stored.canResendAt);
    } else {
      clearOtpContext();
      writeFlowUrl("otp", "email", true);
    }
    setContextHydrated(true);
  }, [mode, rawStep, setEmail, setOtpExpiry, writeFlowUrl]);

  const setMode = (nextMode: LoginMode) => {
    if (resendPending) return;
    setError(null);
    clearOtpContext();
    setOtp("");
    writeFlowUrl(nextMode, "email");
  };

  const finishSignIn = (result: SignInResponse | undefined) => {
    if (result?.ok) {
      clearOtpContext();
      resetDraft();
      router.push(callbackUrl);
      router.refresh();
      return true;
    }
    if (result?.code === AUTH_ERROR_CODES.OTP_EXPIRED) setOtpExpired(true);
    setError(getSignInErrorMessage(result, t));
    setIsLoading(false);
    return false;
  };

  const handlePasswordLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const submittedEmail = formData.get("email");
    const submittedPassword = formData.get("password");
    if (typeof submittedEmail !== "string" || typeof submittedPassword !== "string") return;
    if (submittedEmail === "" || submittedPassword === "") return;

    setEmail(submittedEmail);
    setPassword(submittedPassword);
    setIsLoading(true);
    setError(null);
    try {
      finishSignIn(
        await signIn("password", {
          email: submittedEmail,
          password: submittedPassword,
          redirect: false,
          callbackUrl,
        })
      );
    } catch {
      setError(t("unexpectedError"));
      setIsLoading(false);
    }
  };

  const handleSendOTP = async (event: React.FormEvent) => {
    event.preventDefault();
    if (email === "") return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await sendOTPAction(email, locale);
      if (!result.ok) {
        setError(getSendOTPErrorMessage(result, t, "sendCodeFailed"));
        return;
      }
      setOtpExpiry(result.expiresAt ?? null, result.canResendAt ?? null);
      setOtp("");
      if (result.expiresAt != null && result.canResendAt != null) {
        storeOtpContext({ email, expiresAt: result.expiresAt, canResendAt: result.canResendAt });
      }
      writeFlowUrl("otp", "otp");
    } catch {
      setError(t("unexpectedError"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (otpExpired) {
      setError(t("verifyExpired"));
      return;
    }
    if (otp.length !== OTP_LENGTH) {
      setError(t("invalidCode"));
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      finishSignIn(await signIn("otp", { email, otp, locale, redirect: false, callbackUrl }));
    } catch {
      setError(t("unexpectedError"));
      setIsLoading(false);
    }
  };

  const handleResendOTP = async () => {
    if (resendPending) return;
    setError(null);
    setResendPending(true);
    try {
      const result = await sendOTPAction(email, locale);
      if (!result.ok) {
        setError(getSendOTPErrorMessage(result, t, "resendFailed"));
        return;
      }
      setOtpExpiry(result.expiresAt ?? null, result.canResendAt ?? null);
      setOtp("");
      setError(null);
      if (result.expiresAt != null && result.canResendAt != null) {
        storeOtpContext({ email, expiresAt: result.expiresAt, canResendAt: result.canResendAt });
      }
    } catch {
      setError(t("resendFailed"));
    } finally {
      setResendPending(false);
    }
  };

  const handleChangeEmail = () => {
    if (resendPending) return;
    setError(null);
    clearOtpContext();
    setOtp("");
    writeFlowUrl("otp", "email");
  };

  const handleDevSignIn = async () => {
    if (!isDevAuthAvailable) return;
    setIsLoading(true);
    setError(null);
    try {
      finishSignIn(await signIn("dev", { locale, redirect: false, callbackUrl }));
    } catch {
      setError(t("devSignInFailed"));
      setIsLoading(false);
    }
  };

  return {
    callbackUrl,
    mode,
    step,
    email,
    password,
    otp,
    isLoading,
    error,
    expiresAt,
    canResendAt,
    resendPending,
    otpExpired,
    contextHydrated,
    isDevAuthAvailable,
    setMode,
    setEmail: (nextEmail: string) => {
      if (nextEmail !== email) clearOtpContext();
      setEmail(nextEmail);
    },
    setPassword,
    setOtp,
    handlePasswordLogin,
    handleSendOTP,
    handleVerifyOTP,
    handleResendOTP,
    handleChangeEmail,
    handleOTPExpired: () => {
      setOtpExpired(true);
      setError(t("verifyExpired"));
    },
    handleDevSignIn,
  };
}
