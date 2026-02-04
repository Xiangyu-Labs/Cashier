# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cashier is an AI-powered bookkeeping application that uses LLMs to parse receipts and invoices, automatically categorizing and recording expenses. Built with Next.js 16 (App Router), TypeScript, SQLite/Drizzle ORM, and OpenAI.

## Commands

```bash
# Development
npm run dev              # Start dev server
npm run build            # Production build
npm run lint             # ESLint

# Testing (uses in-memory SQLite)
npm run test             # Watch mode
npm run test:run         # Single run
npm run test:coverage    # With coverage

# Database (Drizzle ORM)
npm run db:push          # Push schema changes
npm run db:generate      # Generate migrations
npm run db:migrate       # Run migrations
npm run db:studio        # Launch Drizzle Studio GUI

# Docker
npm run docker:dev       # Dev with hot reload
npm run docker:prod      # Production deployment
```

## Architecture

### Directory Structure
- `src/app/[locale]/` - Next.js App Router with i18n (next-intl). All routes are locale-prefixed.
- `src/features/` - Domain modules (ledger, source-document, ai, etc.). Each contains feature-specific components, hooks, and logic.
- `src/lib/` - Core infrastructure: `db/` (Drizzle schema), `store/` (Zustand), `auth/` (Auth.js config), `logger.ts` (Pino)
- `src/components/` - Shared UI components (Shadcn/ui primitives)
- `messages/` - Translation files for next-intl
- `data/` - SQLite database file location

### Key Patterns
- **Feature-based organization**: Domain logic grouped under `src/features/` rather than global folders
- **Localized routing**: All routes wrapped in `[locale]` segment (e.g., `/en/dashboard`)
- **Type safety**: Zod for validation (forms, API responses, env vars), Drizzle for type-safe SQL
- **State management**: Zustand for client state, TanStack Query for server state
- **Authentication**: Auth.js v5 with Magic Link via Resend

### Environment Variables
Required in `.env.local`:
- `DATABASE_URL` - SQLite path (e.g., `file:./data/sqlite.db`)
- `AUTH_SECRET` - Session signing key
- `AUTH_RESEND_KEY` - Resend API key for Magic Links
- `OPENAI_API_KEY` - For AI features
