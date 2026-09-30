# Recherche-Backend (API + Worker). Build aus dem Ordner citadel/:  docker build -f server/Dockerfile -t citadel-research .
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src/core ./src/core
COPY server ./server
ENV CITADEL_HOST=0.0.0.0 CITADEL_DB=/data/citadel.sqlite
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 8787
USER node
# "all" = API + Worker in einem Prozess; für getrennte Prozesse zwei Container mit "api" bzw. "worker" starten.
CMD ["npx", "tsx", "server/main.ts", "all"]
