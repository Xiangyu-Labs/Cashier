"use client";

import { useTranslations } from "next-intl";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { Link } from "@/i18n/routing";
import { useSearchParams } from "next/navigation";

// Auth.js error type mapping to translation keys
const ERROR_MESSAGES: Record<string, { title: string; desc: string }> = {
  OAuthCallback: { title: "errorOAuthCallback", desc: "errorOAuthCallbackDesc" },
  OAuthAccountNotLinked: {
    title: "errorOAuthAccountNotLinked",
    desc: "errorOAuthAccountNotLinkedDesc",
  },
  AccessDenied: { title: "errorAccessDenied", desc: "errorAccessDeniedDesc" },
  Configuration: { title: "errorConfiguration", desc: "errorConfigurationDesc" },
  // Default error
  Default: { title: "error", desc: "errorDesc" },
};

const CREDENTIALS_ERROR_MESSAGES: Record<string, { title: string; desc: string }> = {
  [AUTH_ERROR_CODES.REGISTRATION_DISABLED]: {
    title: "registrationDisabled",
    desc: "registrationDisabledDesc",
  },
  [AUTH_ERROR_CODES.OTP_INVALID]: {
    title: "error",
    desc: "verifyFailed",
  },
  [AUTH_ERROR_CODES.OTP_EXPIRED]: {
    title: "error",
    desc: "codeExpiredMessage",
  },
  [AUTH_ERROR_CODES.OTP_LOCKED]: {
    title: "rateLimited",
    desc: "otpLockedDesc",
  },
  [AUTH_ERROR_CODES.OTP_RATE_LIMITED]: {
    title: "rateLimited",
    desc: "rateLimitedDesc",
  },
};

export default function LoginErrorPage() {
  const t = useTranslations("Auth");
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const code = searchParams.get("code");

  const errorConfig =
    error === "CredentialsSignin"
      ? (code != null ? (CREDENTIALS_ERROR_MESSAGES[code] ?? ERROR_MESSAGES.Default) : ERROR_MESSAGES.Default)
      : error != null
        ? (ERROR_MESSAGES[error] ?? ERROR_MESSAGES.Default)
        : ERROR_MESSAGES.Default;

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="max-w-md w-full text-center">
        {/* Error Icon */}
        <div className="mb-8">
          <div className="w-20 h-20 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle className="w-10 h-10 text-destructive" />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-text mb-2">{t(errorConfig.title)}</h1>

        {/* Description */}
        <p className="text-muted mb-8">{t(errorConfig.desc)}</p>

        {/* Try Again Button */}
        <Link href="/login">
          <Button className="h-11 px-8">{t("tryAgain")}</Button>
        </Link>
      </div>
    </div>
  );
}
