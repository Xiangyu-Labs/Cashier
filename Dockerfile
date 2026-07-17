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
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
ENV R2_ACCOUNT_ID=build-placeholder
ENV R2_BUCKET_NAME=cashier-images
ENV R2_ACCESS_KEY_ID=build-placeholder
ENV R2_SECRET_ACCESS_KEY=build-placeholder
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy application files
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

USER node

# Copy entrypoint script with executable permission
COPY --chmod=755 docker-entrypoint.sh ./

EXPOSE 3000
CMD ["./docker-entrypoint.sh"]
