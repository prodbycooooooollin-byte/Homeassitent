# Base44 Dev Environment

## Project Structure

This repo contains three independent projects:
- **Root** — Smart-Home-Center: Next.js 14 app (the main app served on port 3000)
- `lumahome/` — standalone Vite + React + Three.js app with its own server (separate npm project)
- `lol-build-assistant/` — Electron desktop app (separate npm project)

## Running the App

```bash
docker compose -f docker-compose.base44.yml up -d
```

The Next.js dev server starts on port 3000 with live reload. It runs in demo mode by default (no Home Assistant connection needed).

## Key Build Fix

The root `tsconfig.json` must exclude `lumahome/` and `lol-build-assistant/` from compilation. These are standalone subprojects with their own dependencies (three, @playwright/test, etc.) not installed at the root level. Without the exclusion, `next build` fails trying to type-check lumahome files.

## Health Check

- Dev server: `curl http://localhost:3000` → 200
- Build: `npx next build` inside the container

## Notes

- Next.js `allowedDevOrigins` is configured in `next.config.mjs` using `BASE44_PUBLIC_HOST_SUFFIX` for the preview proxy.
- The app works in demo mode without any external services or secrets.
