#!/bin/sh
set -e

echo "========================================"
echo "  Cashier Application Startup"
echo "========================================"
echo "Environment: ${NODE_ENV:-production}"
echo "Database: $(echo "${DATABASE_URL:-missing}" | sed 's|://[^:]*:.*@|://***:***@|')"
echo "Storage: ${LOCAL_STORAGE_PATH:-./data/uploads}"
echo "========================================"

case "${DATABASE_URL:-}" in
    postgres://*|postgresql://*) ;;
    *) echo "[ERROR] DATABASE_URL must be a PostgreSQL connection URL"; exit 1 ;;
esac

# Ensure upload directory exists
UPLOAD_DIR="${LOCAL_STORAGE_PATH:-./data/uploads}"
echo "[INIT] Ensuring upload directory exists: $UPLOAD_DIR"
mkdir -p "$UPLOAD_DIR"

echo "[INIT] Starting application..."
exec node server.js
