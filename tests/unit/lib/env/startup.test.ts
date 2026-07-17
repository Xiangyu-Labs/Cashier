import { describe, expect, it } from "vitest";
import { ENV_DEFAULTS, validateStartupEnv } from "@/lib/env/startup";

const baseEnv = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://cashier:cashier@localhost:5432/cashier",
  OPENAI_API_KEY: "sk-test",
  AUTH_SECRET: "auth-secret",
  AUTH_URL: "http://localhost:3000",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  R2_ACCOUNT_ID: "test-account",
  R2_BUCKET_NAME: "cashier-images",
  R2_ACCESS_KEY_ID: "test-access-key",
  R2_SECRET_ACCESS_KEY: "test-secret-key",
} satisfies NodeJS.ProcessEnv;

describe("validateStartupEnv", () => {
  it("exports the default values used by startup, runtime, and public env readers", () => {
    expect(ENV_DEFAULTS.OPENAI_BASE_URL).toBe("https://api.openai.com/v1");
    expect(ENV_DEFAULTS.AI_MODEL_TEXT).toBe("gpt-4o-mini");
    expect(ENV_DEFAULTS.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
  });

  it("rejects SQLite database URLs", () => {
    expect(() =>
      validateStartupEnv({
        ...baseEnv,
        DATABASE_URL: "file:./data/sqlite.db",
      })
    ).toThrow(/PostgreSQL/);
  });

  it("reports missing required startup env vars together", () => {
    expect(() =>
      validateStartupEnv({
        ...baseEnv,
        OPENAI_API_KEY: "",
        AUTH_SECRET: "",
      })
    ).toThrow(/OPENAI_API_KEY|AUTH_SECRET/);
  });

  it("requires every R2 setting without exposing configured credentials", () => {
    let message = "";
    try {
      validateStartupEnv({
        ...baseEnv,
        R2_BUCKET_NAME: "",
        R2_SECRET_ACCESS_KEY: "do-not-log-this-secret",
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("R2_BUCKET_NAME");
    expect(message).not.toContain("do-not-log-this-secret");
  });

  it("rejects invalid numeric values", () => {
    expect(() =>
      validateStartupEnv({
        ...baseEnv,
        AI_MAX_RETRIES: "-1",
      })
    ).toThrow(/AI_MAX_RETRIES/);
  });

  it("applies defaults for optional startup-validated env vars", () => {
    const result = validateStartupEnv(baseEnv);

    expect(result.AI_MODEL_TEXT).toBe("gpt-4o-mini");
    expect(result.AI_MODEL_VISION).toBe("gpt-4o");
    expect(result.AI_MAX_RETRIES).toBe(3);
    expect(result.AI_RETRY_DELAY_MS).toBe(1000);
  });

  it("accepts AUTH_EMAIL_FROM in named mailbox format", () => {
    const result = validateStartupEnv({
      ...baseEnv,
      AUTH_EMAIL_FROM: "Cashier <noreply@example.com>",
    });

    expect(result.AUTH_EMAIL_FROM).toBe("Cashier <noreply@example.com>");
  });

  it("rejects invalid AUTH_EMAIL_FROM", () => {
    expect(() =>
      validateStartupEnv({
        ...baseEnv,
        AUTH_EMAIL_FROM: "not-an-email",
      })
    ).toThrow(/AUTH_EMAIL_FROM/);
  });

  it("owns all app env defaults in the startup module", () => {
    expect(Object.keys(ENV_DEFAULTS).sort()).toEqual([
      "AI_MAX_RETRIES",
      "AI_MODEL_TEXT",
      "AI_MODEL_VISION",
      "AI_RETRY_DELAY_MS",
      "AI_TEMPERATURE",
      "API_RATE_LIMIT_PER_MINUTE",
      "AUTH_EMAIL_FROM",
      "AUTH_RATE_LIMIT_MAX",
      "AUTH_RATE_LIMIT_WINDOW",
      "AUTH_URL",
      "CURRENCY_STALE_TIME_MS",
      "DEV_AUTH_BYPASS",
      "DISABLE_REGISTRATION",
      "LOG_LEVEL",
      "MAX_IMAGE_QUALITY",
      "MAX_INPUT_PIXELS",
      "MAX_TASK_WORKER",
      "NEXT_PUBLIC_APP_URL",
      "NEXT_PUBLIC_DEV_AUTH_BYPASS",
      "OPENAI_BASE_URL",
      "OTP_EXPIRES_SECONDS",
      "OTP_IP_MAX_ATTEMPTS_PER_HOUR",
      "OTP_LOCKOUT_MINUTES",
      "OTP_MAX_ATTEMPTS",
      "OTP_RESEND_COOLDOWN_SECONDS",
      "OTP_VERIFY_MAX_ATTEMPTS_PER_MINUTE",
      "SESSION_MAX_AGE_DAYS",
      "SOURCE_DOC_STALE_TIME_MS",
      "TZ",
    ]);
  });
});
