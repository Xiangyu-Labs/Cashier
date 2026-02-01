# Development Setup Guide

Cashier uses a **Hybrid Development Environment**.
-   **Infrastructure**: Database and Redis run in Docker.
-   **Application**: Next.js runs natively on your host machine (for fast HMR).

## Prerequisites

1.  **Node.js**: v20 or higher.
2.  **Docker Desktop** (or Docker Engine).
3.  **Corepack**: Enable pnpm/yarn if preferred (project uses `npm` by default).

## Step 1: Clone and Install

```bash
git clone <repo-url>
cd cashier
npm install
```

## Step 2: Environment Configuration

We have two main config files:
-   `.env` -> Used by Docker Compose.
-   `.env.local` -> Used by Next.js locally.

### 2.1 Setup `.env` (Infra)
Copy the example file:
```bash
cp .env.example .env
```
This configures the Postgres/Redis passwords that Docker will use to *spin up* the containers. **You rarely need to change this.**

### 2.2 Setup `.env.local` (App)
Copy the example file:
```bash
cp .env.local.example .env.local
```
This configures how your local Next.js app connects to those containers.

> **Important**:
> If you change `POSTGRES_PASSWORD` in `.env`, you MUST update `DATABASE_URL` in `.env.local` to match!

## Step 3: Start Infrastructure

Start Postgres and Redis in the background:
```bash
npm run db:up
# Or manually: docker compose up -d db redis
```

Wait for them to be healthy:
```bash
docker compose ps
```

## Step 4: Initialize Database

Push the schema to your local database:
```bash
npm run db:push
```

## Step 5: Start Development Server

```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000).

## Troubleshooting

### "P3000: Database Error"
-   Ensure Docker container is running: `docker ps`.
-   Check if `DATABASE_URL` in `.env.local` matches the ports mapped in `docker-compose.yml` (default 5432).

### "Redis Connection Refused"
-   Ensure Redis is running on port 6379.
-   If you changed ports in `.env`, update `REDIS_URL` in `.env.local`.

### "Auth.js Error"
-   Generate a new secret: `npx auth secret`.
-   Add it to `AUTH_SECRET` in `.env.local`.

## Running Workers Locally

By default, the web process handles simple tasks. To test the full AI pipeline:
1.  Run the standalone worker:
    ```bash
    npx tsx src/worker.ts
    ```
