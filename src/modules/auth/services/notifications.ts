import { Resend } from "resend";
import { logger } from "@/lib/logger";
import LoginNotificationEmail from "@/emails/login-notification-email";
import { resolveSupportedLocale } from "@/i18n/resolve-locale";
import type { SupportedLocale } from "@/i18n/locales";
import { DEFAULT_AUTH_EMAIL_FROM } from "@/lib/utils/email";

function getResendClient(): Resend | null {
  const apiKey = process.env.AUTH_RESEND_KEY;
  if (apiKey == null || apiKey === "") {
    return null;
  }

  return new Resend(apiKey);
}

async function getLoginNotificationCopy(locale: SupportedLocale) {
  const messages = (await import(`../../../../messages/${locale}.json`)).default as {
    AuthEmail: Record<string, string>;
  };
  const t = messages.AuthEmail;
  return {
    subject: t.loginSubject,
    copy: {
      preview: t.loginPreview,
      heading: t.loginHeading,
      intro: t.loginIntro,
      timeLabel: t.loginTimeLabel,
      emailLabel: t.loginEmailLabel,
      safeMessage: t.loginSafe,
      warningMessage: t.loginWarn,
    },
  };
}

/**
 * Send a notification email when a user logs in from a new device
 */
export async function sendLoginNotification(params: {
  email: string;
  locale?: string;
}): Promise<void> {
  const resend = getResendClient();
  if (resend == null) {
    logger.warn("AUTH_RESEND_KEY not configured, skipping login notification");
    return;
  }

  const locale = resolveSupportedLocale({ explicitLocale: params.locale });

  try {
    const loginTime = new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: process.env.TZ ?? "Asia/Shanghai",
    }).format(new Date());

    const { subject, copy } = await getLoginNotificationCopy(locale);

    await resend.emails.send({
      from: process.env.AUTH_EMAIL_FROM ?? DEFAULT_AUTH_EMAIL_FROM,
      to: params.email,
      subject,
      react: LoginNotificationEmail({
        locale,
        email: params.email,
        loginTime,
        copy,
      }),
    });

    logger.info({ email: params.email }, "Login notification sent");
  } catch (error) {
    // Don't fail the login if notification fails
    logger.error({ error, email: params.email }, "Failed to send login notification");
  }
}
