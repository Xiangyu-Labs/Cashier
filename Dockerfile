FROM node:20-slim AS base

FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app

# Build-time args for client-side env vars
# MUST be declared BEFORE any COPY to properly receive values from docker-compose
ARG NEXT_PUBLIC_OIDC_ENABLED
ARG NEXT_PUBLIC_OIDC_BUTTON_NAME
ARG NEXT_PUBLIC_APP_URL

ENV NEXT_PUBLIC_OIDC_ENABLED=${NEXT_PUBLIC_OIDC_ENABLED}
ENV NEXT_PUBLIC_OIDC_BUTTON_NAME=${NEXT_PUBLIC_OIDC_BUTTON_NAME}
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy application files
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy migration files and drizzle config for runtime migrations
COPY --from=builder /app/src/lib/db ./src/lib/db
COPY --from=builder /app/src/lib/storage ./src/lib/storage
COPY --from=builder /app/src/lib/logger.ts ./src/lib/logger.ts
COPY --from=builder /app/src/features ./src/features
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules

# Copy scripts directory for migration scripts (R2 migration, etc.)
COPY --from=builder /app/scripts ./scripts

# Copy entrypoint script
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000
CMD ["./docker-entrypoint.sh"]
