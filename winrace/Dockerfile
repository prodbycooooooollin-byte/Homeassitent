# syntax=docker/dockerfile:1

# WinRace – Produktions-Image für Docker/Railway/Render.
# Enthält den kombinierten Next.js + Socket.io Prozess (server.ts) und die
# Prisma-CLI, damit beim Start automatisch `prisma migrate deploy` laufen
# kann (siehe CMD unten bzw. `npm run start:deploy`).

FROM node:22-alpine AS base
WORKDIR /app
# Prisma braucht auf Alpine libssl/openssl, sonst schlägt der Query-Engine-
# Download bzw. -Start fehl.
RUN apk add --no-cache libc6-compat openssl

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Next.js braucht zur Build-Zeit dieselben NEXT_PUBLIC_*-Variablen wie zur
# Laufzeit, da sie in die Client-Bundles eingebacken werden. Railway/Render
# können Build-Args hierfür setzen; ohne Angabe wird ein Platzhalter
# verwendet und muss dann als Laufzeit-Variable stimmen (siehe README).
ARG NEXT_PUBLIC_SITE_URL=""
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs

EXPOSE 3000
# Railway/Render setzen $PORT selbst; server.ts liest es automatisch.
CMD ["npm", "run", "start:deploy"]
