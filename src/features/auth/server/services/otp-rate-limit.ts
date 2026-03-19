export {
  checkResendCooldown,
  checkSendRateLimit,
  checkSendRateLimitByIP,
  checkVerifyRateLimit,
  getCanResendAt,
  setResendCooldown,
} from "@/modules/auth/services/otp-rate-limit";
