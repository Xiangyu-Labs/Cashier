import { Resend } from "resend";
import { logger } from "@/lib/logger";

const resend = new Resend(process.env.AUTH_RESEND_KEY);

/**
 * Send a notification email when a user logs in from a new device
 */
export async function sendLoginNotification(email: string): Promise<void> {
  // Skip if no API key configured (e.g., in development)
  if (process.env.AUTH_RESEND_KEY == null || process.env.AUTH_RESEND_KEY === "") {
    logger.warn("AUTH_RESEND_KEY not configured, skipping login notification");
    return;
  }

  try {
    const loginTime = new Date().toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
    });

    await resend.emails.send({
      from: process.env.AUTH_EMAIL_FROM ?? "noreply@example.com",
      to: email,
      subject: "New login to your account",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>New Login Detected</h2>
          <p>We noticed a new login to your account:</p>
          <ul>
            <li><strong>Time:</strong> ${loginTime}</li>
            <li><strong>Email:</strong> ${email}</li>
          </ul>
          <p>If this was you, you can ignore this email.</p>
          <p>If you didn't log in, please secure your account immediately.</p>
        </div>
      `,
    });

    logger.info({ email }, "Login notification sent");
  } catch (error) {
    // Don't fail the login if notification fails
    logger.error({ error, email }, "Failed to send login notification");
  }
}
