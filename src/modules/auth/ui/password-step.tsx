"use client";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KeyRound, Loader2 } from "lucide-react";

interface PasswordStepProps {
  email: string;
  password: string;
  isLoading: boolean;
  error: string | null;
  onEmailChange: (email: string) => void;
  onPasswordChange: (password: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function PasswordStep({
  email,
  password,
  isLoading,
  error,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: PasswordStepProps) {
  const t = useTranslations("Auth");

  return (
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
      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium text-text">
          {t("password")}
        </label>
        <Input
          id="password"
          type="password"
          placeholder={t("passwordPlaceholder")}
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          required
          disabled={isLoading}
          className="h-11"
          autoComplete="current-password"
        />
      </div>
      {error != null && (
        <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}
      <Button
        type="submit"
        className="w-full h-11"
        disabled={isLoading || email === "" || password === ""}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("signingIn")}
          </>
        ) : (
          <>
            <KeyRound className="mr-2 h-4 w-4" />
            {t("signIn")}
          </>
        )}
      </Button>
    </form>
  );
}
