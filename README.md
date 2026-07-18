# Cashier - AI Intelligent Bookkeeping Assistant

Cashier is a modern, AI-powered bookkeeping application designed to streamline personal finance management. It uses advanced LLMs to parse receipts and invoices, automatically categorizing and recording expenses.

## Features

- **AI-Powered Entry**: Upload a receipt or type a natural language description, and Cashier extracts dates, amounts, merchants, and items.
- **Email OTP Authentication**: Secure email verification-code login with isolated user data.
- **Multi-Currency**: Automatic currency conversion and management.
- **Service Credentials**: Create scoped API credentials for automation against the current ledger.

## Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router)
- **Database**: SQLite (via [Drizzle ORM](https://orm.drizzle.team/) + better-sqlite3)
- **Auth**: [Auth.js v5](https://authjs.dev/) (NextAuth)
- **UI**: Tailwind CSS, Radix UI, Shadcn/ui
- **AI**: OpenAI / LLM Integration

## Getting Started

### Prerequisites

- Node.js 20+
- npm or pnpm

### Configuration

Copy `.env.example` to `.env.local` and fill in the values you need:

```bash
cp .env.example .env.local
```

- Canonical key list and descriptions: `src/lib/env/catalog.ts`
- Startup validation rules: `src/lib/env/startup.ts`
- Example defaults and comments: `.env.example`

### Installation

1. Install dependencies:

   ```bash
   npm install
   ```

2. Set up the database:

   ```bash
   npm run db:push
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Docker Deployment

### Production

```bash
cp .env.example .env
# Edit .env with production values
npm run docker:prod
```

Or manually:

```bash
docker compose up -d --build
```

### Docker Commands

| Command                | Description                          |
| ---------------------- | ------------------------------------ |
| `npm run docker:prod`  | Build and start production container |
| `npm run docker:build` | Build production image only          |
| `npm run docker:down`  | Stop and remove containers           |

> **Note:** The Compose service uses `expose` (container-internal) rather than `ports` (host-facing). For production behind a reverse proxy (nginx, Caddy), the current setup is correct. For direct host access (local testing), add `ports: - "3000:3000"` to `docker-compose.yml`.

## Testing

Tests use in-memory SQLite, no external database required.

```bash
npm run test        # Watch mode
npm run test:run    # Single run
npm run test:coverage  # With coverage
```

## Documentation

- [CLAUDE.md](./CLAUDE.md) - Working conventions for agents in this repository
- [docs/architecture/PRD.md](./docs/architecture/PRD.md) - Current product scope, flows, and domain terms
- [docs/architecture/UI.md](./docs/architecture/UI.md) - UI and interaction reference
- [docs/architecture/coding-patterns.md](./docs/architecture/coding-patterns.md) - Durable engineering rules
- [docs/operations/runbook.md](./docs/operations/runbook.md) - Operations runbook for local running, migrations, backup, and deployment

## Processing

Source document parsing (AI-powered receipt/expense extraction) uses the following architecture:

- **Hosting**: Currently Docker. The runtime is Vercel-compatible and will migrate when production-ready.
- **Scheduling**: Processing is scheduled via Next.js `after()` at request boundaries — runs after the HTTP response is sent, no blocking.
- **No global drain loop**: Each submission creates a processing intent and executes it directly. No background worker or external queue drains pending rows.
- **Idempotency**: Processing intents support idempotent dispatch, claim-based concurrency control, and lease expiry to handle restarts.
- **Vercel-compatible**: The `after()`-based scheduling works within Vercel's serverless runtime without modification. If `maxDuration` limits are insufficient, a Queue/Worker path is designed but deferred until measured.

## License

Private
