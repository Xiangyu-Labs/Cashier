import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

const baseEnv = {
  NODE_ENV: "test",
  DATABASE_URL: "file:./data/sqlite.db",
  OPENAI_API_KEY: "sk-test",
  AUTH_SECRET: "auth-secret",
  AUTH_URL: "http://localhost:3000",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
} satisfies NodeJS.ProcessEnv;

afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
});

describe("runtimeEnv", () => {
  it("reads validated application env through typed accessors", async () => {
    process.env = {
      ...originalEnv,
      ...baseEnv,
      AI_MAX_RETRIES: "5",
      AI_RETRY_DELAY_MS: "1500",
      AI_TEMPERATURE: "0.7",
      AUTH_RATE_LIMIT_MAX: "12",
      AUTH_RATE_LIMIT_WINDOW: "600",
      AUTH_EMAIL_FROM: "Cashier <security@example.com>",
      DISABLE_REGISTRATION: "true",
      EXPORT_MAX_ENTRIES: "5000",
      LOG_LEVEL: "warn",
      MAX_IMAGE_QUALITY: "72",
      MAX_INPUT_PIXELS: "123456",
      NEXT_PUBLIC_OIDC_ENABLED: "true",
      NEXT_PUBLIC_OIDC_BUTTON_NAME: "Cashier SSO",
      OIDC_ISSUER: "https://sso.cashier.test",
      OIDC_CLIENT_ID: "cashier-web",
      OIDC_CLIENT_SECRET: "top-secret",
      OTP_EXPIRES_SECONDS: "420",
      OTP_LOCKOUT_MINUTES: "20",
      OTP_MAX_ATTEMPTS: "7",
      OTP_RESEND_COOLDOWN_SECONDS: "90",
      OTP_IP_MAX_ATTEMPTS_PER_HOUR: "14",
      OTP_VERIFY_MAX_ATTEMPTS_PER_MINUTE: "6",
      API_RATE_LIMIT_PER_MINUTE: "75",
      SESSION_MAX_AGE_DAYS: "21",
      SOURCE_DOC_STALE_TIME_MS: "654321",
      CURRENCY_STALE_TIME_MS: "7654321",
      TZ: "UTC",
      LOCAL_STORAGE_PATH: "./data/test-uploads",
      TRUSTED_PROXY: "loopback",
      AUTH_RESEND_KEY: "re_test",
      OPENAI_BASE_URL: "https://openai-proxy.example/v1",
    };

    const { runtimeEnv } = await import("@/lib/env/runtime");

    expect(runtimeEnv.databaseUrl).toBe("file:./data/sqlite.db");
    expect(runtimeEnv.openaiApiKey).toBe("sk-test");
    expect(runtimeEnv.openaiBaseUrl).toBe("https://openai-proxy.example/v1");
    expect(runtimeEnv.hasOpenaiBaseUrl).toBe(true);
    expect(runtimeEnv.authUrl).toBe("http://localhost:3000");
    expect(runtimeEnv.authResendKey).toBe("re_test");
    expect(runtimeEnv.authEmailFrom).toBe("Cashier <security@example.com>");
    expect(runtimeEnv.oidcIssuer).toBe("https://sso.cashier.test");
    expect(runtimeEnv.oidcClientId).toBe("cashier-web");
    expect(runtimeEnv.oidcClientSecret).toBe("top-secret");
    expect(runtimeEnv.localStoragePath).toBe("./data/test-uploads");
    expect(runtimeEnv.trustedProxy).toBe("loopback");
    expect(runtimeEnv.timeZone).toBe("UTC");
    expect(runtimeEnv.aiMaxRetries).toBe(5);
    expect(runtimeEnv.aiRetryDelayMs).toBe(1500);
    expect(runtimeEnv.aiTemperature).toBe(0.7);
    expect(runtimeEnv.sourceDocStaleTimeMs).toBe(654321);
    expect(runtimeEnv.currencyStaleTimeMs).toBe(7654321);
    expect(runtimeEnv.otpExpiresSeconds).toBe(420);
    expect(runtimeEnv.otpLockoutMinutes).toBe(20);
    expect(runtimeEnv.otpMaxAttempts).toBe(7);
    expect(runtimeEnv.otpResendCooldownSeconds).toBe(90);
    expect(runtimeEnv.authRateLimitMax).toBe(12);
    expect(runtimeEnv.authRateLimitWindow).toBe(600);
    expect(runtimeEnv.otpIpMaxAttemptsPerHour).toBe(14);
    expect(runtimeEnv.otpVerifyMaxAttemptsPerMinute).toBe(6);
    expect(runtimeEnv.apiRateLimitPerMinute).toBe(75);
    expect(runtimeEnv.sessionMaxAgeDays).toBe(21);
    expect(runtimeEnv.disableRegistration).toBe(true);
    expect(runtimeEnv.exportMaxEntries).toBe(5000);
    expect(runtimeEnv.maxInputPixels).toBe(123456);
    expect(runtimeEnv.maxImageQuality).toBe(72);
    expect(runtimeEnv.logLevel).toBe("warn");
  });

  it("surfaces startup validation failures through the accessor", async () => {
    process.env = {
      ...originalEnv,
      ...baseEnv,
      OPENAI_API_KEY: "",
    };

    const { runtimeEnv } = await import("@/lib/env/runtime");

    expect(() => runtimeEnv.openaiApiKey).toThrow(/OPENAI_API_KEY/);
  });

  it("tracks whether OPENAI_BASE_URL was explicitly configured", async () => {
    process.env = {
      ...originalEnv,
      ...baseEnv,
      OPENAI_BASE_URL: "",
    };

    const { runtimeEnv } = await import("@/lib/env/runtime");

    expect(runtimeEnv.openaiBaseUrl).toBe("https://api.openai.com/v1");
    expect(runtimeEnv.hasOpenaiBaseUrl).toBe(false);
  });
});

describe("publicEnv", () => {
  it("uses documented defaults for NEXT_PUBLIC accessors", async () => {
    process.env = {
      ...originalEnv,
    };

    const { publicEnv } = await import("@/lib/env/public");

    expect(publicEnv.appUrl).toBe("http://localhost:3000");
    expect(publicEnv.oidcEnabled).toBe(false);
    expect(publicEnv.oidcButtonName).toBe("SSO");
  });

  it("reads configured NEXT_PUBLIC values", async () => {
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_APP_URL: "https://cashier.example",
      NEXT_PUBLIC_OIDC_ENABLED: "true",
      NEXT_PUBLIC_OIDC_BUTTON_NAME: "Cashier SSO",
    };

    const { publicEnv } = await import("@/lib/env/public");

    expect(publicEnv.appUrl).toBe("https://cashier.example");
    expect(publicEnv.oidcEnabled).toBe(true);
    expect(publicEnv.oidcButtonName).toBe("Cashier SSO");
  });
});
