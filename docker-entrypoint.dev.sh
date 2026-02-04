#!/bin/sh
set -e

echo "[DEV] Ensuring database is ready..."

# Run schema push (idempotent)
npm run db:push 2>/dev/null || echo "[DEV] Schema already up to date"

echo "[DEV] Starting development server..."
exec npm run dev
