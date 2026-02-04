#!/bin/sh
set -e

echo "[DEV] Ensuring database is ready..."

# Use db:migrate for consistency with production
echo "[DEV] Running database migrations..."
npm run db:migrate

echo "[DEV] Starting development server..."
exec npm run dev
