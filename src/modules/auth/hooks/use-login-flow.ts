"use client";

import { useState } from "react";
import { signIn, type SignInResponse } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";
import { sendOTPAction } from "@/modules/auth/actions";
import type { SendOTPActionResult } from "@/modules/auth/server-actions/send-otp";
import { OTP_LENGTH } from "@/modules/auth/constants";

type LoginStep = "email" | "otp";
export type LoginMode = "password" | "otp";

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
  const searchParams = useSearchParams();
  const locale = useLocale();
  const callbackUrl = sanitizeCallbackUrl(searchParams.get("callbackUrl"));
  const [mode, setModeState] = useState<LoginMode>(initialMode);
  const [step, setStep] = useState<LoginStep>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [canResendAt, setCanResendAt] = useState<number | null>(null);

  const setMode = (nextMode: LoginMode) => {
    setModeState(nextMode);
    setStep("email");
    setOtp("");
    setPassword("");
    setError(null);
  };

  const finishSignIn = (result: SignInResponse | undefined) => {
    if (result?.ok) {
      router.push(callbackUrl);
      router.refresh();
      return true;
    }
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
      setExpiresAt(result.expiresAt ?? null);
      setCanResendAt(result.canResendAt ?? null);
      setStep("otp");
    } catch {
      setError(t("unexpectedError"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
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
    setError(null);
    setOtp("");
    try {
      const result = await sendOTPAction(email, locale);
      if (!result.ok) {
        setError(getSendOTPErrorMessage(result, t, "resendFailed"));
        return;
      }
      setExpiresAt(result.expiresAt ?? null);
      setCanResendAt(result.canResendAt ?? null);
    } catch {
      setError(t("resendFailed"));
    }
  };

  const handleChangeEmail = () => {
    setStep("email");
    setOtp("");
    setError(null);
    setExpiresAt(null);
    setCanResendAt(null);
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
    isDevAuthAvailable,
    setMode,
    setEmail,
    setPassword,
    setOtp,
    handlePasswordLogin,
    handleSendOTP,
    handleVerifyOTP,
    handleResendOTP,
    handleChangeEmail,
    handleOTPExpired: () => setError(t("codeExpiredMessage")),
    handleDevSignIn,
  };
}
