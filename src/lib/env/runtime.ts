import { validateStartupEnv, type StartupEnv } from "./startup";

export interface RuntimeEnv {
  readonly databaseUrl: string;
  readonly openaiApiKey: string;
  readonly openaiBaseUrl: string;
  readonly hasOpenaiBaseUrl: boolean;
  readonly authUrl: string | undefined;
  readonly authResendKey: string | undefined;
  readonly authEmailFrom: string;
  readonly oidcIssuer: string | undefined;
  readonly oidcClientId: string | undefined;
  readonly oidcClientSecret: string | undefined;
  readonly localStoragePath: string;
  readonly trustedProxy: string | undefined;
  readonly timeZone: string;
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
  readonly exportMaxEntries: number;
  readonly maxInputPixels: number;
  readonly maxImageQuality: number;
  readonly logLevel: string;
}

function readStartupEnv(): StartupEnv {
  return validateStartupEnv();
}

function hasExplicitValue(name: string): boolean {
  const value = process.env[name];
  return value != null && value.trim() !== "";
}

// Use getters so tests can override process.env without reloading every consumer.
export const runtimeEnv: RuntimeEnv = {
  get databaseUrl() {
    return readStartupEnv().DATABASE_URL;
  },
  get openaiApiKey() {
    return readStartupEnv().OPENAI_API_KEY;
  },
  get openaiBaseUrl() {
    return readStartupEnv().OPENAI_BASE_URL;
  },
  get hasOpenaiBaseUrl() {
    return hasExplicitValue("OPENAI_BASE_URL");
  },
  get authUrl() {
    return hasExplicitValue("AUTH_URL") ? readStartupEnv().AUTH_URL : undefined;
  },
  get authResendKey() {
    return readStartupEnv().AUTH_RESEND_KEY;
  },
  get authEmailFrom() {
    return readStartupEnv().AUTH_EMAIL_FROM;
  },
  get oidcIssuer() {
    return readStartupEnv().OIDC_ISSUER;
  },
  get oidcClientId() {
    return readStartupEnv().OIDC_CLIENT_ID;
  },
  get oidcClientSecret() {
    return readStartupEnv().OIDC_CLIENT_SECRET;
  },
  get localStoragePath() {
    return readStartupEnv().LOCAL_STORAGE_PATH;
  },
  get trustedProxy() {
    return readStartupEnv().TRUSTED_PROXY;
  },
  get timeZone() {
    return readStartupEnv().TZ;
  },
  get aiMaxRetries() {
    return readStartupEnv().AI_MAX_RETRIES;
  },
  get aiRetryDelayMs() {
    return readStartupEnv().AI_RETRY_DELAY_MS;
  },
  get aiTemperature() {
    return readStartupEnv().AI_TEMPERATURE;
  },
  get sourceDocStaleTimeMs() {
    return readStartupEnv().SOURCE_DOC_STALE_TIME_MS;
  },
  get currencyStaleTimeMs() {
    return readStartupEnv().CURRENCY_STALE_TIME_MS;
  },
  get otpExpiresSeconds() {
    return readStartupEnv().OTP_EXPIRES_SECONDS;
  },
  get otpLockoutMinutes() {
    return readStartupEnv().OTP_LOCKOUT_MINUTES;
  },
  get otpMaxAttempts() {
    return readStartupEnv().OTP_MAX_ATTEMPTS;
  },
  get otpResendCooldownSeconds() {
    return readStartupEnv().OTP_RESEND_COOLDOWN_SECONDS;
  },
  get authRateLimitMax() {
    return readStartupEnv().AUTH_RATE_LIMIT_MAX;
  },
  get authRateLimitWindow() {
    return readStartupEnv().AUTH_RATE_LIMIT_WINDOW;
  },
  get otpIpMaxAttemptsPerHour() {
    return readStartupEnv().OTP_IP_MAX_ATTEMPTS_PER_HOUR;
  },
  get otpVerifyMaxAttemptsPerMinute() {
    return readStartupEnv().OTP_VERIFY_MAX_ATTEMPTS_PER_MINUTE;
  },
  get apiRateLimitPerMinute() {
    return readStartupEnv().API_RATE_LIMIT_PER_MINUTE;
  },
  get sessionMaxAgeDays() {
    return readStartupEnv().SESSION_MAX_AGE_DAYS;
  },
  get disableRegistration() {
    return readStartupEnv().DISABLE_REGISTRATION === "true";
  },
  get exportMaxEntries() {
    return readStartupEnv().EXPORT_MAX_ENTRIES;
  },
  get maxInputPixels() {
    return readStartupEnv().MAX_INPUT_PIXELS;
  },
  get maxImageQuality() {
    return readStartupEnv().MAX_IMAGE_QUALITY;
  },
  get logLevel() {
    return readStartupEnv().LOG_LEVEL;
  },
};
