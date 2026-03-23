import crypto from "crypto";
import { runtimeEnv } from "@/lib/env/runtime";
import { OTP_LENGTH } from "../constants";

export { OTP_LENGTH };

const DEFAULT_OTP_EXPIRES_SECONDS = 300;
const DEFAULT_LOCKOUT_MINUTES = 15;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_RESEND_COOLDOWN_SECONDS = 60;

export function generateOTP(): string {
  const maxValue = Math.pow(10, OTP_LENGTH);
  return crypto.randomInt(0, maxValue).toString().padStart(OTP_LENGTH, "0");
}

export function hashOTP(otp: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .createHash("sha256")
    .update(otp + salt)
    .digest("hex");
  return `${hash}:${salt}`;
}

export function verifyOTP(otp: string, storedHash: string): boolean {
  const [hash, salt] = storedHash.split(":");

  if (hash == null || hash === "" || salt == null || salt === "") {
    return false;
  }

  const computed = crypto
    .createHash("sha256")
    .update(otp + salt)
    .digest("hex");
  const hashBuf = Buffer.from(hash, "hex");
  const computedBuf = Buffer.from(computed, "hex");

  if (hashBuf.length !== computedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(hashBuf, computedBuf);
}

export function isValidOTPFormat(otp: string): boolean {
  const otpPattern = new RegExp(`^\\d{${OTP_LENGTH}}$`);
  return otpPattern.test(otp);
}

export function getOTPExpiration(): Date {
  const expiresInSeconds = runtimeEnv.otpExpiresSeconds ?? DEFAULT_OTP_EXPIRES_SECONDS;
  return new Date(Date.now() + expiresInSeconds * 1000);
}

export function getLockoutExpiration(): Date {
  const lockoutMinutes = runtimeEnv.otpLockoutMinutes ?? DEFAULT_LOCKOUT_MINUTES;
  return new Date(Date.now() + lockoutMinutes * 60 * 1000);
}

export function getMaxAttempts(): number {
  return runtimeEnv.otpMaxAttempts ?? DEFAULT_MAX_ATTEMPTS;
}

export function getResendCooldown(): number {
  return runtimeEnv.otpResendCooldownSeconds ?? DEFAULT_RESEND_COOLDOWN_SECONDS;
}
