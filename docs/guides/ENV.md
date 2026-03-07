# Environment Variables Reference

Complete reference for all environment variables used in Cashier.

> **Source of Truth**: This document is auto-generated from `.env.example`.
> **Last Updated**: 2026-03-05

## Quick Reference

| Category | Variables | Required |
|----------|-----------|----------|
| [Database](#database) | 1 | 1 |
| [OpenAI Configuration](#openai-configuration) | 6 | 1 |
| [Authentication](#authentication) | 7 | 4 |
| [App Configuration](#app-configuration) | 4 | 1 |

---

## Database

### `DATABASE_URL`

| | Value |
|---|---|
| **Required** | Yes |
| **Default** | `file:./data/sqlite.db` |
| **Description** | SQLite database file path (relative to project root) |
| **Example** | `file:./data/sqlite.db`, `file:/absolute/path/to/db.sqlite` |

The database file will be created automatically if it doesn't exist. Ensure the parent directory is writable.

---

## OpenAI Configuration

### `OPENAI_API_KEY`

| | Value |
|---|---|
| **Required** | Yes |
| **Default** | None |
| **Description** | Your OpenAI API key for AI-powered receipt parsing |
| **Example** | `sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |

Get your API key from [OpenAI Dashboard](https://platform.openai.com/api-keys).

### `OPENAI_BASE_URL`

| | Value |
|---|---|
| **Required** | No |
| **Default** | `https://api.openai.com/v1` |
| **Description** | Custom base URL for OpenAI-compatible APIs |
| **Example** | `https://api.groq.com/openai/v1`, `https://api.deepseek.com` |

Use this for proxy servers or compatible APIs like Groq, DeepSeek, or Azure OpenAI.

### `AI_MODEL_TEXT`

| | Value |
|---|---|
| **Required** | No |
| **Default** | `gpt-4o-mini` |
| **Description** | Text-only model for business logic (parsing, arbitration, categorization) |
| **Example** | `gpt-4o-mini`, `deepseek-chat`, `gpt-4` |

This model handles all text-based AI operations. When `AI_MODEL_VISION` is set, this model doesn't need vision support, allowing use of cheaper text-only models.

### `AI_MODEL_VISION`

| | Value |
|---|---|
| **Required** | No |
| **Default** | `gpt-4o` |
| **Description** | Vision-capable model for image description/transcription |
| **Example** | `gpt-4o`, `gpt-4-vision-preview` |

Called once per document to extract text from images. When set, downstream stages use `AI_MODEL_TEXT` instead of sending images directly, reducing costs.

> **Note**: If not set, `AI_MODEL_TEXT` must support vision (fallback to single-model behavior).

### `AI_MAX_RETRIES`

| | Value |
|---|---|
| **Required** | No |
| **Default** | `3` |
| **Description** | Maximum retry attempts for AI API calls |
| **Example** | `3`, `5` |

Number of retries before giving up on an AI request.

### `AI_RETRY_DELAY_MS`

| | Value |
|---|---|
| **Required** | No |
| **Default** | `1000` |
| **Description** | Delay between retry attempts in milliseconds |
| **Example** | `1000` (1 second), `2000` (2 seconds) |

---

## Authentication

Cashier uses Auth.js (NextAuth) v5 with OTP-based email authentication.

### `AUTH_SECRET`

| | Value |
|---|---|
| **Required** | Yes |
| **Default** | None |
| **Description** | Secret key for signing cookies and tokens |
| **Generate** | `openssl rand -base64 32` |

**Critical**: Must be set in production. Generate a secure random string.

### `AUTH_URL`

| | Value |
|---|---|
| **Required** | Yes |
| **Default** | `http://localhost:3000` |
| **Description** | Base URL for auth callbacks |
| **Example** | `http://localhost:3000`, `https://cashier.example.com` |

Must match your application's public URL.

### `AUTH_RESEND_KEY`

| | Value |
|---|---|
| **Required** | Yes (for email OTP) |
| **Default** | None |
| **Description** | Resend API key for sending OTP emails |
| **Example** | `re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |

Get your API key from [Resend Dashboard](https://resend.com/api-keys).

### `AUTH_EMAIL_FROM`

| | Value |
|---|---|
| **Required** | Yes (for email OTP) |
| **Default** | `noreply@example.com` |
| **Description** | Email address for sending OTPs |
| **Example** | `auth@yourdomain.com`, `noreply@cashier.app` |

Must be a verified domain in your Resend account.

### `AUTH_RATE_LIMIT_MAX`

| | Value |
|---|---|
| **Required** | No |
| **Default** | `5` |
| **Description** | Maximum login attempts per window |
| **Example** | `5`, `10` |

### `AUTH_RATE_LIMIT_WINDOW`

| | Value |
|---|---|
| **Required** | No |
| **Default** | `60` |
| **Description** | Rate limit window in seconds |
| **Example** | `60` (1 minute), `300` (5 minutes) |

### `DISABLE_REGISTRATION`

| | Value |
|---|---|
| **Required** | No |
| **Default** | `false` |
| **Description** | Set to `true` to disable new user registrations |
| **Example** | `true`, `false` |

Useful for private instances or maintenance mode.

---

## App Configuration

### `NEXT_PUBLIC_APP_URL`

| | Value |
|---|---|
| **Required** | Yes |
| **Default** | `http://localhost:3000` |
| **Description** | Public application URL (accessible from browser) |
| **Example** | `http://localhost:3000`, `https://cashier.example.com` |

Used for generating absolute URLs in emails and meta tags. Must include protocol (`http://` or `https://`).

### `LOG_LEVEL`

| | Value |
|---|---|
| **Required** | No |
| **Default** | `info` |
| **Description** | Logging verbosity level |
| **Options** | `debug`, `info`, `warn`, `error` |

| Level | Description |
|-------|-------------|
| `debug` | All messages including detailed debugging info |
| `info` | General operational messages (default) |
| `warn` | Warning messages and above |
| `error` | Error messages only |

### `APP_DOMAIN`

| | Value |
|---|---|
| **Required** | No |
| **Default** | `localhost` |
| **Description** | Application domain (without protocol) |
| **Example** | `localhost`, `cashier.example.com` |

Used for cookie domain settings and CORS configuration.

### `MAX_TASK_WORKER`

| | Value |
|---|---|
| **Required** | No |
| **Default** | `10` |
| **Description** | Maximum concurrent background task workers |
| **Example** | `10`, `5`, `0` (unlimited) |

Controls parallelism for AI parsing and other background tasks. Lower values reduce memory usage but may slow down batch processing.

---

## Environment-Specific Examples

### Development

```bash
# .env.local
DATABASE_URL=file:./data/sqlite.db
OPENAI_API_KEY=sk-...
AUTH_SECRET=$(openssl rand -base64 32)
AUTH_URL=http://localhost:3000
AUTH_RESEND_KEY=re_...
AUTH_EMAIL_FROM=noreply@example.com
NEXT_PUBLIC_APP_URL=http://localhost:3000
LOG_LEVEL=debug
```

### Production

```bash
# .env.production
DATABASE_URL=file:./data/sqlite.db
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1
AI_MODEL_TEXT=gpt-4o-mini
AI_MODEL_VISION=gpt-4o
AI_MAX_RETRIES=3
AI_RETRY_DELAY_MS=1000
AUTH_SECRET=$(openssl rand -base64 32)
AUTH_URL=https://cashier.example.com
AUTH_RESEND_KEY=re_...
AUTH_EMAIL_FROM=auth@example.com
AUTH_RATE_LIMIT_MAX=5
AUTH_RATE_LIMIT_WINDOW=60
DISABLE_REGISTRATION=false
NEXT_PUBLIC_APP_URL=https://cashier.example.com
LOG_LEVEL=warn
APP_DOMAIN=cashier.example.com
MAX_TASK_WORKER=10
```

### Private Instance (No Registration)

```bash
DISABLE_REGISTRATION=true
AUTH_RATE_LIMIT_MAX=10
```

---

## Security Best Practices

1. **Never commit `.env.local` or `.env.production`** - They are in `.gitignore` by default
2. **Rotate `AUTH_SECRET`** - Change quarterly or after security incidents
3. **Use separate API keys** - Different keys for development and production
4. **Restrict Resend domains** - Only verify domains you control
5. **Monitor API usage** - Set up alerts for unexpected OpenAI usage

## Troubleshooting

### "Missing required environment variable"

Check that all [required variables](#quick-reference) are set in your `.env.local` or `.env.production` file.

### "Invalid OpenAI API key"

- Verify the key is valid at [OpenAI Dashboard](https://platform.openai.com/api-keys)
- Check the key has available credits
- Ensure `OPENAI_BASE_URL` is correct if using a proxy

### "Auth.js error: Missing secret"

Generate and set `AUTH_SECRET`:
```bash
openssl rand -base64 32
```

### "Email not sending"

- Verify `AUTH_RESEND_KEY` is valid
- Check `AUTH_EMAIL_FROM` domain is verified in Resend
- Ensure `AUTH_URL` matches your actual domain
