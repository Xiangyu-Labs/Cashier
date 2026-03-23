"use client";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail, Loader2 } from "lucide-react";
import { publicEnv } from "@/lib/env/public";
import { SSOButton } from "./sso-button";

interface EmailStepProps {
  callbackUrl: string;
  email: string;
  isLoading: boolean;
  error: string | null;
  onEmailChange: (email: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function EmailStep({
  callbackUrl,
  email,
  isLoading,
  error,
  onEmailChange,
  onSubmit,
}: EmailStepProps) {
  const t = useTranslations("Auth");

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium text-text">
            {t("email")}
          </label>
          <Input
            id="email"
            type="email"
            placeholder={t("emailPlaceholder")}
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            required
            disabled={isLoading}
            className="h-11"
            autoComplete="email"
            autoFocus
          />
        </div>
        {error != null && (
          <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
        )}
        <Button type="submit" className="w-full h-11" disabled={isLoading || email === ""}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("sending")}
            </>
          ) : (
            <>
              <Mail className="mr-2 h-4 w-4" />
              {t("sendVerificationCode")}
            </>
          )}
        </Button>
      </form>

      <SSOSection callbackUrl={callbackUrl} />
    </div>
  );
}

function SSOSection({ callbackUrl }: { callbackUrl: string }) {
  const t = useTranslations("Auth");

  const isSSOEnabled = publicEnv.oidcEnabled;

  if (!isSSOEnabled) {
    return null;
  }

  return (
    <div className="pt-2">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs uppercase text-muted-foreground">{t("orContinueWith")}</span>
        <div className="h-px flex-1 bg-border" />
      </div>
      <div className="mt-4">
        <SSOButton callbackUrl={callbackUrl} />
      </div>
    </div>
  );
}
