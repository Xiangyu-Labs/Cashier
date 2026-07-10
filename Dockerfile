FROM node:20-slim AS base

FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app

# Build-time args for client-side env vars
# MUST be declared BEFORE any COPY to properly receive values from docker-compose
ARG NEXT_PUBLIC_APP_URL

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

# Copy source files needed for runtime scripts (migrations, R2 migration, etc.)
COPY --from=builder /app/src ./src
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules


# Create uploads directory
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads

USER node

# Copy entrypoint script with executable permission
COPY --chmod=755 docker-entrypoint.sh ./

EXPOSE 3000
CMD ["./docker-entrypoint.sh"]
