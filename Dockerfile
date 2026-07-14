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
ENV DATABASE_URL=file:/tmp/cashier-build.sqlite
ENV LOCAL_STORAGE_PATH=/tmp/cashier-build-uploads
RUN npm run db:migrate
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy application files
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy source files needed by the runtime migration entrypoint.
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules

# Prepare the default database and local-storage volume for the non-root runtime user.
RUN mkdir -p /app/data/uploads && chown -R node:node /app/data

USER node

# Copy entrypoint script with executable permission
COPY --chmod=755 docker-entrypoint.sh ./

EXPOSE 3000
CMD ["./docker-entrypoint.sh"]
