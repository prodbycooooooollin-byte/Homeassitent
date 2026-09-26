# Baut den LIKED-Spielserver als kleines Node-Image. Kontext: Verzeichnis liked/
FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps/server ./apps/server
# Nur die Workspaces installieren, die der Server braucht.
RUN npm ci --workspace @liked/server --include-workspace-root=false --ignore-scripts \
 && npm run build -w @liked/server

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=8787
COPY --from=build /src/apps/server/dist ./dist
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8787/healthz || exit 1
CMD ["node", "dist/index.js"]
