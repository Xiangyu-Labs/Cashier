/**
 * Application constants
 *
 * Centralized constants to avoid magic numbers throughout the codebase
 */

// Time constants (milliseconds)
export const TIME = {
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  WEEK: 7 * 24 * 60 * 60 * 1000,
} as const;

// Time constants (seconds)
export const TIME_SECONDS = {
  MINUTE: 60,
  HOUR: 3600,
  DAY: 86400,
  WEEK: 604800,
  MONTH: 30 * 24 * 60 * 60, // 30 days
} as const;

// File size limits
export const FILE_SIZE = {
  KB: 1024,
  MB: 1024 * 1024,
  MAX_IMAGE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_RESPONSE_SIZE: 10 * 1024 * 1024, // 10MB
} as const;

// Retry configuration
export const RETRY = {
  DEFAULT_RETRIES: 3,
  DEFAULT_DELAY_MS: 1000,
} as const;

// Pagination
export const PAGINATION = {
  DEFAULT_PAGE_LIMIT: 1000,
} as const;

// Validation
export const VALIDATION = {
  MAX_EMAIL_LENGTH: 254,
} as const;

// Task processing
export const TASK = {
  DEFAULT_CONCURRENCY: 10,
  LOG_TRUNCATE_LENGTH: 1000,
} as const;

// Formatting
export const FORMAT = {
  THOUSAND: 1000,
} as const;

// Calendar
export const CALENDAR = {
  STALE_TIME_MS: 5 * 60 * 1000, // 5 minutes
} as const;

// Ledger
export const LEDGER = {
  STALE_TIME_MS: 10 * 60 * 1000, // 10 minutes
} as const;

// UI
export const UI = {
  COPY_FEEDBACK_DURATION_MS: 2000, // 2 seconds
} as const;

// Query cache configuration
export const QUERY = {
  /** 默认staleTime - 5分钟 */
  DEFAULT_STALE_TIME_MS: 5 * 60 * 1000,
  /** Ledger数据staleTime - 10分钟（较稳定） */
  LEDGER_STALE_TIME_MS: 10 * 60 * 1000,
  /** 源文档staleTime - 2分钟（频繁变化但避免过度刷新） */
  SOURCE_DOC_STALE_TIME_MS: parseInt(process.env.SOURCE_DOC_STALE_TIME_MS ?? "120000", 10),
  /** 货币汇率staleTime - 4小时（外部数据，工作日变化较快） */
  CURRENCY_STALE_TIME_MS: parseInt(process.env.CURRENCY_STALE_TIME_MS ?? "14400000", 10),
} as const;

// AI Configuration
export const AI = {
  /** 默认 temperature - 结构化任务使用较低值提高确定性 */
  TEMPERATURE: parseFloat(process.env.AI_TEMPERATURE ?? "0.3"),
} as const;
