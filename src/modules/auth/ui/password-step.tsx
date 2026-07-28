"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PasswordStepProps {
  email: string;
  password: string;
  isLoading: boolean;
  error: string | null;
  onEmailChange: (email: string) => void;
  onPasswordChange: (password: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

export function PasswordStep(props: PasswordStepProps) {
  const t = useTranslations("Auth");
  const [visible, setVisible] = useState(false);

  return (
    <form onSubmit={props.onSubmit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium text-text">
          {t("email")}
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          value={props.email}
          onChange={(event) => props.onEmailChange(event.target.value)}
          placeholder={t("emailPlaceholder")}
          autoComplete="email"
          autoFocus
          required
          disabled={props.isLoading}
          className="h-11"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium text-text">
          {t("password")}
        </label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={visible ? "text" : "password"}
            value={props.password}
            onChange={(event) => props.onPasswordChange(event.target.value)}
            placeholder={t("passwordPlaceholder")}
            autoComplete="current-password"
            required
            disabled={props.isLoading}
            className="h-11 pr-12"
          />
          <button
            type="button"
            onClick={() => setVisible((value) => !value)}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            aria-label={visible ? t("hidePassword") : t("showPassword")}
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {props.error != null ? (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {props.error}
        </p>
      ) : null}
      <Button type="submit" className="h-11 w-full" disabled={props.isLoading}>
        {props.isLoading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <KeyRound className="mr-2 h-4 w-4" />
        )}
        {props.isLoading ? t("signingIn") : t("signIn")}
      </Button>
    </form>
  );
}
