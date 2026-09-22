# syntax=docker/dockerfile:1

# ---------- Build stage ----------
FROM node:24-alpine AS build
WORKDIR /app

RUN corepack enable pnpm

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store

COPY . .
RUN pnpm build

# ---------- Runtime stage ----------
FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4200
ENV NG_ALLOWED_HOSTS=hdrspotlight.com,www.hdrspotlight.com,localhost,127.0.0.1

COPY --from=build --chown=node:node /app/dist/hdr-spotlight ./dist/hdr-spotlight

USER node

EXPOSE 4200

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4200) + '/', { signal: AbortSignal.timeout(4000) }).then(response => { if (!response.ok) console.error('Healthcheck HTTP ' + response.status); process.exit(response.ok ? 0 : 1); }).catch(error => { console.error('Healthcheck failed:', error.message); process.exit(1); })"

CMD ["node", "dist/hdr-spotlight/server/server.mjs"]
