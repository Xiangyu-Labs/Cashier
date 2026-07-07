export type EnvTier = "system" | "runtime" | "frontend";

export interface EnvCatalogEntry {
  name: string;
  tier: EnvTier;
  required: boolean;
  description: string;
}

export const FRAMEWORK_ENV_KEYS = new Set(["NODE_ENV", "NEXT_RUNTIME", "NO_DB"]);

export const APP_ENV_CATALOG: EnvCatalogEntry[] = [
  {
    name: "DATABASE_URL",
    tier: "system",
    required: false,
    description: "SQLite database connection string.",
  },
  {
    name: "OPENAI_API_KEY",
    tier: "system",
    required: true,
    description: "API key for OpenAI-powered receipt parsing.",
  },
  {
    name: "OPENAI_BASE_URL",
    tier: "system",
    required: false,
    description: "Custom base URL for OpenAI-compatible providers or proxies.",
  },
  {
    name: "AUTH_SECRET",
    tier: "system",
    required: true,
    description: "Secret used by Auth.js to sign tokens and cookies.",
  },
  {
    name: "AUTH_URL",
    tier: "system",
    required: false,
    description: "Server-side base URL for auth callbacks.",
  },
  {
    name: "AUTH_RESEND_KEY",
    tier: "system",
    required: false,
    description: "Resend API key for OTP and notification emails.",
  },
  {
    name: "OIDC_ISSUER",
    tier: "system",
    required: false,
    description: "OIDC issuer URL for optional SSO integration.",
  },
  {
    name: "OIDC_CLIENT_ID",
    tier: "system",
    required: false,
    description: "OIDC client ID for optional SSO integration.",
  },
  {
    name: "OIDC_CLIENT_SECRET",
    tier: "system",
    required: false,
    description: "OIDC client secret for optional SSO integration.",
  },
  {
    name: "LOCAL_STORAGE_PATH",
    tier: "system",
    required: false,
    description: "Filesystem path for locally stored uploads.",
  },
  {
    name: "TRUSTED_PROXY",
    tier: "system",
    required: false,
    description: "Trusted proxy chain used for client IP extraction.",
  },
  {
    name: "TZ",
    tier: "system",
    required: false,
    description: "Process timezone for server-side date formatting.",
  },
  {
    name: "AI_MODEL_TEXT",
    tier: "runtime",
    required: false,
    description: "Default text model for server-side AI workflows.",
  },
  {
    name: "AI_MODEL_VISION",
    tier: "runtime",
    required: false,
    description: "Default vision model for image understanding.",
  },
  {
    name: "AI_MAX_RETRIES",
    tier: "runtime",
    required: false,
    description: "Maximum retry attempts for AI requests.",
  },
  {
    name: "AI_RETRY_DELAY_MS",
    tier: "runtime",
    required: false,
    description: "Base backoff delay for AI retries in milliseconds.",
  },
  {
    name: "AI_TEMPERATURE",
    tier: "runtime",
    required: false,
    description: "Default creativity level for structured AI tasks.",
  },
  {
    name: "SOURCE_DOC_STALE_TIME_MS",
    tier: "runtime",
    required: false,
    description: "Client cache stale time for source document queries.",
  },
  {
    name: "CURRENCY_STALE_TIME_MS",
    tier: "runtime",
    required: false,
    description: "Client cache stale time for currency rate queries.",
  },
  {
    name: "OTP_EXPIRES_SECONDS",
    tier: "runtime",
    required: false,
    description: "OTP expiration window in seconds.",
  },
  {
    name: "OTP_LOCKOUT_MINUTES",
    tier: "runtime",
    required: false,
    description: "Lockout duration after repeated OTP failures.",
  },
  {
    name: "OTP_MAX_ATTEMPTS",
    tier: "runtime",
    required: false,
    description: "Maximum allowed OTP verification attempts.",
  },
  {
    name: "OTP_RESEND_COOLDOWN_SECONDS",
    tier: "runtime",
    required: false,
    description: "Cooldown before the same email can request another OTP.",
  },
  {
    name: "AUTH_RATE_LIMIT_MAX",
    tier: "runtime",
    required: false,
    description: "Maximum OTP send attempts per rate-limit window.",
  },
  {
    name: "AUTH_RATE_LIMIT_WINDOW",
    tier: "runtime",
    required: false,
    description: "OTP send rate-limit window in seconds.",
  },
  {
    name: "API_RATE_LIMIT_PER_MINUTE",
    tier: "runtime",
    required: false,
    description: "Per-minute rate limit for API v1 endpoints.",
  },
  {
    name: "OTP_IP_MAX_ATTEMPTS_PER_HOUR",
    tier: "runtime",
    required: false,
    description: "Per-IP OTP send limit within one hour.",
  },
  {
    name: "OTP_VERIFY_MAX_ATTEMPTS_PER_MINUTE",
    tier: "runtime",
    required: false,
    description: "Per-IP OTP verification limit within one minute.",
  },
  {
    name: "SESSION_MAX_AGE_DAYS",
    tier: "runtime",
    required: false,
    description: "Maximum session lifetime in days.",
  },
  {
    name: "DISABLE_REGISTRATION",
    tier: "runtime",
    required: false,
    description: "Feature flag to disable new user registrations.",
  },
  {
    name: "AUTH_EMAIL_FROM",
    tier: "runtime",
    required: false,
    description:
      "Sender mailbox for OTP and security notifications. Supports bare email or Display Name <email>.",
  },
  {
    name: "MAX_TASK_WORKER",
    tier: "runtime",
    required: false,
    description: "Maximum number of concurrent background task workers.",
  },
  {
    name: "EXPORT_MAX_ENTRIES",
    tier: "runtime",
    required: false,
    description: "Maximum number of ledger entries exported in one request.",
  },
  {
    name: "MAX_INPUT_PIXELS",
    tier: "runtime",
    required: false,
    description: "Maximum input pixels allowed for image processing.",
  },
  {
    name: "MAX_IMAGE_QUALITY",
    tier: "runtime",
    required: false,
    description: "Output image quality for local image processing.",
  },
  {
    name: "LOG_LEVEL",
    tier: "runtime",
    required: false,
    description: "Pino log level for server logs.",
  },
  {
    name: "NEXT_PUBLIC_APP_URL",
    tier: "frontend",
    required: false,
    description: "Public application URL exposed to the browser bundle.",
  },
  {
    name: "NEXT_PUBLIC_OIDC_ENABLED",
    tier: "frontend",
    required: false,
    description: "Controls whether the login page renders the SSO button.",
  },
  {
    name: "NEXT_PUBLIC_OIDC_BUTTON_NAME",
    tier: "frontend",
    required: false,
    description: "Label used for the login page and provider SSO button.",
  },
];

export const APP_ENV_CATALOG_BY_NAME = new Map(
  APP_ENV_CATALOG.map((entry) => [entry.name, entry] as const)
);

export function getEnvCatalogEntry(name: string): EnvCatalogEntry | undefined {
  return APP_ENV_CATALOG_BY_NAME.get(name);
}
