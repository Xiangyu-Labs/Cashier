# Cashier - AI Intelligent Bookkeeping Assistant

Cashier is a modern, AI-powered bookkeeping application designed to streamline personal finance management. It uses advanced LLMs to parse receipts and invoices, automatically categorizing and recording expenses.

## Features

- **AI-Powered Entry**: Simply upload a receipt or type a natural language description, and Cashier will extract date, amount, merchants, and items.
- **Multi-User Support**: Secure email-based authentication (Magic Links) supporting multiple users with isolated data.
- **Device Management**: Detailed session tracking with ability to revoke specific devices.
- **Multi-Currency**: Automatic currency conversion and management.
- **Global Search**: Unified search across all your documents and transactions.

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

### Environment Variables

Copy `.env.example` to `.env.local` and fill in the required values:

```bash
cp .env.example .env.local
```

Key variables:

```bash
# Database (SQLite file path)
DATABASE_URL="file:./data/sqlite.db"

# Auth
AUTH_SECRET="your-secret-key"  # Generate with `openssl rand -base64 32`
AUTH_URL="http://localhost:3000"
AUTH_RESEND_KEY="re_..."       # Resend API Key for emails

# AI
OPENAI_API_KEY="sk-..."
```

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

### Development (with hot reload)

```bash
cp .env.example .env.local
# Edit .env.local with your API keys
npm run docker:dev
```

### Production

```bash
cp .env.example .env.production
# Edit .env.production with production values
npm run docker:prod
```

Or manually:

```bash
docker compose up -d --build
```

### Docker Commands

| Command                | Description                          |
| ---------------------- | ------------------------------------ |
| `npm run docker:dev`   | Start dev container with hot reload  |
| `npm run docker:prod`  | Build and start production container |
| `npm run docker:build` | Build production image only          |
| `npm run docker:down`  | Stop and remove containers           |

## Testing

Tests use in-memory SQLite, no external database required.

```bash
npm run test        # Watch mode
npm run test:run    # Single run
npm run test:coverage  # With coverage
```

## Documentation

- [CLAUDE.md](./CLAUDE.md) - Development guide and architecture overview
- [HTTP API Guide](./docs/guides/HTTP_API.md) - Current HTTP routes, auth model, query params, and test coverage
- [Error Handling Guide](./docs/guides/ERROR_HANDLING.md) - Standardized error patterns
- [Task Handler Guide](./docs/guides/TASK_HANDLERS.md) - Creating background task handlers
- [Future Plan](./future_plan.md) - Roadmap and upcoming features.

## License

Private
