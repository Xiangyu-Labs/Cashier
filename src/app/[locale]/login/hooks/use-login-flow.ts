"use client";

import { useState } from "react";
import { signIn, type SignInResponse } from "next-auth/react";
import { useRouter } from "@/i18n/routing";
import { useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";
import { sendOTPAction } from "@/modules/auth/actions";
import { OTP_LENGTH } from "@/modules/auth/constants";

type LoginStep = "email" | "otp";

interface UseLoginFlowReturn {
  step: LoginStep;
  email: string;
  otp: string;
  isLoading: boolean;
  error: string | null;
  expiresAt: number | null;
  canResendAt: number | null;
  setEmail: (email: string) => void;
  setOtp: (otp: string) => void;
  handleSendOTP: (e: React.FormEvent) => Promise<void>;
  handleVerifyOTP: () => Promise<void>;
  handleResendOTP: () => Promise<void>;
  handleChangeEmail: () => void;
  handleOTPExpired: () => void;
}

function getSignInErrorMessage(
  signInResult: SignInResponse | undefined,
  t: (key: string, values?: Record<string, string | number>) => string
): string {
  switch (signInResult?.code) {
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
    default:
      break;
  }

  if (signInResult?.error != null) {
    return t("errorDesc");
  }

  return t("unexpectedError");
}

export function useLoginFlow(
  t: (key: string, values?: Record<string, string | number>) => string
): UseLoginFlowReturn {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";

  const [step, setStep] = useState<LoginStep>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [canResendAt, setCanResendAt] = useState<number | null>(null);

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (email === "") return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await sendOTPAction(email);
      setExpiresAt(result.expiresAt ?? null);
      setCanResendAt(result.canResendAt ?? null);
      setStep("otp");
      setIsLoading(false);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(t("unexpectedError"));
      }
      setIsLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (otp === "" || otp.length !== OTP_LENGTH) {
      setError(t("invalidCode"));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const signInResult = await signIn("otp", {
        email,
        otp,
        locale,
        redirect: false,
        callbackUrl,
      });

      if (signInResult?.error != null) {
        setError(getSignInErrorMessage(signInResult, t));
        setIsLoading(false);
      } else if (signInResult?.ok) {
        router.push(callbackUrl);
        router.refresh();
      } else {
        setError(getSignInErrorMessage(signInResult, t));
        setIsLoading(false);
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(t("unexpectedError"));
      }
      setIsLoading(false);
    }
  };

  const handleResendOTP = async () => {
    setError(null);
    setOtp("");
    try {
      const result = await sendOTPAction(email);
      setExpiresAt(result.expiresAt ?? null);
      setCanResendAt(result.canResendAt ?? null);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(t("resendFailed"));
      }
    }
  };

  const handleChangeEmail = () => {
    setStep("email");
    setOtp("");
    setError(null);
    setExpiresAt(null);
    setCanResendAt(null);
  };

  const handleOTPExpired = () => {
    setError(t("codeExpiredMessage"));
  };

  return {
    step,
    email,
    otp,
    isLoading,
    error,
    expiresAt,
    canResendAt,
    setEmail,
    setOtp,
    handleSendOTP,
    handleVerifyOTP,
    handleResendOTP,
    handleChangeEmail,
    handleOTPExpired,
  };
}
