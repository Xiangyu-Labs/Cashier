import crypto from "crypto";

/**
 * Generate a 6-digit random OTP code
 * @returns A string of 6 random digits (e.g., "482917")
 */
export function generateOTP(): string {
  // Generate random number between 0 and 999999, pad with leading zeros
  return crypto.randomInt(0, 1000000).toString().padStart(6, "0");
}

/**
 * Hash an OTP using SHA-256
 * @param otp - The plain text OTP to hash
 * @returns The hexadecimal hash string
 */
export function hashOTP(otp: string): string {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

/**
 * Verify an OTP against its hash
 * @param otp - The plain text OTP to verify
 * @param hash - The stored hash to compare against
 * @returns True if the OTP matches the hash
 */
export function verifyOTP(otp: string, hash: string): boolean {
  return hashOTP(otp) === hash;
}

/**
 * Validate OTP format (must be exactly 6 digits)
 * @param otp - The OTP string to validate
 * @returns True if the OTP is valid format
 */
export function isValidOTPFormat(otp: string): boolean {
  return /^\d{6}$/.test(otp);
}

/**
 * Get OTP expiration timestamp (5 minutes from now)
 * @returns Date object representing expiration time
 */
export function getOTPExpiration(): Date {
  const expiresInSeconds = parseInt(process.env.OTP_EXPIRES_SECONDS || "300", 10);
  return new Date(Date.now() + expiresInSeconds * 1000);
}

/**
 * Get account lockout timestamp (15 minutes from now)
 * @returns Date object representing lockout end time
 */
export function getLockoutExpiration(): Date {
  const lockoutMinutes = parseInt(process.env.OTP_LOCKOUT_MINUTES || "15", 10);
  return new Date(Date.now() + lockoutMinutes * 60 * 1000);
}

/**
 * Get maximum allowed OTP attempts before lockout
 * @returns Number of allowed attempts
 */
export function getMaxAttempts(): number {
  return parseInt(process.env.OTP_MAX_ATTEMPTS || "5", 10);
}

/**
 * Get resend cooldown period in seconds
 * @returns Cooldown duration in seconds
 */
export function getResendCooldown(): number {
  return parseInt(process.env.OTP_RESEND_COOLDOWN_SECONDS || "60", 10);
}
