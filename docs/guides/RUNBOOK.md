# Runbook

Operational procedures for deploying, monitoring, and maintaining Cashier in production.

## Table of Contents

- [Deployment](#deployment)
- [Health Checks](#health-checks)
- [Common Issues](#common-issues)
- [Rollback Procedures](#rollback-procedures)

## Deployment

### Prerequisites

- Docker and Docker Compose installed
- Environment variables configured in `.env.production`
- SSL certificate (if not using reverse proxy with auto-SSL)

### Production Deployment

```bash
# 1. Configure environment
cp .env.example .env.production
# Edit .env.production with production values

# 2. Deploy
docker compose up -d --build
```

### Environment Variables

Configuration is organized into three tiers:

#### System Configuration (Required)

| Variable             | Required | Description                     | Example                     |
| -------------------- | -------- | ------------------------------- | --------------------------- |
| `DATABASE_URL`       | No       | SQLite file path                | `file:./data/sqlite.db`     |
| `OPENAI_API_KEY`     | Yes      | OpenAI API key                  | `sk-...`                    |
| `OPENAI_BASE_URL`    | No       | Custom API base URL             | `https://api.openai.com/v1` |
| `AUTH_SECRET`        | Yes      | Secret for signing tokens       | `openssl rand -base64 32`   |
| `AUTH_RESEND_KEY`    | Yes      | Resend API key for email OTP    | `re_...`                    |
| `AUTH_EMAIL_FROM`    | No       | Email sender address            | `noreply@example.com`       |
| `LOCAL_STORAGE_PATH` | No       | File storage path               | `./data/uploads`            |
| `TRUSTED_PROXY`      | No       | Trusted proxy for IP extraction | `10.0.0.0/8`                |

#### Runtime Configuration

| Variable                      | Default       | Description                   |
| ----------------------------- | ------------- | ----------------------------- |
| `AI_MODEL_TEXT`               | `gpt-4o-mini` | Text model for business logic |
| `AI_MODEL_VISION`             | `gpt-4o`      | Vision model for images       |
| `AI_MAX_RETRIES`              | `3`           | AI retry attempts             |
| `AI_RETRY_DELAY_MS`           | `1000`        | Retry delay in ms             |
| `OTP_EXPIRES_SECONDS`         | `300`         | OTP expiration time           |
| `OTP_LOCKOUT_MINUTES`         | `15`          | Account lockout duration      |
| `OTP_MAX_ATTEMPTS`            | `5`           | Max verification attempts     |
| `OTP_RESEND_COOLDOWN_SECONDS` | `60`          | Resend cooldown               |
| `AUTH_RATE_LIMIT_MAX`         | `10`          | Max OTP sends per window      |
| `AUTH_RATE_LIMIT_WINDOW`      | `900`         | Rate limit window (seconds)   |
| `DISABLE_REGISTRATION`        | `false`       | Disable new registrations     |
| `LOG_LEVEL`                   | `info`        | Logging verbosity             |
| `MAX_TASK_WORKER`             | `10`          | Max concurrent tasks          |

#### Frontend Configuration (Build-time)

| Variable                       | Required | Description     | Example                       |
| ------------------------------ | -------- | --------------- | ----------------------------- |
| `NEXT_PUBLIC_APP_URL`          | Yes      | Public app URL  | `https://cashier.example.com` |
| `NEXT_PUBLIC_OIDC_ENABLED`     | No       | Show SSO button | `false`                       |
| `NEXT_PUBLIC_OIDC_BUTTON_NAME` | No       | SSO button text | `SSO`                         |

See [ENV.md](./ENV.md) for complete documentation.

### Data Persistence

SQLite data is stored in `./data/sqlite.db` and mounted as a Docker volume.

**Backup**:

```bash
mkdir -p ./backups
cp ./data/sqlite.db ./backups/sqlite-$(date +%Y%m%d).db
```

### Automatic Migrations

The container runs database migrations automatically on startup via `docker-entrypoint.sh`.

- Set `SKIP_MIGRATIONS=true` to disable auto-migration.

### Update Process

```bash
git pull
docker compose up -d --build
```

## Health Checks

### Container Health

```bash
# Check container status
docker compose ps

# Health check endpoint
docker compose exec app wget -q --spider http://localhost:3000/api/health
```

### View Logs

```bash
# Follow logs
docker compose logs -f app

# Recent logs (last 100 lines)
docker compose logs --tail=100 app

# Logs since specific time
docker compose logs --since=10m app
```

### Database Health

```bash
# Check database file
docker compose exec app ls -la /app/data/

# Verify SQLite integrity
docker compose exec app sqlite3 /app/data/sqlite.db "PRAGMA integrity_check;"
```

## Common Issues

### Issue: Container Won't Start

**Symptoms**: Container exits immediately or shows error logs

**Diagnosis**:

```bash
docker compose logs --tail=50 app
```

**Common Causes**:

1. **Missing environment variables**: Check `AUTH_SECRET`, `OPENAI_API_KEY`
2. **Permission denied on data directory**: Ensure `./data` is writable
3. **Port already in use**: Check if port 3000 is available

**Resolution**:

```bash
# Fix permissions
chmod -R 755 ./data

# Restart container
docker compose restart app
```

### Issue: Database Errors

**Symptoms**: 500 errors on API calls, "database is locked"

**Diagnosis**:

```bash
# Check database file exists
ls -la ./data/sqlite.db

# Check integrity
docker compose exec app sqlite3 /app/data/sqlite.db "PRAGMA integrity_check;"
```

**Resolution**:

1. **Database locked**: Restart the container
2. **Corruption**: Restore from backup
3. **Disk full**: Check available space with `df -h`

### Issue: AI Parsing Fails

**Symptoms**: Receipt uploads fail, AI tasks stuck in queue

**Diagnosis**:

```bash
# Check OpenAI API key is valid
docker compose logs app | grep -i "openai\|api"

# Check task queue status
docker compose exec app sqlite3 /app/data/sqlite.db "SELECT status, COUNT(*) FROM tasks GROUP BY status;"
```

**Resolution**:

1. Verify `OPENAI_API_KEY` is valid and has credits
2. Check `OPENAI_BASE_URL` if using a proxy
3. Restart task processing: `docker compose restart app`

### Issue: Email Not Sending

**Symptoms**: Users don't receive OTP emails

**Diagnosis**:

```bash
# Check Resend configuration
docker compose logs app | grep -i "email\|resend\|otp"
```

**Resolution**:

1. Verify `AUTH_RESEND_KEY` is valid
2. Check `AUTH_EMAIL_FROM` domain is verified in Resend
3. Check spam folders

### Issue: High Memory Usage

**Symptoms**: Container using excessive memory

**Diagnosis**:

```bash
docker stats --no-stream
```

**Resolution**:

1. Adjust `MAX_TASK_WORKER` to limit concurrent tasks
2. Restart container to clear memory
3. Check for memory leaks in application logs

## Rollback Procedures

### Database Rollback

**Scenario**: Need to restore previous database state

```bash
# 1. Stop the application
docker compose down

# 2. Restore from backup
cp ./backups/sqlite-YYYYMMDD.db ./data/sqlite.db

# 3. Restart
docker compose up -d
```

### Application Rollback

**Scenario**: New version has issues

```bash
# 1. Revert to previous git commit
git log --oneline -10  # Find commit hash
git checkout <previous-commit-hash>

# 2. Rebuild and deploy
docker compose up -d --build

# 3. Later: Return to main when fixed
git checkout main
docker compose up -d --build
```

### Emergency Procedures

**Scenario**: Complete system failure

```bash
# 1. Preserve current state
cp ./data/sqlite.db ./backups/emergency-$(date +%Y%m%d-%H%M%S).db

# 2. Full restart
docker compose down
docker compose up -d --build

# 3. Verify health
docker compose ps
docker compose logs --tail=20 app
```

## Monitoring

### Key Metrics to Watch

| Metric           | Warning | Critical |
| ---------------- | ------- | -------- |
| Container uptime | < 99%   | < 95%    |
| Memory usage     | > 70%   | > 90%    |
| Disk space       | > 80%   | > 95%    |
| Response time    | > 500ms | > 2s     |
| Error rate       | > 1%    | > 5%     |

### Log Aggregation

For production deployments, consider shipping logs to:

- Datadog
- Splunk
- ELK Stack
- CloudWatch (AWS)

### Alerting Setup

Recommended alerts:

1. Container down
2. High error rate
3. Disk space low
4. Memory usage high
5. SSL certificate expiring

## Maintenance

### Scheduled Backups

Set up a cron job for daily backups:

```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * cd /path/to/cashier && cp ./data/sqlite.db ./backups/sqlite-$(date +\%Y\%m\%d).db && find ./backups -name "sqlite-*.db" -mtime +30 -delete
```

### Log Rotation

Docker Compose handles log rotation by default. To customize:

```yaml
# docker-compose.yml
services:
  app:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

### Security Updates

1. Monitor base image updates: `node:20-alpine`
2. Update dependencies monthly: `npm update`
3. Review security advisories: `npm audit`
4. Rotate secrets quarterly

## Support

For issues not covered in this runbook:

1. Check application logs: `docker compose logs -f app`
2. Review [CLAUDE.md](../CLAUDE.md) for architecture details
3. Check GitHub Issues for similar problems
4. Contact the development team
