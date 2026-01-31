#!/bin/sh
set -e

# Run migrations only if not skipped
if [ "$SKIP_MIGRATIONS" != "true" ]; then
    echo "Running database migrations..."
    npx drizzle-kit push --force
else
    echo "Skipping database migrations..."
fi

echo "Starting application..."
exec node server.js
