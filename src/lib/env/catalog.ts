export type EnvTier = "system" | "runtime" | "frontend";

export interface EnvCatalogEntry {
  name: string;
  tier: EnvTier;
  required: boolean;
  defaultValue: string | null;
  description: string;
  validateOnStartup: boolean;
}

export const FRAMEWORK_ENV_KEYS = new Set(["NODE_ENV", "NEXT_RUNTIME", "NO_DB"]);

export const APP_ENV_CATALOG: EnvCatalogEntry[] = [
  {
    name: "DATABASE_URL",
    tier: "system",
    required: false,
    defaultValue: "file:./data/sqlite.db",
    description: "SQLite database connection string.",
    validateOnStartup: true,
  },
  {
    name: "OPENAI_API_KEY",
    tier: "system",
    required: true,
    defaultValue: null,
    description: "API key for OpenAI-powered receipt parsing.",
    validateOnStartup: true,
  },
  {
    name: "OPENAI_BASE_URL",
    tier: "system",
    required: false,
    defaultValue: "https://api.openai.com/v1",
    description: "Custom base URL for OpenAI-compatible providers or proxies.",
    validateOnStartup: false,
  },
  {
    name: "AUTH_SECRET",
    tier: "system",
    required: true,
    defaultValue: null,
    description: "Secret used by Auth.js to sign tokens and cookies.",
    validateOnStartup: true,
  },
  {
    name: "AUTH_URL",
    tier: "system",
    required: false,
    defaultValue: "http://localhost:3000",
    description: "Server-side base URL for auth callbacks.",
    validateOnStartup: true,
  },
  {
    name: "AUTH_RESEND_KEY",
    tier: "system",
    required: false,
    defaultValue: null,
    description: "Resend API key for OTP and notification emails.",
    validateOnStartup: false,
  },
  {
    name: "OIDC_ISSUER",
    tier: "system",
    required: false,
    defaultValue: null,
    description: "OIDC issuer URL for optional SSO integration.",
    validateOnStartup: true,
  },
  {
    name: "OIDC_CLIENT_ID",
    tier: "system",
    required: false,
    defaultValue: null,
    description: "OIDC client ID for optional SSO integration.",
    validateOnStartup: true,
  },
  {
    name: "OIDC_CLIENT_SECRET",
    tier: "system",
    required: false,
    defaultValue: null,
    description: "OIDC client secret for optional SSO integration.",
    validateOnStartup: true,
  },
  {
    name: "LOCAL_STORAGE_PATH",
    tier: "system",
    required: false,
    defaultValue: "./data/uploads",
    description: "Filesystem path for locally stored uploads.",
    validateOnStartup: false,
  },
  {
    name: "TRUSTED_PROXY",
    tier: "system",
    required: false,
    defaultValue: null,
    description: "Trusted proxy chain used for client IP extraction.",
    validateOnStartup: false,
  },
  {
    name: "TZ",
    tier: "system",
    required: false,
    defaultValue: "Asia/Shanghai",
    description: "Process timezone for server-side date formatting.",
    validateOnStartup: false,
  },
  {
    name: "AI_MODEL_TEXT",
    tier: "runtime",
    required: false,
    defaultValue: "gpt-4o-mini",
    description: "Default text model for server-side AI workflows.",
    validateOnStartup: true,
  },
  {
    name: "AI_MODEL_VISION",
    tier: "runtime",
    required: false,
    defaultValue: "gpt-4o",
    description: "Default vision model for image understanding.",
    validateOnStartup: true,
  },
  {
    name: "AI_MAX_RETRIES",
    tier: "runtime",
    required: false,
    defaultValue: "3",
    description: "Maximum retry attempts for AI requests.",
    validateOnStartup: true,
  },
  {
    name: "AI_RETRY_DELAY_MS",
    tier: "runtime",
    required: false,
    defaultValue: "1000",
    description: "Base backoff delay for AI retries in milliseconds.",
    validateOnStartup: true,
  },
  {
    name: "AI_TEMPERATURE",
    tier: "runtime",
    required: false,
    defaultValue: "0.3",
    description: "Default creativity level for structured AI tasks.",
    validateOnStartup: true,
  },
  {
    name: "SOURCE_DOC_STALE_TIME_MS",
    tier: "runtime",
    required: false,
    defaultValue: "120000",
    description: "Client cache stale time for source document queries.",
    validateOnStartup: true,
  },
  {
    name: "CURRENCY_STALE_TIME_MS",
    tier: "runtime",
    required: false,
    defaultValue: "14400000",
    description: "Client cache stale time for currency rate queries.",
    validateOnStartup: true,
  },
  {
    name: "OTP_EXPIRES_SECONDS",
    tier: "runtime",
    required: false,
    defaultValue: "300",
    description: "OTP expiration window in seconds.",
    validateOnStartup: true,
  },
  {
    name: "OTP_LOCKOUT_MINUTES",
    tier: "runtime",
    required: false,
    defaultValue: "15",
    description: "Lockout duration after repeated OTP failures.",
    validateOnStartup: true,
  },
  {
    name: "OTP_MAX_ATTEMPTS",
    tier: "runtime",
    required: false,
    defaultValue: "5",
    description: "Maximum allowed OTP verification attempts.",
    validateOnStartup: true,
  },
  {
    name: "OTP_RESEND_COOLDOWN_SECONDS",
    tier: "runtime",
    required: false,
    defaultValue: "60",
    description: "Cooldown before the same email can request another OTP.",
    validateOnStartup: true,
  },
  {
    name: "AUTH_RATE_LIMIT_MAX",
    tier: "runtime",
    required: false,
    defaultValue: "10",
    description: "Maximum OTP send attempts per rate-limit window.",
    validateOnStartup: true,
  },
  {
    name: "AUTH_RATE_LIMIT_WINDOW",
    tier: "runtime",
    required: false,
    defaultValue: "900",
    description: "OTP send rate-limit window in seconds.",
    validateOnStartup: true,
  },
  {
    name: "API_RATE_LIMIT_PER_MINUTE",
    tier: "runtime",
    required: false,
    defaultValue: "60",
    description: "Per-minute rate limit for API v1 endpoints.",
    validateOnStartup: true,
  },
  {
    name: "OTP_IP_MAX_ATTEMPTS_PER_HOUR",
    tier: "runtime",
    required: false,
    defaultValue: "10",
    description: "Per-IP OTP send limit within one hour.",
    validateOnStartup: true,
  },
  {
    name: "OTP_VERIFY_MAX_ATTEMPTS_PER_MINUTE",
    tier: "runtime",
    required: false,
    defaultValue: "5",
    description: "Per-IP OTP verification limit within one minute.",
    validateOnStartup: true,
  },
  {
    name: "SESSION_MAX_AGE_DAYS",
    tier: "runtime",
    required: false,
    defaultValue: "14",
    description: "Maximum session lifetime in days.",
    validateOnStartup: true,
  },
  {
    name: "DISABLE_REGISTRATION",
    tier: "runtime",
    required: false,
    defaultValue: "false",
    description: "Feature flag to disable new user registrations.",
    validateOnStartup: true,
  },
  {
    name: "AUTH_EMAIL_FROM",
    tier: "runtime",
    required: false,
    defaultValue: "Cashier <noreply@example.com>",
    description: "Sender mailbox for OTP and security notifications. Supports bare email or Display Name <email>.",
    validateOnStartup: true,
  },
  {
    name: "MAX_TASK_WORKER",
    tier: "runtime",
    required: false,
    defaultValue: "10",
    description: "Maximum number of concurrent background task workers.",
    validateOnStartup: true,
  },
  {
    name: "EXPORT_MAX_ENTRIES",
    tier: "runtime",
    required: false,
    defaultValue: "2000",
    description: "Maximum number of ledger entries exported in one request.",
    validateOnStartup: true,
  },
  {
    name: "MAX_INPUT_PIXELS",
    tier: "runtime",
    required: false,
    defaultValue: "25000000",
    description: "Maximum input pixels allowed for image processing.",
    validateOnStartup: true,
  },
  {
    name: "MAX_IMAGE_QUALITY",
    tier: "runtime",
    required: false,
    defaultValue: "85",
    description: "Output image quality for local image processing.",
    validateOnStartup: true,
  },
  {
    name: "LOG_LEVEL",
    tier: "runtime",
    required: false,
    defaultValue: "info",
    description: "Pino log level for server logs.",
    validateOnStartup: false,
  },
  {
    name: "NEXT_PUBLIC_APP_URL",
    tier: "frontend",
    required: false,
    defaultValue: "http://localhost:3000",
    description: "Public application URL exposed to the browser bundle.",
    validateOnStartup: true,
  },
  {
    name: "NEXT_PUBLIC_OIDC_ENABLED",
    tier: "frontend",
    required: false,
    defaultValue: "false",
    description: "Controls whether the login page renders the SSO button.",
    validateOnStartup: true,
  },
  {
    name: "NEXT_PUBLIC_OIDC_BUTTON_NAME",
    tier: "frontend",
    required: false,
    defaultValue: "SSO",
    description: "Label used for the login page and provider SSO button.",
    validateOnStartup: true,
  },
];

export const APP_ENV_CATALOG_BY_NAME = new Map(
  APP_ENV_CATALOG.map((entry) => [entry.name, entry] as const)
);

export function getEnvCatalogEntry(name: string): EnvCatalogEntry | undefined {
  return APP_ENV_CATALOG_BY_NAME.get(name);
}

export function getEnvValue(
  env: NodeJS.ProcessEnv,
  name: string
): string | undefined {
  const value = env[name];

  if (value != null && value.trim() !== "") {
    return value;
  }

  return getEnvCatalogEntry(name)?.defaultValue ?? undefined;
}
