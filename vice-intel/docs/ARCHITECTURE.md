# Architecture

## Stack

Next.js 14 (App Router, React Server Components) · TypeScript (strict) · Tailwind CSS with CSS-variable design tokens ·
zod · Anthropic TypeScript SDK · Vitest · lucide icons · self-hosted variable fonts (Inter, Sora).

Most UI is server-rendered. Client JS is limited to interactive islands (search field, command palette, answer
streaming, scan, map, filters, bookmarks). Detail pages are statically pre-rendered (`generateStaticParams`).

## Layout

```
app/                     routes (pages + API)
  api/search             GET  typo-tolerant search → typed result cards
  api/ask                POST NDJSON stream: meta → delta* → done | error
  api/scan               POST multipart image → recognition result (or mode "unavailable")
  art/[scene]/[seed]     original procedural SVG illustrations (immutable cache)
components/              ui primitives, layout, detail parts, module islands
content/                 knowledge base: sources.ts, official.ts, demo.ts
lib/content              zod schema + repository (validation, relations, backlinks, integrity report)
lib/search               normaliser/stemmer/edit distance, intent detection, BM25-style engine
lib/ai                   retrieval (RAG), deterministic composer, Claude integration (server-only)
lib/server               rate limiter, TTL/LRU cache, upload validation
lib/map                  schematic map geometry + pin builder
lib/art                  illustration generator
lib/client               device-local store (bookmarks, recents, prefs)
```

## Data flow: a question

1. `/api/ask` validates the body (zod) and runs retrieval: search hits, the focused record (e.g. the mission and
   objective the player is viewing), and relations if results are thin.
2. If AI is configured, records matched, and the IP is under its rate limit, Claude receives **only** the serialised
   records with their ids and statuses. The frozen system prompt (cached) requires citations, labels for
   demo/theory/estimate, spoiler respect, and "no information" when the records don't cover the question.
   Server-side refusal fallbacks are enabled.
3. Otherwise, or on error, `composeAnswer` builds an intent-shaped answer from the record fields alone.
4. AI answers are cached for 1 h, keyed by normalised query and context.

## Data flow: a scan

The client downscales the image to 1600 px JPEG (which also converts HEIC where the browser can decode it). The server
checks size and magic bytes. Claude returns schema-validated JSON (structured outputs) listing detections with
confidence and an optional catalogue id. Ids not in the knowledge base are dropped, and confidence is clamped. Without
a key, the route returns `mode: "unavailable"` and the UI offers a manual search instead.

## Trust model

- `verification.status` ∈ verified · official · estimate · theory · unverified · demo · unknown, set on records *and*
  on individual values (payouts, durations, rewards).
- Generated illustrations can never be flagged `authenticGameplay` (schema refinement).
- Demo records are `noindex`, excluded from the sitemap, and badged in every surface (cards, hero, answers, map,
  saved).

## Scaling seams

| Today | Swap for |
| --- | --- |
| Typed content files | Postgres / headless CMS behind `lib/content/repository.ts` |
| In-memory search index | Postgres FTS + pgvector behind `lib/search/engine.ts` |
| In-memory rate limiter | Redis/Upstash via `RateLimitStore` |
| In-memory answer cache | Redis / KV |
| SVG illustrations | Licensed images through `media.src` + `srcSet` (rendered with `next/image`, AVIF/WebP) |

## i18n

All copy is in components today (English). Content records are locale-agnostic in structure. The next step is to add a
`locale` field to records and move UI strings into a dictionary. Routes don't depend on language.

## Security

API keys are only read server-side (`server-only` module). Inputs are validated with zod. Uploads are byte-sniffed and
never persisted. Answers are rendered by a minimal formatter that never injects HTML. Security headers are set in
`next.config.mjs`. Illustration SVGs are served with a restrictive CSP.
