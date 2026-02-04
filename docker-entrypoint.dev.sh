#!/bin/sh
set -e

echo "[DEV] Ensuring database is ready..."

# Use db:push for development - it handles schema sync automatically
# For production, use db:migrate with properly generated migration files
echo "[DEV] Syncing database schema..."
npm run db:push -- --accept-data-loss 2>/dev/null || npm run db:push

echo "[DEV] Starting development server..."
exec npm run dev
