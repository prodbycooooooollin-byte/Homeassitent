# VICE INTEL

**Find anything. Understand everything. Get back to playing.**

VICE INTEL is an unofficial, AI-assisted companion web app for Grand Theft Auto VI, built for second-screen use: a player
hits a problem in the game, opens VICE INTEL on their phone, searches or scans a screenshot, and gets a usable answer in
seconds. Every fact shows how far it can be trusted.

> Unofficial fan project. Not affiliated with, endorsed or sponsored by Rockstar Games or Take-Two Interactive.
> All images are original illustrations, not game screenshots.

## Status of the content in this build

| Content | Status | Meaning |
| --- | --- | --- |
| 6 regions of Leonida, 2 protagonists | `official` | Restates Rockstar's official pre-release material only |
| Missions, unlocks, Easter eggs, money activities | `demo` | **Fictional sample records** that demonstrate the product. Labelled in the UI, excluded from search engines |

No real in-game facts were invented. To ship real intel, editors replace demo records with sourced, verified ones (see
[`docs/CONTENT.md`](docs/CONTENT.md)). No code changes are needed for that.

## Features

- **Universal search + Intel answers**: typo-tolerant, intent-aware search (location / unlock / mission / money /
  secret). Answers stream from Claude and are grounded **only** in retrieved records, with citations. Without an API key
  or when the AI fails, the answer is assembled directly from the records and labelled as such.
- **Intel Scan**: take a photo of the TV or upload/paste a screenshot. The image is downscaled on the device, validated
  by its bytes on the server, analysed in memory and never stored. Results come with confidence levels. The model's
  catalogue ids are re-checked against the knowledge base, and recognition is never simulated.
- **Mission Solver**: pick the objective you're stuck on. You get its steps, the usual failure point, an alternative,
  and a focused AI helper scoped to that objective. Spoilers are blurred by default.
- **Unlock database**: a one-line "how to unlock" answer first, then requirements, the unlock path (prerequisite
  chain), details and location.
- **Easter Egg Hunter**: a gallery and map view. Theories and community claims are kept apart from facts.
- **Money Intel**: filter by game stage, difficulty, budget and repeatability, then sort by estimated $/hour, payout,
  time or startup cost.
- **Intel Map**: a pan/zoom/pinch schematic map with layers, search and preview cards. It is an illustration, not the
  in-game map.
- **Other features**: ⌘K / `/` command palette, recently viewed, device-local bookmarks, spoiler preference, share links,
  a content desk with an integrity report, skeleton states, and reduced-motion support.

## Getting started

```bash
cd vice-intel
npm install
cp .env.example .env.local   # optional: add ANTHROPIC_API_KEY to enable AI answers + Intel Scan
npm run dev                   # http://localhost:3000
```

| Script | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js dev server / production build / production server |
| `npm test` | Vitest: content integrity, search, rate limiting, upload validation, API routes (model mocked) |
| `npm run lint` · `npm run typecheck` | ESLint · TypeScript |
| `npm run content:check` | Validates every record (schema, references, sources); exits 1 on errors |

CI (`.github/workflows/ci-vice-intel.yml`) runs all of these on changes to `vice-intel/`.

## Environment

| Variable | Default | |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | – | Enables AI answers and Intel Scan. Server-side only |
| `VICE_INTEL_MODEL` | `claude-opus-5-5` | Model for answers and recognition |
| `VICE_INTEL_ASK_LIMIT_PER_MIN` | `12` | AI answers per IP per minute (above it: knowledge-base answers) |
| `VICE_INTEL_SCAN_LIMIT_PER_MIN` | `4` | Scans per IP per minute |
| `VICE_INTEL_MAX_UPLOAD_MB` | `8` | Upload limit |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | Canonical URLs, sitemap |

More detail is in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/CONTENT.md`](docs/CONTENT.md).
