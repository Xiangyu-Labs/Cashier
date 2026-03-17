# Contributing Guide

Thank you for your interest in contributing to Cashier! This guide will help you get started with the development environment and contribution process.

## Table of Contents

- [Development Setup](#development-setup)
- [Available Scripts](#available-scripts)
- [Testing](#testing)
- [Code Style](#code-style)
- [PR Submission Checklist](#pr-submission-checklist)

## Development Setup

### Prerequisites

1. **Node.js**: v20 or higher
2. **npm**: Comes with Node.js

> **Optional**: Docker Desktop for containerized development

### Quick Start

```bash
# 1. Clone and install
git clone <repo-url>
cd cashier
npm install

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local with your API keys

# 3. Initialize database
npm run db:push

# 4. Start development
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

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

### Docker Development (Alternative)

```bash
npm run docker:dev
```

This mounts your source code with hot reload support.

## Testing

We use **Vitest** for testing with **in-memory SQLite** for fast, isolated tests.

### Test Types

| Type                  | Location                         | Description                                     |
| --------------------- | -------------------------------- | ----------------------------------------------- |
| **Unit Tests**        | `tests/unit/**/*.test.ts`        | Single function logic, no database              |
| **Integration Tests** | `tests/integration/**/*.test.ts` | Server Actions, Database Queries, API Endpoints |

### Running Tests

```bash
# Watch mode
npm test

# Single run
npm run test:run

# With coverage (80%+ required)
npm run test:coverage

# Specific file
npx vitest run tests/unit/lib/date-utils.test.ts

# Tests matching a pattern
npx vitest run -t "should parse receipt"
```

### Test-Driven Development

We follow TDD workflow:

1. **Write test first** (RED)
2. **Run test** - it should FAIL
3. **Write minimal implementation** (GREEN)
4. **Run test** - it should PASS
5. **Refactor** (IMPROVE)
6. **Verify coverage** (80%+)

### Mocking AI

Never hit the real OpenAI API in tests. A global mock is provided in `tests/setup.ts`.

```typescript
import { vi } from "vitest";

vi.mocked(getOpenAIClient).mockReturnValue({
  generateContent: vi.fn().mockResolvedValue({ content: "Custom Result" }),
} as any);
```

## Code Style

### Immutability (CRITICAL)

Always create new objects, never mutate existing ones:

```typescript
// WRONG
function addItem(items: Item[], newItem: Item) {
  items.push(newItem); // Mutates original
  return items;
}

// CORRECT
function addItem(items: Item[], newItem: Item) {
  return [...items, newItem]; // Returns new array
}
```

### File Organization

- **Many small files** > few large files
- High cohesion, low coupling
- 200-400 lines typical, 800 max
- Organize by feature/domain, not by type

### Error Handling

Always handle errors comprehensively:

- Handle errors explicitly at every level
- Provide user-friendly error messages in UI-facing code
- Log detailed error context on the server side
- Never silently swallow errors

### Input Validation

Always validate at system boundaries:

- Validate all user input before processing
- Use schema-based validation (Zod) where available
- Fail fast with clear error messages
- Never trust external data

### Code Quality Checklist

Before submitting:

- [ ] Code is readable and well-named
- [ ] Functions are small (<50 lines)
- [ ] Files are focused (<800 lines)
- [ ] No deep nesting (>4 levels)
- [ ] Proper error handling
- [ ] No hardcoded values (use constants or config)
- [ ] No mutation (immutable patterns used)

## PR Submission Checklist

Before creating a pull request:

- [ ] **Tests pass**: `npm run test:run`
- [ ] **Coverage ≥ 80%**: `npm run test:coverage`
- [ ] **Linting passes**: `npm run lint`
- [ ] **Build succeeds**: `npm run build`
- [ ] **Type checking passes**: No TypeScript errors
- [ ] **Documentation updated**: If adding features or changing behavior
- [ ] **Commit messages follow convention**: `type: description`

### Commit Message Format

```
type: description

[optional body]
```

**Types**:

- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `docs`: Documentation only changes
- `test`: Adding or correcting tests
- `chore`: Build process or auxiliary tool changes
- `perf`: Performance improvement
- `ci`: CI/CD changes

### Example

```
feat: add batch operations to ledger entries

- Add multi-select for entries
- Implement bulk delete and category update
- Add confirmation dialog for destructive actions
```

## Troubleshooting

### Database Error

- Database file is created automatically in `./data/sqlite.db`
- Ensure the `./data` directory is writable

### Auth.js Error

- Generate a new secret: `openssl rand -base64 32`
- Add it to `AUTH_SECRET` in `.env.local`

### OpenAI_API_KEY not set

- Ensure you've added your API key to `.env.local`
- Check the key is valid and has credits

## Questions?

If you have questions, please:

1. Check existing documentation in `/docs`
2. Review the [CLAUDE.md](../CLAUDE.md) for architecture decisions
