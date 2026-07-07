import { z } from "zod";
import { AppError } from "@/lib/errors";
import { isValidAuthEmailFrom } from "@/lib/utils/email";
export const ENV_DEFAULTS = {
  DATABASE_URL: "file:./data/sqlite.db",
  OPENAI_BASE_URL: "https://api.openai.com/v1",
  AUTH_URL: "http://localhost:3000",
  LOCAL_STORAGE_PATH: "./data/uploads",
  TZ: "Asia/Shanghai",
  AI_MODEL_TEXT: "gpt-4o-mini",
  AI_MODEL_VISION: "gpt-4o",
  AI_MAX_RETRIES: "3",
  AI_RETRY_DELAY_MS: "1000",
  AI_TEMPERATURE: "0.3",
  SOURCE_DOC_STALE_TIME_MS: "120000",
  CURRENCY_STALE_TIME_MS: "14400000",
  OTP_EXPIRES_SECONDS: "300",
  OTP_LOCKOUT_MINUTES: "15",
  OTP_MAX_ATTEMPTS: "5",
  OTP_RESEND_COOLDOWN_SECONDS: "60",
  AUTH_RATE_LIMIT_MAX: "10",
  AUTH_RATE_LIMIT_WINDOW: "900",
  API_RATE_LIMIT_PER_MINUTE: "60",
  OTP_IP_MAX_ATTEMPTS_PER_HOUR: "10",
  OTP_VERIFY_MAX_ATTEMPTS_PER_MINUTE: "5",
  SESSION_MAX_AGE_DAYS: "14",
  DISABLE_REGISTRATION: "false",
  AUTH_EMAIL_FROM: "Cashier <noreply@example.com>",
  MAX_TASK_WORKER: "10",
  EXPORT_MAX_ENTRIES: "2000",
  MAX_INPUT_PIXELS: "25000000",
  MAX_IMAGE_QUALITY: "85",
  LOG_LEVEL: "info",
  DEV_AUTH_BYPASS: "false",
  NEXT_PUBLIC_DEV_AUTH_BYPASS: "false",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
} as const;

function blankToUndefined(value: unknown): unknown {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

function getDefaultString(name: keyof typeof ENV_DEFAULTS): string {
  return ENV_DEFAULTS[name];
}

function requiredString(name: string) {
  return z.preprocess(blankToUndefined, z.string().trim().min(1, `${name} is required`));
}

function stringWithDefault(name: keyof typeof ENV_DEFAULTS) {
  return z.preprocess(blankToUndefined, z.string().trim().default(getDefaultString(name)));
}

function urlWithDefault(name: keyof typeof ENV_DEFAULTS) {
  return z.preprocess(
    blankToUndefined,
    z.url({ error: `${name} must be a valid URL` }).default(getDefaultString(name))
  );
}

function nonNegativeIntWithDefault(name: keyof typeof ENV_DEFAULTS) {
  return z.preprocess(
    blankToUndefined,
    z.coerce
      .number()
      .int(`${name} must be an integer`)
      .nonnegative(`${name} must be a non-negative integer`)
      .default(Number.parseInt(getDefaultString(name), 10))
  );
}

function positiveIntWithDefault(name: keyof typeof ENV_DEFAULTS) {
  return z.preprocess(
    blankToUndefined,
    z.coerce
      .number()
      .int(`${name} must be an integer`)
      .positive(`${name} must be a positive integer`)
      .default(Number.parseInt(getDefaultString(name), 10))
  );
}

function booleanStringWithDefault(name: keyof typeof ENV_DEFAULTS) {
  return z.preprocess(
    blankToUndefined,
    z.enum(["true", "false"]).default(getDefaultString(name) as "true" | "false")
  );
}

const startupEnvFields = {
  DATABASE_URL: stringWithDefault("DATABASE_URL"),
  OPENAI_API_KEY: requiredString("OPENAI_API_KEY"),
  OPENAI_BASE_URL: urlWithDefault("OPENAI_BASE_URL"),
  AUTH_SECRET: requiredString("AUTH_SECRET"),
  AUTH_URL: urlWithDefault("AUTH_URL"),
  AUTH_RESEND_KEY: z.preprocess(blankToUndefined, z.string().trim().optional()),
  AUTH_EMAIL_FROM: z.preprocess(
    blankToUndefined,
    z
      .string()
      .trim()
      .refine(
        isValidAuthEmailFrom,
        "AUTH_EMAIL_FROM must be a valid email address or Display Name <email> mailbox"
      )
      .default(getDefaultString("AUTH_EMAIL_FROM"))
  ),
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
  OTP_VERIFY_MAX_ATTEMPTS_PER_MINUTE: positiveIntWithDefault("OTP_VERIFY_MAX_ATTEMPTS_PER_MINUTE"),
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
  DEV_AUTH_BYPASS: booleanStringWithDefault("DEV_AUTH_BYPASS"),
  NEXT_PUBLIC_DEV_AUTH_BYPASS: booleanStringWithDefault("NEXT_PUBLIC_DEV_AUTH_BYPASS"),
  NEXT_PUBLIC_APP_URL: urlWithDefault("NEXT_PUBLIC_APP_URL"),
} satisfies z.ZodRawShape;

const startupEnvSchema = z.object(startupEnvFields);

export type StartupEnv = z.infer<typeof startupEnvSchema>;

export function getStartupEnvValue<K extends keyof StartupEnv>(
  name: K,
  env: NodeJS.ProcessEnv = process.env
): StartupEnv[K] {
  const schema = startupEnvFields[name];
  const result = schema.safeParse(env[name]);

  if (result.success) {
    return result.data as StartupEnv[K];
  }

  const issues = result.error.issues.map((issue) => issue.message);
  throw new AppError(
    `Startup environment validation failed: ${String(name)}: ${issues.join("; ")}`,
    "STARTUP_ENV_INVALID",
    500,
    { issues: result.error.issues }
  );
}

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
