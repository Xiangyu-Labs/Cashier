# Deployment Guide

Cashier can be deployed as a containerized application using **Docker** or run directly with Node.js.

## Architecture

Cashier is a **simple, self-contained application**:

- **SQLite** database (file-based, no external DB required)
- Next.js handles both web requests and background AI processing
- No Redis or external queue system needed

## 1. Docker Deployment (Recommended)

### 1.1 Quick Start

```bash
# 1. Configure environment
cp .env.example .env.production
# Edit .env.production with your API keys

# 2. Deploy
docker compose up -d --build
```

### 1.2 Environment Variables

| Variable               | Description                                       | Required |
| ---------------------- | ------------------------------------------------- | -------- |
| `DATABASE_URL`         | SQLite path (default: `file:./data/sqlite.db`)    | No       |
| `AUTH_SECRET`          | Generate with `openssl rand -base64 32`           | Yes      |
| `AUTH_URL`             | Your domain (e.g., `https://cashier.example.com`) | Yes      |
| `OPENAI_API_KEY`       | OpenAI API key                                    | Yes      |
| `AUTH_RESEND_KEY`      | Resend API key for email OTP                      | Yes      |
| `DISABLE_REGISTRATION` | Set `true` for private instance                   | No       |

### 1.3 Data Persistence

SQLite data is stored in `./data/sqlite.db` and is mounted as a Docker volume.

**Backup**:

```bash
cp ./data/sqlite.db ./backups/sqlite-$(date +%Y%m%d).db
```

### 1.4 Automatic Migrations

The container runs database migrations automatically on startup via `docker-entrypoint.sh`.

- Set `SKIP_MIGRATIONS=true` to disable auto-migration.

## 2. Updates & Rollbacks

### Update Process

```bash
git pull
docker compose up -d --build
```

### Rollback

```bash
# Restore from backup
cp ./backups/sqlite-YYYYMMDD.db ./data/sqlite.db
docker compose restart app
```

## 3. Development with Docker

For development with hot reload:

```bash
cp .env.example .env.local
docker compose -f docker-compose.dev.yml up --build
```

## 4. Troubleshooting

### View Logs

```bash
docker compose logs -f app
```

### Database Issues

- Check if `./data` directory exists and is writable
- Verify `DATABASE_URL` points to the correct path

### Container Health

```bash
docker compose ps
docker compose exec app wget -q --spider http://localhost:3000/api/health
```
