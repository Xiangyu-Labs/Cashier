"use client";
import { useTranslations } from "next-intl";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { Link } from "@/i18n/routing";
import { useSearchParams } from "next/navigation";

export default function LoginErrorPage() {
  const t = useTranslations("Auth");
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const code = searchParams.get("code");
  const defaultMessage = { title: t("error"), desc: t("errorDesc") };
  const credentialsMessage = (() => {
    switch (code) {
      case AUTH_ERROR_CODES.REGISTRATION_DISABLED:
        return { title: t("registrationDisabled"), desc: t("registrationDisabledDesc") };
      case AUTH_ERROR_CODES.OTP_INVALID:
        return { title: t("error"), desc: t("verifyFailed") };
      case AUTH_ERROR_CODES.OTP_EXPIRED:
        return { title: t("error"), desc: t("codeExpiredMessage") };
      case AUTH_ERROR_CODES.OTP_LOCKED:
        return { title: t("rateLimited"), desc: t("otpLockedDesc") };
      case AUTH_ERROR_CODES.OTP_RATE_LIMITED:
      case AUTH_ERROR_CODES.PASSWORD_RATE_LIMITED:
        return { title: t("rateLimited"), desc: t("rateLimitedDesc") };
      case AUTH_ERROR_CODES.PASSWORD_RATE_LIMIT_UNAVAILABLE:
      case AUTH_ERROR_CODES.AUTH_RATE_LIMIT_UNAVAILABLE:
        return { title: t("error"), desc: t("rateLimitUnavailableDesc") };
      default:
        return defaultMessage;
    }
  })();
  const errorMessage = (() => {
    if (error === "CredentialsSignin") return credentialsMessage;
    switch (error) {
      case "AccessDenied":
        return { title: t("errorAccessDenied"), desc: t("errorAccessDeniedDesc") };
      case "Configuration":
        return { title: t("errorConfiguration"), desc: t("errorConfigurationDesc") };
      default:
        return defaultMessage;
    }
  })();

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
        <h1 className="text-2xl font-bold text-text mb-2">{errorMessage.title}</h1>

        {/* Description */}
        <p className="text-muted mb-8">{errorMessage.desc}</p>

        {/* Try Again Button */}
        <Link href="/login">
          <Button className="h-11 px-8">{t("tryAgain")}</Button>
        </Link>
      </div>
    </div>
  );
}
