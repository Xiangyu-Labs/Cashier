#!/bin/sh
set -e

echo "========================================"
echo "  Cashier Application Startup"
echo "========================================"
echo "Environment: ${NODE_ENV:-production}"
echo "Database: ${DATABASE_URL:-file:./data/sqlite.db}"
echo "Skip Migrations: ${SKIP_MIGRATIONS:-false}"
echo "========================================"

# Ensure the data directory exists for SQLite
if [ -n "$DATABASE_URL" ]; then
    # Extract directory path from file:./path/to/db or ./path/to/db
    DB_DIR=$(echo "$DATABASE_URL" | sed 's/file://' | sed 's/\/[^/]*$//')
    if [ "$DB_DIR" != "$DATABASE_URL" ] && [ "$DB_DIR" != "." ] && [ -n "$DB_DIR" ]; then
        echo "[INIT] Ensuring database directory exists: $DB_DIR"
        mkdir -p "$DB_DIR"
    fi
fi

# Run migrations only if not skipped
if [ "$SKIP_MIGRATIONS" != "true" ]; then
    echo "[INIT] Running database migrations..."
    if npm run db:migrate; then
        echo "[INIT] Migrations completed successfully"
    else
        echo "[WARN] Migration failed, attempting schema push..."
        if npm run db:push; then
            echo "[INIT] Schema push completed successfully"
        else
            echo "[ERROR] Both migration and schema push failed!"
            exit 1
        fi
    fi
else
    echo "[INIT] Skipping database migrations (SKIP_MIGRATIONS=true)"
fi

echo "[INIT] Starting application..."
exec node server.js
