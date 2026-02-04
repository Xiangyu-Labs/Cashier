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

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run test` | Run tests in watch mode |
| `npm run test:run` | Run tests once |
| `npm run db:push` | Push schema to database |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run docker:dev` | Start Docker dev environment |

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
