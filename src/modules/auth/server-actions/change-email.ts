"use server";

import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { auth } from "@/auth";
import { currentApplication } from "@/application/current";
import OTPEmail from "@/emails/otp-email";
import { resolveSupportedLocale } from "@/i18n/resolve-locale";
import { db } from "@/lib/db";
import { ConflictError, RateLimitError, UnauthorizedError, ValidationError } from "@/lib/errors";
import { runtimeEnv } from "@/lib/env/runtime";
import { DEFAULT_AUTH_EMAIL_FROM, normalizeEmail } from "@/lib/utils/email";
import { emailChangeChallenges, users } from "@/persistence";
import { parseSendOTPEmail } from "../contract-schemas";
import { generateOTP, getLockoutExpiration, getMaxAttempts, getOTPExpiration, hashOTP, isValidOTPFormat, verifyOTP } from "../services/otp";

async function requireUserId() {
  const session = await auth();
  const userId = session?.user?.id;
  if (userId == null || userId === "") throw new UnauthorizedError();
  return userId;
}

export async function sendEmailChangeCodeAction(inputEmail: string, locale?: string) {
  const userId = await requireUserId();
  const newEmail = normalizeEmail(parseSendOTPEmail(inputEmail));
  const [current, duplicate, existingChallenge] = await Promise.all([
    db.query.users.findFirst({ where: and(eq(users.id, userId), isNull(users.deletedAt)) }),
    db.query.users.findFirst({ where: and(eq(users.email, newEmail), ne(users.id, userId), isNull(users.deletedAt)) }),
    db.query.emailChangeChallenges.findFirst({ where: eq(emailChangeChallenges.userId, userId) }),
  ]);
  if (current == null) throw new UnauthorizedError();
  if (current.email === newEmail) throw new ValidationError("New email must be different");
  if (duplicate != null) throw new ConflictError("Email is already in use");
  if (existingChallenge != null && Date.now() - existingChallenge.createdAt.getTime() < 60_000) {
    throw new RateLimitError("Please wait before requesting another code", 60);
  }
  if (runtimeEnv.authResendKey == null) throw new ValidationError("Email delivery is not configured");

  const otp = generateOTP();
  const tokenHash = hashOTP(otp);
  const expiresAt = getOTPExpiration();
  await db.insert(emailChangeChallenges).values({ userId, newEmail, tokenHash, expiresAt })
    .onConflictDoUpdate({
      target: emailChangeChallenges.userId,
      set: { newEmail, tokenHash, expiresAt, attempts: 0, lockedUntil: null, createdAt: new Date(), lastAttemptAt: null },
    });

  const requestHeaders = await headers();
  const cookieStore = await cookies();
  const resolvedLocale = resolveSupportedLocale({
    explicitLocale: locale ?? null,
    cookieLocale: cookieStore.get("NEXT_LOCALE")?.value ?? null,
    acceptLanguage: requestHeaders.get("accept-language"),
  });
  const zh = resolvedLocale.startsWith("zh");
  const delivery = await currentApplication.email.send({
    from: runtimeEnv.authEmailFrom ?? DEFAULT_AUTH_EMAIL_FROM,
    to: newEmail,
    subject: zh ? `修改邮箱验证码：${otp}` : `Email change code: ${otp}`,
    content: OTPEmail({
      otp,
      host: requestHeaders.get("host") ?? "Cashier",
      expiresInMinutes: 5,
      locale: resolvedLocale,
      copy: zh
        ? { preview: "验证新邮箱", heading: "验证新邮箱", intro: "输入以下验证码以完成邮箱修改。", codeLabel: "验证码", expiry: "验证码将在 5 分钟后失效。", warning: "如果不是你发起的操作，请忽略此邮件。", footer: "Cashier 账户安全" }
        : { preview: "Verify your new email", heading: "Verify your new email", intro: "Enter this code to finish changing your email address.", codeLabel: "Verification code", expiry: "This code expires in 5 minutes.", warning: "Ignore this email if you did not request this change.", footer: "Cashier account security" },
    }),
  });
  if (delivery !== "sent") {
    await db.delete(emailChangeChallenges).where(and(eq(emailChangeChallenges.userId, userId), eq(emailChangeChallenges.newEmail, newEmail)));
    throw new ValidationError("Email delivery is not configured");
  }
  return { newEmail, expiresAt: expiresAt.getTime() };
}

export async function verifyEmailChangeCodeAction(inputEmail: string, otp: string) {
  const userId = await requireUserId();
  const newEmail = normalizeEmail(parseSendOTPEmail(inputEmail));
  if (!isValidOTPFormat(otp)) throw new ValidationError("Invalid verification code");

  const outcome = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from email_change_challenges where user_id = ${userId} for update`);
    const challenge = await tx.query.emailChangeChallenges.findFirst({
      where: and(eq(emailChangeChallenges.userId, userId), eq(emailChangeChallenges.newEmail, newEmail)),
    });
    if (challenge == null) throw new ValidationError("Verification challenge not found");
    if (challenge.lockedUntil != null && challenge.lockedUntil > new Date()) throw new RateLimitError("Verification is locked");
    if (challenge.expiresAt <= new Date()) throw new ValidationError("Verification code expired");
    if (!verifyOTP(otp, challenge.tokenHash)) {
      const attempts = challenge.attempts + 1;
      const lockedUntil = attempts >= getMaxAttempts() ? getLockoutExpiration() : null;
      await tx.update(emailChangeChallenges).set({ attempts, lockedUntil, lastAttemptAt: new Date() }).where(eq(emailChangeChallenges.id, challenge.id));
      return lockedUntil != null
        ? { ok: false as const, locked: true, attemptsRemaining: 0 }
        : { ok: false as const, locked: false, attemptsRemaining: getMaxAttempts() - attempts };
    }
    const duplicate = await tx.query.users.findFirst({ where: and(eq(users.email, newEmail), ne(users.id, userId), isNull(users.deletedAt)) });
    if (duplicate != null) throw new ConflictError("Email is already in use");
    await tx.update(users).set({ email: newEmail, emailVerified: new Date(), updatedAt: new Date() }).where(and(eq(users.id, userId), isNull(users.deletedAt)));
    await tx.delete(emailChangeChallenges).where(eq(emailChangeChallenges.id, challenge.id));
    return { ok: true as const, email: newEmail };
  });
  if (!outcome.ok) {
    if (outcome.locked) throw new RateLimitError("Too many incorrect attempts");
    throw new ValidationError("Incorrect verification code", { attemptsRemaining: outcome.attemptsRemaining });
  }
  return { email: outcome.email };
}
