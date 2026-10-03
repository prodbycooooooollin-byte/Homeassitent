# Impostor-Spielserver (inkl. Web-Client) als Container.
#   docker build -t impostor-server .
#   docker run -p 8787:8787 impostor-server
FROM node:22-alpine AS build
WORKDIR /app
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build:client && npm run build:server

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8787 \
    HOST=0.0.0.0
COPY --from=build /app/dist/server ./dist/server
COPY --from=build /app/dist/client ./dist/client
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8787/healthz || exit 1
CMD ["node", "dist/server/server.mjs"]
