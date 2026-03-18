export const AUTH_ERROR_CODES = {
  REGISTRATION_DISABLED: "registration_disabled",
  OTP_INVALID: "otp_invalid",
  OTP_EXPIRED: "otp_expired",
  OTP_LOCKED: "otp_locked",
  OTP_RATE_LIMITED: "otp_rate_limited",
} as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];
