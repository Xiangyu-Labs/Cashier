# Environment Variables Reference

Complete reference for all environment variables used in Cashier.

## Configuration Tiers

Cashier organizes configuration into three tiers:

| Tier         | Storage                                | Purpose                                               | Change Method                                    |
| ------------ | -------------------------------------- | ----------------------------------------------------- | ------------------------------------------------ |
| **System**   | `.env.local`                           | Sensitive keys, API credentials, database connections | Edit file → Restart                              |
| **Runtime**  | `.env.local` (now) → Database (future) | Business logic settings, thresholds, feature flags    | Edit file → Restart (now) / Admin panel (future) |
| **Frontend** | `.env.local`                           | Build-time constants exposed to browser               | Edit file → Rebuild                              |

---

## System Configuration

### Database

#### `DATABASE_URL`

|                 | Value                                                       |
| --------------- | ----------------------------------------------------------- |
| **Required**    | Yes                                                         |
| **Default**     | `file:./data/sqlite.db`                                     |
| **Description** | SQLite database file path                                   |
| **Example**     | `file:./data/sqlite.db`, `file:/absolute/path/to/db.sqlite` |

The database file will be created automatically if it doesn't exist.

---

### OpenAI Configuration

#### `OPENAI_API_KEY`

|                 | Value                                              |
| --------------- | -------------------------------------------------- |
| **Required**    | Yes                                                |
| **Default**     | None                                               |
| **Description** | Your OpenAI API key for AI-powered receipt parsing |

Get your API key from [OpenAI Dashboard](https://platform.openai.com/api-keys).

#### `OPENAI_BASE_URL`

|                 | Value                                      |
| --------------- | ------------------------------------------ |
| **Required**    | No                                         |
| **Default**     | `https://api.openai.com/v1`                |
| **Description** | Custom base URL for OpenAI-compatible APIs |

Use this for proxy servers or compatible APIs like Groq, DeepSeek.

#### `AI_MODEL_TEXT`

|                 | Value                              |
| --------------- | ---------------------------------- |
| **Required**    | No                                 |
| **Default**     | `gpt-4o-mini`                      |
| **Description** | Text-only model for business logic |

#### `AI_MODEL_VISION`

|                 | Value                                      |
| --------------- | ------------------------------------------ |
| **Required**    | No                                         |
| **Default**     | `gpt-4o`                                   |
| **Description** | Vision-capable model for image description |

Called once per document. When set, downstream stages use `AI_MODEL_TEXT` instead.

#### `AI_MAX_RETRIES`

|                 | Value                                   |
| --------------- | --------------------------------------- |
| **Required**    | No                                      |
| **Default**     | `3`                                     |
| **Description** | Maximum retry attempts for AI API calls |

#### `AI_RETRY_DELAY_MS`

|                 | Value                                        |
| --------------- | -------------------------------------------- |
| **Required**    | No                                           |
| **Default**     | `1000`                                       |
| **Description** | Delay between retry attempts in milliseconds |

---

### Authentication - Core

#### `AUTH_SECRET`

|                 | Value                                     |
| --------------- | ----------------------------------------- |
| **Required**    | Yes                                       |
| **Default**     | None                                      |
| **Description** | Secret key for signing cookies and tokens |
| **Generate**    | `openssl rand -base64 32`                 |

**Critical**: Must be set in production.

#### `AUTH_RESEND_KEY`

|                 | Value                                 |
| --------------- | ------------------------------------- |
| **Required**    | Yes (for email OTP)                   |
| **Default**     | None                                  |
| **Description** | Resend API key for sending OTP emails |

Get your API key from [Resend Dashboard](https://resend.com/api-keys).

#### `AUTH_EMAIL_FROM`

|                 | Value                          |
| --------------- | ------------------------------ |
| **Required**    | No                             |
| **Default**     | `noreply@example.com`          |
| **Description** | Email address for sending OTPs |

Must be a verified domain in your Resend account.

#### `DISABLE_REGISTRATION`

|                 | Value                                           |
| --------------- | ----------------------------------------------- |
| **Required**    | No                                              |
| **Default**     | `false`                                         |
| **Description** | Set to `true` to disable new user registrations |

---

### Authentication - OIDC/SSO (Optional)

Leave all three empty to disable SSO.

| Variable             | Description                                             |
| -------------------- | ------------------------------------------------------- |
| `OIDC_ISSUER`        | OIDC provider URL (e.g., `https://auth.yourdomain.com`) |
| `OIDC_CLIENT_ID`     | Client ID from your OIDC provider                       |
| `OIDC_CLIENT_SECRET` | Client secret from your OIDC provider                   |

---

### Storage & Network

#### `LOCAL_STORAGE_PATH`

|                 | Value                                              |
| --------------- | -------------------------------------------------- |
| **Required**    | No                                                 |
| **Default**     | `./data/uploads`                                   |
| **Description** | Local file system path for storing uploaded images |

#### `TRUSTED_PROXY`

|                 | Value                                                |
| --------------- | ---------------------------------------------------- |
| **Required**    | No                                                   |
| **Default**     | None                                                 |
| **Description** | Trusted proxy IP/range for extracting real client IP |
| **Example**     | `10.0.0.0/8`, `172.16.0.0/12`                        |

---

## Runtime Configuration

These settings control business logic and will migrate to an admin panel in future phases.

### OTP Settings

| Variable                      | Default | Description                               |
| ----------------------------- | ------- | ----------------------------------------- |
| `OTP_EXPIRES_SECONDS`         | `300`   | OTP expiration time (5 minutes)           |
| `OTP_LOCKOUT_MINUTES`         | `15`    | Account lockout after max failed attempts |
| `OTP_MAX_ATTEMPTS`            | `5`     | Maximum OTP verification attempts         |
| `OTP_RESEND_COOLDOWN_SECONDS` | `60`    | Cooldown between resend requests          |
| `AUTH_RATE_LIMIT_MAX`         | `10`    | Max OTP sends per email per window        |
| `AUTH_RATE_LIMIT_WINDOW`      | `900`   | Rate limit window in seconds (15 minutes) |

### System Settings

| Variable          | Default | Description                                         |
| ----------------- | ------- | --------------------------------------------------- |
| `LOG_LEVEL`       | `info`  | Logging verbosity: `debug`, `info`, `warn`, `error` |
| `MAX_TASK_WORKER` | `10`    | Maximum concurrent background task workers          |

---

## Frontend Configuration

These variables are embedded in the JavaScript bundle at **build time**. Changing them requires a rebuild.

### `NEXT_PUBLIC_APP_URL`

|                 | Value                                          |
| --------------- | ---------------------------------------------- |
| **Required**    | Yes                                            |
| **Default**     | `http://localhost:3000`                        |
| **Description** | Public application URL accessible from browser |

### `NEXT_PUBLIC_OIDC_ENABLED`

|                 | Value                                        |
| --------------- | -------------------------------------------- |
| **Required**    | No                                           |
| **Default**     | `false`                                      |
| **Description** | Set to `true` to show SSO button in login UI |

### `NEXT_PUBLIC_OIDC_BUTTON_NAME`

|                 | Value                                  |
| --------------- | -------------------------------------- |
| **Required**    | No                                     |
| **Default**     | `SSO`                                  |
| **Description** | Text displayed on the SSO login button |

---

## Quick Examples

### Development

```bash
# System
DATABASE_URL=file:./data/sqlite.db
OPENAI_API_KEY=sk-...
AUTH_SECRET=$(openssl rand -base64 32)
AUTH_RESEND_KEY=re_...

# Runtime
LOG_LEVEL=debug

# Frontend
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Production

```bash
# System
DATABASE_URL=file:./data/sqlite.db
OPENAI_API_KEY=sk-...
AUTH_SECRET=$(openssl rand -base64 32)
AUTH_RESEND_KEY=re_...
AUTH_EMAIL_FROM=auth@example.com

# Runtime
OTP_EXPIRES_SECONDS=300
AUTH_RATE_LIMIT_MAX=10
DISABLE_REGISTRATION=false
LOG_LEVEL=warn
MAX_TASK_WORKER=10

# Frontend
NEXT_PUBLIC_APP_URL=https://cashier.example.com
```

---

## Security Best Practices

1. **Never commit `.env.local`** - It's in `.gitignore` by default
2. **Rotate `AUTH_SECRET`** - Change quarterly or after security incidents
3. **Use separate API keys** - Different keys for development and production
4. **Restrict Resend domains** - Only verify domains you control
5. **System configs are server-only** - Never prefix sensitive variables with `NEXT_PUBLIC_`

## Troubleshooting

### "Missing required environment variable"

Check that all required System Configuration variables are set.

### "Invalid OpenAI API key"

- Verify the key at [OpenAI Dashboard](https://platform.openai.com/api-keys)
- Check available credits
- Ensure `OPENAI_BASE_URL` is correct if using a proxy

### "Auth.js error: Missing secret"

Generate `AUTH_SECRET`:

```bash
openssl rand -base64 32
```

### "Email not sending"

- Verify `AUTH_RESEND_KEY` is valid
- Check `AUTH_EMAIL_FROM` domain is verified in Resend
