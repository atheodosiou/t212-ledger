# syntax=docker/dockerfile:1
#
# t212 ledger. Stages:
#   build    – every workspace's dependencies; builds @t212/shared, the API and the web app
#   web      – the web app's static files only (the deploy script copies them out; nothing runs)
#   api-deps – the API's production dependencies only
#   api      – the API (default target): dist/, migrations and production node_modules, non-root
#
# No secrets at build time: .env files never enter the build context (.dockerignore).

ARG NODE_IMAGE=node:26-bookworm-slim

FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY libs/shared/package.json libs/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund
COPY libs ./libs
COPY apps ./apps
RUN npm run build:shared \
  && npm run build -w api \
  && npm run build -w web

FROM busybox:1.37 AS web
COPY --from=build /app/apps/web/dist/web/browser /site

FROM ${NODE_IMAGE} AS api-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY libs/shared/package.json libs/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --workspace=apps/api --no-audit --no-fund && npm cache clean --force

FROM ${NODE_IMAGE} AS api
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    LOG_FORMAT=json
WORKDIR /app
COPY --from=api-deps /app ./
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/drizzle ./apps/api/drizzle
# The server's checkout is updated under umask 077, so make what `node` reads world-readable.
RUN chmod -R a+rX /app/apps /app/package.json
WORKDIR /app/apps/api
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((r) => r.json()).then((b) => process.exit(b.status === 'ok' ? 0 : 1), () => process.exit(1))"]
# Exec form: node receives SIGTERM and Nest shuts down gracefully (enableShutdownHooks).
CMD ["node", "dist/main.js"]
