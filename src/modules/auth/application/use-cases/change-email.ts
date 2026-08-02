import type { EmailDeliveryPort } from "@/application/contracts";
import OTPEmail from "@/emails/otp-email";
import { ConflictError, RateLimitError, UnauthorizedError, ValidationError } from "@/lib/errors";
import { runtimeEnv } from "@/lib/env/runtime";
import { DEFAULT_AUTH_EMAIL_FROM } from "@/lib/utils/email";
import type { SupportedLocale } from "@/i18n/locales";
import { generateOTP, getOTPExpiration, hashOTP, isValidOTPFormat } from "../../services/otp";
import type { AccountSecurityPort } from "../ports";

export async function sendEmailChangeCode(
  input: {
    userId: string;
    newEmail: string;
    locale: SupportedLocale;
    host: string;
  },
  dependencies: { emailDelivery: EmailDeliveryPort; accounts: AccountSecurityPort }
) {
  const { userId, newEmail } = input;
  if (runtimeEnv.authResendKey == null)
    throw new ValidationError("Email delivery is not configured");

  const otp = generateOTP();
  const tokenHash = hashOTP(otp);
  const expiresAt = getOTPExpiration();
  const challenge = await dependencies.accounts.createEmailChangeChallenge({
    userId,
    newEmail,
    tokenHash,
    expiresAt,
    now: new Date(),
    minimumIntervalMs: 60_000,
  });
  if (challenge === "unauthorized") throw new UnauthorizedError();
  if (challenge === "same_email") throw new ValidationError("New email must be different");
  if (challenge === "duplicate") throw new ConflictError("Email is already in use");
  if (challenge === "rate_limited") {
    throw new RateLimitError("Please wait before requesting another code", 60);
  }

  const zh = input.locale.startsWith("zh");
  const delivery = await dependencies.emailDelivery.send({
    from: runtimeEnv.authEmailFrom ?? DEFAULT_AUTH_EMAIL_FROM,
    to: newEmail,
    subject: zh ? `修改邮箱验证码：${otp}` : `Email change code: ${otp}`,
    content: OTPEmail({
      otp,
      host: input.host,
      expiresInMinutes: 5,
      locale: input.locale,
      copy: zh
        ? {
            preview: "验证新邮箱",
            heading: "验证新邮箱",
            intro: "输入以下验证码以完成邮箱修改。",
            codeLabel: "验证码",
            expiry: "验证码将在 5 分钟后失效。",
            warning: "如果不是你发起的操作，请忽略此邮件。",
            footer: "Cashier 账户安全",
          }
        : {
            preview: "Verify your new email",
            heading: "Verify your new email",
            intro: "Enter this code to finish changing your email address.",
            codeLabel: "Verification code",
            expiry: "This code expires in 5 minutes.",
            warning: "Ignore this email if you did not request this change.",
            footer: "Cashier account security",
          },
    }),
  });
  if (delivery !== "sent") {
    await dependencies.accounts.discardEmailChangeChallenge({ userId, newEmail, tokenHash });
    throw new ValidationError("Email delivery is not configured");
  }
  return { newEmail, expiresAt: expiresAt.getTime() };
}

export async function verifyEmailChangeCode(
  userId: string,
  newEmail: string,
  otp: string,
  accounts: AccountSecurityPort
) {
  if (!isValidOTPFormat(otp)) throw new ValidationError("Invalid verification code");
  const outcome = await accounts.verifyEmailChangeChallenge({
    userId,
    newEmail,
    otp,
    now: new Date(),
  });
  if (outcome.status === "verified") return { email: outcome.email };
  if (outcome.status === "not_found") throw new ValidationError("Verification challenge not found");
  if (outcome.status === "locked") throw new RateLimitError("Verification is locked");
  if (outcome.status === "expired") throw new ValidationError("Verification code expired");
  if (outcome.status === "duplicate") throw new ConflictError("Email is already in use");
  if (outcome.status !== "incorrect") throw new ValidationError("Verification failed");
  if (outcome.locked) throw new RateLimitError("Too many incorrect attempts");
  throw new ValidationError("Incorrect verification code", {
    attemptsRemaining: outcome.attemptsRemaining,
  });
}
