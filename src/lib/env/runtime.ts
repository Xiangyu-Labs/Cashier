import { getStartupEnvValue } from "./startup";

export interface RuntimeEnv {
  readonly databaseUrl: string;
  readonly openaiApiKey: string;
  readonly openaiBaseUrl: string;
  readonly hasOpenaiBaseUrl: boolean;
  readonly authUrl: string | undefined;
  readonly authResendKey: string | undefined;
  readonly authEmailFrom: string;
  readonly r2AccountId: string;
  readonly r2BucketName: string;
  readonly r2AccessKeyId: string;
  readonly r2SecretAccessKey: string;
  readonly trustedProxy: string | undefined;
  readonly timeZone: string;
  readonly aiModelText: string;
  readonly aiModelVision: string;
  readonly aiMaxRetries: number;
  readonly aiRetryDelayMs: number;
  readonly aiTemperature: number;
  readonly sourceDocStaleTimeMs: number;
  readonly currencyStaleTimeMs: number;
  readonly otpExpiresSeconds: number;
  readonly otpLockoutMinutes: number;
  readonly otpMaxAttempts: number;
  readonly otpResendCooldownSeconds: number;
  readonly authRateLimitMax: number;
  readonly authRateLimitWindow: number;
  readonly otpIpMaxAttemptsPerHour: number;
  readonly otpVerifyMaxAttemptsPerMinute: number;
  readonly apiRateLimitPerMinute: number;
  readonly sessionMaxAgeDays: number;
  readonly disableRegistration: boolean;
  readonly maxTaskWorker: number;
  readonly maxInputPixels: number;
  readonly maxImageQuality: number;
  readonly logLevel: string;
  readonly devAuthBypass: boolean;
}

function hasExplicitValue(name: string): boolean {
  const value = process.env[name];
  return value != null && value.trim() !== "";
}

// Use getters so tests can override process.env without reloading every consumer.
export const runtimeEnv: RuntimeEnv = {
  get databaseUrl() {
    return getStartupEnvValue("DATABASE_URL");
  },
  get openaiApiKey() {
    return getStartupEnvValue("OPENAI_API_KEY");
  },
  get openaiBaseUrl() {
    return getStartupEnvValue("OPENAI_BASE_URL");
  },
  get hasOpenaiBaseUrl() {
    return hasExplicitValue("OPENAI_BASE_URL");
  },
  get authUrl() {
    return hasExplicitValue("AUTH_URL") ? getStartupEnvValue("AUTH_URL") : undefined;
  },
  get authResendKey() {
    return getStartupEnvValue("AUTH_RESEND_KEY");
  },
  get authEmailFrom() {
    return getStartupEnvValue("AUTH_EMAIL_FROM");
  },
  get r2AccountId() {
    return getStartupEnvValue("R2_ACCOUNT_ID");
  },
  get r2BucketName() {
    return getStartupEnvValue("R2_BUCKET_NAME");
  },
  get r2AccessKeyId() {
    return getStartupEnvValue("R2_ACCESS_KEY_ID");
  },
  get r2SecretAccessKey() {
    return getStartupEnvValue("R2_SECRET_ACCESS_KEY");
  },
  get trustedProxy() {
    return getStartupEnvValue("TRUSTED_PROXY");
  },
  get timeZone() {
    return getStartupEnvValue("TZ");
  },
  get aiModelText() {
    return getStartupEnvValue("AI_MODEL_TEXT");
  },
  get aiModelVision() {
    return getStartupEnvValue("AI_MODEL_VISION");
  },
  get aiMaxRetries() {
    return getStartupEnvValue("AI_MAX_RETRIES");
  },
  get aiRetryDelayMs() {
    return getStartupEnvValue("AI_RETRY_DELAY_MS");
  },
  get aiTemperature() {
    return getStartupEnvValue("AI_TEMPERATURE");
  },
  get sourceDocStaleTimeMs() {
    return getStartupEnvValue("SOURCE_DOC_STALE_TIME_MS");
  },
  get currencyStaleTimeMs() {
    return getStartupEnvValue("CURRENCY_STALE_TIME_MS");
  },
  get otpExpiresSeconds() {
    return getStartupEnvValue("OTP_EXPIRES_SECONDS");
  },
  get otpLockoutMinutes() {
    return getStartupEnvValue("OTP_LOCKOUT_MINUTES");
  },
  get otpMaxAttempts() {
    return getStartupEnvValue("OTP_MAX_ATTEMPTS");
  },
  get otpResendCooldownSeconds() {
    return getStartupEnvValue("OTP_RESEND_COOLDOWN_SECONDS");
  },
  get authRateLimitMax() {
    return getStartupEnvValue("AUTH_RATE_LIMIT_MAX");
  },
  get authRateLimitWindow() {
    return getStartupEnvValue("AUTH_RATE_LIMIT_WINDOW");
  },
  get otpIpMaxAttemptsPerHour() {
    return getStartupEnvValue("OTP_IP_MAX_ATTEMPTS_PER_HOUR");
  },
  get otpVerifyMaxAttemptsPerMinute() {
    return getStartupEnvValue("OTP_VERIFY_MAX_ATTEMPTS_PER_MINUTE");
  },
  get apiRateLimitPerMinute() {
    return getStartupEnvValue("API_RATE_LIMIT_PER_MINUTE");
  },
  get sessionMaxAgeDays() {
    return getStartupEnvValue("SESSION_MAX_AGE_DAYS");
  },
  get disableRegistration() {
    return getStartupEnvValue("DISABLE_REGISTRATION") === "true";
  },
  get maxTaskWorker() {
    return getStartupEnvValue("MAX_TASK_WORKER");
  },
  get maxInputPixels() {
    return getStartupEnvValue("MAX_INPUT_PIXELS");
  },
  get maxImageQuality() {
    return getStartupEnvValue("MAX_IMAGE_QUALITY");
  },
  get logLevel() {
    return getStartupEnvValue("LOG_LEVEL");
  },
  get devAuthBypass() {
    return getStartupEnvValue("DEV_AUTH_BYPASS") === "true";
  },
};
