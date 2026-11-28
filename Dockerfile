# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV HUSKY=0
# Compile native SQLite bindings if a prebuilt binary is not available.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev --omit=optional --ignore-scripts

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    HOME=/tmp \
    COMIC_DL_WEB_OUTPUT=/downloads \
    COMIC_DL_WEB_SHELF=/data/shelf.sqlite \
    COMIC_DL_WEB_SOURCE_STATE=/data/sources.json \
    COMIC_DL_WEB_EXTENSION_DIR=/data/extensions
LABEL org.opencontainers.image.title="comic-dl-web" \
    org.opencontainers.image.description="Self-hosted comic-dl Web UI" \
    org.opencontainers.image.source="https://github.com/yinyanfr/comic-dl-web"
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
# Node.js also loads server modules directly; build/ alone is not sufficient.
COPY --from=build /app/server.ts ./
COPY --from=build /app/app ./app
COPY --from=build /app/scripts/healthcheck.mjs ./scripts/healthcheck.mjs
RUN mkdir /data /downloads && chown node:node /data /downloads
USER node
EXPOSE 3000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD ["node", "scripts/healthcheck.mjs"]
CMD ["node", "server.ts"]
