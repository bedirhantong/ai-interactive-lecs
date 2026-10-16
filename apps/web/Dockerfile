# syntax=docker/dockerfile:1
# AI Atölye web app (Next.js standalone server). Build from the repository root:
#   docker build -f apps/web/Dockerfile -t ai-atolye-web .
# NEXT_PUBLIC_* values are compiled into the client bundle, so they are build arguments.

FROM node:25-slim AS deps
WORKDIR /repo/apps/web
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:25-slim AS build
ARG NEXT_PUBLIC_COLAB_GITHUB_REPO="bedirhantong/ai-interactive-lecs"
ARG NEXT_PUBLIC_COLAB_GITHUB_BRANCH="main"
ARG NEXT_PUBLIC_PYODIDE_INDEX_URL="https://cdn.jsdelivr.net/pyodide/v314.0.7/full/"
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_COLAB_GITHUB_REPO=$NEXT_PUBLIC_COLAB_GITHUB_REPO \
    NEXT_PUBLIC_COLAB_GITHUB_BRANCH=$NEXT_PUBLIC_COLAB_GITHUB_BRANCH \
    NEXT_PUBLIC_PYODIDE_INDEX_URL=$NEXT_PUBLIC_PYODIDE_INDEX_URL
WORKDIR /repo
COPY --from=deps /repo/apps/web/node_modules apps/web/node_modules
COPY apps/web apps/web
COPY content content
RUN cd apps/web && npx next build

FROM node:25-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
# Standalone output: server + traced dependencies + /content (lessons), then static assets.
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "apps/web/server.js"]
