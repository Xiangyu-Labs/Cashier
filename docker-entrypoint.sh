#!/bin/sh
set -e

# Ensure the data directory exists for SQLite
if [ -n "$DATABASE_URL" ]; then
    # Extract directory path from file:./path/to/db or ./path/to/db
    DB_DIR=$(echo "$DATABASE_URL" | sed 's/file://' | sed 's/\/[^/]*$//')
    if [ "$DB_DIR" != "$DATABASE_URL" ] && [ "$DB_DIR" != "." ] && [ -n "$DB_DIR" ]; then
        echo "Ensuring database directory exists: $DB_DIR"
        mkdir -p "$DB_DIR"
    fi
fi

# Run migrations only if not skipped
if [ "$SKIP_MIGRATIONS" != "true" ]; then
    echo "Running database migrations..."
    # Attempt migrate, if it fails or we want to be more agile, push can be used
    npm run db:migrate || (echo "Migration failed, attempting schema push (data loss risk!)..." && npm run db:push)
else
    echo "Skipping database migrations..."
fi

echo "Starting application..."
exec node server.js

