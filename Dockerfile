# syntax=docker/dockerfile:1

# -----------------------------------------------------------------------------
# Stage 1 — build
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src

RUN npm run build

# -----------------------------------------------------------------------------
# Stage 2 — production runtime
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

RUN addgroup -S novex && adduser -S novex -G novex

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder --chown=novex:novex /app/dist ./dist

USER novex

EXPOSE 8080

# CMD explicito; Cloud Run inyecta PORT=8080 y el workflow limpia overrides.
CMD ["node", "dist/main.js"]
