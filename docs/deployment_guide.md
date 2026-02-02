# Deployment Guide

Cashier is designed to be deployed as a containerized application using **Docker Compose**.

## 1. Architecture

We deploy two distinct services from the same codebase/image:

1.  **`app` (Web Server)**:
    -   Runs Next.js.
    -   Handles HTTP requests, API, and UI.
    -   **Config**: `ENABLE_WORKERS=false`.

2.  **`worker` (Background Process)**:
    -   Runs `src/worker.ts` via `npm run start:worker` (or equivalent).
    -   Handles heavy AI parsing tasks from Redis.
    -   **Config**: `ENABLE_WORKERS=true`.

*This separation ensures that heavy AI processing does not slow down the user interface.*

## 2. Production Checklist

### 2.1 Database
-   Ensure you have a persistent Postgres instance (managed RDS or volume-mounted).
-   Back up your `postgres_data` volume regularly.

### 2.2 Redis
-   Redis is **critical** for the job queue. If Redis data is lost, pending jobs are lost (but source documents remain in DB as 'queued').

### 2.3 Environment Variables
Security critical variables must be set in your CI/CD or production secrets manager (e.g., Coolify, Portainer, Kubernetes Secrets).

| Variable | Description |
| :--- | :--- |
| `AUTH_SECRET` | Generate a long random string. |
| `DATABASE_URL` | Production DB connection string. |
| `REDIS_URL` | Production Redis connection string. |
| `OPENAI_API_KEY` | Your AI provider key. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Public key for Web Push notifications. |
| `VAPID_PRIVATE_KEY` | Private key for Web Push notifications. |
| `FLOW_API_QUEUE_CONCURRENCY` | Max simultaneous GPT requests (Global). |
| `PROCESSING_WORKER_COUNT` | Number of worker threads per container. |
| `DISABLE_REGISTRATION` | Set to `true` if this is a private instance. |

## 3. Deployment with Docker Compose

We provide a production-ready `docker-compose.yml`.

1.  **Clone Repo** on server.
2.  **Create `.env`**: Fill in production values.
3.  **Run**:
    ```bash
    docker compose up -d --build
    ```

### Automatic Migrations
The `app` container is configured to run database migrations automatically on startup via `docker-entrypoint.sh`.
-   It executes `npm run db:migrate`, which applies SQL scripts from `src/lib/db/migrations`.
-   The `worker` container has `SKIP_MIGRATIONS=true` to prevent race conditions.

### 2.4 Database Backup
Automatic backups are handled by a dedicated `db-backup` container.
-   **Schedule**: Once every day (`@daily`).
-   **Storage**: Backups are saved as compressed `.sql.gz` files in the `./backups` directory on the host.
-   **Retention**: Keeps the last 7 days, 4 weeks, and 6 months of backups by default.

## 4. Updates & Rollbacks
To update the application:

1.  **Local**: Run `npm run db:generate` if there are schema changes, and commit the generated SQL files.
2.  **Server**: `git pull`
3.  **Deploy**: `docker compose up -d --build` (Zero-downtime is achievable if you use a reverse proxy like Traefik/Nginx in front).

## 5. Troubleshooting in Production

### View Logs
```bash
docker compose logs -f app
docker compose logs -f worker
```

### Restart Helper
If a job is stuck in `processing`:
-   Restarting the worker will *not* automatically retry stuck active jobs immediately (depending on BullMQ settings).
-   The system relies on "Stalled Job Detection" to eventually pick these up.
