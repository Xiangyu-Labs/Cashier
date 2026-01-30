# Cashier - AI Intelligent Bookkeeping Assistant

Cashier is a modern, AI-powered bookkeeping application designed to streamline personal finance management. It uses advanced LLMs to parse receipts and invoices, automatically categorizing and recording expenses.

## Features

- **AI-Powered Entry**: simply upload a receipt or type a natural language description, and Cashier will extract date, amount, merchants, and items.
- **Multi-User Support**: Secure email-based authentication (Magic Links) supporting multiple users with isolated data.
- **Device Management**: detailed session tracking with ability to revoke specific devices.
- **Multi-Currency**: Automatic currency conversion and management.
- **Global Search**: Unified search across all your documents and transactions.

## Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router)
- **Database**: PostgreSQL (via [Drizzle ORM](https://orm.drizzle.team/))
- **Auth**: [Auth.js v5](https://authjs.dev/) (NextAuth)
- **UI**: Tailwind CSS, Radix UI, Shadcn/ui
- **Async Jobs**: BullMQ + Redis
- **AI**: OpenAI / LLM Integration

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL
- Redis (for rate limiting and job queues)

### Environment Variables

Copy `.env.example` to `.env` and fill in the required values:

```bash
# Database
DATABASE_URL="postgres://user:pass@localhost:5432/cashier"
REDIS_URL="redis://localhost:6379"

# Auth
AUTH_SECRET="your-secret-key" # Generate with `npx auth secret`
AUTH_URL="http://localhost:3000"
AUTH_RESEND_KEY="re_..." # Resend API Key for emails
AUTH_EMAIL_FROM="Login <login@yourdomain.com>"

# App Settings
DISABLE_REGISTRATION="false" # Set to "true" to disable new signups
MAGIC_LINK_EXPIRES_SECONDS="900"
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

## Documentation

- [Future Plan](./future_plan.md) - Roadmap and upcoming features.
- [Task List](./task.md) - Current development progress.

## License

Private
