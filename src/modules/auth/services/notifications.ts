import { logger } from "@/lib/logger";
import { logIdentifier } from "@/lib/security/log-identifier";
import LoginNotificationEmail from "@/emails/login-notification-email";
import { resolveSupportedLocale } from "@/i18n/resolve-locale";
import type { SupportedLocale } from "@/i18n/locales";
import { runtimeEnv } from "@/lib/env/runtime";
import { DEFAULT_AUTH_EMAIL_FROM } from "@/lib/utils/email";
import type { EmailDeliveryPort } from "@/application/contracts";

type LoginAuthEmailMessages = {
  loginSubject: string;
  loginPreview: string;
  loginHeading: string;
  loginIntro: string;
  loginTimeLabel: string;
  loginEmailLabel: string;
  loginSafe: string;
  loginWarn: string;
};

async function getLoginNotificationCopy(locale: SupportedLocale) {
  const messages = (await import(`../../../../messages/${locale}.json`)).default as {
    AuthEmail: LoginAuthEmailMessages;
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
export async function sendLoginNotification(
  params: {
    email: string;
    locale?: string;
  },
  emailDelivery: EmailDeliveryPort
): Promise<void> {
  const locale = resolveSupportedLocale({ explicitLocale: params.locale ?? null });

  try {
    const loginTime = new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: runtimeEnv.timeZone,
    }).format(new Date());

    const { subject, copy } = await getLoginNotificationCopy(locale);

    const delivery = await emailDelivery.send({
      from: runtimeEnv.authEmailFrom ?? DEFAULT_AUTH_EMAIL_FROM,
      to: params.email,
      subject,
      content: LoginNotificationEmail({
        locale,
        email: params.email,
        loginTime,
        copy,
      }),
    });

    if (delivery === "not_configured") {
      logger.warn("AUTH_RESEND_KEY not configured, skipping login notification");
      return;
    }

    logger.info({ subject: logIdentifier("email", params.email) }, "Login notification sent");
  } catch (error) {
    // Don't fail the login if notification fails
    logger.error(
      { error, subject: logIdentifier("email", params.email) },
      "Failed to send login notification"
    );
  }
}
