# Base44 Dev Environment

## Project: Smart-Home-Center

Next.js 14 (App Router) + TypeScript + Tailwind CSS smart-home dashboard.

## Running

```bash
docker compose -f docker-compose.base44.yml up -d
```

The app runs in **demo mode** by default (mock data from `lib/mock-data.ts`) — no Home Assistant instance or credentials required.

## Key facts

- Web entry point: port 3000 (`next dev`)
- `next.config.mjs` uses `allowedDevOrigins` with `BASE44_PUBLIC_HOST_SUFFIX` so the preview origin can reach dev assets/HMR.
- Sub-projects `lumahome/` and `lol-build-assistant/` are separate npm projects — not part of the root build.
- Optional real Home Assistant connection: set `HA_URL` and `HA_TOKEN` (see `.env.local.example`), then disable demo mode in the app's settings.
