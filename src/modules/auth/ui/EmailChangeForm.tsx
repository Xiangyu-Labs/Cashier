"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { sendEmailChangeCodeAction, verifyEmailChangeCodeAction } from "../actions";
import { Button } from "@/components/ui/button";

export function EmailChangeForm({ currentEmail, onChanged }: { currentEmail: string; onChanged?: (email: string) => void }) {
  const t = useTranslations("Settings.Account");
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  const send = async () => {
    setPending(true);
    try {
      await sendEmailChangeCodeAction(email, locale);
      setSent(true);
      toast.success(t("emailCodeSent"));
    } catch { toast.error(t("emailChangeError")); } finally { setPending(false); }
  };
  const verify = async () => {
    setPending(true);
    try {
      const result = await verifyEmailChangeCodeAction(email, code);
      toast.success(t("emailChanged"));
      onChanged?.(result.email);
      setEmail(""); setCode(""); setSent(false);
    } catch { toast.error(t("emailChangeError")); } finally { setPending(false); }
  };

  return (
    <div className="w-full max-w-sm space-y-2" data-tab-swipe-ignore>
      <div className="flex items-center gap-2 text-sm text-muted-foreground"><Mail className="h-4 w-4" />{currentEmail}</div>
      <div className="flex gap-2">
        <input type="email" value={email} onChange={(event) => { setEmail(event.target.value); setSent(false); }} placeholder={t("newEmail")} disabled={pending} className="min-h-11 min-w-0 flex-1 rounded-md border border-border bg-bg px-3 text-sm" />
        <Button variant="outline" disabled={pending || email.trim() === ""} onClick={send}>{pending && !sent ? <Loader2 className="h-4 w-4 animate-spin" /> : t(sent ? "resendCode" : "sendCode")}</Button>
      </div>
      {sent && <div className="flex gap-2">
        <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder={t("verificationCode")} disabled={pending} className="min-h-11 min-w-0 flex-1 rounded-md border border-border bg-bg px-3 text-sm" />
        <Button disabled={pending || code.length !== 6} onClick={verify}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("verifyEmail")}</Button>
      </div>}
    </div>
  );
}
