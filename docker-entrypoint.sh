#!/bin/sh
set -e

echo "========================================"
echo "  Cashier Application Startup"
echo "========================================"
echo "Environment: ${NODE_ENV:-production}"
echo "Database: ${DATABASE_URL:-file:./data/sqlite.db}"
echo "Storage: ${LOCAL_STORAGE_PATH:-./data/uploads}"
echo "========================================"

# Ensure the data directory exists for SQLite
if [ -n "$DATABASE_URL" ]; then
    # Extract directory path from file:./path/to/db or ./path/to/db
    # Remove 'file:' prefix first, then extract directory
    DB_PATH=$(echo "$DATABASE_URL" | sed 's|file:||')
    DB_DIR=$(echo "$DB_PATH" | sed 's|/[^/]*$||')
    if [ "$DB_DIR" != "$DB_PATH" ] && [ "$DB_DIR" != "." ] && [ -n "$DB_DIR" ]; then
        echo "[INIT] Ensuring database directory exists: $DB_DIR"
        mkdir -p "$DB_DIR"
    fi
fi

# Ensure upload directory exists
UPLOAD_DIR="${LOCAL_STORAGE_PATH:-./data/uploads}"
echo "[INIT] Ensuring upload directory exists: $UPLOAD_DIR"
mkdir -p "$UPLOAD_DIR"

# Run migrations only if not skipped
if [ "$SKIP_MIGRATIONS" != "true" ]; then
    echo "[INIT] Running database migrations..."
    if npm run db:migrate; then
        echo "[INIT] Migrations completed successfully"
    else
        echo "[ERROR] Migration failed!"
        echo "[HINT] If this is a fresh database, ensure migration files are generated with 'npm run db:generate'"
        exit 1
    fi
else
    echo "[INIT] Skipping database migrations (SKIP_MIGRATIONS=true)"
fi

echo "[INIT] Starting application..."
exec node server.js
