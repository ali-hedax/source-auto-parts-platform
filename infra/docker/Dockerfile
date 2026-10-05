# syntax=docker/dockerfile:1.7
#
# HEDAX images built from the pnpm monorepo — one Dockerfile, three targets:
#   api     NestJS REST + WebSocket API          (port 4000)
#   worker  outbox/BullMQ jobs + quote PDFs       (no port; Chromium for PDFs)
#   web     Next.js storefront and admin panel    (port 3000, standalone server)
#   tools   full toolchain for one-off tasks (migrations, owner bootstrap, seeds)
#   backup  scheduled pg_dump + uploaded files, encrypted with age (opt-in profile)
#
# STATUS: built and run with Docker Desktop on 2026-10-04 (local test stack;
# see docs/TEST_REPORT.md). Verify with `docker compose -f infra/docker-compose.yml build`.
# See docs/DEPLOYMENT.md.

ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true \
    NEXT_TELEMETRY_DISABLED=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN corepack enable && corepack prepare pnpm@10.34.6 --activate
WORKDIR /repo

# ---------------------------------------------------------------------------
# All dependencies (cached on the lockfile and package manifests only)
# ---------------------------------------------------------------------------
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/domain/package.json packages/domain/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# Build everything (Prisma client generated first; web as standalone output)
# ---------------------------------------------------------------------------
FROM deps AS build
COPY . .
# Values baked into the web bundle / rewrites at build time.
ARG API_INTERNAL_URL=http://api:4000/api/v1
ARG NEXT_PUBLIC_WS_URL=same-origin
ARG PUBLIC_BASE_URL=https://example.invalid
ENV API_INTERNAL_URL=$API_INTERNAL_URL \
    NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL \
    PUBLIC_BASE_URL=$PUBLIC_BASE_URL \
    HEDAX_DATA_SOURCE=api \
    NEXT_OUTPUT=standalone
RUN pnpm --filter @hedax/api run prisma:generate \
 && pnpm build

# One-off tasks (migrate deploy, bootstrap owner, base seed) need the Prisma CLI.
FROM build AS tools
WORKDIR /repo/apps/api
CMD ["node", "node_modules/prisma/build/index.js", "migrate", "deploy"]

# ---------------------------------------------------------------------------
# Production dependencies only
# ---------------------------------------------------------------------------
FROM base AS prod-deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/domain/package.json packages/domain/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile --prod

# Shared runtime layout for api and worker (same paths as in the repo, so pnpm's links resolve).
FROM ${NODE_IMAGE} AS node-runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=prod-deps /repo/packages/contracts/node_modules ./packages/contracts/node_modules
# packages/domain has no runtime dependencies, so pnpm creates no node_modules folder for it.
COPY --from=prod-deps /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /repo/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build /repo/packages/contracts/dist ./packages/contracts/dist
COPY --from=build /repo/packages/domain/package.json ./packages/domain/package.json
COPY --from=build /repo/packages/domain/dist ./packages/domain/dist
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
COPY --from=build /repo/apps/api/dist ./apps/api/dist

# ---------------------------------------------------------------------------
# api
# ---------------------------------------------------------------------------
FROM node-runtime AS api
RUN mkdir -p /data/storage && chown -R node:node /data
USER node
WORKDIR /repo/apps/api
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:4000/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]

# ---------------------------------------------------------------------------
# worker (headless Chromium renders the Persian/English quote PDFs)
# ---------------------------------------------------------------------------
FROM node-runtime AS worker
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-noto-core \
 && rm -rf /var/lib/apt/lists/*
COPY --from=prod-deps /repo/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=build /repo/apps/worker/package.json ./apps/worker/package.json
COPY --from=build /repo/apps/worker/dist ./apps/worker/dist
ENV PDF_BROWSER_EXECUTABLE=/usr/bin/chromium
RUN mkdir -p /data/storage && chown -R node:node /data
USER node
WORKDIR /repo/apps/worker
CMD ["node", "dist/main.js"]

# ---------------------------------------------------------------------------
# web (Next.js standalone server)
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/fa').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]

# ---------------------------------------------------------------------------
# backup: the same PostgreSQL major as the database service, so pg_dump always
# matches the server; age encrypts with the owner's public key. Runs as uid 1000,
# the owner of the uploaded files (api/worker run as node, uid 1000).
# ---------------------------------------------------------------------------
FROM postgres:18-bookworm AS backup
RUN apt-get update \
 && apt-get install -y --no-install-recommends age \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --gid 1000 hedaxbackup \
 && useradd --uid 1000 --gid 1000 --no-create-home --shell /usr/sbin/nologin hedaxbackup \
 && mkdir -p /backups \
 && chown hedaxbackup:hedaxbackup /backups
COPY --chmod=0755 infra/backup/hedax-backup.sh /usr/local/bin/hedax-backup
USER hedaxbackup
ENTRYPOINT ["hedax-backup"]
CMD ["schedule"]
