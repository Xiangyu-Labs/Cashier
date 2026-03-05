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

/**
 * Check if two email addresses are the same (case-insensitive).
 * Useful for comparing user input against stored emails.
 */
export function emailsEqual(email1: string, email2: string): boolean {
    return normalizeEmail(email1) === normalizeEmail(email2);
}
