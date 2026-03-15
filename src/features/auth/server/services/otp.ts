import crypto from "crypto";

/** OTP length in digits */
export const OTP_LENGTH = 6;

/** Default OTP expiration time in seconds (5 minutes) */
export const DEFAULT_OTP_EXPIRES_SECONDS = 300;

/** Default account lockout duration in minutes (15 minutes) */
export const DEFAULT_LOCKOUT_MINUTES = 15;

/** Default maximum allowed OTP attempts before lockout */
export const DEFAULT_MAX_ATTEMPTS = 5;

/** Default resend cooldown period in seconds (60 seconds) */
export const DEFAULT_RESEND_COOLDOWN_SECONDS = 60;

/**
 * Generate a 6-digit random OTP code
 * @returns A string of 6 random digits (e.g., "482917")
 */
export function generateOTP(): string {
  // Generate random number between 0 and 999999, pad with leading zeros
  const maxValue = Math.pow(10, OTP_LENGTH);
  return crypto.randomInt(0, maxValue).toString().padStart(OTP_LENGTH, "0");
}

/**
 * Hash an OTP using SHA-256 with salt
 * Format: "hash:salt" to store both hash and salt together
 * @param otp - The plain text OTP to hash
 * @returns The hexadecimal hash string with embedded salt (format: "hash:salt")
 */
export function hashOTP(otp: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.createHash("sha256").update(otp + salt).digest("hex");
  return `${hash}:${salt}`;
}

/**
 * Verify an OTP against its hash
 * @param otp - The plain text OTP to verify
 * @param storedHash - The stored hash to compare against (format: "hash:salt")
 * @returns True if the OTP matches the hash
 */
export function verifyOTP(otp: string, storedHash: string): boolean {
  // Parse the stored hash: "hash:salt"
  const [hash, salt] = storedHash.split(":");

  if (!hash || !salt) {
    return false;
  }

  const computed = crypto.createHash("sha256").update(otp + salt).digest("hex");
  return computed === hash;
}

/**
 * Validate OTP format (must be exactly 6 digits)
 * @param otp - The OTP string to validate
 * @returns True if the OTP is valid format
 */
export function isValidOTPFormat(otp: string): boolean {
  const otpPattern = new RegExp(`^\\d{${OTP_LENGTH}}$`);
  return otpPattern.test(otp);
}

/**
 * Get OTP expiration timestamp (5 minutes from now)
 * @returns Date object representing expiration time
 */
export function getOTPExpiration(): Date {
  const expiresInSeconds = parseInt(
    process.env.OTP_EXPIRES_SECONDS || String(DEFAULT_OTP_EXPIRES_SECONDS),
    10
  );
  return new Date(Date.now() + expiresInSeconds * 1000);
}

/**
 * Get account lockout timestamp (15 minutes from now)
 * @returns Date object representing lockout end time
 */
export function getLockoutExpiration(): Date {
  const lockoutMinutes = parseInt(
    process.env.OTP_LOCKOUT_MINUTES || String(DEFAULT_LOCKOUT_MINUTES),
    10
  );
  return new Date(Date.now() + lockoutMinutes * 60 * 1000);
}

/**
 * Get maximum allowed OTP attempts before lockout
 * @returns Number of allowed attempts
 */
export function getMaxAttempts(): number {
  return parseInt(process.env.OTP_MAX_ATTEMPTS || String(DEFAULT_MAX_ATTEMPTS), 10);
}

/**
 * Get resend cooldown period in seconds
 * @returns Cooldown duration in seconds
 */
export function getResendCooldown(): number {
  return parseInt(
    process.env.OTP_RESEND_COOLDOWN_SECONDS || String(DEFAULT_RESEND_COOLDOWN_SECONDS),
    10
  );
}
