import { z } from "zod";
import { AppError } from "@/lib/errors";
import { getEnvValue } from "./catalog";

function blankToUndefined(value: unknown): unknown {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

function getDefaultString(name: string): string {
  const value = getEnvValue({}, name);

  if (value == null) {
    throw new Error(`Missing default value for ${name}`);
  }

  return value;
}

function requiredString(name: string) {
  return z.preprocess(
    blankToUndefined,
    z.string().trim().min(1, `${name} is required`)
  );
}

function stringWithDefault(name: string) {
  return z.preprocess(blankToUndefined, z.string().trim().default(getDefaultString(name)));
}

function urlWithDefault(name: string) {
  return z.preprocess(
    blankToUndefined,
    z.url({ error: `${name} must be a valid URL` }).default(getDefaultString(name))
  );
}

function optionalUrl(name: string) {
  return z.preprocess(
    blankToUndefined,
    z.url({ error: `${name} must be a valid URL` }).optional()
  );
}

function nonNegativeIntWithDefault(name: string) {
  return z.preprocess(
    blankToUndefined,
    z.coerce
      .number()
      .int(`${name} must be an integer`)
      .nonnegative(`${name} must be a non-negative integer`)
      .default(Number.parseInt(getDefaultString(name), 10))
  );
}

function positiveIntWithDefault(name: string) {
  return z.preprocess(
    blankToUndefined,
    z.coerce
      .number()
      .int(`${name} must be an integer`)
      .positive(`${name} must be a positive integer`)
      .default(Number.parseInt(getDefaultString(name), 10))
  );
}

function booleanStringWithDefault(name: string) {
  return z.preprocess(
    blankToUndefined,
    z.enum(["true", "false"]).default(getDefaultString(name) as "true" | "false")
  );
}

const startupEnvSchema = z
  .object({
    DATABASE_URL: stringWithDefault("DATABASE_URL"),
    OPENAI_API_KEY: requiredString("OPENAI_API_KEY"),
    OPENAI_BASE_URL: urlWithDefault("OPENAI_BASE_URL"),
    AUTH_SECRET: requiredString("AUTH_SECRET"),
    AUTH_URL: urlWithDefault("AUTH_URL"),
    AUTH_RESEND_KEY: z.preprocess(blankToUndefined, z.string().trim().optional()),
    AUTH_EMAIL_FROM: z.preprocess(
      blankToUndefined,
      z.email({ error: "AUTH_EMAIL_FROM must be a valid email address" }).default(
        getDefaultString("AUTH_EMAIL_FROM")
      )
    ),
    OIDC_ISSUER: optionalUrl("OIDC_ISSUER"),
    OIDC_CLIENT_ID: z.preprocess(blankToUndefined, z.string().trim().optional()),
    OIDC_CLIENT_SECRET: z.preprocess(blankToUndefined, z.string().trim().optional()),
    LOCAL_STORAGE_PATH: stringWithDefault("LOCAL_STORAGE_PATH"),
    TRUSTED_PROXY: z.preprocess(blankToUndefined, z.string().trim().optional()),
    TZ: stringWithDefault("TZ"),
    AI_MODEL_TEXT: stringWithDefault("AI_MODEL_TEXT"),
    AI_MODEL_VISION: stringWithDefault("AI_MODEL_VISION"),
    AI_MAX_RETRIES: nonNegativeIntWithDefault("AI_MAX_RETRIES"),
    AI_RETRY_DELAY_MS: nonNegativeIntWithDefault("AI_RETRY_DELAY_MS"),
    AI_TEMPERATURE: z.preprocess(
      blankToUndefined,
      z.coerce
        .number()
        .min(0, "AI_TEMPERATURE must be between 0 and 2")
        .max(2, "AI_TEMPERATURE must be between 0 and 2")
        .default(Number.parseFloat(getDefaultString("AI_TEMPERATURE")))
    ),
    SOURCE_DOC_STALE_TIME_MS: nonNegativeIntWithDefault("SOURCE_DOC_STALE_TIME_MS"),
    CURRENCY_STALE_TIME_MS: nonNegativeIntWithDefault("CURRENCY_STALE_TIME_MS"),
    OTP_EXPIRES_SECONDS: positiveIntWithDefault("OTP_EXPIRES_SECONDS"),
    OTP_LOCKOUT_MINUTES: positiveIntWithDefault("OTP_LOCKOUT_MINUTES"),
    OTP_MAX_ATTEMPTS: positiveIntWithDefault("OTP_MAX_ATTEMPTS"),
    OTP_RESEND_COOLDOWN_SECONDS: nonNegativeIntWithDefault("OTP_RESEND_COOLDOWN_SECONDS"),
    AUTH_RATE_LIMIT_MAX: positiveIntWithDefault("AUTH_RATE_LIMIT_MAX"),
    AUTH_RATE_LIMIT_WINDOW: positiveIntWithDefault("AUTH_RATE_LIMIT_WINDOW"),
    API_RATE_LIMIT_PER_MINUTE: positiveIntWithDefault("API_RATE_LIMIT_PER_MINUTE"),
    OTP_IP_MAX_ATTEMPTS_PER_HOUR: positiveIntWithDefault("OTP_IP_MAX_ATTEMPTS_PER_HOUR"),
    OTP_VERIFY_MAX_ATTEMPTS_PER_MINUTE: positiveIntWithDefault(
      "OTP_VERIFY_MAX_ATTEMPTS_PER_MINUTE"
    ),
    SESSION_MAX_AGE_DAYS: positiveIntWithDefault("SESSION_MAX_AGE_DAYS"),
    DISABLE_REGISTRATION: booleanStringWithDefault("DISABLE_REGISTRATION"),
    MAX_TASK_WORKER: nonNegativeIntWithDefault("MAX_TASK_WORKER"),
    EXPORT_MAX_ENTRIES: positiveIntWithDefault("EXPORT_MAX_ENTRIES"),
    MAX_INPUT_PIXELS: positiveIntWithDefault("MAX_INPUT_PIXELS"),
    MAX_IMAGE_QUALITY: z.preprocess(
      blankToUndefined,
      z.coerce
        .number()
        .int("MAX_IMAGE_QUALITY must be an integer")
        .min(1, "MAX_IMAGE_QUALITY must be between 1 and 100")
        .max(100, "MAX_IMAGE_QUALITY must be between 1 and 100")
        .default(Number.parseInt(getDefaultString("MAX_IMAGE_QUALITY"), 10))
    ),
    LOG_LEVEL: stringWithDefault("LOG_LEVEL"),
    NEXT_PUBLIC_APP_URL: urlWithDefault("NEXT_PUBLIC_APP_URL"),
    NEXT_PUBLIC_OIDC_ENABLED: booleanStringWithDefault("NEXT_PUBLIC_OIDC_ENABLED"),
    NEXT_PUBLIC_OIDC_BUTTON_NAME: stringWithDefault("NEXT_PUBLIC_OIDC_BUTTON_NAME"),
  })
  .superRefine((env, ctx) => {
    const oidcKeys = ["OIDC_ISSUER", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET"] as const;
    const hasAnyOidc = oidcKeys.some((key) => {
      const value = env[key];
      return typeof value === "string" && value.trim() !== "";
    });
    const oidcEnabled = env.NEXT_PUBLIC_OIDC_ENABLED === "true";

    if (!hasAnyOidc && !oidcEnabled) {
      return;
    }

    for (const key of oidcKeys) {
      const value = env[key];
      if (value == null || value === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when OIDC is enabled`,
        });
      }
    }
  });

export type StartupEnv = z.infer<typeof startupEnvSchema>;

export function validateStartupEnv(env: NodeJS.ProcessEnv = process.env): StartupEnv {
  const result = startupEnvSchema.safeParse(env);

  if (result.success) {
    return result.data;
  }

  const issues = result.error.issues.map((issue) => {
    const path = issue.path.join(".");
    return path === "" ? issue.message : `${path}: ${issue.message}`;
  });

  throw new AppError(
    `Startup environment validation failed: ${issues.join("; ")}`,
    "STARTUP_ENV_INVALID",
    500,
    { issues: result.error.issues }
  );
}
