/**
 * Normalize email address for consistent storage and comparison.
 * - Converts to lowercase
 * - Trims whitespace
 *
 * Note: This does NOT validate the email format, only normalizes it.
 * Use schema validation (Zod) for format validation.
 */
export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

const RAW_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Matches: "Display Name <addr@example.com>" - display name is anything except angle brackets
const MAILBOX_REGEX = /^[^<>\r\n]+<([^\s@>]+@[^\s@>]+\.[^\s@>]+)>$/;

/**
 * Default fallback sender for OTP and security notification emails.
 */
export const DEFAULT_AUTH_EMAIL_FROM = "Cashier <noreply@example.com>";

/**
 * Validate that a string is a safe AUTH_EMAIL_FROM value.
 * Accepts bare email addresses and "Display Name <email>" mailbox format.
 * Rejects header injection (newlines), multiple addresses, and invalid emails.
 */
export function isValidAuthEmailFrom(value: string): boolean {
  if (value === "" || /[\r\n]/.test(value)) {
    return false;
  }

  // Reject multiple addresses (contains comma outside angle brackets)
  const outsideAngles = value.replace(/<[^>]*>/g, "");
  if (outsideAngles.includes(",")) {
    return false;
  }

  if (RAW_EMAIL_REGEX.test(value.trim())) {
    return true;
  }

  const match = MAILBOX_REGEX.exec(value.trim());
  if (match != null) {
    const address = match[1];
    return address != null && RAW_EMAIL_REGEX.test(address);
  }

  return false;
}
