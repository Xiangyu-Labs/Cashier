# Development Setup Guide

Cashier uses a **simple development environment** with SQLite (no external database required).

## Prerequisites

1. **Node.js**: v20 or higher
2. **npm**: Comes with Node.js

> **Optional**: Docker Desktop for containerized development

## Quick Start

### 1. Clone and Install

```bash
git clone <repo-url>
cd cashier
npm install
```

### 2. Environment Configuration

```bash
cp .env.example .env.local
```

Edit `.env.local` with your API keys:

```bash
# Required
AUTH_SECRET=your-secret-key    # Generate: openssl rand -base64 32
OPENAI_API_KEY=sk-...          # Your OpenAI key
AUTH_RESEND_KEY=re_...         # Resend API key for emails

# Optional
DATABASE_URL=file:./data/sqlite.db  # Default SQLite path
```

### 3. Initialize Database

```bash
npm run db:push
```

### 4. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Docker Development (Alternative)

For isolated development with Docker:

```bash
npm run docker:dev
```

This mounts your source code with hot reload support.

<!-- AUTO-GENERATED: Synced from package.json -->

## Available Scripts

| Command                 | Description                              |
| ----------------------- | ---------------------------------------- |
| `npm run dev`           | Start development server with hot reload |
| `npm run build`         | Production build with type checking      |
| `npm run start`         | Start production server                  |
| `npm run lint`          | Run ESLint                               |
| `npm test`              | Run tests in watch mode                  |
| `npm run test:run`      | Run tests once                           |
| `npm run test:coverage` | Run tests with coverage report           |
| `npm run db:push`       | Push schema changes to database          |
| `npm run db:generate`   | Generate Drizzle migrations              |
| `npm run db:migrate`    | Run Drizzle migrations                   |
| `npm run db:studio`     | Launch Drizzle Studio GUI                |
| `npm run db:drop`       | Drop database (use with caution)         |
| `npm run docker:dev`    | Start dev container with hot reload      |
| `npm run docker:build`  | Build Docker image only                  |
| `npm run docker:prod`   | Build and start production container     |
| `npm run docker:down`   | Stop and remove containers               |

<!-- END AUTO-GENERATED -->

## Troubleshooting

### "Database Error"

- Database file is created automatically in `./data/sqlite.db`
- Ensure the `./data` directory is writable

### "Auth.js Error"

- Generate a new secret: `openssl rand -base64 32`
- Add it to `AUTH_SECRET` in `.env.local`

### "OPENAI_API_KEY not set"

- Ensure you've added your API key to `.env.local`
- Check the key is valid and has credits
