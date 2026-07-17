#!/bin/sh
set -e

for name in R2_ACCOUNT_ID R2_BUCKET_NAME R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY; do
    case "$name" in
        R2_ACCOUNT_ID) value=${R2_ACCOUNT_ID:-} ;;
        R2_BUCKET_NAME) value=${R2_BUCKET_NAME:-} ;;
        R2_ACCESS_KEY_ID) value=${R2_ACCESS_KEY_ID:-} ;;
        R2_SECRET_ACCESS_KEY) value=${R2_SECRET_ACCESS_KEY:-} ;;
    esac
    if [ -z "$value" ]; then
        echo "[ERROR] $name is required"
        exit 1
    fi
done

echo "========================================"
echo "  Cashier Application Startup"
echo "========================================"
echo "Environment: ${NODE_ENV:-production}"
echo "Database: $(echo "${DATABASE_URL:-missing}" | sed 's|://[^:]*:.*@|://***:***@|')"
echo "Storage: R2 (configured)"
echo "========================================"

case "${DATABASE_URL:-}" in
    postgres://*|postgresql://*) ;;
    *) echo "[ERROR] DATABASE_URL must be a PostgreSQL connection URL"; exit 1 ;;
esac

echo "[INIT] Starting application..."
exec node server.js
